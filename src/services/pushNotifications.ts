// Push Notification Service - Firebase Cloud Messaging
import admin from 'firebase-admin';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

// Initialize Firebase Admin (only once)
let firebaseInitialized = false;

export function initializeFirebase(): boolean {
  if (firebaseInitialized) return true;

  // Check for Firebase credentials
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!serviceAccount) {
    logger.warn('FIREBASE_SERVICE_ACCOUNT not set - push notifications disabled');
    return false;
  }

  try {
    const credentials = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized for push notifications');
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firebase Admin');
    return false;
  }
}

// Check if push notifications are available
export function isPushEnabled(): boolean {
  return firebaseInitialized;
}

// Register a device token for a user
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string = 'web',
  deviceId?: string,
  name?: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Upsert device token (update if exists, create if not)
    const deviceToken = await prisma.deviceToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        deviceId,
        name,
        isActive: true,
        lastUsed: new Date(),
      },
      update: {
        userId, // In case token was transferred to different user
        platform,
        deviceId,
        name,
        isActive: true,
        lastUsed: new Date(),
      },
    });

    logger.info({ userId, platform, tokenId: deviceToken.id }, 'Device token registered');
    return { success: true, id: deviceToken.id };
  } catch (error) {
    logger.error({ error, userId }, 'Failed to register device token');
    return { success: false, error: 'Failed to register device token' };
  }
}

// Remove a device token
export async function removeDeviceToken(token: string): Promise<boolean> {
  try {
    await prisma.deviceToken.deleteMany({
      where: { token },
    });
    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to remove device token');
    return false;
  }
}

// Send a push notification to a specific user
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ success: boolean; sentCount: number; failedTokens: string[] }> {
  if (!firebaseInitialized) {
    return { success: false, sentCount: 0, failedTokens: [] };
  }

  try {
    // Get all active device tokens for the user
    const deviceTokens = await prisma.deviceToken.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: { id: true, token: true },
    });

    if (deviceTokens.length === 0) {
      logger.info({ userId }, 'No device tokens found for user');
      return { success: true, sentCount: 0, failedTokens: [] };
    }

    const tokens = deviceTokens.map(dt => dt.token);

    // Send multicast message
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data: data || {},
      webpush: {
        notification: {
          icon: '/images/icon-192.png',
          badge: '/images/badge-72.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Handle failed tokens
    const failedTokens: string[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
        // If token is invalid, mark as inactive
        if (resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered') {
          prisma.deviceToken.updateMany({
            where: { token: tokens[idx] },
            data: { isActive: false },
          }).catch(err => logger.error({ err }, 'Failed to deactivate invalid token'));
        }
      }
    });

    logger.info({
      userId,
      sentCount: response.successCount,
      failedCount: response.failureCount,
    }, 'Push notification sent');

    return {
      success: response.successCount > 0,
      sentCount: response.successCount,
      failedTokens,
    };
  } catch (error) {
    logger.error({ error, userId }, 'Failed to send push notification');
    return { success: false, sentCount: 0, failedTokens: [] };
  }
}

// Send a push notification to a specific token
export async function sendPushToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  if (!firebaseInitialized) {
    return false;
  }

  try {
    const message: admin.messaging.Message = {
      token,
      notification: {
        title,
        body,
      },
      data: data || {},
      webpush: {
        notification: {
          icon: '/images/icon-192.png',
          badge: '/images/badge-72.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
        },
      },
    };

    await admin.messaging().send(message);

    // Update last used timestamp
    await prisma.deviceToken.updateMany({
      where: { token },
      data: { lastUsed: new Date() },
    });

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to send push to token');
    return false;
  }
}

// Send reminder notification
export async function sendReminder(
  userId: string,
  type: 'medication' | 'appointment',
  title: string,
  body: string,
  entityId?: string
): Promise<boolean> {
  const data: Record<string, string> = {
    type: `${type}_reminder`,
    timestamp: new Date().toISOString(),
  };

  if (entityId) {
    data.entityId = entityId;
  }

  const result = await sendPushToUser(userId, title, body, data);
  return result.success;
}

// Get user's device tokens
export async function getUserDeviceTokens(userId: string) {
  return prisma.deviceToken.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      platform: true,
      name: true,
      lastUsed: true,
      createdAt: true,
    },
  });
}
