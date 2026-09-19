import { EventEmitter } from 'events';
import crypto from 'crypto';
import { db } from '../db';
import { LogEntry } from '../../shared/types';

class LoggerService extends EventEmitter {
  private recentLogs: LogEntry[] = [];
  private readonly maxInMemory = 500;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  log(level: 'info' | 'warn' | 'error' | 'debug', category: LogEntry['category'], message: string, details?: any) {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: details ? (typeof details === 'object' ? details : { info: details }) : undefined
    };

    // Keep in memory
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > this.maxInMemory) {
      this.recentLogs.pop();
    }

    // Persist to SQLite asynchronously/safely
    try {
      db.prepare(`
        INSERT INTO system_logs (id, timestamp, level, category, message, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        entry.timestamp,
        entry.level,
        entry.category,
        entry.message,
        JSON.stringify(entry.details || {})
      );
    } catch (e) {
      // Avoid recursive failure
      console.error('Failed to persist log to DB', e);
    }

    // Output to stdout
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}]`;
    if (level === 'error') {
      console.error(`${prefix} ${message}`, details || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`, details || '');
    } else {
      console.log(`${prefix} ${message}`);
    }

    // Emit live event for SSE
    this.emit('new_log', entry);
  }

  info(category: LogEntry['category'], message: string, details?: any) {
    this.log('info', category, message, details);
  }

  warn(category: LogEntry['category'], message: string, details?: any) {
    this.log('warn', category, message, details);
  }

  error(category: LogEntry['category'], message: string, details?: any) {
    this.log('error', category, message, details);
  }

  debug(category: LogEntry['category'], message: string, details?: any) {
    this.log('debug', category, message, details);
  }

  getRecentLogs(limit = 100, category?: string, level?: string): LogEntry[] {
    try {
      let query = 'SELECT * FROM system_logs WHERE 1=1';
      const params: any[] = [];

      if (category && category !== 'ALL') {
        query += ' AND category = ?';
        params.push(category);
      }

      if (level && level !== 'ALL') {
        query += ' AND level = ?';
        params.push(level);
      }

      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);

      const rows = db.prepare(query).all(...params) as any[];
      return rows.map(r => ({
        ...r,
        details: r.details ? JSON.parse(r.details) : undefined
      }));
    } catch (e) {
      return this.recentLogs.slice(0, limit);
    }
  }

  clearLogs() {
    this.recentLogs = [];
    try {
      db.prepare('DELETE FROM system_logs').run();
      this.info('SYSTEM', 'System logs cleared');
    } catch (e) {
      console.error('Failed to clear logs table', e);
    }
  }
}

export const logger = new LoggerService();
