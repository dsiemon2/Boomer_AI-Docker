import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/boomerAuth.js';
import { createTeamsService } from '../adapters/teams/TeamsService.js';
import { WebhookNotification } from '../adapters/teams/types.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ==================== Authenticated Routes ====================

// Apply auth to meeting management routes
const authRouter = Router();
authRouter.use(requireAuth);

// Validation schemas
const scheduleMeetingSchema = z.object({
  subject: z.string().min(1).max(500),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  participantEmail: z.string().email(),
  participantName: z.string().min(1).max(255),
  additionalEmail: z.string().email().optional(),
  additionalName: z.string().max(255).optional(),
  autoAdmit: z.boolean().optional().default(true), // Default to auto-admit for seniors
  recordAutomatically: z.boolean().optional().default(false),
  appointmentId: z.string().optional(),
});

const rescheduleMeetingSchema = z.object({
  newStartTime: z.string().datetime(),
  newEndTime: z.string().datetime(),
});

/**
 * POST /api/teams/meetings
 * Schedule a new Teams meeting (e.g., family video call, doctor appointment)
 */
authRouter.post('/meetings', async (req: Request, res: Response) => {
  try {
    const input = scheduleMeetingSchema.parse(req.body);
    const user = (req as any).user;

    if (!user?.email) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const organizerUpn = user.email;
    const teamsService = createTeamsService(organizerUpn);

    const meeting = await teamsService.scheduleMeeting({
      subject: input.subject,
      startTime: new Date(input.startTime),
      endTime: new Date(input.endTime),
      participantEmail: input.participantEmail,
      participantName: input.participantName,
      additionalEmail: input.additionalEmail,
      additionalName: input.additionalName,
      autoAdmit: input.autoAdmit,
      recordAutomatically: input.recordAutomatically,
    });

    logger.info({ meetingId: meeting.meetingId, appointmentId: input.appointmentId }, 'Teams meeting scheduled');

    res.status(201).json({ success: true, data: meeting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    logger.error({ error }, 'Failed to schedule Teams meeting');
    res.status(500).json({ success: false, error: 'Failed to schedule meeting' });
  }
});

/**
 * GET /api/teams/meetings/:meetingId
 * Get meeting details
 */
authRouter.get('/meetings/:meetingId', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);
    const meeting = await teamsService.getMeetingDetails(meetingId);

    res.json({ success: true, data: meeting });
  } catch (error) {
    logger.error({ error }, 'Failed to get meeting details');
    res.status(500).json({ success: false, error: 'Failed to get meeting details' });
  }
});

/**
 * PUT /api/teams/meetings/:meetingId/reschedule
 * Reschedule an existing meeting
 */
authRouter.put('/meetings/:meetingId/reschedule', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const input = rescheduleMeetingSchema.parse(req.body);
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);
    const meeting = await teamsService.rescheduleMeeting(
      meetingId,
      new Date(input.newStartTime),
      new Date(input.newEndTime)
    );

    logger.info({ meetingId }, 'Teams meeting rescheduled');

    res.json({ success: true, data: meeting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
      return;
    }
    logger.error({ error }, 'Failed to reschedule meeting');
    res.status(500).json({ success: false, error: 'Failed to reschedule meeting' });
  }
});

/**
 * DELETE /api/teams/meetings/:meetingId
 * Cancel a meeting
 */
authRouter.delete('/meetings/:meetingId', async (req: Request, res: Response) => {
  try {
    const { meetingId } = req.params;
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);
    await teamsService.cancelMeeting(meetingId);

    logger.info({ meetingId }, 'Teams meeting cancelled');

    res.json({ success: true, message: 'Meeting cancelled' });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel meeting');
    res.status(500).json({ success: false, error: 'Failed to cancel meeting' });
  }
});

/**
 * GET /api/teams/calendar
 * Get upcoming calendar events
 */
authRouter.get('/calendar', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date();
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: next 7 days

    const teamsService = createTeamsService(user.email);
    const events = await teamsService.getUpcomingMeetings(startDate, endDate);

    res.json({ success: true, data: events });
  } catch (error) {
    logger.error({ error }, 'Failed to get calendar events');
    res.status(500).json({ success: false, error: 'Failed to get calendar events' });
  }
});

/**
 * POST /api/teams/subscriptions
 * Create a webhook subscription for meeting events
 */
authRouter.post('/subscriptions', async (req: Request, res: Response) => {
  try {
    const { meetingId, webhookUrl, clientState } = req.body;
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);

    let subscription;
    if (meetingId) {
      subscription = await teamsService.subscribeToMeetingEvents(meetingId, webhookUrl, clientState);
    } else {
      subscription = await teamsService.subscribeToCalendarChanges(webhookUrl, clientState);
    }

    logger.info({ subscriptionId: subscription.id }, 'Webhook subscription created');

    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    logger.error({ error }, 'Failed to create subscription');
    res.status(500).json({ success: false, error: 'Failed to create subscription' });
  }
});

/**
 * POST /api/teams/subscriptions/:subscriptionId/renew
 * Renew a webhook subscription
 */
authRouter.post('/subscriptions/:subscriptionId/renew', async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);
    const subscription = await teamsService.renewSubscription(subscriptionId);

    logger.info({ subscriptionId }, 'Webhook subscription renewed');

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error({ error }, 'Failed to renew subscription');
    res.status(500).json({ success: false, error: 'Failed to renew subscription' });
  }
});

/**
 * DELETE /api/teams/subscriptions/:subscriptionId
 * Cancel a webhook subscription
 */
authRouter.delete('/subscriptions/:subscriptionId', async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const user = (req as any).user;

    if (!user?.email) {
      res.status(400).json({ success: false, error: 'User email not found' });
      return;
    }

    const teamsService = createTeamsService(user.email);
    await teamsService.cancelSubscription(subscriptionId);

    logger.info({ subscriptionId }, 'Webhook subscription cancelled');

    res.json({ success: true, message: 'Subscription cancelled' });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel subscription');
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

// Mount authenticated routes
router.use('/', authRouter);

// ==================== Webhook Routes (Unauthenticated) ====================

/**
 * POST /api/teams/webhook
 * Handle incoming webhook notifications from Microsoft Graph
 */
router.post('/webhook', async (req: Request, res: Response) => {
  // Handle validation token for subscription creation
  if (req.query.validationToken) {
    const validationToken = req.query.validationToken as string;
    logger.info('Webhook validation request received');
    res.set('Content-Type', 'text/plain');
    res.status(200).send(validationToken);
    return;
  }

  // Handle actual notifications
  try {
    const { value: notifications } = req.body as { value: WebhookNotification[] };

    if (!notifications || !Array.isArray(notifications)) {
      res.status(400).json({ error: 'Invalid notification format' });
      return;
    }

    // Process each notification asynchronously
    for (const notification of notifications) {
      logger.info({
        subscriptionId: notification.subscriptionId,
        changeType: notification.changeType,
        resource: notification.resource,
      }, 'Processing webhook notification');

      // Verify client state if provided
      if (notification.clientState && notification.clientState !== process.env.TEAMS_WEBHOOK_SECRET) {
        logger.warn({ subscriptionId: notification.subscriptionId }, 'Invalid client state in webhook');
        continue;
      }

      // Process based on change type
      switch (notification.changeType) {
        case 'created':
          await handleMeetingCreated(notification);
          break;
        case 'updated':
          await handleMeetingUpdated(notification);
          break;
        case 'deleted':
          await handleMeetingDeleted(notification);
          break;
        default:
          logger.info({ changeType: notification.changeType }, 'Unknown change type');
      }
    }

    // Return 202 Accepted to acknowledge receipt
    res.status(202).send();
  } catch (error) {
    logger.error({ error }, 'Failed to process webhook notification');
    res.status(500).json({ error: 'Failed to process notification' });
  }
});

/**
 * Handle meeting created event
 */
async function handleMeetingCreated(notification: WebhookNotification): Promise<void> {
  logger.info({ resourceId: notification.resourceData.id }, 'Meeting created event');
  // TODO: Update appointment status or trigger notifications to caregivers
}

/**
 * Handle meeting updated event
 */
async function handleMeetingUpdated(notification: WebhookNotification): Promise<void> {
  logger.info({ resourceId: notification.resourceData.id }, 'Meeting updated event');
  // TODO: Check for participant joins/leaves, notify family members
}

/**
 * Handle meeting deleted event
 */
async function handleMeetingDeleted(notification: WebhookNotification): Promise<void> {
  logger.info({ resourceId: notification.resourceData.id }, 'Meeting deleted event');
  // TODO: Update appointment status to cancelled
}

export default router;
