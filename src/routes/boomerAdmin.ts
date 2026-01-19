import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import pino from 'pino';

const router = Router();
const logger = pino();

// Base path for Docker deployment
const basePath = '/BoomerAI';

// Helper function to get branding settings
async function getBranding() {
  try {
    const branding = await prisma.branding.findFirst();
    return branding || {
      primaryColor: '#16a34a',
      secondaryColor: '#15803d',
      accentColor: '#22c55e',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: '',
      faviconUrl: ''
    };
  } catch {
    return {
      primaryColor: '#16a34a',
      secondaryColor: '#15803d',
      accentColor: '#22c55e',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: '',
      faviconUrl: ''
    };
  }
}

// Helper function to get demo user (with sample data)
async function getDemoUser() {
  return await prisma.user.findFirst({
    where: { email: 'demo@boomerai.com' }
  }) || await prisma.user.findFirst();
}

// Auth middleware
function requireToken(req: Request, res: Response, next: NextFunction) {
  const token = req.query.token || req.body.token;
  const validToken = process.env.ADMIN_TOKEN || 'admin';

  if (!token) {
    // No token provided - redirect with default token (dev convenience)
    const redirectUrl = `${basePath}/admin?token=${validToken}`;
    return res.redirect(redirectUrl);
  }

  if (token !== validToken) {
    return res.status(401).render('admin/error', { error: 'Unauthorized', token: '', basePath, branding: null });
  }
  res.locals.token = token;
  res.locals.basePath = basePath;
  next();
}

router.use(requireToken);

// ============================================
// DASHBOARD - "Today" View
// ============================================
router.get('/', async (req, res) => {
  try {
    const branding = await getBranding();

    // Get demo user with sample data (in production, this comes from auth)
    const user = await getDemoUser();
    if (!user) {
      return res.render('admin/error', { error: 'No user found. Please run seed.', token: res.locals.token, basePath, branding });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's data
    const [
      todayAppointments,
      upcomingAppointments,
      medications,
      pendingMedLogs,
      pinnedNotes,
      contacts,
      recentNotes
    ] = await Promise.all([
      // Today's appointments
      prisma.appointment.findMany({
        where: {
          userId: user.id,
          startAt: { gte: today, lt: tomorrow },
        },
        orderBy: { startAt: 'asc' },
      }),
      // Next 7 days appointments
      prisma.appointment.findMany({
        where: {
          userId: user.id,
          startAt: { gte: tomorrow },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
      }),
      // Active medications
      prisma.medication.findMany({
        where: { userId: user.id, isActive: true },
        include: {
          logs: {
            where: {
              scheduledAt: { gte: today, lt: tomorrow },
            },
            orderBy: { scheduledAt: 'asc' },
          },
        },
      }),
      // Today's pending med logs
      prisma.medicationLog.count({
        where: {
          medication: { userId: user.id },
          scheduledAt: { gte: today, lt: tomorrow },
          status: 'PENDING',
        },
      }),
      // Pinned notes
      prisma.note.findMany({
        where: { userId: user.id, isPinned: true },
        take: 5,
      }),
      // Contact count
      prisma.contact.count({ where: { userId: user.id } }),
      // Recent notes
      prisma.note.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 3,
      }),
    ]);

    // Stats
    const stats = {
      todayAppointments: todayAppointments.length,
      pendingMeds: pendingMedLogs,
      activeMeds: medications.length,
      totalContacts: contacts,
    };

    res.render('admin/dashboard', {
      token: res.locals.token,
      basePath,
      branding,
      user,
      stats,
      todayAppointments,
      upcomingAppointments,
      medications,
      pinnedNotes,
      recentNotes,
    });
  } catch (err) {
    logger.error({ err }, 'Dashboard error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load dashboard', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// APPOINTMENTS (Calendar)
// ============================================
router.get('/appointments', async (req, res) => {
  try {
    const branding = await getBranding();
    const user = await getDemoUser();
    if (!user) {
      return res.render('admin/error', { error: 'No user found', token: res.locals.token, basePath, branding });
    }

    const category = req.query.category as string;
    const where: Record<string, unknown> = { userId: user.id };
    if (category && category !== 'all') {
      where.category = category;
    }

    let appointments = await prisma.appointment.findMany({
      where,
      orderBy: { startAt: 'asc' },
    });

    // Add sample data if no appointments exist
    if (appointments.length === 0 && (!category || category === 'all')) {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
      const nextMonth = new Date(today); nextMonth.setDate(today.getDate() + 14);

      const sampleAppointments = [
        { id: 'appt-1', title: 'Dr. Smith - Annual Checkup', description: 'Annual physical examination', category: 'DOCTOR', location: '123 Medical Center Dr, Suite 200', startAt: new Date(tomorrow.setHours(10, 0, 0, 0)), notes: 'Bring insurance card and medication list', reminders: '[{"type":"push","minutesBefore":1440}]', userId: user.id },
        { id: 'appt-2', title: 'Car Oil Change', description: 'Regular maintenance', category: 'VEHICLE', location: 'Auto Care Center, 456 Main St', startAt: new Date(tomorrow.setHours(14, 0, 0, 0)), notes: 'Ask about tire rotation', reminders: '[{"type":"push","minutesBefore":1440}]', userId: user.id },
        { id: 'appt-3', title: 'Lunch with Mary', description: 'Catching up with old friend', category: 'SOCIAL', location: 'Olive Garden, 789 Restaurant Row', startAt: new Date(nextWeek.setHours(12, 0, 0, 0)), notes: null, reminders: '[{"type":"push","minutesBefore":60}]', userId: user.id },
        { id: 'appt-4', title: 'Bank - Review Investments', description: 'Quarterly portfolio review', category: 'FINANCE', location: 'First National Bank, Downtown', startAt: new Date(nextWeek.setHours(15, 30, 0, 0)), notes: 'Bring latest statements', reminders: '[{"type":"push","minutesBefore":1440}]', userId: user.id },
        { id: 'appt-5', title: 'Dentist Cleaning', description: 'Regular dental cleaning', category: 'DOCTOR', location: 'Bright Smiles Dental, 321 Health Ave', startAt: new Date(nextMonth.setHours(9, 0, 0, 0)), notes: null, reminders: '[{"type":"push","minutesBefore":1440}]', userId: user.id },
        { id: 'appt-6', title: 'Grandkids Birthday Party', description: 'Tommy turns 8!', category: 'SOCIAL', location: '555 Family Lane', startAt: new Date(nextMonth.setHours(14, 0, 0, 0)), notes: 'Bring wrapped gift from closet', reminders: '[{"type":"push","minutesBefore":1440}]', userId: user.id },
      ];

      // Insert sample data into DB
      for (const appt of sampleAppointments) {
        try {
          await prisma.appointment.create({ data: appt });
        } catch {
          // Ignore if already exists
        }
      }

      appointments = await prisma.appointment.findMany({
        where: { userId: user.id },
        orderBy: { startAt: 'asc' },
      });
    }

    // Parse reminders JSON
    const appointmentsParsed = appointments.map(a => ({
      ...a,
      reminders: JSON.parse(a.reminders),
      recurrence: a.recurrence ? JSON.parse(a.recurrence) : null,
    }));

    res.render('admin/appointments', {
      token: res.locals.token,
      basePath,
      branding,
      appointments: appointmentsParsed,
      total: appointments.length,
      currentCategory: category || 'all',
      categories: ['DOCTOR', 'VEHICLE', 'PERSONAL', 'FINANCE', 'SOCIAL', 'OTHER'],
    });
  } catch (err) {
    logger.error({ err }, 'Appointments error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load appointments', token: res.locals.token, basePath, branding });
  }
});

// Get single appointment
router.get('/appointments/:id', async (req, res) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
    });
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }
    res.json({ success: true, appointment });
  } catch (err) {
    logger.error({ err }, 'Get appointment error');
    res.status(500).json({ success: false, error: 'Failed to get appointment' });
  }
});

// Create appointment
router.post('/appointments', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) {
      return res.status(400).json({ success: false, error: 'No user found' });
    }

    const { title, description, category, location, startAt, endAt, allDay, notes, reminders } = req.body;

    const appointment = await prisma.appointment.create({
      data: {
        title,
        description: description || null,
        category: category || 'OTHER',
        location: location || null,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        allDay: allDay === true || allDay === 'true',
        notes: notes || null,
        reminders: JSON.stringify(reminders || [{ type: 'push', minutesBefore: 1440 }]),
        userId: user.id,
      },
    });

    res.json({ success: true, appointment });
  } catch (err) {
    logger.error({ err }, 'Create appointment error');
    res.status(500).json({ success: false, error: 'Failed to create appointment' });
  }
});

// Update appointment
router.put('/appointments/:id', async (req, res) => {
  try {
    const { title, description, category, location, startAt, endAt, allDay, notes, reminders } = req.body;

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        title,
        description: description || null,
        category: category || 'OTHER',
        location: location || null,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        allDay: allDay === true || allDay === 'true',
        notes: notes || null,
        reminders: reminders ? JSON.stringify(reminders) : undefined,
      },
    });

    res.json({ success: true, appointment });
  } catch (err) {
    logger.error({ err }, 'Update appointment error');
    res.status(500).json({ success: false, error: 'Failed to update appointment' });
  }
});

// Delete appointment
router.delete('/appointments/:id', async (req, res) => {
  try {
    await prisma.appointment.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete appointment error');
    res.status(500).json({ success: false, error: 'Failed to delete appointment' });
  }
});

// Bulk delete appointments
router.post('/appointments/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No appointment IDs provided' });
    }

    await prisma.appointment.deleteMany({
      where: { id: { in: ids } },
    });

    res.json({ success: true, deleted: ids.length });
  } catch (err) {
    logger.error({ err }, 'Bulk delete appointments error');
    res.status(500).json({ success: false, error: 'Failed to delete appointments' });
  }
});

// ============================================
// MEDICATIONS
// ============================================
router.get('/medications', async (req, res) => {
  try {
    const branding = await getBranding();
    const user = await getDemoUser();
    if (!user) {
      return res.render('admin/error', { error: 'No user found', token: res.locals.token, basePath, branding });
    }

    const showInactive = req.query.inactive === 'true';
    const medications = await prisma.medication.findMany({
      where: {
        userId: user.id,
        ...(showInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      include: {
        logs: {
          orderBy: { scheduledAt: 'desc' },
          take: 7,
        },
      },
    });

    // Parse schedule JSON
    const medicationsParsed = medications.map(m => ({
      ...m,
      schedule: JSON.parse(m.schedule),
    }));

    res.render('admin/medications', {
      token: res.locals.token,
      basePath,
      branding,
      medications: medicationsParsed,
      total: medications.length,
      showInactive,
    });
  } catch (err) {
    logger.error({ err }, 'Medications error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load medications', token: res.locals.token, basePath, branding });
  }
});

// Create medication
router.post('/medications', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) {
      return res.status(400).json({ success: false, error: 'No user found' });
    }

    const { name, form, dosage, instructions, prescribedBy, pharmacy, schedule, refillReminder } = req.body;

    const medication = await prisma.medication.create({
      data: {
        name,
        form: form || 'PILL',
        dosage: dosage || null,
        instructions: instructions || null,
        prescribedBy: prescribedBy || null,
        pharmacy: pharmacy || null,
        schedule: JSON.stringify(schedule || { times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
        refillReminder: refillReminder !== false,
        userId: user.id,
      },
    });

    res.json({ success: true, medication });
  } catch (err) {
    logger.error({ err }, 'Create medication error');
    res.status(500).json({ success: false, error: 'Failed to create medication' });
  }
});

// Mark medication taken/missed
router.post('/medications/:id/log', async (req, res) => {
  try {
    const { status, scheduledAt } = req.body;

    // Find or create the log entry
    const existingLog = await prisma.medicationLog.findFirst({
      where: {
        medicationId: req.params.id,
        scheduledAt: new Date(scheduledAt),
      },
    });

    if (existingLog) {
      await prisma.medicationLog.update({
        where: { id: existingLog.id },
        data: {
          status,
          takenAt: status === 'TAKEN' ? new Date() : null,
        },
      });
    } else {
      await prisma.medicationLog.create({
        data: {
          medicationId: req.params.id,
          scheduledAt: new Date(scheduledAt),
          status,
          takenAt: status === 'TAKEN' ? new Date() : null,
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Log medication error');
    res.status(500).json({ success: false, error: 'Failed to log medication' });
  }
});

// Toggle medication active status
router.put('/medications/:id/toggle', async (req, res) => {
  try {
    const med = await prisma.medication.findUnique({ where: { id: req.params.id } });
    if (!med) {
      return res.status(404).json({ success: false, error: 'Medication not found' });
    }

    await prisma.medication.update({
      where: { id: req.params.id },
      data: { isActive: !med.isActive },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Toggle medication error');
    res.status(500).json({ success: false, error: 'Failed to toggle medication' });
  }
});

// Delete medication
router.delete('/medications/:id', async (req, res) => {
  try {
    await prisma.medication.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete medication error');
    res.status(500).json({ success: false, error: 'Failed to delete medication' });
  }
});

// ============================================
// CONTACTS
// ============================================
router.get('/contacts', async (req, res) => {
  try {
    const branding = await getBranding();
    const user = await getDemoUser();
    if (!user) {
      return res.render('admin/error', { error: 'No user found', token: res.locals.token, basePath, branding });
    }

    const relationship = req.query.relationship as string;
    const where: Record<string, unknown> = { userId: user.id };
    if (relationship && relationship !== 'all') {
      where.relationship = relationship;
    }

    const contacts = await prisma.contact.findMany({
      where,
      orderBy: [{ isEmergencyContact: 'desc' }, { name: 'asc' }],
    });

    res.render('admin/contacts', {
      token: res.locals.token,
      basePath,
      branding,
      contacts,
      total: contacts.length,
      currentRelationship: relationship || 'all',
      relationships: ['FAMILY', 'DOCTOR', 'FRIEND', 'MECHANIC', 'PHARMACY', 'CAREGIVER', 'OTHER'],
    });
  } catch (err) {
    logger.error({ err }, 'Contacts error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load contacts', token: res.locals.token, basePath, branding });
  }
});

// Create contact
router.post('/contacts', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) {
      return res.status(400).json({ success: false, error: 'No user found' });
    }

    const { name, phone, email, relationship, preferredMethod, notes, isEmergencyContact } = req.body;

    const contact = await prisma.contact.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        relationship: relationship || 'OTHER',
        preferredMethod: preferredMethod || 'PHONE',
        notes: notes || null,
        isEmergencyContact: isEmergencyContact === true || isEmergencyContact === 'true',
        userId: user.id,
      },
    });

    res.json({ success: true, contact });
  } catch (err) {
    logger.error({ err }, 'Create contact error');
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/contacts/:id', async (req, res) => {
  try {
    const { name, phone, email, relationship, preferredMethod, notes, isEmergencyContact } = req.body;

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        name,
        phone: phone || null,
        email: email || null,
        relationship: relationship || 'OTHER',
        preferredMethod: preferredMethod || 'PHONE',
        notes: notes || null,
        isEmergencyContact: isEmergencyContact === true || isEmergencyContact === 'true',
      },
    });

    res.json({ success: true, contact });
  } catch (err) {
    logger.error({ err }, 'Update contact error');
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/contacts/:id', async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete contact error');
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

// ============================================
// NOTES
// ============================================
router.get('/notes', async (req, res) => {
  try {
    const branding = await getBranding();
    const user = await getDemoUser();
    if (!user) {
      return res.render('admin/error', { error: 'No user found', token: res.locals.token, basePath, branding });
    }

    const category = req.query.category as string;
    const where: Record<string, unknown> = { userId: user.id };
    if (category && category !== 'all') {
      where.category = category;
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
    });

    // Parse tags JSON
    const notesParsed = notes.map(n => ({
      ...n,
      tags: JSON.parse(n.tags),
    }));

    res.render('admin/notes', {
      token: res.locals.token,
      basePath,
      branding,
      notes: notesParsed,
      total: notes.length,
      currentCategory: category || 'all',
      categories: ['HEALTH', 'HOME', 'FINANCE', 'FAMILY', 'EMERGENCY', 'GENERAL'],
    });
  } catch (err) {
    logger.error({ err }, 'Notes error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load notes', token: res.locals.token, basePath, branding });
  }
});

// Create note
router.post('/notes', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) {
      return res.status(400).json({ success: false, error: 'No user found' });
    }

    const { title, body, category, isPinned, tags } = req.body;

    const note = await prisma.note.create({
      data: {
        title: title || null,
        body,
        category: category || 'GENERAL',
        isPinned: isPinned === true || isPinned === 'true',
        tags: JSON.stringify(tags || []),
        userId: user.id,
      },
    });

    res.json({ success: true, note });
  } catch (err) {
    logger.error({ err }, 'Create note error');
    res.status(500).json({ success: false, error: 'Failed to create note' });
  }
});

// Update note
router.put('/notes/:id', async (req, res) => {
  try {
    const { title, body, category, isPinned, tags } = req.body;

    const note = await prisma.note.update({
      where: { id: req.params.id },
      data: {
        title: title || null,
        body,
        category: category || 'GENERAL',
        isPinned: isPinned === true || isPinned === 'true',
        tags: tags ? JSON.stringify(tags) : undefined,
      },
    });

    res.json({ success: true, note });
  } catch (err) {
    logger.error({ err }, 'Update note error');
    res.status(500).json({ success: false, error: 'Failed to update note' });
  }
});

// Toggle note pinned status
router.put('/notes/:id/pin', async (req, res) => {
  try {
    const note = await prisma.note.findUnique({ where: { id: req.params.id } });
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    await prisma.note.update({
      where: { id: req.params.id },
      data: { isPinned: !note.isPinned },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Pin note error');
    res.status(500).json({ success: false, error: 'Failed to pin note' });
  }
});

// Delete note
router.delete('/notes/:id', async (req, res) => {
  try {
    await prisma.note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete note error');
    res.status(500).json({ success: false, error: 'Failed to delete note' });
  }
});

// ============================================
// SETTINGS (3 tabs: Store Info, Branding, Payment Gateways)
// ============================================
router.get('/settings', async (req, res) => {
  try {
    const branding = await getBranding();
    const storeInfo = await prisma.storeInfo.findFirst();
    const paymentSettings = await prisma.paymentSettings.findFirst();

    // Combine all settings for the view
    const settings = {
      // Store Info
      businessName: storeInfo?.businessName || 'Boomer AI',
      tagline: storeInfo?.tagline || '',
      description: storeInfo?.description || '',
      address: storeInfo?.address || '',
      phone: storeInfo?.phone || '',
      email: storeInfo?.email || '',
      website: storeInfo?.website || '',
      businessHours: storeInfo?.businessHours || '',
      timezone: storeInfo?.timezone || 'America/New_York',
      // Branding
      logoUrl: branding?.logoUrl || '',
      faviconUrl: branding?.faviconUrl || '',
      primaryColor: branding?.primaryColor || '#16a34a',
      secondaryColor: branding?.secondaryColor || '#15803d',
      accentColor: branding?.accentColor || '#22c55e',
      headingFont: branding?.headingFont || 'Inter',
      bodyFont: branding?.bodyFont || 'Inter',
      // Payment Settings
      paymentsEnabled: paymentSettings?.enabled || false,
      stripeEnabled: paymentSettings?.stripeEnabled || false,
      stripePublishableKey: paymentSettings?.stripePublishableKey || '',
      stripeTestMode: paymentSettings?.stripeTestMode ?? true,
      paypalEnabled: paymentSettings?.paypalEnabled || false,
      paypalClientId: paymentSettings?.paypalClientId || '',
      paypalSandbox: paymentSettings?.paypalSandbox ?? true,
      squareEnabled: paymentSettings?.squareEnabled || false,
      squareAppId: paymentSettings?.squareAppId || '',
      squareSandbox: paymentSettings?.squareSandbox ?? true,
    };

    res.render('admin/settings', {
      token: res.locals.token,
      basePath,
      branding,
      settings,
    });
  } catch (err) {
    logger.error({ err }, 'Settings error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load settings', token: res.locals.token, basePath, branding });
  }
});

// Save all settings (POST)
router.post('/settings', async (req, res) => {
  try {
    const {
      // Store Info
      businessName, tagline, description, address, phone, email, website, businessHours, timezone,
      // Branding
      logoUrl, faviconUrl, primaryColor, secondaryColor, accentColor, headingFont, bodyFont,
      // Payment Settings
      paymentsEnabled, stripeEnabled, stripePublishableKey, stripeSecretKey, stripeTestMode,
      paypalEnabled, paypalClientId, paypalClientSecret, paypalSandbox,
      squareEnabled, squareAppId, squareAccessToken, squareSandbox
    } = req.body;

    // Update Store Info
    const existingStoreInfo = await prisma.storeInfo.findFirst();
    if (existingStoreInfo) {
      await prisma.storeInfo.update({
        where: { id: existingStoreInfo.id },
        data: {
          businessName: businessName || 'Boomer AI',
          tagline: tagline || '',
          description: description || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          website: website || '',
          businessHours: businessHours || '',
          timezone: timezone || 'America/New_York',
        },
      });
    } else {
      await prisma.storeInfo.create({
        data: {
          businessName: businessName || 'Boomer AI',
          tagline: tagline || '',
          description: description || '',
          address: address || '',
          phone: phone || '',
          email: email || '',
          website: website || '',
          businessHours: businessHours || '',
          timezone: timezone || 'America/New_York',
        },
      });
    }

    // Update Branding
    const existingBranding = await prisma.branding.findFirst();
    if (existingBranding) {
      await prisma.branding.update({
        where: { id: existingBranding.id },
        data: {
          logoUrl: logoUrl || '',
          faviconUrl: faviconUrl || '',
          primaryColor: primaryColor || '#16a34a',
          secondaryColor: secondaryColor || '#15803d',
          accentColor: accentColor || '#22c55e',
          headingFont: headingFont || 'Inter',
          bodyFont: bodyFont || 'Inter',
        },
      });
    } else {
      await prisma.branding.create({
        data: {
          logoUrl: logoUrl || '',
          faviconUrl: faviconUrl || '',
          primaryColor: primaryColor || '#16a34a',
          secondaryColor: secondaryColor || '#15803d',
          accentColor: accentColor || '#22c55e',
          headingFont: headingFont || 'Inter',
          bodyFont: bodyFont || 'Inter',
        },
      });
    }

    // Update Payment Settings
    const existingPayment = await prisma.paymentSettings.findFirst();
    const paymentData = {
      enabled: paymentsEnabled === true || paymentsEnabled === 'true',
      stripeEnabled: stripeEnabled === true || stripeEnabled === 'true',
      stripePublishableKey: stripePublishableKey || '',
      stripeTestMode: stripeTestMode === true || stripeTestMode === 'true',
      paypalEnabled: paypalEnabled === true || paypalEnabled === 'true',
      paypalClientId: paypalClientId || '',
      paypalSandbox: paypalSandbox === true || paypalSandbox === 'true',
      squareEnabled: squareEnabled === true || squareEnabled === 'true',
      squareAppId: squareAppId || '',
      squareSandbox: squareSandbox === true || squareSandbox === 'true',
    };

    if (existingPayment) {
      await prisma.paymentSettings.update({
        where: { id: existingPayment.id },
        data: paymentData,
      });
    } else {
      await prisma.paymentSettings.create({ data: paymentData });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update settings error');
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Update user settings (legacy)
router.post('/settings/user', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) {
      return res.status(400).json({ success: false, error: 'No user found' });
    }

    const { name, phone, timezone, accessibilitySettings, consentFlags } = req.body;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || user.name,
        phone: phone || user.phone,
        timezone: timezone || user.timezone,
        accessibilitySettings: accessibilitySettings ? JSON.stringify(accessibilitySettings) : undefined,
        consentFlags: consentFlags ? JSON.stringify(consentFlags) : undefined,
      },
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update user settings error');
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// ============================================
// FEATURES
// ============================================
router.get('/features', async (req, res) => {
  try {
    const branding = await getBranding();
    const features = await prisma.features.findFirst();

    res.render('admin/features', {
      token: res.locals.token,
      basePath,
      branding,
      features: features || {},
    });
  } catch (err) {
    logger.error({ err }, 'Features error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load features', token: res.locals.token, basePath, branding });
  }
});

router.post('/features', async (req, res) => {
  try {
    const {
      faqEnabled, stickyBarEnabled, stickyBarText, stickyBarColor, stickyBarLink, stickyBarLinkText,
      liveChatEnabled, chatProvider, chatWelcomeMessage, chatAgentName, chatWidgetColor, chatPosition,
      chatShowOnMobile, chatWidgetId, chatEmbedCode,
      emailNotifications, smsNotifications, pushNotifications, orderConfirmations, marketingEmails, appointmentReminders,
      facebookUrl, twitterUrl, instagramUrl, linkedinUrl, youtubeUrl, tiktokUrl,
      shareOnFacebook, shareOnTwitter, shareOnLinkedin, shareOnWhatsapp, shareOnEmail, copyLinkButton
    } = req.body;

    const existing = await prisma.features.findFirst();
    const featuresData = {
      faqEnabled: faqEnabled === true || faqEnabled === 'true',
      stickyBarEnabled: stickyBarEnabled === true || stickyBarEnabled === 'true',
      stickyBarText: stickyBarText || '',
      stickyBarBgColor: stickyBarColor || '#16a34a',
      stickyBarLink: stickyBarLink || '',
      stickyBarLinkText: stickyBarLinkText || '',
      liveChatEnabled: liveChatEnabled === true || liveChatEnabled === 'true',
      chatProvider: chatProvider || 'builtin',
      chatWelcomeMessage: chatWelcomeMessage || 'Hi! How can we help you today?',
      chatAgentName: chatAgentName || 'Support',
      chatWidgetColor: chatWidgetColor || '#16a34a',
      chatPosition: chatPosition || 'bottom-right',
      chatShowOnMobile: chatShowOnMobile === true || chatShowOnMobile === 'true',
      chatWidgetId: chatWidgetId || '',
      chatEmbedCode: chatEmbedCode || '',
      emailNotifications: emailNotifications === true || emailNotifications === 'true',
      smsNotifications: smsNotifications === true || smsNotifications === 'true',
      pushNotifications: pushNotifications === true || pushNotifications === 'true',
      orderConfirmations: orderConfirmations === true || orderConfirmations === 'true',
      marketingEmails: marketingEmails === true || marketingEmails === 'true',
      appointmentReminders: appointmentReminders === true || appointmentReminders === 'true',
      facebookUrl: facebookUrl || '',
      twitterUrl: twitterUrl || '',
      instagramUrl: instagramUrl || '',
      linkedinUrl: linkedinUrl || '',
      youtubeUrl: youtubeUrl || '',
      tiktokUrl: tiktokUrl || '',
      shareOnFacebook: shareOnFacebook === true || shareOnFacebook === 'true',
      shareOnTwitter: shareOnTwitter === true || shareOnTwitter === 'true',
      shareOnLinkedin: shareOnLinkedin === true || shareOnLinkedin === 'true',
      shareOnWhatsapp: shareOnWhatsapp === true || shareOnWhatsapp === 'true',
      shareOnEmail: shareOnEmail === true || shareOnEmail === 'true',
      copyLinkButton: copyLinkButton === true || copyLinkButton === 'true',
    };

    if (existing) {
      await prisma.features.update({
        where: { id: existing.id },
        data: featuresData,
      });
    } else {
      await prisma.features.create({ data: featuresData });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update features error');
    res.status(500).json({ success: false, error: 'Failed to update features' });
  }
});

// ============================================
// AI AGENTS
// ============================================
router.get('/ai-agents', async (req, res) => {
  try {
    const branding = await getBranding();
    let agents = await prisma.aIAgent.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    // Use sample data if no agents exist
    if (agents.length === 0) {
      agents = [
        { id: '1', name: 'Companion Agent', description: 'Friendly daily companion for conversations and reminders', model: 'gpt-4o-realtime', voice: 'nova', isActive: true, isDefault: true },
        { id: '2', name: 'Medication Assistant', description: 'Specialized in medication reminders and health questions', model: 'gpt-4o-realtime', voice: 'alloy', isActive: true, isDefault: false },
        { id: '3', name: 'Emergency Handler', description: 'Handles urgent situations and contacts caregivers', model: 'gpt-4o', voice: 'onyx', isActive: true, isDefault: false },
        { id: '4', name: 'Appointment Scheduler', description: 'Manages calendar and appointment reminders', model: 'gpt-4o-realtime', voice: 'shimmer', isActive: false, isDefault: false },
      ] as any;
    }
    res.render('admin/ai-agents', {
      token: res.locals.token,
      basePath,
      branding,
      agents,
    });
  } catch (err) {
    logger.error({ err }, 'AI Agents error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load AI agents', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// VOICES & LANGUAGES
// ============================================
router.get('/voices', async (req, res) => {
  try {
    const branding = await getBranding();
    const config = await prisma.appConfig.findFirst();

    // Default 24 languages - all enabled
    const defaultLanguages = [
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🌐', enabled: true },
      { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文', flag: '🌐', enabled: true },
      { code: 'cs', name: 'Czech', nativeName: 'Čeština', flag: '🌐', enabled: true },
      { code: 'da', name: 'Danish', nativeName: 'Dansk', flag: '🌐', enabled: true },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🌐', enabled: true },
      { code: 'en', name: 'English', nativeName: 'English', flag: '🌐', enabled: true },
      { code: 'fi', name: 'Finnish', nativeName: 'Suomi', flag: '🌐', enabled: true },
      { code: 'fr', name: 'French', nativeName: 'Français', flag: '🌐', enabled: true },
      { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🌐', enabled: true },
      { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', flag: '🌐', enabled: true },
      { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🌐', enabled: true },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🌐', enabled: true },
      { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🌐', enabled: true },
      { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🌐', enabled: true },
      { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🌐', enabled: true },
      { code: 'no', name: 'Norwegian', nativeName: 'Norsk', flag: '🌐', enabled: true },
      { code: 'pl', name: 'Polish', nativeName: 'Polski', flag: '🌐', enabled: true },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🌐', enabled: true },
      { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🌐', enabled: true },
      { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🌐', enabled: true },
      { code: 'sv', name: 'Swedish', nativeName: 'Svenska', flag: '🌐', enabled: true },
      { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🌐', enabled: true },
      { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🌐', enabled: true },
      { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🌐', enabled: true },
    ];

    res.render('admin/voices', {
      token: res.locals.token,
      basePath,
      branding,
      selectedVoice: config?.selectedVoice || 'alloy',
      languages: defaultLanguages,
    });
  } catch (err) {
    logger.error({ err }, 'Voices error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load voices config', token: res.locals.token, basePath, branding });
  }
});

router.post('/voices/select', async (req, res) => {
  try {
    const { voice } = req.body;
    await prisma.appConfig.updateMany({
      data: { selectedVoice: voice },
    });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Voice select error');
    res.status(500).json({ success: false, error: 'Failed to update voice' });
  }
});

// ============================================
// LANGUAGES
// ============================================
router.get('/languages', async (req, res) => {
  try {
    const branding = await getBranding();
    const languages = await prisma.language.findMany({
      orderBy: { name: 'asc' },
    });
    res.render('admin/languages', {
      token: res.locals.token,
      basePath,
      branding,
      languages,
    });
  } catch (err) {
    logger.error({ err }, 'Languages error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load languages', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// WEBHOOKS
// ============================================
router.get('/webhooks', async (req, res) => {
  try {
    const branding = await getBranding();
    let webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
    });
    // Use sample data if no webhooks exist
    if (webhooks.length === 0) {
      webhooks = [
        { id: '1', name: 'Caregiver Alerts', url: 'https://hooks.example.com/caregiver', events: JSON.stringify(['medication.missed', 'emergency.triggered']), isActive: true, secret: null, createdAt: new Date(), updatedAt: new Date() },
        { id: '2', name: 'Health Tracking', url: 'https://api.healthsync.example/webhook', events: JSON.stringify(['medication.taken', 'appointment.completed']), isActive: true, secret: null, createdAt: new Date(), updatedAt: new Date() },
        { id: '3', name: 'Family Notifications', url: 'https://family-app.example/notify', events: JSON.stringify(['call.completed', 'note.created']), isActive: false, secret: null, createdAt: new Date(), updatedAt: new Date() },
      ] as any;
    }
    res.render('admin/webhooks', {
      token: res.locals.token,
      basePath,
      branding,
      webhooks,
    });
  } catch (err) {
    logger.error({ err }, 'Webhooks error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load webhooks', token: res.locals.token, basePath, branding });
  }
});

router.post('/webhooks', async (req, res) => {
  try {
    const { name, url, events, secret } = req.body;
    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        events: JSON.stringify(events || []),
        secret: secret || null,
      },
    });
    res.json({ success: true, webhook });
  } catch (err) {
    logger.error({ err }, 'Create webhook error');
    res.status(500).json({ success: false, error: 'Failed to create webhook' });
  }
});

router.delete('/webhooks/:id', async (req, res) => {
  try {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete webhook error');
    res.status(500).json({ success: false, error: 'Failed to delete webhook' });
  }
});

// ============================================
// SMS SETTINGS
// ============================================
router.get('/sms-settings', async (req, res) => {
  try {
    const branding = await getBranding();
    const settings = await prisma.sMSSettings.findFirst();
    res.render('admin/sms-settings', {
      token: res.locals.token,
      basePath,
      branding,
      settings: settings || { provider: 'twilio', enableReminders: true },
    });
  } catch (err) {
    logger.error({ err }, 'SMS Settings error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load SMS settings', token: res.locals.token, basePath, branding });
  }
});

router.post('/sms-settings', async (req, res) => {
  try {
    const { accountSid, authToken, fromNumber, enableReminders } = req.body;
    const existing = await prisma.sMSSettings.findFirst();

    if (existing) {
      await prisma.sMSSettings.update({
        where: { id: existing.id },
        data: { accountSid, authToken, fromNumber, enableReminders: enableReminders === true || enableReminders === 'true' },
      });
    } else {
      await prisma.sMSSettings.create({
        data: { provider: 'twilio', accountSid, authToken, fromNumber, enableReminders: enableReminders === true || enableReminders === 'true' },
      });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update SMS settings error');
    res.status(500).json({ success: false, error: 'Failed to update SMS settings' });
  }
});

// ============================================
// MICROSOFT TEAMS INTEGRATION
// ============================================
router.get('/teams', async (req, res) => {
  try {
    const branding = await getBranding();

    // Check if Teams is configured
    const teamsConfig = {
      connected: !!(process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      tenantId: process.env.MICROSOFT_TENANT_ID ? '****' + process.env.MICROSOFT_TENANT_ID.slice(-4) : '',
      clientId: process.env.MICROSOFT_CLIENT_ID ? '****' + process.env.MICROSOFT_CLIENT_ID.slice(-4) : '',
    };

    // Get upcoming appointments that could be linked to Teams
    const appointments = await prisma.appointment.findMany({
      where: {
        startAt: { gte: new Date() },
      },
      orderBy: { startAt: 'asc' },
      take: 50,
    });

    // For now, meetings and subscriptions are empty until we implement Teams meeting storage
    const meetings: Array<{
      id: string;
      subject: string;
      participantName: string;
      participantEmail: string;
      startDateTime: string;
      duration: number;
      status: string;
      joinUrl: string;
    }> = [];
    const subscriptions: Array<{
      id: string;
      resource: string;
      changeType: string;
      expirationDateTime: string;
    }> = [];

    const stats = {
      scheduledMeetings: meetings.length,
      activeSubscriptions: subscriptions.length,
    };

    res.render('admin/teams', {
      token: res.locals.token,
      basePath,
      branding,
      teamsConfig,
      meetings,
      subscriptions,
      appointments,
      stats,
    });
  } catch (err) {
    logger.error({ err }, 'Teams page error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load Teams integration', token: res.locals.token, basePath, branding });
  }
});

router.get('/teams/test-connection', async (req, res) => {
  try {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      return res.json({
        success: false,
        error: 'Microsoft Graph API credentials not configured',
      });
    }

    // Try to get a token
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (response.ok) {
      res.json({ success: true, message: 'Connected to Microsoft Graph API' });
    } else {
      const error = await response.json();
      res.json({ success: false, error: error.error_description || 'Authentication failed' });
    }
  } catch (err) {
    logger.error({ err }, 'Teams test connection error');
    res.json({ success: false, error: 'Connection test failed' });
  }
});

// ============================================
// AI TOOLS
// ============================================
router.get('/ai-tools', async (req, res) => {
  try {
    const branding = await getBranding();
    const sampleTools = [
      { id: '1', name: 'get_appointments', description: 'Retrieve upcoming appointments for the user', enabled: true },
      { id: '2', name: 'get_medications', description: 'List medications and their schedules', enabled: true },
      { id: '3', name: 'add_reminder', description: 'Create a new reminder for the user', enabled: true },
      { id: '4', name: 'call_contact', description: 'Initiate a call to a contact', enabled: true },
      { id: '5', name: 'send_sms', description: 'Send an SMS message to a contact', enabled: false },
    ];
    res.render('admin/ai-tools', {
      token: res.locals.token,
      basePath,
      branding,
      tools: sampleTools,
    });
  } catch (err) {
    logger.error({ err }, 'AI Tools error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load AI tools', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// LOGIC RULES
// ============================================
router.get('/logic-rules', async (req, res) => {
  try {
    const branding = await getBranding();
    const sampleRules = [
      { id: '1', name: 'Medication Reminder', condition: 'time == medication.scheduledTime', action: 'send_reminder', enabled: true },
      { id: '2', name: 'Emergency Contact', condition: 'user.says("emergency") || user.says("help")', action: 'call_emergency_contact', enabled: true },
      { id: '3', name: 'Appointment Reminder', condition: 'appointment.time - now() < 1 hour', action: 'remind_appointment', enabled: true },
      { id: '4', name: 'After Hours', condition: 'currentHour < 8 || currentHour > 20', action: 'play_after_hours_greeting', enabled: false },
    ];
    res.render('admin/logic-rules', {
      token: res.locals.token,
      basePath,
      branding,
      rules: sampleRules,
    });
  } catch (err) {
    logger.error({ err }, 'Logic Rules error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load logic rules', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// FUNCTIONS
// ============================================
router.get('/functions', async (req, res) => {
  try {
    const branding = await getBranding();
    const sampleFunctions = [
      { id: '1', name: 'get_weather', returnType: 'object', description: 'Fetch current weather for a location', isActive: true },
      { id: '2', name: 'read_calendar', returnType: 'object', description: 'Read appointments from user calendar', isActive: true },
      { id: '3', name: 'format_time', returnType: 'string', description: 'Format time for voice output (e.g., "3 PM")', isActive: true },
      { id: '4', name: 'calculate_medication_time', returnType: 'string', description: 'Calculate next medication dose time', isActive: true },
      { id: '5', name: 'send_alert', returnType: 'void', description: 'Send alert to caregiver or emergency contact', isActive: false },
    ];
    res.render('admin/functions', {
      token: res.locals.token,
      basePath,
      branding,
      functions: sampleFunctions,
    });
  } catch (err) {
    logger.error({ err }, 'Functions error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load functions', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// PAYMENTS
// ============================================
router.get('/payments', async (req, res) => {
  try {
    const branding = await getBranding();
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const subscriptions = await prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Calculate total revenue
    const totalRevenue = payments
      .filter(p => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0);

    res.render('admin/payments', {
      token: res.locals.token,
      basePath,
      branding,
      payments,
      subscriptions,
      totalRevenue,
      totalPayments: payments.length,
      activeSubscriptions: subscriptions.filter(s => s.status === 'ACTIVE').length,
    });
  } catch (err) {
    logger.error({ err }, 'Payments error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load payments', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// PAYMENT SETTINGS
// ============================================
router.get('/payment-settings', async (req, res) => {
  try {
    const branding = await getBranding();
    const config = await prisma.appConfig.findFirst();

    // Parse payment settings from config or use defaults
    const settings = {
      paymentGatewayEnabled: config?.paymentGatewayEnabled ?? false,
      stripeEnabled: config?.stripeEnabled ?? false,
      stripePublishableKey: config?.stripePublishableKey ?? '',
      stripeSecretKey: config?.stripeSecretKey ?? '',
      stripeTestMode: config?.stripeTestMode ?? true,
      stripeAchEnabled: config?.stripeAchEnabled ?? false,
      braintreeEnabled: config?.braintreeEnabled ?? false,
      braintreeMerchantId: config?.braintreeMerchantId ?? '',
      braintreePublicKey: config?.braintreePublicKey ?? '',
      braintreePrivateKey: config?.braintreePrivateKey ?? '',
      braintreeSandbox: config?.braintreeSandbox ?? true,
      paypalEnabled: config?.paypalEnabled ?? false,
      paypalClientId: config?.paypalClientId ?? '',
      paypalClientSecret: config?.paypalClientSecret ?? '',
      paypalSandbox: config?.paypalSandbox ?? true,
    };

    res.render('admin/payment-settings', {
      token: res.locals.token,
      basePath,
      branding,
      settings,
    });
  } catch (err) {
    logger.error({ err }, 'Payment Settings error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load payment settings', token: res.locals.token, basePath, branding });
  }
});

router.post('/payment-settings', async (req, res) => {
  try {
    const {
      paymentGatewayEnabled,
      stripeEnabled,
      stripePublishableKey,
      stripeSecretKey,
      stripeTestMode,
      stripeAchEnabled,
      braintreeEnabled,
      braintreeMerchantId,
      braintreePublicKey,
      braintreePrivateKey,
      braintreeSandbox,
      paypalEnabled,
      paypalClientId,
      paypalClientSecret,
      paypalSandbox,
      squareEnabled,
      squareAppId,
      squareAccessToken,
      squareLocationId,
      squareSandbox,
      authorizeEnabled,
      authorizeApiLoginId,
      authorizeTransactionKey,
      authorizeSignatureKey,
      authorizeTestMode,
    } = req.body;

    const existing = await prisma.appConfig.findFirst();

    const updateData = {
      paymentGatewayEnabled: paymentGatewayEnabled === true || paymentGatewayEnabled === 'true',
      stripeEnabled: stripeEnabled === true || stripeEnabled === 'true',
      stripePublishableKey: stripePublishableKey || null,
      stripeSecretKey: stripeSecretKey || null,
      stripeTestMode: stripeTestMode === true || stripeTestMode === 'true',
      stripeAchEnabled: stripeAchEnabled === true || stripeAchEnabled === 'true',
      braintreeEnabled: braintreeEnabled === true || braintreeEnabled === 'true',
      braintreeMerchantId: braintreeMerchantId || null,
      braintreePublicKey: braintreePublicKey || null,
      braintreePrivateKey: braintreePrivateKey || null,
      braintreeSandbox: braintreeSandbox === true || braintreeSandbox === 'true',
      paypalEnabled: paypalEnabled === true || paypalEnabled === 'true',
      paypalClientId: paypalClientId || null,
      paypalClientSecret: paypalClientSecret || null,
      paypalSandbox: paypalSandbox === true || paypalSandbox === 'true',
      squareEnabled: squareEnabled === true || squareEnabled === 'true',
      squareAppId: squareAppId || null,
      squareAccessToken: squareAccessToken || null,
      squareLocationId: squareLocationId || null,
      squareSandbox: squareSandbox === true || squareSandbox === 'true',
      authorizeEnabled: authorizeEnabled === true || authorizeEnabled === 'true',
      authorizeApiLoginId: authorizeApiLoginId || null,
      authorizeTransactionKey: authorizeTransactionKey || null,
      authorizeSignatureKey: authorizeSignatureKey || null,
      authorizeTestMode: authorizeTestMode === true || authorizeTestMode === 'true',
    };

    if (existing) {
      await prisma.appConfig.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      await prisma.appConfig.create({
        data: updateData,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update payment settings error');
    res.status(500).json({ success: false, error: 'Failed to update payment settings' });
  }
});

// ============================================
// ANALYTICS
// ============================================
router.get('/analytics', async (req, res) => {
  try {
    const branding = await getBranding();
    const days = parseInt(req.query.days as string) || 30;

    const [
      userCount,
      appointmentCount,
      medicationCount,
      contactCount,
      noteCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.appointment.count(),
      prisma.medication.count(),
      prisma.contact.count(),
      prisma.note.count(),
    ]);

    res.render('admin/analytics', {
      token: res.locals.token,
      basePath,
      branding,
      days,
      stats: {
        users: userCount,
        appointments: appointmentCount,
        medications: medicationCount,
        contacts: contactCount,
        notes: noteCount,
        // Legacy recruiting stats for backwards compatibility with view
        totalInterviews: 0,
        completedInterviews: 0,
        completionRate: 0,
        averageScore: 0,
      },
      // Provide empty arrays for charts - can be populated later
      appointmentsByDay: [],
      medicationAdherence: [],
      voiceSessionsByDay: [],
      // Legacy recruiting variables for backwards compatibility with view
      byJobRole: [],
      byMode: [],
      byRecommendation: [],
      topCandidates: [],
      recentInterviews: [],
      recentCompleted: [],
    });
  } catch (err) {
    logger.error({ err }, 'Analytics error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load analytics', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// DEALERSHIP
// ============================================
router.get('/dealership', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/dealership', {
      token: res.locals.token,
      basePath,
      branding,
      dealership: {
        name: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        hours: '',
      },
    });
  } catch (err) {
    logger.error({ err }, 'Dealership error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load dealership', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// GREETING
// ============================================
router.get('/greeting', async (req, res) => {
  try {
    const branding = await getBranding();
    // Default greetings - can be stored in DB when model is extended
    res.render('admin/greeting', {
      token: res.locals.token,
      basePath,
      branding,
      greeting: 'Hello! Welcome to our service. How can I help you today?',
      afterHoursGreeting: 'Thank you for calling. We are currently closed.',
    });
  } catch (err) {
    logger.error({ err }, 'Greeting error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load greeting', token: res.locals.token, basePath, branding });
  }
});

router.post('/greeting', async (req, res) => {
  try {
    // TODO: Store greeting in database when model is extended
    res.redirect(`${basePath}/admin/greeting?token=${res.locals.token}`);
  } catch (err) {
    logger.error({ err }, 'Greeting save error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to save greeting', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// VEHICLES
// ============================================
router.get('/vehicles', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/vehicles', {
      token: res.locals.token,
      basePath,
      branding,
      vehicles: [],
    });
  } catch (err) {
    logger.error({ err }, 'Vehicles error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load vehicles', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// TECHNIQUES
// ============================================
router.get('/techniques', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/techniques', {
      token: res.locals.token,
      basePath,
      branding,
      techniques: [],
    });
  } catch (err) {
    logger.error({ err }, 'Techniques error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load techniques', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// DISCOVERY QUESTIONS
// ============================================
router.get('/discovery', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/discovery', {
      token: res.locals.token,
      basePath,
      branding,
      questions: [],
    });
  } catch (err) {
    logger.error({ err }, 'Discovery error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load discovery questions', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// CLOSING
// ============================================
router.get('/closing', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/closing', {
      token: res.locals.token,
      basePath,
      branding,
      closingTechniques: [],
    });
  } catch (err) {
    logger.error({ err }, 'Closing error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load closing techniques', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// OBJECTIONS
// ============================================
router.get('/objections', async (req, res) => {
  try {
    const branding = await getBranding();
    res.render('admin/objections', {
      token: res.locals.token,
      basePath,
      branding,
      objections: [],
    });
  } catch (err) {
    logger.error({ err }, 'Objections error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load objections', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// AI CONFIG
// ============================================
router.get('/ai-config', async (req, res) => {
  try {
    const branding = await getBranding();
    const config = await prisma.appConfig.findFirst();
    res.render('admin/ai-config', {
      token: res.locals.token,
      basePath,
      branding,
      config: config || {
        model: 'gpt-4o-realtime-preview',
        temperature: 0.8,
        maxTokens: 4096,
        systemPrompt: '',
      },
    });
  } catch (err) {
    logger.error({ err }, 'AI Config error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load AI config', token: res.locals.token, basePath, branding });
  }
});

// ============================================
// KNOWLEDGE BASE
// ============================================

// Sample documents data for demo
const sampleKBDocuments = [
  {
    id: 'kb-1',
    name: 'Medication Management Guide',
    type: 'pdf',
    size: '1.8 MB',
    status: 'processed',
    languageCode: 'en',
    languageFlag: '🇺🇸',
    description: 'Guide for safely managing daily medications and understanding prescriptions.',
    createdAt: new Date('2024-11-15'),
    content: 'This guide covers medication schedules, pill organization, understanding dosages, and what to do if you miss a dose...',
  },
  {
    id: 'kb-2',
    name: 'Emergency Contact Procedures',
    type: 'doc',
    size: '245 KB',
    status: 'processed',
    languageCode: 'en',
    languageFlag: '🇺🇸',
    description: 'Step-by-step emergency procedures and important contact information.',
    createdAt: new Date('2024-11-10'),
    content: 'In case of emergency, follow these steps: 1. Stay calm 2. Call 911 if life-threatening 3. Contact family members...',
  },
  {
    id: 'kb-3',
    name: 'Daily Health Tips for Seniors',
    type: 'txt',
    size: '56 KB',
    status: 'processed',
    languageCode: 'en',
    languageFlag: '🇺🇸',
    description: 'Simple daily health routines and wellness tips.',
    createdAt: new Date('2024-11-08'),
    content: 'Start each day with a glass of water. Take medications at the same time daily. Go for a short walk...',
  },
  {
    id: 'kb-4',
    name: 'Medicare Benefits Overview',
    type: 'url',
    size: '—',
    status: 'processed',
    languageCode: 'en',
    languageFlag: '🇺🇸',
    description: 'Understanding Medicare coverage and benefits.',
    createdAt: new Date('2024-11-05'),
    content: 'Medicare provides health insurance coverage for people 65 and older. Part A covers hospital stays...',
  },
  {
    id: 'kb-5',
    name: 'Family Contact List',
    type: 'txt',
    size: '12 KB',
    status: 'processed',
    languageCode: 'en',
    languageFlag: '🇺🇸',
    description: 'Important family member contact information.',
    createdAt: new Date('2024-11-01'),
    content: 'Daughter Sarah: 555-123-4567, Son Michael: 555-987-6543, Dr. Smith: 555-456-7890...',
  },
  {
    id: 'kb-6',
    name: 'Guia de Medicamentos',
    type: 'pdf',
    size: '1.5 MB',
    status: 'processed',
    languageCode: 'es',
    languageFlag: '🇪🇸',
    description: 'Spanish language medication guide for proper medication management.',
    createdAt: new Date('2024-10-28'),
    content: 'Esta guia cubre los horarios de medicamentos, organizacion de pastillas...',
  },
];

const defaultLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
];

router.get('/knowledge-base', async (req, res) => {
  try {
    const branding = await getBranding();
    const languageFilter = req.query.language as string;

    // Filter documents by language if specified
    let documents = sampleKBDocuments;
    if (languageFilter) {
      documents = documents.filter(d => d.languageCode === languageFilter);
    }

    // Calculate stats
    const totalSizeBytes = documents.reduce((sum, d) => {
      const match = d.size.match(/^([\d.]+)\s*(KB|MB|GB)?$/);
      if (!match) return sum;
      const num = parseFloat(match[1]);
      const unit = match[2] || 'B';
      const multiplier = unit === 'GB' ? 1e9 : unit === 'MB' ? 1e6 : unit === 'KB' ? 1e3 : 1;
      return sum + num * multiplier;
    }, 0);

    const totalSize = totalSizeBytes > 1e6
      ? `${(totalSizeBytes / 1e6).toFixed(1)} MB`
      : `${(totalSizeBytes / 1e3).toFixed(0)} KB`;

    const uniqueLanguages = [...new Set(sampleKBDocuments.map(d => d.languageCode))];

    res.render('admin/knowledge-base', {
      token: res.locals.token,
      basePath,
      branding,
      documents,
      totalSize,
      languageCount: uniqueLanguages.length,
      languages: defaultLanguages.filter(l => uniqueLanguages.includes(l.code)),
      currentLanguage: languageFilter || null,
    });
  } catch (err) {
    logger.error({ err }, 'Knowledge Base error');
    const branding = await getBranding();
    res.render('admin/error', { error: 'Failed to load knowledge base', token: res.locals.token, basePath, branding });
  }
});

// Get single document
router.get('/knowledge-base/:id', async (req, res) => {
  try {
    const doc = sampleKBDocuments.find(d => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    res.json({ success: true, document: doc });
  } catch (err) {
    logger.error({ err }, 'Get KB document error');
    res.status(500).json({ success: false, error: 'Failed to get document' });
  }
});

// Upload files (placeholder)
router.post('/knowledge-base/upload', async (req, res) => {
  try {
    // In production, handle file upload with multer
    res.json({ success: true, message: 'Files uploaded successfully' });
  } catch (err) {
    logger.error({ err }, 'KB upload error');
    res.status(500).json({ success: false, error: 'Failed to upload files' });
  }
});

// Add URL
router.post('/knowledge-base/url', async (req, res) => {
  try {
    const { url, name, language, description } = req.body;
    // In production, fetch and process the URL
    res.json({ success: true, message: 'URL added successfully' });
  } catch (err) {
    logger.error({ err }, 'KB add URL error');
    res.status(500).json({ success: false, error: 'Failed to add URL' });
  }
});

// Delete document
router.delete('/knowledge-base/:id', async (req, res) => {
  try {
    // In production, delete from database
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'KB delete error');
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
});

// Reprocess document
router.post('/knowledge-base/:id/reprocess', async (req, res) => {
  try {
    // In production, reprocess the document
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'KB reprocess error');
    res.status(500).json({ success: false, error: 'Failed to reprocess document' });
  }
});

// Bulk delete
router.post('/knowledge-base/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    // In production, delete from database
    res.json({ success: true, deleted: ids?.length || 0 });
  } catch (err) {
    logger.error({ err }, 'KB bulk delete error');
    res.status(500).json({ success: false, error: 'Failed to delete documents' });
  }
});

// Bulk reprocess
router.post('/knowledge-base/bulk-reprocess', async (req, res) => {
  try {
    const { ids } = req.body;
    // In production, reprocess documents
    res.json({ success: true, reprocessed: ids?.length || 0 });
  } catch (err) {
    logger.error({ err }, 'KB bulk reprocess error');
    res.status(500).json({ success: false, error: 'Failed to reprocess documents' });
  }
});

// ============================================
// TRIAL CODES
// ============================================

router.get('/trial-codes', requireToken, async (req, res) => {
  const branding = await getBranding();
  res.render('admin/trial-codes', { token: req.query.token, basePath, branding });
});

router.get('/api/trial-codes', async (req, res) => {
  try {
    const codes = await prisma.trialCode.findMany({ orderBy: { createdAt: 'desc' } });
    const stats = {
      total: codes.length,
      pending: codes.filter(c => c.status === 'PENDING').length,
      redeemed: codes.filter(c => c.status === 'REDEEMED').length,
      expired: codes.filter(c => c.status === 'EXPIRED').length
    };
    res.json({ success: true, codes, stats });
  } catch (err) {
    logger.error({ err }, 'Get trial codes error');
    res.json({ success: true, codes: [], stats: { total: 0, pending: 0, redeemed: 0, expired: 0 } });
  }
});

router.post('/api/trial-codes', async (req, res) => {
  try {
    const { email, phone, trialDays = 14, expiresDays = 30 } = req.body;
    const code = 'TRIAL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    const trialCode = await prisma.trialCode.create({
      data: { code, email, phone, trialDays, expiresAt }
    });
    res.json({ success: true, code: trialCode });
  } catch (err) {
    logger.error({ err }, 'Create trial code error');
    res.status(500).json({ success: false, error: 'Failed to create trial code' });
  }
});

router.post('/api/trial-codes/:id/extend', async (req, res) => {
  try {
    const { days = 7 } = req.body;
    const code = await prisma.trialCode.findUnique({ where: { id: req.params.id } });
    if (!code) return res.status(404).json({ success: false, error: 'Code not found' });
    const newExpiry = new Date(code.expiresAt.getTime() + days * 24 * 60 * 60 * 1000);
    await prisma.trialCode.update({ where: { id: req.params.id }, data: { expiresAt: newExpiry } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Extend trial code error');
    res.status(500).json({ success: false, error: 'Failed to extend code' });
  }
});

router.post('/api/trial-codes/:id/revoke', async (req, res) => {
  try {
    await prisma.trialCode.update({ where: { id: req.params.id }, data: { status: 'REVOKED' } });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Revoke trial code error');
    res.status(500).json({ success: false, error: 'Failed to revoke code' });
  }
});

// ============================================
// ACCOUNT SETTINGS
// ============================================

router.get('/account', requireToken, async (req, res) => {
  const branding = await getBranding();
  const user = await getDemoUser();
  res.render('admin/account', {
    token: req.query.token,
    basePath,
    branding,
    user,
    userName: user?.name || 'Demo User',
    userEmail: user?.email || 'demo@boomerai.com'
  });
});

router.put('/api/account/name', async (req, res) => {
  try {
    const { name } = req.body;
    const user = await getDemoUser();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { name } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update name error');
    res.status(500).json({ success: false, error: 'Failed to update name' });
  }
});

router.put('/api/account/email', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await getDemoUser();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { email } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update email error');
    res.status(500).json({ success: false, error: 'Failed to update email' });
  }
});

router.put('/api/account/phone', async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await getDemoUser();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { phone } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update phone error');
    res.status(500).json({ success: false, error: 'Failed to update phone' });
  }
});

router.put('/api/account/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // In production, verify current password and hash new one
    const user = await getDemoUser();
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { password: newPassword } });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Update password error');
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

// ============================================
// MY SUBSCRIPTION
// ============================================

router.get('/my-subscription', requireToken, async (req, res) => {
  const branding = await getBranding();
  res.render('admin/my-subscription', { token: req.query.token, basePath, branding });
});

router.get('/api/my-subscription', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (!user) return res.json({ success: true, subscription: null });

    const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!subscription) {
      return res.json({
        success: true,
        subscription: {
          plan: { name: 'Free', price: 0, features: 'Basic features' },
          status: 'ACTIVE'
        }
      });
    }

    // Get plan details
    let plan = null;
    try {
      plan = await prisma.subscriptionPlan.findFirst({ where: { code: subscription.plan } });
    } catch (e) {
      // Plan table may not exist yet
    }

    res.json({
      success: true,
      subscription: {
        ...subscription,
        plan: plan || { name: subscription.plan, price: 0, features: 'Basic features', billingPeriod: 'monthly' }
      }
    });
  } catch (err) {
    logger.error({ err }, 'Get subscription error');
    res.json({ success: true, subscription: { plan: { name: 'Free', price: 0 }, status: 'ACTIVE' } });
  }
});

router.post('/api/subscription/cancel', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (user) {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: true }
      });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Cancel subscription error');
    res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
  }
});

router.post('/api/subscription/resume', async (req, res) => {
  try {
    const user = await getDemoUser();
    if (user) {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: { status: 'ACTIVE', cancelAtPeriodEnd: false }
      });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Resume subscription error');
    res.status(500).json({ success: false, error: 'Failed to resume subscription' });
  }
});

// ============================================
// PRICING PLANS
// ============================================

router.get('/pricing', requireToken, async (req, res) => {
  const branding = await getBranding();
  res.render('admin/pricing', { token: req.query.token, basePath, branding });
});

router.get('/api/pricing', async (req, res) => {
  try {
    let plans = [];
    try {
      plans = await prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      });
    } catch (e) {
      // Fallback if table doesn't exist
    }

    if (plans.length === 0) {
      plans = [
        { id: 'free', code: 'FREE', name: 'Free', price: 0, description: 'Basic features', features: 'Voice Commands,Basic Reminders,5 Contacts', billingPeriod: 'monthly' },
        { id: 'plus', code: 'PLUS', name: 'Plus', price: 9.99, description: 'Enhanced features', features: 'Unlimited Contacts,SMS Reminders,Caregiver Access,Priority Support', billingPeriod: 'monthly' },
        { id: 'family', code: 'FAMILY', name: 'Family', price: 19.99, description: 'For the whole family', features: 'Up to 5 Users,Shared Calendar,Family Dashboard,All Plus Features', billingPeriod: 'monthly' },
        { id: 'premium', code: 'PREMIUM', name: 'Premium', price: 29.99, description: 'All features unlocked', features: 'Unlimited Users,API Access,Custom Integrations,Dedicated Support,All Features', billingPeriod: 'monthly' }
      ];
    }

    const user = await getDemoUser();
    let currentPlanId = 'free';
    if (user) {
      const sub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      if (sub) currentPlanId = sub.plan.toLowerCase();
    }

    res.json({ success: true, plans, currentPlanId });
  } catch (err) {
    logger.error({ err }, 'Get pricing error');
    res.json({ success: true, plans: [], currentPlanId: null });
  }
});

router.post('/api/subscription/subscribe/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const user = await getDemoUser();

    // In production, this would create a Stripe checkout session
    // For now, just update the subscription
    if (user) {
      const existingSub = await prisma.subscription.findUnique({ where: { userId: user.id } });
      if (existingSub) {
        await prisma.subscription.update({
          where: { userId: user.id },
          data: { plan: planId.toUpperCase(), status: 'ACTIVE' }
        });
      } else {
        await prisma.subscription.create({
          data: { userId: user.id, plan: planId.toUpperCase(), status: 'ACTIVE' }
        });
      }
    }

    res.json({ success: true, message: 'Subscription updated' });
  } catch (err) {
    logger.error({ err }, 'Subscribe error');
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

export default router;
