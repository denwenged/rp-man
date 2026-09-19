import { Character } from '../../shared/types';
import crypto from 'crypto';

export interface TavernCardV2 {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    tags?: string[];
    creator?: string;
    character_version?: string;
    extensions?: Record<string, any>;
    character_book?: {
      name?: string;
      description?: string;
      entries?: Array<{
        keys: string[];
        secondary_keys?: string[];
        content: string;
        comment?: string;
        enabled?: boolean;
        constant?: boolean;
        selective?: boolean;
        insertion_order?: number;
      }>;
    };
  };
}

export class CardImportExport {
  /**
   * Parse Tavern V2 / V1 JSON data into a Character object
   */
  public static parseCharacterData(data: any, userId: string): Partial<Character> {
    let name = 'Unnamed Character';
    let description = '';
    let personality = '';
    let scenario = '';
    let first_mes = '';
    let alternate_greetings: string[] = [];
    let mes_example = '';
    let system_prompt = '';
    let post_history_instructions = '';
    let creator_notes = '';
    let tags: string[] = [];

    // Check Tavern V2 format
    if (data.spec === 'chara_card_v2' && data.data) {
      const d = data.data;
      name = d.name || name;
      description = d.description || '';
      personality = d.personality || '';
      scenario = d.scenario || '';
      first_mes = d.first_mes || '';
      alternate_greetings = Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [];
      mes_example = d.mes_example || '';
      system_prompt = d.system_prompt || '';
      post_history_instructions = d.post_history_instructions || '';
      creator_notes = d.creator_notes || '';
      tags = Array.isArray(d.tags) ? d.tags : [];
    } else if (data.name) {
      // Tavern V1 or simple JSON format
      name = data.name;
      description = data.description || '';
      personality = data.personality || '';
      scenario = data.scenario || '';
      first_mes = data.first_mes || data.first_message || '';
      alternate_greetings = Array.isArray(data.alternate_greetings) ? data.alternate_greetings : [];
      mes_example = data.mes_example || data.example_dialogue || '';
      system_prompt = data.system_prompt || '';
      post_history_instructions = data.post_history_instructions || '';
      creator_notes = data.creator_notes || '';
      tags = Array.isArray(data.tags) ? data.tags : [];
    }

    const cleanTrigger = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

    return {
      name,
      tagline: description ? description.slice(0, 100).split('\n')[0] : 'Roleplay Character',
      description,
      personality,
      scenario,
      first_mes,
      alternate_greetings,
      mes_example,
      system_prompt,
      post_history_instructions,
      creator_notes,
      tags,
      user_id: userId,
      is_public: true,
      model_config: {
        provider: 'server_default',
        model: '',
        parameters: {
          temperature: 0.8,
          top_p: 0.9,
          max_tokens: 350,
          repeat_penalty: 1.1
        },
        keep_alive: '5m'
      },
      discord_config: {
        trigger_prefix: `${cleanTrigger}:`,
        trigger_suffix: '',
        webhook_url: '',
        channel_ids: [],
        auto_react: false,
        reply_on_mention: true,
        tupperbox_proxy: true
      },
      context_config: {
        max_context_tokens: 4096,
        max_history_messages: 16,
        enable_summary: true,
        summary_token_threshold: 3000,
        lorebook_ids: []
      }
    };
  }

  /**
   * Export Character to Tavern Card V2 JSON format
   */
  public static exportToTavernV2(character: Character): TavernCardV2 {
    return {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: character.name,
        description: character.description || '',
        personality: character.personality || '',
        scenario: character.scenario || '',
        first_mes: character.first_mes || '',
        alternate_greetings: character.alternate_greetings || [],
        mes_example: character.mes_example || '',
        creator_notes: character.creator_notes || '',
        system_prompt: character.system_prompt || '',
        post_history_instructions: character.post_history_instructions || '',
        tags: character.tags || [],
        extensions: {
          rp_man: {
            model_config: character.model_config,
            discord_config: character.discord_config,
            context_config: character.context_config
          }
        }
      }
    };
  }

  /**
   * Extract text chunks from PNG buffer (for Character Card PNGs)
   */
  public static extractJsonFromPng(pngBuffer: Buffer): any | null {
    try {
      // Standard PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (pngBuffer.readUInt32BE(0) !== 0x89504E47) {
        return null;
      }

      let offset = 8;
      while (offset < pngBuffer.length) {
        const length = pngBuffer.readUInt32BE(offset);
        const type = pngBuffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;

        if (type === 'tEXt') {
          const chunkData = pngBuffer.subarray(dataStart, dataEnd);
          const nullIndex = chunkData.indexOf(0);
          if (nullIndex !== -1) {
            const keyword = chunkData.subarray(0, nullIndex).toString('ascii');
            const text = chunkData.subarray(nullIndex + 1).toString('utf-8');

            if (keyword === 'chara' || keyword === 'ccv3') {
              try {
                // Decode base64
                const jsonStr = Buffer.from(text, 'base64').toString('utf-8');
                return JSON.parse(jsonStr);
              } catch (e) {
                // Try direct JSON
                return JSON.parse(text);
              }
            }
          }
        }

        offset = dataEnd + 4; // Skip CRC (4 bytes)
      }
    } catch (e) {
      console.error('Error parsing PNG text chunks', e);
    }
    return null;
  }
}
