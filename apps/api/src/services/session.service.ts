import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../config/redis';
import { logger } from '../lib/logger';
import { activeSessionsGauge } from '../lib/metrics';
import type { SessionStatus } from '../types';

export class SessionService {
  /**
   * Create a new support session for an agent.
   */
  static async create(agentId: string, title: string) {
    const inviteToken = SessionService.generateInviteToken();

    const session = await prisma.session.create({
      data: {
        title,
        agentId,
        inviteToken,
        status: 'waiting',
      },
      include: {
        agent: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
    });

    // Log session creation event
    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: 'created',
        actorIdentity: agentId,
        actorRole: 'agent',
        metadata: { title },
      },
    });

    // Initialize Redis session state
    await redis.hset(`session:${session.id}:state`, {
      status: 'waiting',
      agentId,
      createdAt: new Date().toISOString(),
    });

    logger.info({ sessionId: session.id, agentId, inviteToken }, 'Session created');

    return {
      ...session,
      inviteUrl: `/join/${inviteToken}`,
    };
  }

  /**
   * List sessions for an agent with optional status filter.
   */
  static async listForAgent(
    agentId: string,
    options: { status?: SessionStatus; page?: number; limit?: number } = {}
  ) {
    const { status, page = 1, limit = 20 } = options;

    const where: any = { agentId };
    if (status) where.status = status;

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          participants: {
            select: {
              identity: true,
              role: true,
              joinedAt: true,
              leftAt: true,
              totalDurationSeconds: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.session.count({ where }),
    ]);

    return {
      sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single session by ID with full details.
   */
  static async getById(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        agent: {
          select: { id: true, displayName: true, email: true },
        },
        participants: true,
        _count: {
          select: { messages: true, events: true },
        },
        recording: true,
      },
    });

    if (!session) {
      throw new SessionError('Session not found', 404);
    }

    return session;
  }

  /**
   * Join a session via invite token — for customers.
   */
  static async joinByToken(inviteToken: string) {
    const session = await prisma.session.findUnique({
      where: { inviteToken },
      include: {
        agent: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (!session) {
      throw new SessionError('Invalid invite token — session not found', 404);
    }

    if (session.status === 'ended') {
      throw new SessionError('This session has already ended', 410);
    }

    return session;
  }

  /**
   * End a session — update status, compute durations.
   */
  static async endSession(sessionId: string, actorIdentity: string, actorRole: 'agent' | 'customer') {
    const now = new Date();

    // Update session
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        endedAt: now,
      },
    });

    // Update all participants who haven't left yet
    const activeParticipants = await prisma.sessionParticipant.findMany({
      where: { sessionId, leftAt: null },
    });

    for (const participant of activeParticipants) {
      const duration = Math.floor((now.getTime() - participant.joinedAt.getTime()) / 1000);
      await prisma.sessionParticipant.update({
        where: { id: participant.id },
        data: {
          leftAt: now,
          totalDurationSeconds: duration,
        },
      });
    }

    // Log ended event
    await prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: 'ended',
        actorIdentity,
        actorRole,
        metadata: { endedAt: now.toISOString() },
      },
    });

    // Clear Redis session state
    await redis.del(`session:${sessionId}:state`);
    await redis.del(`session:${sessionId}:agent:grace`);
    await redis.del(`session:${sessionId}:customer:grace`);

    activeSessionsGauge.dec();

    logger.info({ sessionId }, 'Session ended');

    return session;
  }

  /**
   * Get session event history (audit log).
   */
  static async getHistory(sessionId: string) {
    return prisma.sessionEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  /**
   * Get all chat messages for a session.
   */
  static async getChatMessages(sessionId: string) {
    return prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Generate a random 12-character alphanumeric invite token.
   */
  private static generateInviteToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const bytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      token += chars[bytes[i] % chars.length];
    }
    return token;
  }
}

export class SessionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'SessionError';
    this.statusCode = statusCode;
  }
}
