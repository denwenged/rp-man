import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Zap,
  Globe,
  Lock,
  Sparkles
} from 'lucide-react';
import { api } from '../api';
import { LLMProvider } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const ProvidersPage: React.FC = () => {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Partial<LLMProvider> | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { success, error, info } = useToast();

  const loadProviders = async () => {
    try {
      const res = await api.getProviders();
      setProviders(res.providers);
    } catch (e: any) {
      error(`Failed to load providers: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const openAddModal = () => {
    setEditingProvider({
      name: '',
      type: 'openrouter',
      base_url: 'https://openrouter.ai/api/v1',
      default_model: '',
      enabled: true,
      is_default: false
    });
    setApiKeyInput('');
    setShowModal(true);
  };

  const openEditModal = (p: LLMProvider) => {
    setEditingProvider(p);
    setApiKeyInput('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editingProvider?.name || !editingProvider.base_url) {
      error('Name and Base URL are required');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ...editingProvider,
        api_key: apiKeyInput ? apiKeyInput.trim() : undefined
      };

      if (editingProvider.id) {
        await api.updateProvider(editingProvider.id, payload);
        success('Provider updated successfully!');
      } else {
        await api.createProvider(payload);
        success('Provider added successfully!');
      }

      setShowModal(false);
      loadProviders();
    } catch (err: any) {
      error(err.message || 'Failed to save provider');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete provider "${name}"?`)) return;
    try {
      await api.deleteProvider(id);
      success('Provider deleted');
      loadProviders();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await api.testProvider(id);
      if (res.success) {
        success(`Connection successful (${res.latency_ms}ms)`);
      } else {
        error(`Connection failed: ${res.error || 'Check API key or URL'}`);
      }
    } catch (err: any) {
      error(err.message);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-brand-400" />
            <span>LLM Providers & Cloud Endpoints</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Connect OpenAI, OpenRouter, Anthropic, or custom local OpenAI-compatible backends (LM Studio, vLLM).
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add Provider</span>
        </button>
      </div>

      {/* Provider List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {providers.map(p => (
          <div
            key={p.id}
            className="bg-zinc-950 hover:bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-5 shadow-matte flex flex-col justify-between transition-all"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-base text-zinc-100">{p.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] font-mono uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-semibold">
                      {p.type}
                    </span>
                    {p.is_default && (
                      <span className="text-[10px] font-semibold bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded border border-brand-500/30">
                        Default
                      </span>
                    )}
                  </div>
                </div>

                <span className={`w-2.5 h-2.5 rounded-full ${p.enabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Base URL</span>
                  <p className="font-mono text-zinc-300 truncate bg-zinc-900/60 p-2 rounded-lg border border-zinc-850 mt-0.5">
                    {p.base_url}
                  </p>
                </div>

                {p.default_model && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Default Model</span>
                    <p className="font-mono text-brand-300 font-semibold">{p.default_model}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
              <button
                onClick={() => handleTestConnection(p.id)}
                disabled={testingId === p.id}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-800 transition-colors flex items-center gap-1"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{testingId === p.id ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(p)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {showModal && editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-brand-400" />
              <span>{editingProvider.id ? 'Edit Provider' : 'Add New LLM Provider'}</span>
            </h3>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Provider Name
                </label>
                <input
                  type="text"
                  value={editingProvider.name || ''}
                  onChange={e => setEditingProvider(prev => ({ ...prev!, name: e.target.value }))}
                  placeholder="e.g. OpenRouter Cloud, My LM Studio"
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Provider Type
                </label>
                <select
                  value={editingProvider.type || 'openrouter'}
                  onChange={e => {
                    const t = e.target.value as any;
                    let url = editingProvider.base_url;
                    if (t === 'openrouter') url = 'https://openrouter.ai/api/v1';
                    if (t === 'openai') url = 'https://api.openai.com/v1';
                    if (t === 'anthropic') url = 'https://api.anthropic.com/v1';
                    setEditingProvider(prev => ({ ...prev!, type: t, base_url: url }));
                  }}
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="openrouter">OpenRouter (Recommended for variety)</option>
                  <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5)</option>
                  <option value="custom">Custom OpenAI-Compatible (LM Studio / vLLM)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Base API URL
                </label>
                <input
                  type="text"
                  value={editingProvider.base_url || ''}
                  onChange={e => setEditingProvider(prev => ({ ...prev!, base_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder={editingProvider.api_key ? 'Leave blank to keep existing key' : 'sk-...'}
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                  Default Model Name (Optional)
                </label>
                <input
                  type="text"
                  value={editingProvider.default_model || ''}
                  onChange={e => setEditingProvider(prev => ({ ...prev!, default_model: e.target.value }))}
                  placeholder="e.g. gpt-4o-mini or mistralai/mistral-7b-instruct:free"
                  className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.enabled ?? true}
                    onChange={e => setEditingProvider(prev => ({ ...prev!, enabled: e.target.checked }))}
                    className="rounded accent-brand-500"
                  />
                  <span>Enabled</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProvider.is_default ?? false}
                    onChange={e => setEditingProvider(prev => ({ ...prev!, is_default: e.target.checked }))}
                    className="rounded accent-brand-500"
                  />
                  <span>Set as Default Provider</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Provider'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
