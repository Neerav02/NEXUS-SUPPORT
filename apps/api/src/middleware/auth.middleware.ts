import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { redis } from '../config/redis';
import type { AgentJwtPayload, CustomerJwtPayload, JwtPayload } from '../types';

// Extend Express Request type to include user payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware: Verify JWT from Authorization header.
 * Attaches decoded payload to req.user.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Check if token is blacklisted (from logout)
    const isBlacklisted = await redis.get(`jwt:blacklist:${token}`);
    if (isBlacklisted) {
      res.status(401).json({ success: false, error: 'Token has been revoked' });
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token has expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

/**
 * Type guard: Check if the JWT payload belongs to an agent/admin
 */
export function isAgentPayload(payload: JwtPayload): payload is AgentJwtPayload {
  return 'userId' in payload && (payload.role === 'agent' || payload.role === 'admin');
}

/**
 * Type guard: Check if the JWT payload belongs to a customer
 */
export function isCustomerPayload(payload: JwtPayload): payload is CustomerJwtPayload {
  return 'sessionId' in payload && payload.role === 'customer';
}
