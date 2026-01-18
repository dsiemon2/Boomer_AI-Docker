// SMS Routes - Twilio SMS Integration
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/boomerAuth.js';
import {
  getSMSStatus,
  sendSMS,
  sendSMSToUser,
  sendMedicationReminderSMS,
  sendAppointmentReminderSMS,
} from '../services/smsService.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Get SMS status
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: getSMSStatus(),
  });
});

// Update user's phone number
router.post('/phone', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    // Format and validate phone number
    const formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { phone },
    });

    res.json({ success: true, message: 'Phone number updated' });
  } catch (error) {
    logger.error({ error }, 'Error updating phone number');
    res.status(500).json({ success: false, error: 'Failed to update phone number' });
  }
});

// Update SMS consent
router.post('/consent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { smsNotifications } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { consentFlags: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const currentConsent = JSON.parse(user.consentFlags);
    currentConsent.smsNotifications = smsNotifications;

    await prisma.user.update({
      where: { id: userId },
      data: { consentFlags: JSON.stringify(currentConsent) },
    });

    res.json({ success: true, message: 'SMS consent updated' });
  } catch (error) {
    logger.error({ error }, 'Error updating SMS consent');
    res.status(500).json({ success: false, error: 'Failed to update consent' });
  }
});

// Get user's SMS settings
router.get('/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, consentFlags: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const consent = JSON.parse(user.consentFlags);

    res.json({
      success: true,
      data: {
        phone: user.phone,
        smsEnabled: consent.smsNotifications ?? true,
        smsServiceAvailable: getSMSStatus().enabled,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting SMS settings');
    res.status(500).json({ success: false, error: 'Failed to get settings' });
  }
});

// Send test SMS (for development/testing)
router.post('/test', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body;

    const result = await sendSMSToUser(
      userId,
      message || 'This is a test message from Boomer AI.'
    );

    if (result.success) {
      res.json({
        success: true,
        data: { messageId: result.messageId },
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Error sending test SMS');
    res.status(500).json({ success: false, error: 'Failed to send test SMS' });
  }
});

// Twilio webhook for incoming SMS (for replies like "TAKEN")
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { From, Body } = req.body;
    logger.info({ from: From, body: Body }, 'Incoming SMS received');

    const normalizedBody = Body?.toUpperCase().trim();

    // Handle medication taken reply
    if (normalizedBody === 'TAKEN') {
      // Find user by phone number
      const user = await prisma.user.findFirst({
        where: {
          phone: {
            contains: From.replace(/\D/g, '').slice(-10), // Last 10 digits
          },
        },
      });

      if (user) {
        // Find the most recent pending medication log
        const pendingLog = await prisma.medicationLog.findFirst({
          where: {
            medication: { userId: user.id },
            status: 'PENDING',
            scheduledAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: { scheduledAt: 'desc' },
        });

        if (pendingLog) {
          await prisma.medicationLog.update({
            where: { id: pendingLog.id },
            data: {
              status: 'TAKEN',
              takenAt: new Date(),
              source: 'USER',
              notes: 'Confirmed via SMS',
            },
          });

          // Send confirmation
          await sendSMS(From, 'Great! Medication marked as taken. Keep it up!');
        }
      }
    }

    // Return TwiML response (empty is fine)
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (error) {
    logger.error({ error }, 'Error processing SMS webhook');
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

export default router;
