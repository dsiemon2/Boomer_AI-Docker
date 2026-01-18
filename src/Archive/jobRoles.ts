import { Router, Response } from 'express';
import { z } from 'zod';
import * as jobRoleService from '../services/jobRoleService.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireCompanyAdmin, requireManager } from '../middleware/rbac.js';
import { tenantIsolation, getCompanyId } from '../middleware/tenant.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Apply auth and tenant isolation to all routes
router.use(authenticateUser);
router.use(tenantIsolation);

// Validation schemas
const createJobRoleSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const updateJobRoleSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  order: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  order: z.number().int().min(0).optional(),
});

const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string()),
});

/**
 * GET /api/job-roles
 * List job roles
 */
router.get('/', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const activeOnly = req.query.activeOnly === 'true';

    const result = await jobRoleService.listJobRoles(companyId, { page, pageSize }, activeOnly);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List job roles error:', error);
    res.status(500).json({ success: false, error: 'Failed to list job roles' });
  }
});

/**
 * POST /api/job-roles
 * Create a new job role
 */
router.post('/', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const input = createJobRoleSchema.parse(req.body);

    const jobRole = await jobRoleService.createJobRole({
      ...input,
      companyId,
    });

    res.status(201).json({ success: true, data: jobRole });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create job role error:', error);
    res.status(500).json({ success: false, error: 'Failed to create job role' });
  }
});

/**
 * GET /api/job-roles/:id
 * Get job role details with categories and questions
 */
router.get('/:id', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const jobRole = await jobRoleService.getJobRoleById(id, companyId);

    if (!jobRole) {
      res.status(404).json({ success: false, error: 'Job role not found' });
      return;
    }

    // Parse follow-ups JSON for each question
    const jobRoleWithParsedQuestions = {
      ...jobRole,
      categories: jobRole.categories.map(cat => ({
        ...cat,
        questions: cat.questions.map(q => ({
          ...q,
          followUps: JSON.parse(q.followUps) as string[],
        })),
      })),
    };

    res.json({ success: true, data: jobRoleWithParsedQuestions });
  } catch (error) {
    console.error('Get job role error:', error);
    res.status(500).json({ success: false, error: 'Failed to get job role' });
  }
});

/**
 * PUT /api/job-roles/:id
 * Update job role
 */
router.put('/:id', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const input = updateJobRoleSchema.parse(req.body);

    const jobRole = await jobRoleService.updateJobRole(id, companyId, input);

    res.json({ success: true, data: jobRole });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update job role error:', error);
    res.status(500).json({ success: false, error: 'Failed to update job role' });
  }
});

/**
 * DELETE /api/job-roles/:id
 * Archive job role
 */
router.delete('/:id', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    await jobRoleService.deleteJobRole(id, companyId);

    res.json({ success: true, message: 'Job role archived' });
  } catch (error) {
    console.error('Delete job role error:', error);
    res.status(500).json({ success: false, error: 'Failed to archive job role' });
  }
});

// ============== CATEGORY ROUTES ==============

/**
 * GET /api/job-roles/:id/categories
 * Get categories for a job role
 */
router.get('/:id/categories', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const categories = await jobRoleService.getCategoriesByJobRole(id, companyId);

    // Parse follow-ups JSON
    const categoriesWithParsed = categories.map(cat => ({
      ...cat,
      questions: cat.questions.map(q => ({
        ...q,
        followUps: JSON.parse(q.followUps) as string[],
      })),
    }));

    res.json({ success: true, data: categoriesWithParsed });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to get categories' });
  }
});

/**
 * POST /api/job-roles/:id/categories
 * Create a category for a job role
 */
router.post('/:id/categories', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id: jobRoleId } = req.params;
    const input = createCategorySchema.parse(req.body);

    const category = await jobRoleService.createCategory({
      ...input,
      jobRoleId,
      companyId,
    });

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create category error:', error);
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
});

/**
 * PUT /api/job-roles/:id/categories/:categoryId
 * Update a category
 */
router.put('/:id/categories/:categoryId', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { categoryId } = req.params;
    const input = updateCategorySchema.parse(req.body);

    const category = await jobRoleService.updateCategory(categoryId, companyId, input);

    res.json({ success: true, data: category });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update category error:', error);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
});

/**
 * DELETE /api/job-roles/:id/categories/:categoryId
 * Delete a category
 */
router.delete('/:id/categories/:categoryId', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { categoryId } = req.params;

    await jobRoleService.deleteCategory(categoryId, companyId);

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  }
});

/**
 * POST /api/job-roles/:id/categories/reorder
 * Reorder categories
 */
router.post('/:id/categories/reorder', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id: jobRoleId } = req.params;
    const { orderedIds } = reorderCategoriesSchema.parse(req.body);

    await jobRoleService.reorderCategories(jobRoleId, companyId, orderedIds);

    res.json({ success: true, message: 'Categories reordered' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Reorder categories error:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder categories' });
  }
});

export default router;
