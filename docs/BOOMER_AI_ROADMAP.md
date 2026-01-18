# Boomer AI - Master Roadmap
**MVP to Production**

_Last Updated: 2025-12-17_

---

## Executive Summary

**Boomer AI** is a voice-first digital assistant for older adults ("Boomers") that helps manage daily life through natural conversation. The platform provides calendar management, medication tracking, contact management, notes, and caregiver coordination.

**Core Principle:** *Talk to it like a person.*

---

## Document Index

| Document | Purpose | Location |
|----------|---------|----------|
| Product Overview | Full feature spec | `docs/AI-for-Boomers.md` |
| PRD | Formal requirements | `docs/AI-For-Boomers-Product-Pack/AI-For-Boomers-PRD.md` |
| Production Plan | PROD readiness criteria | `docs/AI-For-Boomers-Prod.md` |
| Epics & Stories | Jira-ready breakdown | `docs/AI-For-Boomers-Full-Business-Pack/PRD-Epics-Jira.md` |
| Architecture | Technical design | `docs/AI-For-Boomers-Full-Business-Pack/` |
| Business Pack | Pitch, pricing, GTM | `docs/AI-For-Boomers-Full-Business-Pack/` |
| Executive Pack | Investor materials | `docs/ToUse/AI-For-Boomers-Executive-Pack/` |
| Foundations Pack | Legal, compliance, GTM | `docs/ToUse/AI-For-Boomers-Foundations-Pack/` |

---

## Milestone Overview

```
 MVP (M1)          BETA (M2)           PROD (M3)          SCALE (M4)
    |                  |                   |                  |
    v                  v                   v                  v
[Core Voice      [Caregiver        [Reliability        [Mobile Apps
 Assistant]       Portal]           & Billing]          & Growth]
    |                  |                   |                  |
 4-6 weeks         4-6 weeks          4-6 weeks          Ongoing
```

---

## M1: MVP - Voice-First Personal Organizer

**Goal:** Functional web app with voice commands for core CRUD operations.

### Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Voice Input | P0 | Wake button + STT for commands |
| Calendar CRUD | P0 | Appointments with categories, reminders |
| Medications CRUD | P0 | Med tracking with schedule + "Taken" logging |
| Contacts CRUD | P0 | Name, phone, email, relationship tags |
| Notes CRUD | P0 | Voice dictation, categories, pinning |
| TTS Responses | P0 | Read-back confirmations and summaries |
| Basic Reminders | P0 | Push notifications for events/meds |

### Technical Requirements

- [ ] User authentication (email/password + OAuth options)
- [ ] Voice command processing (STT → Intent → Action → TTS)
- [ ] Calendar service with recurring events
- [ ] Medication service with schedules
- [ ] Contact management with preferred comm method
- [ ] Notes with voice transcription
- [ ] Notification scheduling (push)
- [ ] Large-text, high-contrast UI
- [ ] "Today" dashboard view

### Voice Commands (Demo Ready)

```
Calendar:
- "Add a doctor appointment on January 12 at 3 PM"
- "What's my schedule tomorrow?"
- "Cancel my car inspection"

Medications:
- "Add Lisinopril 10 mg every day at 8 AM"
- "Did I take my morning meds?"
- "Mark my evening meds as taken"

Contacts:
- "Add contact: Mike the Plumber, 555-123-4567"
- "Text Mike: I'll be 10 minutes late"
- "What's my daughter's phone number?"

Notes:
- "Take a note: garage code is 4182"
- "Find my note about the garage"
- "Read my pinned notes"
```

### MVP Exit Criteria

- [ ] User can complete all core CRUD via voice
- [ ] Reminders fire reliably (>95%)
- [ ] "Today" view shows agenda + meds
- [ ] Basic accessibility (large text, high contrast)
- [ ] 3+ users can test concurrently

---

## M2: BETA - Caregiver & Reliability

**Goal:** Multi-user support with caregiver access and improved reliability.

### Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Caregiver Invite | P0 | Invite family member with role |
| Caregiver Dashboard | P0 | View-only access to calendar/meds |
| Escalation Alerts | P0 | Missed dose → notify caregiver |
| SMS Fallback | P1 | SMS when push fails |
| Audit Logging | P1 | Who changed what, when |
| Approval Workflow | P2 | Caregiver suggests → user confirms |

### Technical Requirements

- [ ] Multi-user data model (User → Caregiver relationship)
- [ ] Role-based access control (view-only, edit, emergency-only)
- [ ] Notification fallback chain (Push → SMS)
- [ ] Missed medication detection + escalation
- [ ] Audit log for all data changes
- [ ] Caregiver web portal
- [ ] Quiet hours + emergency override

### BETA Exit Criteria

- [ ] Caregiver can view user's schedule/meds
- [ ] Missed dose triggers caregiver alert
- [ ] SMS fallback works when app closed
- [ ] Audit log captures all changes
- [ ] 10+ users in pilot testing

---

## M3: PROD - Reliability & Monetization

**Goal:** Production-grade reliability, billing, and support tools.

### Features

| Feature | Priority | Description |
|---------|----------|-------------|
| Multi-channel Fallback | P0 | Push → SMS → Voice call |
| Subscription Billing | P0 | Stripe integration, plans |
| Admin Console | P0 | Support tools, user lookup |
| Smart Reminders | P1 | Context-aware batching |
| Data Export | P1 | User data download |
| Help System | P1 | In-app support, FAQ |

### Subscription Plans

| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | Calendar, notes, 5 reminders/day |
| Plus | $9.99/mo | Medications, unlimited reminders |
| Family | $14.99/mo | + Caregiver access, escalations |
| Premium | $24.99/mo | + Priority support, integrations |

### Technical Requirements

- [ ] Notification reliability >99.9%
- [ ] Dead-letter queue for failed notifications
- [ ] Stripe billing integration
- [ ] Subscription lifecycle management
- [ ] Admin console with user lookup
- [ ] Support ticket integration
- [ ] Error monitoring (Sentry/similar)
- [ ] Database backups + disaster recovery
- [ ] Load testing completed

### PROD Exit Criteria

- [ ] Reminder delivery success >99.9%
- [ ] Zero silent failures
- [ ] Billing works end-to-end
- [ ] Support can resolve issues without engineering
- [ ] Legal/privacy review complete
- [ ] 100+ paying users

---

## M4: SCALE - Mobile & Growth

**Goal:** Native mobile apps and growth features.

### Features

| Feature | Priority | Description |
|---------|----------|-------------|
| iOS App | P0 | Native app with voice button |
| Android App | P0 | Native app with voice button |
| Offline Mode | P1 | Today's schedule/meds cached |
| Emergency Button | P1 | One-tap call + SMS location |
| Transportation | P2 | Leave-time reminders, Uber/Lyft |
| Med Interactions | P2 | Basic drug interaction warnings |

### Growth Features

- [ ] Referral program
- [ ] Social sharing (family reassurance)
- [ ] Home device integration (Alexa/Google)
- [ ] B2B2C partnerships (healthcare orgs)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express + TypeScript |
| Database | Prisma ORM + PostgreSQL (prod) / SQLite (dev) |
| Frontend Web | EJS templates + Bootstrap 5 |
| Mobile | React Native (future) |
| Voice AI | OpenAI Realtime API (STT/TTS) |
| Notifications | Firebase (push), Twilio (SMS/voice) |
| Email | SendGrid |
| Billing | Stripe |
| Hosting | Azure / AWS |

---

## Data Model (Core Entities)

```
User
  - userId, name, email, phone, timezone
  - accessibilitySettings, consentFlags

Contact
  - contactId, userId, name, phones[], emails[]
  - tags[], preferredMethod

Appointment
  - appointmentId, userId, title, category
  - startAt, endAt, location, notes
  - reminders[], recurrenceRule

Medication
  - medicationId, userId, name, form, dosage
  - instructions, scheduleRule, refillInfo

MedicationLog
  - logId, medicationId, scheduledAt
  - status (taken/missed/snoozed), recordedAt

Note
  - noteId, userId, title, body
  - tags[], pinned, createdAt

CaregiverAccess
  - accessId, userId, caregiverUserId
  - role (view/edit/emergency), status

Notification
  - notificationId, userId, channel
  - payload, sendAt, status, attempts

AuditLog
  - auditId, actorUserId, action, entityType
  - beforeJson, afterJson, timestamp
```

---

## Success Metrics

| Metric | MVP Target | PROD Target |
|--------|------------|-------------|
| Reminder Success Rate | >95% | >99.9% |
| Voice Command Accuracy | >85% | >95% |
| User Retention (30-day) | 40% | 60% |
| Caregiver Activation | N/A | 30% of users |
| NPS | >30 | >50 |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Missed medication reminders | Multi-channel fallback + escalation |
| AI misunderstanding | Confirmation prompts, human fallback |
| Privacy concerns | Encryption, consent management, audit logs |
| User confusion | Simple UX, voice-first, minimal steps |
| Healthcare liability | Clear disclaimers, no medical advice |

---

## Files to Archive (Recruiting-Specific)

The following are from the original recruiting codebase and should be archived:

```
docs/ai-recruiting-assistant-complete-bundle/  → Archive
docs/Backup/ai-recruiting-assistant-*.zip     → Archive
docs/IMPLEMENTATION_PLAN.md                   → Archive (recruiting-specific)
docs/AZURE_BOT_SETUP.md                       → Archive (Teams-specific)
docs/PHASE3_WEB_INTERVIEW.md                  → Archive
docs/README.md                                → Replace with Boomer AI README
```

### Source Files to Refactor

```
src/services/interviewService.ts    → Refactor for Boomer AI
src/services/jobRoleService.ts      → Remove or repurpose
src/services/questionService.ts     → Remove or repurpose
src/adapters/teams/                 → Archive (not needed)
src/routes/interviews.ts            → Refactor for appointments
src/routes/jobRoles.ts              → Remove
src/routes/questions.ts             → Remove
src/realtime/interviewHandler.ts    → Refactor for voice assistant
views/admin/interviews.ejs          → Refactor for appointments
views/admin/job-roles.ejs           → Remove
views/admin/questions.ejs           → Remove
```

---

## Immediate Next Steps

1. **Archive recruiting docs** to `docs/Archive/recruiting/`
2. **Update main README.md** with Boomer AI overview
3. **Create new Prisma schema** for Boomer AI entities
4. **Build MVP routes** for Calendar, Medications, Contacts, Notes
5. **Implement voice command handler** using OpenAI Realtime
6. **Create "Today" dashboard view**
7. **Set up notification service**

---

## References

- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Twilio SMS](https://www.twilio.com/docs/sms)
- [Stripe Billing](https://stripe.com/docs/billing)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

*This is a living document. Update as milestones are achieved.*
