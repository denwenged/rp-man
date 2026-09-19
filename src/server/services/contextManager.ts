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
  recalledMemories?: CharacterMemory[];
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
   * Find relationship between character and user
   */
  public static findRelationship(characterId: string, userIdentifier: string): UserRelationship | null {
    if (!userIdentifier) return null;
    try {
      const row = db.prepare(`
        SELECT * FROM user_relationships 
        WHERE character_id = ? AND (LOWER(user_identifier) = LOWER(?) OR user_identifier = ?)
        LIMIT 1
      `).get(characterId, userIdentifier, userIdentifier) as any;

      if (row) {
        return {
          id: row.id,
          character_id: row.character_id,
          user_identifier: row.user_identifier,
          relationship_type: row.relationship_type,
          relationship_notes: row.relationship_notes,
          affinity_level: row.affinity_level,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      }
    } catch (e) {
      logger.error('SYSTEM', 'Failed to query user relationship', e);
    }
    return null;
  }

  /**
   * Retrieve recalled long-term memories / mind notes for a specific user
   */
  public static getCharacterMemories(characterId: string, userIdentifier: string, userName?: string): CharacterMemory[] {
    if (!userIdentifier && !userName) return [];
    try {
      const rows = db.prepare(`
        SELECT * FROM character_memories 
        WHERE character_id = ? AND (user_identifier = ? OR LOWER(user_identifier) = LOWER(?) OR LOWER(user_display_name) = LOWER(?))
        ORDER BY updated_at DESC
        LIMIT 12
      `).all(characterId, userIdentifier || '', userName || '', userName || '') as any[];

      return rows.map(r => ({
        id: r.id,
        character_id: r.character_id,
        user_identifier: r.user_identifier,
        user_display_name: r.user_display_name,
        memory_text: r.memory_text,
        category: r.category || 'fact',
        created_at: r.created_at,
        updated_at: r.updated_at
      }));
    } catch (e) {
      logger.error('SYSTEM', 'Failed to load character memories', e);
      return [];
    }
  }

  /**
   * Scan text for matching lorebook entries
   */
  public static findMatchingLore(
    character: Character,
    recentText: string
  ): { entries: LoreEntry[]; matchedKeys: string[] } {
    const lorebookIds = character.context_config?.lorebook_ids || [];
    if (lorebookIds.length === 0) {
      return { entries: [], matchedKeys: [] };
    }

    const matchedEntries: LoreEntry[] = [];
    const matchedKeys: string[] = [];
    const normalizedText = ` ${recentText.toLowerCase()} `;

    for (const bookId of lorebookIds) {
      try {
        const rows = db.prepare('SELECT * FROM lore_entries WHERE lorebook_id = ? AND enabled = 1 ORDER BY priority DESC, order_index ASC').all(bookId) as any[];
        
        for (const row of rows) {
          const keys: string[] = JSON.parse(row.keys || '[]');
          const secondaryKeys: string[] = JSON.parse(row.secondary_keys || '[]');
          const constant = Boolean(row.constant);
          const selective = Boolean(row.selective);

          let isMatch = constant;

          if (!isMatch && keys.length > 0) {
            const hasPrimaryKey = keys.some(k => {
              const cleaned = k.trim().toLowerCase();
              return cleaned && normalizedText.includes(cleaned);
            });

            if (hasPrimaryKey) {
              if (selective && secondaryKeys.length > 0) {
                const hasSecondaryKey = secondaryKeys.some(sk => {
                  const cleaned = sk.trim().toLowerCase();
                  return cleaned && normalizedText.includes(cleaned);
                });
                isMatch = hasSecondaryKey;
              } else {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            matchedEntries.push({
              id: row.id,
              lorebook_id: row.lorebook_id,
              keys,
              secondary_keys: secondaryKeys,
              content: row.content,
              comment: row.comment,
              enabled: Boolean(row.enabled),
              constant,
              selective,
              priority: row.priority,
              order: row.order_index
            });
            matchedKeys.push(...keys);
          }
        }
      } catch (e) {
        logger.error('SYSTEM', `Failed to load lorebook ${bookId}`, e);
      }
    }

    return { entries: matchedEntries, matchedKeys };
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

    // 1. Lorebook Matching
    const recentMessagesText = history.slice(-5).map(m => m.content).join('\n');
    const { entries: matchedLore, matchedKeys } = this.findMatchingLore(character, recentMessagesText);

    // 2. User Relationship lookup (checks persona name or discord user ID)
    const relationship = this.findRelationship(character.id, discordUserId || '') ||
                         this.findRelationship(character.id, resolvedUserName);

    // 3. Recalled Memories (Character Mind)
    const enableMemory = character.context_config?.enable_memory !== false;
    const recalledMemories = enableMemory
      ? this.getCharacterMemories(character.id, discordUserId || '', resolvedUserName)
      : [];

    // 4. Build System Prompt Sections
    const promptSections: string[] = [];

    // Explicit Roleplay Framing to prevent AI self-confusion
    promptSections.push(
      `[CRITICAL ROLEPLAY INSTRUCTIONS & PERSPECTIVE]\n` +
      `• You are ${charName}. You must NEVER speak for, impersonate, or roleplay as "${resolvedUserName}".\n` +
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

    // Dynamic User Relationship Directives
    if (relationship) {
      promptSections.push(
        `[Your Bond & Relationship with "${resolvedUserName}"]\n` +
        `• Relationship: ${relationship.relationship_type} (Affinity Level: ${relationship.affinity_level}/100)\n` +
        `• Directives: ${this.replaceMacros(relationship.relationship_notes, charName, resolvedUserName)}`
      );
    }

    // Character Mind / Long-Term Recalled Memories
    if (recalledMemories.length > 0) {
      const memoryLines = recalledMemories.map(m => `• ${m.memory_text}`).join('\n');
      promptSections.push(
        `[Character's Long-Term Memory & Notes About "${resolvedUserName}"]\n` +
        `${memoryLines}\n` +
        `*(You recall these details naturally from previous interactions with ${resolvedUserName}. Reference them when appropriate.)*`
      );
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

    // Injected World Lore
    const injectedLoreTexts: string[] = [];
    if (matchedLore.length > 0) {
      const loreBlock = matchedLore
        .map(entry => this.replaceMacros(entry.content, charName, resolvedUserName))
        .join('\n');
      promptSections.push(`[World Lore / Background Information]\n${loreBlock}`);
      injectedLoreTexts.push(...matchedLore.map(e => e.comment || e.keys.join(', ')));
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

    const totalEstimatedTokens = systemPromptTokens + currentHistoryTokens;

    return {
      systemPrompt: fullSystemPrompt,
      messages: formattedMessages,
      estimatedTokens: totalEstimatedTokens,
      injectedLore: injectedLoreTexts,
      summaryIncluded,
      activeRelationship: relationship,
      recalledMemories
    };
  }
}
