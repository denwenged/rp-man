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
import { db } from '../db';
import { logger } from './loggerService';
import { llmService } from './llmService';
import { Character, DiscordBotConfig, DiscordStatus } from '../../shared/types';

class DiscordService {
  private client: Client | null = null;
  private isConnecting: boolean = false;
  private webhookCache: Map<string, Webhook> = new Map(); // channelId -> Webhook
  private lastUserMessageTime: Map<string, number> = new Map(); // Rate limiting per Discord user

  constructor() {
    // Attempt auto-start if enabled in settings
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
      if (row) {
        return JSON.parse(row.config);
      }
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
    if (this.isConnecting) {
      return { connected: false, status: 'connecting' };
    }

    if (!this.client || !this.client.isReady()) {
      return { connected: false, status: 'offline' };
    }

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
    if (!config.token) {
      return { success: false, message: 'Discord Bot Token is not set.' };
    }

    if (this.client && this.client.isReady()) {
      return { success: true, message: 'Discord Bot is already running.' };
    }

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

      // Register Slash Commands
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

        this.client.user.setActivity(config.status_activity || 'RP Tavern', { type: actType });
      }
    });

    this.client.on('messageCreate', async (message) => {
      // Ignore bot messages (including our own webhooks)
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

    this.client.on('error', (err) => {
      logger.error('DISCORD', `Client error: ${err.message}`);
    });
  }

  /**
   * Register Discord Slash Commands
   */
  private async registerSlashCommands() {
    if (!this.client || !this.client.user) return;
    const config = this.getConfig();
    const rest = new REST({ version: '10' }).setToken(config.token);

    const commands = [
      new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Roleplay with an AI character')
        .addStringOption(option =>
          option.setName('character')
            .setDescription('Name or ID of the character')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('message')
            .setDescription('Your message / action to the character')
            .setRequired(true)
        ),
      new SlashCommandBuilder()
        .setName('characters')
        .setDescription('List all available RP characters and their trigger prefixes'),
      new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset the context memory for this channel or a character')
        .addStringOption(option =>
          option.setName('character')
            .setDescription('Optional specific character')
            .setRequired(false)
        ),
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
      logger.warn('DISCORD', `Could not register slash commands (check bot scopes): ${e.message}`);
    }
  }

  /**
   * Handle incoming message from Discord text channels or DMs
   */
  private async handleIncomingMessage(message: any) {
    const config = this.getConfig();
    const content = message.content?.trim() || '';
    if (!content) return;

    // 1. Check rate limits per user
    const userId = message.author.id;
    const now = Date.now();
    const lastTime = this.lastUserMessageTime.get(userId) || 0;
    const cooldownMs = (config.rate_limit_per_user_sec || 2) * 1000;
    if (now - lastTime < cooldownMs) {
      return; // Silently ignore spam
    }
    this.lastUserMessageTime.set(userId, now);

    // 2. Fetch all active characters from database
    const characters = this.getAllCharacters();
    if (characters.length === 0) return;

    let targetChar: Character | null = null;
    let cleanUserMessage = content;
    let shouldProxyTupper = false;

    // Check Trigger Prefixes (e.g., "aria: hello", "[Luffy] Hey!")
    for (const char of characters) {
      const prefix = char.discord_config?.trigger_prefix?.trim().toLowerCase();
      const suffix = char.discord_config?.trigger_suffix?.trim().toLowerCase();

      if (prefix && content.toLowerCase().startsWith(prefix)) {
        targetChar = char;
        cleanUserMessage = content.slice(prefix.length).trim();
        shouldProxyTupper = Boolean(char.discord_config?.tupperbox_proxy);
        break;
      }

      if (suffix && content.toLowerCase().endsWith(suffix)) {
        targetChar = char;
        cleanUserMessage = content.slice(0, -suffix.length).trim();
        shouldProxyTupper = Boolean(char.discord_config?.tupperbox_proxy);
        break;
      }

      // Check Channel ID mapping
      if (char.discord_config?.channel_ids && char.discord_config.channel_ids.includes(message.channelId)) {
        targetChar = char;
        break;
      }
    }

    // Check Bot Mention or Direct Message
    const botMention = `<@${this.client?.user?.id}>`;
    const botMentionNick = `<@!${this.client?.user?.id}>`;

    if (!targetChar) {
      if (content.startsWith(botMention) || content.startsWith(botMentionNick)) {
        cleanUserMessage = content.replace(botMention, '').replace(botMentionNick, '').trim();
        // Use default character or first character
        targetChar = characters.find(c => c.id === config.default_character_id) || characters[0];
      } else if (message.channel.isDMBased?.() && config.allow_dm) {
        targetChar = characters.find(c => c.id === config.default_character_id) || characters[0];
      }
    }

    if (!targetChar) {
      // No character matched this message
      return;
    }

    if (!cleanUserMessage) {
      cleanUserMessage = '*looks at you curiously*';
    }

    // 3. Tupperbox proxy behavior: Delete original message if requested & permitted
    if (shouldProxyTupper && message.guild && message.deletable) {
      try {
        await message.delete();
      } catch (e) {}
    }

    const userName = message.member?.displayName || message.author.username;
    const channelId = message.channelId;

    logger.info('DISCORD', `Triggered [${targetChar.name}] in channel #${message.channel?.name || 'DM'} by ${userName}: "${cleanUserMessage}"`);

    // 4. Send typing indicator
    if (config.typing_indicator && message.channel?.sendTyping) {
      try {
        await message.channel.sendTyping();
      } catch (e) {}
    }

    // 5. Load or update Discord Chat Context for this channel
    const contextKey = `${channelId}_${targetChar.id}`;
    const history = this.loadDiscordHistory(contextKey);

    history.push({
      role: 'user',
      content: cleanUserMessage
    });

    try {
      const response = await llmService.generate({
        character: targetChar,
        userPersonaName: userName,
        history,
        priority: 3
      });

      const replyText = response.text || '*smiles warmly at you*';

      // Save assistant response to context history
      history.push({
        role: 'assistant',
        content: replyText
      });

      // Keep recent 20 messages in context
      this.saveDiscordHistory(contextKey, channelId, userId, targetChar.id, history.slice(-20));

      // 6. Send response via Webhook (for custom avatar & name) or Channel Send
      await this.deliverCharacterResponse(message.channel, targetChar, replyText, message);
    } catch (err: any) {
      logger.error('DISCORD', `Failed to generate response for ${targetChar.name}: ${err.message}`);
      try {
        await message.reply({ content: `⚠️ *[${targetChar.name} seems momentarily distracted: ${err.message}]*` });
      } catch (e) {}
    }
  }

  /**
   * Handle Slash Commands
   */
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
      if (characters.length === 0) {
        await interaction.reply({ content: 'No characters configured yet in the RP-Man web dashboard.', ephemeral: true });
        return;
      }

      const list = characters.map(c => {
        const prefix = c.discord_config?.trigger_prefix || '(none)';
        return `• **${c.name}** — Trigger: \`${prefix}\` | *${c.tagline || 'AI Companion'}*`;
      }).join('\n');

      await interaction.reply({
        content: `🎭 **Available RP Characters**:\n\n${list}\n\n*Type with their prefix (e.g. \`aria: hello\`) to chat!*`
      });
      return;
    }

    if (commandName === 'reset') {
      const charArg = interaction.options.getString('character')?.toLowerCase();
      const channelId = interaction.channelId;

      try {
        if (charArg) {
          db.prepare('DELETE FROM discord_chat_contexts WHERE channel_id = ? AND character_id LIKE ?').run(channelId, `%${charArg}%`);
        } else {
          db.prepare('DELETE FROM discord_chat_contexts WHERE channel_id = ?').run(channelId);
        }
        await interaction.reply({ content: `🧹 Context memory for this channel has been reset!`, ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: `Failed to reset: ${e.message}`, ephemeral: true });
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

      const userName = interaction.member?.displayName || interaction.user.username;
      const contextKey = `${interaction.channelId}_${targetChar.id}`;
      const history = this.loadDiscordHistory(contextKey);

      history.push({ role: 'user', content: userMessage });

      try {
        const response = await llmService.generate({
          character: targetChar,
          userPersonaName: userName,
          history,
          priority: 2
        });

        history.push({ role: 'assistant', content: response.text });
        this.saveDiscordHistory(contextKey, interaction.channelId, interaction.user.id, targetChar.id, history.slice(-20));

        await interaction.editReply(`**${targetChar.name}**: ${response.text}`);
      } catch (err: any) {
        await interaction.editReply(`⚠️ *[Error: ${err.message}]*`);
      }
    }
  }

  /**
   * Deliver Character Response using Webhook or standard Message
   */
  private async deliverCharacterResponse(channel: any, character: Character, responseText: string, originalMessage?: any) {
    const config = this.getConfig();
    const chunks = this.splitMessage(responseText, config.max_response_length || 1900);

    // 1. Direct custom webhook configured on character
    if (character.discord_config?.webhook_url) {
      for (const chunk of chunks) {
        await this.sendViaDirectWebhook(character.discord_config.webhook_url, character.name, character.avatar_url, chunk);
      }
      return;
    }

    // 2. Dynamic Guild Webhook (impersonates character avatar and name)
    if (channel && (channel instanceof TextChannel || channel instanceof NewsChannel || channel instanceof ThreadChannel)) {
      try {
        const webhook = await this.getOrCreateChannelWebhook(channel);
        if (webhook) {
          for (const chunk of chunks) {
            await webhook.send({
              content: chunk,
              username: character.name,
              avatarURL: character.avatar_url || undefined,
              threadId: channel.isThread() ? channel.id : undefined
            });
          }
          return;
        }
      } catch (e: any) {
        logger.warn('DISCORD', `Webhook send failed, falling back to bot message: ${e.message}`);
      }
    }

    // 3. Fallback: Send message as Bot
    for (const chunk of chunks) {
      if (originalMessage?.reply) {
        await originalMessage.reply({ content: `**${character.name}**: ${chunk}` });
      } else if (channel?.send) {
        await channel.send({ content: `**${character.name}**: ${chunk}` });
      }
    }
  }

  /**
   * Get or create a reusable Discord Webhook for this channel
   */
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

  /**
   * Send to an external Discord Webhook URL
   */
  public async sendViaDirectWebhook(webhookUrl: string, username: string, avatarUrl: string, content: string): Promise<boolean> {
    try {
      await axios.post(webhookUrl, {
        content,
        username,
        avatar_url: avatarUrl || undefined
      });
      return true;
    } catch (e: any) {
      logger.error('DISCORD', `Direct Webhook failed: ${e.message}`);
      return false;
    }
  }

  /**
   * Helper: Split messages to comply with Discord 2000 character limit
   */
  private splitMessage(text: string, maxLength: number = 1900): string[] {
    if (!text || text.length <= maxLength) return [text || ''];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // Find clean break point (newline or sentence end)
      let splitIdx = remaining.lastIndexOf('\n', maxLength);
      if (splitIdx === -1 || splitIdx < maxLength * 0.5) {
        splitIdx = remaining.lastIndexOf('. ', maxLength);
      }
      if (splitIdx === -1 || splitIdx < maxLength * 0.5) {
        splitIdx = remaining.lastIndexOf(' ', maxLength);
      }
      if (splitIdx === -1) {
        splitIdx = maxLength;
      }

      chunks.push(remaining.substring(0, splitIdx).trim());
      remaining = remaining.substring(splitIdx).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  private getAllCharacters(): Character[] {
    try {
      const rows = db.prepare('SELECT * FROM characters').all() as any[];
      return rows.map(r => ({
        ...r,
        alternate_greetings: JSON.parse(r.alternate_greetings || '[]'),
        tags: JSON.parse(r.tags || '[]'),
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
      if (row && row.history) {
        return JSON.parse(row.history);
      }
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
    } catch (e) {
      logger.error('DISCORD', 'Failed to save discord context', e);
    }
  }
}

export const discordService = new DiscordService();
