import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types';
import { isAgentPayload } from './auth.middleware';

/**
 * Middleware factory: Restrict route access to specific roles.
 * Must be used AFTER authMiddleware.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    if (!isAgentPayload(req.user)) {
      res.status(403).json({ success: false, error: 'Access denied — agent role required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: `Access denied — requires role: ${roles.join(' or ')}` });
      return;
    }

    next();
  };
}
