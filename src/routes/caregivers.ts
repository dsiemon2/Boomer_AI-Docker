// Caregiver Access Routes
import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/boomerAuth.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const router = Router();

// Default permissions for new caregivers
const DEFAULT_PERMISSIONS = {
  calendar: true,
  medications: true,
  contacts: true,
  notes: false,
};

// ===== INVITE CAREGIVERS =====

// Send invitation to a caregiver
router.post('/invite', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { email, role = 'VIEW_ONLY', permissions } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Check if caregiver exists as a user
    const caregiverUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!caregiverUser) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this email. They need to create an account first.',
      });
    }

    // Can't invite yourself
    if (caregiverUser.id === userId) {
      return res.status(400).json({ success: false, error: 'You cannot invite yourself as a caregiver' });
    }

    // Check if invitation already exists
    const existingAccess = await prisma.caregiverAccess.findUnique({
      where: {
        userId_caregiverId: {
          userId,
          caregiverId: caregiverUser.id,
        },
      },
    });

    if (existingAccess) {
      if (existingAccess.status === 'ACTIVE') {
        return res.status(400).json({ success: false, error: 'This person is already your caregiver' });
      }
      if (existingAccess.status === 'PENDING') {
        return res.status(400).json({ success: false, error: 'Invitation already sent and pending acceptance' });
      }
    }

    // Create or update invitation
    const caregiverAccess = await prisma.caregiverAccess.upsert({
      where: {
        userId_caregiverId: {
          userId,
          caregiverId: caregiverUser.id,
        },
      },
      create: {
        userId,
        caregiverId: caregiverUser.id,
        role,
        permissions: JSON.stringify(permissions || DEFAULT_PERMISSIONS),
        status: 'PENDING',
      },
      update: {
        role,
        permissions: JSON.stringify(permissions || DEFAULT_PERMISSIONS),
        status: 'PENDING',
        revokedAt: null,
        invitedAt: new Date(),
      },
    });

    logger.info({ userId, caregiverId: caregiverUser.id }, 'Caregiver invitation sent');

    // TODO: Send email notification to caregiver

    res.json({
      success: true,
      data: {
        id: caregiverAccess.id,
        caregiverEmail: email,
        status: 'PENDING',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error sending caregiver invitation');
    res.status(500).json({ success: false, error: 'Failed to send invitation' });
  }
});

// Get my caregivers (people I've given access to)
router.get('/my-caregivers', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const caregivers = await prisma.caregiverAccess.findMany({
      where: { userId },
      include: {
        caregiver: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        caregivers: caregivers.map(c => ({
          id: c.id,
          caregiverId: c.caregiverId,
          name: c.caregiver.name,
          email: c.caregiver.email,
          role: c.role,
          status: c.status,
          permissions: JSON.parse(c.permissions),
          invitedAt: c.invitedAt,
          acceptedAt: c.acceptedAt,
        })),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting caregivers');
    res.status(500).json({ success: false, error: 'Failed to get caregivers' });
  }
});

// Revoke caregiver access
router.post('/:id/revoke', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const access = await prisma.caregiverAccess.findFirst({
      where: { id, userId },
    });

    if (!access) {
      return res.status(404).json({ success: false, error: 'Caregiver access not found' });
    }

    await prisma.caregiverAccess.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    logger.info({ userId, accessId: id }, 'Caregiver access revoked');

    res.json({ success: true, message: 'Caregiver access revoked' });
  } catch (error) {
    logger.error({ error }, 'Error revoking caregiver access');
    res.status(500).json({ success: false, error: 'Failed to revoke access' });
  }
});

// Update caregiver permissions
router.patch('/:id/permissions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { permissions, role } = req.body;

    const access = await prisma.caregiverAccess.findFirst({
      where: { id, userId },
    });

    if (!access) {
      return res.status(404).json({ success: false, error: 'Caregiver access not found' });
    }

    const updateData: { permissions?: string; role?: string } = {};
    if (permissions) updateData.permissions = JSON.stringify(permissions);
    if (role) updateData.role = role;

    await prisma.caregiverAccess.update({
      where: { id },
      data: updateData,
    });

    res.json({ success: true, message: 'Permissions updated' });
  } catch (error) {
    logger.error({ error }, 'Error updating permissions');
    res.status(500).json({ success: false, error: 'Failed to update permissions' });
  }
});

// ===== CAREGIVER DASHBOARD (for people caring for others) =====

// Get my pending invitations
router.get('/invitations', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;

    const invitations = await prisma.caregiverAccess.findMany({
      where: {
        caregiverId,
        status: 'PENDING',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        invitations: invitations.map(i => ({
          id: i.id,
          userId: i.userId,
          userName: i.user.name,
          userEmail: i.user.email,
          role: i.role,
          permissions: JSON.parse(i.permissions),
          invitedAt: i.invitedAt,
        })),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting invitations');
    res.status(500).json({ success: false, error: 'Failed to get invitations' });
  }
});

// Accept caregiver invitation
router.post('/invitations/:id/accept', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;
    const { id } = req.params;

    const invitation = await prisma.caregiverAccess.findFirst({
      where: { id, caregiverId, status: 'PENDING' },
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    await prisma.caregiverAccess.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        acceptedAt: new Date(),
      },
    });

    logger.info({ caregiverId, accessId: id }, 'Caregiver invitation accepted');

    res.json({ success: true, message: 'Invitation accepted' });
  } catch (error) {
    logger.error({ error }, 'Error accepting invitation');
    res.status(500).json({ success: false, error: 'Failed to accept invitation' });
  }
});

// Decline caregiver invitation
router.post('/invitations/:id/decline', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;
    const { id } = req.params;

    const invitation = await prisma.caregiverAccess.findFirst({
      where: { id, caregiverId, status: 'PENDING' },
    });

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    await prisma.caregiverAccess.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Invitation declined' });
  } catch (error) {
    logger.error({ error }, 'Error declining invitation');
    res.status(500).json({ success: false, error: 'Failed to decline invitation' });
  }
});

// Get users I'm caring for
router.get('/caring-for', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;

    const users = await prisma.caregiverAccess.findMany({
      where: {
        caregiverId,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { acceptedAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        users: users.map(u => ({
          accessId: u.id,
          userId: u.userId,
          name: u.user.name,
          email: u.user.email,
          phone: u.user.phone,
          role: u.role,
          permissions: JSON.parse(u.permissions),
          acceptedAt: u.acceptedAt,
        })),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error getting caring-for list');
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

// ===== CAREGIVER VIEW DATA =====

// View user's data (as caregiver)
router.get('/view/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;
    const { userId } = req.params;

    // Check if caregiver has access
    const access = await prisma.caregiverAccess.findFirst({
      where: {
        userId,
        caregiverId,
        status: 'ACTIVE',
      },
    });

    if (!access) {
      return res.status(403).json({ success: false, error: 'You do not have access to this user' });
    }

    const permissions = JSON.parse(access.permissions) as {
      calendar: boolean;
      medications: boolean;
      contacts: boolean;
      notes: boolean;
    };

    // Get user basic info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const data: {
      user: typeof user;
      role: string;
      permissions: typeof permissions;
      appointments?: unknown[];
      medications?: unknown[];
      contacts?: unknown[];
      notes?: unknown[];
    } = {
      user,
      role: access.role,
      permissions,
    };

    // Get appointments if permitted
    if (permissions.calendar) {
      const appointments = await prisma.appointment.findMany({
        where: { userId },
        orderBy: { startAt: 'asc' },
        take: 20,
      });
      data.appointments = appointments;
    }

    // Get medications if permitted
    if (permissions.medications) {
      const medications = await prisma.medication.findMany({
        where: { userId, isActive: true },
        include: {
          logs: {
            take: 10,
            orderBy: { scheduledAt: 'desc' },
          },
        },
      });
      data.medications = medications;
    }

    // Get contacts if permitted
    if (permissions.contacts) {
      const contacts = await prisma.contact.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
      data.contacts = contacts;
    }

    // Get notes if permitted
    if (permissions.notes) {
      const notes = await prisma.note.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      data.notes = notes;
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Error viewing user data');
    res.status(500).json({ success: false, error: 'Failed to get user data' });
  }
});

// Stop being a caregiver (remove myself)
router.post('/stop-caring/:accessId', requireAuth, async (req: Request, res: Response) => {
  try {
    const caregiverId = req.user!.id;
    const { accessId } = req.params;

    const access = await prisma.caregiverAccess.findFirst({
      where: { id: accessId, caregiverId },
    });

    if (!access) {
      return res.status(404).json({ success: false, error: 'Access not found' });
    }

    await prisma.caregiverAccess.delete({
      where: { id: accessId },
    });

    res.json({ success: true, message: 'You are no longer a caregiver for this person' });
  } catch (error) {
    logger.error({ error }, 'Error stopping caregiver role');
    res.status(500).json({ success: false, error: 'Failed to remove access' });
  }
});

export default router;
