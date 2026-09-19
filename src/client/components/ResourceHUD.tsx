import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Zap, Bot, Trash2, Activity, Server } from 'lucide-react';
import { api } from '../api';
import { SystemStats } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const ResourceHUD: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isFreeing, setIsFreeing] = useState(false);
  const { success, error } = useToast();

  const fetchStats = async () => {
    try {
      const res = await api.getSystemStats();
      setStats(res.stats);
    } catch (e) {}
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleFreeMemory = async () => {
    setIsFreeing(true);
    try {
      const res = await api.unloadAllOllamaModels();
      success(`Freed RAM: Unloaded ${res.unloaded} active Ollama model(s)`);
      fetchStats();
    } catch (e: any) {
      error(`Failed to unload models: ${e.message}`);
    } finally {
      setIsFreeing(false);
    }
  };

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-1 px-2.5 bg-zinc-900/60 rounded-lg border border-zinc-800">
        <Activity className="w-3.5 h-3.5 animate-pulse text-zinc-400" />
        <span>Syncing server HUD...</span>
      </div>
    );
  }

  const ramUsedGB = (stats.ram_used_bytes / (1024 * 1024 * 1024)).toFixed(1);
  const ramTotalGB = (stats.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <div className="flex items-center gap-2 sm:gap-3 text-xs bg-zinc-950/80 p-1 sm:p-1.5 rounded-xl border border-zinc-800/80 shadow-inner">
      {/* CPU */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/70 border border-zinc-800/50" title="CPU Usage">
        <Cpu className={`w-3.5 h-3.5 ${stats.cpu_percent > 80 ? 'text-rose-400 animate-pulse' : stats.cpu_percent > 50 ? 'text-amber-400' : 'text-cyan-400'}`} />
        <span className="font-mono font-medium text-zinc-200">{stats.cpu_percent}%</span>
      </div>

      {/* RAM */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900/70 border border-zinc-800/50" title={`RAM: ${ramUsedGB}GB / ${ramTotalGB}GB`}>
        <HardDrive className={`w-3.5 h-3.5 ${stats.ram_percent > 85 ? 'text-rose-400' : stats.ram_percent > 65 ? 'text-amber-400' : 'text-emerald-400'}`} />
        <span className="font-mono font-medium text-zinc-200">{stats.ram_percent}%</span>
        <span className="hidden md:inline text-[10px] text-zinc-400 font-mono">({ramUsedGB}G)</span>
      </div>

      {/* Ollama Status & Loaded Models */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
          stats.ollama_status === 'online'
            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
            : 'bg-zinc-900/70 border-zinc-800/50 text-zinc-400'
        }`}
        title={`Ollama: ${stats.ollama_status.toUpperCase()} (${stats.ollama_running_models_count} models in RAM)`}
      >
        <Server className="w-3.5 h-3.5" />
        <span className="font-medium hidden sm:inline">Ollama</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        {stats.ollama_running_models_count > 0 && (
          <span className="px-1 py-0.2 text-[10px] bg-emerald-500/20 rounded font-mono font-bold text-emerald-300">
            {stats.ollama_running_models_count}
          </span>
        )}
      </div>

      {/* Queue & Active LLM */}
      {stats.active_llm_requests > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand-950/40 border border-brand-500/40 text-brand-300 animate-pulse">
          <Zap className="w-3.5 h-3.5 text-brand-400" />
          <span className="font-mono text-[11px]">Generating</span>
          {stats.queue_length > 0 && <span className="text-[10px] bg-brand-500/30 px-1 rounded">+{stats.queue_length}</span>}
        </div>
      )}

      {/* Quick Unload RAM Button */}
      {stats.ollama_running_models_count > 0 && (
        <button
          onClick={handleFreeMemory}
          disabled={isFreeing}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 transition-all text-[11px] font-medium active:scale-95 disabled:opacity-50"
          title="Unload loaded Ollama models from RAM immediately to free memory for ZimaOS"
        >
          <Trash2 className="w-3 h-3 text-rose-400" />
          <span className="hidden sm:inline">{isFreeing ? 'Freeing...' : 'Free RAM'}</span>
        </button>
      )}
    </div>
  );
};
