import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { initDatabase } from './db/index';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { charactersRouter } from './routes/characters';
import { chatsRouter } from './routes/chats';
import { groupsRouter } from './routes/groups';
import { ollamaRouter } from './routes/ollama';
import { discordRouter } from './routes/discord';
import { providersRouter } from './routes/providers';
import { lorebooksRouter } from './routes/lorebooks';
import { systemRouter } from './routes/system';
import { logsRouter } from './routes/logs';
import { logger } from './services/loggerService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('SYSTEM', `Uncaught Exception: ${err.message}`, err.stack);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('SYSTEM', `Unhandled Rejection: ${reason?.message || reason}`, reason?.stack);
});

// Initialize SQLite database
initDatabase();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/ollama', ollamaRouter);
app.use('/api/discord', discordRouter);
app.use('/api/providers', providersRouter);
app.use('/api/lorebooks', lorebooksRouter);
app.use('/api/system', systemRouter);
app.use('/api/logs', logsRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend in production or if dist directory exists
const clientDist = path.join(process.cwd(), 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
}

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('SYSTEM', `Express error on ${req.method} ${req.url}: ${err.message}`, err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

const server = app.listen(PORT, HOST, () => {
  logger.info('SYSTEM', `🏰 RP-Man Server running at http://${HOST}:${PORT}`);
  console.log(`🏰 RP-Man Server is active on http://${HOST}:${PORT}`);
});

const heartbeat = setInterval(() => {}, 1000 * 60 * 60);
process.on('SIGINT', () => {
  clearInterval(heartbeat);
  server.close();
});
process.on('SIGTERM', () => {
  clearInterval(heartbeat);
  server.close();
});
