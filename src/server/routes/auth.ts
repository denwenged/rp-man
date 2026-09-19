import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest, generateToken } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { User } from '../../shared/types';

export const authRouter = Router();

// Login
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username) as any;
    if (!user) {
      logger.warn('AUTH', `Failed login attempt for username: ${username}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      logger.warn('AUTH', `Invalid password for username: ${username}`);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userObj: User = {
      id: user.id,
      username: user.username,
      role: user.role,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    const token = generateToken(userObj);

    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    logger.info('AUTH', `User logged in: ${user.username} (${user.role})`);
    return res.json({ token, user: userObj });
  } catch (e: any) {
    logger.error('AUTH', `Login error: ${e.message}`);
    return res.status(500).json({ error: 'Login server error' });
  }
});

// Current User profile
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

// Logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out' });
});

// Update current user profile/password
authRouter.put('/profile', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { password, avatar_url } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  try {
    if (password && password.trim().length >= 4) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ?, avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE id = ?')
        .run(hash, avatar_url, now, userId);
    } else if (avatar_url !== undefined) {
      db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
        .run(avatar_url, now, userId);
    }

    const updatedUser = db.prepare('SELECT id, username, role, avatar_url, created_at, updated_at FROM users WHERE id = ?').get(userId);
    return res.json({ user: updatedUser });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
