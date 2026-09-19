import axios, { AxiosInstance } from 'axios';
import { db } from '../db';
import { logger } from './loggerService';
import { OllamaModelInfo, OllamaRunningModel, OllamaPullProgress, ServerSettings } from '../../shared/types';
import { EventEmitter } from 'events';

class OllamaService extends EventEmitter {
  private client: AxiosInstance;
  private hostUrl: string = 'http://127.0.0.1:11434';
  private activePulls: Map<string, { status: string; progress: number; total: number; completed: number; error?: string }> = new Map();

  constructor() {
    super();
    this.reloadHost();
    this.client = axios.create({
      baseURL: this.hostUrl,
      timeout: 120000
    });
  }

  public reloadHost() {
    try {
      const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as { config: string } | undefined;
      if (row) {
        const settings: ServerSettings = JSON.parse(row.config);
        if (settings.ollama_host) {
          this.hostUrl = settings.ollama_host.replace(/\/+$/, '');
        }
      }
    } catch (e) {
      this.hostUrl = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
    }

    this.client = axios.create({
      baseURL: this.hostUrl,
      timeout: 120000
    });
  }

  public getHostUrl(): string {
    return this.hostUrl;
  }

  public async checkConnection(): Promise<{ online: boolean; latency_ms: number; version?: string; error?: string }> {
    const start = Date.now();
    try {
      const res = await this.client.get('/api/version', { timeout: 4000 });
      const latency = Date.now() - start;
      return {
        online: true,
        latency_ms: latency,
        version: res.data?.version || 'unknown'
      };
    } catch (e: any) {
      try {
        // Some Ollama versions return 200 on /
        const res = await this.client.get('/', { timeout: 4000 });
        return {
          online: true,
          latency_ms: Date.now() - start,
          version: 'Ollama is running'
        };
      } catch (err2: any) {
        return {
          online: false,
          latency_ms: Date.now() - start,
          error: e.message || 'Connection refused'
        };
      }
    }
  }

  public async getModels(): Promise<OllamaModelInfo[]> {
    try {
      const res = await this.client.get('/api/tags');
      const models: OllamaModelInfo[] = (res.data?.models || []).map((m: any) => ({
        name: m.name || m.model,
        model: m.model || m.name,
        modified_at: m.modified_at,
        size: m.size || 0,
        digest: m.digest || '',
        details: m.details || {}
      }));
      return models;
    } catch (e: any) {
      logger.warn('OLLAMA', `Failed to fetch models from ${this.hostUrl}: ${e.message}`);
      return [];
    }
  }

  public async getRunningModels(): Promise<OllamaRunningModel[]> {
    try {
      const res = await this.client.get('/api/ps');
      const models: OllamaRunningModel[] = (res.data?.models || []).map((m: any) => ({
        name: m.name || m.model,
        model: m.model || m.name,
        size: m.size || 0,
        size_vram: m.size_vram || 0,
        digest: m.digest || '',
        details: m.details || {},
        expires_at: m.expires_at || ''
      }));
      return models;
    } catch (e: any) {
      return [];
    }
  }

  public async unloadModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('OLLAMA', `Unloading model ${modelName} from memory (keep_alive: 0)...`);
      await this.client.post('/api/generate', {
        model: modelName,
        keep_alive: 0
      });
      logger.info('OLLAMA', `Model ${modelName} unloaded successfully.`);
      return { success: true, message: `Model ${modelName} unloaded from memory.` };
    } catch (e: any) {
      logger.error('OLLAMA', `Failed to unload model ${modelName}: ${e.message}`);
      return { success: false, message: e.message };
    }
  }

  public async unloadAllModels(): Promise<{ success: boolean; unloaded: number }> {
    try {
      const running = await this.getRunningModels();
      let count = 0;
      for (const m of running) {
        await this.unloadModel(m.name);
        count++;
      }
      return { success: true, unloaded: count };
    } catch (e: any) {
      return { success: false, unloaded: 0 };
    }
  }

  public async deleteModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('OLLAMA', `Deleting model ${modelName}...`);
      await this.client.delete('/api/delete', {
        data: { name: modelName }
      });
      logger.info('OLLAMA', `Model ${modelName} deleted.`);
      return { success: true, message: `Model ${modelName} deleted successfully.` };
    } catch (e: any) {
      logger.error('OLLAMA', `Failed to delete model ${modelName}: ${e.message}`);
      return { success: false, message: e.message };
    }
  }

  public async pullModel(modelName: string, onProgress?: (p: OllamaPullProgress) => void): Promise<void> {
    this.activePulls.set(modelName, { status: 'starting', progress: 0, total: 0, completed: 0 });
    logger.info('OLLAMA', `Started pulling model ${modelName}...`);

    try {
      const response = await axios({
        method: 'POST',
        url: `${this.hostUrl}/api/pull`,
        data: { name: modelName, stream: true },
        responseType: 'stream',
        timeout: 0 // infinite timeout for large model downloads
      });

      return new Promise<void>((resolve, reject) => {
        let buffer = '';
        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf-8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              let progressPercent = 0;
              if (data.total && data.completed) {
                progressPercent = Math.round((data.completed / data.total) * 100);
              }
              const pullInfo = {
                status: data.status || 'pulling',
                progress: progressPercent,
                total: data.total || 0,
                completed: data.completed || 0,
                error: data.error
              };
              this.activePulls.set(modelName, pullInfo);
              this.emit(`pull_progress_${modelName}`, pullInfo);
              if (onProgress) onProgress(data);

              if (data.error) {
                reject(new Error(data.error));
                return;
              }
            } catch (err) {
              // Ignore line parse errors
            }
          }
        });

        response.data.on('end', () => {
          this.activePulls.delete(modelName);
          logger.info('OLLAMA', `Successfully downloaded model ${modelName}`);
          this.emit(`pull_complete_${modelName}`, { success: true, model: modelName });
          resolve();
        });

        response.data.on('error', (err: any) => {
          this.activePulls.delete(modelName);
          logger.error('OLLAMA', `Error downloading model ${modelName}: ${err.message}`);
          this.emit(`pull_error_${modelName}`, { error: err.message });
          reject(err);
        });
      });
    } catch (e: any) {
      this.activePulls.delete(modelName);
      logger.error('OLLAMA', `Failed to start pull for ${modelName}: ${e.message}`);
      throw e;
    }
  }

  public getActivePulls() {
    const list: Array<{ name: string; status: string; progress: number; total: number; completed: number; error?: string }> = [];
    this.activePulls.forEach((v, k) => {
      list.push({ name: k, ...v });
    });
    return list;
  }

  public async createModel(name: string, modelfile: string): Promise<void> {
    logger.info('OLLAMA', `Creating custom model ${name}...`);
    const res = await this.client.post('/api/create', {
      name,
      modelfile,
      stream: false
    });
    logger.info('OLLAMA', `Custom model ${name} created: ${JSON.stringify(res.data)}`);
  }
}

export const ollamaService = new OllamaService();
