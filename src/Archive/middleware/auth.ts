import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { AuthenticatedRequest, JwtPayload, SuperAdminJwtPayload } from '../types/index.js';

/**
 * Middleware to authenticate regular users (Company Admin or Manager)
 */
export function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (!token) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;

    if (!payload.userId || !payload.companyId) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }

    req.user = payload;
    req.companyId = payload.companyId;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

/**
 * Middleware to authenticate super admin
 */
export function authenticateSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Check for token in query param (legacy support) or header
    const queryToken = req.query.token as string;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : queryToken || req.cookies?.superAdminToken;

    // Simple token auth for super admin (legacy)
    if (token === config.superAdminToken) {
      req.superAdmin = {
        superAdminId: 'system',
        email: 'system@admin',
        role: 'SUPER_ADMIN',
      };
      next();
      return;
    }

    // JWT auth for super admin
    if (token) {
      const payload = jwt.verify(token, config.jwtSecret) as SuperAdminJwtPayload;

      if (payload.role !== 'SUPER_ADMIN') {
        res.status(403).json({ success: false, error: 'Super admin access required' });
        return;
      }

      req.superAdmin = payload;
      next();
      return;
    }

    res.status(401).json({ success: false, error: 'Super admin authentication required' });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid super admin token' });
  }
}

/**
 * Middleware to authenticate either user or super admin
 */
export function authenticateAny(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Try super admin first
  const queryToken = req.query.token as string;
  if (queryToken === config.superAdminToken) {
    req.superAdmin = {
      superAdminId: 'system',
      email: 'system@admin',
      role: 'SUPER_ADMIN',
    };
    next();
    return;
  }

  // Try regular user auth
  authenticateUser(req, res, next);
}

/**
 * Generate JWT token for user
 */
export function generateUserToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);
}

/**
 * Generate JWT token for super admin
 */
export function generateSuperAdminToken(payload: SuperAdminJwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as string,
  } as jwt.SignOptions);
}
