import * as mediasoup from 'mediasoup';
import { Worker, Router, Producer, RtpCodecCapability } from 'mediasoup/node/lib/types';
import { env } from './env';
import { logger } from '../lib/logger';

// ── mediasoup Configuration Options ──
export const mediasoupConfig = {
  worker: {
    logLevel: 'warn' as const,
    logTags: [
      'info',
      'ice',
      'dtls',
      'rtp',
      'srtp',
      'rtcp',
    ] as any[],
    rtcMinPort: env.MEDIASOUP_MIN_PORT,
    rtcMaxPort: env.MEDIASOUP_MAX_PORT,
  },

  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        parameters: {
          'profile-id': 2,
          'x-google-start-bitrate': 1000,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/h264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
          'x-google-start-bitrate': 1000,
        },
      },
    ] as RtpCodecCapability[],
  },

  webRtcTransport: {
    listenIps: [
      {
        ip: env.MEDIASOUP_LISTEN_IP,
        announcedIp: env.MEDIASOUP_ANNOUNCED_IP || undefined,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  },
};

// ── Workers Store ──
const workers: Worker[] = [];
let nextWorkerIndex = 0;

// ── Router Registry (sessionId → Router) ──
const routerMap = new Map<string, Router>();

// ── Producer Registry (sessionId → Producer[]) ──
const producerMap = new Map<string, Producer[]>();

// ─────────────────────────────────────────────
// Worker Management
// ─────────────────────────────────────────────

export async function initializeMediasoup(): Promise<void> {
  const numWorkers = env.MEDIASOUP_WORKERS || 2;
  logger.info({ count: numWorkers }, 'Initializing mediasoup workers...');

  for (let i = 0; i < numWorkers; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: mediasoupConfig.worker.logLevel,
      logTags: mediasoupConfig.worker.logTags,
      rtcMinPort: mediasoupConfig.worker.rtcMinPort,
      rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
    });

    worker.on('died', (error) => {
      logger.error({ error }, 'mediasoup Worker died, exiting process...');
      setTimeout(() => process.exit(1), 2000);
    });

    workers.push(worker);
    logger.debug({ pid: worker.pid }, `mediasoup Worker ${i + 1} started`);
  }
}

export function getNextWorker(): Worker {
  if (workers.length === 0) {
    throw new Error('mediasoup workers not initialized');
  }
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
  return worker;
}

// ─────────────────────────────────────────────
// Router Management
// ─────────────────────────────────────────────

export async function createSessionRouter(): Promise<Router> {
  const worker = getNextWorker();
  const router = await worker.createRouter({
    mediaCodecs: mediasoupConfig.router.mediaCodecs,
  });
  logger.debug({ routerId: router.id, workerPid: worker.pid }, 'mediasoup Router created');
  return router;
}

/**
 * Store a router against a sessionId.
 * Call this immediately after createSessionRouter() in your session creation flow.
 */
export function setRouter(sessionId: string, router: Router): void {
  routerMap.set(sessionId, router);
  producerMap.set(sessionId, []);
  logger.debug({ sessionId, routerId: router.id }, 'Router registered for session');
}

/**
 * Retrieve the router for a session.
 * Returns undefined if session has no router (not started or already cleaned up).
 */
export function getRouter(sessionId: string): Router | undefined {
  return routerMap.get(sessionId);
}

/**
 * Remove the router for a session and close it.
 * Call this when a session ends.
 */
export function closeSessionRouter(sessionId: string): void {
  const router = routerMap.get(sessionId);
  if (router) {
    try {
      router.close();
    } catch (err) {
      logger.warn({ sessionId, err }, 'Error closing router — may already be closed');
    }
    routerMap.delete(sessionId);
    logger.debug({ sessionId }, 'Router closed and removed');
  }

  // Also clean up producer registry for this session
  producerMap.delete(sessionId);
}

// ─────────────────────────────────────────────
// Producer Registry
// Used by the recording service to find active
// producers to consume for FFmpeg RTP capture.
// ─────────────────────────────────────────────

/**
 * Register a producer for a session.
 * Call this in mediasoup.socket.ts after transport.produce() succeeds.
 */
export function registerProducer(sessionId: string, producer: Producer): void {
  if (!producerMap.has(sessionId)) {
    producerMap.set(sessionId, []);
  }

  const producers = producerMap.get(sessionId)!;
  producers.push(producer);

  // Auto-remove from registry when the producer closes
  producer.on('@close', () => {
    const list = producerMap.get(sessionId);
    if (list) {
      const index = list.findIndex((p) => p.id === producer.id);
      if (index !== -1) {
        list.splice(index, 1);
        logger.debug({ sessionId, producerId: producer.id }, 'Producer removed from registry on close');
      }
    }
  });

  logger.debug(
    { sessionId, producerId: producer.id, kind: producer.kind },
    'Producer registered for session'
  );
}

/**
 * Get all active producers for a session.
 * Returns empty array if session has no producers or does not exist.
 */
export function getProducers(sessionId: string): Producer[] {
  return producerMap.get(sessionId) ?? [];
}

/**
 * Get only audio producers for a session.
 */
export function getAudioProducers(sessionId: string): Producer[] {
  return getProducers(sessionId).filter((p) => p.kind === 'audio');
}

/**
 * Get only video producers for a session.
 */
export function getVideoProducers(sessionId: string): Producer[] {
  return getProducers(sessionId).filter((p) => p.kind === 'video');
}

// ─────────────────────────────────────────────
// Debug / Diagnostics
// ─────────────────────────────────────────────

/**
 * Returns a snapshot of all active sessions with their router and producer counts.
 * Used by the admin dashboard and Prometheus metrics.
 */
export function getMediasoupStats(): {
  workerCount: number;
  activeSessions: number;
  totalProducers: number;
  sessions: Array<{ sessionId: string; routerId: string; producerCount: number }>;
} {
  const sessions = Array.from(routerMap.entries()).map(([sessionId, router]) => ({
    sessionId,
    routerId: router.id,
    producerCount: producerMap.get(sessionId)?.length ?? 0,
  }));

  return {
    workerCount: workers.length,
    activeSessions: routerMap.size,
    totalProducers: sessions.reduce((sum, s) => sum + s.producerCount, 0),
    sessions,
  };
}