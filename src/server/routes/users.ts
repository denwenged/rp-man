import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { User } from '../../shared/types';

export const usersRouter = Router();

usersRouter.use(authMiddleware);

// List users (Admin only)
usersRouter.get('/', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = db.prepare('SELECT id, username, role, avatar_url, created_at, updated_at FROM users ORDER BY created_at ASC').all() as User[];
    return res.json({ users });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create new user (Admin only)
usersRouter.post('/', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { username, password, role = 'user', avatar_url = '' } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const cleanUser = username.trim();
  const cleanRole = role === 'admin' ? 'admin' : 'user';

  try {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUser);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const id = `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const password_hash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();
    const avatar = avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanUser}`;

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, cleanUser, password_hash, cleanRole, avatar, now, now);

    logger.info('AUTH', `Admin ${req.user!.username} created user ${cleanUser} (${cleanRole})`);

    const newUser: User = {
      id,
      username: cleanUser,
      role: cleanRole,
      avatar_url: avatar,
      created_at: now,
      updated_at: now
    };

    return res.status(201).json({ user: newUser });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Update user (Admin only)
usersRouter.put('/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { role, password, avatar_url } = req.body;
  const now = new Date().toISOString();

  try {
    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (password && password.trim()) {
      const hash = bcrypt.hashSync(password.trim(), 10);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, id);
    }

    if (role && (role === 'admin' || role === 'user')) {
      db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);
    }

    if (avatar_url !== undefined) {
      db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(avatar_url, now, id);
    }

    const updated = db.prepare('SELECT id, username, role, avatar_url, created_at, updated_at FROM users WHERE id = ?').get(id) as User;
    logger.info('AUTH', `Admin ${req.user!.username} updated user ${updated.username}`);
    return res.json({ user: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete user (Admin only)
usersRouter.delete('/:id', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const count = (db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "admin"').get() as any).count;
    const target = db.prepare('SELECT role, username FROM users WHERE id = ?').get(id) as any;
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'admin' && count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin user' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logger.info('AUTH', `Admin ${req.user!.username} deleted user ${target.username}`);
    return res.json({ success: true, message: 'User deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
