import { Router, Response } from 'express';
import { z } from 'zod';
import * as companyService from '../services/companyService.js';
import { authenticateSuperAdmin } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Apply super admin auth to all routes
router.use(authenticateSuperAdmin);

// Validation schemas
const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().min(1).max(255),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminName: z.string().min(1).max(255),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  domain: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/super-admin/companies
 * List all companies
 */
router.get('/companies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;

    const result = await companyService.listCompanies({ page, pageSize });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List companies error:', error);
    res.status(500).json({ success: false, error: 'Failed to list companies' });
  }
});

/**
 * POST /api/super-admin/companies
 * Create a new company
 */
router.post('/companies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = createCompanySchema.parse(req.body);

    // Check if domain already exists
    const existing = await companyService.getCompanyByDomain(input.domain);
    if (existing) {
      res.status(400).json({ success: false, error: 'Domain already registered' });
      return;
    }

    const company = await companyService.createCompany(input);

    res.status(201).json({ success: true, data: company });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create company error:', error);
    res.status(500).json({ success: false, error: 'Failed to create company' });
  }
});

/**
 * GET /api/super-admin/companies/:id
 * Get company details
 */
router.get('/companies/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const company = await companyService.getCompanyById(id);

    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found' });
      return;
    }

    const stats = await companyService.getCompanyStats(id);

    res.json({ success: true, data: { ...company, stats } });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ success: false, error: 'Failed to get company' });
  }
});

/**
 * PUT /api/super-admin/companies/:id
 * Update company
 */
router.put('/companies/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = updateCompanySchema.parse(req.body);

    // Check domain uniqueness if changing
    if (input.domain) {
      const existing = await companyService.getCompanyByDomain(input.domain);
      if (existing && existing.id !== id) {
        res.status(400).json({ success: false, error: 'Domain already in use' });
        return;
      }
    }

    const company = await companyService.updateCompany(id, input);

    res.json({ success: true, data: company });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update company error:', error);
    res.status(500).json({ success: false, error: 'Failed to update company' });
  }
});

/**
 * DELETE /api/super-admin/companies/:id
 * Delete company
 */
router.delete('/companies/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await companyService.deleteCompany(id);

    res.json({ success: true, message: 'Company deleted' });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete company' });
  }
});

export default router;
