import axios from 'axios';
import { db } from '../db';
import { logger } from './loggerService';
import { queueService } from './queueService';
import { ollamaService } from './ollamaService';
import { Character, LLMProvider, ServerSettings, ModelParameters } from '../../shared/types';
import { ContextManager, FormattedPromptPayload } from './contextManager';

export interface GenerateOptions {
  character: Character;
  userPersonaName: string;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  rollingSummary?: string;
  onToken?: (token: string) => void;
  priority?: number; // 1 for Web Playground, 3 for Discord
}

export interface GenerateResult {
  text: string;
  tokensUsed: number;
  modelUsed: string;
  providerUsed: string;
  latencyMs: number;
}

class LLMService {
  /**
   * Get server settings
   */
  private getServerSettings(): ServerSettings {
    try {
      const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as { config: string } | undefined;
      if (row) return JSON.parse(row.config);
    } catch (e) {}
    return {
      default_llm_provider: 'ollama',
      default_llm_model: 'llama3.2:3b',
      ollama_host: 'http://127.0.0.1:11434',
      ollama_default_keep_alive: '5m',
      max_concurrent_llm_requests: 1,
      llm_timeout_seconds: 90,
      default_context_tokens: 4096,
      max_context_tokens_hard_cap: 8192,
      enable_auto_summarize: true,
      log_retention_days: 7,
      app_name: 'RP-Man',
      app_theme: 'matte-dark'
    };
  }

  /**
   * Resolve which provider & model to use for this generation
   */
  private resolveProvider(character: Character): {
    providerType: string;
    modelName: string;
    baseUrl: string;
    apiKey: string;
    keepAlive?: string;
  } {
    const settings = this.getServerSettings();
    let charProvider = character.model_config?.provider || 'server_default';
    let charModel = character.model_config?.model?.trim();
    let keepAlive = character.model_config?.keep_alive || settings.ollama_default_keep_alive || '5m';

    if (charProvider === 'server_default') {
      charProvider = (settings.default_llm_provider as any) || 'ollama';
      if (!charModel) {
        charModel = settings.default_llm_model || 'llama3.2:3b';
      }
    }

    if (charProvider === 'ollama') {
      return {
        providerType: 'ollama',
        modelName: charModel || settings.default_llm_model || 'llama3.2:3b',
        baseUrl: settings.ollama_host || 'http://127.0.0.1:11434',
        apiKey: '',
        keepAlive
      };
    }

    // Lookup in llm_providers table
    const providerRow = db.prepare('SELECT * FROM llm_providers WHERE type = ? AND enabled = 1 LIMIT 1').get(charProvider) as any;
    if (providerRow) {
      return {
        providerType: providerRow.type,
        modelName: charModel || providerRow.default_model || 'gpt-4o-mini',
        baseUrl: providerRow.base_url,
        apiKey: providerRow.api_key || '',
        keepAlive
      };
    }

    // Fallback to OpenAI or Ollama
    return {
      providerType: 'ollama',
      modelName: 'llama3.2:3b',
      baseUrl: 'http://127.0.0.1:11434',
      apiKey: '',
      keepAlive: '5m'
    };
  }

  /**
   * Execute Generation routed through the concurrency queue
   */
  public async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { character, userPersonaName, history, rollingSummary, onToken, priority = 3 } = options;
    const settings = this.getServerSettings();

    // 1. Build context & prompt
    const context = ContextManager.buildContext(
      character,
      userPersonaName,
      history,
      rollingSummary,
      settings.max_context_tokens_hard_cap
    );

    const resolved = this.resolveProvider(character);
    const params = character.model_config?.parameters || {};

    logger.info(
      'LLM',
      `Prompting [${character.name}] via ${resolved.providerType} (${resolved.modelName}) - Est. Input Tokens: ${context.estimatedTokens}`
    );

    const startTime = Date.now();

    // 2. Wrap execution in concurrency queue
    return queueService.enqueue(
      async () => {
        let resultText = '';
        let tokensUsed = 0;

        if (resolved.providerType === 'ollama') {
          resultText = await this.callOllama(resolved, context, params, onToken);
        } else if (resolved.providerType === 'anthropic') {
          resultText = await this.callAnthropic(resolved, context, params, onToken);
        } else {
          // OpenAI, OpenRouter, Custom OpenAI-Compatible
          resultText = await this.callOpenAICompatible(resolved, context, params, onToken);
        }

        const latencyMs = Date.now() - startTime;
        tokensUsed = context.estimatedTokens + ContextManager.estimateTokens(resultText);

        logger.info('LLM', `Completed generation for [${character.name}] in ${latencyMs}ms (${tokensUsed} total est. tokens)`);

        return {
          text: resultText.trim(),
          tokensUsed,
          modelUsed: resolved.modelName,
          providerUsed: resolved.providerType,
          latencyMs
        };
      },
      {
        priority,
        timeoutMs: (settings.llm_timeout_seconds || 90) * 1000,
        description: `Generate for [${character.name}]`
      }
    );
  }

  /**
   * Call Local Ollama /api/chat
   */
  private async callOllama(
    provider: { baseUrl: string; modelName: string; keepAlive?: string },
    context: FormattedPromptPayload,
    params: ModelParameters,
    onToken?: (token: string) => void
  ): Promise<string> {
    const messages = [
      { role: 'system', content: context.systemPrompt },
      ...context.messages
    ];

    const options: any = {};
    if (params.temperature !== undefined) options.temperature = params.temperature;
    if (params.top_p !== undefined) options.top_p = params.top_p;
    if (params.top_k !== undefined) options.top_k = params.top_k;
    if (params.repeat_penalty !== undefined) options.repeat_penalty = params.repeat_penalty;
    if (params.max_tokens !== undefined) options.num_predict = params.max_tokens;
    if (params.stop && params.stop.length > 0) options.stop = params.stop;

    const requestPayload = {
      model: provider.modelName,
      messages,
      stream: Boolean(onToken),
      options,
      keep_alive: provider.keepAlive || '5m'
    };

    if (onToken) {
      const response = await axios({
        method: 'POST',
        url: `${provider.baseUrl.replace(/\/+$/, '')}/api/chat`,
        data: requestPayload,
        responseType: 'stream',
        timeout: 120000
      });

      return new Promise<string>((resolve, reject) => {
        let fullText = '';
        let buffer = '';

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                const token = parsed.message.content;
                fullText += token;
                onToken(token);
              }
            } catch (err) {}
          }
        });

        response.data.on('end', () => {
          resolve(fullText);
        });

        response.data.on('error', (err: any) => {
          reject(err);
        });
      });
    } else {
      const response = await axios.post(
        `${provider.baseUrl.replace(/\/+$/, '')}/api/chat`,
        requestPayload,
        { timeout: 120000 }
      );
      return response.data?.message?.content || '';
    }
  }

  /**
   * Call OpenAI / OpenRouter / Custom OpenAI-compatible
   */
  private async callOpenAICompatible(
    provider: { baseUrl: string; modelName: string; apiKey: string; providerType: string },
    context: FormattedPromptPayload,
    params: ModelParameters,
    onToken?: (token: string) => void
  ): Promise<string> {
    const messages = [
      { role: 'system', content: context.systemPrompt },
      ...context.messages
    ];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    if (provider.providerType === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/denwenged/rp-man';
      headers['X-Title'] = 'RP-Man Character Manager';
    }

    const requestPayload: any = {
      model: provider.modelName,
      messages,
      temperature: params.temperature ?? 0.8,
      top_p: params.top_p ?? 0.9,
      max_tokens: params.max_tokens ?? 400,
      stream: Boolean(onToken)
    };

    if (params.frequency_penalty !== undefined) requestPayload.frequency_penalty = params.frequency_penalty;
    if (params.presence_penalty !== undefined) requestPayload.presence_penalty = params.presence_penalty;
    if (params.stop && params.stop.length > 0) requestPayload.stop = params.stop;

    let targetUrl = provider.baseUrl.replace(/\/+$/, '');
    if (!targetUrl.endsWith('/chat/completions')) {
      targetUrl = `${targetUrl}/chat/completions`;
    }

    if (onToken) {
      const response = await axios({
        method: 'POST',
        url: targetUrl,
        headers,
        data: requestPayload,
        responseType: 'stream',
        timeout: 120000
      });

      return new Promise<string>((resolve, reject) => {
        let fullText = '';
        let buffer = '';

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine || !cleanLine.startsWith('data: ')) continue;
            const dataStr = cleanLine.replace(/^data: /, '').trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                onToken(delta);
              }
            } catch (err) {}
          }
        });

        response.data.on('end', () => {
          resolve(fullText);
        });

        response.data.on('error', (err: any) => {
          reject(err);
        });
      });
    } else {
      const response = await axios.post(targetUrl, requestPayload, { headers, timeout: 120000 });
      return response.data?.choices?.[0]?.message?.content || '';
    }
  }

  /**
   * Call Anthropic Claude Messages API
   */
  private async callAnthropic(
    provider: { baseUrl: string; modelName: string; apiKey: string },
    context: FormattedPromptPayload,
    params: ModelParameters,
    onToken?: (token: string) => void
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01'
    };

    const anthropicMessages = context.messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));

    const requestPayload: any = {
      model: provider.modelName || 'claude-3-haiku-20240307',
      system: context.systemPrompt,
      messages: anthropicMessages,
      max_tokens: params.max_tokens || 400,
      temperature: params.temperature ?? 0.8,
      stream: Boolean(onToken)
    };

    const targetUrl = 'https://api.anthropic.com/v1/messages';

    if (onToken) {
      const response = await axios({
        method: 'POST',
        url: targetUrl,
        headers,
        data: requestPayload,
        responseType: 'stream',
        timeout: 120000
      });

      return new Promise<string>((resolve, reject) => {
        let fullText = '';
        let buffer = '';

        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data: ')) continue;
            const dataStr = cleanLine.replace(/^data: /, '').trim();

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const token = parsed.delta.text;
                fullText += token;
                onToken(token);
              }
            } catch (err) {}
          }
        });

        response.data.on('end', () => {
          resolve(fullText);
        });

        response.data.on('error', (err: any) => {
          reject(err);
        });
      });
    } else {
      const response = await axios.post(targetUrl, requestPayload, { headers, timeout: 120000 });
      return response.data?.content?.[0]?.text || '';
    }
  }

  /**
   * Summarize past conversation to compact summary
   */
  public async generateSummary(
    character: Character,
    previousSummary: string,
    messagesToSummarize: Array<{ role: string; content: string }>
  ): Promise<string> {
    const dialogStr = messagesToSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
    const summaryPrompt = `You are a concise roleplay archivist.
Summarize the following roleplay events between ${character.name} and User into 2-3 brief paragraphs, highlighting key relationships, plot points, items acquired, and emotional shifts.
Keep it compact and factual.

${previousSummary ? `[Previous Summary]:\n${previousSummary}\n\n` : ''}
[Recent Dialogue]:
${dialogStr}

[Updated Compact Summary]:`;

    try {
      const resolved = this.resolveProvider(character);
      const res = await this.generate({
        character: {
          ...character,
          system_prompt: 'You are an objective summarizer. Return only the summary text.'
        },
        userPersonaName: 'User',
        history: [{ role: 'user', content: summaryPrompt }],
        priority: 4
      });
      return res.text;
    } catch (e) {
      logger.error('SYSTEM', 'Failed to generate rolling summary', e);
      return previousSummary;
    }
  }
}

export const llmService = new LLMService();
