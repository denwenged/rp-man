import { Router, Response } from 'express';
import { discordService } from '../services/discordService';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';

export const discordRouter = Router();

discordRouter.use(authMiddleware);

// Get Discord Bot configuration
discordRouter.get('/config', (req: AuthenticatedRequest, res: Response) => {
  const config = discordService.getConfig();
  // Mask token for non-admins if desired, or return safe representation
  const maskedToken = config.token ? `${config.token.substring(0, 8)}...${config.token.substring(config.token.length - 4)}` : '';
  return res.json({
    config: {
      ...config,
      has_token: Boolean(config.token),
      masked_token: maskedToken
    }
  });
});

// Update Discord Bot configuration (Admin only)
discordRouter.put('/config', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    token,
    default_character_id,
    allow_dm,
    typing_indicator,
    prefix,
    rate_limit_per_user_sec,
    max_response_length,
    split_long_messages,
    status_activity,
    status_type
  } = req.body;

  try {
    const updatePayload: any = {};
    if (token !== undefined && token.trim() !== '') updatePayload.token = token.trim();
    if (default_character_id !== undefined) updatePayload.default_character_id = default_character_id;
    if (allow_dm !== undefined) updatePayload.allow_dm = Boolean(allow_dm);
    if (typing_indicator !== undefined) updatePayload.typing_indicator = Boolean(typing_indicator);
    if (prefix !== undefined) updatePayload.prefix = prefix;
    if (rate_limit_per_user_sec !== undefined) updatePayload.rate_limit_per_user_sec = Number(rate_limit_per_user_sec);
    if (max_response_length !== undefined) updatePayload.max_response_length = Number(max_response_length);
    if (split_long_messages !== undefined) updatePayload.split_long_messages = Boolean(split_long_messages);
    if (status_activity !== undefined) updatePayload.status_activity = status_activity;
    if (status_type !== undefined) updatePayload.status_type = status_type;

    const updated = discordService.updateConfig(updatePayload);
    logger.info('DISCORD', `Discord bot configuration updated by ${req.user!.username}`);

    return res.json({ success: true, config: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get Discord Bot Live Status
discordRouter.get('/status', (req: AuthenticatedRequest, res: Response) => {
  const status = discordService.getStatus();
  return res.json({ status });
});

// Start Discord Bot
discordRouter.post('/start', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await discordService.start();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Stop Discord Bot
discordRouter.post('/stop', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await discordService.stop();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Restart Discord Bot
discordRouter.post('/restart', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await discordService.restart();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Test Webhook firing
discordRouter.post('/test-webhook', async (req: AuthenticatedRequest, res: Response) => {
  const { webhook_url, username = 'RP-Man Test Bot', avatar_url = '', message = 'Hello from RP-Man Character Manager! Webhook is working perfectly.' } = req.body;
  if (!webhook_url) {
    return res.status(400).json({ error: 'webhook_url is required' });
  }

  try {
    const success = await discordService.sendViaDirectWebhook(webhook_url, username, avatar_url, message);
    if (success) {
      return res.json({ success: true, message: 'Webhook message sent successfully to Discord!' });
    } else {
      return res.status(400).json({ success: false, error: 'Failed to send webhook message. Please check the URL.' });
    }
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
