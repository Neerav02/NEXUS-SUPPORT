import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logger } from '../lib/logger';
import { supabase, hasSupabase } from '../lib/supabase';
import type { AgentJwtPayload, CustomerJwtPayload } from '../types';

export class AuthService {
  /**
   * Register a new agent — signs up in Supabase (if configured) and stores locally.
   */
  static async register(email: string, password: string, displayName: string, role: 'agent' | 'admin' = 'agent') {
    // Check if user already exists locally
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AuthError('Email already registered', 400);
    }

    let userId: string;
    const passwordHash = await bcrypt.hash(password, 12);

    if (hasSupabase) {
      logger.info({ email }, 'Registering user in Supabase');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            displayName,
            role,
          },
        },
      });

      if (error) {
        logger.error({ err: error }, 'Supabase registration failed');
        throw new AuthError(error.message, 400);
      }

      if (!data.user?.id) {
        throw new AuthError('Failed to retrieve user ID from Supabase', 400);
      }

      userId = data.user.id;
    } else {
      // Offline fallback: generate a standard UUID
      const { v4: uuidv4 } = require('uuid');
      userId = uuidv4();
      logger.warn({ email }, 'Supabase not configured. Registered user locally with offline UUID');
    }

    // Insert user record in local Prisma database
    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash,
        displayName,
        role,
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'User successfully registered in local DB');
    return user;
  }

  /**
   * Agent login — validate email + password (against Supabase, falling back to local DB), return JWT + user data.
   */
  static async login(email: string, password: string) {
    let userRecord: any = null;

    if (hasSupabase) {
      logger.info({ email }, 'Logging in user via Supabase');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.warn({ email, err: error.message }, 'Supabase auth failed. Checking local DB fallback.');
        // Fall back to local password verification in case this is a pre-seeded account not in Supabase yet
        userRecord = await this.localLoginFallback(email, password);
      } else {
        const supabaseUser = data.user;
        if (supabaseUser) {
          // Retrieve or upsert local database user record
          userRecord = await prisma.user.findUnique({ where: { id: supabaseUser.id } });
          if (!userRecord) {
            logger.info({ email, userId: supabaseUser.id }, 'Supabase user not found locally. Recreating local DB record.');
            const passwordHash = await bcrypt.hash(password, 12);
            userRecord = await prisma.user.create({
              data: {
                id: supabaseUser.id,
                email: supabaseUser.email!,
                passwordHash,
                displayName: supabaseUser.user_metadata?.displayName || 'Support Agent',
                role: (supabaseUser.user_metadata?.role || 'agent') as any,
              },
            });
          }
        }
      }
    } else {
      userRecord = await this.localLoginFallback(email, password);
    }

    if (!userRecord) {
      throw new AuthError('Invalid email or password', 401);
    }

    const payload: AgentJwtPayload = {
      userId: userRecord.id,
      role: userRecord.role as 'agent' | 'admin',
      displayName: userRecord.displayName,
    };

    const token = jwt.sign(payload as any, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    logger.info({ userId: userRecord.id, email: userRecord.email }, 'Agent logged in');

    return {
      token,
      user: {
        userId: userRecord.id,
        email: userRecord.email,
        role: userRecord.role,
        displayName: userRecord.displayName,
        avatarUrl: userRecord.avatarUrl,
      },
    };
  }

  /**
   * Internal helper for offline/fallback local login validation.
   */
  private static async localLoginFallback(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return null;

    return user;
  }

  /**
   * Logout — blacklist the JWT in Redis until its expiry time.
   */
  static async logout(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as { exp?: number };
      if (decoded?.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`jwt:blacklist:${token}`, '1', 'EX', ttl);
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to blacklist token on logout');
    }
  }

  /**
   * Get current user info from JWT payload.
   */
  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AuthError('User not found', 404);
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  /**
   * Generate a short-lived JWT for a customer joining a session.
   */
  static generateCustomerToken(sessionId: string, identity: string): string {
    const payload: CustomerJwtPayload = {
      sessionId,
      identity,
      role: 'customer',
    };

    return jwt.sign(payload as any, env.JWT_SECRET, {
      expiresIn: env.CUSTOMER_JWT_EXPIRES_IN as any,
    });
  }

  /**
   * Hash a password (for registration / seed).
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}

/**
 * Custom Auth Error with HTTP status code.
 */
export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
