import {
  User,
  Character,
  ChatSession,
  ChatMessage,
  GroupSession,
  GroupMessage,
  UserRelationship,
  CharacterExpression,
  OllamaModelInfo,
  OllamaRunningModel,
  LLMProvider,
  DiscordBotConfig,
  DiscordStatus,
  SystemStats,
  ServerSettings,
  Lorebook,
  LoreEntry,
  LogEntry
} from '../../shared/types';

const API_BASE = '/api';

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem('rp_man_token');
  }

  public setToken(token: string | null) {
    if (token) {
      localStorage.setItem('rp_man_token', token);
    } else {
      localStorage.removeItem('rp_man_token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw new Error('Authentication required');
    }

    if (!res.ok) {
      let errMsg = `Request failed: ${res.statusText}`;
      try {
        const errorData = await res.json();
        errMsg = errorData.error || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    }

    return res.json();
  }

  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    this.setToken(res.token);
    return res;
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  async updateProfile(data: { password?: string; avatar_url?: string }): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Users
  async getUsers(): Promise<{ users: User[] }> {
    return this.request<{ users: User[] }>('/users');
  }

  async createUser(data: { username: string; password: string; role?: string; avatar_url?: string }): Promise<{ user: User }> {
    return this.request<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: { role?: string; password?: string; avatar_url?: string }): Promise<{ user: User }> {
    return this.request<{ user: User }>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/users/${id}`, { method: 'DELETE' });
  }

  // Characters
  async getCharacters(query?: string): Promise<{ characters: Character[] }> {
    const q = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request<{ characters: Character[] }>(`/characters${q}`);
  }

  async getCharacter(id: string): Promise<{ character: Character }> {
    return this.request<{ character: Character }>(`/characters/${id}`);
  }

  async createCharacter(data: Partial<Character>): Promise<{ character: Character }> {
    return this.request<{ character: Character }>('/characters', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCharacter(id: string, data: Partial<Character>): Promise<{ character: Character }> {
    return this.request<{ character: Character }>(`/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.request(`/characters/${id}`, { method: 'DELETE' });
  }

  async duplicateCharacter(id: string): Promise<{ character: Character }> {
    return this.request<{ character: Character }>(`/characters/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async importCharacter(formData: FormData): Promise<{ character: Character }> {
    return this.request<{ character: Character }>('/characters/import', {
      method: 'POST',
      body: formData,
    });
  }

  // Relationships
  async getRelationships(characterId: string): Promise<{ relationships: UserRelationship[] }> {
    return this.request<{ relationships: UserRelationship[] }>(`/characters/${characterId}/relationships`);
  }

  async addRelationship(characterId: string, data: Partial<UserRelationship>): Promise<{ relationship: UserRelationship }> {
    return this.request<{ relationship: UserRelationship }>(`/characters/${characterId}/relationships`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRelationship(relId: string, data: Partial<UserRelationship>): Promise<{ relationship: UserRelationship }> {
    return this.request<{ relationship: UserRelationship }>(`/characters/relationships/${relId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRelationship(relId: string): Promise<void> {
    await this.request(`/characters/relationships/${relId}`, { method: 'DELETE' });
  }

  // Character Mind & Memories
  async getCharacterMemories(characterId: string): Promise<{ memories: any[] }> {
    return this.request<{ memories: any[] }>(`/characters/${characterId}/memories`);
  }

  async addCharacterMemory(characterId: string, data: { user_identifier: string; user_display_name?: string; memory_text: string; category?: string }): Promise<{ memory: any }> {
    return this.request<{ memory: any }>(`/characters/${characterId}/memories`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCharacterMemory(memoryId: string, data: Partial<any>): Promise<{ memory: any }> {
    return this.request<{ memory: any }>(`/characters/memories/${memoryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteCharacterMemory(memoryId: string): Promise<void> {
    await this.request(`/characters/memories/${memoryId}`, { method: 'DELETE' });
  }

  async clearUserMemories(characterId: string, userId: string): Promise<void> {
    await this.request(`/characters/${characterId}/memories/user/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }

  // Chats
  async getChatSessions(characterId?: string): Promise<{ sessions: any[] }> {
    const q = characterId ? `?character_id=${encodeURIComponent(characterId)}` : '';
    return this.request<{ sessions: any[] }>(`/chats${q}`);
  }

  async createChatSession(data: {
    character_id: string;
    title?: string;
    user_persona_name?: string;
    user_persona_avatar?: string;
    user_persona_description?: string;
    greeting_index?: number;
  }): Promise<{ session: ChatSession; messages: ChatMessage[] }> {
    return this.request<{ session: ChatSession; messages: ChatMessage[] }>('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChatSession(id: string): Promise<{ session: ChatSession; character: Character; messages: ChatMessage[] }> {
    return this.request<{ session: ChatSession; character: Character; messages: ChatMessage[] }>(`/chats/${id}`);
  }

  async deleteChatSession(id: string): Promise<void> {
    await this.request(`/chats/${id}`, { method: 'DELETE' });
  }

  async sendMessage(sessionId: string, content: string, userPersonaName?: string): Promise<{
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    latencyMs: number;
  }> {
    return this.request(`/chats/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, user_persona_name: userPersonaName }),
    });
  }

  async swipeMessage(sessionId: string, messageId: string, direction: 'new' | 'left' | 'right'): Promise<{
    message: ChatMessage;
    latencyMs?: number;
  }> {
    return this.request(`/chats/${sessionId}/messages/${messageId}/swipe`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
  }

  async editMessage(sessionId: string, messageId: string, content: string): Promise<{ message: ChatMessage }> {
    return this.request(`/chats/${sessionId}/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async getContextPreview(sessionId: string): Promise<any> {
    return this.request(`/chats/${sessionId}/context-preview`);
  }

  // Groups (Multi-Character Lounge)
  async getGroupSessions(): Promise<{ groups: GroupSession[] }> {
    return this.request<{ groups: GroupSession[] }>('/groups');
  }

  async createGroupSession(data: {
    title?: string;
    character_ids: string[];
    scenario?: string;
    user_persona_name?: string;
  }): Promise<{ group: GroupSession }> {
    return this.request<{ group: GroupSession }>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGroupSession(id: string): Promise<{ group: GroupSession; characters: Character[]; messages: GroupMessage[] }> {
    return this.request<{ group: GroupSession; characters: Character[]; messages: GroupMessage[] }>(`/groups/${id}`);
  }

  async deleteGroupSession(id: string): Promise<void> {
    await this.request(`/groups/${id}`, { method: 'DELETE' });
  }

  async sendGroupMessage(groupId: string, content: string, userPersonaName?: string): Promise<{ message: GroupMessage }> {
    return this.request<{ message: GroupMessage }>(`/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, user_persona_name: userPersonaName }),
    });
  }

  async triggerGroupTurn(groupId: string, characterId?: string): Promise<{
    message: GroupMessage;
    character: Character;
    latencyMs: number;
  }> {
    return this.request<{ message: GroupMessage; character: Character; latencyMs: number }>(`/groups/${groupId}/turn`, {
      method: 'POST',
      body: JSON.stringify({ character_id: characterId }),
    });
  }

  // Ollama
  async getOllamaStatus(): Promise<{ online: boolean; latency_ms: number; host: string; version?: string; error?: string }> {
    return this.request('/ollama/status');
  }

  async getOllamaModels(): Promise<{ models: OllamaModelInfo[] }> {
    return this.request('/ollama/models');
  }

  async getOllamaRunning(): Promise<{ models: OllamaRunningModel[] }> {
    return this.request('/ollama/ps');
  }

  async unloadOllamaModel(model: string): Promise<{ success: boolean; message: string }> {
    return this.request('/ollama/unload', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
  }

  async unloadAllOllamaModels(): Promise<{ success: boolean; unloaded: number }> {
    return this.request('/ollama/unload-all', { method: 'POST' });
  }

  async deleteOllamaModel(model: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/ollama/models/${encodeURIComponent(model)}`, { method: 'DELETE' });
  }

  async pullOllamaModel(name: string): Promise<{ success: boolean; message: string }> {
    return this.request('/ollama/pull', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getOllamaPulls(): Promise<{ pulls: any[] }> {
    return this.request('/ollama/pulls');
  }

  async createOllamaModel(name: string, modelfile: string): Promise<{ success: boolean; message: string }> {
    return this.request('/ollama/create', {
      method: 'POST',
      body: JSON.stringify({ name, modelfile }),
    });
  }

  // Discord
  async getDiscordConfig(): Promise<{ config: DiscordBotConfig & { has_token: boolean; masked_token: string } }> {
    return this.request('/discord/config');
  }

  async updateDiscordConfig(config: Partial<DiscordBotConfig>): Promise<{ success: boolean; config: DiscordBotConfig }> {
    return this.request('/discord/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  async getDiscordStatus(): Promise<{ status: DiscordStatus }> {
    return this.request('/discord/status');
  }

  async startDiscord(): Promise<{ success: boolean; message: string }> {
    return this.request('/discord/start', { method: 'POST' });
  }

  async stopDiscord(): Promise<{ success: boolean; message: string }> {
    return this.request('/discord/stop', { method: 'POST' });
  }

  async restartDiscord(): Promise<{ success: boolean; message: string }> {
    return this.request('/discord/restart', { method: 'POST' });
  }

  async testDiscordWebhook(data: {
    webhook_url: string;
    username?: string;
    avatar_url?: string;
    message?: string;
  }): Promise<{ success: boolean; message: string }> {
    return this.request('/discord/test-webhook', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Providers
  async getProviders(): Promise<{ providers: LLMProvider[] }> {
    return this.request('/providers');
  }

  async createProvider(data: Partial<LLMProvider>): Promise<{ provider: LLMProvider }> {
    return this.request('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProvider(id: string, data: Partial<LLMProvider>): Promise<{ provider: LLMProvider }> {
    return this.request(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProvider(id: string): Promise<void> {
    await this.request(`/providers/${id}`, { method: 'DELETE' });
  }

  async testProvider(id: string): Promise<any> {
    return this.request(`/providers/${id}/test`, { method: 'POST' });
  }

  // Lorebooks
  async getLorebooks(): Promise<{ lorebooks: Lorebook[] }> {
    return this.request('/lorebooks');
  }

  async getLorebook(id: string): Promise<{ lorebook: Lorebook }> {
    return this.request(`/lorebooks/${id}`);
  }

  async createLorebook(data: { name: string; description?: string }): Promise<{ lorebook: Lorebook }> {
    return this.request('/lorebooks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLorebook(id: string, data: { name?: string; description?: string }): Promise<{ lorebook: Lorebook }> {
    return this.request(`/lorebooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLorebook(id: string): Promise<void> {
    await this.request(`/lorebooks/${id}`, { method: 'DELETE' });
  }

  async createLoreEntry(bookId: string, data: Partial<LoreEntry>): Promise<{ entry: LoreEntry }> {
    return this.request(`/lorebooks/${bookId}/entries`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLoreEntry(entryId: string, data: Partial<LoreEntry>): Promise<{ entry: LoreEntry }> {
    return this.request(`/lorebooks/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteLoreEntry(entryId: string): Promise<void> {
    await this.request(`/lorebooks/entries/${entryId}`, { method: 'DELETE' });
  }

  // System
  async getSystemStats(): Promise<{ stats: SystemStats }> {
    return this.request('/system/stats');
  }

  async getServerSettings(): Promise<{ settings: ServerSettings }> {
    return this.request('/system/settings');
  }

  async updateServerSettings(settings: Partial<ServerSettings>): Promise<{ success: boolean; settings: ServerSettings }> {
    return this.request('/system/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async uploadImage(formData: FormData): Promise<{ success: boolean; url: string }> {
    return this.request('/system/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async restoreBackup(data: any): Promise<{ success: boolean; message: string }> {
    return this.request('/system/restore', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Logs
  async getLogs(params?: { limit?: number; category?: string; level?: string }): Promise<{ logs: LogEntry[] }> {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/logs?${query}`);
  }

  async clearLogs(): Promise<void> {
    await this.request('/logs', { method: 'DELETE' });
  }
}

export const api = new ApiClient();
