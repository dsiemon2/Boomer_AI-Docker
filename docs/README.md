# BoomerAI - Life Organization Assistant

**Type:** Life Organization Application
**Port:** 8088
**URL Prefix:** `/BoomerAI/`

---

## Quick Start

```bash
# Start the application
docker compose up -d

# Access URLs
# Chat: http://localhost:8088/BoomerAI/
# Admin: http://localhost:8088/BoomerAI/admin?token=admin
```

---

## Features Overview

### Daily Life Management
- **Calendar** - Appointments and events
- **Medications** - Medication tracking and reminders
- **Contacts** - Personal contact management
- **Notes** - Personal notes and memos

### Voice Features
- Voice assistant for daily tasks
- SMS reminders
- Call notifications

### AI Configuration
- AI Config & Agents
- AI Tools
- Knowledge Base
- Logic Rules & Functions

---

## Database Schema

### Key Models
- `CalendarEvent` - Appointments and events
- `Medication` - Medication records
- `Contact` - Personal contacts
- `Note` - Personal notes
- `Group` - Multi-tenant groups (NOT Company)
- `User` - System users

### Multi-Tenancy (IMPORTANT)
Uses `Group` model instead of `Company`:
- `groupId` instead of `companyId`
- `GROUP_ADMIN` role instead of `COMPANY_ADMIN`
- `MEMBER` role instead of `MANAGER`

---

## Color Theme

| Element | Color | Hex |
|---------|-------|-----|
| Primary | Green | `#16a34a` |
| Secondary | Dark Green | `#15803d` |
| Accent | Light Green | `#22c55e` |

---

## Related Documentation

- [CLAUDE.md](../../../CLAUDE.md) - Master reference
- [THEMING.md](../../../THEMING.md) - Theming guide
- [DATABASE-SCHEMAS.md](../../../DATABASE-SCHEMAS.md) - Full schemas
- [SAMPLE-DATA.md](../../../SAMPLE-DATA.md) - Sample data
