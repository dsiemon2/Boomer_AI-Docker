# AI for Boomers
*A voice-first digital assistant with Web + Mobile apps, caregiver support, and proactive reminders.*

## 1) Product overview
**Goal:** Provide an easy, voice-driven assistant for older adults (“Boomers”) that helps manage daily life—appointments, contacts, medications, notes—and communicates via text-to-speech (TTS), SMS, email, and push notifications.

**Primary UX principle:** *Talk to it like a person.* The system should accept natural speech, confirm intent, and offer “one-tap” or voice-only completion where possible.

## 2) Target users and use cases
### Primary users
- Older adults who prefer voice interaction and simple screens
- Users with mild visual or dexterity limitations
- Users with intermittent tech confidence (need guidance and confirmation)

### Secondary users
- Caregivers/family members (optional delegated access)
- Home health aides (limited permissions, audit logging)

### Core use cases
- “Schedule my doctor appointment for next Tuesday at 2 PM”
- “Remind me to take my blood pressure medicine at 8 AM and 8 PM every day”
- “Add my grandson’s birthday”
- “Call/text/email my mechanic” (voice or one-tap)
- “Take a note: the garage code is 4182”
- “What’s on my calendar today?”

## 3) Feature set (MVP)
### 3.1 Voice assistant (speech-to-text + NLU + TTS)
- Wake button / microphone button (no “always listening” required for MVP)
- Speech-to-text (STT) for user commands
- Intent detection + slot filling:
  - Create/update/delete appointments
  - Create/update/delete contacts
  - Create/update/delete birthdays/important dates
  - Create/update/delete medications and schedules
  - Create/update/delete notes
  - Read-back: “What’s next?”, “What meds today?”
- Confirmation prompts for safety:
  - “I heard ‘Dr. Smith on Tuesday at 2 PM’. Confirm?”
- TTS responses with adjustable voice + speed (slow/medium/fast)

### 3.2 Calendar scheduling (CRUD)
Manage appointments such as:
- Doctor appointments
- Car inspections / registration reminders
- Haircuts, social events, bill due dates

**Appointment fields (recommended):**
- Title (e.g., “Dr. Smith”)
- Category (Doctor / Vehicle / Personal / Finance / Other)
- Date/time start + end (or duration)
- Location (address + optional map link)
- Notes (e.g., “Bring insurance card”)
- Attendees (optional caregiver)
- Reminder rules (e.g., 1 day before + 2 hours before)
- Recurrence (weekly, monthly, annually)

**Voice examples:**
- “Move my dentist appointment to Friday at 10 AM”
- “Cancel my oil change appointment”

### 3.3 Contacts (CRUD) + communications
Store:
- Name
- Phone number(s)
- Email
- Relationship tag (Family, Doctor, Friend, Mechanic)
- Preferred communication method (call, SMS, email)
- Optional photo

**Send communications via voice:**
- “Text Jane: I’ll be 10 minutes late”
- “Email Dr. Smith: Please confirm my appointment”

**Implementation options:**
- SMS/Voice: Twilio
- Email: SendGrid, Mailgun, or Microsoft Graph (if using O365)
- TTS: On-device where possible; cloud TTS as fallback

### 3.4 Birthdays + important dates (CRUD)
Examples:
- Birthdays, anniversaries, yearly checkups
- Insurance renewal, vehicle registration, tax deadlines

**Features:**
- Auto-recurring annual reminders
- Configurable reminder windows (1 week + 1 day prior)
- “Suggested message” templates (SMS/email) read aloud by TTS

### 3.5 Medications (CRUD) + adherence reminders
Store medication details:
- Medication name
- Type/form (pill, capsule, injection, topical)
- Dosage (e.g., “10 mg”)
- Instructions (with food, avoid driving, etc.)
- Schedule (times per day, specific times, days of week)
- Refill reminders (when low, refill date)
- Prescribing doctor/pharmacy contact (optional)

**Medication interactions (optional, safety-bounded):**
- Basic interaction warnings using a reputable drug-interaction API
- Always include a safety disclaimer and a “call pharmacist/doctor” path
- Do not present as medical advice—present as informational alerts

**Voice examples:**
- “Add Metformin, 500 mg, twice daily at 8 AM and 8 PM”
- “What do I take this evening?”
- “Remind me to request a refill in 5 days”

### 3.6 Notes (CRUD) + voice dictation
- “Take a note…” voice capture
- Categorize notes (Health, Home, Finance, Family)
- Search notes by voice (“Find note about garage code”)
- Pin important notes (emergency numbers, allergies)

### 3.7 Notifications (MVP)
- Push notifications (mobile)
- SMS notifications (optional)
- Email notifications (optional)
- In-app notification center
- “Read my notifications” via TTS

**Reminder reliability requirements:**
- At-least-once delivery with de-dupe
- Offline fallback:
  - If mobile device offline, send SMS as backup (configurable)
- Quiet hours and accessibility settings

## 4) Additional Boomer-focused suggestions (high value)
### 4.1 Caregiver mode (delegated access)
- Invite caregiver with role-based access:
  - View-only (calendar/meds)
  - Edit (appointments/meds)
  - Emergency-only (critical alerts)
- Approval workflow:
  - Caregiver suggests change → user confirms via voice
- Audit log: who changed what and when

### 4.2 Emergency & “safety net” features
- “Emergency button” (mobile) to:
  - Call a primary contact
  - Send SMS with location (opt-in)
- Daily check-in (“How are you feeling today?”)
- Missed medication escalation:
  - “You missed 8 PM dose. Notify caregiver?”

### 4.3 Large-type, low-friction UI
- Large buttons and text (AAA contrast options)
- Simplified navigation:
  - Home: “Today”, “Medications”, “Contacts”, “Notes”
- Reduce typing:
  - Voice input everywhere
  - Contact picker
- Accessibility:
  - Screen reader support
  - Haptics + sound confirmations

### 4.4 Transportation assistance
- “Set reminder to leave by 1:15 PM” based on location + travel time
- Optional ride integration (Uber/Lyft deep links)

### 4.5 Trusted info hub
- Store:
  - Insurance numbers
  - Primary physician info
  - Allergies
  - Preferred pharmacy
  - Emergency contacts
- “Read my insurance ID number” via TTS (with optional PIN)

### 4.6 Scams & fraud guardrails (optional)
- Education prompts:
  - “Never share your password or SSN”
- Suspicious-message detection in notes or messages (opt-in)
- “Call my daughter” quick action when uncertain

## 5) System architecture (Web + Backend + Mobile)
### 5.1 Front-end website (User Portal)
**Purpose:** Simple dashboard for the user and optionally caregiver.
- Today view (agenda + meds)
- Add/edit flows (wizard-style)
- Settings: voice speed, reminders, caregiver access, quiet hours
- Accessibility: font size, contrast, simplified layout toggle

**Tech options:**
- React or Next.js (fast iteration, component reuse)
- Auth via OAuth2/OIDC (e.g., Auth0, Azure AD B2C, Cognito)

### 5.2 Backend website (Admin / Support Portal)
**Purpose:** Support staff tools (if you operate this as a service).
- User account lookup (with permission)
- Troubleshooting reminders and delivery logs
- Consent and access management
- Content templates (email/SMS)
- Audit logs and compliance exports

### 5.3 Mobile app (iOS + Android)
**Purpose:** Primary voice interface + notifications.
- Voice button on every screen
- Offline caching of today’s schedule and meds
- Push notifications and quick actions (“Taken”, “Snooze 10 min”)
- Emergency button

**Tech options:**
- React Native (single codebase)
- Flutter (single codebase)
- Native (Swift/Kotlin) if you need best OS-level integration

### 5.4 AI services layer
- STT (speech-to-text)
- NLU/Agent:
  - Intent classification
  - Entity extraction (dates, names, medication fields)
  - Confirmation logic
- TTS (text-to-speech)

**Design pattern:** “Tool-using assistant”
- Assistant interprets intent → calls *tools* (CalendarTool, MedTool, ContactsTool, NotesTool) → returns confirmation + next steps.

### 5.5 Data storage
- Relational DB (PostgreSQL / SQL Server) for core entities
- Optional vector search for notes (for voice search)
- Event log / audit table (append-only)

## 6) Suggested data model (high level)
### Entities
- **User**
  - userId, name, phone, email, timezone, accessibilitySettings, consentFlags
- **Contact**
  - contactId, userId, name, phones[], emails[], tags[], preferredMethod
- **Appointment**
  - appointmentId, userId, title, category, startAt, endAt, location, notes, reminders[], recurrenceRule
- **ImportantDate**
  - dateId, userId, title, date, recurrence (annual), reminders[]
- **Medication**
  - medicationId, userId, name, form, dosage, instructions, scheduleRule, refillInfo, interactionsOptIn
- **MedicationLog**
  - logId, medicationId, scheduledAt, status (taken/missed/snoozed), recordedAt, source (user/caregiver)
- **Note**
  - noteId, userId, title, body, tags[], pinned, createdAt, updatedAt
- **Notification**
  - notificationId, userId, channel (push/sms/email/in-app), payload, sendAt, status, attempts, lastError
- **CaregiverAccess**
  - accessId, userId, caregiverUserId, role, status, createdAt, revokedAt
- **AuditLog**
  - auditId, actorUserId, targetUserId, action, entityType, entityId, beforeJson, afterJson, timestamp

## 7) Notification engine (recommended approach)
- Generate “scheduled notification jobs” from:
  - Appointments reminders
  - Medication schedules
  - Important dates
- Queue-based delivery:
  - Job queue (e.g., Redis/BullMQ, SQS, Azure Service Bus)
  - Worker service sends push/SMS/email
- Delivery guarantees:
  - Retry with backoff
  - Dead-letter queue for failures
  - Idempotency keys to prevent duplicates
- User controls:
  - Snooze
  - Quiet hours
  - Escalation rules to caregiver

## 8) Privacy, security, and compliance considerations
- Encrypt data at rest and in transit (TLS 1.2+)
- RBAC for caregivers/admin staff
- Audit logging for all changes to meds/appointments/contacts
- Consent management (SMS, email, location)
- Optional PIN/biometric for sensitive info readouts
- Data retention settings
- If handling PHI in the U.S., evaluate HIPAA obligations (depending on your role and integrations)

## 9) MVP build plan (pragmatic)
### Phase 1: Voice-first personal organizer (4–8 weeks)
- User auth + profile
- Calendar CRUD + reminders
- Medications CRUD + reminders + “Taken” logging
- Contacts CRUD + send SMS/email
- Notes dictation + search
- TTS responses and “read back” summaries
- Basic caregiver invite (view-only)

### Phase 2: Reliability + caregiver workflows (4–8 weeks)
- Escalations, missed dose notifications
- Full caregiver roles + approval workflow
- Admin/support portal
- Offline mode improvements
- More robust natural language date parsing

### Phase 3: Value-add expansions
- Medication interaction checks (opt-in)
- Transportation assistance and leave-time reminders
- Scam guardrails and educational coaching
- Home device integration (Alexa/Google Home) if desired

## 10) Example voice commands (ready for demos)
### Calendar
- “Add a doctor appointment on January 12 at 3 PM. Remind me a day before.”
- “What’s my schedule tomorrow?”
- “Cancel my car inspection appointment.”

### Contacts + messaging
- “Add contact: Mike the Plumber, phone 555-123-4567.”
- “Text Mike: Please call me when you can.”
- “Email my daughter: I made it home safely.”

### Medications
- “Add Lisinopril 10 mg every day at 8 AM.”
- “Did I take my morning meds?”
- “Snooze that reminder for 15 minutes.”

### Notes
- “Take a note: the spare key is in the flower pot.”
- “Find my note about the garage.”
- “Read my pinned notes.”

## 11) Recommended tech stack (one strong option)
- **Mobile:** React Native
- **Web:** Next.js
- **Backend:** .NET 8 Web API (or Node.js/NestJS)
- **DB:** PostgreSQL
- **Queue:** Redis + BullMQ (or Azure Service Bus / AWS SQS)
- **Push:** Firebase Cloud Messaging (Android) + APNs (iOS) via FCM
- **SMS/Voice:** Twilio
- **Email:** SendGrid
- **AI:** Tool-using assistant pattern with intent routing; STT/TTS provider based on cost/latency

## 12) “Boomer-ready” UX checklist
- Large text toggle (and remember the setting)
- High contrast toggle
- Minimal steps per task (1–3 steps)
- Always confirm destructive actions (delete/cancel)
- Provide “undo” for 30 seconds
- Avoid jargon; plain language prompts
- Provide a human fallback: “Call support” or “Message caregiver”

---
If you want, I can generate a companion **PRD**, **API spec**, and **database schema (SQL)** as separate downloadable files, plus a **repo skeleton** for Web/Mobile/Backend.
