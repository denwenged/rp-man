import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Plus,
  Send,
  Trash2,
  Sparkles,
  Bot,
  User,
  Play,
  RotateCcw,
  Download,
  Info,
  Check,
  CheckCircle2
} from 'lucide-react';
import { api } from '../api';
import { Character, GroupSession, GroupMessage } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const GroupChatPage: React.FC = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [groups, setGroups] = useState<GroupSession[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<GroupSession | null>(null);
  const [groupCharacters, setGroupCharacters] = useState<Character[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);

  // Input & Turn State
  const [userInput, setUserInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [userPersonaName, setUserPersonaName] = useState('User');

  // New Group Modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('Tavern Group Banter');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [newScenario, setNewScenario] = useState('Characters gather around a table in the tavern sharing tales of their recent journeys.');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { success, error, info } = useToast();

  useEffect(() => {
    const fetchChars = async () => {
      try {
        const [charsRes, grpsRes] = await Promise.all([
          api.getCharacters(),
          api.getGroupSessions()
        ]);
        setCharacters(charsRes.characters);
        setGroups(grpsRes.groups);

        if (charsRes.characters.length >= 2 && selectedCharIds.length === 0) {
          setSelectedCharIds([charsRes.characters[0].id, charsRes.characters[1].id]);
        }

        if (grpsRes.groups.length > 0) {
          loadGroup(grpsRes.groups[0].id);
        }
      } catch (e: any) {
        error(`Failed to load data: ${e.message}`);
      }
    };
    fetchChars();
    if (user?.username) {
      setUserPersonaName(user.username);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generating]);

  const loadGroup = async (groupId: string) => {
    try {
      const res = await api.getGroupSession(groupId);
      setActiveGroupId(res.group.id);
      setActiveGroup(res.group);
      setGroupCharacters(res.characters);
      setMessages(res.messages);
      if (res.group.user_persona_name) {
        setUserPersonaName(res.group.user_persona_name);
      }
    } catch (e: any) {
      error(`Failed to load group: ${e.message}`);
    }
  };

  const handleCreateGroup = async () => {
    if (selectedCharIds.length < 2) {
      error('Please select at least 2 characters for the group room.');
      return;
    }

    try {
      const res = await api.createGroupSession({
        title: newTitle.trim() || 'Group Roleplay',
        character_ids: selectedCharIds,
        scenario: newScenario.trim(),
        user_persona_name: userPersonaName
      });

      setGroups(prev => [res.group, ...prev]);
      setShowModal(false);
      loadGroup(res.group.id);
      success('Multi-character room created!');
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleDeleteGroup = async (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteGroupSession(groupId);
      const remaining = groups.filter(g => g.id !== groupId);
      setGroups(remaining);
      if (activeGroupId === groupId) {
        if (remaining.length > 0) {
          loadGroup(remaining[0].id);
        } else {
          setActiveGroupId(null);
          setActiveGroup(null);
          setMessages([]);
        }
      }
      info('Group room deleted');
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || !activeGroupId || generating) return;

    const text = userInput.trim();
    setUserInput('');

    try {
      const res = await api.sendGroupMessage(activeGroupId, text, userPersonaName);
      setMessages(prev => [...prev, res.message]);

      // Trigger automatic reply from a character
      handleTriggerTurn();
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleTriggerTurn = async (characterId?: string) => {
    if (!activeGroupId || generating) return;
    setGenerating(true);

    try {
      const res = await api.triggerGroupTurn(activeGroupId, characterId);
      setMessages(prev => [...prev, res.message]);
    } catch (err: any) {
      error(`Turn generation failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const formatRPContent = (text: string) => {
    if (!text) return '';
    let formatted = text.replace(/\*([^\*]+)\*/g, '<em class="text-zinc-400 font-normal">$1</em>');
    formatted = formatted.replace(/"([^"]+)"/g, '<span class="text-zinc-100 font-medium">"$1"</span>');
    return formatted;
  };

  const exportGroupChat = () => {
    if (messages.length === 0) return;
    const transcript = messages
      .map(m => `### ${m.sender_name}\n${m.content}\n`)
      .join('\n');

    const blob = new Blob([transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Group_RP_${activeGroup?.title || 'Room'}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col md:flex-row gap-4 animate-in fade-in duration-300">
      {/* LEFT SIDEBAR: Group Rooms */}
      <div className="w-full md:w-72 bg-zinc-950 border border-zinc-800/80 rounded-2xl flex flex-col overflow-hidden shadow-matte shrink-0">
        <div className="p-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
              Group RP Rooms
            </span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1 text-zinc-400 hover:text-brand-300 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Create Group Room"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* User Persona */}
        <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950">
          <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Your Persona Name
          </label>
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={userPersonaName}
              onChange={e => setUserPersonaName(e.target.value)}
              placeholder="Your Name"
              className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Rooms List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              No group rooms. Click "+" above to create one!
            </div>
          ) : (
            groups.map(g => {
              const isActive = g.id === activeGroupId;
              return (
                <div
                  key={g.id}
                  onClick={() => loadGroup(g.id)}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors text-xs ${
                    isActive
                      ? 'bg-zinc-900 text-white border border-zinc-700/80 shadow-matte'
                      : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{g.title}</p>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {g.character_ids?.length || 0} characters
                    </p>
                  </div>
                  <button
                    onClick={e => handleDeleteGroup(g.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Active Group Room */}
      <div className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-2xl flex flex-col overflow-hidden shadow-matte">
        {activeGroup ? (
          <>
            {/* Group Header & Active Characters */}
            <div className="p-3.5 px-4 bg-zinc-900/40 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>{activeGroup.title}</span>
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  {groupCharacters.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800"
                    >
                      <img
                        src={c.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.name}`}
                        alt={c.name}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span className="text-[11px] font-medium text-zinc-300">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                {/* Trigger Next Auto Turn */}
                <button
                  onClick={() => handleTriggerTurn()}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-glow-violet transition-all active:scale-95 disabled:opacity-50"
                  title="Make next character respond to dialogue"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>{generating ? 'Responding...' : 'Next Turn'}</span>
                </button>

                {/* Specific Character Speaker Trigger */}
                <div className="flex items-center gap-1">
                  {groupCharacters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleTriggerTurn(c.id)}
                      disabled={generating}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-lg text-xs font-medium transition-colors"
                      title={`Force ${c.name} to speak`}
                    >
                      {c.name.split(' ')[0]}
                    </button>
                  ))}
                </div>

                <button
                  onClick={exportGroupChat}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg border border-zinc-800"
                  title="Export Transcript"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {messages.map((msg) => {
                const isUser = msg.sender_type === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3.5 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    <img
                      src={msg.sender_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.sender_name}`}
                      alt={msg.sender_name}
                      className="w-8 h-8 rounded-xl object-cover bg-zinc-900 border border-zinc-800 shrink-0 mt-1 shadow-sm"
                    />

                    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 max-w-[85%]`}>
                      <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-zinc-500">
                        <span className="font-semibold text-zinc-300">{msg.sender_name}</span>
                        {msg.expression && (
                          <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                            {msg.expression_emoji || '✨'} {msg.expression}
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed transition-all shadow-sm ${
                          isUser
                            ? 'bg-zinc-800/90 text-zinc-100 border border-zinc-700/60 rounded-tr-sm'
                            : 'bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-sm rp-content'
                        }`}
                      >
                        <div
                          className="whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: formatRPContent(msg.content) }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {generating && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 italic p-2 font-mono">
                  <div className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                  <span>A character is composing their turn...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3.5 bg-zinc-900/60 border-t border-zinc-800">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  placeholder={`Speak or perform an action in ${activeGroup.title}...`}
                  className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500 font-sans"
                />
                <button
                  type="submit"
                  disabled={!userInput.trim() || generating}
                  className="h-10 px-4 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl font-semibold shadow-glow-violet transition-all flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <Users className="w-12 h-12 text-zinc-600 mb-3" />
            <h3 className="text-base font-bold text-zinc-300">Multi-Character Roleplay Lounge</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              Create a group room with 2 or more characters and watch them talk, debate, and banter with each other!
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-glow-violet transition-all"
            >
              Create Group Room
            </button>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-400" />
              <span>Create Multi-Character Room</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Room Title
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. The Obsidian Tavern Lounge"
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Participating Characters (Pick 2 or more)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {characters.map(char => {
                  const isSelected = selectedCharIds.includes(char.id);
                  return (
                    <div
                      key={char.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCharIds(prev => prev.filter(id => id !== char.id));
                        } else {
                          setSelectedCharIds(prev => [...prev, char.id]);
                        }
                      }}
                      className={`p-2 rounded-xl border cursor-pointer flex items-center gap-2 transition-all ${
                        isSelected
                          ? 'bg-brand-950/50 border-brand-500 text-brand-200'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      <img
                        src={char.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${char.name}`}
                        alt={char.name}
                        className="w-6 h-6 rounded-md object-cover"
                      />
                      <span className="text-xs font-bold truncate flex-1">{char.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-brand-400" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">
                Scenario / Starter Topic
              </label>
              <textarea
                rows={3}
                value={newScenario}
                onChange={e => setNewScenario(e.target.value)}
                placeholder="Setting the scene for their interaction..."
                className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-sans leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-glow-violet transition-all active:scale-95"
              >
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
