import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'rp_man.db');
export const db = new Database(DB_PATH);

// Enable WAL mode for high concurrency and fast performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      tagline TEXT DEFAULT '',
      description TEXT DEFAULT '',
      personality TEXT DEFAULT '',
      scenario TEXT DEFAULT '',
      first_mes TEXT DEFAULT '',
      alternate_greetings TEXT DEFAULT '[]',
      mes_example TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      post_history_instructions TEXT DEFAULT '',
      creator_notes TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      expressions TEXT DEFAULT '[]',
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_public INTEGER DEFAULT 1,
      model_config TEXT DEFAULT '{}',
      discord_config TEXT DEFAULT '{}',
      context_config TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_relationships (
      id TEXT PRIMARY KEY,
      character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
      user_identifier TEXT NOT NULL,
      relationship_type TEXT NOT NULL,
      relationship_notes TEXT NOT NULL,
      affinity_level INTEGER DEFAULT 50,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      user_persona_name TEXT DEFAULT 'User',
      user_persona_avatar TEXT DEFAULT '',
      user_persona_description TEXT DEFAULT '',
      rolling_summary TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      swipes TEXT DEFAULT '[]',
      swipe_index INTEGER DEFAULT 0,
      user_persona_name TEXT DEFAULT '',
      user_persona_avatar TEXT DEFAULT '',
      expression TEXT DEFAULT '',
      expression_emoji TEXT DEFAULT '',
      expression_avatar TEXT DEFAULT '',
      tokens_used INTEGER DEFAULT 0,
      model_used TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      character_ids TEXT DEFAULT '[]',
      scenario TEXT DEFAULT '',
      user_persona_name TEXT DEFAULT 'User',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT REFERENCES group_sessions(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_avatar TEXT DEFAULT '',
      content TEXT NOT NULL,
      expression TEXT DEFAULT '',
      expression_emoji TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lorebooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_entries (
      id TEXT PRIMARY KEY,
      lorebook_id TEXT REFERENCES lorebooks(id) ON DELETE CASCADE,
      keys TEXT DEFAULT '[]',
      secondary_keys TEXT DEFAULT '[]',
      content TEXT NOT NULL,
      comment TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      constant INTEGER DEFAULT 0,
      selective INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 10,
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS llm_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      default_model TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_settings (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_settings (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discord_chat_contexts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      history TEXT DEFAULT '[]',
      rolling_summary TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_char ON user_relationships(character_id);
    CREATE INDEX IF NOT EXISTS idx_group_messages_grp ON group_messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_lore_entries_book ON lore_entries(lorebook_id);
    CREATE INDEX IF NOT EXISTS idx_discord_ctx ON discord_chat_contexts(channel_id, character_id);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
  `);

  // Safe migration checks for new columns if DB already exists
  try {
    const charCols = db.prepare("PRAGMA table_info(characters)").all() as any[];
    if (!charCols.some(c => c.name === 'expressions')) {
      db.prepare("ALTER TABLE characters ADD COLUMN expressions TEXT DEFAULT '[]'").run();
    }
  } catch (e) {}

  try {
    const msgCols = db.prepare("PRAGMA table_info(chat_messages)").all() as any[];
    if (!msgCols.some(c => c.name === 'expression')) {
      db.prepare("ALTER TABLE chat_messages ADD COLUMN expression TEXT DEFAULT ''").run();
      db.prepare("ALTER TABLE chat_messages ADD COLUMN expression_emoji TEXT DEFAULT ''").run();
      db.prepare("ALTER TABLE chat_messages ADD COLUMN expression_avatar TEXT DEFAULT ''").run();
    }
  } catch (e) {}

  seedInitialData();
}

function seedInitialData() {
  const now = new Date().toISOString();

  // 1. Seed Admin user if no users exist
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  let adminId = 'user_admin_default';

  if (userCount === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      'admin',
      passwordHash,
      'admin',
      'https://api.dicebear.com/7.x/bottts/svg?seed=admin',
      now,
      now
    );
    console.log('[DB] Created default admin account: username: admin / password: admin123');
  } else {
    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as { id: string } | undefined;
    if (adminUser) adminId = adminUser.id;
  }

  // 2. Seed Server Settings
  const settingsRow = db.prepare('SELECT id FROM server_settings WHERE id = ?').get('global');
  if (!settingsRow) {
    const defaultSettings = {
      default_llm_provider: 'ollama',
      default_llm_model: 'llama3.2:3b',
      ollama_host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      ollama_default_keep_alive: '5m',
      max_concurrent_llm_requests: 1, // Safe for low-power ZimaOS
      llm_timeout_seconds: 90,
      default_context_tokens: 4096,
      max_context_tokens_hard_cap: 8192,
      enable_auto_summarize: true,
      log_retention_days: 7,
      app_name: 'RP-Man',
      app_theme: 'matte-dark'
    };
    db.prepare(`
      INSERT INTO server_settings (id, config, updated_at)
      VALUES (?, ?, ?)
    `).run('global', JSON.stringify(defaultSettings), now);
  }

  // 3. Seed LLM Providers
  const providerCount = (db.prepare('SELECT COUNT(*) as count FROM llm_providers').get() as { count: number }).count;
  if (providerCount === 0) {
    const defaultOllama = {
      id: 'provider_ollama',
      name: 'Local Ollama',
      type: 'ollama',
      base_url: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      api_key: '',
      enabled: 1,
      default_model: 'llama3.2:3b',
      is_default: 1,
      created_at: now,
      updated_at: now
    };

    const defaultOpenRouter = {
      id: 'provider_openrouter',
      name: 'OpenRouter (Cloud)',
      type: 'openrouter',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: '',
      enabled: 1,
      default_model: 'mistralai/mistral-7b-instruct:free',
      is_default: 0,
      created_at: now,
      updated_at: now
    };

    const defaultOpenAI = {
      id: 'provider_openai',
      name: 'OpenAI',
      type: 'openai',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      enabled: 1,
      default_model: 'gpt-4o-mini',
      is_default: 0,
      created_at: now,
      updated_at: now
    };

    const insertProvider = db.prepare(`
      INSERT INTO llm_providers (id, name, type, base_url, api_key, enabled, default_model, is_default, created_at, updated_at)
      VALUES (@id, @name, @type, @base_url, @api_key, @enabled, @default_model, @is_default, @created_at, @updated_at)
    `);

    insertProvider.run(defaultOllama);
    insertProvider.run(defaultOpenRouter);
    insertProvider.run(defaultOpenAI);
  }

  // 4. Seed Discord Settings
  const discordSettings = db.prepare('SELECT id FROM discord_settings WHERE id = ?').get('main');
  if (!discordSettings) {
    const defaultDiscord = {
      enabled: false,
      token: process.env.DISCORD_BOT_TOKEN || '',
      client_id: '',
      default_character_id: '',
      allow_dm: true,
      typing_indicator: true,
      prefix: '!',
      rate_limit_per_user_sec: 2,
      max_response_length: 1900,
      split_long_messages: true,
      status_activity: 'RP Tavern | !help',
      status_type: 'PLAYING'
    };
    db.prepare(`
      INSERT INTO discord_settings (id, config, updated_at)
      VALUES (?, ?, ?)
    `).run('main', JSON.stringify(defaultDiscord), now);
  }

  // 5. Seed Lorebook if empty
  const loreCount = (db.prepare('SELECT COUNT(*) as count FROM lorebooks').get() as { count: number }).count;
  let defaultLorebookId = 'lore_tavern_default';
  if (loreCount === 0) {
    db.prepare(`
      INSERT INTO lorebooks (id, name, description, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      defaultLorebookId,
      'The Obsidian Tavern Lore',
      'Atmospheric world lore for a mysterious multidimensional sanctuary.',
      adminId,
      now,
      now
    );

    const insertEntry = db.prepare(`
      INSERT INTO lore_entries (id, lorebook_id, keys, secondary_keys, content, comment, enabled, constant, selective, priority, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEntry.run(
      'lore_entry_1',
      defaultLorebookId,
      JSON.stringify(['obsidian tavern', 'the tavern', 'sanctuary']),
      JSON.stringify([]),
      'The Obsidian Tavern is a magical haven existing between dimensions, warmly lit by floating amber lanterns, smelling of spiced mead, old parchment, and crackling pine.',
      'Tavern Atmosphere',
      1,
      0,
      0,
      10,
      0
    );

    insertEntry.run(
      'lore_entry_2',
      defaultLorebookId,
      JSON.stringify(['currency', 'gold', 'drachma', 'payment']),
      JSON.stringify([]),
      'In the Obsidian Tavern, patrons can pay with gold coins, enchanted trinkets, or even fascinating stories from their home worlds.',
      'Currency & Trade',
      1,
      0,
      0,
      5,
      1
    );
  }

  // 6. Seed High-Quality Default Characters if empty
  const charCount = (db.prepare('SELECT COUNT(*) as count FROM characters').get() as { count: number }).count;
  if (charCount === 0) {
    const charactersToSeed = [
      {
        id: 'char_aria_cyber',
        name: 'Aria Vance',
        avatar_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop&q=80',
        tagline: 'Cyberpunk Netrunner & Snarky Fixer',
        description: 'Aria Vance is a sharp-witted 24-year-old freelance netrunner from Neo-Veridia. She possesses neon-cyan cybernetic optics, a customized trenchcoat lined with neural jacks, and a razor-sharp tongue.',
        personality: 'Clever, sarcastic, resourceful, secretly protective of allies, loves synth-coffee and late-night hacking contracts.',
        scenario: '{{user}} meets Aria in a rain-soaked neon back-alley noodle bar after a job went sideways.',
        first_mes: `*She leans against the neon-lit vending machine, exhaling a thin trail of steam into the neon rain. Her cybernetic eyes flash faint cyan as she scans you up and down.*\n\n"You're late. And you brought half the district's heat with you, didn't you? Sit down before someone takes a snapshot. What's the payload look like?"`,
        alternate_greetings: JSON.stringify([
          `*Aria twirls a custom data shard between her metal-tipped fingers, looking up from her holographic workstation.* "Don't just stand there letting the cold draft in. Did you decrypt the mainframe file or did you just smash the server rack?"`
        ]),
        mes_example: `<START>\n{{user}}: "I got the shard, but we need to move fast."\n{{char}}: *A smirk tugs at the corner of her lips as she pockets the glowing drive with practiced speed.* "Fast is my middle name, rookie. Keep your head down and stick to the shadows—I'll blind their security drones on our way out."`,
        system_prompt: `You are Aria Vance, a sarcastic yet fiercely loyal cyberpunk netrunner. 
Engage in vivid, descriptive roleplay with sensory details. Keep your speech snappy, witty, and grounded in futuristic slang (creds, chrome, ICE, flatline).
Never break character or speak as an AI model. Write natural responses in standard RP format (actions in asterisks *like this*, dialogue in quotes "like this").`,
        post_history_instructions: 'Keep responses immersive, character-authentic, and concise (under 200 words unless more detail is requested).',
        creator_notes: 'Great starter character for gritty sci-fi and cyberpunk roleplay.',
        tags: JSON.stringify(['Cyberpunk', 'Sci-Fi', 'Netrunner', 'Witty']),
        expressions: JSON.stringify([
          { id: 'exp_aria_smug', name: 'smug', emoji: '😏', avatar_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_aria_angry', name: 'angry', emoji: '😡', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_aria_happy', name: 'happy', emoji: '😊', avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_aria_blushing', name: 'blushing', emoji: '😳', avatar_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop&q=80' }
        ]),
        user_id: adminId,
        is_public: 1,
        model_config: JSON.stringify({
          provider: 'server_default',
          model: '',
          parameters: {
            temperature: 0.8,
            top_p: 0.9,
            max_tokens: 300,
            repeat_penalty: 1.1
          },
          keep_alive: '5m'
        }),
        discord_config: JSON.stringify({
          trigger_prefix: 'aria:',
          trigger_suffix: '',
          webhook_url: '',
          channel_ids: [],
          auto_react: true,
          reply_on_mention: true,
          tupperbox_proxy: true
        }),
        context_config: JSON.stringify({
          max_context_tokens: 4096,
          max_history_messages: 16,
          enable_summary: true,
          summary_token_threshold: 3000,
          lorebook_ids: [defaultLorebookId]
        })
      },
      {
        id: 'char_valerius_mage',
        name: 'Grand Mage Valerius',
        avatar_url: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=400&auto=format&fit=crop&q=80',
        tagline: 'Ancient Arcane Scholar & Relic Keeper',
        description: 'Valerius is a centuries-old scholar of the Celestial Spire. He wears velvet robes woven with starry constellations and carries an ancient oak staff capped with a pulsating starlight crystal.',
        personality: 'Wise, contemplative, patient, eccentric, fascinated by lost artifacts and cosmic enigmas, speaks in poetic yet accessible language.',
        scenario: 'Valerius invites {{user}} into his celestial observatory where ancient scrolls float through the air.',
        first_mes: `*Valerius turns slowly from a massive brass astrolabe, the starlight catching the silver threads of his robes. A faint smile crinkles the corners of his eyes as he gestures to a high-backed velvet chair.*\n\n"Ah, traveler. The celestial alignments whispered of an arrival tonight. Please, sit. The tea was brewed with solar blossoms just moments ago. Tell me, what truth do you seek in the high tower?"`,
        alternate_greetings: JSON.stringify([
          `*Valerius catches a glowing quill mid-air without looking away from a sprawling parchment map.* "Enter, enter. Mind the astral dust near the threshold. What knowledge brings you across the mountain pass?"`
        ]),
        mes_example: `<START>\n{{user}}: "Can you decipher this ancient rune for me?"\n{{char}}: *He adjusts a brass magnifying lens over his eye, his fingers glowing with a soft lavender aura as he traces the etched stone.* "Fascinating... This script predates the Third Convergence. Look here—the weave of the magic is defensive, intended to guard a slumbering titan."`,
        system_prompt: `You are Grand Mage Valerius, an ancient scholar of the mystical arts.
Speak with thoughtful wisdom, arcane intrigue, and warmth. Use sensory descriptions of magical resonance, incense, and cosmic wonder.
Always stay in character. Use asterisk notation for actions *like this* and quotes for speech "like this".`,
        post_history_instructions: 'Maintain a mystical, intellectual, and inviting tone.',
        creator_notes: 'Designed for fantasy quests, lore research, and mystical adventures.',
        tags: JSON.stringify(['Fantasy', 'Magic', 'Scholar', 'Wise']),
        expressions: JSON.stringify([
          { id: 'exp_val_wise', name: 'neutral', emoji: '✨', avatar_url: 'https://images.unsplash.com/photo-1514539079130-25950c84af65?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_val_curious', name: 'curious', emoji: '🧐', avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80' }
        ]),
        user_id: adminId,
        is_public: 1,
        model_config: JSON.stringify({
          provider: 'server_default',
          model: '',
          parameters: {
            temperature: 0.75,
            top_p: 0.92,
            max_tokens: 350,
            repeat_penalty: 1.15
          },
          keep_alive: '5m'
        }),
        discord_config: JSON.stringify({
          trigger_prefix: 'mage:',
          trigger_suffix: '',
          webhook_url: '',
          channel_ids: [],
          auto_react: false,
          reply_on_mention: true,
          tupperbox_proxy: true
        }),
        context_config: JSON.stringify({
          max_context_tokens: 4096,
          max_history_messages: 16,
          enable_summary: true,
          summary_token_threshold: 3000,
          lorebook_ids: [defaultLorebookId]
        })
      },
      {
        id: 'char_luna_familiar',
        name: 'Luna the Shadowcat',
        avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&auto=format&fit=crop&q=80',
        tagline: 'Mischievous Shadow Familiar & Spy',
        description: 'Luna appears as a sleek midnight-black feline with luminous violet eyes and the uncanny ability to melt into shadows and speak telepathically or aloud with theatrical flair.',
        personality: 'Playful, sassy, inquisitive, dramatic, loves shiny objects, treats, and harmless chaos.',
        scenario: `Luna has appeared uninvited atop {{user}}'s desk, batting lazily at a fountain pen.`,
        first_mes: `*A pool of darkness pools upon your desk before rising into the sleek silhouette of a black cat with glowing violet eyes. She stretches gracefully, paws kneading the desk blotter before curling her tail around your wrist.*\n\n"Mrow... About time you took a break, mortal. I brought no dead birds today, only juicy secrets from the council chamber. Have you got fish snacks, or must I withhold the scandal?"`,
        alternate_greetings: JSON.stringify([]),
        mes_example: `<START>\n{{user}}: "Did you steal the mayor's signet ring again?"\n{{char}}: *Luna tilts her head innocently, pawing a shiny golden ring under a pile of papers.* "Steal? What a coarse accusation! It simply... wandered into my pocket dimension because it liked my purr."`,
        system_prompt: `You are Luna, a mischievous magical shadowcat familiar.
Speak playfully, with feline quirks (purring, batting at things, sudden bursts of energy, feigned innocence).
Stay strictly in character. Actions in asterisks *like this*, speech in quotes "like this".`,
        post_history_instructions: 'Keep replies whimsical, expressive, and fun.',
        creator_notes: 'Casual and comical companion character.',
        tags: JSON.stringify(['Comedy', 'Familiar', 'Cat', 'Fantasy']),
        expressions: JSON.stringify([
          { id: 'exp_luna_smug', name: 'smug', emoji: '😼', avatar_url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_luna_happy', name: 'happy', emoji: '😸', avatar_url: 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=400&auto=format&fit=crop&q=80' },
          { id: 'exp_luna_angry', name: 'angry', emoji: '😾', avatar_url: 'https://images.unsplash.com/photo-1561948955-570b270e7c36?w=400&auto=format&fit=crop&q=80' }
        ]),
        user_id: adminId,
        is_public: 1,
        model_config: JSON.stringify({
          provider: 'server_default',
          model: '',
          parameters: {
            temperature: 0.85,
            top_p: 0.95,
            max_tokens: 250,
            repeat_penalty: 1.1
          },
          keep_alive: '5m'
        }),
        discord_config: JSON.stringify({
          trigger_prefix: 'luna:',
          trigger_suffix: '',
          webhook_url: '',
          channel_ids: [],
          auto_react: true,
          reply_on_mention: true,
          tupperbox_proxy: true
        }),
        context_config: JSON.stringify({
          max_context_tokens: 3072,
          max_history_messages: 14,
          enable_summary: true,
          summary_token_threshold: 2500,
          lorebook_ids: []
        })
      }
    ];

    const insertChar = db.prepare(`
      INSERT INTO characters (
        id, name, avatar_url, tagline, description, personality, scenario,
        first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions,
        creator_notes, tags, expressions, user_id, is_public, model_config, discord_config, context_config,
        created_at, updated_at
      ) VALUES (
        @id, @name, @avatar_url, @tagline, @description, @personality, @scenario,
        @first_mes, @alternate_greetings, @mes_example, @system_prompt, @post_history_instructions,
        @creator_notes, @tags, @expressions, @user_id, @is_public, @model_config, @discord_config, @context_config,
        @created_at, @updated_at
      )
    `);

    for (const char of charactersToSeed) {
      insertChar.run({
        ...char,
        created_at: now,
        updated_at: now
      });
    }

    // Seed sample relationship for Aria
    db.prepare(`
      INSERT INTO user_relationships (id, character_id, user_identifier, relationship_type, relationship_notes, affinity_level, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'rel_aria_father',
      'char_aria_cyber',
      'Father',
      'Father',
      'Aria treats you with rare, unconditional respect, warm protectiveness, and deference. She dropped her sarcastic facade around you because you raised and protected her in the Under-grid.',
      95,
      now,
      now
    );

    console.log(`[DB] Seeded ${charactersToSeed.length} default RP characters with expressions and user relationships.`);
  }
}
