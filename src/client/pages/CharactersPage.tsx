import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  Edit,
  MessageSquare,
  Search,
  Tag,
  Shield,
  Bot,
  Sparkles,
  ExternalLink,
  Layers
} from 'lucide-react';
import { api } from '../api';
import { Character } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const CharactersPage: React.FC = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteModalChar, setDeleteModalChar] = useState<Character | null>(null);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  const canEdit = user?.role === 'admin' || user?.role === 'editor';

  const loadCharacters = async () => {
    try {
      const res = await api.getCharacters(searchQuery);
      setCharacters(res.characters);
    } catch (e: any) {
      error(`Failed to load characters: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [searchQuery]);

  const allTags = Array.from(
    new Set(characters.flatMap(c => c.tags || []))
  );

  const filteredCharacters = characters.filter(c => {
    if (!selectedTag) return true;
    return c.tags?.includes(selectedTag);
  });

  const handleDuplicate = async (id: string) => {
    try {
      const res = await api.duplicateCharacter(id);
      success(`Duplicated "${res.character.name}"`);
      loadCharacters();
    } catch (e: any) {
      error(`Failed to duplicate: ${e.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteModalChar) return;
    try {
      await api.deleteCharacter(deleteModalChar.id);
      success(`Deleted character "${deleteModalChar.name}"`);
      setDeleteModalChar(null);
      loadCharacters();
    } catch (e: any) {
      error(`Failed to delete: ${e.message}`);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.importCharacter(formData);
      success(`Imported character "${res.character.name}"!`);
      loadCharacters();
    } catch (err: any) {
      error(err.message || 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-6 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-6 h-6 text-brand-400" />
            <span>Roleplay Character Library</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {canEdit
              ? 'Create, customize, and configure Discord triggers, system prompts, lore, and emotion avatars.'
              : 'Browse characters and jump directly into solo or group roleplay chats.'}
          </p>
        </div>

        {/* Action Buttons (Admin & Editor only) */}
        {canEdit && (
          <div className="flex items-center gap-2.5">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileImport}
              accept=".json,.png"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-700/80 transition-all active:scale-95 disabled:opacity-50"
              title="Import Tavern V2 Character Card (JSON or PNG)"
            >
              <Upload className="w-4 h-4 text-brand-400" />
              <span>{importing ? 'Importing...' : 'Import Card'}</span>
            </button>

            <button
              onClick={() => navigate('/characters/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Character</span>
            </button>
          </div>
        )}
      </div>

      {/* Search & Tag Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search characters by name, tagline, or tags..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-900/90 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                selectedTag === null
                  ? 'bg-brand-600 text-white border-brand-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              All Tags
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                  selectedTag === tag
                    ? 'bg-brand-600 text-white border-brand-500'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Character Card Grid */}
      {loading ? (
        <div className="text-center py-20 text-zinc-500">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading characters...</p>
        </div>
      ) : filteredCharacters.length === 0 ? (
        <div className="text-center py-20 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-8">
          <Bot className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-zinc-200">No Characters Found</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No character matching "${searchQuery}".`
              : canEdit
              ? 'Create your first RP character or import a Tavern card!'
              : 'No characters currently available.'}
          </p>
          {canEdit && (
            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={() => navigate('/characters/new')}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all"
              >
                Create Character
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCharacters.map(char => {
            const prefix = char.discord_config?.trigger_prefix || 'none';
            const modelName = char.model_config?.model || 'Server Default';

            return (
              <div
                key={char.id}
                className="group bg-zinc-950 hover:bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700/90 rounded-2xl p-5 shadow-matte transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Top Header info */}
                  <div className="flex items-start gap-3.5">
                    <img
                      src={char.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                      alt={char.name}
                      className="w-14 h-14 rounded-2xl object-cover bg-zinc-900 border border-zinc-800 shrink-0 shadow-inner group-hover:scale-105 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="font-bold text-base text-zinc-100 group-hover:text-brand-300 transition-colors truncate">
                          {char.name}
                        </h3>
                        {char.is_public ? (
                          <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                            Public
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded">
                            Private
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                        {char.tagline || char.description || 'AI Roleplay Character'}
                      </p>

                      {/* Discord Trigger & Model Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        <span className="text-[10px] font-mono font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
                          Prefix: {prefix}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                          {modelName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Character Description excerpt */}
                  <p className="text-xs text-zinc-400 mt-3.5 line-clamp-2 leading-relaxed bg-zinc-900/40 p-2.5 rounded-xl border border-zinc-850">
                    {char.description || char.personality || char.first_mes || 'No description provided.'}
                  </p>

                  {/* Tags */}
                  {char.tags && char.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {char.tags.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded-md border border-zinc-800">
                          #{t}
                        </span>
                      ))}
                      {char.tags.length > 4 && (
                        <span className="text-[10px] text-zinc-500">+{char.tags.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-5 pt-3.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => navigate(`/playground?character_id=${char.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Live Chat</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <button
                          onClick={() => navigate(`/characters/${char.id}`)}
                          title="Edit Character"
                          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDuplicate(char.id)}
                          title="Duplicate Character"
                          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-xl transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <a
                      href={`/api/characters/${char.id}/export`}
                      download
                      title="Export Tavern V2 JSON"
                      className="p-2 text-zinc-400 hover:text-brand-300 hover:bg-zinc-800 rounded-xl transition-colors"
                    >
                      <Download className="w-4 h-4" />
                    </a>

                    {canEdit && (
                      <button
                        onClick={() => setDeleteModalChar(char)}
                        title="Delete Character"
                        className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalChar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100">Delete Character?</h3>
            <p className="text-xs text-zinc-400 mt-2">
              Are you sure you want to delete <strong className="text-zinc-200">"{deleteModalChar.name}"</strong>? This will also delete all associated chat histories.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteModalChar(null)}
                className="px-3.5 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-900 rounded-xl border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-sm"
              >
                Delete Character
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
