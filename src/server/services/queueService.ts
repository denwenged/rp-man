import { db } from '../db';
import { logger } from './loggerService';
import { ServerSettings } from '../../shared/types';

interface QueueTask<T> {
  id: string;
  priority: number; // 1 = highest, 5 = lowest
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  addedAt: number;
  timeoutMs: number;
}

class QueueService {
  private activeCount: number = 0;
  private queue: QueueTask<any>[] = [];
  private maxConcurrency: number = 1;
  private defaultTimeout: number = 90000;

  constructor() {
    this.reloadSettings();
  }

  public reloadSettings() {
    try {
      const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as { config: string } | undefined;
      if (row) {
        const settings: ServerSettings = JSON.parse(row.config);
        this.maxConcurrency = Math.max(1, settings.max_concurrent_llm_requests || 1);
        this.defaultTimeout = (settings.llm_timeout_seconds || 90) * 1000;
      }
    } catch (e) {
      this.maxConcurrency = 1;
    }
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public enqueue<T>(task: () => Promise<T>, options?: { priority?: number; timeoutMs?: number; description?: string }): Promise<T> {
    const priority = options?.priority ?? 3;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeout;
    const desc = options?.description || 'LLM generation';

    return new Promise<T>((resolve, reject) => {
      const queueTask: QueueTask<T> = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        priority,
        task,
        resolve,
        reject,
        addedAt: Date.now(),
        timeoutMs
      };

      this.queue.push(queueTask);
      // Sort by priority (ascending: 1 is higher priority than 5)
      this.queue.sort((a, b) => a.priority - b.priority);

      if (this.queue.length > 1) {
        logger.info('QUEUE', `Queued ${desc} (Position: ${this.queue.length}, Active: ${this.activeCount}/${this.maxConcurrency})`);
      }

      this.processNext();
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeCount++;

    let isTimedOut = false;
    const timer = setTimeout(() => {
      isTimedOut = true;
      task.reject(new Error(`LLM generation timed out after ${task.timeoutMs / 1000}s`));
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.processNext();
    }, task.timeoutMs);

    try {
      const result = await task.task();
      if (!isTimedOut) {
        clearTimeout(timer);
        task.resolve(result);
      }
    } catch (err) {
      if (!isTimedOut) {
        clearTimeout(timer);
        task.reject(err);
      }
    } finally {
      if (!isTimedOut) {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processNext();
      }
    }
  }
}

export const queueService = new QueueService();
