import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  HardDrive,
  Cpu,
  Download,
  Upload,
  Save,
  ShieldCheck,
  Zap,
  Server,
  Lock,
  RotateCcw
} from 'lucide-react';
import { api } from '../api';
import { ServerSettings } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const ServerSettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<ServerSettings>({
    default_llm_provider: 'ollama',
    default_llm_model: 'llama3.2:3b',
    ollama_host: 'http://127.0.0.1:11434',
    ollama_default_keep_alive: '5m',
    max_concurrent_llm_requests: 1,
    llm_timeout_seconds: 90,
    default_context_tokens: 4096,
    max_context_tokens_hard_cap: 8192,
    enable_auto_summarize: true,
    public_asset_url: '',
    weak_model_reinforce: true,
    log_retention_days: 7,
    app_name: 'RP-Man',
    app_theme: 'matte-dark'
  });

  const [passwordInput, setPasswordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const { success, error, info } = useToast();
  const { refreshUser } = useAuth();

  const loadSettings = async () => {
    try {
      const res = await api.getServerSettings();
      setSettings(res.settings);
    } catch (e: any) {
      error(`Failed to load settings: ${e.message}`);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const res = await api.updateServerSettings(settings);
      setSettings(res.settings);
      success('Server configuration updated successfully!');
    } catch (err: any) {
      error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordInput.trim()) return;
    try {
      await api.updateProfile({ password: passwordInput.trim() });
      success('Your password has been changed successfully.');
      setPasswordInput('');
      refreshUser();
    } catch (err: any) {
      error(`Failed to update password: ${err.message}`);
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api.restoreBackup(data);
      success('Database restored successfully!');
      loadSettings();
    } catch (err: any) {
      error(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(false);
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-brand-400" />
            <span>Server Configuration & RAM Tuning</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Optimize resource limits, context memory caps, Ollama timeouts, and database backups for ZimaOS.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Low-Power Server & Concurrency Guard Settings */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-5">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>CPU & RAM Concurrency Guard</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Max Concurrent Requests */}
          <div>
            <div className="flex justify-between text-xs text-zinc-300 mb-1.5 font-semibold uppercase tracking-wider">
              <span>Max Concurrent LLM Requests</span>
              <span className="font-mono text-emerald-400 font-bold">
                {settings.max_concurrent_llm_requests} Request(s)
              </span>
            </div>
            <select
              value={settings.max_concurrent_llm_requests}
              onChange={e => setSettings(prev => ({ ...prev, max_concurrent_llm_requests: parseInt(e.target.value) }))}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
            >
              <option value="1">1 (Strict Queue - Best for Low Power ZimaOS / Celeron / N100)</option>
              <option value="2">2 (Balanced)</option>
              <option value="3">3 (Dedicated Multi-core CPU / GPU)</option>
              <option value="4">4 (High-end Server)</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              Limits parallel model inferences. Additional messages are queued safely to prevent CPU freezing.
            </p>
          </div>

          {/* LLM Timeout */}
          <div>
            <div className="flex justify-between text-xs text-zinc-300 mb-1.5 font-semibold uppercase tracking-wider">
              <span>Generation Timeout</span>
              <span className="font-mono text-amber-400 font-bold">
                {settings.llm_timeout_seconds}s
              </span>
            </div>
            <input
              type="number"
              min="30"
              max="300"
              value={settings.llm_timeout_seconds}
              onChange={e => setSettings(prev => ({ ...prev, llm_timeout_seconds: parseInt(e.target.value) }))}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-mono"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Automatically aborts stalled model generations if a response takes too long.
            </p>
          </div>

          {/* Ollama Host URL */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Ollama Host Endpoint URL
            </label>
            <input
              type="text"
              value={settings.ollama_host}
              onChange={e => setSettings(prev => ({ ...prev, ollama_host: e.target.value }))}
              placeholder="http://127.0.0.1:11434"
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Use <code className="text-zinc-300">http://127.0.0.1:11434</code> or <code className="text-zinc-300">http://host.docker.internal:11434</code>.
            </p>
          </div>

          {/* Ollama Default Keep-Alive */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Ollama Default RAM Keep-Alive
            </label>
            <select
              value={settings.ollama_default_keep_alive}
              onChange={e => setSettings(prev => ({ ...prev, ollama_default_keep_alive: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
            >
              <option value="0">0 (Unload immediately after response - Minimum RAM)</option>
              <option value="1m">1m (Keep in memory 1 minute)</option>
              <option value="5m">5m (Standard recommended)</option>
              <option value="15m">15m (Fast multi-turn roleplay)</option>
              <option value="-1">-1 (Stay loaded in VRAM forever)</option>
            </select>
          </div>

          {/* Public Asset & Webhook Host URL */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Public Asset Base URL / External Server URL
            </label>
            <input
              type="text"
              value={settings.public_asset_url || ''}
              onChange={e => setSettings(prev => ({ ...prev, public_asset_url: e.target.value }))}
              placeholder="e.g. http://192.168.1.50:3000 or https://rp.mydomain.com"
              className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Used to deliver uploaded character images, expressions, and avatars to Discord Webhooks and external clients. Set this to your ZimaOS local IP or public domain.
            </p>
          </div>

          {/* Weak Model Rule Reinforcement Toggle */}
          <div className="md:col-span-2 p-4 bg-zinc-900/60 rounded-xl border border-zinc-800 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-zinc-200 block uppercase tracking-wider">
                Weak & Small Model Rule Reinforcement (Recency Anchor)
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Automatically reinforces roleplay instructions at the end of conversation turns to prevent 1B–8B models (Llama 3.2 1B/3B, Qwen 2.5, Mistral) from losing character personality or speaking for the user.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.weak_model_reinforce !== false}
              onChange={e => setSettings(prev => ({ ...prev, weak_model_reinforce: e.target.checked }))}
              className="w-5 h-5 accent-brand-500 cursor-pointer shrink-0"
            />
          </div>
        </div>
      </div>

      {/* Database Backup & Restore */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-brand-400" />
            <span>Database Backup & Disaster Recovery</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Export all characters, lorebooks, Discord settings, and providers to a single portable JSON file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href="/api/system/backup"
            download
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 rounded-xl text-xs font-semibold border border-zinc-700/80 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 text-brand-400" />
            <span>Download Database Backup (JSON)</span>
          </a>

          <input
            type="file"
            ref={backupInputRef}
            onChange={handleRestoreBackup}
            accept=".json"
            className="hidden"
          />

          <button
            onClick={() => backupInputRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 rounded-xl text-xs font-semibold border border-zinc-700/80 transition-all active:scale-95 disabled:opacity-50"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{restoring ? 'Restoring Database...' : 'Restore Backup from File'}</span>
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Security & Password Update</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Update your administrator credentials for this session.
          </p>
        </div>

        <div className="max-w-md space-y-3">
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            placeholder="Enter new password (min 4 characters)..."
            className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
          />

          <button
            onClick={handleUpdatePassword}
            disabled={!passwordInput.trim()}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
};
