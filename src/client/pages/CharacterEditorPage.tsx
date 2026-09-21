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
  Brain,
  Check,
  Edit2,
  Users,
  ShieldAlert,
  Hash
} from 'lucide-react';
import { api } from '../api';
import { Character, Lorebook, OllamaModelInfo, CharacterExpression, UserRelationship, CharacterMemory } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const CharacterEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [activeTab, setActiveTab] = useState<'persona' | 'expressions' | 'relationships' | 'memory' | 'model' | 'context' | 'discord' | 'advanced'>('persona');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([]);
  const [installedModels, setInstalledModels] = useState<OllamaModelInfo[]>([]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const expressionAvatarInputRef = useRef<HTMLInputElement>(null);
  const { success, error, info } = useToast();
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
    memories: [],
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
      bound_channels: [],
      auto_react: false,
      reply_on_mention: true,
      tupperbox_proxy: true,
      delete_trigger_message: true
    },
    context_config: {
      max_context_tokens: 4096,
      max_history_messages: 16,
      enable_summary: true,
      enable_memory: true,
      reinforce_system_prompt: true,
      summary_token_threshold: 3000,
      lorebook_ids: []
    }
  });

  const [tagInput, setTagInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [boundChannelInput, setBoundChannelInput] = useState('');
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

  // Memory Form State
  const [memUserId, setMemUserId] = useState('');
  const [memUserName, setMemUserName] = useState('');
  const [memText, setMemText] = useState('');
  const [memCategory, setMemCategory] = useState('fact');
  const [memorySearch, setMemorySearch] = useState('');

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
          setBoundChannelInput((charRes.character.discord_config?.bound_channels || []).join(', '));
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

      const boundChannels = boundChannelInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        ...character,
        discord_config: {
          ...character.discord_config,
          channel_ids: channels,
          bound_channels: boundChannels
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

  const handleExpressionAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await api.uploadImage(formData);
      setNewExpAvatar(res.url);
      success('Expression avatar uploaded!');
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

  // Add Memory Note
  const handleAddMemory = async () => {
    if (!memUserId.trim() || !memText.trim()) {
      error('User Identifier and Memory Text are required');
      return;
    }

    if (!isNew && id) {
      try {
        const res = await api.addCharacterMemory(id, {
          user_identifier: memUserId.trim(),
          user_display_name: memUserName.trim() || memUserId.trim(),
          memory_text: memText.trim(),
          category: memCategory
        });
        setCharacter(prev => ({
          ...prev,
          memories: [res.memory, ...(prev.memories || [])]
        }));
        setMemUserId('');
        setMemUserName('');
        setMemText('');
        success('Added memory note to character mind!');
      } catch (e: any) {
        error(e.message);
      }
    } else {
      const tempMem: CharacterMemory = {
        id: `mem_${Date.now()}`,
        character_id: '',
        user_identifier: memUserId.trim(),
        user_display_name: memUserName.trim() || memUserId.trim(),
        memory_text: memText.trim(),
        category: memCategory,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setCharacter(prev => ({
        ...prev,
        memories: [tempMem, ...(prev.memories || [])]
      }));
      setMemUserId('');
      setMemUserName('');
      setMemText('');
      success('Added memory note!');
    }
  };

  const handleDeleteMemory = async (memoryId: string) => {
    if (!isNew && id) {
      try {
        await api.deleteCharacterMemory(memoryId);
        setCharacter(prev => ({
          ...prev,
          memories: (prev.memories || []).filter(m => m.id !== memoryId)
        }));
        success('Memory deleted');
      } catch (e: any) {
        error(e.message);
      }
    } else {
      setCharacter(prev => ({
        ...prev,
        memories: (prev.memories || []).filter(m => m.id !== memoryId)
      }));
    }
  };

  const handleClearUserMemories = async (userIdentifier: string) => {
    if (!isNew && id) {
      try {
        await api.clearUserMemories(id, userIdentifier);
        setCharacter(prev => ({
          ...prev,
          memories: (prev.memories || []).filter(m => m.user_identifier !== userIdentifier && m.user_display_name !== userIdentifier)
        }));
        info(`Cleared memories for user ${userIdentifier}`);
      } catch (e: any) {
        error(e.message);
      }
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
              Customize persona, emotion avatars, character mind, and Discord channel bindings
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
          { key: 'memory', label: 'Character Mind & Memories', icon: Brain, highlight: true },
          { key: 'model', label: 'Model & Prompts', icon: Cpu },
          { key: 'context', label: 'Context & Budget', icon: BookOpen },
          { key: 'discord', label: 'Discord & Channel Bindings', icon: Bot },
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
                    placeholder="e.g. Grand Mage Valerius"
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
                    placeholder="e.g. Ancient Arcane Scholar & Relic Keeper"
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
                placeholder="e.g. Valerius invites {{user}} into his celestial observatory where ancient scrolls float through the air."
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

        {/* ==================== TAB 2: EMOTION AVATARS ==================== */}
        {activeTab === 'expressions' && (
          <div className="space-y-6">
            <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <Smile className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <strong className="text-amber-300 font-semibold">Dynamic Emotion Avatars & Emojis:</strong>
                <p className="mt-0.5">
                  Assign emotion names (e.g. <code className="text-zinc-100">angry</code>, <code className="text-zinc-100">happy</code>, <code className="text-zinc-100">smug</code>, <code className="text-zinc-100">blushing</code>) with an emoji and custom avatar face image. Both Discord Webhooks and Web Chat switch avatars dynamically according to the AI's emotional expression!
                </p>
              </div>
            </div>

            {/* Existing Expressions */}
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
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Expression Avatar</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newExpAvatar}
                      onChange={e => setNewExpAvatar(e.target.value)}
                      placeholder="Image URL or upload..."
                      className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                    />
                    <input
                      type="file"
                      ref={expressionAvatarInputRef}
                      onChange={handleExpressionAvatarUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => expressionAvatarInputRef.current?.click()}
                      className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1"
                      title="Upload expression image"
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
                  Define specific relationships for user persona names or Discord User IDs (e.g. <code className="text-zinc-100">Father</code>, <code className="text-zinc-100">Friend</code>, <code className="text-zinc-100">Rival</code>). The character will adjust its tone, affinity, and directives exclusively for that user.
                </p>
              </div>
            </div>

            {/* List */}
            <div>
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-3">
                Configured Relationships ({(character.relationships || []).length})
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
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-rose-400" />
                <span>Add User Relationship Bond</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">User Identifier (Name or Discord ID)</label>
                  <input
                    type="text"
                    value={relUserIdentifier}
                    onChange={e => setRelUserIdentifier(e.target.value)}
                    placeholder="e.g. Father or 1234567890"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Relationship Type</label>
                  <select
                    value={relType}
                    onChange={e => setRelType(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  >
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Friend">Close Friend / Ally</option>
                    <option value="Rival">Rival</option>
                    <option value="Lover">Lover / Partner</option>
                    <option value="Master">Master / Mentor</option>
                    <option value="Apprentice">Apprentice / Student</option>
                    <option value="Custom">Custom Bond</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Affinity</span>
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
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Behavioral Directives</label>
                <textarea
                  rows={2}
                  value={relNotes}
                  onChange={e => setRelNotes(e.target.value)}
                  placeholder="e.g. Treat {{user}} with deep parental respect and protectiveness..."
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-sans"
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

        {/* ==================== TAB 4: CHARACTER MIND & MEMORIES ==================== */}
        {activeTab === 'memory' && (
          <div className="space-y-6">
            <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-2xl flex items-start gap-3">
              <Brain className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <strong className="text-purple-300 font-semibold">Character Long-Term Mind & Recalled Memory:</strong>
                <p className="mt-0.5">
                  The character maintains a persistent mind of key facts, preferences, and events learned about users over time. Stored memories are smartly shared and recalled whenever users or topics are mentioned across conversations.
                </p>
              </div>
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <div>
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Enable Character Mind & Memory Retention</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">Automatically remember facts about users and inject them naturally into future conversations.</p>
              </div>
              <input
                type="checkbox"
                checked={character.context_config?.enable_memory !== false}
                onChange={e => setCharacter(prev => ({
                  ...prev,
                  context_config: { ...prev.context_config!, enable_memory: e.target.checked }
                }))}
                className="w-5 h-5 accent-brand-500 cursor-pointer"
              />
            </div>

            {/* Saved Memories List with Search */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Saved Memories & Facts ({(character.memories || []).length})
                </h3>
                <input
                  type="text"
                  value={memorySearch}
                  onChange={e => setMemorySearch(e.target.value)}
                  placeholder="Search memories or user names..."
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 w-full sm:w-64"
                />
              </div>

              {(character.memories || []).length === 0 ? (
                <div className="text-center py-8 bg-zinc-900/40 rounded-xl border border-zinc-800 text-zinc-500 text-xs">
                  No memories stored yet. As users talk with this character, memories are automatically retained here!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(character.memories || [])
                    .filter(m => {
                      if (!memorySearch.trim()) return true;
                      const q = memorySearch.toLowerCase();
                      return (
                        (m.user_display_name || '').toLowerCase().includes(q) ||
                        (m.user_identifier || '').toLowerCase().includes(q) ||
                        (m.memory_text || '').toLowerCase().includes(q)
                      );
                    })
                    .map(mem => (
                      <div
                        key={mem.id}
                        className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-zinc-200">{mem.user_display_name || mem.user_identifier}</span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${mem.user_identifier === 'global' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-zinc-500'}`}>
                              {mem.user_identifier === 'global' ? '🌐 Global Fact' : `ID: ${mem.user_identifier}`}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {new Date(mem.updated_at || mem.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-zinc-300 italic bg-zinc-950/60 px-2.5 py-1.5 rounded-lg border border-zinc-850">
                            {mem.memory_text}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {mem.user_identifier !== 'global' && (
                            <button
                              onClick={() => handleClearUserMemories(mem.user_identifier)}
                              className="px-2 py-1 text-[11px] text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 rounded-lg border border-zinc-800"
                              title="Clear all memories for this user"
                            >
                              Wipe User
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteMemory(mem.id)}
                            className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg"
                            title="Delete memory"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Add Memory Note Manually */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-400" />
                  <span>Add Memory Note to Character Mind</span>
                </h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMemUserId('global');
                      setMemUserName('Global Fact (All Users)');
                    }}
                    className="px-2.5 py-1 text-[11px] bg-purple-950/50 hover:bg-purple-900/50 text-purple-300 border border-purple-500/30 rounded-lg font-medium"
                  >
                    Set as Global Shared Fact
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">User Identifier (Discord ID, Username, or 'global') *</label>
                  <input
                    type="text"
                    value={memUserId}
                    onChange={e => setMemUserId(e.target.value)}
                    placeholder="e.g. 123456789012, Joshua, or global"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">User Display Name / Label</label>
                  <input
                    type="text"
                    value={memUserName}
                    onChange={e => setMemUserName(e.target.value)}
                    placeholder="e.g. Lord Joshua"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Recalled Fact / Memory Note *</label>
                <textarea
                  rows={2}
                  value={memText}
                  onChange={e => setMemText(e.target.value)}
                  placeholder="e.g. Joshua gave Valerius a rare astronomical star-chart from the eastern peaks..."
                  className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-sans"
                />
              </div>

              <button
                type="button"
                onClick={handleAddMemory}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                Add Memory Note
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: MODEL & PROMPTS ==================== */}
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
                Custom System Prompt Directives
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

        {/* ==================== TAB 6: CONTEXT & MEMORY TUNING ==================== */}
        {activeTab === 'context' && (
          <div className="space-y-6">
            {/* World Books & Lorebook System */}
            <div className="bg-zinc-900/60 rounded-2xl border border-zinc-800 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-brand-400" />
                <div>
                  <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                    Attached World Books & Lorebooks
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Entries from attached world books are dynamically scanned and injected into context when trigger keywords are mentioned.
                  </p>
                </div>
              </div>

              {lorebooks.length === 0 ? (
                <div className="text-center py-6 bg-zinc-950/50 rounded-xl border border-zinc-800 text-zinc-500 text-xs">
                  No World Books created yet. Visit <button onClick={() => navigate('/lorebooks')} className="text-brand-400 hover:underline">World Books & Lore</button> to create one.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pb-1">
                    <label className="flex items-center gap-2 text-xs text-zinc-300 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(character.context_config?.lorebook_ids || []).length === 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setCharacter(prev => ({
                              ...prev,
                              context_config: { ...prev.context_config!, lorebook_ids: [] }
                            }));
                          } else {
                            setCharacter(prev => ({
                              ...prev,
                              context_config: { ...prev.context_config!, lorebook_ids: lorebooks.map(b => b.id) }
                            }));
                          }
                        }}
                        className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
                      />
                      <span>Auto-Scan All Active World Books (Recommended)</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lorebooks.map(book => {
                      const isSelected = (character.context_config?.lorebook_ids || []).length === 0 ||
                                        (character.context_config?.lorebook_ids || []).includes(book.id);
                      return (
                        <div
                          key={book.id}
                          onClick={() => {
                            const currentIds = character.context_config?.lorebook_ids || [];
                            let newIds: string[];
                            if (currentIds.length === 0) {
                              newIds = lorebooks.map(b => b.id).filter(id => id !== book.id);
                            } else if (currentIds.includes(book.id)) {
                              newIds = currentIds.filter(id => id !== book.id);
                            } else {
                              newIds = [...currentIds, book.id];
                            }
                            setCharacter(prev => ({
                              ...prev,
                              context_config: { ...prev.context_config!, lorebook_ids: newIds }
                            }));
                          }}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            isSelected
                              ? 'bg-brand-950/20 border-brand-500/40 text-zinc-100'
                              : 'bg-zinc-950/40 border-zinc-800 text-zinc-400 opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 accent-brand-500 rounded mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-xs text-zinc-200 truncate">{book.name}</span>
                              <span className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                                {book.entries?.length || (book as any).entries_count || 0} entries
                              </span>
                            </div>
                            {book.description && (
                              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{book.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Weak Model Rule Reinforcement */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-zinc-200 block uppercase tracking-wider">
                  Weak Model Persona Reinforcement (Recency Anchor)
                </span>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Injects an anti-break roleplay reminder at the end of each turn so 1B–8B local Ollama models (e.g. Llama-3.2 1B/3B, Qwen 2.5, Mistral) never lose character persona or write user dialogue.
                </p>
              </div>
              <input
                type="checkbox"
                checked={character.context_config?.reinforce_system_prompt !== false}
                onChange={e => setCharacter(prev => ({
                  ...prev,
                  context_config: {
                    ...prev.context_config!,
                    reinforce_system_prompt: e.target.checked
                  }
                }))}
                className="w-5 h-5 accent-brand-500 cursor-pointer shrink-0"
              />
            </div>

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

        {/* ==================== TAB 7: DISCORD & CHANNEL BINDINGS ==================== */}
        {activeTab === 'discord' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Trigger Prefix (Tupperbox Proxy)
                </label>
                <input
                  type="text"
                  value={character.discord_config?.trigger_prefix || ''}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, trigger_prefix: e.target.value }
                  }))}
                  placeholder="e.g. mage: or !mage"
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Webhook URL (Optional direct dispatch)
                </label>
                <input
                  type="text"
                  value={character.discord_config?.webhook_url || ''}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, webhook_url: e.target.value }
                  }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Dedicated Bound Channels (Always Answer) */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2">
              <label className="block text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                Permanent Bound Channel IDs (Always Answers This Channel)
              </label>
              <p className="text-[11px] text-zinc-400">
                In these Discord text channels, this character will automatically respond to every message without requiring any prefix or bot mention. User messages are kept intact and never deleted.
              </p>
              <input
                type="text"
                value={boundChannelInput}
                onChange={e => setBoundChannelInput(e.target.value)}
                placeholder="e.g. 123456789012345678, 987654321098765432 (comma-separated)"
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Proxy & Deletion Behavior */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={character.discord_config?.delete_trigger_message !== false}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, delete_trigger_message: e.target.checked }
                  }))}
                  className="w-4 h-4 mt-0.5 accent-brand-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-zinc-200">Delete Trigger Message on Prefix</span>
                  <p className="text-zinc-400 text-[11px] mt-0.5">When someone uses the Tupperbox prefix (e.g. <code className="text-zinc-300">mage: Hello</code>), delete the user trigger message so only the character speaks. Mentions and bound channels never delete messages.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(character.discord_config?.reply_on_mention)}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, reply_on_mention: e.target.checked }
                  }))}
                  className="w-4 h-4 mt-0.5 accent-brand-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-zinc-200">Reply on Mention</span>
                  <p className="text-zinc-400 text-[11px] mt-0.5">Allow this character to respond when tagged or mentioned.</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* ==================== TAB 8: ADVANCED ==================== */}
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
