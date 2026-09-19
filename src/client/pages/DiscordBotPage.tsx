import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Square,
  RotateCcw,
  Send,
  CheckCircle2,
  AlertCircle,
  Key,
  Sliders,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Hash,
  Eye,
  EyeOff,
  Zap
} from 'lucide-react';
import { api } from '../api';
import { Character, DiscordBotConfig, DiscordStatus } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const DiscordBotPage: React.FC = () => {
  const [config, setConfig] = useState<Partial<DiscordBotConfig>>({
    enabled: false,
    token: '',
    default_character_id: '',
    allow_dm: true,
    typing_indicator: true,
    prefix: '!',
    rate_limit_per_user_sec: 2,
    max_response_length: 1900,
    split_long_messages: true,
    status_activity: 'RP Tavern | !help',
    status_type: 'PLAYING'
  });

  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showToken, setShowToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [botActionLoading, setBotActionLoading] = useState(false);

  // Webhook Tester State
  const [testWebhookUrl, setTestWebhookUrl] = useState('');
  const [testCharId, setTestCharId] = useState('');
  const [testMessage, setTestMessage] = useState('*smiles warmly* Greetings from the RP-Man Discord webhook integration!');
  const [testingWebhook, setTestingWebhook] = useState(false);

  const { success, error, info } = useToast();

  const loadData = async () => {
    try {
      const [cfgRes, statusRes, charRes] = await Promise.all([
        api.getDiscordConfig(),
        api.getDiscordStatus(),
        api.getCharacters()
      ]);

      setConfig(cfgRes.config);
      setStatus(statusRes.status);
      setCharacters(charRes.characters);
      if (charRes.characters.length > 0 && !testCharId) {
        setTestCharId(charRes.characters[0].id);
      }
    } catch (e: any) {
      error(`Failed to load Discord configuration: ${e.message}`);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const s = await api.getDiscordStatus();
        setStatus(s.status);
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const payload: Partial<DiscordBotConfig> = { ...config };
      if (tokenInput.trim()) {
        payload.token = tokenInput.trim();
      }

      const res = await api.updateDiscordConfig(payload);
      setConfig(res.config);
      setTokenInput('');
      success('Discord Bot configuration saved!');
    } catch (err: any) {
      error(`Failed to save config: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStartBot = async () => {
    setBotActionLoading(true);
    try {
      const res = await api.startDiscord();
      if (res.success) {
        success(res.message || 'Discord Bot connected!');
      } else {
        error(res.message || 'Failed to start Discord bot');
      }
      loadData();
    } catch (err: any) {
      error(err.message);
    } finally {
      setBotActionLoading(false);
    }
  };

  const handleStopBot = async () => {
    setBotActionLoading(true);
    try {
      await api.stopDiscord();
      info('Discord Bot stopped');
      loadData();
    } catch (err: any) {
      error(err.message);
    } finally {
      setBotActionLoading(false);
    }
  };

  const handleRestartBot = async () => {
    setBotActionLoading(true);
    try {
      const res = await api.restartDiscord();
      if (res.success) {
        success('Discord Bot restarted successfully');
      } else {
        error(res.message);
      }
      loadData();
    } catch (err: any) {
      error(err.message);
    } finally {
      setBotActionLoading(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!testWebhookUrl.trim()) {
      error('Please provide a Discord Webhook URL');
      return;
    }

    setTestingWebhook(true);
    const selectedChar = characters.find(c => c.id === testCharId);
    try {
      const res = await api.testDiscordWebhook({
        webhook_url: testWebhookUrl.trim(),
        username: selectedChar?.name || 'RP-Man Bot',
        avatar_url: selectedChar?.avatar_url || '',
        message: testMessage
      });

      if (res.success) {
        success('Test message delivered to Discord channel!');
      } else {
        error('Webhook delivery failed');
      }
    } catch (err: any) {
      error(err.message || 'Webhook failed');
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-indigo-400" />
            <span>Discord Bot & Tupperbox Webhook Hoster</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Host RP characters on Discord with Tupperbox-style proxying, custom avatars, channel bindings, and slash commands.
          </p>
        </div>

        {/* Live Controls */}
        <div className="flex items-center gap-2.5">
          {status?.connected ? (
            <>
              <button
                onClick={handleRestartBot}
                disabled={botActionLoading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all active:scale-95 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Restart</span>
              </button>

              <button
                onClick={handleStopBot}
                disabled={botActionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/40 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400" />
                <span>Stop Bot</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleStartBot}
              disabled={botActionLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{botActionLoading ? 'Connecting...' : 'Connect Bot'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Gateway Status HUD Card */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
          Live Gateway Status
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase">Connection</span>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`w-3 h-3 rounded-full ${status?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-base font-bold text-zinc-100 capitalize">
                {status?.status || 'Offline'}
              </span>
            </div>
          </div>

          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase">Bot Identity</span>
            <p className="text-sm font-bold text-zinc-200 mt-1.5 truncate">
              {status?.bot_user?.username ? `${status.bot_user.username}` : 'Not connected'}
            </p>
          </div>

          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase">Connected Guilds</span>
            <p className="text-xl font-bold font-mono text-indigo-300 mt-1">
              {status?.bot_user?.guilds_count || 0} Servers
            </p>
          </div>

          <div className="p-4 bg-zinc-900/60 rounded-xl border border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase">Gateway Latency</span>
            <p className="text-xl font-bold font-mono text-emerald-300 mt-1">
              {status?.latency ? `${status.latency} ms` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Bot Configuration Form */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-brand-400" />
              <span>Bot Credentials & Behavior</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Enter your Discord Bot Application Token from the Discord Developer Portal.
            </p>
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="space-y-4">
          {/* Bot Token */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Discord Bot Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder={config.has_token ? `Stored: ${config.masked_token}` : 'Paste your Bot Token here...'}
                className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-200"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Default Character */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Default Fallback Character
              </label>
              <select
                value={config.default_character_id || ''}
                onChange={e => setConfig(prev => ({ ...prev, default_character_id: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              >
                <option value="">(Select Default Character for @Bot mentions)</option>
                {characters.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Activity */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Discord Activity Status Text
              </label>
              <input
                type="text"
                value={config.status_activity || ''}
                onChange={e => setConfig(prev => ({ ...prev, status_activity: e.target.value }))}
                placeholder="e.g. RP Tavern | !help"
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Options Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={config.typing_indicator ?? true}
                onChange={e => setConfig(prev => ({ ...prev, typing_indicator: e.target.checked }))}
                className="rounded accent-brand-500"
              />
              <span className="text-xs font-medium text-zinc-300">Show Typing Indicator</span>
            </label>

            <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={config.allow_dm ?? true}
                onChange={e => setConfig(prev => ({ ...prev, allow_dm: e.target.checked }))}
                className="rounded accent-brand-500"
              />
              <span className="text-xs font-medium text-zinc-300">Allow Direct Messages (DMs)</span>
            </label>

            <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={config.split_long_messages ?? true}
                onChange={e => setConfig(prev => ({ ...prev, split_long_messages: e.target.checked }))}
                className="rounded accent-brand-500"
              />
              <span className="text-xs font-medium text-zinc-300">Split Long Messages (2000 char cap)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Character Discord Routing Table */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <h2 className="text-base font-bold text-white mb-1">
          Registered Character Discord Triggers
        </h2>
        <p className="text-xs text-zinc-400 mb-4">
          Type any character's trigger prefix in your Discord server to talk as them via Webhook proxying.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/70 text-zinc-400 font-semibold uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="p-3">Character</th>
                <th className="p-3">Trigger Prefix</th>
                <th className="p-3">Tupperbox Mode</th>
                <th className="p-3">Dedicated Channels</th>
                <th className="p-3 text-right">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {characters.map(char => (
                <tr key={char.id} className="hover:bg-zinc-900/30">
                  <td className="p-3 font-semibold text-zinc-100 flex items-center gap-2">
                    <img
                      src={char.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                      alt={char.name}
                      className="w-6 h-6 rounded-md object-cover"
                    />
                    <span>{char.name}</span>
                  </td>
                  <td className="p-3 font-mono font-bold text-indigo-300">
                    {char.discord_config?.trigger_prefix || '(None)'}
                  </td>
                  <td className="p-3">
                    {char.discord_config?.tupperbox_proxy ? (
                      <span className="text-emerald-400 font-medium">Enabled (Proxied)</span>
                    ) : (
                      <span className="text-zinc-500">Disabled</span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-400 font-mono">
                    {char.discord_config?.channel_ids?.length
                      ? `${char.discord_config.channel_ids.length} channel(s)`
                      : 'All channels'}
                  </td>
                  <td className="p-3 text-right font-mono text-zinc-400">
                    {char.model_config?.model || 'Server Default'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Direct Webhook Dispatcher / Tester */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-400" />
            <span>Direct Webhook Dispatcher / Tester</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Send a custom message directly to a Discord channel webhook to verify webhook permissions and avatar display.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Discord Webhook URL
            </label>
            <input
              type="text"
              value={testWebhookUrl}
              onChange={e => setTestWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/123456789/..."
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Sender Character
            </label>
            <select
              value={testCharId}
              onChange={e => setTestCharId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
            >
              {characters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
            Test Message Content
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              placeholder="Message to post to Discord..."
              className="flex-1 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={handleTestWebhook}
              disabled={testingWebhook}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-glow-emerald transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testingWebhook ? 'Sending...' : 'Send Test'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
