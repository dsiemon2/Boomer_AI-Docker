// Notification Routes - Push notifications and device tokens
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/boomerAuth.js';
import {
  registerDeviceToken,
  removeDeviceToken,
  getUserDeviceTokens,
  isPushEnabled,
  sendPushToUser,
} from '../services/pushNotifications.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get push notification status
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isPushEnabled(),
    },
  });
});

// Register device token
router.post('/register-device', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { token, platform, deviceId, name } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    const result = await registerDeviceToken(userId, token, platform, deviceId, name);

    if (result.success) {
      res.json({
        success: true,
        data: { id: result.id },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error registering device token');
    res.status(500).json({
      success: false,
      error: 'Failed to register device token',
    });
  }
});

// Unregister device token
router.post('/unregister-device', requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
      });
    }

    await removeDeviceToken(token);

    res.json({
      success: true,
      message: 'Device token removed',
    });
  } catch (error) {
    logger.error({ error }, 'Error unregistering device token');
    res.status(500).json({
      success: false,
      error: 'Failed to unregister device token',
    });
  }
});

// Get user's devices
router.get('/devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const devices = await getUserDeviceTokens(userId);

    res.json({
      success: true,
      data: { devices },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting devices');
    res.status(500).json({
      success: false,
      error: 'Failed to get devices',
    });
  }
});

// Test notification (for development)
router.post('/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { title, body } = req.body;

    const result = await sendPushToUser(
      userId,
      title || 'Test Notification',
      body || 'This is a test notification from Boomer AI'
    );

    res.json({
      success: result.success,
      data: {
        sentCount: result.sentCount,
        failedTokens: result.failedTokens.length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error sending test notification');
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification',
    });
  }
});

export default router;
