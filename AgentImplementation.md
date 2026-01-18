# Agent Implementation - Boomer AI

## Project Overview

**Type**: Personal Assistant App
**Purpose**: Life organization assistant for elderly users

## Tech Stack

```
Backend:     Node.js + Express + TypeScript
Database:    SQLite + Prisma ORM
Voice:       OpenAI Realtime API (WebSockets)
Auth:        JWT + bcrypt (two-tier: Frontend JWT + Admin token)
Frontend:    EJS templates + Bootstrap 5 + Bootstrap Icons
Container:   Docker + Docker Compose
Port:        8088
Base Path:   /BoomerAI/
```

## Key Components

- `src/routes/boomerAdmin.ts` - Admin dashboard with RBAC
- `src/routes/` - User-facing routes
- `prisma/schema.prisma` - User data schema

## Key Features

- Calendar/Appointments management
- Medications tracking with reminders
- Contacts management (family, doctors, pharmacy)
- Notes with categories and pinning
- Caregiver access
- Voice assistant via OpenAI Realtime API

---

## Recommended Agents

### MUST IMPLEMENT (Priority 1)

| Agent | File | Use Case |
|-------|------|----------|
| **Backend Architect** | engineering/backend-architect.md | API design, reminder system, caregiver access |
| **DevOps Automator** | engineering/devops-automator.md | Docker management |
| **AI Engineer** | engineering/ai-engineer.md | Voice assistant, natural language understanding |
| **Database Admin** | data/database-admin.md | SQLite, user data, medications schema |
| **Security Auditor** | security/security-auditor.md | Medical data protection, caregiver access control |
| **Bug Debugger** | quality/bug-debugger.md | Reminder issues, voice recognition problems |

### SHOULD IMPLEMENT (Priority 2)

| Agent | File | Use Case |
|-------|------|----------|
| **Frontend Developer** | engineering/frontend-developer.md | Accessible UI for elderly users |
| **API Tester** | testing/api-tester.md | API validation |
| **Code Reviewer** | quality/code-reviewer.md | TypeScript patterns |
| **UI Designer** | design/ui-designer.md | Large fonts, high contrast, simple navigation |
| **UX Researcher** | design/ux-researcher.md | **Critical** - Elderly user experience |

### COULD IMPLEMENT (Priority 3)

| Agent | File | Use Case |
|-------|------|----------|
| **Content Creator** | marketing/content-creator.md | Friendly reminder messages |
| **Performance Benchmarker** | testing/performance-benchmarker.md | Voice response latency |

---

## Agent Prompts Tailored for This Project

### Backend Architect Prompt Addition
```
Project Context:
- Life organization app for elderly users
- Features: Calendar, Medications, Contacts, Notes
- Caregiver access system (family members can help manage)
- Reminder system for medications and appointments
- Two-tier auth: Frontend JWT + Admin token query param
- Voice assistant integration
```

### AI Engineer Prompt Addition
```
Project Context:
- OpenAI Realtime API for voice interaction
- Natural language for elderly users (simple, clear responses)
- Voice commands: "What medications do I take today?", "Call my doctor"
- Patience and repetition in voice responses
- Clear confirmation of actions
```

### UX Researcher Prompt Addition (CRITICAL)
```
Project Context:
- Target users: Elderly (65+)
- Accessibility requirements:
  - Large fonts (minimum 18px)
  - High contrast mode
  - Simple navigation (minimal clicks)
  - Clear, unambiguous labels
  - Voice-first interaction option
- Caregiver mode for family assistance
- Medication reminders must be reliable and noticeable
```

### Security Auditor Prompt Addition
```
Project Context:
- Medical information (medications, doctor contacts)
- Personal health data protection
- Caregiver access with appropriate permissions
- Elderly users may share devices - session security important
```

---

## Marketing & Growth Agents (When Production Ready)

Add these when the project is ready for public release/marketing:

### Social Media & Marketing

| Agent | File | Use Case |
|-------|------|----------|
| **Content Creator** | marketing/content-creator.md | Reminder messages, notifications, app copy |
| **SEO Optimizer** | marketing/seo-optimizer.md | Landing page optimization |
| **Visual Storyteller** | design/visual-storyteller.md | Marketing imagery for elderly audience |

### Growth & Analytics

| Agent | File | Use Case |
|-------|------|----------|
| **Growth Hacker** | marketing/growth-hacker.md | User acquisition, onboarding optimization |
| **Trend Researcher** | product/trend-researcher.md | Elder care tech trends |
| **Finance Tracker** | studio-operations/finance-tracker.md | Subscription metrics, revenue tracking |
| **Analytics Reporter** | studio-operations/analytics-reporter.md | Usage patterns, engagement metrics |

### Social Media (If Applicable)

| Agent | File | Use Case |
|-------|------|----------|
| **TikTok Strategist** | marketing/tiktok-strategist.md | Educational content for caregivers |
| **Instagram Curator** | marketing/instagram-curator.md | Brand presence, testimonials |
| **Twitter/X Engager** | marketing/twitter-engager.md | Support, community engagement |
| **Reddit Community Builder** | marketing/reddit-community-builder.md | r/eldercare, r/caregiver communities |

---

## Not Recommended for This Project

| Agent | Reason |
|-------|--------|
| Mobile App Builder | Web-based for now |
| Whimsy Injector | Serious health context |

---

## Implementation Commands

```bash
# Invoke agents from project root
claude --agent engineering/backend-architect
claude --agent engineering/ai-engineer
claude --agent design/ux-researcher  # Critical for elderly UX
claude --agent data/database-admin
claude --agent security/security-auditor
claude --agent quality/bug-debugger
```
