import { Router, Response } from 'express';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';
import { prisma } from '../db/prisma.js';
import { requireAuth, AuthRequest } from '../middleware/boomerAuth.js';

const router = Router();

// All account routes require authentication
router.use(requireAuth);

// GET /api/account - Get all account data
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        paymentMethods: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        notificationPrefs: true,
        devices: {
          orderBy: { lastSeenAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const clientIp = req.ip || req.socket.remoteAddress;
    const devices = (user.devices || []).map((d: any) => ({
      ...d,
      isCurrent: d.ipAddress === clientIp,
    }));

    res.json({
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      paymentMethods: user.paymentMethods || [],
      notificationPrefs: user.notificationPrefs,
      devices,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Account API error:');
    res.status(500).json({ error: 'Failed to load account data' });
  }
});

// PUT /api/account/name - Update name
router.put('/name', async (req: AuthRequest, res: Response) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Name must be at least 2 characters' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name: name.trim() },
      select: { id: true, name: true, email: true },
    });

    res.json({ success: true, user });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Update name error:');
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// PUT /api/account/email - Update email
router.put('/email', async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (!password) {
    return res.status(400).json({ error: 'Password is required to change email' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingUser && existingUser.id !== user.id) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { email: email.toLowerCase() },
      select: { id: true, name: true, email: true },
    });

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Update email error:');
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// PUT /api/account/phone - Update phone
router.put('/phone', async (req: AuthRequest, res: Response) => {
  const { phone } = req.body;

  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { phone: phone || null },
      select: { id: true, name: true, email: true, phone: true },
    });

    res.json({ success: true, user });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Update phone error:');
    res.status(500).json({ error: 'Failed to update phone' });
  }
});

// PUT /api/account/password - Change password
router.put('/password', async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Change password error:');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /api/account/payment-methods - Get payment methods
router.get('/payment-methods', async (req: AuthRequest, res: Response) => {
  try {
    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ paymentMethods });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Get payment methods error:');
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
});

// POST /api/account/payment-methods - Add payment method
router.post('/payment-methods', async (req: AuthRequest, res: Response) => {
  const { cardType, cardLast4, cardHolderName, expiryMonth, expiryYear, isDefault, gateway, gatewayCustomerId, gatewayPaymentMethodId } = req.body;

  if (!cardType || !cardLast4 || !cardHolderName || !expiryMonth || !expiryYear) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    if (isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: { userId: req.user!.id },
        data: { isDefault: false },
      });
    }

    const existingCount = await prisma.userPaymentMethod.count({
      where: { userId: req.user!.id },
    });

    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        userId: req.user!.id,
        cardType,
        cardLast4,
        cardHolderName,
        expiryMonth: parseInt(expiryMonth),
        expiryYear: parseInt(expiryYear),
        isDefault: isDefault || existingCount === 0,
        gateway,
        gatewayCustomerId,
        gatewayPaymentMethodId,
      },
    });

    res.status(201).json({ success: true, paymentMethod });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Add payment method error:');
    res.status(500).json({ error: 'Failed to add payment method' });
  }
});

// PUT /api/account/payment-methods/:id/default - Set default payment method
router.put('/payment-methods/:id/default', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    await prisma.userPaymentMethod.updateMany({
      where: { userId: req.user!.id },
      data: { isDefault: false },
    });

    const updated = await prisma.userPaymentMethod.update({
      where: { id },
      data: { isDefault: true },
    });

    res.json({ success: true, paymentMethod: updated });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Set default payment method error:');
    res.status(500).json({ error: 'Failed to set default payment method' });
  }
});

// DELETE /api/account/payment-methods/:id - Remove payment method
router.delete('/payment-methods/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const paymentMethod = await prisma.userPaymentMethod.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!paymentMethod) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    await prisma.userPaymentMethod.delete({ where: { id } });

    if (paymentMethod.isDefault) {
      const newest = await prisma.userPaymentMethod.findFirst({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
      });
      if (newest) {
        await prisma.userPaymentMethod.update({
          where: { id: newest.id },
          data: { isDefault: true },
        });
      }
    }

    res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Delete payment method error:');
    res.status(500).json({ error: 'Failed to remove payment method' });
  }
});

// GET /api/account/notifications - Get notification preferences
router.get('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    let prefs = await prisma.userNotificationPreference.findUnique({
      where: { userId: req.user!.id },
    });

    if (!prefs) {
      prefs = await prisma.userNotificationPreference.create({
        data: { userId: req.user!.id },
      });
    }

    res.json({ preferences: prefs });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Get notifications error:');
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

// PUT /api/account/notifications - Update notification preferences
router.put('/notifications', async (req: AuthRequest, res: Response) => {
  try {
    const validKeys = [
      'appointmentEmail', 'appointmentSms', 'appointmentPush',
      'medicationEmail', 'medicationSms', 'medicationPush',
      'caregiverEmail', 'caregiverSms', 'caregiverPush',
      'subscriptionEmail', 'subscriptionSms', 'subscriptionPush',
      'paymentEmail', 'paymentSms', 'paymentPush',
      'securityEmail', 'securitySms', 'securityPush',
    ];

    const updates: Record<string, boolean> = {};
    for (const key of validKeys) {
      if (typeof req.body[key] === 'boolean') {
        updates[key] = req.body[key];
      }
    }

    const prefs = await prisma.userNotificationPreference.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...updates },
      update: updates,
    });

    res.json({ success: true, preferences: prefs });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Update notifications error:');
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// GET /api/account/devices - Get devices
router.get('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.userDevice.findMany({
      where: { userId: req.user!.id },
      orderBy: { lastSeenAt: 'desc' },
    });

    const clientIp = req.ip || req.socket.remoteAddress;
    const devicesWithCurrent = devices.map((d: any) => ({
      ...d,
      isCurrent: d.ipAddress === clientIp,
    }));

    res.json({ devices: devicesWithCurrent });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Get devices error:');
    res.status(500).json({ error: 'Failed to get devices' });
  }
});

// DELETE /api/account/devices/:id - Sign out device
router.delete('/devices/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const device = await prisma.userDevice.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await prisma.userDevice.delete({ where: { id } });
    res.json({ success: true, message: 'Device signed out' });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Delete device error:');
    res.status(500).json({ error: 'Failed to sign out device' });
  }
});

// DELETE /api/account/devices - Sign out all devices except current
router.delete('/devices', async (req: AuthRequest, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress;

    await prisma.userDevice.deleteMany({
      where: {
        userId: req.user!.id,
        NOT: { ipAddress: clientIp as string },
      },
    });

    res.json({ success: true, message: 'Signed out of all other devices' });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Delete all devices error:');
    res.status(500).json({ error: 'Failed to sign out devices' });
  }
});

export default router;
