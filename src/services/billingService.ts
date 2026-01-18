// Billing Service - Stripe Integration for Boomer AI
import Stripe from 'stripe';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

let stripe: Stripe | null = null;

// Subscription plan configuration
export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    priceId: null,
    features: [
      'Voice assistant (5 min/day)',
      'Basic medication reminders',
      'Calendar (10 events)',
      '2 contacts',
    ],
    limits: {
      voiceMinutesPerDay: 5,
      medications: 3,
      appointments: 10,
      contacts: 2,
      caregivers: 0,
      smsReminders: false,
    },
  },
  PLUS: {
    name: 'Plus',
    price: 9.99,
    priceId: process.env.STRIPE_PRICE_PLUS,
    features: [
      'Unlimited voice assistant',
      'Unlimited medications',
      'Unlimited calendar events',
      'Unlimited contacts',
      'SMS reminders',
      '1 caregiver access',
    ],
    limits: {
      voiceMinutesPerDay: -1, // unlimited
      medications: -1,
      appointments: -1,
      contacts: -1,
      caregivers: 1,
      smsReminders: true,
    },
  },
  FAMILY: {
    name: 'Family',
    price: 19.99,
    priceId: process.env.STRIPE_PRICE_FAMILY,
    features: [
      'Everything in Plus',
      'Up to 5 caregiver accounts',
      'Caregiver dashboard',
      'Priority phone support',
      'Health insights',
    ],
    limits: {
      voiceMinutesPerDay: -1,
      medications: -1,
      appointments: -1,
      contacts: -1,
      caregivers: 5,
      smsReminders: true,
    },
  },
  PREMIUM: {
    name: 'Premium',
    price: 29.99,
    priceId: process.env.STRIPE_PRICE_PREMIUM,
    features: [
      'Everything in Family',
      'Unlimited caregivers',
      'API access',
      '24/7 support',
      'Custom voice options',
      'Health data export',
    ],
    limits: {
      voiceMinutesPerDay: -1,
      medications: -1,
      appointments: -1,
      contacts: -1,
      caregivers: -1,
      smsReminders: true,
    },
  },
};

export type PlanType = keyof typeof PLANS;

// Initialize Stripe
export function initializeStripe(): boolean {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    logger.warn('STRIPE_SECRET_KEY not set - billing disabled');
    return false;
  }

  try {
    stripe = new Stripe(secretKey);
    logger.info('Stripe initialized');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Stripe');
    return false;
  }
}

// Check if billing is enabled
export function isBillingEnabled(): boolean {
  return stripe !== null;
}

// Get user's subscription
export async function getUserSubscription(userId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (!subscription) {
    return {
      plan: 'FREE' as PlanType,
      status: 'ACTIVE',
      ...PLANS.FREE,
    };
  }

  return {
    ...subscription,
    ...PLANS[subscription.plan as PlanType],
  };
}

// Create or get Stripe customer for user
export async function getOrCreateStripeCustomer(userId: string): Promise<string | null> {
  if (!stripe) return null;

  // Check if user already has a Stripe customer ID
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (subscription?.stripeCustomerId) {
    return subscription.stripeCustomerId;
  }

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (!user) return null;

  // Create Stripe customer
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId },
  });

  // Save customer ID
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customer.id,
      plan: 'FREE',
      status: 'ACTIVE',
    },
    update: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

// Create checkout session for subscription
export async function createCheckoutSession(
  userId: string,
  plan: PlanType,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string | null; error?: string }> {
  if (!stripe) {
    return { url: null, error: 'Billing not configured' };
  }

  const planConfig = PLANS[plan];
  if (!planConfig.priceId) {
    return { url: null, error: 'Invalid plan' };
  }

  try {
    const customerId = await getOrCreateStripeCustomer(userId);
    if (!customerId) {
      return { url: null, error: 'Failed to create customer' };
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      metadata: {
        userId,
        plan,
      },
    });

    return { url: session.url };
  } catch (error) {
    logger.error({ error }, 'Failed to create checkout session');
    return { url: null, error: 'Failed to create checkout session' };
  }
}

// Create customer portal session
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<{ url: string | null; error?: string }> {
  if (!stripe) {
    return { url: null, error: 'Billing not configured' };
  }

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeCustomerId) {
      return { url: null, error: 'No subscription found' };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  } catch (error) {
    logger.error({ error }, 'Failed to create portal session');
    return { url: null, error: 'Failed to create portal session' };
  }
}

// Handle Stripe webhook events
export async function handleWebhookEvent(
  payload: string | Buffer,
  signature: string
): Promise<{ success: boolean; error?: string }> {
  if (!stripe) {
    return { success: false, error: 'Stripe not initialized' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { success: false, error: 'Webhook secret not configured' };
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    logger.info({ type: event.type }, 'Processing Stripe webhook');

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancelled(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        logger.info({ type: event.type }, 'Unhandled webhook event type');
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ error }, 'Webhook processing failed');
    return { success: false, error: err.message };
  }
}

// Handle successful checkout
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan as PlanType;

  if (!userId || !plan) {
    logger.error({ session: session.id }, 'Missing metadata in checkout session');
    return;
  }

  await prisma.subscription.update({
    where: { userId },
    data: {
      plan,
      status: 'ACTIVE',
      stripeSubscriptionId: session.subscription as string,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
    },
  });

  logger.info({ userId, plan }, 'Subscription activated');
}

// Handle subscription update
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!dbSub) {
    logger.error({ customerId }, 'Subscription not found for customer');
    return;
  }

  const status = subscription.status === 'active' ? 'ACTIVE' :
                 subscription.status === 'past_due' ? 'PAST_DUE' :
                 subscription.status === 'canceled' ? 'CANCELLED' : 'ACTIVE';

  // Access Stripe subscription properties with type assertion
  const subData = subscription as unknown as {
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
  };

  await prisma.subscription.update({
    where: { id: dbSub.id },
    data: {
      status,
      currentPeriodStart: new Date(subData.current_period_start * 1000),
      currentPeriodEnd: new Date(subData.current_period_end * 1000),
      cancelAtPeriodEnd: subData.cancel_at_period_end,
    },
  });
}

// Handle subscription cancellation
async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  await prisma.subscription.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      status: 'CANCELLED',
      plan: 'FREE',
    },
  });

  logger.info({ customerId }, 'Subscription cancelled, reverted to free plan');
}

// Handle successful payment
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!dbSub) return;

  // Access invoice properties with type assertion
  const invoiceData = invoice as unknown as { payment_intent?: string; amount_paid?: number };

  await prisma.payment.create({
    data: {
      userId: dbSub.userId,
      amount: (invoiceData.amount_paid || 0) / 100, // Convert from cents
      currency: invoice.currency?.toUpperCase() || 'USD',
      status: 'COMPLETED',
      stripePaymentId: invoiceData.payment_intent || invoice.id,
      description: `Subscription payment - ${dbSub.plan}`,
    },
  });
}

// Handle failed payment
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const dbSub = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!dbSub) return;

  await prisma.subscription.update({
    where: { id: dbSub.id },
    data: { status: 'PAST_DUE' },
  });

  // Access invoice properties with type assertion
  const invoiceData = invoice as unknown as { payment_intent?: string; amount_due?: number };

  await prisma.payment.create({
    data: {
      userId: dbSub.userId,
      amount: (invoiceData.amount_due || 0) / 100,
      currency: invoice.currency?.toUpperCase() || 'USD',
      status: 'FAILED',
      stripePaymentId: invoiceData.payment_intent || invoice.id,
      description: `Failed payment attempt - ${dbSub.plan}`,
    },
  });

  logger.warn({ userId: dbSub.userId }, 'Payment failed, subscription past due');
}

// Cancel subscription
export async function cancelSubscription(userId: string): Promise<boolean> {
  if (!stripe) return false;

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeSubscriptionId) return false;

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to cancel subscription');
    return false;
  }
}

// Resume cancelled subscription
export async function resumeSubscription(userId: string): Promise<boolean> {
  if (!stripe) return false;

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription?.stripeSubscriptionId) return false;

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: false },
    });

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to resume subscription');
    return false;
  }
}

// Get payment history
export async function getPaymentHistory(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}
