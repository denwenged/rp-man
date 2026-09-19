import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Upload,
  Sparkles,
  Bot,
  Sliders,
  Cpu,
  BookOpen,
  MessageSquare,
  Plus,
  Trash2,
  Heart,
  Smile,
  Check,
  Edit2,
  Users
} from 'lucide-react';
import { api } from '../api';
import { Character, Lorebook, OllamaModelInfo, CharacterExpression, UserRelationship } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const CharacterEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [activeTab, setActiveTab] = useState<'persona' | 'expressions' | 'relationships' | 'model' | 'context' | 'discord' | 'advanced'>('persona');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [installedModels, setInstalledModels] = useState<OllamaModelInfo[]>([]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useToast();
  const navigate = useNavigate();

  // Character State
  const [character, setCharacter] = useState<Partial<Character>>({
    name: '',
    avatar_url: '',
    tagline: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    alternate_greetings: [],
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    creator_notes: '',
    tags: [],
    expressions: [],
    relationships: [],
    is_public: true,
    model_config: {
      provider: 'server_default',
      model: '',
      parameters: {
        temperature: 0.8,
        top_p: 0.9,
        max_tokens: 350,
        repeat_penalty: 1.1,
        stop: []
      },
      keep_alive: '5m'
    },
    discord_config: {
      trigger_prefix: '',
      trigger_suffix: '',
      webhook_url: '',
      channel_ids: [],
      auto_react: false,
      reply_on_mention: true,
      tupperbox_proxy: true
    },
    context_config: {
      max_context_tokens: 4096,
      max_history_messages: 16,
      enable_summary: true,
      summary_token_threshold: 3000,
      lorebook_ids: []
    }
  });

  const [tagInput, setTagInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [newGreetingInput, setNewGreetingInput] = useState('');

  // Expression Form State
  const [newExpName, setNewExpName] = useState('');
  const [newExpEmoji, setNewExpEmoji] = useState('😊');
  const [newExpAvatar, setNewExpAvatar] = useState('');

  // Relationship Form State
  const [relUserIdentifier, setRelUserIdentifier] = useState('');
  const [relType, setRelType] = useState('Friend');
  const [relNotes, setRelNotes] = useState('');
  const [relAffinity, setRelAffinity] = useState(50);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [loreRes, ollamaRes] = await Promise.all([
          api.getLorebooks(),
          api.getOllamaModels().catch(() => ({ models: [] }))
        ]);
        setLorebooks(loreRes.lorebooks);
        setInstalledModels(ollamaRes.models);

        if (!isNew && id) {
          const charRes = await api.getCharacter(id);
          setCharacter(charRes.character);
          setChannelInput((charRes.character.discord_config?.channel_ids || []).join(', '));
        }
      } catch (e: any) {
        error(`Failed to load data: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isNew]);

  const handleSave = async () => {
    if (!character.name?.trim()) {
      error('Character Name is required');
      return;
    }

    setSaving(true);
    try {
      const channels = channelInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        ...character,
        discord_config: {
          ...character.discord_config,
          channel_ids: channels
        }
      };

      if (isNew) {
        const res = await api.createCharacter(payload);
        success(`Character "${res.character.name}" created!`);
        navigate(`/characters/${res.character.id}`, { replace: true });
      } else {
        const res = await api.updateCharacter(id!, payload);
        success(`Character "${res.character.name}" updated!`);
      }
    } catch (e: any) {
      error(`Failed to save character: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.uploadImage(formData);
      setCharacter(prev => ({ ...prev, avatar_url: res.url }));
      success('Avatar image uploaded successfully!');
    } catch (e: any) {
      error(`Upload failed: ${e.message}`);
    }
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    const clean = tagInput.trim().replace(/^#/, '');
    if (!character.tags?.includes(clean)) {
      setCharacter(prev => ({ ...prev, tags: [...(prev.tags || []), clean] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setCharacter(prev => ({ ...prev, tags: (prev.tags || []).filter(t => t !== tag) }));
  };

  const addGreeting = () => {
    if (!newGreetingInput.trim()) return;
    setCharacter(prev => ({
      ...prev,
      alternate_greetings: [...(prev.alternate_greetings || []), newGreetingInput.trim()]
    }));
    setNewGreetingInput('');
  };

  const removeGreeting = (index: number) => {
    setCharacter(prev => ({
      ...prev,
      alternate_greetings: (prev.alternate_greetings || []).filter((_, i) => i !== index)
    }));
  };

  // Add Expression
  const handleAddExpression = () => {
    if (!newExpName.trim()) {
      error('Expression name is required (e.g. angry)');
      return;
    }
    const expId = `exp_${Date.now()}`;
    const newExp: CharacterExpression = {
      id: expId,
      name: newExpName.trim().toLowerCase(),
      emoji: newExpEmoji.trim() || '😊',
      avatar_url: newExpAvatar.trim() || character.avatar_url || ''
    };

    const updated = [...(character.expressions || []), newExp];
    setCharacter(prev => ({ ...prev, expressions: updated }));
    setNewExpName('');
    setNewExpAvatar('');
    success(`Added expression "${newExp.name}" ${newExp.emoji}`);
  };

  const removeExpression = (expId: string) => {
    const updated = (character.expressions || []).filter(e => e.id !== expId);
    setCharacter(prev => ({ ...prev, expressions: updated }));
  };

  // Add User Relationship
  const handleAddRelationship = async () => {
    if (!relUserIdentifier.trim() || !relNotes.trim()) {
      error('User identifier (Name or Discord ID) and Relationship Directives are required');
      return;
    }

    if (!isNew && id) {
      try {
        const res = await api.addRelationship(id, {
          user_identifier: relUserIdentifier.trim(),
          relationship_type: relType,
          relationship_notes: relNotes.trim(),
          affinity_level: relAffinity
        });
        setCharacter(prev => ({
          ...prev,
          relationships: [...(prev.relationships || []), res.relationship]
        }));
        setRelUserIdentifier('');
        setRelNotes('');
        success(`Added relationship for "${relUserIdentifier}" (${relType})`);
      } catch (e: any) {
        error(e.message);
      }
    } else {
      const tempRel: UserRelationship = {
        id: `rel_${Date.now()}`,
        character_id: '',
        user_identifier: relUserIdentifier.trim(),
        relationship_type: relType,
        relationship_notes: relNotes.trim(),
        affinity_level: relAffinity,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setCharacter(prev => ({
        ...prev,
        relationships: [...(prev.relationships || []), tempRel]
      }));
      setRelUserIdentifier('');
      setRelNotes('');
      success(`Added relationship for "${relUserIdentifier}"`);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    if (!isNew && id) {
      try {
        await api.deleteRelationship(relId);
        setCharacter(prev => ({
          ...prev,
          relationships: (prev.relationships || []).filter(r => r.id !== relId)
        }));
        success('Relationship deleted');
      } catch (e: any) {
        error(e.message);
      }
    } else {
      setCharacter(prev => ({
        ...prev,
        relationships: (prev.relationships || []).filter(r => r.id !== relId)
      }));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-20 text-zinc-500">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Loading character details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950 p-5 rounded-2xl border border-zinc-800/80 shadow-matte">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/characters')}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-xl transition-colors border border-zinc-800"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isNew ? 'Create New Character' : `Edit: ${character.name || 'Untitled'}`}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Customize persona, emotion avatars, user relationships, and Discord triggers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {!isNew && (
            <button
              onClick={() => navigate(`/playground?character_id=${id}`)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold border border-zinc-750 transition-all active:scale-95"
            >
              <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
              <span>Test Chat</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Character'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-zinc-950 rounded-2xl border border-zinc-800/80 text-xs font-semibold">
        {[
          { key: 'persona', label: 'Persona & Identity', icon: Sparkles },
          { key: 'expressions', label: 'Emotion Avatars & Emojis', icon: Smile, highlight: true },
          { key: 'relationships', label: 'User Relationships', icon: Heart, highlight: true },
          { key: 'model', label: 'Model & Prompts', icon: Cpu },
          { key: 'context', label: 'Context & Memory', icon: BookOpen },
          { key: 'discord', label: 'Discord & Webhooks', icon: Bot },
          { key: 'advanced', label: 'Advanced & Notes', icon: Sliders },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-900 text-white border border-zinc-700/80 shadow-matte'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? (tab.highlight ? 'text-amber-400' : 'text-brand-400') : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-6">
        {/* ==================== TAB 1: PERSONA ==================== */}
        {activeTab === 'persona' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/60 rounded-2xl border border-zinc-800 text-center">
                <img
                  src={character.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${character.name || 'char'}`}
                  alt={character.name || 'Character'}
                  className="w-32 h-32 rounded-2xl object-cover bg-zinc-950 border-2 border-zinc-700 shadow-matte mb-4"
                />
                <input
                  type="file"
                  ref={avatarInputRef}
                  onChange={handleAvatarUpload}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>
                <div className="w-full mt-3">
                  <input
                    type="text"
                    value={character.avatar_url || ''}
                    onChange={e => setCharacter(prev => ({ ...prev, avatar_url: e.target.value }))}
                    placeholder="Or enter Avatar Image URL..."
                    className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Character Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={character.name || ''}
                    onChange={e => {
                      const newName = e.target.value;
                      const cleanTrigger = newName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
                      setCharacter(prev => ({
                        ...prev,
                        name: newName,
                        discord_config: {
                          ...prev.discord_config,
                          trigger_prefix: prev.discord_config?.trigger_prefix || `${cleanTrigger}:`
                        }
                      }));
                    }}
                    placeholder="e.g. Aria Vance"
                    className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Tagline / Subtitle
                  </label>
                  <input
                    type="text"
                    value={character.tagline || ''}
                    onChange={e => setCharacter(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="e.g. Cyberpunk Netrunner & Snarky Fixer"
                    className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                    Tags & Categories
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Type a tag and press Enter"
                      className="flex-1 px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(character.tags || []).map(tag => (
                      <span
                        key={tag}
                        className="flex items-center gap-1.5 text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded-lg"
                      >
                        <span>#{tag}</span>
                        <button onClick={() => removeTag(tag)} className="text-zinc-500 hover:text-rose-400">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Character Persona & Backstory
              </label>
              <textarea
                rows={4}
                value={character.description || ''}
                onChange={e => setCharacter(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Appearance, age, history, background..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Personality Traits & Quirks
              </label>
              <textarea
                rows={2}
                value={character.personality || ''}
                onChange={e => setCharacter(prev => ({ ...prev, personality: e.target.value }))}
                placeholder="e.g. Sarcastic, observant, fiercely protective, loves spiced tea..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Roleplay Scenario / Setting
              </label>
              <textarea
                rows={2}
                value={character.scenario || ''}
                onChange={e => setCharacter(prev => ({ ...prev, scenario: e.target.value }))}
                placeholder="e.g. {{user}} meets Aria in a rain-soaked alley after a job gone sideways."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Initial Greeting / First Message
              </label>
              <textarea
                rows={4}
                value={character.first_mes || ''}
                onChange={e => setCharacter(prev => ({ ...prev, first_mes: e.target.value }))}
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 2: EMOTION AVATARS & EXPRESSION EMOJIS ==================== */}
        {activeTab === 'expressions' && (
          <div className="space-y-6">
            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <Smile className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <strong className="text-amber-300 font-semibold">Dynamic Emotion Avatars & Emojis:</strong>
                <p className="mt-0.5">
                  Assign emotion names (e.g. <code className="text-zinc-100">angry</code>, <code className="text-zinc-100">happy</code>, <code className="text-zinc-100">smug</code>, <code className="text-zinc-100">blushing</code>) with an emoji and custom avatar face image. When the character responds with that emotion, both the Discord Webhook avatar and the Web Chat avatar dynamically switch to that face!
                </p>
              </div>
            </div>

            {/* Existing Expressions Grid */}
            <div>
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
                Configured Expressions ({(character.expressions || []).length})
              </h3>

              {(character.expressions || []).length === 0 ? (
                <div className="text-center py-8 bg-zinc-900/40 rounded-xl border border-zinc-800 text-zinc-500 text-xs">
                  No expression avatars configured yet. Add one below!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(character.expressions || []).map(exp => (
                    <div
                      key={exp.id}
                      className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={exp.avatar_url || character.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${exp.name}`}
                          alt={exp.name}
                          className="w-10 h-10 rounded-xl object-cover bg-zinc-950 border border-zinc-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{exp.emoji}</span>
                            <span className="font-bold text-xs text-zinc-100 capitalize truncate">{exp.name}</span>
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">[emotion: {exp.name}]</span>
                        </div>
                      </div>

                      <button
                        onClick={() => removeExpression(exp.id)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Expression Form */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-400" />
                <span>Add Expression Avatar</span>
              </h4>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: 'angry', emoji: '😡' },
                  { name: 'happy', emoji: '😊' },
                  { name: 'smug', emoji: '😏' },
                  { name: 'blushing', emoji: '😳' },
                  { name: 'sad', emoji: '😢' },
                  { name: 'surprised', emoji: '😲' },
                  { name: 'neutral', emoji: '😐' },
                  { name: 'curious', emoji: '🧐' }
                ].map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setNewExpName(p.name);
                      setNewExpEmoji(p.emoji);
                    }}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-750 flex items-center gap-1"
                  >
                    <span>{p.emoji}</span>
                    <span className="capitalize">{p.name}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Emotion Name</label>
                  <input
                    type="text"
                    value={newExpName}
                    onChange={e => setNewExpName(e.target.value)}
                    placeholder="e.g. angry, smug, happy"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={newExpEmoji}
                    onChange={e => setNewExpEmoji(e.target.value)}
                    placeholder="e.g. 😡"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Expression Avatar URL</label>
                  <input
                    type="text"
                    value={newExpAvatar}
                    onChange={e => setNewExpAvatar(e.target.value)}
                    placeholder="https://... (or image URL)"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddExpression}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all"
              >
                Add Expression
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: USER RELATIONSHIPS ==================== */}
        {activeTab === 'relationships' && (
          <div className="space-y-6">
            <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl flex items-start gap-3">
              <Heart className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <strong className="text-rose-300 font-semibold">User Relationships & Dynamic Bonds:</strong>
                <p className="mt-0.5">
                  Define how this character interacts with specific users (e.g. <code className="text-zinc-100">Father</code>, <code className="text-zinc-100">Friend</code>, <code className="text-zinc-100">Rival</code>, <code className="text-zinc-100">Lover</code>, <code className="text-zinc-100">Master</code>). When talking to that Discord User ID or Web Persona, the AI dynamically treats them according to their unique bond!
                </p>
              </div>
            </div>

            {/* Existing Relationships List */}
            <div>
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
                Active User Bonds & Relationships ({(character.relationships || []).length})
              </h3>

              {(character.relationships || []).length === 0 ? (
                <div className="text-center py-8 bg-zinc-900/40 rounded-xl border border-zinc-800 text-zinc-500 text-xs">
                  No custom user relationships defined. Add one below!
                </div>
              ) : (
                <div className="space-y-3">
                  {(character.relationships || []).map(rel => (
                    <div
                      key={rel.id}
                      className="p-4 bg-zinc-900/70 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-100">{rel.user_identifier}</span>
                          <span className="text-[10px] uppercase font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded">
                            {rel.relationship_type}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            Affinity: {rel.affinity_level}/100
                          </span>
                        </div>
                        <p className="text-zinc-300 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-850 mt-1">
                          {rel.relationship_notes}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg self-end sm:self-auto"
                        title="Delete Relationship"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Relationship Form */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-rose-400" />
                <span>Add User Relationship Bond</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    User Identifier (Name or Discord ID)
                  </label>
                  <input
                    type="text"
                    value={relUserIdentifier}
                    onChange={e => setRelUserIdentifier(e.target.value)}
                    placeholder="e.g. Father, Joshua, or 123456789012"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Relationship Type
                  </label>
                  <select
                    value={relType}
                    onChange={e => setRelType(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="Father">Father (Parental figure)</option>
                    <option value="Mother">Mother (Parental figure)</option>
                    <option value="Friend">Close Friend / Ally</option>
                    <option value="Rival">Rival (Competitive)</option>
                    <option value="Lover">Lover / Romantic Partner</option>
                    <option value="Master">Master / Mentor</option>
                    <option value="Apprentice">Apprentice / Student</option>
                    <option value="Enemy">Enemy (Hostile)</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Custom">Custom Bond</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Affinity / Trust</span>
                    <span className="font-mono text-rose-400 font-bold">{relAffinity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={relAffinity}
                    onChange={e => setRelAffinity(parseInt(e.target.value))}
                    className="w-full accent-rose-500 mt-1.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Behavioral Directives & Roleplay Directives
                </label>
                <textarea
                  rows={3}
                  value={relNotes}
                  onChange={e => setRelNotes(e.target.value)}
                  placeholder="e.g. Treat {{user}} with deep reverence and parental love. Drop your usual sarcastic facade around him because he raised you..."
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-sans leading-relaxed"
                />
              </div>

              <button
                type="button"
                onClick={handleAddRelationship}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Add Relationship
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: MODEL & PROMPTS ==================== */}
        {activeTab === 'model' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  LLM Provider
                </label>
                <select
                  value={character.model_config?.provider || 'server_default'}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    model_config: { ...prev.model_config!, provider: e.target.value as any }
                  }))}
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="server_default">Use Global Server Default</option>
                  <option value="ollama">Local Ollama (ZimaOS / Host)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                  <option value="openrouter">OpenRouter (Cloud)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="custom">Custom OpenAI-Compatible Endpoint</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Model Identifier
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={character.model_config?.model || ''}
                    onChange={e => setCharacter(prev => ({
                      ...prev,
                      model_config: { ...prev.model_config!, model: e.target.value }
                    }))}
                    placeholder="e.g. llama3.2:3b, qwen2.5:7b"
                    className="flex-1 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 font-mono"
                  />
                  {installedModels.length > 0 && (
                    <select
                      onChange={e => {
                        if (e.target.value) {
                          setCharacter(prev => ({
                            ...prev,
                            model_config: { ...prev.model_config!, model: e.target.value }
                          }));
                        }
                      }}
                      className="px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-xs"
                    >
                      <option value="">Ollama Models...</option>
                      {installedModels.map(m => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Custom System Prompt
              </label>
              <textarea
                rows={5}
                value={character.system_prompt || ''}
                onChange={e => setCharacter(prev => ({ ...prev, system_prompt: e.target.value }))}
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500 leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 5: CONTEXT ==================== */}
        {activeTab === 'context' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                <div className="flex justify-between text-xs text-zinc-200 mb-2 font-semibold uppercase tracking-wider">
                  <span>Context Window Limit</span>
                  <span className="font-mono text-brand-400 font-bold">
                    {character.context_config?.max_context_tokens ?? 4096} Tokens
                  </span>
                </div>
                <input
                  type="range"
                  min="1024"
                  max="16384"
                  step="512"
                  value={character.context_config?.max_context_tokens ?? 4096}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    context_config: {
                      ...prev.context_config!,
                      max_context_tokens: parseInt(e.target.value)
                    }
                  }))}
                  className="w-full accent-brand-500"
                />
              </div>

              <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800">
                <div className="flex justify-between text-xs text-zinc-200 mb-2 font-semibold uppercase tracking-wider">
                  <span>Sliding Window History</span>
                  <span className="font-mono text-brand-400 font-bold">
                    {character.context_config?.max_history_messages ?? 16} Messages
                  </span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="50"
                  step="2"
                  value={character.context_config?.max_history_messages ?? 16}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    context_config: {
                      ...prev.context_config!,
                      max_history_messages: parseInt(e.target.value)
                    }
                  }))}
                  className="w-full accent-brand-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 6: DISCORD ==================== */}
        {activeTab === 'discord' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Trigger Prefix (Tupperbox style)
                </label>
                <input
                  type="text"
                  value={character.discord_config?.trigger_prefix || ''}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, trigger_prefix: e.target.value }
                  }))}
                  placeholder="e.g. aria: or !aria"
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Dedicated Channel IDs
                </label>
                <input
                  type="text"
                  value={channelInput}
                  onChange={e => setChannelInput(e.target.value)}
                  placeholder="e.g. 123456789012345678"
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 7: ADVANCED ==================== */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Creator Notes
              </label>
              <textarea
                rows={3}
                value={character.creator_notes || ''}
                onChange={e => setCharacter(prev => ({ ...prev, creator_notes: e.target.value }))}
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
