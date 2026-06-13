import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { redis } from '../config/redis';

export function registerChatHandlers(namespace: Namespace): void {
  namespace.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected to /chat namespace');

    let currentSessionId: string | null = null;
    let currentParticipantId: string | null = null;
    let currentRole: string | null = null;

    // ── Join Chat ──
    socket.on('chat:join', async (
      payload: { sessionId: string; token: string },
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      const { sessionId, token } = payload;

      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as any;
        const isAgent = decoded.role === 'agent' || decoded.role === 'admin';
        const participantId = isAgent ? decoded.userId : decoded.identity;
        const role = (decoded.role === 'admin' || decoded.role === 'agent') ? 'agent' : 'customer';

        currentSessionId = sessionId;
        currentParticipantId = participantId;
        currentRole = role;

        socket.join(sessionId);
        callback({ success: true });

        logger.debug({ sessionId, participantId }, 'Participant joined chat channel');
      } catch (err: any) {
        logger.error({ err }, 'Error joining chat channel');
        callback({ success: false, error: err.message || 'Authentication failed' });
      }
    });

    // ── Send Message ──
    socket.on('chat:send', async (
      payload: {
        content: string;
        messageType: 'text' | 'file';
        fileUrl?: string;
        fileName?: string;
        fileSize?: number;
      },
      callback: (res: { success: boolean; message?: any; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId || !currentRole) {
        return callback({ success: false, error: 'Not joined in chat' });
      }

      const sessionId = currentSessionId;
      const participantId = currentParticipantId;
      const role = currentRole;

      try {
        // Chat rate limiter using Redis
        const rateLimitKey = `chat:ratelimit:${sessionId}:${participantId}`;
        const currentMessages = await redis.incr(rateLimitKey);
        
        if (currentMessages === 1) {
          // Set expiry of 60 seconds
          await redis.expire(rateLimitKey, 60);
        }

        if (currentMessages > 60) {
          return callback({ success: false, error: 'Rate limit exceeded (60 messages per minute)' });
        }

        // Save message to Database
        const message = await prisma.chatMessage.create({
          data: {
            sessionId,
            senderIdentity: participantId,
            senderRole: role as any,
            content: payload.content,
            messageType: payload.messageType,
            fileUrl: payload.fileUrl || null,
            fileName: payload.fileName || null,
            fileSize: payload.fileSize || null,
          },
        });

        // Broadcast to everyone in room (including sender)
        namespace.to(sessionId).emit('chat:message', message);

        callback({ success: true, message });
        logger.debug({ sessionId, messageId: message.id }, 'Chat message sent and broadcasted');
      } catch (err: any) {
        logger.error({ err }, 'Error sending chat message');
        callback({ success: false, error: err.message || 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      if (currentSessionId && currentParticipantId) {
        logger.debug({ socketId: socket.id, participantId: currentParticipantId }, 'Client disconnected from /chat namespace');
      }
    });
  });

  logger.debug('Chat socket handlers registered');
}
