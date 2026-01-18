import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, Role } from '../types/index.js';

/**
 * Permission definitions
 */
const permissions: Record<string, Role[]> = {
  // Company management (super admin only)
  'company:create': ['SUPER_ADMIN'],
  'company:read_all': ['SUPER_ADMIN'],
  'company:update': ['SUPER_ADMIN'],
  'company:delete': ['SUPER_ADMIN'],

  // User management (company admin)
  'user:create': ['COMPANY_ADMIN'],
  'user:read': ['COMPANY_ADMIN', 'MANAGER'],
  'user:update': ['COMPANY_ADMIN'],
  'user:delete': ['COMPANY_ADMIN'],

  // Job role management (company admin)
  'job_role:create': ['COMPANY_ADMIN'],
  'job_role:read': ['COMPANY_ADMIN', 'MANAGER'],
  'job_role:update': ['COMPANY_ADMIN'],
  'job_role:delete': ['COMPANY_ADMIN'],

  // Question management (company admin)
  'question:create': ['COMPANY_ADMIN'],
  'question:read': ['COMPANY_ADMIN', 'MANAGER'],
  'question:update': ['COMPANY_ADMIN'],
  'question:delete': ['COMPANY_ADMIN'],
  'question:import': ['COMPANY_ADMIN'],

  // Interview management
  'interview:create': ['COMPANY_ADMIN', 'MANAGER'],
  'interview:read': ['COMPANY_ADMIN', 'MANAGER'],
  'interview:read_all': ['COMPANY_ADMIN'],
  'interview:update': ['COMPANY_ADMIN', 'MANAGER'],
  'interview:delete': ['COMPANY_ADMIN'],
  'interview:conduct': ['COMPANY_ADMIN', 'MANAGER'],

  // Results
  'result:read': ['COMPANY_ADMIN', 'MANAGER'],
  'result:update': ['COMPANY_ADMIN', 'MANAGER'],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: string): boolean {
  const allowedRoles = permissions[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(role);
}

/**
 * Middleware factory to require specific permission
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Super admin always has access
    if (req.superAdmin) {
      next();
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!hasPermission(user.role, permission)) {
      res.status(403).json({
        success: false,
        error: `Permission denied: ${permission} requires one of: ${permissions[permission]?.join(', ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory to require one of multiple roles
 */
export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Super admin always has access
    if (req.superAdmin) {
      next();
      return;
    }

    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied: requires one of: ${roles.join(', ')}`
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to require company admin role
 */
export const requireCompanyAdmin = requireRole('COMPANY_ADMIN');

/**
 * Middleware to require manager or above
 */
export const requireManager = requireRole('COMPANY_ADMIN', 'MANAGER');
