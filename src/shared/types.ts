export type UserRole = 'admin' | 'editor' | 'user';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface ModelParameters {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repeat_penalty?: number;
  max_tokens?: number;
  context_tokens?: number;
  stop?: string[];
}

export interface LoreEntry {
  id: string;
  lorebook_id: string;
  keys: string[];
  secondary_keys?: string[];
  content: string;
  comment?: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  priority: number;
  order: number;
}

export interface Lorebook {
  id: string;
  name: string;
  description?: string;
  user_id: string;
  entries?: LoreEntry[];
  created_at: string;
  updated_at: string;
}

export interface CharacterExpression {
  id: string;
  name: string; // e.g. "angry", "happy", "blushing", "smug", "sad", "surprised", "neutral"
  emoji: string; // e.g. "😡", "😊", "😳", "😏", "😢", "😲", "😐"
  avatar_url: string; // URL of the expression avatar
}

export interface UserRelationship {
  id: string;
  character_id: string;
  user_identifier: string; // Discord user ID (e.g. "123456789") or Web persona name (e.g. "Joshua", "Father")
  relationship_type: string; // e.g. "Friend", "Father", "Mother", "Rival", "Enemy", "Lover", "Master", "Apprentice", "Sibling", "Custom"
  relationship_notes: string; // e.g. "Treat with deep reverence and parental love. He taught you everything."
  affinity_level: number; // 0 - 100
  created_at: string;
  updated_at: string;
}

export interface CharacterMemory {
  id: string;
  character_id: string;
  user_identifier: string; // Discord user ID or Web persona name
  user_display_name?: string;
  memory_text: string; // Key recalled fact / note about user
  category?: string; // 'fact', 'preference', 'backstory', 'event'
  created_at: string;
  updated_at: string;
}

export interface UserPersona {
  id: string;
  user_identifier: string; // Discord ID or username
  preferred_name: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CharacterDiscordConfig {
  trigger_prefix?: string;
  trigger_suffix?: string;
  webhook_url?: string;
  channel_ids?: string[];
  bound_channels?: string[]; // Channels where character replies to every message automatically
  auto_react?: boolean;
  reply_on_mention?: boolean;
  tupperbox_proxy?: boolean;
  delete_trigger_message?: boolean; // Whether to delete user trigger message on prefix
}

export interface CharacterModelConfig {
  provider: 'ollama' | 'openai' | 'openrouter' | 'anthropic' | 'custom' | 'server_default';
  model: string;
  custom_endpoint_id?: string;
  parameters: ModelParameters;
  keep_alive?: string;
}

export interface CharacterContextConfig {
  max_context_tokens: number;
  max_history_messages: number;
  enable_summary: boolean;
  enable_memory: boolean; // Toggle for Character Mind & Long-Term Memory
  summary_token_threshold: number;
  lorebook_ids: string[];
}

export interface Character {
  id: string;
  name: string;
  avatar_url: string;
  tagline: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  alternate_greetings: string[];
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  tags: string[];
  user_id: string;
  is_public: boolean;
  expressions?: CharacterExpression[];
  relationships?: UserRelationship[];
  memories?: CharacterMemory[];
  model_config: CharacterModelConfig;
  discord_config: CharacterDiscordConfig;
  context_config: CharacterContextConfig;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  swipes?: string[];
  swipe_index?: number;
  user_persona_name?: string;
  user_persona_avatar?: string;
  expression?: string; // e.g. "angry", "happy"
  expression_emoji?: string; // e.g. "😡"
  expression_avatar?: string; // avatar url used for this message
  character_id?: string;
  character_name?: string;
  tokens_used?: number;
  model_used?: string;
  created_at: string;
}

export interface ChatSession {
  id: string;
  character_id: string;
  user_id: string;
  title: string;
  user_persona_name: string;
  user_persona_avatar: string;
  user_persona_description?: string;
  rolling_summary?: string;
  created_at: string;
  updated_at: string;
  messages_count?: number;
  last_message?: string;
}

export interface GroupSession {
  id: string;
  title: string;
  user_id: string;
  character_ids: string[];
  scenario: string;
  user_persona_name: string;
  created_at: string;
  updated_at: string;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_type: 'user' | 'character';
  sender_id: string; // character_id or user_id
  sender_name: string;
  sender_avatar: string;
  content: string;
  expression?: string;
  expression_emoji?: string;
  created_at: string;
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  digest: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai' | 'openrouter' | 'anthropic' | 'custom' | 'ollama';
  base_url: string;
  api_key?: string;
  enabled: boolean;
  default_model?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscordBotConfig {
  enabled: boolean;
  token: string;
  client_id?: string;
  default_character_id?: string;
  allow_dm: boolean;
  typing_indicator: boolean;
  prefix: string;
  rate_limit_per_user_sec: number;
  max_response_length: number;
  split_long_messages: boolean;
  status_activity?: string;
  status_type?: 'PLAYING' | 'LISTENING' | 'WATCHING' | 'COMPETING';
}

export interface DiscordStatus {
  connected: boolean;
  status: 'online' | 'offline' | 'connecting' | 'error';
  bot_user?: {
    id: string;
    username: string;
    discriminator: string;
    avatar_url: string;
    guilds_count: number;
  };
  latency?: number;
  last_error?: string;
  active_channels_count?: number;
}

export interface SystemStats {
  cpu_percent: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  ram_free_bytes: number;
  ram_percent: number;
  swap_used_bytes: number;
  swap_total_bytes: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  disk_percent: number;
  process_memory_bytes: number;
  uptime_seconds: number;
  ollama_status: 'online' | 'offline' | 'error';
  ollama_running_models_count: number;
  active_llm_requests: number;
  queue_length: number;
}

export interface ServerSettings {
  default_llm_provider: string;
  default_llm_model: string;
  ollama_host: string;
  ollama_default_keep_alive: string;
  max_concurrent_llm_requests: number;
  llm_timeout_seconds: number;
  default_context_tokens: number;
  max_context_tokens_hard_cap: number;
  enable_auto_summarize: boolean;
  log_retention_days: number;
  app_name: string;
  app_theme: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'SYSTEM' | 'DISCORD' | 'LLM' | 'OLLAMA' | 'AUTH' | 'QUEUE' | 'DB';
  message: string;
  details?: any;
}
