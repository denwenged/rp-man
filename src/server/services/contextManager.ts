import { db } from '../db';
import { Character, ChatMessage, Lorebook, LoreEntry, ServerSettings, CharacterExpression, UserRelationship, CharacterMemory } from '../../shared/types';
import { logger } from './loggerService';

export interface FormattedPromptPayload {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  estimatedTokens: number;
  injectedLore: string[];
  summaryIncluded: boolean;
  activeRelationship?: UserRelationship | null;
  knownRelationships?: UserRelationship[];
  recalledMemories?: CharacterMemory[];
  recencyAnchor?: string;
}

export class ContextManager {
  /**
   * Fast token estimator (~3.8 chars per token for English RP text)
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    const wordCount = text.trim().split(/\s+/).length;
    const charEstimate = Math.ceil(text.length / 3.8);
    return Math.max(wordCount, charEstimate);
  }

  /**
   * Replace macros like {{char}}, {{user}}, {{scenario}} in prompt strings
   */
  public static replaceMacros(
    template: string,
    charName: string,
    userName: string,
    scenario: string = ''
  ): string {
    if (!template) return '';
    const now = new Date();
    return template
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/<BOT>/gi, charName)
      .replace(/\{\{user\}\}/gi, userName)
      .replace(/<USER>/gi, userName)
      .replace(/\{\{scenario\}\}/gi, scenario)
      .replace(/\{\{time\}\}/gi, now.toLocaleTimeString())
      .replace(/\{\{date\}\}/gi, now.toLocaleDateString());
  }

  /**
   * Retrieve preferred nickname for a user identifier
   */
  public static getUserPreferredName(userIdentifier: string, fallbackName: string): string {
    if (!userIdentifier) return fallbackName || 'User';
    try {
      const row = db.prepare('SELECT preferred_name FROM user_personas WHERE user_identifier = ?').get(userIdentifier) as any;
      if (row && row.preferred_name && row.preferred_name.trim()) {
        return row.preferred_name.trim();
      }
    } catch (e) {}
    return fallbackName || 'User';
  }

  /**
   * Normalize text for fuzzy keyword and trigger matching
   */
  private static normalizeForMatching(text: string): string {
    return ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')} `;
  }

  /**
   * Check if a list of keys triggers in the text
   */
  private static matchKeysInText(rawKeys: string[], normalizedText: string): boolean {
    // Flatten keys in case user entered comma-separated words in a single key string
    const flatKeys: string[] = [];
    for (const k of rawKeys) {
      if (typeof k === 'string') {
        k.split(',').forEach(sub => {
          const clean = sub.trim().toLowerCase();
          if (clean) flatKeys.push(clean);
        });
      }
    }

    return flatKeys.some(key => {
      if (key.length <= 2) {
        // Strict word boundary for very short keys
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        return regex.test(normalizedText);
      }
      return normalizedText.includes(key);
    });
  }

  /**
   * Scan text for matching lorebook entries
   * Falls back to all active lorebooks if none specifically bound to character
   */
  public static findMatchingLore(
    character: Character,
    recentText: string
  ): { entries: LoreEntry[]; matchedKeys: string[] } {
    let lorebookIds = character.context_config?.lorebook_ids || [];
    
    // If character has no explicit lorebooks selected, fetch all active lorebooks in database
    if (lorebookIds.length === 0) {
      try {
        const allBooks = db.prepare('SELECT id FROM lorebooks').all() as Array<{ id: string }>;
        lorebookIds = allBooks.map(b => b.id);
      } catch (e) {
        lorebookIds = [];
      }
    }

    if (lorebookIds.length === 0) {
      return { entries: [], matchedKeys: [] };
    }

    const matchedEntries: LoreEntry[] = [];
    const matchedKeys: string[] = [];
    const combinedScanText = `${recentText}\n${character.scenario || ''}\n${character.system_prompt || ''}`;
    const normalizedText = this.normalizeForMatching(combinedScanText);

    for (const bookId of lorebookIds) {
      try {
        const rows = db.prepare('SELECT * FROM lore_entries WHERE lorebook_id = ? AND enabled = 1 ORDER BY priority DESC, order_index ASC').all(bookId) as any[];
        
        for (const row of rows) {
          const rawKeys: string[] = JSON.parse(row.keys || '[]');
          const rawSecondaryKeys: string[] = JSON.parse(row.secondary_keys || '[]');
          const constant = Boolean(row.constant);
          const selective = Boolean(row.selective);

          let isMatch = constant;

          if (!isMatch && rawKeys.length > 0) {
            const hasPrimaryKey = this.matchKeysInText(rawKeys, normalizedText);

            if (hasPrimaryKey) {
              if (selective && rawSecondaryKeys.length > 0) {
                const hasSecondaryKey = this.matchKeysInText(rawSecondaryKeys, normalizedText);
                isMatch = hasSecondaryKey;
              } else {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            // Avoid duplicates
            if (!matchedEntries.some(e => e.id === row.id)) {
              matchedEntries.push({
                id: row.id,
                lorebook_id: row.lorebook_id,
                keys: rawKeys,
                secondary_keys: rawSecondaryKeys,
                content: row.content,
                comment: row.comment,
                enabled: Boolean(row.enabled),
                constant,
                selective,
                priority: row.priority,
                order: row.order_index
              });
              matchedKeys.push(...rawKeys);
            }
          }
        }
      } catch (e) {
        logger.error('SYSTEM', `Failed to load lorebook ${bookId}`, e);
      }
    }

    return { entries: matchedEntries, matchedKeys };
  }

  /**
   * Retrieve character relationships:
   * 1. Active interlocutor relationship (with currently speaking user)
   * 2. Known relationships / social circle (so the bot knows other people when asked)
   */
  public static getCharacterRelationships(
    characterId: string,
    userIdentifier: string,
    resolvedUserName: string
  ): { active: UserRelationship | null; known: UserRelationship[] } {
    try {
      const rows = db.prepare('SELECT * FROM user_relationships WHERE character_id = ?').all(characterId) as any[];
      if (!rows || rows.length === 0) {
        return { active: null, known: [] };
      }

      const allRels: UserRelationship[] = rows.map(r => ({
        id: r.id,
        character_id: r.character_id,
        user_identifier: r.user_identifier,
        relationship_type: r.relationship_type,
        relationship_notes: r.relationship_notes,
        affinity_level: r.affinity_level,
        created_at: r.created_at,
        updated_at: r.updated_at
      }));

      // Find active relationship
      const active = allRels.find(r => 
        (userIdentifier && (r.user_identifier === userIdentifier || r.user_identifier.toLowerCase() === userIdentifier.toLowerCase())) ||
        (resolvedUserName && r.user_identifier.toLowerCase() === resolvedUserName.toLowerCase())
      ) || null;

      // Other known relationships in character's social circle
      const known = allRels.filter(r => r.id !== active?.id);

      return { active, known };
    } catch (e) {
      logger.error('SYSTEM', 'Failed to retrieve character relationships', e);
      return { active: null, known: [] };
    }
  }

  /**
   * Smart Memory Retrieval (Character Mind):
   * 1. Direct memories about the active interlocutor
   * 2. Global / Shared memories for this character
   * 3. Smart-recalled memories across ALL chatters triggered by mentioned names or keywords in conversation
   */
  public static getSmartCharacterMemories(
    characterId: string,
    userIdentifier: string,
    resolvedUserName: string,
    recentConversationText: string
  ): CharacterMemory[] {
    try {
      const allRows = db.prepare(`
        SELECT * FROM character_memories 
        WHERE character_id = ?
        ORDER BY updated_at DESC
      `).all(characterId) as any[];

      if (!allRows || allRows.length === 0) return [];

      const normalizedChat = this.normalizeForMatching(recentConversationText);
      const matchedMap = new Map<string, CharacterMemory>();

      for (const r of allRows) {
        const mem: CharacterMemory = {
          id: r.id,
          character_id: r.character_id,
          user_identifier: r.user_identifier,
          user_display_name: r.user_display_name,
          memory_text: r.memory_text,
          category: r.category || 'fact',
          created_at: r.created_at,
          updated_at: r.updated_at
        };

        const memUser = (r.user_identifier || '').toLowerCase();
        const memName = (r.user_display_name || '').toLowerCase();
        const activeId = (userIdentifier || '').toLowerCase();
        const activeName = (resolvedUserName || '').toLowerCase();

        // 1. Direct match with current active speaker
        const isSpeakerMemory = 
          (activeId && memUser === activeId) ||
          (activeName && (memName === activeName || memUser === activeName));

        // 2. Global / Shared memory
        const isGlobal = memUser === 'global' || memUser === 'all' || memUser === 'shared' || !memUser;

        // 3. Smart Mention / Keyword Recall
        let isSmartTriggered = false;
        if (!isSpeakerMemory && !isGlobal) {
          // Check if memory subject's name is mentioned in chat
          if (memName && memName.length >= 2 && normalizedChat.includes(` ${memName} `)) {
            isSmartTriggered = true;
          }

          // Check if key distinctive nouns/words from the memory (length >= 4) match the conversation
          if (!isSmartTriggered && r.memory_text) {
            const words = r.memory_text
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter((w: string) => w.length >= 4 && !['that', 'with', 'from', 'this', 'have', 'were', 'they', 'your', 'been', 'some'].includes(w));

            const matchCount = words.filter((w: string) => normalizedChat.includes(w)).length;
            if (matchCount >= 2 || (words.length > 0 && matchCount >= 1 && words.some((w: string) => w.length >= 6 && normalizedChat.includes(w)))) {
              isSmartTriggered = true;
            }
          }
        }

        if (isSpeakerMemory || isGlobal || isSmartTriggered) {
          matchedMap.set(mem.id, mem);
        }
      }

      return Array.from(matchedMap.values()).slice(0, 15);
    } catch (e) {
      logger.error('SYSTEM', 'Failed to retrieve smart character memories', e);
      return [];
    }
  }

  /**
   * Parse emotional expression from generated text
   */
  public static parseExpression(
    text: string,
    character: Character
  ): { cleanText: string; expression?: string; expressionEmoji?: string; expressionAvatar?: string } {
    const expressions: CharacterExpression[] = character.expressions || [];
    if (expressions.length === 0) {
      return { cleanText: text };
    }

    let matchedExp: CharacterExpression | undefined;
    let cleanText = text;

    // Check [emotion: name] or [expression: name] tag
    const tagMatch = text.match(/\[(?:emotion|expression|mood):\s*([a-zA-Z0-9_\-]+)\]/i);
    if (tagMatch) {
      const expName = tagMatch[1].toLowerCase();
      matchedExp = expressions.find(e => e.name.toLowerCase() === expName);
      cleanText = text.replace(tagMatch[0], '').trim();
    }

    // Check emojis in text
    if (!matchedExp) {
      for (const exp of expressions) {
        if (exp.emoji && text.includes(exp.emoji)) {
          matchedExp = exp;
          break;
        }
      }
    }

    // Check keyword triggers in actions e.g. *smiles happily*, *glares angrily*
    if (!matchedExp) {
      const lower = text.toLowerCase();
      for (const exp of expressions) {
        if (exp.name && lower.includes(exp.name.toLowerCase())) {
          matchedExp = exp;
          break;
        }
      }
    }

    if (matchedExp) {
      return {
        cleanText,
        expression: matchedExp.name,
        expressionEmoji: matchedExp.emoji,
        expressionAvatar: matchedExp.avatar_url || character.avatar_url
      };
    }

    return { cleanText };
  }

  /**
   * Build complete context ready for LLM invocation
   */
  public static buildContext(
    character: Character,
    userPersonaName: string,
    history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    rollingSummary: string = '',
    serverHardCap?: number,
    discordUserId?: string
  ): FormattedPromptPayload {
    const charName = character.name || 'Character';
    // Resolve preferred nickname if available
    const resolvedUserName = this.getUserPreferredName(discordUserId || '', userPersonaName || 'User');

    // 1. Lorebook Matching (scans recent 8 messages + scenario + prompt)
    const recentMessagesText = history.slice(-8).map(m => m.content).join('\n');
    const { entries: matchedLore, matchedKeys } = this.findMatchingLore(character, recentMessagesText);

    // 2. User Relationships (Active bond + Known social circle)
    const { active: activeRelationship, known: knownRelationships } = this.getCharacterRelationships(
      character.id,
      discordUserId || '',
      resolvedUserName
    );

    // 3. Smart Recalled Memories (Character Mind)
    const enableMemory = character.context_config?.enable_memory !== false;
    const recalledMemories = enableMemory
      ? this.getSmartCharacterMemories(character.id, discordUserId || '', resolvedUserName, recentMessagesText)
      : [];

    // 4. Build System Prompt Sections
    const promptSections: string[] = [];

    // Explicit Roleplay Framing to prevent AI self-confusion and persona loss
    promptSections.push(
      `[CRITICAL ROLEPLAY INSTRUCTIONS & PERSPECTIVE]\n` +
      `• You are ${charName}. You must NEVER speak for, narrate actions for, or roleplay as "${resolvedUserName}".\n` +
      `• The user you are conversing with is "${resolvedUserName}".\n` +
      `• Address "${resolvedUserName}" directly by name or natural title when speaking to them.\n` +
      `• Respond strictly from the perspective of ${charName} using standard roleplay notation (*actions/thoughts in asterisks*, "spoken dialogue in quotes").\n` +
      `• Stay authentic to your character traits, background, and tone at all times.`
    );

    // Base System Prompt
    let baseSys = character.system_prompt?.trim();
    if (baseSys) {
      promptSections.push(`[Character Directives - ${charName}]\n${this.replaceMacros(baseSys, charName, resolvedUserName, character.scenario)}`);
    }

    // Persona & Description
    if (character.description?.trim()) {
      promptSections.push(`[Character Identity & Background]\n${this.replaceMacros(character.description, charName, resolvedUserName)}`);
    }

    if (character.personality?.trim()) {
      promptSections.push(`[Personality & Speech Habits]\n${this.replaceMacros(character.personality, charName, resolvedUserName)}`);
    }

    // Scenario / Setting
    if (character.scenario?.trim()) {
      promptSections.push(`[Current Scene / Setting]\n${this.replaceMacros(character.scenario, charName, resolvedUserName, character.scenario)}`);
    }

    // Active Speaker Bond Directives
    if (activeRelationship) {
      promptSections.push(
        `[Your Bond & Relationship with Active Speaker: "${resolvedUserName}"]\n` +
        `• Role: ${activeRelationship.relationship_type} (Affinity Level: ${activeRelationship.affinity_level}/100)\n` +
        `• Directives: ${this.replaceMacros(activeRelationship.relationship_notes, charName, resolvedUserName)}`
      );
    }

    // Known Social Circle & Relationships (shared awareness)
    if (knownRelationships.length > 0) {
      const relLines = knownRelationships.map(r => {
        const name = r.user_identifier;
        return `• ${name} (${r.relationship_type}, Affinity ${r.affinity_level}/100): ${this.replaceMacros(r.relationship_notes, charName, resolvedUserName)}`;
      }).join('\n');

      promptSections.push(
        `[Known Relationships & Social Circle]\n` +
        `*(You are familiar with these individuals. If "${resolvedUserName}" or others ask about them or mention them, stay in character and reflect these bonds accurately:)*\n` +
        `${relLines}`
      );
    }

    // Character Mind / Long-Term Recalled Memories
    if (recalledMemories.length > 0) {
      const memoryLines = recalledMemories.map(m => {
        const originTag = m.user_display_name ? ` [About: ${m.user_display_name}]` : '';
        return `• ${m.memory_text}${originTag}`;
      }).join('\n');

      promptSections.push(
        `[Character's Long-Term Recalled Memories & Known Facts]\n` +
        `${memoryLines}\n` +
        `*(You recall these details naturally from past interactions and experiences. Seamlessly reference these facts whenever relevant.)*`
      );
    }

    // Injected World Lore (High-authority framing for weak models)
    const injectedLoreTexts: string[] = [];
    if (matchedLore.length > 0) {
      const loreBlock = matchedLore
        .map(entry => `• ${this.replaceMacros(entry.content, charName, resolvedUserName)}`)
        .join('\n');
      promptSections.push(
        `[ACTIVE WORLD LORE & CANONICAL KNOWLEDGE]\n` +
        `You have absolute canonical knowledge of the following world lore. Seamlessly weave these facts, lore details, secrets, and world mechanics into your speech and actions:\n` +
        `${loreBlock}`
      );
      injectedLoreTexts.push(...matchedLore.map(e => e.comment || e.keys.join(', ')));
    }

    // Emotion Expression Directive
    if (character.expressions && character.expressions.length > 0) {
      const expList = character.expressions.map(e => `${e.name} ${e.emoji || ''}`).join(', ');
      promptSections.push(
        `[Emotion Expressions]:\nAvailable moods: [${expList}]. You can optionally append [emotion: mood_name] (e.g. [emotion: angry] or [emotion: happy]) to switch your avatar face.`
      );
    }

    // Example Dialogues
    if (character.mes_example?.trim()) {
      promptSections.push(`[Dialogue Examples]\n${this.replaceMacros(character.mes_example, charName, resolvedUserName)}`);
    }

    // Rolling Summary
    let summaryIncluded = false;
    if (rollingSummary?.trim()) {
      promptSections.push(`[Summary of Previous Events in Roleplay]\n${this.replaceMacros(rollingSummary, charName, resolvedUserName)}`);
      summaryIncluded = true;
    }

    // Post-History / Formatting guard
    if (character.post_history_instructions?.trim()) {
      promptSections.push(`[Special Behavioral Constraints]\n${this.replaceMacros(character.post_history_instructions, charName, resolvedUserName)}`);
    }

    const fullSystemPrompt = promptSections.join('\n\n');

    // 5. Token Budgeting & Sliding Window
    const charContextLimit = character.context_config?.max_context_tokens || 4096;
    const maxTokensBudget = Math.min(charContextLimit, serverHardCap || 8192);
    const maxResponseTokens = character.model_config?.parameters?.max_tokens || 400;

    const systemPromptTokens = this.estimateTokens(fullSystemPrompt);
    const availableForHistory = Math.max(400, maxTokensBudget - systemPromptTokens - maxResponseTokens - 100);

    const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    let currentHistoryTokens = 0;

    const maxHistoryCount = character.context_config?.max_history_messages || 20;
    const candidateHistory = history.slice(-maxHistoryCount);

    for (let i = candidateHistory.length - 1; i >= 0; i--) {
      const msg = candidateHistory[i];
      const processedContent = this.replaceMacros(msg.content, charName, resolvedUserName);
      const msgTokens = this.estimateTokens(processedContent) + 8;

      if (currentHistoryTokens + msgTokens > availableForHistory && formattedMessages.length > 0) {
        break;
      }

      formattedMessages.unshift({
        role: msg.role,
        content: processedContent
      });
      currentHistoryTokens += msgTokens;
    }

    // Recency Anchor for weak models (enforces character roleplay at the very end of context)
    const recencyAnchor = `[System Directive: Respond strictly as ${charName} speaking to "${resolvedUserName}". Stay authentic to your character. Use asterisks for actions (*action*) and quotes for dialogue ("dialogue"). Do NOT write dialogue or actions for "${resolvedUserName}".]`;

    const totalEstimatedTokens = systemPromptTokens + currentHistoryTokens;

    return {
      systemPrompt: fullSystemPrompt,
      messages: formattedMessages,
      estimatedTokens: totalEstimatedTokens,
      injectedLore: injectedLoreTexts,
      summaryIncluded,
      activeRelationship: activeRelationship,
      knownRelationships: knownRelationships,
      recalledMemories,
      recencyAnchor
    };
  }
}
