import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { logger } from './lib/logger';
import { connectDatabase } from './lib/prisma';
import { connectRedis } from './config/redis';

import { initializeMediasoup } from './config/mediasoup';

// ── Route Imports ──
import { authRouter } from './routes/auth.routes';
import { sessionsRouter } from './routes/sessions.routes';
import { filesRouter } from './routes/files.routes';
import { adminRouter } from './routes/admin.routes';

// ── Middleware Imports ──
import { metricsMiddleware } from './middleware/metrics.middleware';

// ── Socket Handler Imports ──
import { registerSessionHandlers } from './socket/session.socket';
import { registerChatHandlers } from './socket/chat.socket';
import { registerMediasoupHandlers } from './socket/mediasoup.socket';
import { registerRecordingHandlers } from './socket/recording.socket';

// ── Metrics ──
import { metricsRegistry } from './lib/metrics';

async function bootstrap() {
  // ── Initialize Express ──
  const app = express();
  const httpServer = createServer(app);

  // ── CORS Configuration ──
  const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    })
  );

  // ── Security Headers ──
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  }));

  // ── Body Parsing ──
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Serve uploads statically ──
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  // ── Metrics Middleware ──
  app.use(metricsMiddleware);

  // ── Health Check ──
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── API Routes ──
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/admin', adminRouter);

  // ── Prometheus Metrics Endpoint ──
  app.get('/metrics', async (req, res) => {
    const secret = env.METRICS_SECRET;
    if (secret) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  // ── Socket.io Server ──
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Attach io server to express application
  app.set('io', io);

  // ── Socket.io Namespaces ──
  const sessionNamespace = io.of('/session');
  const mediasoupNamespace = io.of('/mediasoup');
  const chatNamespace = io.of('/chat');

  // ── Register Socket Handlers ──
  registerSessionHandlers(sessionNamespace);
  registerChatHandlers(chatNamespace);
  registerMediasoupHandlers(mediasoupNamespace);
  registerRecordingHandlers(sessionNamespace);

  // ── Connect to Services ──
  await connectDatabase();
  await connectRedis();
  await initializeMediasoup();

  // ── Start Server ──
  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 NEXUS SUPPORT API running on port ${env.PORT}`);
    logger.info(`📊 Environment: ${env.NODE_ENV}`);
    logger.info(`🌐 CORS Origins: ${corsOrigins.join(', ')}`);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, '💥 Failed to start server');
  process.exit(1);
});
