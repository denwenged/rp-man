import { Router, Response } from 'express';
import { ollamaService } from '../services/ollamaService';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';

export const ollamaRouter = Router();

ollamaRouter.use(authMiddleware);

// Check Ollama status & latency
ollamaRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await ollamaService.checkConnection();
    return res.json({
      ...status,
      host: ollamaService.getHostUrl()
    });
  } catch (e: any) {
    return res.json({
      online: false,
      latency_ms: 0,
      host: ollamaService.getHostUrl(),
      error: e.message
    });
  }
});

// List installed models
ollamaRouter.get('/models', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const models = await ollamaService.getModels();
    return res.json({ models });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// List running models in memory (VRAM / RAM)
ollamaRouter.get('/ps', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const running = await ollamaService.getRunningModels();
    return res.json({ models: running });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Unload a specific model from RAM
ollamaRouter.post('/unload', async (req: AuthenticatedRequest, res: Response) => {
  const { model } = req.body;
  if (!model) {
    return res.status(400).json({ error: 'Model name is required' });
  }

  try {
    const result = await ollamaService.unloadModel(model);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Unload all models from RAM
ollamaRouter.post('/unload-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await ollamaService.unloadAllModels();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete a model
ollamaRouter.delete('/models/:name', async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.params;
  try {
    const result = await ollamaService.deleteModel(name);
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// List active downloads / pulls
ollamaRouter.get('/pulls', (req: AuthenticatedRequest, res: Response) => {
  return res.json({ pulls: ollamaService.getActivePulls() });
});

// Pull / download a model
ollamaRouter.post('/pull', async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Model name is required (e.g. llama3.2:3b)' });
  }

  const cleanName = name.trim();

  // Start background pull
  ollamaService.pullModel(cleanName).catch(err => {
    logger.error('OLLAMA', `Background pull failed for ${cleanName}: ${err.message}`);
  });

  return res.json({
    success: true,
    message: `Started download for ${cleanName}. Progress will update in real-time.`
  });
});

// Create custom model with modelfile
ollamaRouter.post('/create', async (req: AuthenticatedRequest, res: Response) => {
  const { name, modelfile } = req.body;
  if (!name || !modelfile) {
    return res.status(400).json({ error: 'Name and Modelfile content are required' });
  }

  try {
    await ollamaService.createModel(name.trim(), modelfile);
    return res.json({ success: true, message: `Model ${name} created successfully.` });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
