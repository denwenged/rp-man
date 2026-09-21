import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Send,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Check,
  X,
  Sparkles,
  User,
  Bot,
  Layers,
  Download,
  Info,
  Clock,
  Zap,
  RotateCcw,
  Smile,
  Heart
} from 'lucide-react';
import { api } from '../api';
import { Character, ChatSession, ChatMessage, UserRelationship } from '../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

export const ChatPlaygroundPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCharId = searchParams.get('character_id');

  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [swipingMsgId, setSwipingMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // User Persona settings & Relationships
  const [userName, setUserName] = useState('User');
  const [activeRel, setActiveRel] = useState<UserRelationship | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [inspectorData, setInspectorData] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { user } = useAuth();
  const { success, error, info } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchChars = async () => {
      try {
        const res = await api.getCharacters();
        setCharacters(res.characters);

        if (res.characters.length > 0) {
          const match = requestedCharId
            ? res.characters.find(c => c.id === requestedCharId) || res.characters[0]
            : res.characters[0];
          setSelectedChar(match);
        }
      } catch (e: any) {
        error(`Failed to load characters: ${e.message}`);
      }
    };
    fetchChars();
    if (user?.username) {
      setUserName(user.username);
    }
  }, [requestedCharId]);

  useEffect(() => {
    if (!selectedChar) return;
    const fetchSessions = async () => {
      try {
        const res = await api.getChatSessions(selectedChar.id);
        setSessions(res.sessions);

        // Check if there's a defined relationship for this user persona
        const matched = selectedChar.relationships?.find(r => r.user_identifier.toLowerCase() === userName.toLowerCase());
        setActiveRel(matched || null);

        if (res.sessions.length > 0) {
          loadSession(res.sessions[0].id);
        } else {
          createNewSession(selectedChar.id);
        }
      } catch (e: any) {
        error(`Failed to load sessions: ${e.message}`);
      }
    };
    fetchSessions();
  }, [selectedChar?.id]);

  useEffect(() => {
    if (selectedChar) {
      const matched = selectedChar.relationships?.find(r => r.user_identifier.toLowerCase() === userName.toLowerCase());
      setActiveRel(matched || null);
    }
  }, [userName, selectedChar]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const loadSession = async (sessionId: string) => {
    try {
      const res = await api.getChatSession(sessionId);
      setActiveSessionId(res.session.id);
      setMessages(res.messages);
      if (res.session.user_persona_name) {
        setUserName(res.session.user_persona_name);
      }
    } catch (e: any) {
      error(`Failed to load chat history: ${e.message}`);
    }
  };

  const createNewSession = async (charId = selectedChar?.id) => {
    if (!charId) return;
    try {
      const res = await api.createChatSession({
        character_id: charId,
        user_persona_name: userName,
        greeting_index: 0
      });
      setSessions(prev => [res.session, ...prev]);
      setActiveSessionId(res.session.id);
      setMessages(res.messages);
      success('Started new chat session!');
    } catch (e: any) {
      error(`Failed to start chat: ${e.message}`);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteChatSession(sessionId);
      const remaining = sessions.filter(s => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        if (remaining.length > 0) {
          loadSession(remaining[0].id);
        } else if (selectedChar) {
          createNewSession(selectedChar.id);
        }
      }
      info('Chat session deleted');
    } catch (err: any) {
      error(err.message);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeSessionId || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      session_id: activeSessionId,
      role: 'user',
      content: text,
      swipes: [text],
      swipe_index: 0,
      user_persona_name: userName,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await api.sendMessage(activeSessionId, text, userName);
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== tempUserMsg.id);
        return [...withoutTemp, res.userMessage, res.assistantMessage];
      });
    } catch (err: any) {
      error(err.message || 'Generation error');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleSwipe = async (msgId: string, direction: 'left' | 'right') => {
    if (!activeSessionId || swipingMsgId) return;
    setSwipingMsgId(msgId);
    try {
      const res = await api.swipeMessage(activeSessionId, msgId, direction);
      setMessages(prev => prev.map(m => (m.id === msgId ? res.message : m)));
    } catch (err: any) {
      error(err.message || 'Swipe failed');
    } finally {
      setSwipingMsgId(null);
    }
  };

  const startEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditText(msg.content);
  };

  const saveEdit = async (msgId: string) => {
    if (!activeSessionId || !editText.trim()) return;
    try {
      const res = await api.editMessage(activeSessionId, msgId, editText.trim());
      setMessages(prev => prev.map(m => (m.id === msgId ? res.message : m)));
      setEditingMsgId(null);
    } catch (err: any) {
      error(err.message || 'Edit failed');
    }
  };

  const loadInspector = async () => {
    if (!activeSessionId) return;
    try {
      const data = await api.getContextPreview(activeSessionId);
      setInspectorData(data);
      setShowInspector(true);
    } catch (err: any) {
      error('Failed to preview context');
    }
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const charName = selectedChar?.name || 'Character';
    const transcript = messages
      .map(m => {
        const sender = m.role === 'user' ? (m.user_persona_name || userName) : charName;
        return `### ${sender}\n${m.content}\n`;
      })
      .join('\n');

    const blob = new Blob([transcript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${charName}_Chat_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatRPContent = (text: string) => {
    if (!text) return '';
    let formatted = text.replace(/\*([^\*]+)\*/g, '<em class="text-zinc-400 font-normal">$1</em>');
    formatted = formatted.replace(/"([^"]+)"/g, '<span class="text-zinc-100 font-medium">"$1"</span>');
    return formatted;
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] flex flex-col md:flex-row gap-4 animate-in fade-in duration-300">
      {/* LEFT SIDEBAR: Character Picker, Persona & Session History */}
      <div className="w-full md:w-72 bg-zinc-950 border border-zinc-800/80 rounded-2xl flex flex-col overflow-hidden shadow-matte shrink-0">
        {/* Character Selector */}
        <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/40">
          <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
            Active RP Character
          </label>
          <select
            value={selectedChar?.id || ''}
            onChange={e => {
              const char = characters.find(c => c.id === e.target.value);
              if (char) {
                setSelectedChar(char);
                setSearchParams({ character_id: char.id });
              }
            }}
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-100 font-semibold focus:outline-none focus:border-brand-500"
          >
            {characters.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* User Persona & Relationship Bar */}
        <div className="px-3 py-2.5 border-b border-zinc-800/80 bg-zinc-950 space-y-2">
          <div>
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
              Your Persona Name
            </label>
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="e.g. Father, Joshua"
                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Active Relationship Badge */}
          {activeRel ? (
            <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-500/40 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-rose-300">
                <Heart className="w-3.5 h-3.5 fill-rose-400" />
                <span className="font-bold">{activeRel.relationship_type} Bond</span>
              </div>
              <span className="text-[10px] text-rose-400 font-mono font-semibold">
                Affinity: {activeRel.affinity_level}%
              </span>
            </div>
          ) : (
            selectedChar?.relationships && selectedChar.relationships.length > 0 && (
              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <Heart className="w-3 h-3 text-zinc-600" />
                <span>Available bonds: {selectedChar.relationships.map(r => r.user_identifier).join(', ')}</span>
              </div>
            )
          )}
        </div>

        {/* Sessions List Header */}
        <div className="p-3 pb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Chat Sessions
          </span>
          <button
            onClick={() => createNewSession()}
            className="p-1 text-zinc-400 hover:text-brand-300 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Start New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sessions Scrollable List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => {
            const isActive = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors text-xs ${
                  isActive
                    ? 'bg-zinc-900 text-white border border-zinc-700/80 shadow-matte'
                    : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{s.title || 'Chat'}</p>
                  <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                    {new Date(s.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={e => handleDeleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 transition-opacity"
                  title="Delete Chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Active Chat Viewport */}
      <div className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-2xl flex flex-col overflow-hidden shadow-matte">
        {/* Chat Header Bar */}
        <div className="h-14 px-4 bg-zinc-900/40 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={selectedChar?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedChar?.name || 'char'}`}
              alt={selectedChar?.name}
              className="w-8 h-8 rounded-xl object-cover bg-zinc-800 border border-zinc-700 shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100">{selectedChar?.name}</h2>
                {activeRel && (
                  <span className="text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded">
                    {activeRel.relationship_type}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>{selectedChar?.model_config?.model || 'Server Default'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={loadInspector}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold border border-zinc-800 transition-colors"
              title="Inspect compiled System Prompt, Injected Lore, and Token Budget"
            >
              <Info className="w-3.5 h-3.5 text-brand-400" />
              <span className="hidden sm:inline">Context Inspector</span>
            </button>

            <button
              onClick={exportChat}
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-xl transition-colors border border-zinc-800"
              title="Export Markdown Transcript"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isEditing = editingMsgId === msg.id;
            const swipes = msg.swipes || [msg.content];
            const swipeIdx = msg.swipe_index || 0;
            const isSwiping = swipingMsgId === msg.id;

            // Use emotion avatar if available
            const avatarToDisplay = isUser
              ? (user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${userName}`)
              : (msg.expression_avatar || selectedChar?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedChar?.name}`);

            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3.5 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <img
                  src={avatarToDisplay}
                  alt="Avatar"
                  className="w-8 h-8 rounded-xl object-cover bg-zinc-900 border border-zinc-800 shrink-0 mt-1 shadow-sm"
                />

                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 max-w-[85%]`}>
                  <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-zinc-500">
                    <span className="font-semibold text-zinc-400">
                      {isUser ? (msg.user_persona_name || userName) : selectedChar?.name}
                    </span>
                    {!isUser && msg.expression && (
                      <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                        <span>{msg.expression_emoji || '✨'}</span>
                        <span className="capitalize">{msg.expression}</span>
                      </span>
                    )}
                    {msg.tokens_used ? (
                      <span className="font-mono text-[10px] text-zinc-600">
                        ({msg.tokens_used} tok)
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`p-4 rounded-2xl text-xs leading-relaxed transition-all shadow-sm ${
                      isUser
                        ? 'bg-zinc-800/90 text-zinc-100 border border-zinc-700/60 rounded-tr-sm'
                        : 'bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-sm rp-content'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          rows={4}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          className="w-full p-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-100 focus:outline-none focus:border-brand-500 font-sans"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingMsgId(null)}
                            className="p-1 text-zinc-400 hover:text-zinc-200"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => saveEdit(msg.id)}
                            className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={{ __html: formatRPContent(msg.content) }}
                      />
                    )}
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-zinc-500">
                    {!isUser && !isEditing && (
                      <div className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800 rounded-lg px-1.5 py-0.5">
                        <button
                          onClick={() => handleSwipe(msg.id, 'left')}
                          disabled={swipeIdx === 0 || isSwiping}
                          className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                          title="Previous Swipe"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-mono text-[10px] text-zinc-400 font-bold px-1">
                          {isSwiping ? '...' : `${swipeIdx + 1}/${swipes.length}`}
                        </span>
                        <button
                          onClick={() => handleSwipe(msg.id, 'right')}
                          disabled={isSwiping}
                          className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
                          title="Next / Regenerate Swipe"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {!isEditing && (
                      <button
                        onClick={() => startEdit(msg)}
                        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Edit Message"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex items-center gap-3 max-w-sm">
              <img
                src={selectedChar?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedChar?.name}`}
                alt="Avatar"
                className="w-8 h-8 rounded-xl object-cover bg-zinc-900 border border-zinc-800 shrink-0"
              />
              <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 rounded-tl-sm flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce [animation-delay:0.4s]" />
                <span className="text-xs text-zinc-400 ml-1 italic font-mono">
                  {selectedChar?.name} is thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Bar */}
        <div className="p-4 bg-zinc-900/60 border-t border-zinc-800/80">
          <form onSubmit={handleSendMessage} className="flex items-end gap-2.5">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Send a message or action to ${selectedChar?.name || 'Character'}...`}
              className="flex-1 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-brand-500 resize-none font-sans leading-relaxed"
            />
            <button
              type="submit"
              disabled={sending || !inputText.trim()}
              className="h-12 px-5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl font-semibold shadow-glow-violet transition-all active:scale-95 flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Context Inspector Modal */}
      {showInspector && inspectorData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-brand-400" />
                <h3 className="text-sm font-bold text-zinc-100">Context, Lore & Mind Inspector</h3>
              </div>
              <button
                onClick={() => setShowInspector(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Estimated Tokens</span>
                  <p className="text-xl font-bold font-mono text-brand-300 mt-0.5">
                    {inspectorData.estimatedTokens}
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Active Lore</span>
                  <p className="text-xl font-bold font-mono text-emerald-300 mt-0.5">
                    {inspectorData.injectedLore?.length || 0}
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Recalled Memories</span>
                  <p className="text-xl font-bold font-mono text-purple-300 mt-0.5">
                    {inspectorData.recalledMemories?.length || 0}
                  </p>
                </div>
              </div>

              {inspectorData.injectedLore && inspectorData.injectedLore.length > 0 && (
                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    Triggered Lore Entries:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectorData.injectedLore.map((item: string, i: number) => (
                      <span key={i} className="text-[11px] bg-emerald-900/40 border border-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-lg">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {inspectorData.activeRelationship && (
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                    Active Bond: {inspectorData.activeRelationship.relationship_type} (Affinity: {inspectorData.activeRelationship.affinity_level}/100)
                  </span>
                  <p className="text-zinc-300 text-[11px] italic">
                    {inspectorData.activeRelationship.relationship_notes}
                  </p>
                </div>
              )}

              {inspectorData.recencyAnchor && (
                <div className="p-3 bg-brand-950/20 border border-brand-500/30 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider block">
                    Recency Anchor (Weak Model Reinforcement):
                  </span>
                  <p className="text-zinc-300 text-[11px] font-mono leading-relaxed">
                    {inspectorData.recencyAnchor}
                  </p>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] mb-1.5">
                  Full Assembled System Prompt
                </h4>
                <div className="terminal-window p-3 rounded-xl max-h-60 overflow-y-auto text-zinc-300 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                  {inspectorData.systemPrompt}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
