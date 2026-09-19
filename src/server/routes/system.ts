import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { getSystemStats } from '../services/systemStatsService';
import { ollamaService } from '../services/ollamaService';
import { queueService } from '../services/queueService';
import { logger } from '../services/loggerService';
import { ServerSettings } from '../../shared/types';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const name = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export const systemRouter = Router();

// Public / auth stats
systemRouter.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getSystemStats();
    return res.json({ stats });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get Server Settings
systemRouter.get('/settings', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as any;
    const settings: ServerSettings = row ? JSON.parse(row.config) : {};
    return res.json({ settings });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update Server Settings (Admin only)
systemRouter.put('/settings', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const newSettings: Partial<ServerSettings> = req.body;
  const now = new Date().toISOString();

  try {
    const row = db.prepare('SELECT config FROM server_settings WHERE id = ?').get('global') as any;
    const current: ServerSettings = row ? JSON.parse(row.config) : {};
    const updated = { ...current, ...newSettings };

    db.prepare(`
      INSERT INTO server_settings (id, config, updated_at)
      VALUES ('global', ?, ?)
      ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
    `).run(JSON.stringify(updated), now);

    // Update live service instances
    ollamaService.reloadHost();
    queueService.reloadSettings();

    logger.info('SYSTEM', `Server settings updated by ${req.user!.username}`);
    return res.json({ success: true, settings: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Image / Avatar upload
systemRouter.post('/upload', authMiddleware, upload.single('image'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const fileUrl = `/api/system/uploads/${req.file.filename}`;
  return res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename
  });
});

// Serve uploaded files
systemRouter.get('/uploads/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;
  const sanitized = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Image not found');
  }

  return res.sendFile(filePath);
});

// Export database backup (Admin only)
systemRouter.get('/backup', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const characters = db.prepare('SELECT * FROM characters').all();
    const lorebooks = db.prepare('SELECT * FROM lorebooks').all();
    const lore_entries = db.prepare('SELECT * FROM lore_entries').all();
    const providers = db.prepare('SELECT * FROM llm_providers').all();
    const discord = db.prepare('SELECT * FROM discord_settings').all();
    const server = db.prepare('SELECT * FROM server_settings').all();

    const backupData = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      characters,
      lorebooks,
      lore_entries,
      providers,
      discord,
      server
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rp_man_backup_${Date.now()}.json"`);
    return res.send(JSON.stringify(backupData, null, 2));
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Restore database from backup JSON (Admin only)
systemRouter.post('/restore', authMiddleware, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const data = req.body;
  if (!data || !data.characters) {
    return res.status(400).json({ error: 'Invalid backup data' });
  }

  try {
    const restoreTx = db.transaction(() => {
      // Restore characters
      if (Array.isArray(data.characters)) {
        for (const char of data.characters) {
          db.prepare(`
            INSERT OR REPLACE INTO characters (
              id, name, avatar_url, tagline, description, personality, scenario,
              first_mes, alternate_greetings, mes_example, system_prompt, post_history_instructions,
              creator_notes, tags, user_id, is_public, model_config, discord_config, context_config,
              created_at, updated_at
            ) VALUES (
              @id, @name, @avatar_url, @tagline, @description, @personality, @scenario,
              @first_mes, @alternate_greetings, @mes_example, @system_prompt, @post_history_instructions,
              @creator_notes, @tags, @user_id, @is_public, @model_config, @discord_config, @context_config,
              @created_at, @updated_at
            )
          `).run(char);
        }
      }

      // Restore lorebooks & entries
      if (Array.isArray(data.lorebooks)) {
        for (const book of data.lorebooks) {
          db.prepare(`
            INSERT OR REPLACE INTO lorebooks (id, name, description, user_id, created_at, updated_at)
            VALUES (@id, @name, @description, @user_id, @created_at, @updated_at)
          `).run(book);
        }
      }

      if (Array.isArray(data.lore_entries)) {
        for (const entry of data.lore_entries) {
          db.prepare(`
            INSERT OR REPLACE INTO lore_entries (id, lorebook_id, keys, secondary_keys, content, comment, enabled, constant, selective, priority, order_index)
            VALUES (@id, @lorebook_id, @keys, @secondary_keys, @content, @comment, @enabled, @constant, @selective, @priority, @order_index)
          `).run(entry);
        }
      }
    });

    restoreTx();
    logger.info('SYSTEM', `Restored database backup from user ${req.user!.username}`);
    return res.json({ success: true, message: 'Database backup restored successfully.' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
