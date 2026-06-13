import { redis } from '../config/redis';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export class ReconnectService {
  private static timeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Register a participant's disconnect and start a grace timer.
   */
  static registerDisconnect(
    sessionId: string,
    participantId: string,
    role: 'agent' | 'admin' | 'customer',
    onExpired: () => Promise<void>
  ): void {
    const key = `${sessionId}:${participantId}`;

    // Clear any existing timeout for safety
    this.clearDisconnect(sessionId, participantId);

    const graceSeconds =
      role === 'customer'
        ? env.CUSTOMER_RECONNECT_TIMEOUT_SECONDS
        : env.AGENT_RECONNECT_TIMEOUT_SECONDS;

    logger.debug(
      { sessionId, participantId, role, graceSeconds },
      'Participant disconnected; starting reconnect grace window'
    );

    // Track status in Redis
    const redisKey = `session:${sessionId}:${participantId}:grace`;
    redis.set(redisKey, 'disconnected', 'EX', graceSeconds).catch((err) => {
      logger.error({ err, redisKey }, 'Failed to set redis reconnect grace flag');
    });

    const timeout = setTimeout(async () => {
      logger.info(
        { sessionId, participantId, role },
        'Reconnect grace window expired for participant'
      );
      this.timeouts.delete(key);
      await redis.del(redisKey).catch(() => {});

      try {
        await onExpired();
      } catch (err) {
        logger.error({ err, sessionId, participantId }, 'Error running grace expired handler');
      }
    }, graceSeconds * 1000);

    this.timeouts.set(key, timeout);
  }

  /**
   * Clear a participant's disconnect timer if they reconnect in time.
   * Returns true if cleared, false if there was no active timer.
   */
  static clearDisconnect(sessionId: string, participantId: string): boolean {
    const key = `${sessionId}:${participantId}`;
    const timeout = this.timeouts.get(key);

    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(key);

      const redisKey = `session:${sessionId}:${participantId}:grace`;
      redis.del(redisKey).catch(() => {});

      logger.debug({ sessionId, participantId }, 'Participant reconnected; cleared grace timer');
      return true;
    }

    return false;
  }

  /**
   * Check if a participant is currently in a disconnect grace window.
   */
  static async isInGraceWindow(sessionId: string, participantId: string): Promise<boolean> {
    const redisKey = `session:${sessionId}:${participantId}:grace`;
    const val = await redis.get(redisKey);
    return val === 'disconnected';
  }
}
