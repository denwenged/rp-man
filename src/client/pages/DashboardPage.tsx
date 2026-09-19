import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  MessageSquare,
  Bot,
  Server,
  Cpu,
  HardDrive,
  Trash2,
  Play,
  Square,
  Plus,
  ArrowRight,
  Sparkles,
  Zap,
  Activity,
  Layers,
  Clock,
  Terminal
} from 'lucide-react';
import { api } from '../api';
import { Character, DiscordStatus, SystemStats, LogEntry } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const DashboardPage: React.FC = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const { success, error, info } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [charsRes, statsRes, discordRes, logsRes] = await Promise.all([
        api.getCharacters(),
        api.getSystemStats(),
        api.getDiscordStatus(),
        api.getLogs({ limit: 6 })
      ]);

      setCharacters(charsRes.characters);
      setStats(statsRes.stats);
      setDiscordStatus(discordRes.status);
      setRecentLogs(logsRes.logs);
    } catch (e: any) {
      console.error('Error fetching dashboard data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleDiscord = async () => {
    setActionLoading(true);
    try {
      if (discordStatus?.connected) {
        await api.stopDiscord();
        info('Discord Bot stopped');
      } else {
        const res = await api.startDiscord();
        if (res.success) {
          success(res.message || 'Discord Bot connected!');
        } else {
          error(res.message || 'Failed to connect bot. Please check Bot Token in Discord settings.');
        }
      }
      loadData();
    } catch (err: any) {
      error(err.message || 'Failed to toggle Discord Bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFreeRam = async () => {
    setActionLoading(true);
    try {
      const res = await api.unloadAllOllamaModels();
      success(`Freed RAM: Unloaded ${res.unloaded} model(s) from memory`);
      loadData();
    } catch (err: any) {
      error(err.message || 'Failed to unload models');
    } finally {
      setActionLoading(false);
    }
  };

  const ramUsedGB = stats ? (stats.ram_used_bytes / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const ramTotalGB = stats ? (stats.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1) : '0';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Welcome & Quick Actions Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Control Panel Active</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            RP-Man Character Manager
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-xl">
            Host and proxy custom AI roleplay characters for Discord and Web with local Ollama acceleration.
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => navigate('/playground')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Live Chat</span>
          </button>

          <button
            onClick={handleToggleDiscord}
            disabled={actionLoading}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 disabled:opacity-50 ${
              discordStatus?.connected
                ? 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border-rose-500/40'
                : 'bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border-indigo-500/40 shadow-glow-violet'
            }`}
          >
            {discordStatus?.connected ? (
              <>
                <Square className="w-3.5 h-3.5 fill-rose-400" />
                <span>Stop Discord Bot</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-indigo-400" />
                <span>Start Discord Bot</span>
              </>
            )}
          </button>

          {stats && stats.ollama_running_models_count > 0 && (
            <button
              onClick={handleFreeRam}
              disabled={actionLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold border border-zinc-700/80 transition-all active:scale-95"
              title="Unloads models from memory to keep server RAM light"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Free RAM</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics & Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Load */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-matte flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">CPU Usage</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold font-mono text-zinc-100">{stats?.cpu_percent ?? 0}%</div>
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden mt-2 border border-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (stats?.cpu_percent ?? 0) > 80 ? 'bg-rose-500' : (stats?.cpu_percent ?? 0) > 50 ? 'bg-amber-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, stats?.cpu_percent ?? 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-matte flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">System RAM</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-bold font-mono text-zinc-100">{stats?.ram_percent ?? 0}%</div>
              <span className="text-xs font-mono text-zinc-400">{ramUsedGB} / {ramTotalGB} GB</span>
            </div>
            <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden mt-2 border border-zinc-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (stats?.ram_percent ?? 0) > 85 ? 'bg-rose-500' : (stats?.ram_percent ?? 0) > 65 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, stats?.ram_percent ?? 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Discord Bot Status */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-matte flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Discord Gateway</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
              discordStatus?.connected
                ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}>
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${discordStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-lg font-bold text-zinc-100 capitalize">
                {discordStatus?.status || 'Offline'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {discordStatus?.connected
                ? `${discordStatus.bot_user?.guilds_count || 0} Servers • ${discordStatus.latency || 0}ms Ping`
                : 'Bot token not active'}
            </p>
          </div>
        </div>

        {/* Ollama & Queue Guard */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-matte flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Ollama & Concurrency</span>
            <div className="w-8 h-8 rounded-xl bg-brand-950/40 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-zinc-100">
                {stats?.ollama_running_models_count ?? 0}
              </span>
              <span className="text-xs text-zinc-400">models in RAM</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400 mt-1.5 font-mono">
              <span>Active: {stats?.active_llm_requests ?? 0}</span>
              <span>Queue: {stats?.queue_length ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Characters Showcase & Live Discord Triggers */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              <span>Active RP Characters</span>
              <span className="text-xs font-normal text-zinc-400">({characters.length})</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Characters automatically respond to their prefix in Discord channels or in the Web Live Chat.
            </p>
          </div>
          <button
            onClick={() => navigate('/characters')}
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
          >
            <span>Manage All</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.slice(0, 3).map(char => {
            const prefix = char.discord_config?.trigger_prefix || 'none';
            return (
              <div
                key={char.id}
                className="group relative bg-zinc-900/60 hover:bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 transition-all duration-200 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <img
                      src={char.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                      alt={char.name}
                      className="w-12 h-12 rounded-xl object-cover bg-zinc-800 border border-zinc-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-zinc-100 group-hover:text-brand-300 transition-colors truncate">
                        {char.name}
                      </h3>
                      <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                        {char.tagline || char.description || 'AI Companion'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-mono font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                          Prefix: {prefix}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400 truncate max-w-[140px]">
                    {char.model_config?.model || 'Server Default'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => navigate(`/playground?character_id=${char.id}`)}
                      className="px-2.5 py-1 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-300 border border-brand-500/30 text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Chat</span>
                    </button>
                    <button
                      onClick={() => navigate(`/characters/${char.id}`)}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Logs Terminal Preview */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-zinc-400" />
            <h2 className="text-base font-bold text-white">Live System Activity</h2>
          </div>
          <button
            onClick={() => navigate('/logs')}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
          >
            Open Full Logs
          </button>
        </div>

        <div className="terminal-window rounded-xl p-4 text-xs font-mono space-y-2 overflow-x-auto">
          {recentLogs.length === 0 ? (
            <div className="text-zinc-500 italic">No recent log entries recorded yet.</div>
          ) : (
            recentLogs.map(log => (
              <div key={log.id} className="flex items-start gap-2.5 leading-relaxed">
                <span className="text-zinc-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase shrink-0 ${
                    log.category === 'DISCORD'
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                      : log.category === 'LLM'
                      ? 'bg-violet-950 text-violet-300 border border-violet-800'
                      : log.category === 'OLLAMA'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                  }`}
                >
                  {log.category}
                </span>
                <span
                  className={`break-words ${
                    log.level === 'error'
                      ? 'text-rose-400 font-semibold'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-zinc-300'
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
