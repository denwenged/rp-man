import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, requireEditorOrAdmin, AuthenticatedRequest } from '../middleware/auth';
import { Lorebook, LoreEntry } from '../../shared/types';

export const lorebooksRouter = Router();

lorebooksRouter.use(authMiddleware);

function formatEntry(row: any): LoreEntry {
  return {
    ...row,
    keys: JSON.parse(row.keys || '[]'),
    secondary_keys: JSON.parse(row.secondary_keys || '[]'),
    enabled: Boolean(row.enabled),
    constant: Boolean(row.constant),
    selective: Boolean(row.selective)
  };
}

// List lorebooks (Readable by all authenticated users)
lorebooksRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT l.*, (SELECT COUNT(*) FROM lore_entries e WHERE e.lorebook_id = l.id) as entries_count
      FROM lorebooks l
      ORDER BY l.updated_at DESC
    `).all();

    return res.json({ lorebooks: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get lorebook with its entries (Readable by all authenticated users)
lorebooksRouter.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const book = db.prepare('SELECT * FROM lorebooks WHERE id = ?').get(id) as any;
    if (!book) return res.status(404).json({ error: 'Lorebook not found' });

    const entries = db.prepare('SELECT * FROM lore_entries WHERE lorebook_id = ? ORDER BY priority DESC, order_index ASC').all(id) as any[];

    return res.json({
      lorebook: {
        ...book,
        entries: entries.map(formatEntry)
      }
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create lorebook (Editor or Admin only)
lorebooksRouter.post('/', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { name, description = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = `lore_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const userId = req.user!.id;

  try {
    db.prepare(`
      INSERT INTO lorebooks (id, name, description, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, description, userId, now, now);

    const created = db.prepare('SELECT * FROM lorebooks WHERE id = ?').get(id);
    return res.status(201).json({ lorebook: { ...created, entries: [] } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update lorebook (Editor or Admin only)
lorebooksRouter.put('/:id', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE lorebooks SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        updated_at = ?
      WHERE id = ?
    `).run(name, description, now, id);

    const updated = db.prepare('SELECT * FROM lorebooks WHERE id = ?').get(id);
    return res.json({ lorebook: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete lorebook (Editor or Admin only)
lorebooksRouter.delete('/:id', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM lorebooks WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Lorebook deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create entry in lorebook (Editor or Admin only)
lorebooksRouter.post('/:id/entries', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id: lorebook_id } = req.params;
  const {
    keys = [],
    secondary_keys = [],
    content,
    comment = '',
    enabled = true,
    constant = false,
    selective = false,
    priority = 10,
    order_index = 0
  } = req.body;

  if (!content) return res.status(400).json({ error: 'Content is required' });

  const entryId = `entry_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO lore_entries (id, lorebook_id, keys, secondary_keys, content, comment, enabled, constant, selective, priority, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      lorebook_id,
      JSON.stringify(keys),
      JSON.stringify(secondary_keys),
      content,
      comment,
      enabled ? 1 : 0,
      constant ? 1 : 0,
      selective ? 1 : 0,
      priority,
      order_index
    );

    db.prepare('UPDATE lorebooks SET updated_at = ? WHERE id = ?').run(now, lorebook_id);

    const created = db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(entryId);
    return res.status(201).json({ entry: formatEntry(created) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update entry (Editor or Admin only)
lorebooksRouter.put('/entries/:entryId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { entryId } = req.params;
  const { keys, secondary_keys, content, comment, enabled, constant, selective, priority, order_index } = req.body;
  const now = new Date().toISOString();

  try {
    const existing = db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(entryId) as any;
    if (!existing) return res.status(404).json({ error: 'Entry not found' });

    db.prepare(`
      UPDATE lore_entries SET
        keys = COALESCE(?, keys),
        secondary_keys = COALESCE(?, secondary_keys),
        content = COALESCE(?, content),
        comment = COALESCE(?, comment),
        enabled = COALESCE(?, enabled),
        constant = COALESCE(?, constant),
        selective = COALESCE(?, selective),
        priority = COALESCE(?, priority),
        order_index = COALESCE(?, order_index)
      WHERE id = ?
    `).run(
      keys ? JSON.stringify(keys) : null,
      secondary_keys ? JSON.stringify(secondary_keys) : null,
      content,
      comment,
      enabled !== undefined ? (enabled ? 1 : 0) : null,
      constant !== undefined ? (constant ? 1 : 0) : null,
      selective !== undefined ? (selective ? 1 : 0) : null,
      priority,
      order_index,
      entryId
    );

    db.prepare('UPDATE lorebooks SET updated_at = ? WHERE id = ?').run(now, existing.lorebook_id);

    const updated = db.prepare('SELECT * FROM lore_entries WHERE id = ?').get(entryId);
    return res.json({ entry: formatEntry(updated) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete entry (Editor or Admin only)
lorebooksRouter.delete('/entries/:entryId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { entryId } = req.params;
  try {
    db.prepare('DELETE FROM lore_entries WHERE id = ?').run(entryId);
    return res.json({ success: true, message: 'Lore entry deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
