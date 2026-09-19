import React, { useState, useEffect } from 'react';
import {
  Server,
  Download,
  Trash2,
  HardDrive,
  Cpu,
  Zap,
  RotateCcw,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Sparkles,
  Search
} from 'lucide-react';
import { api } from '../api';
import { OllamaModelInfo, OllamaRunningModel } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const OllamaManagerPage: React.FC = () => {
  const [models, setModels] = useState<OllamaModelInfo[]>([]);
  const [runningModels, setRunningModels] = useState<OllamaRunningModel[]>([]);
  const [status, setStatus] = useState<{ online: boolean; latency_ms: number; host: string; version?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Pull / Download State
  const [pullInput, setPullInput] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [activePulls, setActivePulls] = useState<any[]>([]);

  // Modelfile Creator State
  const [showModelfileModal, setShowModelfileModal] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelfileContent, setModelfileContent] = useState(`FROM llama3.2:3b\n\nPARAMETER temperature 0.8\nPARAMETER stop "<START>"\n\nSYSTEM """\nYou are an immersive roleplay assistant. Always respond in character.\n"""`);
  const [creatingModel, setCreatingModel] = useState(false);

  const { success, error, info } = useToast();

  const loadOllama = async () => {
    try {
      const [statusRes, modelsRes, psRes, pullsRes] = await Promise.all([
        api.getOllamaStatus(),
        api.getOllamaModels().catch(() => ({ models: [] })),
        api.getOllamaRunning().catch(() => ({ models: [] })),
        api.getOllamaPulls().catch(() => ({ pulls: [] }))
      ]);

      setStatus(statusRes);
      setModels(modelsRes.models || []);
      setRunningModels(psRes.models || []);
      setActivePulls(pullsRes.pulls || []);
    } catch (e: any) {
      console.error('Error fetching Ollama info', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOllama();
    const interval = setInterval(loadOllama, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUnloadModel = async (model: string) => {
    try {
      await api.unloadOllamaModel(model);
      success(`Unloaded ${model} from RAM.`);
      loadOllama();
    } catch (err: any) {
      error(`Failed to unload: ${err.message}`);
    }
  };

  const handleUnloadAll = async () => {
    try {
      const res = await api.unloadAllOllamaModels();
      success(`Freed RAM: Unloaded ${res.unloaded} model(s) from memory.`);
      loadOllama();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteModel = async (model: string) => {
    if (!window.confirm(`Are you sure you want to delete model "${model}" from disk?`)) return;
    try {
      await api.deleteOllamaModel(model);
      success(`Deleted model ${model}`);
      loadOllama();
    } catch (err: any) {
      error(`Failed to delete: ${err.message}`);
    }
  };

  const handlePullModel = async (name: string) => {
    if (!name.trim()) return;
    setIsPulling(true);
    try {
      const res = await api.pullOllamaModel(name.trim());
      success(res.message);
      setPullInput('');
      loadOllama();
    } catch (err: any) {
      error(`Pull failed: ${err.message}`);
    } finally {
      setIsPulling(false);
    }
  };

  const handleCreateModel = async () => {
    if (!modelName.trim() || !modelfileContent.trim()) {
      error('Model name and Modelfile content are required');
      return;
    }

    setCreatingModel(true);
    try {
      const res = await api.createOllamaModel(modelName.trim(), modelfileContent);
      success(res.message || `Custom model "${modelName}" created successfully!`);
      setShowModelfileModal(false);
      setModelName('');
      loadOllama();
    } catch (err: any) {
      error(`Creation failed: ${err.message}`);
    } finally {
      setCreatingModel(false);
    }
  };

  const popularPresets = [
    { name: 'llama3.2:1b', desc: '1.3GB • Ultra-fast, ideal for low RAM ZimaOS', tag: 'Fast / Low RAM' },
    { name: 'llama3.2:3b', desc: '2.0GB • Balanced speed and roleplay quality', tag: 'Recommended' },
    { name: 'qwen2.5:1.5b', desc: '1.1GB • Crisp instruction following', tag: 'Lightweight' },
    { name: 'qwen2.5:3b', desc: '1.9GB • Deep narrative understanding', tag: 'Great RP' },
    { name: 'qwen2.5:7b', desc: '4.7GB • Rich creative writing & dialogue', tag: 'High Quality' },
    { name: 'dolphin-llama3:8b', desc: '4.9GB • Uncensored roleplay & persona', tag: 'Uncensored RP' },
    { name: 'mistral:7b', desc: '4.1GB • Standard benchmark RP model', tag: 'Popular' },
    { name: 'deepseek-r1:1.5b', desc: '1.1GB • Reasoning & complex logic', tag: 'Reasoning' }
  ];

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Server className="w-6 h-6 text-emerald-400" />
            <span>Ollama Model Hub & Memory Manager</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage local models, download lightweight RP models, and unload idle models from RAM to keep ZimaOS light.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {runningModels.length > 0 && (
            <button
              onClick={handleUnloadAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 text-xs font-semibold shadow-sm transition-all active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Unload All from RAM</span>
            </button>
          )}

          <button
            onClick={() => setShowModelfileModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>New Custom Modelfile</span>
          </button>
        </div>
      </div>

      {/* Host Status & Memory Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status */}
        <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-matte">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Ollama Endpoint</span>
          <div className="flex items-center gap-2 mt-2">
            <span className={`w-2.5 h-2.5 rounded-full ${status?.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-sm font-bold text-zinc-100 font-mono truncate">{status?.host || 'http://127.0.0.1:11434'}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {status?.online ? `Online • ${status.latency_ms}ms Latency` : 'Offline / Connection refused'}
          </p>
        </div>

        {/* Models in Memory */}
        <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-matte">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Loaded in Memory (RAM/VRAM)</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {runningModels.length} <span className="text-xs font-normal text-zinc-400">active</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {runningModels.map(m => m.name).join(', ') || 'No models currently held in RAM'}
          </p>
        </div>

        {/* Installed on Disk */}
        <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-matte">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Installed Models on Disk</span>
          <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">
            {models.length} <span className="text-xs font-normal text-zinc-400">models</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Total disk storage: {formatBytes(models.reduce((acc, m) => acc + (m.size || 0), 0))}
          </p>
        </div>
      </div>

      {/* Models Loaded in RAM (with Instant Unload Button) */}
      {runningModels.length > 0 && (
        <div className="bg-zinc-950 border border-amber-500/30 rounded-2xl p-6 shadow-matte space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Active Models in RAM / VRAM</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                These models are currently occupying system RAM. Unload them when not in use to free resources on ZimaOS.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {runningModels.map(rm => (
              <div
                key={rm.name}
                className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs font-bold text-zinc-100 font-mono">{rm.name}</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
                    RAM/VRAM: {formatBytes(rm.size_vram || rm.size)}
                  </p>
                </div>
                <button
                  onClick={() => handleUnloadModel(rm.name)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 text-xs font-semibold transition-all flex items-center gap-1"
                  title="Unload from RAM immediately"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Unload</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Model Downloader & Presets */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-brand-400" />
            <span>Download New Models</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Pull models directly from the Ollama library. Lightweight models (1B to 3B) are optimal for low-power servers.
          </p>
        </div>

        {/* Custom Input Pull Form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={pullInput}
            onChange={e => setPullInput(e.target.value)}
            placeholder="Enter Ollama model tag (e.g. llama3.2:3b, qwen2.5:3b, dolphin-llama3:8b)..."
            className="flex-1 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={() => handlePullModel(pullInput)}
            disabled={isPulling || !pullInput.trim()}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isPulling ? 'Pulling...' : 'Pull Model'}</span>
          </button>
        </div>

        {/* Active Pulls Stream */}
        {activePulls.length > 0 && (
          <div className="space-y-2 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800">
            {activePulls.map(pull => (
              <div key={pull.name} className="space-y-1 text-xs">
                <div className="flex justify-between font-mono">
                  <span className="font-bold text-brand-300">{pull.name}</span>
                  <span className="text-zinc-400">{pull.status} ({pull.progress}%)</span>
                </div>
                <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all duration-300"
                    style={{ width: `${pull.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recommended Lightweight RP Model Presets */}
        <div>
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2.5">
            Recommended Models for ZimaOS & RP
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {popularPresets.map(preset => {
              const isInstalled = models.some(m => m.name === preset.name || m.name.startsWith(preset.name));
              return (
                <div
                  key={preset.name}
                  className="p-3.5 bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-xl flex flex-col justify-between transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-bold text-xs text-zinc-100 truncate">{preset.name}</span>
                      <span className="text-[10px] font-semibold bg-brand-500/20 text-brand-300 px-1.5 py-0.2 rounded border border-brand-500/30">
                        {preset.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{preset.desc}</p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-zinc-800 flex items-center justify-between">
                    {isInstalled ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Installed</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePullModel(preset.name)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-brand-600 hover:text-white text-zinc-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Install</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Installed Local Models Table */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte">
        <h2 className="text-base font-bold text-white mb-1">
          Installed Local Models ({models.length})
        </h2>
        <p className="text-xs text-zinc-400 mb-4">
          All models available on your local Ollama server.
        </p>

        {models.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            No Ollama models found. Pull a model above to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/70 text-zinc-400 font-semibold uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3">Model Tag</th>
                  <th className="p-3">Disk Size</th>
                  <th className="p-3">Parameters</th>
                  <th className="p-3">Quantization</th>
                  <th className="p-3">Modified</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300 font-mono">
                {models.map(m => (
                  <tr key={m.name} className="hover:bg-zinc-900/30">
                    <td className="p-3 font-bold text-zinc-100">{m.name}</td>
                    <td className="p-3">{formatBytes(m.size)}</td>
                    <td className="p-3 text-zinc-400">{m.details?.parameter_size || '—'}</td>
                    <td className="p-3 text-zinc-400">{m.details?.quantization_level || '—'}</td>
                    <td className="p-3 text-zinc-500 text-[11px]">
                      {new Date(m.modified_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteModel(m.name)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition-colors"
                        title="Delete Model from Disk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modelfile Creator Modal */}
      {showModelfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCode className="w-5 h-5 text-brand-400" />
              <span>Create Custom Ollama Modelfile</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Target Model Name
              </label>
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="e.g. aria-custom:latest"
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Modelfile Definition
              </label>
              <textarea
                rows={8}
                value={modelfileContent}
                onChange={e => setModelfileContent(e.target.value)}
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500 leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowModelfileModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateModel}
                disabled={creatingModel}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
              >
                {creatingModel ? 'Building Model...' : 'Build Model'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
