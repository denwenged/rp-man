import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Key,
  Layers,
  Sparkles,
  Search,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api';
import { Lorebook, LoreEntry } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const LorebooksPage: React.FC = () => {
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [selectedBook, setSelectedBook] = useState<Lorebook | null>(null);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // New Book Modal
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookName, setBookName] = useState('');
  const [bookDesc, setBookDesc] = useState('');

  // Entry Modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Partial<LoreEntry> | null>(null);
  const [keyInput, setKeyInput] = useState('');

  // Keyword tester
  const [testSampleText, setTestSampleText] = useState('');

  const { success, error, info } = useToast();

  const loadLorebooks = async () => {
    try {
      const res = await api.getLorebooks();
      setLorebooks(res.lorebooks);

      if (res.lorebooks.length > 0) {
        if (!selectedBook || !res.lorebooks.some(b => b.id === selectedBook.id)) {
          loadBookDetails(res.lorebooks[0].id);
        } else {
          loadBookDetails(selectedBook.id);
        }
      } else {
        setSelectedBook(null);
        setEntries([]);
      }
    } catch (e: any) {
      error(`Failed to load lorebooks: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadBookDetails = async (id: string) => {
    try {
      const res = await api.getLorebook(id);
      setSelectedBook(res.lorebook);
      setEntries(res.lorebook.entries || []);
    } catch (e: any) {
      error(`Failed to load lorebook details: ${e.message}`);
    }
  };

  useEffect(() => {
    loadLorebooks();
  }, []);

  const handleCreateBook = async () => {
    if (!bookName.trim()) return;
    try {
      const res = await api.createLorebook({ name: bookName.trim(), description: bookDesc.trim() });
      success(`Created World Book "${res.lorebook.name}"`);
      setShowBookModal(false);
      setBookName('');
      setBookDesc('');
      loadLorebooks();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteBook = async (id: string, name: string) => {
    if (!window.confirm(`Delete Lorebook "${name}" and all its entries?`)) return;
    try {
      await api.deleteLorebook(id);
      success('Lorebook deleted');
      loadLorebooks();
    } catch (err: any) {
      error(err.message);
    }
  };

  const openAddEntryModal = () => {
    setEditingEntry({
      keys: [],
      content: '',
      comment: '',
      enabled: true,
      constant: false,
      selective: false,
      priority: 10
    });
    setKeyInput('');
    setShowEntryModal(true);
  };

  const openEditEntryModal = (entry: LoreEntry) => {
    setEditingEntry(entry);
    setKeyInput((entry.keys || []).join(', '));
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!selectedBook || !editingEntry?.content?.trim()) {
      error('Entry content is required');
      return;
    }

    try {
      const keys = keyInput
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        ...editingEntry,
        keys
      };

      if (editingEntry.id) {
        await api.updateLoreEntry(editingEntry.id, payload);
        success('Entry updated');
      } else {
        await api.createLoreEntry(selectedBook.id, payload);
        success('Entry added');
      }

      setShowEntryModal(false);
      loadBookDetails(selectedBook.id);
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await api.deleteLoreEntry(entryId);
      success('Entry deleted');
      if (selectedBook) loadBookDetails(selectedBook.id);
    } catch (err: any) {
      error(err.message);
    }
  };

  const matchingEntries = entries.filter(e => {
    if (!testSampleText.trim()) return false;
    if (e.constant) return true;
    const text = testSampleText.toLowerCase();
    return e.keys.some(k => text.includes(k.toLowerCase()));
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-brand-400" />
            <span>World Books & Lorebook System</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Build dynamic world lore that automatically injects background information into character prompts when keywords are mentioned.
          </p>
        </div>

        <button
          onClick={() => setShowBookModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>New World Book</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT: Lorebooks Sidebar */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 shadow-matte space-y-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-2">
            World Books ({lorebooks.length})
          </span>

          <div className="space-y-1 mt-2">
            {lorebooks.map(b => {
              const isActive = b.id === selectedBook?.id;
              return (
                <div
                  key={b.id}
                  onClick={() => loadBookDetails(b.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-xs ${
                    isActive
                      ? 'bg-zinc-900 text-white border border-zinc-700/80 shadow-matte'
                      : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{b.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {(b as any).entries_count ?? 0} entries
                    </p>
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteBook(b.id, b.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                    title="Delete Lorebook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Selected Lorebook Entries & Live Tester */}
        <div className="lg:col-span-3 space-y-6">
          {selectedBook ? (
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedBook.name}</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedBook.description || 'No description'}</p>
                </div>
                <button
                  onClick={openAddEntryModal}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Lore Entry</span>
                </button>
              </div>

              {/* Keyword Injection Tester */}
              <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-brand-400" />
                    <span>Keyword Trigger Match Tester</span>
                  </span>
                  {testSampleText && (
                    <span className="text-brand-300 font-mono">
                      {matchingEntries.length} entries triggered
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={testSampleText}
                  onChange={e => setTestSampleText(e.target.value)}
                  placeholder="Type a sample roleplay sentence (e.g. 'I enter the Obsidian Tavern to order spiced mead')..."
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Entries List */}
              <div className="space-y-3">
                {entries.length === 0 ? (
                  <div className="text-center py-10 text-zinc-500 text-xs">
                    No lore entries in this book yet. Click "Add Lore Entry" above!
                  </div>
                ) : (
                  entries.map(entry => {
                    const isMatched = matchingEntries.some(m => m.id === entry.id);
                    return (
                      <div
                        key={entry.id}
                        className={`p-4 rounded-xl border transition-all text-xs space-y-2 ${
                          isMatched
                            ? 'bg-brand-950/30 border-brand-500/50 shadow-glow-violet'
                            : 'bg-zinc-900/60 border-zinc-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-zinc-200">
                                {entry.comment || 'Untitled Entry'}
                              </h4>
                              {entry.constant && (
                                <span className="text-[10px] uppercase font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                                  Constant
                                </span>
                              )}
                              {isMatched && (
                                <span className="text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Matched</span>
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {entry.keys.map(k => (
                                <span
                                  key={k}
                                  className="text-[10px] font-mono bg-zinc-950 text-brand-300 border border-zinc-800 px-2 py-0.5 rounded-md"
                                >
                                  {k}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditEntryModal(entry)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(entry.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-zinc-300 leading-relaxed font-sans bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-850">
                          {entry.content}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-12 text-center text-zinc-500 text-xs">
              Select or create a World Book to manage lore entries.
            </div>
          )}
        </div>
      </div>

      {/* Create Book Modal */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-400" />
              <span>Create New World Lorebook</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Lorebook Name
              </label>
              <input
                type="text"
                value={bookName}
                onChange={e => setBookName(e.target.value)}
                placeholder="e.g. Cyberpunk Veridia Lore"
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={3}
                value={bookDesc}
                onChange={e => setBookDesc(e.target.value)}
                placeholder="World setting details, universe facts..."
                className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowBookModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBook}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
              >
                Create World Book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Entry Modal */}
      {showEntryModal && editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-brand-400" />
              <span>{editingEntry.id ? 'Edit Lore Entry' : 'Add Lore Entry'}</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Title / Comment
              </label>
              <input
                type="text"
                value={editingEntry.comment || ''}
                onChange={e => setEditingEntry(prev => ({ ...prev!, comment: e.target.value }))}
                placeholder="e.g. City Currency"
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Trigger Keywords (Comma-separated)
              </label>
              <input
                type="text"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="e.g. credits, money, currency, bank"
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Lore Content
              </label>
              <textarea
                rows={5}
                value={editingEntry.content || ''}
                onChange={e => setEditingEntry(prev => ({ ...prev!, content: e.target.value }))}
                placeholder="In Neo-Veridia, all commerce is transacted using encrypted digital creds..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEntry.constant ?? false}
                  onChange={e => setEditingEntry(prev => ({ ...prev!, constant: e.target.checked }))}
                  className="rounded accent-brand-500"
                />
                <span>Always Inject (Constant)</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingEntry.enabled ?? true}
                  onChange={e => setEditingEntry(prev => ({ ...prev!, enabled: e.target.checked }))}
                  className="rounded accent-brand-500"
                />
                <span>Enabled</span>
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-zinc-800">
              <button
                onClick={() => setShowEntryModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEntry}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
              >
                Save Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
