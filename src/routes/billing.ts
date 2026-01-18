// Billing Routes - Stripe Subscription Management
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/boomerAuth.js';
import {
  PLANS,
  PlanType,
  isBillingEnabled,
  getUserSubscription,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
  resumeSubscription,
  getPaymentHistory,
  handleWebhookEvent,
} from '../services/billingService.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get billing status
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isBillingEnabled(),
    },
  });
});

// Get available plans
router.get('/plans', (req: Request, res: Response) => {
  const plans = Object.entries(PLANS).map(([key, plan]) => ({
    id: key,
    ...plan,
    priceId: undefined, // Don't expose price IDs
  }));

  res.json({
    success: true,
    data: { plans },
  });
});

// Get user's subscription
router.get('/subscription', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscription = await getUserSubscription(userId);

    res.json({
      success: true,
      data: { subscription },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting subscription');
    res.status(500).json({ success: false, error: 'Failed to get subscription' });
  }
});

// Create checkout session
router.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { plan } = req.body as { plan: PlanType };

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ success: false, error: 'Invalid plan' });
    }

    if (plan === 'FREE') {
      return res.status(400).json({ success: false, error: 'Cannot checkout for free plan' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await createCheckoutSession(
      userId,
      plan,
      `${baseUrl}/billing/success`,
      `${baseUrl}/billing`
    );

    if (result.url) {
      res.json({ success: true, data: { url: result.url } });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error }, 'Error creating checkout session');
    res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
});

// Create customer portal session
router.post('/portal', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const result = await createPortalSession(userId, `${baseUrl}/billing`);

    if (result.url) {
      res.json({ success: true, data: { url: result.url } });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    logger.error({ error }, 'Error creating portal session');
    res.status(500).json({ success: false, error: 'Failed to create portal session' });
  }
});

// Cancel subscription
router.post('/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const success = await cancelSubscription(userId);

    if (success) {
      res.json({ success: true, message: 'Subscription will be cancelled at end of billing period' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
    }
  } catch (error) {
    logger.error({ error }, 'Error cancelling subscription');
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

// Resume cancelled subscription
router.post('/resume', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const success = await resumeSubscription(userId);

    if (success) {
      res.json({ success: true, message: 'Subscription resumed' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to resume subscription' });
    }
  } catch (error) {
    logger.error({ error }, 'Error resuming subscription');
    res.status(500).json({ success: false, error: 'Failed to resume subscription' });
  }
});

// Get payment history
router.get('/payments', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const payments = await getPaymentHistory(userId);

    res.json({
      success: true,
      data: { payments },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting payments');
    res.status(500).json({ success: false, error: 'Failed to get payments' });
  }
});

// Stripe webhook
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  const result = await handleWebhookEvent(req.body, signature);

  if (result.success) {
    res.json({ received: true });
  } else {
    res.status(400).json({ error: result.error });
  }
});

export default router;
