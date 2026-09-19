import { Router, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { db } from '../db';
import { authMiddleware, requireEditorOrAdmin, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { Character, UserRelationship, CharacterMemory } from '../../shared/types';
import { CardImportExport } from '../services/cardImportExport';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const charactersRouter = Router();

charactersRouter.use(authMiddleware);

function formatCharacter(row: any): Character {
  const rels = db.prepare('SELECT * FROM user_relationships WHERE character_id = ? ORDER BY created_at ASC').all(row.id) as UserRelationship[];
  const mems = db.prepare('SELECT * FROM character_memories WHERE character_id = ? ORDER BY updated_at DESC LIMIT 30').all(row.id) as CharacterMemory[];

  return {
    ...row,
    is_public: Boolean(row.is_public),
    alternate_greetings: JSON.parse(row.alternate_greetings || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    expressions: JSON.parse(row.expressions || '[]'),
    relationships: rels || [],
    memories: mems || [],
    model_config: JSON.parse(row.model_config || '{}'),
    discord_config: JSON.parse(row.discord_config || '{}'),
    context_config: JSON.parse(row.context_config || '{}')
  };
}

// List characters (All authenticated users can browse public characters)
charactersRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const query = (req.query.q as string || '').toLowerCase().trim();

  try {
    let rows: any[];
    if (isAdmin) {
      rows = db.prepare('SELECT * FROM characters ORDER BY updated_at DESC').all();
    } else {
      rows = db.prepare('SELECT * FROM characters WHERE is_public = 1 OR user_id = ? ORDER BY updated_at DESC').all(userId);
    }

    let characters = rows.map(formatCharacter);

    if (query) {
      characters = characters.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.tagline?.toLowerCase().includes(query) ||
        c.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    return res.json({ characters });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get character by ID
charactersRouter.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Character not found' });
    return res.json({ character: formatCharacter(row) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create character (Editor or Admin only)
charactersRouter.post('/', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date().toISOString();
  const id = `char_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const {
    name = 'New Character',
    avatar_url = '',
    tagline = '',
    description = '',
    personality = '',
    scenario = '',
    first_mes = '',
    alternate_greetings = [],
    mes_example = '',
    system_prompt = '',
    post_history_instructions = '',
    creator_notes = '',
    tags = [],
    expressions = [],
    is_public = true,
    model_config = {},
    discord_config = {},
    context_config = {}
  } = req.body;

  try {
    const insert = db.prepare(`
      INSERT INTO characters (
        id, name, avatar_url, tagline, description, personality, scenario,
        first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions,
        creator_notes, tags, expressions, user_id, is_public, model_config, discord_config, context_config,
        created_at, updated_at
      ) VALUES (
        @id, @name, @avatar_url, @tagline, @description, @personality, @scenario,
        @first_mes, @alternate_greetings, @mes_example, @system_prompt, @post_history_instructions,
        @creator_notes, @tags, @expressions, @user_id, @is_public, @model_config, @discord_config, @context_config,
        @created_at, @updated_at
      )
    `);

    insert.run({
      id,
      name,
      avatar_url: avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`,
      tagline,
      description,
      personality,
      scenario,
      first_mes,
      alternate_greetings: JSON.stringify(alternate_greetings),
      mes_example,
      system_prompt,
      post_history_instructions,
      creator_notes,
      tags: JSON.stringify(tags),
      expressions: JSON.stringify(expressions),
      user_id: userId,
      is_public: is_public ? 1 : 0,
      model_config: JSON.stringify(model_config),
      discord_config: JSON.stringify(discord_config),
      context_config: JSON.stringify(context_config),
      created_at: now,
      updated_at: now
    });

    const created = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    logger.info('SYSTEM', `User ${req.user!.username} created character "${name}" (${id})`);
    return res.status(201).json({ character: formatCharacter(created) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update character (Editor or Admin only)
charactersRouter.put('/:id', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';
  const now = new Date().toISOString();

  try {
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Character not found' });

    if (!isAdmin && existing.user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied to edit this character' });
    }

    const {
      name = existing.name,
      avatar_url = existing.avatar_url,
      tagline = existing.tagline,
      description = existing.description,
      personality = existing.personality,
      scenario = existing.scenario,
      first_mes = existing.first_mes,
      alternate_greetings = JSON.parse(existing.alternate_greetings || '[]'),
      mes_example = existing.mes_example,
      system_prompt = existing.system_prompt,
      post_history_instructions = existing.post_history_instructions,
      creator_notes = existing.creator_notes,
      tags = JSON.parse(existing.tags || '[]'),
      expressions = JSON.parse(existing.expressions || '[]'),
      is_public = Boolean(existing.is_public),
      model_config = JSON.parse(existing.model_config || '{}'),
      discord_config = JSON.parse(existing.discord_config || '{}'),
      context_config = JSON.parse(existing.context_config || '{}')
    } = req.body;

    const update = db.prepare(`
      UPDATE characters SET
        name = @name,
        avatar_url = @avatar_url,
        tagline = @tagline,
        description = @description,
        personality = @personality,
        scenario = @scenario,
        first_mes = @first_mes,
        alternate_greetings = @alternate_greetings,
        mes_example = @mes_example,
        system_prompt = @system_prompt,
        post_history_instructions = @post_history_instructions,
        creator_notes = @creator_notes,
        tags = @tags,
        expressions = @expressions,
        is_public = @is_public,
        model_config = @model_config,
        discord_config = @discord_config,
        context_config = @context_config,
        updated_at = @updated_at
      WHERE id = @id
    `);

    update.run({
      id,
      name,
      avatar_url,
      tagline,
      description,
      personality,
      scenario,
      first_mes,
      alternate_greetings: JSON.stringify(alternate_greetings),
      mes_example,
      system_prompt,
      post_history_instructions,
      creator_notes,
      tags: JSON.stringify(tags),
      expressions: JSON.stringify(expressions),
      is_public: is_public ? 1 : 0,
      model_config: JSON.stringify(model_config),
      discord_config: JSON.stringify(discord_config),
      context_config: JSON.stringify(context_config),
      updated_at: now
    });

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    return res.json({ character: formatCharacter(updated) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete character (Editor or Admin only)
charactersRouter.delete('/:id', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  try {
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!existing) return res.status(404).json({ error: 'Character not found' });
    if (!isAdmin && existing.user_id !== userId) return res.status(403).json({ error: 'Permission denied' });

    db.prepare('DELETE FROM characters WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Character deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Duplicate character (Editor or Admin only)
charactersRouter.post('/:id/duplicate', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const now = new Date().toISOString();
  const newId = `char_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  try {
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!char) return res.status(404).json({ error: 'Source character not found' });

    const newName = `${char.name} (Copy)`;
    const newPrefix = `${char.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)}2:`;
    const discordCfg = JSON.parse(char.discord_config || '{}');
    discordCfg.trigger_prefix = newPrefix;

    db.prepare(`
      INSERT INTO characters (
        id, name, avatar_url, tagline, description, personality, scenario,
        first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions,
        creator_notes, tags, expressions, user_id, is_public, model_config, discord_config, context_config,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?
      )
    `).run(
      newId,
      newName,
      char.avatar_url,
      char.tagline,
      char.description,
      char.personality,
      char.scenario,
      char.first_mes,
      char.alternate_greetings,
      char.mes_example,
      char.system_prompt,
      char.post_history_instructions,
      char.creator_notes,
      char.tags,
      char.expressions || '[]',
      userId,
      char.is_public,
      char.model_config,
      JSON.stringify(discordCfg),
      char.context_config,
      now,
      now
    );

    const created = db.prepare('SELECT * FROM characters WHERE id = ?').get(newId);
    return res.status(201).json({ character: formatCharacter(created) });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Export Tavern V2 JSON (Readable by all authenticated users)
charactersRouter.get('/:id/export', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Character not found' });
    const char = formatCharacter(row);
    const tavernCard = CardImportExport.exportToTavernV2(char);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(char.name)}.json"`);
    return res.send(JSON.stringify(tavernCard, null, 2));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Import Tavern V2 JSON or PNG Card (Editor or Admin only)
charactersRouter.post('/import', requireEditorOrAdmin, upload.single('file'), (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const now = new Date().toISOString();
  const id = `char_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  try {
    let rawData: any = null;
    if (req.file) {
      const isPng = req.file.mimetype.includes('png') || req.file.originalname.toLowerCase().endsWith('.png');
      if (isPng) {
        rawData = CardImportExport.extractJsonFromPng(req.file.buffer);
        if (!rawData) return res.status(400).json({ error: 'No embedded character card data found in PNG image' });
      } else {
        rawData = JSON.parse(req.file.buffer.toString('utf-8'));
      }
    } else if (req.body && req.body.json_data) {
      rawData = typeof req.body.json_data === 'string' ? JSON.parse(req.body.json_data) : req.body.json_data;
    } else {
      return res.status(400).json({ error: 'No file or json_data provided' });
    }

    const parsed = CardImportExport.parseCharacterData(rawData, userId);

    db.prepare(`
      INSERT INTO characters (
        id, name, avatar_url, tagline, description, personality, scenario,
        first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions,
        creator_notes, tags, expressions, user_id, is_public, model_config, discord_config, context_config,
        created_at, updated_at
      ) VALUES (
        @id, @name, @avatar_url, @tagline, @description, @personality, @scenario,
        @first_mes, @alternate_greetings, @mes_example, @system_prompt, @post_history_instructions,
        @creator_notes, @tags, '[]', @user_id, @is_public, @model_config, @discord_config, @context_config,
        @created_at, @updated_at
      )
    `).run({
      id,
      name: parsed.name,
      avatar_url: parsed.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(parsed.name || 'char')}`,
      tagline: parsed.tagline || '',
      description: parsed.description || '',
      personality: parsed.personality || '',
      scenario: parsed.scenario || '',
      first_mes: parsed.first_mes || '',
      alternate_greetings: JSON.stringify(parsed.alternate_greetings || []),
      mes_example: parsed.mes_example || '',
      system_prompt: parsed.system_prompt || '',
      post_history_instructions: parsed.post_history_instructions || '',
      creator_notes: parsed.creator_notes || '',
      tags: JSON.stringify(parsed.tags || []),
      user_id: userId,
      is_public: 1,
      model_config: JSON.stringify(parsed.model_config || {}),
      discord_config: JSON.stringify(parsed.discord_config || {}),
      context_config: JSON.stringify(parsed.context_config || {}),
      created_at: now,
      updated_at: now
    });

    const created = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    return res.status(201).json({ character: formatCharacter(created) });
  } catch (e: any) {
    return res.status(400).json({ error: `Import failed: ${e.message}` });
  }
});

// ================= USER RELATIONSHIPS CRUD =================
// List relationships for character (Readable by authenticated users)
charactersRouter.get('/:id/relationships', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const rows = db.prepare('SELECT * FROM user_relationships WHERE character_id = ? ORDER BY created_at ASC').all(id);
    return res.json({ relationships: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Add relationship (Editor or Admin only)
charactersRouter.post('/:id/relationships', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id: character_id } = req.params;
  const { user_identifier, relationship_type, relationship_notes, affinity_level = 50 } = req.body;
  if (!user_identifier || !relationship_type || !relationship_notes) {
    return res.status(400).json({ error: 'user_identifier, relationship_type, and relationship_notes are required' });
  }

  const id = `rel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO user_relationships (id, character_id, user_identifier, relationship_type, relationship_notes, affinity_level, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, character_id, user_identifier.trim(), relationship_type.trim(), relationship_notes.trim(), affinity_level, now, now);

    const created = db.prepare('SELECT * FROM user_relationships WHERE id = ?').get(id);
    return res.status(201).json({ relationship: created });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update relationship (Editor or Admin only)
charactersRouter.put('/relationships/:relId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { relId } = req.params;
  const { user_identifier, relationship_type, relationship_notes, affinity_level } = req.body;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE user_relationships SET
        user_identifier = COALESCE(?, user_identifier),
        relationship_type = COALESCE(?, relationship_type),
        relationship_notes = COALESCE(?, relationship_notes),
        affinity_level = COALESCE(?, affinity_level),
        updated_at = ?
      WHERE id = ?
    `).run(user_identifier, relationship_type, relationship_notes, affinity_level, now, relId);

    const updated = db.prepare('SELECT * FROM user_relationships WHERE id = ?').get(relId);
    return res.json({ relationship: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete relationship (Editor or Admin only)
charactersRouter.delete('/relationships/:relId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { relId } = req.params;
  try {
    db.prepare('DELETE FROM user_relationships WHERE id = ?').run(relId);
    return res.json({ success: true, message: 'Relationship deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// ================= CHARACTER MEMORIES & MIND CRUD =================
// List memories stored by character
charactersRouter.get('/:id/memories', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const rows = db.prepare('SELECT * FROM character_memories WHERE character_id = ? ORDER BY updated_at DESC').all(id);
    return res.json({ memories: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Add memory note manually (Editor or Admin only)
charactersRouter.post('/:id/memories', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id: character_id } = req.params;
  const { user_identifier, user_display_name = '', memory_text, category = 'fact' } = req.body;
  if (!user_identifier || !memory_text) {
    return res.status(400).json({ error: 'user_identifier and memory_text are required' });
  }

  const id = `mem_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO character_memories (id, character_id, user_identifier, user_display_name, memory_text, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, character_id, user_identifier.trim(), user_display_name.trim(), memory_text.trim(), category, now, now);

    const created = db.prepare('SELECT * FROM character_memories WHERE id = ?').get(id);
    return res.status(201).json({ memory: created });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update memory note (Editor or Admin only)
charactersRouter.put('/memories/:memoryId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { memoryId } = req.params;
  const { memory_text, user_display_name, category } = req.body;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE character_memories SET
        memory_text = COALESCE(?, memory_text),
        user_display_name = COALESCE(?, user_display_name),
        category = COALESCE(?, category),
        updated_at = ?
      WHERE id = ?
    `).run(memory_text, user_display_name, category, now, memoryId);

    const updated = db.prepare('SELECT * FROM character_memories WHERE id = ?').get(memoryId);
    return res.json({ memory: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete memory note (Editor or Admin only)
charactersRouter.delete('/memories/:memoryId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { memoryId } = req.params;
  try {
    db.prepare('DELETE FROM character_memories WHERE id = ?').run(memoryId);
    return res.json({ success: true, message: 'Memory deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Clear single user's memories for character (Editor or Admin only)
charactersRouter.delete('/:id/memories/user/:userId', requireEditorOrAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id: character_id, userId } = req.params;
  try {
    db.prepare('DELETE FROM character_memories WHERE character_id = ? AND (user_identifier = ? OR LOWER(user_display_name) = LOWER(?))').run(character_id, userId, userId);
    return res.json({ success: true, message: 'User memories cleared' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
