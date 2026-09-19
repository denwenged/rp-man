import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { llmService } from '../services/llmService';
import { Character, GroupSession, GroupMessage } from '../../shared/types';

export const groupsRouter = Router();

groupsRouter.use(authMiddleware);

function getCharacter(id: string): Character | null {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
  if (!row) return null;
  const rels = db.prepare('SELECT * FROM user_relationships WHERE character_id = ?').all(id) as any[];

  return {
    ...row,
    is_public: Boolean(row.is_public),
    alternate_greetings: JSON.parse(row.alternate_greetings || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    expressions: JSON.parse(row.expressions || '[]'),
    relationships: rels || [],
    model_config: JSON.parse(row.model_config || '{}'),
    discord_config: JSON.parse(row.discord_config || '{}'),
    context_config: JSON.parse(row.context_config || '{}')
  };
}

// List group sessions
groupsRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const rows = db.prepare('SELECT * FROM group_sessions WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as any[];
    const sessions = rows.map(r => ({
      ...r,
      character_ids: JSON.parse(r.character_ids || '[]')
    }));
    return res.json({ groups: sessions });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create group session
groupsRouter.post('/', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { title = 'Group Roleplay Room', character_ids = [], scenario = '', user_persona_name = req.user!.username } = req.body;

  if (!character_ids || character_ids.length < 2) {
    return res.status(400).json({ error: 'Please select at least 2 characters for group roleplay.' });
  }

  const id = `grp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO group_sessions (id, title, user_id, character_ids, scenario, user_persona_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, userId, JSON.stringify(character_ids), scenario, user_persona_name, now, now);

    // Initial starter message if scenario is provided
    if (scenario.trim()) {
      const msgId = `gmsg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      db.prepare(`
        INSERT INTO group_messages (id, group_id, sender_type, sender_id, sender_name, sender_avatar, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(msgId, id, 'user', 'system_narrator', 'Narrator', 'https://api.dicebear.com/7.x/bottts/svg?seed=narrator', `[Scenario]: ${scenario.trim()}`, now);
    }

    const created = db.prepare('SELECT * FROM group_sessions WHERE id = ?').get(id) as any;
    return res.status(201).json({ group: { ...created, character_ids: JSON.parse(created.character_ids || '[]') } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get group session with messages and characters
groupsRouter.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const session = db.prepare('SELECT * FROM group_sessions WHERE id = ?').get(id) as any;
    if (!session) return res.status(404).json({ error: 'Group session not found' });

    const charIds: string[] = JSON.parse(session.character_ids || '[]');
    const characters = charIds.map(cid => getCharacter(cid)).filter(Boolean) as Character[];
    const messages = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC').all(id);

    return res.json({
      group: { ...session, character_ids: charIds },
      characters,
      messages
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete group session
groupsRouter.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM group_sessions WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Group session deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Send user message to group
groupsRouter.post('/:id/messages', (req: AuthenticatedRequest, res: Response) => {
  const { id: groupId } = req.params;
  const { content, user_persona_name } = req.body;
  const userId = req.user!.id;
  const now = new Date().toISOString();

  if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required' });

  try {
    const session = db.prepare('SELECT * FROM group_sessions WHERE id = ?').get(groupId) as any;
    if (!session) return res.status(404).json({ error: 'Group session not found' });

    const senderName = user_persona_name || session.user_persona_name || req.user!.username;
    const msgId = `gmsg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    db.prepare(`
      INSERT INTO group_messages (id, group_id, sender_type, sender_id, sender_name, sender_avatar, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      groupId,
      'user',
      userId,
      senderName,
      req.user!.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}`,
      content.trim(),
      now
    );

    db.prepare('UPDATE group_sessions SET updated_at = ? WHERE id = ?').run(now, groupId);

    const created = db.prepare('SELECT * FROM group_messages WHERE id = ?').get(msgId);
    return res.status(201).json({ message: created });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Trigger Character Turn in Group Conversation
groupsRouter.post('/:id/turn', async (req: AuthenticatedRequest, res: Response) => {
  const { id: groupId } = req.params;
  const { character_id } = req.body;

  try {
    const session = db.prepare('SELECT * FROM group_sessions WHERE id = ?').get(groupId) as any;
    if (!session) return res.status(404).json({ error: 'Group session not found' });

    const charIds: string[] = JSON.parse(session.character_ids || '[]');
    const characters = charIds.map(cid => getCharacter(cid)).filter(Boolean) as Character[];

    // Pick target character: if specified, use that; else rotate to character that spoke least recently
    let targetChar: Character | undefined;
    if (character_id) {
      targetChar = characters.find(c => c.id === character_id);
    } else {
      const lastMsg = db.prepare('SELECT sender_id FROM group_messages WHERE group_id = ? ORDER BY created_at DESC LIMIT 1').get(groupId) as any;
      targetChar = characters.find(c => c.id !== lastMsg?.sender_id) || characters[0];
    }

    if (!targetChar) return res.status(404).json({ error: 'Character not found' });

    // Fetch conversation history
    const allMsgs = db.prepare('SELECT * FROM group_messages WHERE group_id = ? ORDER BY created_at ASC').all(groupId) as GroupMessage[];
    const historyForPrompt = allMsgs.slice(-14).map(m => {
      const isTarget = m.sender_id === targetChar!.id;
      return {
        role: (isTarget ? 'assistant' : 'user') as 'user' | 'assistant',
        content: `${m.sender_name}: ${m.content}`
      };
    });

    const otherCharNames = characters.filter(c => c.id !== targetChar!.id).map(c => c.name).join(', ');
    const groupInstructions = `[Group Roleplay Context]: You are participating in a multi-character group conversation with: ${otherCharNames} and User (${session.user_persona_name}).
Interact naturally with the other characters in the room. Address them by name and react to their dialogue and actions.
Keep response authentic, snappy, and descriptive (*actions in asterisks*, "speech in quotes").`;

    const charWithGroupPrompt: Character = {
      ...targetChar,
      system_prompt: `${targetChar.system_prompt || ''}\n\n${groupInstructions}`
    };

    const response = await llmService.generate({
      character: charWithGroupPrompt,
      userPersonaName: session.user_persona_name || 'User',
      history: historyForPrompt,
      priority: 1
    });

    const cleanReply = response.cleanText || response.text;
    const now = new Date().toISOString();
    const msgId = `gmsg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const avatar = response.expressionAvatar || targetChar.avatar_url;

    db.prepare(`
      INSERT INTO group_messages (id, group_id, sender_type, sender_id, sender_name, sender_avatar, content, expression, expression_emoji, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      groupId,
      'character',
      targetChar.id,
      targetChar.name,
      avatar,
      cleanReply,
      response.expression || '',
      response.expressionEmoji || '',
      now
    );

    db.prepare('UPDATE group_sessions SET updated_at = ? WHERE id = ?').run(now, groupId);

    const createdMsg = db.prepare('SELECT * FROM group_messages WHERE id = ?').get(msgId);
    return res.json({
      message: createdMsg,
      character: targetChar,
      latencyMs: response.latencyMs
    });
  } catch (e: any) {
    logger.error('LLM', `Group turn generation error: ${e.message}`);
    return res.status(500).json({ error: e.message });
  }
});
