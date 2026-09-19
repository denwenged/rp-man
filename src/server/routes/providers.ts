import { Router, Response } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { db } from '../db';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { LLMProvider } from '../../shared/types';

export const providersRouter = Router();

providersRouter.use(authMiddleware);

// List providers
providersRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = db.prepare('SELECT id, name, type, base_url, api_key, enabled, default_model, is_default, created_at, updated_at FROM llm_providers ORDER BY created_at ASC').all() as any[];
    
    // Mask API keys for display
    const providers = rows.map(r => ({
      ...r,
      enabled: Boolean(r.enabled),
      is_default: Boolean(r.is_default),
      api_key_masked: r.api_key ? `${r.api_key.substring(0, 4)}...${r.api_key.substring(r.api_key.length - 4)}` : ''
    }));

    return res.json({ providers });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create Provider (Admin only)
providersRouter.post('/', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, type, base_url, api_key = '', default_model = '', enabled = true, is_default = false } = req.body;
  if (!name || !type || !base_url) {
    return res.status(400).json({ error: 'Name, type, and base_url are required' });
  }

  const id = `provider_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  try {
    if (is_default) {
      db.prepare('UPDATE llm_providers SET is_default = 0').run();
    }

    db.prepare(`
      INSERT INTO llm_providers (id, name, type, base_url, api_key, enabled, default_model, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, base_url, api_key, enabled ? 1 : 0, default_model, is_default ? 1 : 0, now, now);

    const created = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as any;
    logger.info('SYSTEM', `Provider created: ${name} (${type})`);

    return res.status(201).json({
      provider: {
        ...created,
        enabled: Boolean(created.enabled),
        is_default: Boolean(created.is_default)
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update Provider (Admin only)
providersRouter.put('/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, base_url, api_key, default_model, enabled, is_default } = req.body;
  const now = new Date().toISOString();

  try {
    const existing = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    if (is_default) {
      db.prepare('UPDATE llm_providers SET is_default = 0').run();
    }

    const newKey = api_key !== undefined && api_key !== '' ? api_key : existing.api_key;

    db.prepare(`
      UPDATE llm_providers SET
        name = COALESCE(?, name),
        base_url = COALESCE(?, base_url),
        api_key = ?,
        default_model = COALESCE(?, default_model),
        enabled = COALESCE(?, enabled),
        is_default = COALESCE(?, is_default),
        updated_at = ?
      WHERE id = ?
    `).run(
      name,
      base_url,
      newKey,
      default_model,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as any;
    return res.json({
      provider: {
        ...updated,
        enabled: Boolean(updated.enabled),
        is_default: Boolean(updated.is_default)
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete Provider (Admin only)
providersRouter.delete('/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM llm_providers WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Provider deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Test Provider Connection
providersRouter.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const provider = db.prepare('SELECT * FROM llm_providers WHERE id = ?').get(id) as any;
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const start = Date.now();
    let targetUrl = provider.base_url.replace(/\/+$/, '');

    const headers: Record<string, string> = {};
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`;
      if (provider.type === 'anthropic') {
        headers['x-api-key'] = provider.api_key;
        headers['anthropic-version'] = '2023-06-01';
      }
    }

    // Try fetching models or basic GET
    let endpoint = targetUrl.includes('/v1') ? `${targetUrl}/models` : targetUrl;
    if (provider.type === 'ollama') {
      endpoint = `${targetUrl}/api/tags`;
    }

    try {
      const response = await axios.get(endpoint, { headers, timeout: 5000 });
      return res.json({
        success: true,
        latency_ms: Date.now() - start,
        message: 'Connection successful!',
        data_preview: response.data?.data ? `Found ${response.data.data.length} models` : 'OK'
      });
    } catch (apiErr: any) {
      return res.json({
        success: false,
        latency_ms: Date.now() - start,
        error: apiErr.response?.data?.error?.message || apiErr.message
      });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
