// SMS Service - Twilio Integration for Boomer AI
import Twilio from 'twilio';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

let twilioClient: Twilio.Twilio | null = null;
let smsSettings: {
  fromNumber: string;
  isEnabled: boolean;
} | null = null;

// Initialize Twilio client
export async function initializeSMS(): Promise<boolean> {
  try {
    // Check environment variables first
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (accountSid && authToken && fromNumber) {
      twilioClient = Twilio(accountSid, authToken);
      smsSettings = { fromNumber, isEnabled: true };
      logger.info('SMS service initialized from environment variables');
      return true;
    }

    // Fall back to database settings
    const dbSettings = await prisma.sMSSettings.findFirst({
      where: { isActive: true },
    });

    if (dbSettings && dbSettings.accountSid && dbSettings.authToken && dbSettings.fromNumber) {
      twilioClient = Twilio(dbSettings.accountSid, dbSettings.authToken);
      smsSettings = {
        fromNumber: dbSettings.fromNumber,
        isEnabled: dbSettings.enableReminders,
      };
      logger.info('SMS service initialized from database settings');
      return true;
    }

    logger.warn('SMS service not configured - SMS reminders disabled');
    return false;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize SMS service');
    return false;
  }
}

// Check if SMS is enabled
export function isSMSEnabled(): boolean {
  return twilioClient !== null && smsSettings?.isEnabled === true;
}

// Get SMS status
export function getSMSStatus() {
  return {
    enabled: isSMSEnabled(),
    configured: twilioClient !== null,
  };
}

// Send SMS to a phone number
export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!twilioClient || !smsSettings) {
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    // Format phone number (add +1 for US if not present)
    let formattedNumber = to.replace(/\D/g, '');
    if (formattedNumber.length === 10) {
      formattedNumber = '+1' + formattedNumber;
    } else if (!formattedNumber.startsWith('+')) {
      formattedNumber = '+' + formattedNumber;
    }

    const message = await twilioClient.messages.create({
      body,
      from: smsSettings.fromNumber,
      to: formattedNumber,
    });

    logger.info({ messageId: message.sid, to: formattedNumber }, 'SMS sent successfully');

    return { success: true, messageId: message.sid };
  } catch (error: unknown) {
    const err = error as Error;
    logger.error({ error, to }, 'Failed to send SMS');
    return { success: false, error: err.message || 'Failed to send SMS' };
  }
}

// Send SMS to a user by ID
export async function sendSMSToUser(
  userId: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, name: true, consentFlags: true },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.phone) {
      return { success: false, error: 'User has no phone number' };
    }

    // Check SMS consent
    const consent = JSON.parse(user.consentFlags) as { smsNotifications?: boolean };
    if (consent.smsNotifications === false) {
      return { success: false, error: 'User has not consented to SMS notifications' };
    }

    return sendSMS(user.phone, body);
  } catch (error) {
    logger.error({ error, userId }, 'Error sending SMS to user');
    return { success: false, error: 'Failed to send SMS' };
  }
}

// Send medication reminder via SMS
export async function sendMedicationReminderSMS(
  userId: string,
  medicationName: string,
  dosage?: string
): Promise<boolean> {
  const message = dosage
    ? `Boomer AI Reminder: Time to take your ${medicationName} (${dosage}). Reply TAKEN when done.`
    : `Boomer AI Reminder: Time to take your ${medicationName}. Reply TAKEN when done.`;

  const result = await sendSMSToUser(userId, message);
  return result.success;
}

// Send appointment reminder via SMS
export async function sendAppointmentReminderSMS(
  userId: string,
  title: string,
  time: Date,
  location?: string
): Promise<boolean> {
  const timeStr = time.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  let message = `Boomer AI Reminder: ${title} on ${timeStr}`;
  if (location) {
    message += ` at ${location}`;
  }
  message += '. Reply OK to confirm.';

  const result = await sendSMSToUser(userId, message);
  return result.success;
}

// Send emergency alert to caregivers
export async function sendCaregiverAlert(
  userId: string,
  alertType: string,
  message: string
): Promise<{ sent: number; failed: number }> {
  try {
    // Get all active caregivers with emergency access
    const caregiverAccesses = await prisma.caregiverAccess.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [
          { role: 'EDIT' },
          { role: 'EMERGENCY_ONLY' },
        ],
      },
      include: {
        caregiver: {
          select: { phone: true, name: true },
        },
      },
    });

    let sent = 0;
    let failed = 0;

    for (const access of caregiverAccesses) {
      if (access.caregiver.phone) {
        const alertMsg = `BOOMER AI ALERT for your loved one: ${alertType} - ${message}. Please check in with them.`;
        const result = await sendSMS(access.caregiver.phone, alertMsg);
        if (result.success) {
          sent++;
        } else {
          failed++;
        }
      }
    }

    logger.info({ userId, alertType, sent, failed }, 'Caregiver alerts sent');
    return { sent, failed };
  } catch (error) {
    logger.error({ error, userId }, 'Error sending caregiver alerts');
    return { sent: 0, failed: 0 };
  }
}

// Update SMS settings in database
export async function updateSMSSettings(settings: {
  accountSid?: string;
  authToken?: string;
  fromNumber?: string;
  enableReminders?: boolean;
}): Promise<boolean> {
  try {
    const existing = await prisma.sMSSettings.findFirst();

    if (existing) {
      await prisma.sMSSettings.update({
        where: { id: existing.id },
        data: {
          ...settings,
          isActive: true,
        },
      });
    } else {
      await prisma.sMSSettings.create({
        data: {
          provider: 'twilio',
          accountSid: settings.accountSid || null,
          authToken: settings.authToken || null,
          fromNumber: settings.fromNumber || null,
          enableReminders: settings.enableReminders ?? true,
          isActive: true,
        },
      });
    }

    // Reinitialize SMS with new settings
    await initializeSMS();

    return true;
  } catch (error) {
    logger.error({ error }, 'Error updating SMS settings');
    return false;
  }
}
