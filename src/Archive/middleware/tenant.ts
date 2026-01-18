import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';

/**
 * Middleware to ensure tenant isolation
 * Injects companyId into the request for use in services
 */
export function tenantIsolation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // Super admins can access any company via query param
  if (req.superAdmin) {
    const companyId = req.query.companyId as string;
    if (companyId) {
      req.companyId = companyId;
    }
    next();
    return;
  }

  // Regular users must have a companyId from their JWT
  if (!req.user?.companyId) {
    res.status(403).json({
      success: false,
      error: 'Company context required'
    });
    return;
  }

  req.companyId = req.user.companyId;
  next();
}

/**
 * Helper to get companyId from request
 * Throws if not available
 */
export function getCompanyId(req: AuthenticatedRequest): string {
  const companyId = req.companyId || req.user?.companyId;
  if (!companyId) {
    throw new Error('Company context not available');
  }
  return companyId;
}

/**
 * Helper to check if request has super admin access
 */
export function isSuperAdmin(req: AuthenticatedRequest): boolean {
  return !!req.superAdmin;
}

/**
 * Helper to check if user can access a specific company
 */
export function canAccessCompany(req: AuthenticatedRequest, companyId: string): boolean {
  // Super admin can access any company
  if (req.superAdmin) return true;

  // Regular users can only access their own company
  return req.user?.companyId === companyId;
}
