import { Router, Response } from 'express';
import { logger } from '../services/loggerService';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth';

export const logsRouter = Router();

logsRouter.use(authMiddleware);

// Get recent logs
logsRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const category = req.query.category as string;
  const level = req.query.level as string;

  const logs = logger.getRecentLogs(limit, category, level);
  return res.json({ logs });
});

// SSE Stream for live logs
logsRouter.get('/stream', (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onLog = (entry: any) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  logger.on('new_log', onLog);

  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    logger.off('new_log', onLog);
  });
});

// Clear logs (Admin only)
logsRouter.delete('/', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  logger.clearLogs();
  return res.json({ success: true, message: 'Logs cleared' });
});
