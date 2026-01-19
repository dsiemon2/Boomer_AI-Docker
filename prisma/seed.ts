import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Boomer AI database...');

  // ==============================
  // ADMIN USER (Standard demo login)
  // ==============================
  const adminPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@boomerai.com' },
    update: {},
    create: {
      email: 'admin@boomerai.com',
      phone: '+15550001111',
      password: adminPassword,
      name: 'Admin User',
      timezone: 'America/New_York',
    },
  });
  console.log('Created admin user:', adminUser.email);

  // ==============================
  // MEMBER USER (Standard demo login)
  // ==============================
  const memberPassword = await bcrypt.hash('member123', 12);
  const memberUser = await prisma.user.upsert({
    where: { email: 'member@demo.com' },
    update: {},
    create: {
      email: 'member@demo.com',
      phone: '+15550002222',
      password: memberPassword,
      name: 'Demo Member',
      timezone: 'America/New_York',
    },
  });
  console.log('Created member user:', memberUser.email);

  // ==============================
  // DEMO USER (Main user with full data)
  // ==============================
  const userPassword = await bcrypt.hash('demo123', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@boomerai.com' },
    update: {},
    create: {
      email: 'demo@boomerai.com',
      phone: '+15551234567',
      password: userPassword,
      name: 'Robert Johnson',
      timezone: 'America/New_York',
      accessibilitySettings: JSON.stringify({
        largeText: true,
        highContrast: false,
        speechSpeed: 'medium',
      }),
      consentFlags: JSON.stringify({
        smsNotifications: true,
        emailNotifications: true,
        pushNotifications: true,
      }),
    },
  });
  console.log('Created demo user:', demoUser.email);

  // ==============================
  // CAREGIVER USER
  // ==============================
  const caregiverPassword = await bcrypt.hash('caregiver123', 12);
  const caregiverUser = await prisma.user.upsert({
    where: { email: 'sarah@example.com' },
    update: {},
    create: {
      email: 'sarah@example.com',
      phone: '+15559876543',
      password: caregiverPassword,
      name: 'Sarah Johnson',
      timezone: 'America/New_York',
    },
  });
  console.log('Created caregiver user:', caregiverUser.email);

  // ==============================
  // CAREGIVER ACCESS
  // ==============================
  await prisma.caregiverAccess.upsert({
    where: { userId_caregiverId: { userId: demoUser.id, caregiverId: caregiverUser.id } },
    update: {},
    create: {
      userId: demoUser.id,
      caregiverId: caregiverUser.id,
      role: 'VIEW_ONLY',
      status: 'ACTIVE',
      permissions: JSON.stringify({
        calendar: true,
        medications: true,
        contacts: true,
        notes: false,
      }),
      acceptedAt: new Date(),
    },
  });
  console.log('Created caregiver access');

  // ==============================
  // CONTACTS
  // ==============================
  const contacts = [
    {
      id: 'contact-001',
      name: 'Dr. Michael Smith',
      phone: '+15551112222',
      email: 'dr.smith@medcenter.com',
      relationship: 'DOCTOR',
      preferredMethod: 'PHONE',
      notes: 'Primary care physician',
      isEmergencyContact: false,
    },
    {
      id: 'contact-002',
      name: 'Sarah Johnson',
      phone: '+15559876543',
      email: 'sarah@example.com',
      relationship: 'FAMILY',
      preferredMethod: 'SMS',
      notes: 'Daughter - primary caregiver',
      isEmergencyContact: true,
    },
    {
      id: 'contact-003',
      name: 'Mike the Plumber',
      phone: '+15553334444',
      relationship: 'OTHER',
      preferredMethod: 'PHONE',
      notes: 'Reliable, fair prices',
    },
    {
      id: 'contact-004',
      name: 'CVS Pharmacy',
      phone: '+15555556666',
      relationship: 'PHARMACY',
      preferredMethod: 'PHONE',
      notes: 'Main Street location',
    },
    {
      id: 'contact-005',
      name: 'Tommy Johnson',
      phone: '+15557778888',
      email: 'tommy@example.com',
      relationship: 'FAMILY',
      preferredMethod: 'SMS',
      notes: 'Grandson - birthday March 15',
    },
    {
      id: 'contact-006',
      name: 'Mary Wilson',
      phone: '+15551239999',
      relationship: 'FRIEND',
      preferredMethod: 'PHONE',
      notes: 'Bridge club friend',
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: {},
      create: { ...contact, userId: demoUser.id },
    });
  }
  console.log('Created contacts');

  // ==============================
  // APPOINTMENTS
  // ==============================
  const today = new Date();
  const appointments = [
    {
      id: 'appt-001',
      title: 'Dr. Smith Checkup',
      description: 'Annual physical examination',
      category: 'DOCTOR',
      location: '123 Medical Center Dr, Suite 200',
      startAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 10, 0),
      endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 11, 0),
      notes: 'Bring insurance card and list of medications',
      reminders: JSON.stringify([
        { type: 'push', minutesBefore: 1440 },
        { type: 'sms', minutesBefore: 120 },
      ]),
    },
    {
      id: 'appt-002',
      title: 'Car Inspection',
      description: 'Annual vehicle inspection',
      category: 'VEHICLE',
      location: 'Auto Care Center, 456 Main St',
      startAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 9, 0),
      endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7, 10, 0),
      reminders: JSON.stringify([{ type: 'push', minutesBefore: 1440 }]),
    },
    {
      id: 'appt-003',
      title: 'Haircut',
      description: 'Regular haircut appointment',
      category: 'PERSONAL',
      location: "Joe's Barbershop",
      startAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 14, 0),
      endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 14, 30),
      reminders: JSON.stringify([{ type: 'push', minutesBefore: 180 }]),
    },
    {
      id: 'appt-004',
      title: 'Bridge Club',
      description: 'Weekly bridge game with friends',
      category: 'SOCIAL',
      location: 'Community Center',
      startAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 13, 0),
      endAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 16, 0),
      recurrence: JSON.stringify({ rule: 'WEEKLY', interval: 1, dayOfWeek: 3 }),
      reminders: JSON.stringify([{ type: 'push', minutesBefore: 120 }]),
    },
    {
      id: 'appt-005',
      title: 'Pay Electric Bill',
      description: 'Monthly electric bill due',
      category: 'FINANCE',
      startAt: new Date(today.getFullYear(), today.getMonth() + 1, 1, 9, 0),
      allDay: true,
      recurrence: JSON.stringify({ rule: 'MONTHLY', dayOfMonth: 1 }),
      reminders: JSON.stringify([{ type: 'push', minutesBefore: 1440 }]),
    },
  ];

  for (const appt of appointments) {
    await prisma.appointment.upsert({
      where: { id: appt.id },
      update: {},
      create: { ...appt, userId: demoUser.id },
    });
  }
  console.log('Created appointments');

  // ==============================
  // MEDICATIONS
  // ==============================
  const medications = [
    {
      id: 'med-001',
      name: 'Lisinopril',
      form: 'PILL',
      dosage: '10 mg',
      instructions: 'Take with water in the morning',
      prescribedBy: 'Dr. Smith',
      pharmacy: 'CVS Pharmacy',
      schedule: JSON.stringify({ times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      pillsRemaining: 22,
      refillReminder: true,
    },
    {
      id: 'med-002',
      name: 'Metformin',
      form: 'PILL',
      dosage: '500 mg',
      instructions: 'Take with food, twice daily',
      prescribedBy: 'Dr. Smith',
      pharmacy: 'CVS Pharmacy',
      schedule: JSON.stringify({ times: ['08:00', '20:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      pillsRemaining: 45,
      refillReminder: true,
    },
    {
      id: 'med-003',
      name: 'Vitamin D3',
      form: 'CAPSULE',
      dosage: '2000 IU',
      instructions: 'Take with breakfast',
      schedule: JSON.stringify({ times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      pillsRemaining: 60,
      refillReminder: false,
    },
    {
      id: 'med-004',
      name: 'Aspirin',
      form: 'PILL',
      dosage: '81 mg',
      instructions: 'Take with food',
      prescribedBy: 'Dr. Smith',
      schedule: JSON.stringify({ times: ['08:00'], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }),
      pillsRemaining: 90,
      refillReminder: false,
    },
  ];

  for (const med of medications) {
    await prisma.medication.upsert({
      where: { id: med.id },
      update: {},
      create: { ...med, userId: demoUser.id },
    });
  }
  console.log('Created medications');

  // ==============================
  // MEDICATION LOGS (Sample history)
  // ==============================
  const medLogs = [];
  for (let i = 0; i < 7; i++) {
    const logDate = new Date();
    logDate.setDate(logDate.getDate() - i);
    logDate.setHours(8, 0, 0, 0);

    // Morning meds
    medLogs.push({
      id: `log-lisinopril-${i}`,
      medicationId: 'med-001',
      scheduledAt: new Date(logDate),
      status: i === 0 ? 'PENDING' : 'TAKEN',
      takenAt: i === 0 ? null : new Date(logDate.getTime() + 15 * 60000),
      source: 'USER',
    });

    medLogs.push({
      id: `log-metformin-am-${i}`,
      medicationId: 'med-002',
      scheduledAt: new Date(logDate),
      status: i === 0 ? 'PENDING' : 'TAKEN',
      takenAt: i === 0 ? null : new Date(logDate.getTime() + 15 * 60000),
      source: 'USER',
    });

    // Evening Metformin
    const eveningDate = new Date(logDate);
    eveningDate.setHours(20, 0, 0, 0);
    medLogs.push({
      id: `log-metformin-pm-${i}`,
      medicationId: 'med-002',
      scheduledAt: eveningDate,
      status: i === 0 ? 'PENDING' : i === 2 ? 'MISSED' : 'TAKEN',
      takenAt: i === 0 || i === 2 ? null : new Date(eveningDate.getTime() + 30 * 60000),
      source: 'USER',
    });
  }

  for (const log of medLogs) {
    await prisma.medicationLog.upsert({
      where: { id: log.id },
      update: {},
      create: log,
    });
  }
  console.log('Created medication logs');

  // ==============================
  // NOTES
  // ==============================
  const notes = [
    {
      id: 'note-001',
      title: 'Garage Code',
      body: 'The garage door code is 4182',
      category: 'HOME',
      isPinned: true,
      tags: JSON.stringify(['important', 'codes']),
    },
    {
      id: 'note-002',
      title: 'Insurance Info',
      body: 'Medicare ID: 1EG4-TE5-MK72\nSupplemental: Blue Cross #BC123456789',
      category: 'HEALTH',
      isPinned: true,
      tags: JSON.stringify(['insurance', 'health']),
    },
    {
      id: 'note-003',
      title: 'Allergies',
      body: 'Penicillin - causes rash\nShellfish - severe reaction',
      category: 'EMERGENCY',
      isPinned: true,
      tags: JSON.stringify(['allergies', 'medical', 'emergency']),
    },
    {
      id: 'note-004',
      title: 'WiFi Password',
      body: 'Network: Johnson_Home\nPassword: Summer2024!',
      category: 'HOME',
      isPinned: false,
      tags: JSON.stringify(['wifi', 'passwords']),
    },
    {
      id: 'note-005',
      title: 'Birthday Ideas for Tommy',
      body: 'Video games\nBasketball\nGift card to GameStop',
      category: 'FAMILY',
      isPinned: false,
      tags: JSON.stringify(['birthday', 'gifts', 'tommy']),
    },
    {
      id: 'note-006',
      body: 'Remember to ask Dr. Smith about the new blood pressure medication',
      category: 'HEALTH',
      isPinned: false,
      tags: JSON.stringify(['doctor', 'questions']),
    },
  ];

  for (const note of notes) {
    await prisma.note.upsert({
      where: { id: note.id },
      update: {},
      create: { ...note, userId: demoUser.id },
    });
  }
  console.log('Created notes');

  // ==============================
  // IMPORTANT DATES
  // ==============================
  const importantDates = [
    {
      id: 'date-001',
      title: "Tommy's Birthday",
      date: new Date(today.getFullYear(), 2, 15), // March 15
      category: 'BIRTHDAY',
      isAnnual: true,
      notes: 'Grandson - 12 years old',
      reminders: JSON.stringify([
        { type: 'push', daysBefore: 7 },
        { type: 'push', daysBefore: 1 },
      ]),
    },
    {
      id: 'date-002',
      title: 'Wedding Anniversary',
      date: new Date(today.getFullYear(), 5, 20), // June 20
      category: 'ANNIVERSARY',
      isAnnual: true,
      notes: '52 years!',
    },
    {
      id: 'date-003',
      title: 'Car Registration Renewal',
      date: new Date(today.getFullYear(), 8, 1), // September 1
      category: 'RENEWAL',
      isAnnual: true,
    },
  ];

  for (const importantDate of importantDates) {
    await prisma.importantDate.upsert({
      where: { id: importantDate.id },
      update: {},
      create: { ...importantDate, userId: demoUser.id },
    });
  }
  console.log('Created important dates');

  // ==============================
  // APP CONFIG
  // ==============================
  await prisma.appConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      appName: 'Boomer AI',
      selectedVoice: 'nova',
      defaultLanguage: 'en',
      maxSessionMins: 30,
      transcriptionEnabled: true,
      defaultReminderChannels: JSON.stringify(['push', 'sms']),
      smsEnabled: true,
      emailEnabled: true,
    },
  });
  console.log('Created app config');

  // ==============================
  // AI AGENTS
  // ==============================
  const aiAgents = [
    {
      id: 'agent-assistant',
      name: 'Boomer Assistant',
      description: 'Friendly voice assistant for daily tasks',
      systemPrompt: `You are a friendly, patient voice assistant helping an older adult manage their daily life.
Speak clearly and slowly. Use simple language. Always confirm actions before executing them.
Be warm and encouraging. If the user seems confused, offer to repeat or rephrase.
You can help with: calendar appointments, medication reminders, contact information, notes, and general questions.
Always end interactions by asking if there's anything else you can help with.`,
      model: 'gpt-4o-realtime',
      voice: 'nova',
      temperature: 0.7,
      isActive: true,
      isDefault: true,
    },
    {
      id: 'agent-reminder',
      name: 'Medication Reminder',
      description: 'Gentle medication reminder voice',
      systemPrompt: `You are a gentle reminder assistant. Your job is to remind the user to take their medication.
Be warm and caring. If they say they've taken it, thank them. If they need to snooze, offer that option.
If they miss doses frequently, gently encourage them to set up caregiver notifications.`,
      model: 'gpt-4o-realtime',
      voice: 'shimmer',
      temperature: 0.5,
      isActive: true,
      isDefault: false,
    },
  ];

  for (const agent of aiAgents) {
    await prisma.aIAgent.upsert({
      where: { id: agent.id },
      update: {},
      create: agent,
    });
  }
  console.log('Created AI agents');

  // ==============================
  // LANGUAGES (24 languages, all enabled)
  // ==============================
  const languages = [
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

  for (const lang of languages) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: { enabled: true },
      create: lang,
    });
  }
  console.log('Created 24 languages (all enabled)');

  // ==============================
  // SMS SETTINGS
  // ==============================
  await prisma.sMSSettings.upsert({
    where: { id: 'sms-default' },
    update: {},
    create: {
      id: 'sms-default',
      provider: 'twilio',
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
      enableReminders: true,
      isActive: true,
    },
  });
  console.log('Created SMS settings');

  // ==============================
  // WEBHOOKS
  // ==============================
  await prisma.webhook.upsert({
    where: { id: 'webhook-caregiver' },
    update: {},
    create: {
      id: 'webhook-caregiver',
      name: 'Caregiver Alerts',
      url: 'https://example.com/webhooks/caregiver',
      events: JSON.stringify(['medication.missed', 'appointment.missed', 'emergency.triggered']),
      secret: 'webhook_secret_123',
      isActive: true,
    },
  });
  console.log('Created webhooks');

  // ==============================
  // SUBSCRIPTION
  // ==============================
  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      plan: 'FAMILY',
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('Created subscription');

  // ==============================
  // BRANDING (Green theme #16a34a)
  // ==============================
  await prisma.branding.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      logoUrl: '',
      faviconUrl: '',
      primaryColor: '#16a34a',
      secondaryColor: '#15803d',
      accentColor: '#22c55e',
      headingFont: 'Inter',
      bodyFont: 'Inter',
    },
  });
  console.log('Created branding with Green theme');

  // ==============================
  // STORE INFO
  // ==============================
  await prisma.storeInfo.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      businessName: 'Boomer AI',
      tagline: 'Your Life Organization Assistant',
      description: 'AI-powered life organization and reminder assistant for daily tasks, medications, appointments, and more.',
      address: '',
      phone: '',
      email: '',
      website: '',
      businessHours: 'Available 24/7',
      timezone: 'America/New_York',
    },
  });
  console.log('Created store info');

  // ==============================
  // FEATURES (Green theme)
  // ==============================
  await prisma.features.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      faqEnabled: false,
      stickyBarEnabled: false,
      stickyBarText: '',
      stickyBarBgColor: '#16a34a',
      stickyBarLink: '',
      stickyBarLinkText: '',
      liveChatEnabled: false,
      chatProvider: 'builtin',
      chatWelcomeMessage: 'Hi! How can we help you today?',
      chatAgentName: 'Support',
      chatWidgetColor: '#16a34a',
      chatPosition: 'bottom-right',
      chatShowOnMobile: true,
      chatWidgetId: '',
      chatEmbedCode: '',
      emailNotifications: true,
      smsNotifications: false,
      pushNotifications: false,
      orderConfirmations: true,
      marketingEmails: false,
      appointmentReminders: true,
      facebookUrl: '',
      twitterUrl: '',
      instagramUrl: '',
      linkedinUrl: '',
      youtubeUrl: '',
      tiktokUrl: '',
      shareOnFacebook: true,
      shareOnTwitter: true,
      shareOnLinkedin: false,
      shareOnWhatsapp: true,
      shareOnEmail: true,
      copyLinkButton: true,
    },
  });
  console.log('Created features with Green theme');

  // ==============================
  // PAYMENT SETTINGS
  // ==============================
  await prisma.paymentSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      enabled: true,
      stripeEnabled: true,  // Stripe enabled by default
      stripePublishableKey: '',
      stripeTestMode: true,
      paypalEnabled: false,
      paypalClientId: '',
      paypalSandbox: true,
      squareEnabled: false,
      squareAppId: '',
      squareSandbox: true,
      braintreeEnabled: false,
      braintreeMerchantId: '',
      braintreeTestMode: true,
      authorizeEnabled: false,
      authorizeApiLoginId: '',
      authorizeTestMode: true,
    },
  });
  console.log('Created payment settings');

  console.log('\n✅ Boomer AI database seeded successfully!');
  console.log('\n📋 Login credentials:');
  console.log('---');
  console.log('Admin:');
  console.log('  Email: admin@boomerai.com');
  console.log('  Password: admin123');
  console.log('---');
  console.log('Member:');
  console.log('  Email: member@demo.com');
  console.log('  Password: member123');
  console.log('---');
  console.log('Demo User (with sample data):');
  console.log('  Email: demo@boomerai.com');
  console.log('  Password: demo123');
  console.log('---');
  console.log('Caregiver:');
  console.log('  Email: sarah@example.com');
  console.log('  Password: caregiver123');
  console.log('\n📱 Sample data includes:');
  console.log('  - 6 contacts (family, doctor, pharmacy, etc.)');
  console.log('  - 5 upcoming appointments');
  console.log('  - 4 medications with 7-day history');
  console.log('  - 6 notes (pinned and regular)');
  console.log('  - 3 important dates');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
