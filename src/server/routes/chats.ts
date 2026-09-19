import { Router, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../services/loggerService';
import { llmService } from '../services/llmService';
import { ContextManager } from '../services/contextManager';
import { Character, ChatMessage, ChatSession } from '../../shared/types';

export const chatsRouter = Router();

chatsRouter.use(authMiddleware);

function getCharacter(id: string): Character | null {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    is_public: Boolean(row.is_public),
    alternate_greetings: JSON.parse(row.alternate_greetings || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    model_config: JSON.parse(row.model_config || '{}'),
    discord_config: JSON.parse(row.discord_config || '{}'),
    context_config: JSON.parse(row.context_config || '{}')
  };
}

// List chat sessions
chatsRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const charId = req.query.character_id as string | undefined;

  try {
    let query = `
      SELECT s.*, 
             c.name as character_name, 
             c.avatar_url as character_avatar,
             (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as messages_count,
             (SELECT content FROM chat_messages m WHERE m.session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_sessions s
      JOIN characters c ON s.character_id = c.id
      WHERE s.user_id = ?
    `;
    const params: any[] = [userId];

    if (charId) {
      query += ' AND s.character_id = ?';
      params.push(charId);
    }

    query += ' ORDER BY s.updated_at DESC';

    const rows = db.prepare(query).all(...params);
    return res.json({ sessions: rows });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Create new chat session
chatsRouter.post('/', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const {
    character_id,
    title,
    user_persona_name = req.user!.username,
    user_persona_avatar = req.user!.avatar_url || '',
    user_persona_description = '',
    greeting_index = 0
  } = req.body;

  if (!character_id) {
    return res.status(400).json({ error: 'character_id is required' });
  }

  const char = getCharacter(character_id);
  if (!char) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const sessionId = `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const sessionTitle = title || `Chat with ${char.name}`;

  try {
    db.prepare(`
      INSERT INTO chat_sessions (
        id, character_id, user_id, title, user_persona_name, user_persona_avatar, user_persona_description, rolling_summary, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      character_id,
      userId,
      sessionTitle,
      user_persona_name,
      user_persona_avatar,
      user_persona_description,
      '',
      now,
      now
    );

    // Determine first greeting
    let greeting = char.first_mes || `*${char.name} looks over at you and nods.*`;
    if (greeting_index > 0 && char.alternate_greetings && char.alternate_greetings[greeting_index - 1]) {
      greeting = char.alternate_greetings[greeting_index - 1];
    }

    greeting = ContextManager.replaceMacros(greeting, char.name, user_persona_name, char.scenario);

    // Insert first assistant message
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, swipes, swipe_index, tokens_used, model_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      sessionId,
      'assistant',
      greeting,
      JSON.stringify([greeting]),
      0,
      ContextManager.estimateTokens(greeting),
      'greeting',
      now
    );

    const createdSession = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
    const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as any[];

    return res.status(201).json({
      session: createdSession,
      messages: messages.map(m => ({ ...m, swipes: JSON.parse(m.swipes || '[]') }))
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Get chat session with messages
chatsRouter.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    if (!isAdmin && session.user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const char = getCharacter(session.character_id);
    const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(id) as any[];

    return res.json({
      session,
      character: char,
      messages: messages.map(m => ({ ...m, swipes: JSON.parse(m.swipes || '[]') }))
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete chat session
chatsRouter.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.id;
  const isAdmin = req.user!.role === 'admin';

  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    if (!isAdmin && session.user_id !== userId) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
    return res.json({ success: true, message: 'Chat session deleted' });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Send message & generate response
chatsRouter.post('/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId } = req.params;
  const { content, user_persona_name } = req.body;
  const userId = req.user!.id;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const char = getCharacter(session.character_id);
    if (!char) {
      return res.status(404).json({ error: 'Associated character not found' });
    }

    const now = new Date().toISOString();
    const activeUserName = user_persona_name || session.user_persona_name || req.user!.username;

    // 1. Save user message
    const userMsgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const userTokens = ContextManager.estimateTokens(content);

    db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, swipes, swipe_index, user_persona_name, tokens_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userMsgId,
      sessionId,
      'user',
      content.trim(),
      JSON.stringify([content.trim()]),
      0,
      activeUserName,
      userTokens,
      now
    );

    // 2. Fetch history for generation
    const rawMessages = db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

    // 3. Generate Assistant Response
    const response = await llmService.generate({
      character: char,
      userPersonaName: activeUserName,
      history: rawMessages,
      rollingSummary: session.rolling_summary || '',
      priority: 1 // Highest priority for interactive web chat
    });

    const assistantMsgId = `msg_${Date.now() + 1}_${crypto.randomBytes(3).toString('hex')}`;
    const assistantNow = new Date().toISOString();

    db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, swipes, swipe_index, tokens_used, model_used, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assistantMsgId,
      sessionId,
      'assistant',
      response.text,
      JSON.stringify([response.text]),
      0,
      response.tokensUsed,
      response.modelUsed,
      assistantNow
    );

    // Update session timestamp
    db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(assistantNow, sessionId);

    // Check auto-summarization if history is large
    if (char.context_config?.enable_summary && rawMessages.length >= 24) {
      setTimeout(async () => {
        try {
          const msgsToSummarize = rawMessages.slice(0, -8);
          const newSummary = await llmService.generateSummary(char, session.rolling_summary || '', msgsToSummarize);
          db.prepare('UPDATE chat_sessions SET rolling_summary = ? WHERE id = ?').run(newSummary, sessionId);
        } catch (e) {}
      }, 500);
    }

    const assistantMsg = {
      id: assistantMsgId,
      session_id: sessionId,
      role: 'assistant',
      content: response.text,
      swipes: [response.text],
      swipe_index: 0,
      tokens_used: response.tokensUsed,
      model_used: response.modelUsed,
      created_at: assistantNow
    };

    const userMsg = {
      id: userMsgId,
      session_id: sessionId,
      role: 'user',
      content: content.trim(),
      swipes: [content.trim()],
      swipe_index: 0,
      user_persona_name: activeUserName,
      tokens_used: userTokens,
      created_at: now
    };

    return res.json({
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      latencyMs: response.latencyMs
    });
  } catch (e: any) {
    logger.error('LLM', `Error generating response in chat: ${e.message}`);
    return res.status(500).json({ error: `Generation failed: ${e.message}` });
  }
});

// Swipe / Regenerate Assistant Message
chatsRouter.post('/:id/messages/:msgId/swipe', async (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId, msgId } = req.params;
  const { direction } = req.body; // 'new' | 'left' | 'right'

  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msgRow = db.prepare('SELECT * FROM chat_messages WHERE id = ? AND session_id = ?').get(msgId, sessionId) as any;
    if (!msgRow) return res.status(404).json({ error: 'Message not found' });
    if (msgRow.role !== 'assistant') return res.status(400).json({ error: 'Can only swipe assistant messages' });

    const char = getCharacter(session.character_id);
    if (!char) return res.status(404).json({ error: 'Character not found' });

    const swipes: string[] = JSON.parse(msgRow.swipes || '[]');
    let swipeIndex = msgRow.swipe_index || 0;

    if (direction === 'left') {
      swipeIndex = Math.max(0, swipeIndex - 1);
      const content = swipes[swipeIndex] || msgRow.content;
      db.prepare('UPDATE chat_messages SET swipe_index = ?, content = ? WHERE id = ?').run(swipeIndex, content, msgId);
      return res.json({ message: { ...msgRow, content, swipes, swipe_index: swipeIndex } });
    }

    if (direction === 'right') {
      if (swipeIndex < swipes.length - 1) {
        swipeIndex++;
        const content = swipes[swipeIndex];
        db.prepare('UPDATE chat_messages SET swipe_index = ?, content = ? WHERE id = ?').run(swipeIndex, content, msgId);
        return res.json({ message: { ...msgRow, content, swipes, swipe_index: swipeIndex } });
      }
      // If at end, generate a new swipe
    }

    // Generate new swipe
    const allBefore = db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? AND created_at < ? ORDER BY created_at ASC')
      .all(sessionId, msgRow.created_at) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

    const response = await llmService.generate({
      character: char,
      userPersonaName: session.user_persona_name || req.user!.username,
      history: allBefore,
      rollingSummary: session.rolling_summary || '',
      priority: 1
    });

    swipes.push(response.text);
    swipeIndex = swipes.length - 1;

    db.prepare('UPDATE chat_messages SET content = ?, swipes = ?, swipe_index = ?, tokens_used = ?, model_used = ? WHERE id = ?')
      .run(response.text, JSON.stringify(swipes), swipeIndex, response.tokensUsed, response.modelUsed, msgId);

    const updated = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(msgId) as any;
    return res.json({
      message: { ...updated, swipes, swipe_index: swipeIndex },
      latencyMs: response.latencyMs
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Edit message
chatsRouter.put('/:id/messages/:msgId', (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId, msgId } = req.params;
  const { content } = req.body;

  if (!content) return res.status(400).json({ error: 'Content required' });

  try {
    const msg = db.prepare('SELECT * FROM chat_messages WHERE id = ? AND session_id = ?').get(msgId, sessionId) as any;
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const swipes: string[] = JSON.parse(msg.swipes || '[]');
    const swipeIdx = msg.swipe_index || 0;
    if (swipes.length > 0 && swipeIdx < swipes.length) {
      swipes[swipeIdx] = content;
    } else {
      swipes.push(content);
    }

    db.prepare('UPDATE chat_messages SET content = ?, swipes = ? WHERE id = ?').run(content, JSON.stringify(swipes), msgId);
    const updated = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(msgId) as any;
    return res.json({ message: { ...updated, swipes: JSON.parse(updated.swipes || '[]') } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// Context preview / inspector
chatsRouter.get('/:id/context-preview', (req: AuthenticatedRequest, res: Response) => {
  const { id: sessionId } = req.params;

  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId) as any;
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const char = getCharacter(session.character_id);
    if (!char) return res.status(404).json({ error: 'Character not found' });

    const rawMessages = db.prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;

    const preview = ContextManager.buildContext(
      char,
      session.user_persona_name || req.user!.username,
      rawMessages,
      session.rolling_summary || ''
    );

    return res.json({
      character: char.name,
      estimatedTokens: preview.estimatedTokens,
      systemPrompt: preview.systemPrompt,
      injectedLore: preview.injectedLore,
      summaryIncluded: preview.summaryIncluded,
      messageCount: preview.messages.length,
      messages: preview.messages
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
