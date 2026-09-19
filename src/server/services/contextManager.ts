import { db } from '../db';
import { Character, ChatMessage, Lorebook, LoreEntry, ServerSettings, CharacterExpression, UserRelationship } from '../../shared/types';
import { logger } from './loggerService';

export interface FormattedPromptPayload {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  estimatedTokens: number;
  injectedLore: string[];
  summaryIncluded: boolean;
  activeRelationship?: UserRelationship | null;
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
    const charName = character.name || 'Assistant';
    const userName = userPersonaName || 'User';

    // 1. Lorebook Matching
    const recentMessagesText = history.slice(-5).map(m => m.content).join('\n');
    const { entries: matchedLore, matchedKeys } = this.findMatchingLore(character, recentMessagesText);

    // 2. User Relationship lookup (checks persona name or discord user ID)
    const relationship = this.findRelationship(character.id, discordUserId || '') ||
                         this.findRelationship(character.id, userName);

    // 3. Build Core System Prompt Sections
    const promptSections: string[] = [];

    // Base System Prompt
    let baseSys = character.system_prompt?.trim();
    if (!baseSys) {
      baseSys = `You are ${charName}. Roleplay as ${charName} engaging with ${userName}. Respond in character with natural dialogue and descriptive actions using standard roleplay notation (*actions in asterisks*, "dialogue in quotes"). Stay strictly in character at all times.`;
    }
    promptSections.push(this.replaceMacros(baseSys, charName, userName, character.scenario));

    // Persona & Description
    if (character.description?.trim()) {
      promptSections.push(`[Character Persona - ${charName}]\n${this.replaceMacros(character.description, charName, userName)}`);
    }

    if (character.personality?.trim()) {
      promptSections.push(`[Personality Traits]\n${this.replaceMacros(character.personality, charName, userName)}`);
    }

    // Scenario
    if (character.scenario?.trim()) {
      promptSections.push(`[Scenario / Setting]\n${this.replaceMacros(character.scenario, charName, userName, character.scenario)}`);
    }

    // Dynamic Relationship Instructions with this specific User
    if (relationship) {
      promptSections.push(`[Your Bond & Relationship with {{user}}]\nRelationship Type: ${relationship.relationship_type} (Affinity: ${relationship.affinity_level}/100)\nDirectives: ${this.replaceMacros(relationship.relationship_notes, charName, userName)}`);
    }

    // Emotion Expressions Directive
    if (character.expressions && character.expressions.length > 0) {
      const expList = character.expressions.map(e => `${e.name} ${e.emoji || ''}`).join(', ');
      promptSections.push(`[Emotion Expressions]:\nYou have the following emotion avatars available: [${expList}]. Express your mood naturally or tag it using [emotion: mood_name] (e.g. [emotion: angry] or [emotion: smug]) to dynamically update your avatar expression.`);
    }

    // Example Dialogues
    if (character.mes_example?.trim()) {
      promptSections.push(`[Example Dialogue]\n${this.replaceMacros(character.mes_example, charName, userName)}`);
    }

    // Injected World Lore
    const injectedLoreTexts: string[] = [];
    if (matchedLore.length > 0) {
      const loreBlock = matchedLore
        .map(entry => this.replaceMacros(entry.content, charName, userName))
        .join('\n');
      promptSections.push(`[World Lore / Background Information]\n${loreBlock}`);
      injectedLoreTexts.push(...matchedLore.map(e => e.comment || e.keys.join(', ')));
    }

    // Rolling Summary
    let summaryIncluded = false;
    if (rollingSummary?.trim()) {
      promptSections.push(`[Summary of Previous Events in Roleplay]\n${this.replaceMacros(rollingSummary, charName, userName)}`);
      summaryIncluded = true;
    }

    // Post-History / Formatting guard
    if (character.post_history_instructions?.trim()) {
      promptSections.push(`[Special Instructions]\n${this.replaceMacros(character.post_history_instructions, charName, userName)}`);
    }

    const fullSystemPrompt = promptSections.join('\n\n');

    // 4. Token Budgeting & Sliding Window
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
      const processedContent = this.replaceMacros(msg.content, charName, userName);
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
      activeRelationship: relationship
    };
  }
}
