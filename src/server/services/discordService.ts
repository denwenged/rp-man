import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  NewsChannel,
  ThreadChannel,
  Webhook,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType
} from 'discord.js';
import axios from 'axios';
import crypto from 'crypto';
import { db } from '../db';
import { logger } from './loggerService';
import { llmService } from './llmService';
import { Character, DiscordBotConfig, DiscordStatus } from '../../shared/types';
import { ContextManager } from './contextManager';

class DiscordService {
  private client: Client | null = null;
  private isConnecting: boolean = false;
  private webhookCache: Map<string, Webhook> = new Map();
  private lastUserMessageTime: Map<string, number> = new Map();

  constructor() {
    setTimeout(() => {
      this.initAutoStart();
    }, 1500);
  }

  private async initAutoStart() {
    try {
      const config = this.getConfig();
      if (config.enabled && config.token) {
        logger.info('DISCORD', 'Auto-starting Discord Bot service...');
        await this.start();
      }
    } catch (e) {
      logger.error('DISCORD', 'Failed to auto-start Discord bot', e);
    }
  }

  public getConfig(): DiscordBotConfig {
    try {
      const row = db.prepare('SELECT config FROM discord_settings WHERE id = ?').get('main') as { config: string } | undefined;
      if (row) return JSON.parse(row.config);
    } catch (e) {}

    return {
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
  }

  public updateConfig(newConfig: Partial<DiscordBotConfig>) {
    const current = this.getConfig();
    const updated = { ...current, ...newConfig };
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO discord_settings (id, config, updated_at)
      VALUES ('main', ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
    `).run(JSON.stringify(updated), now);

    return updated;
  }

  public getStatus(): DiscordStatus {
    if (this.isConnecting) return { connected: false, status: 'connecting' };
    if (!this.client || !this.client.isReady()) return { connected: false, status: 'offline' };

    return {
      connected: true,
      status: 'online',
      latency: Math.round(this.client.ws.ping),
      bot_user: {
        id: this.client.user.id,
        username: this.client.user.username,
        discriminator: this.client.user.discriminator,
        avatar_url: this.client.user.displayAvatarURL(),
        guilds_count: this.client.guilds.cache.size
      },
      active_channels_count: this.webhookCache.size
    };
  }

  public async start(): Promise<{ success: boolean; message: string }> {
    const config = this.getConfig();
    if (!config.token) return { success: false, message: 'Discord Bot Token is not set.' };
    if (this.client && this.client.isReady()) return { success: true, message: 'Discord Bot is already running.' };

    this.isConnecting = true;
    logger.info('DISCORD', 'Connecting to Discord Gateway...');

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildWebhooks,
          GatewayIntentBits.DirectMessages
        ],
        partials: [Partials.Channel, Partials.Message]
      });

      this.setupEventHandlers();

      await this.client.login(config.token);
      this.isConnecting = false;
      this.updateConfig({ enabled: true });

      await this.registerSlashCommands();

      logger.info('DISCORD', `Discord Bot connected as ${this.client.user?.tag} (Serving ${this.client.guilds.cache.size} guilds)`);
      return { success: true, message: `Connected as ${this.client.user?.tag}` };
    } catch (e: any) {
      this.isConnecting = false;
      this.client = null;
      logger.error('DISCORD', `Discord login error: ${e.message}`);
      return { success: false, message: e.message };
    }
  }

  public async stop(): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      this.updateConfig({ enabled: false });
      return { success: true, message: 'Discord Bot is already stopped.' };
    }

    try {
      await this.client.destroy();
      this.client = null;
      this.webhookCache.clear();
      this.updateConfig({ enabled: false });
      logger.info('DISCORD', 'Discord Bot stopped.');
      return { success: true, message: 'Discord Bot disconnected successfully.' };
    } catch (e: any) {
      this.client = null;
      logger.error('DISCORD', `Error stopping bot: ${e.message}`);
      return { success: false, message: e.message };
    }
  }

  public async restart(): Promise<{ success: boolean; message: string }> {
    await this.stop();
    return this.start();
  }

  private setupEventHandlers() {
    if (!this.client) return;

    this.client.on('ready', () => {
      const config = this.getConfig();
      if (this.client?.user) {
        let actType = ActivityType.Playing;
        if (config.status_type === 'LISTENING') actType = ActivityType.Listening;
        if (config.status_type === 'WATCHING') actType = ActivityType.Watching;
        if (config.status_type === 'COMPETING') actType = ActivityType.Competing;

        this.client.user.setActivity(config.status_activity || 'RP Tavern | !help', { type: actType });
      }
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      try {
        await this.handleIncomingMessage(message);
      } catch (err: any) {
        logger.error('DISCORD', `Error handling message: ${err.message}`, err);
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      try {
        await this.handleSlashCommand(interaction);
      } catch (err: any) {
        logger.error('DISCORD', `Error handling slash command /${interaction.commandName}: ${err.message}`);
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: '⚠️ An error occurred processing your command.', ephemeral: true });
        } else {
          await interaction.reply({ content: '⚠️ An error occurred processing your command.', ephemeral: true });
        }
      }
    });
  }

  private async registerSlashCommands() {
    if (!this.client || !this.client.user) return;
    const config = this.getConfig();
    const rest = new REST({ version: '10' }).setToken(config.token);

    const commands = [
      new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Roleplay with an AI character')
        .addStringOption(option =>
          option.setName('character').setDescription('Name or ID of character').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('message').setDescription('Your message / action').setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('convo')
        .setDescription('Trigger a live conversation between two characters')
        .addStringOption(option =>
          option.setName('character1').setDescription('First Character').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('character2').setDescription('Second Character').setRequired(true)
        )
        .addStringOption(option =>
          option.setName('topic').setDescription('Scenario / topic for them to discuss').setRequired(false)
        )
        .addIntegerOption(option =>
          option.setName('turns').setDescription('Number of exchange turns (1-4)').setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('nickname')
        .setDescription('Set or check your roleplay persona nickname so characters address you properly')
        .addSubcommand(sub =>
          sub
            .setName('set')
            .setDescription('Set your preferred roleplay nickname')
            .addStringOption(opt => opt.setName('name').setDescription('Your persona name (e.g. Lord Joshua, Elena)').setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('view').setDescription('View your current roleplay nickname')
        )
        .addSubcommand(sub =>
          sub.setName('clear').setDescription('Clear your custom nickname and use your Discord server name')
        ),
      new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset your personal conversation context with a character')
        .addStringOption(option =>
          option.setName('character').setDescription('Character name (leave blank to reset all in this channel)').setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('forgetme')
        .setDescription('Wipe long-term memories and context this character has stored about you')
        .addStringOption(option =>
          option.setName('character').setDescription('Character name').setRequired(false)
        ),
      new SlashCommandBuilder()
        .setName('characters')
        .setDescription('List all available RP characters, bound channels, and triggers'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check server and Ollama status')
    ];

    try {
      await rest.put(
        Routes.applicationCommands(this.client.user.id),
        { body: commands.map(c => c.toJSON()) }
      );
      logger.info('DISCORD', 'Successfully registered slash commands.');
    } catch (e: any) {
      logger.warn('DISCORD', `Could not register slash commands: ${e.message}`);
    }
  }

  private async handleIncomingMessage(message: any) {
    const config = this.getConfig();
    const content = message.content?.trim() || '';
    if (!content) return;

    const userId = message.author.id;
    const channelId = message.channelId;
    const now = Date.now();
    const lastTime = this.lastUserMessageTime.get(userId) || 0;
    const cooldownMs = (config.rate_limit_per_user_sec || 2) * 1000;
    if (now - lastTime < cooldownMs) return;
    this.lastUserMessageTime.set(userId, now);

    // Check for quick prefix commands e.g. !nick or !reset
    if (content.startsWith('!nick ') || content.startsWith('!nickname ')) {
      const newNick = content.replace(/^!(?:nick|nickname)\s+/, '').trim();
      if (newNick) {
        this.setUserNickname(userId, newNick);
        await message.reply({ content: `✨ Your roleplay name is now set to **${newNick}**! All characters will address you by this name.` });
        return;
      }
    }

    if (content === '!reset' || content.startsWith('!reset ')) {
      const charQuery = content.replace(/^!reset\s*/, '').trim().toLowerCase();
      this.resetUserContext(channelId, userId, charQuery);
      await message.reply({ content: `🧹 Reset your personal conversation context in this channel. Other users are unaffected!` });
      return;
    }

    const characters = this.getAllCharacters();
    if (characters.length === 0) return;

    let targetChar: Character | null = null;
    let cleanUserMessage = content;
    let shouldDeleteTrigger = false;

    // 1. Check for Channel Bindings (Character assigned to this text chat)
    const boundChar = characters.find(c => {
      const bound = c.discord_config?.bound_channels || c.discord_config?.channel_ids || [];
      return bound.includes(channelId);
    });

    // 2. Check Trigger Prefixes & Suffixes
    for (const char of characters) {
      const prefix = char.discord_config?.trigger_prefix?.trim().toLowerCase();
      const suffix = char.discord_config?.trigger_suffix?.trim().toLowerCase();

      if (prefix && content.toLowerCase().startsWith(prefix)) {
        targetChar = char;
        cleanUserMessage = content.slice(prefix.length).trim();
        // Only delete if tupperbox_proxy is on AND delete_trigger_message is not explicitly disabled
        shouldDeleteTrigger = Boolean(char.discord_config?.tupperbox_proxy && char.discord_config?.delete_trigger_message !== false);
        break;
      }

      if (suffix && content.toLowerCase().endsWith(suffix)) {
        targetChar = char;
        cleanUserMessage = content.slice(0, -suffix.length).trim();
        shouldDeleteTrigger = Boolean(char.discord_config?.tupperbox_proxy && char.discord_config?.delete_trigger_message !== false);
        break;
      }
    }

    // 3. If no prefix trigger, check if channel is bound to a specific character
    if (!targetChar && boundChar) {
      targetChar = boundChar;
      cleanUserMessage = content;
      shouldDeleteTrigger = false; // NEVER delete messages in bound channels!
    }

    // 4. Check Bot Mention (@Bot or @Character)
    const botMention = `<@${this.client?.user?.id}>`;
    const botMentionNick = `<@!${this.client?.user?.id}>`;

    if (!targetChar) {
      if (content.startsWith(botMention) || content.startsWith(botMentionNick)) {
        cleanUserMessage = content.replace(botMention, '').replace(botMentionNick, '').trim();
        targetChar = characters.find(c => c.id === config.default_character_id) || characters[0];
        shouldDeleteTrigger = false; // NEVER delete message when mentioning!
      } else if (message.channel.isDMBased?.() && config.allow_dm) {
        targetChar = characters.find(c => c.id === config.default_character_id) || characters[0];
        shouldDeleteTrigger = false;
      }
    }

    if (!targetChar) return;
    if (!cleanUserMessage) cleanUserMessage = '*looks over attentively*';

    // Delete trigger message ONLY if explicitly a Tupperbox prefix proxy
    if (shouldDeleteTrigger && message.guild && message.deletable) {
      try {
        await message.delete();
      } catch (e) {}
    }

    // Resolve user's preferred persona nickname
    const rawDiscordName = message.member?.displayName || message.author.globalName || message.author.username;
    const userName = ContextManager.getUserPreferredName(userId, rawDiscordName);

    logger.info('DISCORD', `[${targetChar.name}] answering ${userName} (${userId}) in #${message.channel?.name || 'DM'}`);

    if (config.typing_indicator && message.channel?.sendTyping) {
      try {
        await message.channel.sendTyping();
      } catch (e) {}
    }

    // Isolate context per User + Channel + Character so conversations don't bleed between users!
    const contextKey = `${channelId}_${userId}_${targetChar.id}`;
    const history = this.loadDiscordHistory(contextKey);

    history.push({ role: 'user', content: cleanUserMessage });

    try {
      const response = await llmService.generate({
        character: targetChar,
        userPersonaName: userName,
        discordUserId: userId,
        history,
        priority: 3
      });

      const replyText = response.cleanText || response.text || '*nods warmly*';
      const avatarToUse = response.expressionAvatar || targetChar.avatar_url;

      history.push({ role: 'assistant', content: replyText });
      this.saveDiscordHistory(contextKey, channelId, userId, targetChar.id, history.slice(-20));

      await this.deliverCharacterResponse(message.channel, targetChar, replyText, message, avatarToUse);

      // Async Memory formation if Character Mind is enabled
      if (targetChar.context_config?.enable_memory !== false) {
        this.extractAndSaveMemoryAsync(targetChar.id, userId, userName, cleanUserMessage, replyText);
      }
    } catch (err: any) {
      logger.error('DISCORD', `Failed response for ${targetChar.name}: ${err.message}`);
    }
  }

  private async handleSlashCommand(interaction: any) {
    const { commandName } = interaction;

    if (commandName === 'status') {
      const charCount = this.getAllCharacters().length;
      await interaction.reply({
        content: `🟢 **RP-Man Status**: Online\n🏰 Loaded Characters: **${charCount}**\n⚡ Bot Latency: **${this.client?.ws.ping || 0}ms**`,
        ephemeral: true
      });
      return;
    }

    if (commandName === 'characters') {
      const characters = this.getAllCharacters();
      const list = characters.map(c => {
        const bound = (c.discord_config?.bound_channels || []).length > 0
          ? ` (Bound to ${c.discord_config.bound_channels.length} channel(s))`
          : '';
        return `• **${c.name}** — Trigger: \`${c.discord_config?.trigger_prefix || '(none)'}\`${bound}`;
      }).join('\n');
      await interaction.reply({ content: `🎭 **Available RP Characters**:\n\n${list}` });
      return;
    }

    if (commandName === 'nickname') {
      const sub = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      if (sub === 'set') {
        const preferredName = interaction.options.getString('name', true).trim();
        this.setUserNickname(userId, preferredName);
        await interaction.reply({
          content: `✅ Your roleplay persona name is now set to **${preferredName}**! Characters will address you as **${preferredName}**.`,
          ephemeral: true
        });
        return;
      }

      if (sub === 'view') {
        const rawDiscordName = interaction.member?.displayName || interaction.user.username;
        const currentNick = ContextManager.getUserPreferredName(userId, rawDiscordName);
        await interaction.reply({
          content: `👤 Your current roleplay nickname is: **${currentNick}**`,
          ephemeral: true
        });
        return;
      }

      if (sub === 'clear') {
        db.prepare('DELETE FROM user_personas WHERE user_identifier = ?').run(userId);
        const serverName = interaction.member?.displayName || interaction.user.username;
        await interaction.reply({
          content: `🔄 Reset your nickname. Characters will now address you by your server name (**${serverName}**).`,
          ephemeral: true
        });
        return;
      }
    }

    if (commandName === 'reset') {
      const userId = interaction.user.id;
      const channelId = interaction.channelId;
      const charQuery = interaction.options.getString('character')?.toLowerCase().trim() || '';

      this.resetUserContext(channelId, userId, charQuery);
      await interaction.reply({
        content: `🧹 Reset your personal conversation context in this channel. Other users' conversations are untouched!`,
        ephemeral: true
      });
      return;
    }

    if (commandName === 'forgetme') {
      const userId = interaction.user.id;
      const charQuery = interaction.options.getString('character')?.toLowerCase().trim() || '';

      if (charQuery) {
        const characters = this.getAllCharacters();
        const matched = characters.find(c => c.name.toLowerCase().includes(charQuery) || c.id === charQuery);
        if (matched) {
          db.prepare('DELETE FROM character_memories WHERE character_id = ? AND user_identifier = ?').run(matched.id, userId);
          db.prepare('DELETE FROM discord_chat_contexts WHERE discord_user_id = ? AND character_id = ?').run(userId, matched.id);
          await interaction.reply({
            content: `🧠 **${matched.name}** has forgotten all stored memories and history about you!`,
            ephemeral: true
          });
          return;
        }
      }

      db.prepare('DELETE FROM character_memories WHERE user_identifier = ?').run(userId);
      db.prepare('DELETE FROM discord_chat_contexts WHERE discord_user_id = ?').run(userId);
      await interaction.reply({
        content: `🧠 All characters have wiped their stored memory notes and conversation histories about you!`,
        ephemeral: true
      });
      return;
    }

    if (commandName === 'convo') {
      await interaction.deferReply();
      const char1Query = interaction.options.getString('character1', true).toLowerCase();
      const char2Query = interaction.options.getString('character2', true).toLowerCase();
      const topic = interaction.options.getString('topic') || 'A curious encounter and philosophical debate';
      const turnCount = Math.min(4, Math.max(1, interaction.options.getInteger('turns') || 2));

      const characters = this.getAllCharacters();
      const char1 = characters.find(c => c.name.toLowerCase().includes(char1Query) || c.id.toLowerCase().includes(char1Query));
      const char2 = characters.find(c => c.name.toLowerCase().includes(char2Query) || c.id.toLowerCase().includes(char2Query));

      if (!char1 || !char2) {
        await interaction.editReply('Could not find one or both characters. Check character names.');
        return;
      }

      await interaction.editReply(`🎬 **Starting Roleplay Conversation** between **${char1.name}** and **${char2.name}**...\n*Topic: ${topic}*`);

      // Run turn conversation
      let dialogHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'user', content: `[Scenario]: ${topic}\nBegin the roleplay with ${char2.name}.` }
      ];

      for (let t = 0; t < turnCount; t++) {
        // Char 1 Turn
        const res1 = await llmService.generate({
          character: char1,
          userPersonaName: char2.name,
          history: dialogHistory,
          priority: 2
        });
        const text1 = res1.cleanText || res1.text;
        dialogHistory.push({ role: 'assistant', content: `${char1.name}: ${text1}` });
        await this.deliverCharacterResponse(interaction.channel, char1, text1, undefined, res1.expressionAvatar);

        // Char 2 Turn
        const res2 = await llmService.generate({
          character: char2,
          userPersonaName: char1.name,
          history: dialogHistory.map(m => ({
            role: m.content.startsWith(`${char1.name}:`) ? 'user' : 'assistant',
            content: m.content.replace(`${char1.name}: `, '')
          })),
          priority: 2
        });
        const text2 = res2.cleanText || res2.text;
        dialogHistory.push({ role: 'assistant', content: `${char2.name}: ${text2}` });
        await this.deliverCharacterResponse(interaction.channel, char2, text2, undefined, res2.expressionAvatar);
      }
      return;
    }

    if (commandName === 'chat') {
      await interaction.deferReply();
      const charQuery = interaction.options.getString('character', true).toLowerCase();
      const userMessage = interaction.options.getString('message', true);

      const characters = this.getAllCharacters();
      const targetChar = characters.find(c =>
        c.name.toLowerCase().includes(charQuery) || c.id.toLowerCase().includes(charQuery)
      ) || characters[0];

      if (!targetChar) {
        await interaction.editReply('Character not found.');
        return;
      }

      const rawName = interaction.member?.displayName || interaction.user.username;
      const userName = ContextManager.getUserPreferredName(interaction.user.id, rawName);
      const contextKey = `${interaction.channelId}_${interaction.user.id}_${targetChar.id}`;
      const history = this.loadDiscordHistory(contextKey);

      history.push({ role: 'user', content: userMessage });

      try {
        const response = await llmService.generate({
          character: targetChar,
          userPersonaName: userName,
          discordUserId: interaction.user.id,
          history,
          priority: 2
        });

        const replyText = response.cleanText || response.text;
        history.push({ role: 'assistant', content: replyText });
        this.saveDiscordHistory(contextKey, interaction.channelId, interaction.user.id, targetChar.id, history.slice(-20));

        await interaction.editReply(`**${targetChar.name}**: ${replyText}`);

        if (targetChar.context_config?.enable_memory !== false) {
          this.extractAndSaveMemoryAsync(targetChar.id, interaction.user.id, userName, userMessage, replyText);
        }
      } catch (err: any) {
        await interaction.editReply(`⚠️ *[Error: ${err.message}]*`);
      }
    }
  }

  public setUserNickname(userId: string, preferredName: string) {
    const id = `persona_${userId}`;
    const now = new Date().toISOString();
    try {
      db.prepare(`
        INSERT INTO user_personas (id, user_identifier, preferred_name, notes, created_at, updated_at)
        VALUES (?, ?, ?, '', ?, ?)
        ON CONFLICT(user_identifier) DO UPDATE SET preferred_name = excluded.preferred_name, updated_at = excluded.updated_at
      `).run(id, userId, preferredName.trim(), now, now);
      logger.info('DISCORD', `Set preferred nickname for ${userId}: ${preferredName}`);
    } catch (e: any) {
      logger.error('DISCORD', `Failed to set nickname: ${e.message}`);
    }
  }

  public resetUserContext(channelId: string, userId: string, characterQuery?: string) {
    try {
      if (characterQuery) {
        const chars = this.getAllCharacters();
        const matched = chars.find(c => c.name.toLowerCase().includes(characterQuery) || c.id === characterQuery);
        if (matched) {
          const key = `${channelId}_${userId}_${matched.id}`;
          db.prepare('DELETE FROM discord_chat_contexts WHERE id = ?').run(key);
          return;
        }
      }
      db.prepare('DELETE FROM discord_chat_contexts WHERE channel_id = ? AND discord_user_id = ?').run(channelId, userId);
    } catch (e: any) {
      logger.error('DISCORD', `Failed to reset context: ${e.message}`);
    }
  }

  /**
   * Asynchronously saves key memory bits about the user
   */
  private async extractAndSaveMemoryAsync(
    characterId: string,
    userIdentifier: string,
    userDisplayName: string,
    userMessage: string,
    assistantReply: string
  ) {
    // Basic heuristic or key statement retention
    if (!userMessage || userMessage.length < 10) return;

    // Check if user stated a preference, name, item, or background fact
    const factMatch = userMessage.match(/\b(i am|i'm|my name is|i like|i love|i hate|i have|i brought|i work as|i live in)\b/i);
    if (!factMatch) return;

    try {
      // Keep only up to 15 memories per user/character
      const count = (db.prepare('SELECT COUNT(*) as c FROM character_memories WHERE character_id = ? AND user_identifier = ?').get(characterId, userIdentifier) as any).c;
      if (count >= 15) {
        // Delete oldest memory
        db.prepare(`
          DELETE FROM character_memories 
          WHERE id IN (
            SELECT id FROM character_memories 
            WHERE character_id = ? AND user_identifier = ? 
            ORDER BY created_at ASC LIMIT 1
          )
        `).run(characterId, userIdentifier);
      }

      const id = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const now = new Date().toISOString();
      const memorySnippet = `${userDisplayName}: "${userMessage.substring(0, 140)}"`;

      db.prepare(`
        INSERT INTO character_memories (id, character_id, user_identifier, user_display_name, memory_text, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'fact', ?, ?)
      `).run(id, characterId, userIdentifier, userDisplayName, memorySnippet, now, now);

      logger.info('LLM', `Recalled memory saved for [${characterId}] about ${userDisplayName}: ${memorySnippet}`);
    } catch (e) {}
  }

  private resolvePublicAvatarUrl(rawAvatar?: string): string | undefined {
    if (!rawAvatar || !rawAvatar.trim()) return undefined;
    const trimmed = rawAvatar.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    try {
      const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as any;
      if (row) {
        const parsed = JSON.parse(row.config);
        const publicBase = (parsed.public_asset_url || '').trim().replace(/\/+$/, '');
        if (publicBase) {
          const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
          return `${publicBase}${cleanPath}`;
        }
      }
    } catch (e) {}

    return undefined;
  }

  private async deliverCharacterResponse(
    channel: any,
    character: Character,
    responseText: string,
    originalMessage?: any,
    customAvatarUrl?: string
  ) {
    const config = this.getConfig();
    const chunks = this.splitMessage(responseText, config.max_response_length || 1900);
    const rawAvatar = customAvatarUrl || character.avatar_url;
    const publicAvatar = this.resolvePublicAvatarUrl(rawAvatar);

    if (character.discord_config?.webhook_url) {
      for (const chunk of chunks) {
        await this.sendViaDirectWebhook(character.discord_config.webhook_url, character.name, publicAvatar || '', chunk);
      }
      return;
    }

    if (channel && (channel instanceof TextChannel || channel instanceof NewsChannel || channel instanceof ThreadChannel)) {
      try {
        const webhook = await this.getOrCreateChannelWebhook(channel);
        if (webhook) {
          for (const chunk of chunks) {
            await webhook.send({
              content: chunk,
              username: character.name,
              avatarURL: publicAvatar,
              threadId: channel.isThread() ? channel.id : undefined
            });
          }
          return;
        }
      } catch (e: any) {
        logger.warn('DISCORD', `Webhook send failed: ${e.message}`);
      }
    }

    for (const chunk of chunks) {
      if (originalMessage?.reply) {
        await originalMessage.reply({ content: `**${character.name}**: ${chunk}` });
      } else if (channel?.send) {
        await channel.send({ content: `**${character.name}**: ${chunk}` });
      }
    }
  }

  private async getOrCreateChannelWebhook(channel: TextChannel | NewsChannel | ThreadChannel): Promise<Webhook | null> {
    const targetChannel = channel.isThread() ? (channel.parent as TextChannel) : channel;
    if (!targetChannel?.fetchWebhooks) return null;

    const channelId = targetChannel.id;
    if (this.webhookCache.has(channelId)) {
      return this.webhookCache.get(channelId)!;
    }

    try {
      const webhooks = await targetChannel.fetchWebhooks();
      let hook = webhooks.find(w => w.owner?.id === this.client?.user?.id && Boolean(w.token));

      if (!hook) {
        hook = await targetChannel.createWebhook({
          name: 'RP-Man Proxy',
          reason: 'RP Character Manager message impersonation'
        });
      }

      if (hook) {
        this.webhookCache.set(channelId, hook);
        return hook;
      }
    } catch (e: any) {
      logger.warn('DISCORD', `Failed to obtain webhook in #${channel.name}: ${e.message}`);
    }

    return null;
  }

  public async sendViaDirectWebhook(webhookUrl: string, username: string, avatarUrl: string, content: string): Promise<boolean> {
    try {
      const publicAvatar = this.resolvePublicAvatarUrl(avatarUrl);
      await axios.post(webhookUrl, {
        content,
        username,
        avatar_url: publicAvatar || undefined
      });
      return true;
    } catch (e: any) {
      logger.error('DISCORD', `Direct Webhook failed: ${e.message}`);
      return false;
    }
  }

  private splitMessage(text: string, maxLength: number = 1900): string[] {
    if (!text || text.length <= maxLength) return [text || ''];
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      let splitIdx = remaining.lastIndexOf('\n', maxLength);
      if (splitIdx === -1 || splitIdx < maxLength * 0.5) splitIdx = remaining.lastIndexOf('. ', maxLength);
      if (splitIdx === -1 || splitIdx < maxLength * 0.5) splitIdx = remaining.lastIndexOf(' ', maxLength);
      if (splitIdx === -1) splitIdx = maxLength;

      chunks.push(remaining.substring(0, splitIdx).trim());
      remaining = remaining.substring(splitIdx).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
  }

  private getAllCharacters(): Character[] {
    try {
      const rows = db.prepare('SELECT * FROM characters').all() as any[];
      return rows.map(r => ({
        ...r,
        alternate_greetings: JSON.parse(r.alternate_greetings || '[]'),
        tags: JSON.parse(r.tags || '[]'),
        expressions: JSON.parse(r.expressions || '[]'),
        model_config: JSON.parse(r.model_config || '{}'),
        discord_config: JSON.parse(r.discord_config || '{}'),
        context_config: JSON.parse(r.context_config || '{}')
      }));
    } catch (e) {
      return [];
    }
  }

  private loadDiscordHistory(contextId: string): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    try {
      const row = db.prepare('SELECT history FROM discord_chat_contexts WHERE id = ?').get(contextId) as { history: string } | undefined;
      if (row && row.history) return JSON.parse(row.history);
    } catch (e) {}
    return [];
  }

  private saveDiscordHistory(contextId: string, channelId: string, userId: string, characterId: string, history: any[]) {
    try {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO discord_chat_contexts (id, channel_id, discord_user_id, character_id, history, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET history = excluded.history, updated_at = excluded.updated_at
      `).run(contextId, channelId, userId, characterId, JSON.stringify(history), now);
    } catch (e) {}
  }
}

export const discordService = new DiscordService();
