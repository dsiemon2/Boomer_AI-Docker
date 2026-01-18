import { Router, Response } from 'express';
import { z } from 'zod';
import * as questionService from '../services/questionService.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireCompanyAdmin, requireManager } from '../middleware/rbac.js';
import { tenantIsolation, getCompanyId } from '../middleware/tenant.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = Router();

// Apply auth and tenant isolation to all routes
router.use(authenticateUser);
router.use(tenantIsolation);

// Validation schemas
const createQuestionSchema = z.object({
  text: z.string().min(1).max(2000),
  followUps: z.array(z.string()).optional(),
  evaluationCriteria: z.string().max(1000).optional(),
  timeAllocation: z.number().int().min(1).max(60).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  categoryId: z.string(),
});

const updateQuestionSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  followUps: z.array(z.string()).optional(),
  evaluationCriteria: z.string().max(1000).optional(),
  timeAllocation: z.number().int().min(1).max(60).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const reorderQuestionsSchema = z.object({
  orderedIds: z.array(z.string()),
});

const importQuestionsSchema = z.object({
  jobRoleId: z.string(),
  questions: z.array(z.object({
    category: z.string().min(1),
    text: z.string().min(1),
    followUps: z.string().optional(),
    evaluationCriteria: z.string().optional(),
    timeAllocation: z.number().optional(),
    isRequired: z.boolean().optional(),
  })),
});

/**
 * GET /api/questions
 * List questions (by category or job role)
 */
router.get('/', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { categoryId, jobRoleId } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    if (categoryId) {
      const questions = await questionService.listQuestionsByCategory(categoryId as string);
      res.json({ success: true, data: { items: questions, total: questions.length } });
      return;
    }

    if (jobRoleId) {
      const result = await questionService.listQuestionsByJobRole(
        jobRoleId as string,
        companyId,
        { page, pageSize }
      );
      res.json({ success: true, data: result });
      return;
    }

    res.status(400).json({ success: false, error: 'categoryId or jobRoleId is required' });
  } catch (error) {
    console.error('List questions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list questions' });
  }
});

/**
 * POST /api/questions
 * Create a new question
 */
router.post('/', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = createQuestionSchema.parse(req.body);

    const question = await questionService.createQuestion(input);

    res.status(201).json({
      success: true,
      data: {
        ...question,
        followUps: JSON.parse(question.followUps) as string[],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create question error:', error);
    res.status(500).json({ success: false, error: 'Failed to create question' });
  }
});

/**
 * GET /api/questions/:id
 * Get question details
 */
router.get('/:id', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const question = await questionService.getQuestionById(id);

    if (!question) {
      res.status(404).json({ success: false, error: 'Question not found' });
      return;
    }

    res.json({ success: true, data: question });
  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({ success: false, error: 'Failed to get question' });
  }
});

/**
 * PUT /api/questions/:id
 * Update question
 */
router.put('/:id', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = updateQuestionSchema.parse(req.body);

    const question = await questionService.updateQuestion(id, input);

    res.json({ success: true, data: question });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update question error:', error);
    res.status(500).json({ success: false, error: 'Failed to update question' });
  }
});

/**
 * DELETE /api/questions/:id
 * Delete (deactivate) question
 */
router.delete('/:id', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    await questionService.deleteQuestion(id);

    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete question' });
  }
});

/**
 * POST /api/questions/reorder
 * Reorder questions within a category
 */
router.post('/reorder', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categoryId } = req.query;
    const { orderedIds } = reorderQuestionsSchema.parse(req.body);

    if (!categoryId) {
      res.status(400).json({ success: false, error: 'categoryId is required' });
      return;
    }

    await questionService.reorderQuestions(categoryId as string, orderedIds);

    res.json({ success: true, message: 'Questions reordered' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Reorder questions error:', error);
    res.status(500).json({ success: false, error: 'Failed to reorder questions' });
  }
});

/**
 * POST /api/questions/import
 * Bulk import questions
 */
router.post('/import', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { jobRoleId, questions } = importQuestionsSchema.parse(req.body);

    const result = await questionService.importQuestions(jobRoleId, companyId, questions);

    res.json({
      success: true,
      data: {
        imported: result.imported,
        errors: result.errors,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Import questions error:', error);
    res.status(500).json({ success: false, error: 'Failed to import questions' });
  }
});

export default router;
