import { Router, Response } from 'express';
import { z } from 'zod';
import * as interviewService from '../services/interviewService.js';
import { generateInterviewSummary, JobRoleContext, TranscriptSegment } from '../services/ai/summaryService.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireCompanyAdmin, requireManager } from '../middleware/rbac.js';
import { tenantIsolation, getCompanyId } from '../middleware/tenant.js';
import { AuthenticatedRequest, InterviewMode, InterviewStatus } from '../types/index.js';

const router = Router();

// Apply auth and tenant isolation to all routes
router.use(authenticateUser);
router.use(tenantIsolation);

// Validation schemas
const createInterviewSchema = z.object({
  candidateName: z.string().min(1).max(255),
  candidateEmail: z.string().email(),
  candidatePhone: z.string().max(50).optional(),
  mode: z.enum(['AI_ONLY', 'HYBRID']),
  scheduledAt: z.string().datetime(),
  duration: z.number().int().min(15).max(180).optional(),
  notes: z.string().max(2000).optional(),
  jobRoleId: z.string(),
  managerId: z.string().optional(),
});

const updateInterviewSchema = z.object({
  candidateName: z.string().min(1).max(255).optional(),
  candidateEmail: z.string().email().optional(),
  candidatePhone: z.string().max(50).optional(),
  mode: z.enum(['AI_ONLY', 'HYBRID']).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().min(15).max(180).optional(),
  notes: z.string().max(2000).optional(),
  jobRoleId: z.string().optional(),
});

const saveResultSchema = z.object({
  transcript: z.string().optional(),
  summary: z.string().optional(),
  scorecard: z.record(z.unknown()).optional(),
  managerNotes: z.string().optional(),
  overallScore: z.number().int().min(1).max(5).optional(),
  recommendation: z.enum(['STRONG_YES', 'YES', 'MAYBE', 'NO', 'STRONG_NO']).optional(),
});

/**
 * GET /api/interviews
 * List interviews
 */
router.get('/', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;

    const filter: {
      status?: InterviewStatus;
      jobRoleId?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {};

    if (req.query.status) {
      filter.status = req.query.status as InterviewStatus;
    }
    if (req.query.jobRoleId) {
      filter.jobRoleId = req.query.jobRoleId as string;
    }
    if (req.query.dateFrom) {
      filter.dateFrom = new Date(req.query.dateFrom as string);
    }
    if (req.query.dateTo) {
      filter.dateTo = new Date(req.query.dateTo as string);
    }

    // Company admins see all, managers see only their interviews
    let result;
    if (req.user?.role === 'COMPANY_ADMIN') {
      result = await interviewService.listInterviews(companyId, { page, pageSize }, filter);
    } else {
      result = await interviewService.listManagerInterviews(
        companyId,
        req.user!.userId,
        { page, pageSize },
        filter
      );
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('List interviews error:', error);
    res.status(500).json({ success: false, error: 'Failed to list interviews' });
  }
});

/**
 * POST /api/interviews
 * Create a new interview
 */
router.post('/', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const input = createInterviewSchema.parse(req.body);

    const interview = await interviewService.createInterview({
      ...input,
      mode: input.mode as InterviewMode,
      scheduledAt: new Date(input.scheduledAt),
      companyId,
      managerId: input.managerId || req.user?.userId,
    });

    res.status(201).json({ success: true, data: interview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Create interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to create interview' });
  }
});

/**
 * GET /api/interviews/upcoming
 * Get upcoming interviews
 */
router.get('/upcoming', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const limit = parseInt(req.query.limit as string) || 10;

    const interviews = await interviewService.getUpcomingInterviews(companyId, limit);

    res.json({ success: true, data: interviews });
  } catch (error) {
    console.error('Get upcoming interviews error:', error);
    res.status(500).json({ success: false, error: 'Failed to get upcoming interviews' });
  }
});

/**
 * GET /api/interviews/stats
 * Get interview statistics
 */
router.get('/stats', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

    const stats = await interviewService.getInterviewStats(companyId, dateFrom, dateTo);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Get interview stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get statistics' });
  }
});

/**
 * GET /api/interviews/analytics
 * Get comprehensive analytics dashboard data
 */
router.get('/analytics', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

    const analytics = await interviewService.getAnalyticsDashboard(companyId, dateFrom, dateTo);

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to get analytics' });
  }
});

/**
 * GET /api/interviews/analytics/trends
 * Get score trends over time
 */
router.get('/analytics/trends', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const days = parseInt(req.query.days as string) || 30;

    const trends = await interviewService.getScoreTrends(companyId, days);

    res.json({ success: true, data: trends });
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({ success: false, error: 'Failed to get trends' });
  }
});

/**
 * GET /api/interviews/analytics/top-candidates
 * Get top performing candidates
 */
router.get('/analytics/top-candidates', requireCompanyAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const limit = parseInt(req.query.limit as string) || 10;

    const candidates = await interviewService.getTopCandidates(companyId, limit);

    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error('Get top candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to get top candidates' });
  }
});

/**
 * GET /api/interviews/:id
 * Get interview details
 */
router.get('/:id', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    const interview = await interviewService.getInterviewById(id, companyId);

    if (!interview) {
      res.status(404).json({ success: false, error: 'Interview not found' });
      return;
    }

    // Parse question followUps
    const interviewWithParsed = {
      ...interview,
      jobRole: {
        ...interview.jobRole,
        categories: interview.jobRole.categories.map(cat => ({
          ...cat,
          questions: cat.questions.map(q => ({
            ...q,
            followUps: JSON.parse(q.followUps) as string[],
          })),
        })),
      },
      result: interview.result ? {
        ...interview.result,
        scorecard: JSON.parse(interview.result.scorecard),
      } : null,
    };

    res.json({ success: true, data: interviewWithParsed });
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview' });
  }
});

/**
 * PUT /api/interviews/:id
 * Update interview
 */
router.put('/:id', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const input = updateInterviewSchema.parse(req.body);

    const interview = await interviewService.updateInterview(id, companyId, {
      ...input,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    });

    res.json({ success: true, data: interview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Update interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to update interview' });
  }
});

/**
 * DELETE /api/interviews/:id
 * Cancel interview
 */
router.delete('/:id', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    await interviewService.cancelInterview(id, companyId);

    res.json({ success: true, message: 'Interview cancelled' });
  } catch (error) {
    console.error('Cancel interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel interview' });
  }
});

/**
 * POST /api/interviews/:id/start
 * Start interview session
 */
router.post('/:id/start', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { sessionId } = req.body;

    const interview = await interviewService.getInterviewById(id, companyId);
    if (!interview) {
      res.status(404).json({ success: false, error: 'Interview not found' });
      return;
    }

    await interviewService.startInterviewSession(id, sessionId);

    res.json({ success: true, message: 'Interview started' });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
});

/**
 * POST /api/interviews/:id/end
 * End interview session
 */
router.post('/:id/end', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { sessionId } = req.body;

    const interview = await interviewService.getInterviewById(id, companyId);
    if (!interview) {
      res.status(404).json({ success: false, error: 'Interview not found' });
      return;
    }

    await interviewService.endInterviewSession(id, sessionId);

    res.json({ success: true, message: 'Interview ended' });
  } catch (error) {
    console.error('End interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to end interview' });
  }
});

/**
 * GET /api/interviews/:id/result
 * Get interview result
 */
router.get('/:id/result', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await interviewService.getInterviewResult(id);

    if (!result) {
      res.status(404).json({ success: false, error: 'Result not found' });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get interview result error:', error);
    res.status(500).json({ success: false, error: 'Failed to get result' });
  }
});

/**
 * POST /api/interviews/:id/result
 * Save interview result
 */
router.post('/:id/result', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const input = saveResultSchema.parse(req.body);

    const result = await interviewService.saveInterviewResult(id, input);

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    console.error('Save interview result error:', error);
    res.status(500).json({ success: false, error: 'Failed to save result' });
  }
});

/**
 * POST /api/interviews/:id/generate-summary
 * Generate AI-powered interview summary and scorecard
 */
router.post('/:id/generate-summary', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;

    // Get full interview details
    const interview = await interviewService.getInterviewById(id, companyId);
    if (!interview) {
      res.status(404).json({ success: false, error: 'Interview not found' });
      return;
    }

    // Check if interview has been completed
    if (interview.status !== 'COMPLETED') {
      res.status(400).json({ success: false, error: 'Interview must be completed before generating summary' });
      return;
    }

    // Get existing result with transcript
    const existingResult = await interviewService.getInterviewResult(id);
    if (!existingResult?.transcript) {
      res.status(400).json({ success: false, error: 'No transcript available for this interview' });
      return;
    }

    // Parse transcript into segments
    const transcriptSegments: TranscriptSegment[] = parseTranscript(existingResult.transcript);

    // Build job role context
    const jobRoleContext: JobRoleContext = {
      title: interview.jobRole.title,
      description: interview.jobRole.description || undefined,
      categories: interview.jobRole.categories.map(cat => ({
        name: cat.name,
        questions: cat.questions.map(q => ({
          id: q.id,
          text: q.text,
          evaluationCriteria: q.evaluationCriteria || undefined,
        })),
      })),
    };

    // Generate AI summary
    const analysis = await generateInterviewSummary(
      interview.candidateName,
      jobRoleContext,
      transcriptSegments
    );

    // Save the generated summary and scorecard
    const updatedResult = await interviewService.saveInterviewResult(id, {
      summary: analysis.summary,
      scorecard: analysis.scorecard as unknown as Record<string, unknown>,
      overallScore: analysis.overallScore,
      recommendation: analysis.recommendation,
    });

    res.json({
      success: true,
      data: {
        ...analysis,
        result: updatedResult,
      },
    });
  } catch (error) {
    console.error('Generate summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate interview summary' });
  }
});

/**
 * Parse transcript string into structured segments
 */
function parseTranscript(transcript: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = transcript.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Match patterns like [AI]: text, [CANDIDATE]: text, [MANAGER]: text
    const match = line.match(/^\[?(AI|CANDIDATE|MANAGER|INTERVIEWER)\]?:\s*(.+)$/i);
    if (match) {
      const speakerRaw = match[1].toUpperCase();
      let speaker: 'ai' | 'candidate' | 'manager';

      if (speakerRaw === 'AI' || speakerRaw === 'INTERVIEWER') {
        speaker = 'ai';
      } else if (speakerRaw === 'CANDIDATE') {
        speaker = 'candidate';
      } else {
        speaker = 'manager';
      }

      segments.push({
        speaker,
        text: match[2].trim(),
      });
    } else if (line.trim()) {
      // If no speaker prefix, assume it's continuation of previous or candidate response
      if (segments.length > 0) {
        segments[segments.length - 1].text += ' ' + line.trim();
      } else {
        segments.push({
          speaker: 'candidate',
          text: line.trim(),
        });
      }
    }
  }

  return segments;
}

/**
 * POST /api/interviews/:id/session
 * Create a web interview session (generates interview link)
 */
router.post('/:id/session', requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    const { id } = req.params;
    const { expiresInHours } = req.body;

    const interview = await interviewService.getInterviewById(id, companyId);
    if (!interview) {
      res.status(404).json({ success: false, error: 'Interview not found' });
      return;
    }

    const session = await interviewService.createWebSession(id, req.user?.userId, expiresInHours);

    res.status(201).json({
      success: true,
      data: {
        session,
        candidateUrl: `/interview/${session.interviewToken}`,
        managerUrl: `/interview/${session.interviewToken}/manage`,
      }
    });
  } catch (error) {
    console.error('Create web session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create interview session' });
  }
});

export default router;
