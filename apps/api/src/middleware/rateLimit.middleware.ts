import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { logger } from '../lib/logger';

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix for Redis */
  keyPrefix: string;
  /** Optional: use user ID instead of IP for the rate limit key */
  useUserId?: boolean;
}

/**
 * Redis-backed sliding window rate limiter.
 * Creates a middleware that limits requests per IP (or per user).
 */
export function rateLimit(options: RateLimitOptions) {
  const { maxRequests, windowSeconds, keyPrefix, useUserId = false } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = useUserId && req.user && 'userId' in req.user
        ? req.user.userId
        : req.ip || req.socket.remoteAddress || 'unknown';

      const key = `ratelimit:${keyPrefix}:${identifier}`;

      const current = await redis.incr(key);

      // Set TTL on first request in the window
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      // Set rate limit headers
      res.set('X-RateLimit-Limit', maxRequests.toString());
      res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - current).toString());

      const ttl = await redis.ttl(key);
      res.set('X-RateLimit-Reset', ttl.toString());

      if (current > maxRequests) {
        logger.warn({ key, current, maxRequests }, 'Rate limit exceeded');
        res.status(429).json({
          success: false,
          error: 'Too many requests. Please try again later.',
        });
        return;
      }

      next();
    } catch (err) {
      // If Redis fails, allow the request (fail-open) but log the error
      logger.error({ err }, 'Rate limit check failed — allowing request');
      next();
    }
  };
}

// ── Pre-configured rate limiters ──
export const loginRateLimit = rateLimit({
  maxRequests: 5,
  windowSeconds: 60,
  keyPrefix: 'login',
});

export const fileUploadRateLimit = rateLimit({
  maxRequests: 10,
  windowSeconds: 3600,
  keyPrefix: 'file_upload',
  useUserId: true,
});
