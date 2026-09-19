import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Trash2,
  Pause,
  Play,
  Filter,
  Search,
  Download,
  Activity,
  Layers
} from 'lucide-react';
import { api } from '../api';
import { LogEntry } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const { success, error, info } = useToast();

  useEffect(() => {
    // Initial fetch
    const fetchInitial = async () => {
      try {
        const res = await api.getLogs({ limit: 150 });
        setLogs(res.logs);
      } catch (e) {}
    };
    fetchInitial();

    // Setup SSE stream
    const token = localStorage.getItem('rp_man_token');
    const sseUrl = `/api/logs/stream?token=${encodeURIComponent(token || '')}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      if (isPaused) return;
      try {
        const entry = JSON.parse(event.data);
        if (entry.id && entry.message) {
          setLogs(prev => [entry, ...prev.slice(0, 400)]);
        }
      } catch (err) {}
    };

    eventSource.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      eventSource.close();
    };
  }, [isPaused]);

  useEffect(() => {
    if (autoScroll && !isPaused) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isPaused]);

  const handleClear = async () => {
    if (!window.confirm('Clear all system logs?')) return;
    try {
      await api.clearLogs();
      setLogs([]);
      success('System logs cleared.');
    } catch (err: any) {
      error(err.message);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (selectedCategory !== 'ALL' && log.category !== selectedCategory) return false;
    if (selectedLevel !== 'ALL' && log.level !== selectedLevel.toLowerCase()) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchCat = log.category.toLowerCase().includes(q);
      return matchMsg || matchCat;
    }
    return true;
  });

  const exportLogs = () => {
    const text = logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rp_man_logs_${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-brand-400" />
            <span>Live System Activity & Discord Logs</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time SSE event stream of Discord messages, LLM invocations, Ollama operations, and queue activity.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
              isPaused
                ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
            }`}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 fill-amber-400" />
                <span>Resume Stream</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Stream</span>
              </>
            )}
          </button>

          <button
            onClick={exportLogs}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl transition-colors border border-zinc-800"
            title="Download Logs"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors border border-zinc-800"
            title="Clear Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Categories</option>
            <option value="DISCORD">Discord Gateway</option>
            <option value="LLM">LLM Generation</option>
            <option value="OLLAMA">Ollama Hub</option>
            <option value="QUEUE">Queue Guard</option>
            <option value="SYSTEM">System & Config</option>
            <option value="AUTH">Authentication</option>
          </select>

          {/* Level Filter */}
          <select
            value={selectedLevel}
            onChange={e => setSelectedLevel(e.target.value)}
            className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
          >
            <option value="ALL">All Levels</option>
            <option value="INFO">Info</option>
            <option value="WARN">Warnings</option>
            <option value="ERROR">Errors</option>
          </select>
        </div>

        {/* Search Filter */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Search log text..."
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Terminal Display */}
      <div className="terminal-window rounded-2xl p-4 min-h-[500px] max-h-[650px] overflow-y-auto space-y-1.5 shadow-matte">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-xs italic">
            No matching log events found.
          </div>
        ) : (
          filteredLogs.map(log => (
            <div
              key={log.id}
              className="flex items-start gap-2.5 text-xs font-mono leading-relaxed hover:bg-zinc-900/40 px-2 py-1 rounded transition-colors"
            >
              <span className="text-zinc-500 shrink-0 text-[11px]">
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
                    : log.category === 'QUEUE'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}
              >
                {log.category}
              </span>

              <span
                className={`flex-1 break-all ${
                  log.level === 'error'
                    ? 'text-rose-400 font-semibold'
                    : log.level === 'warn'
                    ? 'text-amber-300'
                    : 'text-zinc-300'
                }`}
              >
                {log.message}
                {log.details && Object.keys(log.details).length > 0 && (
                  <span className="text-zinc-500 ml-2">
                    {JSON.stringify(log.details)}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};
