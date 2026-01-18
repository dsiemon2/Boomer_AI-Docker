// Interview Session Routes - Web-based interview endpoints

import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /interview/:token
 * Candidate interview page
 */
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
      include: {
        interview: {
          include: {
            jobRole: true,
            company: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).render('interview/error', {
        error: 'Interview not found',
        message: 'This interview link is invalid or has been removed.',
      });
    }

    // Check if expired
    if (session.tokenExpiresAt && new Date() > session.tokenExpiresAt) {
      return res.status(410).render('interview/error', {
        error: 'Link Expired',
        message: 'This interview link has expired. Please contact the recruiter for a new link.',
      });
    }

    // Check if already completed
    if (session.webSessionState === 'COMPLETED') {
      return res.render('interview/complete', {
        candidateName: session.interview.candidateName,
        jobRole: session.interview.jobRole.title,
        company: session.interview.company.name,
      });
    }

    // Render candidate interview page
    res.render('interview/candidate', {
      token,
      session,
      interview: session.interview,
      jobRole: session.interview.jobRole,
      company: session.interview.company,
      wsUrl: `ws://${req.get('host')}/ws/interview`,
    });
  } catch (err) {
    logger.error({ err }, 'Error loading interview page');
    res.status(500).render('interview/error', {
      error: 'Server Error',
      message: 'An error occurred loading the interview. Please try again.',
    });
  }
});

/**
 * GET /interview/:token/manage
 * Manager dashboard for hybrid mode
 */
router.get('/:token/manage', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const adminToken = req.query.adminToken;

    // Simple admin token check (in production, use proper auth)
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).render('interview/error', {
        error: 'Unauthorized',
        message: 'You do not have permission to access this page.',
      });
    }

    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
      include: {
        interview: {
          include: {
            jobRole: {
              include: {
                categories: {
                  orderBy: { order: 'asc' },
                  include: {
                    questions: {
                      where: { isActive: true },
                      orderBy: { order: 'asc' },
                    },
                  },
                },
              },
            },
            company: true,
          },
        },
        transcriptSegments: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).render('interview/error', {
        error: 'Interview not found',
        message: 'This interview session does not exist.',
      });
    }

    // Flatten questions
    const questions = session.interview.jobRole.categories.flatMap(cat =>
      cat.questions.map(q => ({
        ...q,
        followUps: JSON.parse(q.followUps),
        categoryName: cat.name,
      }))
    );

    res.render('interview/manager', {
      token,
      adminToken,
      session,
      interview: session.interview,
      jobRole: session.interview.jobRole,
      company: session.interview.company,
      questions,
      transcript: session.transcriptSegments,
      wsUrl: `ws://${req.get('host')}/ws/interview`,
    });
  } catch (err) {
    logger.error({ err }, 'Error loading manager dashboard');
    res.status(500).render('interview/error', {
      error: 'Server Error',
      message: 'An error occurred loading the dashboard.',
    });
  }
});

/**
 * POST /interview/:token/start
 * Start interview session (called from candidate page)
 */
router.post('/:token/start', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (session.webSessionState !== 'PENDING' && session.webSessionState !== 'READY') {
      return res.status(400).json({
        success: false,
        error: 'Interview has already started or completed',
      });
    }

    await prisma.interviewSession.update({
      where: { id: session.id },
      data: {
        webSessionState: 'READY',
      },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error starting interview');
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
});

/**
 * GET /interview/:token/status
 * Get interview session status
 */
router.get('/:token/status', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
      select: {
        id: true,
        webSessionState: true,
        startedAt: true,
        endedAt: true,
        interview: {
          select: {
            status: true,
            candidateName: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        state: session.webSessionState,
        interviewStatus: session.interview.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error getting interview status');
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * GET /interview/:token/transcript
 * Get interview transcript
 */
router.get('/:token/transcript', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const adminToken = req.query.adminToken;

    // Require admin token for transcript access
    if (adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const session = await prisma.interviewSession.findUnique({
      where: { interviewToken: token },
      include: {
        transcriptSegments: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      data: {
        segments: session.transcriptSegments,
        fullText: session.transcriptSegments
          .map(s => `${s.speaker.toUpperCase()}: ${s.text}`)
          .join('\n\n'),
      },
    });
  } catch (err) {
    logger.error({ err }, 'Error getting transcript');
    res.status(500).json({ success: false, error: 'Failed to get transcript' });
  }
});

export default router;
