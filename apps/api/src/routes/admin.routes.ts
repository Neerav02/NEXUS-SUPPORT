import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, isAgentPayload } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/roles.middleware';
import { activeSessionsGauge } from '../lib/metrics';
import { logger } from '../lib/logger';

export const adminRouter = Router();

// All admin routes require authentication + admin role
adminRouter.use(authMiddleware);
adminRouter.use(requireRole('admin'));

// ── GET /api/admin/sessions/live — Active sessions with participant details ──
adminRouter.get('/sessions/live', async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { status: 'active' },
      include: {
        agent: {
          select: { id: true, displayName: true, email: true },
        },
        participants: {
          select: {
            identity: true,
            role: true,
            joinedAt: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    res.json({ success: true, data: sessions });
  } catch (err) {
    logger.error({ err }, 'Admin: get live sessions error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── DELETE /api/admin/sessions/:id — Force-end any session ──
adminRouter.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const now = new Date();
    const session = await prisma.session.update({
      where: { id },
      data: { status: 'ended', endedAt: now },
    });

    // Update active participants
    await prisma.sessionParticipant.updateMany({
      where: { sessionId: id, leftAt: null },
      data: { leftAt: now },
    });

    // Log event
    if (req.user && isAgentPayload(req.user)) {
      await prisma.sessionEvent.create({
        data: {
          sessionId: id,
          eventType: 'ended',
          actorIdentity: req.user.userId,
          actorRole: 'agent',
          metadata: { forcedByAdmin: true },
        },
      });
    }

    activeSessionsGauge.dec();

    res.json({ success: true, data: session });
  } catch (err) {
    logger.error({ err }, 'Admin: force-end session error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/admin/metrics/summary — Aggregated stats ──
adminRouter.get('/metrics/summary', async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeSessions, sessionsToday, totalMinutesToday, avgDuration] = await Promise.all([
      // Currently active sessions
      prisma.session.count({ where: { status: 'active' } }),

      // Total sessions today
      prisma.session.count({
        where: { createdAt: { gte: todayStart } },
      }),

      // Total minutes today (from ended sessions)
      prisma.sessionParticipant.aggregate({
        _sum: { totalDurationSeconds: true },
        where: {
          session: {
            endedAt: { gte: todayStart },
          },
        },
      }),

      // Average call duration (last 7 days)
      prisma.sessionParticipant.aggregate({
        _avg: { totalDurationSeconds: true },
        where: {
          role: 'agent',
          totalDurationSeconds: { not: null },
          session: {
            endedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        activeSessions,
        sessionsToday,
        totalMinutesToday: Math.round(
          (totalMinutesToday._sum.totalDurationSeconds || 0) / 60
        ),
        avgDurationSeconds: Math.round(avgDuration._avg.totalDurationSeconds || 0),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Admin: metrics summary error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/admin/events/recent — Recent session events (activity feed) ──
adminRouter.get('/events/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const events = await prisma.sessionEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: {
        session: {
          select: { id: true, title: true },
        },
      },
    });

    res.json({ success: true, data: events });
  } catch (err) {
    logger.error({ err }, 'Admin: recent events error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/admin/sessions/all — All sessions with summary (paginated) ──
adminRouter.get('/sessions/all', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        include: {
          agent: { select: { id: true, displayName: true, email: true } },
          participants: {
            select: { identity: true, role: true, joinedAt: true, leftAt: true, totalDurationSeconds: true },
          },
          _count: { select: { messages: true, events: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.session.count(),
    ]);

    res.json({
      success: true,
      data: sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'Admin: all sessions error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
