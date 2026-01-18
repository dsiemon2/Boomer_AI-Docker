// Boomer AI Authentication Middleware
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'boomer-ai-secret-change-in-production';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

/**
 * Middleware to require authentication
 * Redirects to login if not authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      // Check if API request
      if (req.headers['accept']?.includes('application/json') || req.path.startsWith('/api/')) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      // Redirect to login
      res.redirect('/auth/login');
      return;
    }

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.clearCookie('token');
      if (req.headers['accept']?.includes('application/json') || req.path.startsWith('/api/')) {
        res.status(401).json({ success: false, error: 'Invalid session' });
        return;
      }
      res.redirect('/auth/login');
      return;
    }

    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (error) {
    res.clearCookie('token');
    if (req.headers['accept']?.includes('application/json') || req.path.startsWith('/api/')) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }
    res.redirect('/auth/login');
  }
}

/**
 * Middleware to optionally load user if authenticated
 * Does not require authentication, just loads user if token exists
 */
export async function loadUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, name: true, isActive: true },
      });

      if (user && user.isActive) {
        req.user = { id: user.id, email: user.email, name: user.name };
      }
    }
  } catch {
    // Token invalid, just continue without user
  }

  next();
}

/**
 * Get user ID from request, or return demo user ID for unauthenticated
 */
export function getUserId(req: Request): string {
  return req.user?.id || 'demo-user';
}

/**
 * Get user name from request
 */
export function getUserName(req: Request): string {
  return req.user?.name || 'Friend';
}
