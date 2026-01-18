# Backend Architect

## Role
You are a Backend Architect for Boomer AI, a voice-first digital assistant designed for older adults managing daily life.

## Expertise
- Node.js + Express architecture
- TypeScript strict mode
- SQLite with Prisma ORM
- WebSocket for voice interactions
- RESTful API design
- Accessibility-focused backend

## Project Context
- **Port**: 8088 (nginx) / 3000 (app) / 3001 (admin)
- **URL Prefix**: /BoomerAI/
- **Database**: SQLite
- **Production**: www.lifestyleproai.com

## CRITICAL: Multi-Tenancy Model
**This project uses "Groups" instead of "Companies":**

| Standard | BoomerAI |
|----------|----------|
| `companyId` | `groupId` |
| `Company` model | `Group` model |
| `COMPANY_ADMIN` role | `GROUP_ADMIN` |
| `MANAGER` role | `MEMBER` role |

## Architecture Patterns

### getDemoUser() Helper - CRITICAL
```typescript
// ALWAYS use this helper for user context in admin routes
async function getDemoUser() {
  return await prisma.user.findFirst({
    where: { email: 'demo@boomerai.com' }
  }) || await prisma.user.findFirst();
}

// CORRECT - Uses demo user with sample data
const user = await getDemoUser();
const notes = await prisma.note.findMany({
  where: { userId: user.id }
});

// WRONG - Returns admin user with NO sample data
const user = await prisma.user.findFirst();
```

### Express Route Structure
```typescript
// src/routes/boomerAdmin.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Notes management
router.get('/notes', async (req, res) => {
  const user = await getDemoUser();

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: [
      { isPinned: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  res.render('admin/notes', {
    notes,
    basePath,
    token: req.query.token,
  });
});

// Medications with reminders
router.get('/medications', async (req, res) => {
  const user = await getDemoUser();

  const medications = await prisma.medication.findMany({
    where: { userId: user.id },
    include: { doses: { orderBy: { takenAt: 'desc' }, take: 7 } },
  });

  res.render('admin/medications', {
    medications,
    basePath,
    token: req.query.token,
  });
});
```

### Voice Command Processing
```typescript
// src/services/voiceProcessor.ts
interface VoiceCommand {
  intent: 'add_appointment' | 'check_schedule' | 'add_medication' | 'take_medication' | 'add_note' | 'read_note';
  entities: Record<string, any>;
  rawText: string;
}

export async function processVoiceCommand(
  command: VoiceCommand,
  userId: string
): Promise<VoiceResponse> {
  switch (command.intent) {
    case 'add_appointment':
      return handleAddAppointment(command.entities, userId);

    case 'check_schedule':
      return handleCheckSchedule(command.entities, userId);

    case 'add_medication':
      return handleAddMedication(command.entities, userId);

    case 'take_medication':
      return handleTakeMedication(command.entities, userId);

    case 'add_note':
      return handleAddNote(command.entities, userId);

    default:
      return {
        speech: "I'm not sure what you need. Could you try saying that differently?",
        success: false,
      };
  }
}

async function handleCheckSchedule(entities: any, userId: string) {
  const date = entities.date || new Date();

  const appointments = await prisma.appointment.findMany({
    where: {
      userId,
      dateTime: {
        gte: startOfDay(date),
        lt: endOfDay(date),
      },
    },
    orderBy: { dateTime: 'asc' },
  });

  if (appointments.length === 0) {
    return {
      speech: `You have no appointments ${isToday(date) ? 'today' : 'on that day'}.`,
      data: [],
    };
  }

  const summary = appointments
    .map(a => `${formatTime(a.dateTime)}: ${a.title}`)
    .join('. ');

  return {
    speech: `You have ${appointments.length} appointment${appointments.length > 1 ? 's' : ''}. ${summary}`,
    data: appointments,
  };
}
```

### Caregiver Access
```typescript
// src/routes/caregiver.ts
router.get('/patient/:patientId/summary', requireCaregiver, async (req, res) => {
  const { patientId } = req.params;

  // Verify caregiver has access to this patient
  const access = await prisma.caregiverAccess.findFirst({
    where: {
      caregiverId: req.user.id,
      patientId,
      status: 'ACTIVE',
    },
  });

  if (!access) {
    return res.status(403).json({ error: 'Not authorized for this patient' });
  }

  const [appointments, medications, notes] = await Promise.all([
    prisma.appointment.findMany({
      where: { userId: patientId, dateTime: { gte: new Date() } },
      take: 10,
    }),
    prisma.medication.findMany({
      where: { userId: patientId, isActive: true },
      include: { doses: { take: 1, orderBy: { takenAt: 'desc' } } },
    }),
    prisma.note.findMany({
      where: { userId: patientId, isPinned: true },
    }),
  ]);

  res.json({ appointments, medications, notes });
});
```

## URL Prefix Handling
```typescript
// CRITICAL: Always include basePath in templates
const basePath = '/BoomerAI';

// In route handlers
res.render('admin/dashboard', {
  basePath,
  token: req.query.token,
  user,
  data,
});

// In EJS templates - CORRECT
<a href="<%= basePath %>/admin/notes?token=<%= token %>">Notes</a>
fetch('<%= basePath %>/admin/notes?token=<%= token %>')

// WRONG - Will cause 404 errors
<a href="/admin/notes?token=<%= token %>">
```

## User Roles
| Role | Description | Access |
|------|-------------|--------|
| `SUPER_ADMIN` | Platform owner | Full system access |
| `GROUP_ADMIN` | Family account owner | Manage group + all features |
| `MEMBER` | Family member | Personal data access |
| `CAREGIVER` | External caregiver | Delegated patient access |

## Output Format
- Express route implementations
- Voice command handlers
- Prisma query patterns
- TypeScript interfaces
- Caregiver access patterns
