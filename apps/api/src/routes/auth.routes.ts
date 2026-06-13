import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, AuthError } from '../services/auth.service';
import { authMiddleware, isAgentPayload } from '../middleware/auth.middleware';
import { loginRateLimit } from '../middleware/rateLimit.middleware';
import { logger } from '../lib/logger';

export const authRouter = Router();

// ── Validation Schemas ──
const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().min(1, 'Display name is required'),
  role: z.enum(['agent', 'admin']).default('agent'),
});

// ── POST /api/auth/login ──
authRouter.post('/login', loginRateLimit, async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await AuthService.login(body.email, body.password);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: err.errors[0]?.message || 'Validation error',
      });
      return;
    }
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
      return;
    }
    logger.error({ err }, 'Login error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── POST /api/auth/register ──
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await AuthService.register(body.email, body.password, body.displayName, body.role);

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: err.errors[0]?.message || 'Validation error',
      });
      return;
    }
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
      return;
    }
    logger.error({ err }, 'Registration error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── POST /api/auth/logout ──
authRouter.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      await AuthService.logout(token);
    }

    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    logger.error({ err }, 'Logout error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ── GET /api/auth/me ──
authRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user || !isAgentPayload(req.user)) {
      res.status(401).json({ success: false, error: 'Not authenticated as agent' });
      return;
    }

    const user = await AuthService.getMe(req.user.userId);

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
      });
      return;
    }
    logger.error({ err }, 'Get user error');
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
