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
  HelpCircle,
  HardDrive,
  Eye,
  Check
} from 'lucide-react';
import { api } from '../api';
import { Character, Lorebook, OllamaModelInfo } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';

export const CharacterEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  const [activeTab, setActiveTab] = useState<'persona' | 'model' | 'context' | 'discord' | 'advanced'>('persona');
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
      // Process channel IDs
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
              Configure persona, prompt instructions, context limits, and Discord triggers
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
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-brand-400' : 'text-zinc-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-matte space-y-6">
        {/* ==================== TAB 1: PERSONA & IDENTITY ==================== */}
        {activeTab === 'persona' && (
          <div className="space-y-6">
            {/* Name, Tagline, Avatar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Avatar Uploader & Preview */}
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
                <div className="flex gap-2">
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                  </button>
                </div>
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

              {/* Name, Tagline, Public Toggle, Tags */}
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

                {/* Tags */}
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
                      placeholder="Type a tag (e.g. Sci-Fi) and press Enter"
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

            {/* Persona Description */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Character Persona & Physical Description
              </label>
              <textarea
                rows={4}
                value={character.description || ''}
                onChange={e => setCharacter(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe appearance, age, clothing, cybernetics/weapons, traits, background..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* Personality Traits */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Personality Traits & Quirks
              </label>
              <textarea
                rows={2}
                value={character.personality || ''}
                onChange={e => setCharacter(prev => ({ ...prev, personality: e.target.value }))}
                placeholder="e.g. Sarcastic, observant, loyal, loves synth-coffee, secretly protective..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* Scenario */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Roleplay Scenario / Setting
              </label>
              <textarea
                rows={2}
                value={character.scenario || ''}
                onChange={e => setCharacter(prev => ({ ...prev, scenario: e.target.value }))}
                placeholder="e.g. {{user}} meets Aria in a rain-soaked alley noodle bar after a hack gone wrong."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* First Message (Greeting) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Initial Greeting / First Message
              </label>
              <textarea
                rows={4}
                value={character.first_mes || ''}
                onChange={e => setCharacter(prev => ({ ...prev, first_mes: e.target.value }))}
                placeholder="*She leans against the neon vending machine, exhaling steam into the rain.*\n\n&quot;You're late. What's the payload look like?&quot;"
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* Alternate Greetings */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Alternate Greetings (Optional)
              </label>
              <div className="space-y-2">
                {(character.alternate_greetings || []).map((greeting, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                    <span className="text-xs font-mono text-zinc-500 mt-1">#{idx + 1}</span>
                    <p className="flex-1 text-xs text-zinc-300 leading-relaxed">{greeting}</p>
                    <button
                      onClick={() => removeGreeting(idx)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={newGreetingInput}
                    onChange={e => setNewGreetingInput(e.target.value)}
                    placeholder="Add an alternate greeting for variety..."
                    className="flex-1 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={addGreeting}
                    className="self-end px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Dialogue Examples */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Dialogue Examples (Tavern / Character Format)
              </label>
              <textarea
                rows={4}
                value={character.mes_example || ''}
                onChange={e => setCharacter(prev => ({ ...prev, mes_example: e.target.value }))}
                placeholder="<START>\n{{user}}: &quot;Did you find the data?&quot;\n{{char}}: *A smirk tugs at her lips.* &quot;Naturally. What took you so long?&quot;"
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500 leading-relaxed"
              />
            </div>
          </div>
        )}

        {/* ==================== TAB 2: AI MODEL & PROMPT ENGINEERING ==================== */}
        {activeTab === 'model' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Provider Selection */}
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

              {/* Model Name */}
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
                    placeholder="e.g. llama3.2:3b, qwen2.5:7b, gpt-4o-mini"
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
                      className="px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-300 text-xs focus:outline-none"
                    >
                      <option value="">Installed Ollama Models...</option>
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

            {/* System Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Custom System Prompt / Directives
                </label>
                <span className="text-[11px] text-zinc-500 font-mono">
                  Macros: <code className="text-brand-300">{"{{char}}"}</code>, <code className="text-brand-300">{"{{user}}"}</code>, <code className="text-brand-300">{"{{scenario}}"}</code>, <code className="text-brand-300">{"{{time}}"}</code>
                </span>
              </div>
              <textarea
                rows={5}
                value={character.system_prompt || ''}
                onChange={e => setCharacter(prev => ({ ...prev, system_prompt: e.target.value }))}
                placeholder="You are {{char}}. Roleplay with {{user}} in standard asterisks and quotes notation. Never break character."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500 leading-relaxed"
              />
            </div>

            {/* Post History Instructions */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Special Post-History Instructions / Anti-Break Guard
              </label>
              <textarea
                rows={2}
                value={character.post_history_instructions || ''}
                onChange={e => setCharacter(prev => ({ ...prev, post_history_instructions: e.target.value }))}
                placeholder="e.g. Maintain concise responses under 200 words. Never output generic assistant apologies."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500 leading-relaxed"
              />
            </div>

            {/* Generation Parameters Sliders */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
              <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-brand-400" />
                <span>Hyperparameters & Sampling</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Temperature */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-300 mb-1">
                    <span>Temperature</span>
                    <span className="font-mono text-brand-400 font-bold">
                      {character.model_config?.parameters?.temperature ?? 0.8}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={character.model_config?.parameters?.temperature ?? 0.8}
                    onChange={e => setCharacter(prev => ({
                      ...prev,
                      model_config: {
                        ...prev.model_config!,
                        parameters: { ...prev.model_config!.parameters, temperature: parseFloat(e.target.value) }
                      }
                    }))}
                    className="w-full accent-brand-500"
                  />
                </div>

                {/* Top P */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-300 mb-1">
                    <span>Top P</span>
                    <span className="font-mono text-brand-400 font-bold">
                      {character.model_config?.parameters?.top_p ?? 0.9}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={character.model_config?.parameters?.top_p ?? 0.9}
                    onChange={e => setCharacter(prev => ({
                      ...prev,
                      model_config: {
                        ...prev.model_config!,
                        parameters: { ...prev.model_config!.parameters, top_p: parseFloat(e.target.value) }
                      }
                    }))}
                    className="w-full accent-brand-500"
                  />
                </div>

                {/* Max Tokens */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-300 mb-1">
                    <span>Max Tokens</span>
                    <span className="font-mono text-brand-400 font-bold">
                      {character.model_config?.parameters?.max_tokens ?? 350}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="1200"
                    step="50"
                    value={character.model_config?.parameters?.max_tokens ?? 350}
                    onChange={e => setCharacter(prev => ({
                      ...prev,
                      model_config: {
                        ...prev.model_config!,
                        parameters: { ...prev.model_config!.parameters, max_tokens: parseInt(e.target.value) }
                      }
                    }))}
                    className="w-full accent-brand-500"
                  />
                </div>

                {/* Ollama Keep-Alive (RAM management) */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-300 mb-1">
                    <span>Ollama Keep-Alive</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {character.model_config?.keep_alive || '5m'}
                    </span>
                  </div>
                  <select
                    value={character.model_config?.keep_alive || '5m'}
                    onChange={e => setCharacter(prev => ({
                      ...prev,
                      model_config: { ...prev.model_config!, keep_alive: e.target.value }
                    }))}
                    className="w-full px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200"
                  >
                    <option value="0">0 (Unload immediately after reply - Low RAM)</option>
                    <option value="1m">1m (Keep 1 minute)</option>
                    <option value="5m">5m (Standard)</option>
                    <option value="15m">15m (Fast multi-turn)</option>
                    <option value="-1">-1 (Stay in VRAM indefinitely)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: CONTEXT & MEMORY STRATEGY ==================== */}
        {activeTab === 'context' && (
          <div className="space-y-6">
            <div className="p-4 bg-brand-950/20 border border-brand-500/30 rounded-2xl flex items-start gap-3">
              <HardDrive className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
              <div className="text-xs text-zinc-300 leading-relaxed">
                <strong className="text-brand-300 font-semibold">Low-Power Server Context Optimization:</strong>
                <p className="mt-0.5">
                  Sliding window context keeps conversations fluid and responsive on ZimaOS servers by limiting input tokens. Rolling summaries compress old memories without losing key plot points.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Max Context Window Tokens */}
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
                <p className="text-[11px] text-zinc-400 mt-2">
                  Total token budget for System Prompt + Lore + Dialogue History.
                </p>
              </div>

              {/* Max History Messages */}
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
                <p className="text-[11px] text-zinc-400 mt-2">
                  Recent turns retained verbatim before rolling summary takes over.
                </p>
              </div>
            </div>

            {/* World Books & Lorebooks selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                Attached World Lorebooks (Keyword Injected)
              </label>
              {lorebooks.length === 0 ? (
                <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-800 text-xs text-zinc-400">
                  No Lorebooks created yet. Go to World Books to add lore entries!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {lorebooks.map(book => {
                    const isAttached = (character.context_config?.lorebook_ids || []).includes(book.id);
                    return (
                      <div
                        key={book.id}
                        onClick={() => {
                          const current = character.context_config?.lorebook_ids || [];
                          const updated = isAttached
                            ? current.filter(id => id !== book.id)
                            : [...current, book.id];
                          setCharacter(prev => ({
                            ...prev,
                            context_config: { ...prev.context_config!, lorebook_ids: updated }
                          }));
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isAttached
                            ? 'bg-brand-950/40 border-brand-500/50 text-brand-200 shadow-glow-violet'
                            : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-zinc-200 truncate">{book.name}</h4>
                          <p className="text-[11px] text-zinc-400 line-clamp-1">{book.description || 'No description'}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center border shrink-0 ml-3 ${
                          isAttached ? 'bg-brand-600 border-brand-500 text-white' : 'border-zinc-700'
                        }`}>
                          {isAttached && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: DISCORD & WEBHOOKS ==================== */}
        {activeTab === 'discord' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Trigger Prefix */}
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
                <p className="text-[11px] text-zinc-500 mt-1">
                  Typing <code className="text-zinc-300">aria: hello</code> in Discord will trigger this character.
                </p>
              </div>

              {/* Trigger Suffix */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                  Trigger Suffix (Optional)
                </label>
                <input
                  type="text"
                  value={character.discord_config?.trigger_suffix || ''}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, trigger_suffix: e.target.value }
                  }))}
                  placeholder="e.g. -a"
                  className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Dedicated Channel IDs */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Dedicated Channel IDs (Comma-separated)
              </label>
              <input
                type="text"
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                placeholder="e.g. 123456789012345678, 987654321098765432"
                className="w-full px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs font-mono focus:outline-none focus:border-brand-500"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Any message sent in these Discord channels automatically routes to this character without needing a prefix.
              </p>
            </div>

            {/* Custom Outbound Webhook URL */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Direct Webhook URL Override (Optional)
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
              <p className="text-[11px] text-zinc-500 mt-1">
                If provided, character responses will be posted directly through this Discord webhook.
              </p>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={character.discord_config?.tupperbox_proxy ?? true}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, tupperbox_proxy: e.target.checked }
                  }))}
                  className="rounded accent-brand-500"
                />
                <span className="text-xs font-medium text-zinc-300">Tupperbox Proxy Mode</span>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={character.discord_config?.reply_on_mention ?? true}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, reply_on_mention: e.target.checked }
                  }))}
                  className="rounded accent-brand-500"
                />
                <span className="text-xs font-medium text-zinc-300">Reply on Bot Mention</span>
              </label>

              <label className="flex items-center gap-3 p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={character.discord_config?.auto_react ?? false}
                  onChange={e => setCharacter(prev => ({
                    ...prev,
                    discord_config: { ...prev.discord_config!, auto_react: e.target.checked }
                  }))}
                  className="rounded accent-brand-500"
                />
                <span className="text-xs font-medium text-zinc-300">Auto-React to Messages</span>
              </label>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: ADVANCED & NOTES ==================== */}
        {activeTab === 'advanced' && (
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Creator Notes & Metadata
              </label>
              <textarea
                rows={3}
                value={character.creator_notes || ''}
                onChange={e => setCharacter(prev => ({ ...prev, creator_notes: e.target.value }))}
                placeholder="Notes about lore compatibility, recommended temperature, origins, or authors..."
                className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 text-xs focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
              />
            </div>

            {/* Visibility Toggle */}
            <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-zinc-200">Public Visibility</h4>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Public characters are accessible to all registered users on this server.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={character.is_public ?? true}
                  onChange={e => setCharacter(prev => ({ ...prev, is_public: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
