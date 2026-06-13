import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { SessionService } from '../services/session.service';

export function registerSessionHandlers(namespace: Namespace): void {
  namespace.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected to /session namespace');

    let currentSessionId: string | null = null;
    let currentParticipantId: string | null = null;
    let currentRole: string | null = null;

    // ── Join Session State Channel ──
    socket.on('session:join', async (
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

        logger.debug({ sessionId, participantId }, 'Participant joined session state channel');
      } catch (err: any) {
        logger.error({ err }, 'Error joining session state channel');
        callback({ success: false, error: err.message || 'Authentication failed' });
      }
    });

    // ── End Session (Agent Initiated) ──
    socket.on('session:end', async (
      payload: { sessionId: string },
      callback: (res: { success: boolean; error?: string }) => void
    ) => {
      if (!currentSessionId || !currentParticipantId || !currentRole) {
        return callback({ success: false, error: 'Not joined in session' });
      }

      if (currentRole !== 'agent' && currentRole !== 'admin') {
        return callback({ success: false, error: 'Unauthorized: Only agents can end sessions' });
      }

      const sessionId = payload.sessionId || currentSessionId;

      try {
        logger.info({ sessionId, agentId: currentParticipantId }, 'Agent ending session via socket');
        
        await SessionService.endSession(sessionId, currentParticipantId, currentRole as any);

        // Notify all clients in session namespace that session is ended
        namespace.to(sessionId).emit('session:ended');

        callback({ success: true });
      } catch (err: any) {
        logger.error({ err, sessionId }, 'Error ending session via socket');
        callback({ success: false, error: err.message || 'Failed to end session' });
      }
    });

    socket.on('disconnect', () => {
      if (currentSessionId && currentParticipantId) {
        logger.debug({ socketId: socket.id, participantId: currentParticipantId }, 'Client disconnected from /session namespace');
      }
    });
  });

  logger.debug('Session socket handlers registered');
}
