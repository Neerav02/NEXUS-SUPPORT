import { Namespace, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { startRecording, stopRecording } from '../services/recording.service';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { recordingsCounter } from '../lib/metrics';

export function registerRecordingHandlers(namespace: Namespace): void {
  namespace.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, 'Client connected for recording handlers');

    const token = socket.handshake.auth?.token;
    let userId: string | null = null;
    let userRole: string | null = null;

    if (token) {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as any;
        userId = payload.userId || null;
        userRole = payload.role || null;
      } catch {
        // Invalid token - silent ignore, role will be restricted
      }
    }

    socket.on('recording:start', async (data: { sessionId: string }, callback: Function) => {
      try {
        if (userRole !== 'agent' && userRole !== 'admin') {
          return callback?.({ success: false, error: 'Only agents can start recording' });
        }

        const session = await prisma.session.findUnique({ where: { id: data.sessionId } });
        if (!session) return callback?.({ success: false, error: 'Session not found' });
        if (session.agentId !== userId) return callback?.({ success: false, error: 'Not your session' });
        if (session.status !== 'active') return callback?.({ success: false, error: 'Session not active' });
        if (session.recordingStatus === 'recording') return callback?.({ success: false, error: 'Already recording' });

        const { recordingId } = await startRecording(data.sessionId);

        // Notify ALL participants in the session room
        namespace.to(data.sessionId).emit('recording:status', {
          sessionId: data.sessionId,
          status: 'recording',
          recordingId,
        });

        // Broadcast legacy event for older client backward-compat
        namespace.to(data.sessionId).emit('recording:started');

        await prisma.sessionEvent.create({
          data: {
            sessionId: data.sessionId,
            eventType: 'recording_started',
            actorIdentity: userId!,
            actorRole: 'agent',
            metadata: { recordingId },
          },
        });

        // Increment Prometheus Counter
        recordingsCounter.inc();

        callback?.({ success: true, recordingId });
      } catch (err: any) {
        logger.error({ err }, '[recording:start] error');
        callback?.({ success: false, error: err.message || 'Failed to start recording' });
      }
    });

    socket.on('recording:stop', async (data: { sessionId: string }, callback: Function) => {
      try {
        if (userRole !== 'agent' && userRole !== 'admin') {
          return callback?.({ success: false, error: 'Only agents can stop recording' });
        }

        const session = await prisma.session.findUnique({ where: { id: data.sessionId } });
        if (!session) return callback?.({ success: false, error: 'Session not found' });
        if (session.agentId !== userId) return callback?.({ success: false, error: 'Not your session' });

        await stopRecording(data.sessionId);

        // Notify ALL participants in the session room
        namespace.to(data.sessionId).emit('recording:status', {
          sessionId: data.sessionId,
          status: 'processing',
        });

        // Broadcast legacy event for older client backward-compat
        namespace.to(data.sessionId).emit('recording:stopped');

        await prisma.sessionEvent.create({
          data: {
            sessionId: data.sessionId,
            eventType: 'recording_stopped',
            actorIdentity: userId!,
            actorRole: 'agent',
            metadata: {},
          },
        });

        // Poll DB and notify when ready
        pollRecordingReady(namespace, data.sessionId);

        callback?.({ success: true });
      } catch (err: any) {
        logger.error({ err }, '[recording:stop] error');
        callback?.({ success: false, error: err.message || 'Failed to stop recording' });
      }
    });
  });
}

async function pollRecordingReady(namespace: Namespace, sessionId: string) {
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      return;
    }

    const recording = await prisma.recording.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    if (recording?.status === 'ready') {
      clearInterval(interval);
      namespace.to(sessionId).emit('recording:ready', {
        sessionId,
        downloadUrl: `/api/sessions/${sessionId}/recording/download`,
        recordingId: recording.id,
      });
    } else if (recording?.status === 'failed') {
      clearInterval(interval);
      namespace.to(sessionId).emit('recording:status', {
        sessionId,
        status: 'failed',
      });
    }
  }, 5000); // Check every 5 seconds
}