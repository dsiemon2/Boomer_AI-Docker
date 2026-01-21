# BoomerAI - Project Reference

**Type:** Life Organization Platform for Seniors
**Port:** 8088
**URL Prefix:** /BoomerAI/
**Status:** Active (Development)
**Live URL:** https://www.lifestyleproai.com
**Last Updated:** 2026-01-19

---

**READ THIS ENTIRE FILE before making ANY changes to this project.**

---

## Project Overview

| Property | Value |
|----------|-------|
| **Port** | 8088 |
| **URL Prefix** | `/BoomerAI/` |
| **Type** | Life Organization |
| **Purpose** | Personal life assistant for elderly users |
| **Theme Color** | Green (#16a34a) |

## Access URLs

| Page | URL |
|------|-----|
| Splash Page | http://localhost:8088/BoomerAI/ |
| Login | http://localhost:8088/BoomerAI/auth/login |
| Chat | http://localhost:8088/BoomerAI/chat |
| Admin | http://localhost:8088/BoomerAI/admin (auto-adds ?token=admin) |

## Demo Credentials

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| admin@boomerai.com | admin123 | Admin | Standard admin login |
| member@demo.com | member123 | Member | Standard member login |
| demo@boomerai.com | demo123 | Demo User | **HAS ALL SAMPLE DATA** |
| sarah@example.com | caregiver123 | Caregiver | Sarah Johnson |

**CRITICAL:** The demo@boomerai.com user has all the sample data (notes, contacts, appointments, medications). Use `getDemoUser()` helper in routes.

---

## CRITICAL: URL Prefix Handling

### The #1 Source of Bugs

**EVERY URL in EJS templates MUST include basePath prefix.**

### Correct Patterns

```html
<!-- Links -->
<a href="<%= basePath %>/admin/notes?token=<%= token %>">Notes</a>

<!-- Form actions -->
<form action="<%= basePath %>/admin/notes?token=<%= token %>" method="POST">

<!-- JavaScript fetch (single quotes) -->
fetch('<%= basePath %>/admin/notes?token=<%= token %>', { ... })

<!-- JavaScript fetch (template literals) -->
fetch(`<%= basePath %>/admin/notes/${id}?token=<%= token %>`, { ... })
```

### WRONG - Will cause 404 errors

```html
<!-- WRONG - Missing basePath -->
<a href="/admin/notes?token=<%= token %>">

<!-- WRONG - Missing basePath in fetch -->
fetch('/admin/notes?token=<%= token %>', { ... })

<!-- WRONG - Missing basePath in template literal -->
fetch(`/admin/notes/${id}?token=<%= token %>`, { ... })
```

### How to Check for Issues

Run this command to find missing basePath:
```bash
grep -r "href=\"/admin" views/admin/*.ejs | grep -v "basePath"
grep -r "fetch('/admin" views/admin/*.ejs | grep -v "basePath"
grep -r "fetch(\`/admin" views/admin/*.ejs | grep -v "basePath"
grep -r "action=\"/admin" views/admin/*.ejs | grep -v "basePath"
```

If ANY results appear, those files have bugs that need fixing.

---

## CRITICAL: User Context in Admin Routes

### The getDemoUser() Helper

All admin routes that need user data MUST use `getDemoUser()`:

```typescript
// CORRECT - Uses helper that finds demo user with sample data
const user = await getDemoUser();

// WRONG - Returns first user (admin) who has NO sample data
const user = await prisma.user.findFirst();
```

### Why This Matters

- `prisma.user.findFirst()` returns the first created user (admin@boomerai.com)
- Admin user has NO sample data (no notes, contacts, appointments, medications)
- `getDemoUser()` returns demo@boomerai.com who HAS all sample data

### Helper Definition (in boomerAdmin.ts)

```typescript
async function getDemoUser() {
  return await prisma.user.findFirst({
    where: { email: 'demo@boomerai.com' }
  }) || await prisma.user.findFirst();
}
```

---

## CRITICAL: Multi-Tenancy Model

**This project uses "Groups" instead of "Companies":**

| Standard | BoomerAI |
|----------|----------|
| `companyId` | `groupId` |
| `Company` model | `Group` model |
| `COMPANY_ADMIN` role | `GROUP_ADMIN` role |
| `MANAGER` role | `MEMBER` role |

When copying code from other projects, always replace Company references with Group.

---

## Authentication Systems

### Two Separate Auth Systems

| System | Method | Used For |
|--------|--------|----------|
| Frontend | JWT Cookie (`boomerai_token`) | Chat, Billing, Caregiver pages |
| Admin | Query Parameter (`?token=admin`) | Admin panel |

**These are independent.** Logging out of frontend does NOT affect admin, and vice versa.

### Admin Token Auto-Redirect

If user visits `/admin` without token, they are auto-redirected to `/admin?token=admin` (dev convenience).

---

## Docker Architecture

### Containers

| Container | Port | Purpose |
|-----------|------|---------|
| boomerai_app | 3000 | Main app (splash, auth, chat) |
| boomerai_admin | 3001 | Admin panel |
| boomerai_proxy | 80 (exposed as 8088) | Nginx reverse proxy |

### Shared Volume

Both app and admin containers share `/app/data/app.db` database via Docker volume.

### Seeding

Database is seeded on first startup when `app.db` doesn't exist. To reseed:

```bash
docker compose exec app sh -c "rm -f /app/data/app.db && npx prisma db push --skip-generate && npx prisma db seed"
docker compose restart admin
```

---

## nginx.conf Critical Settings

```nginx
location /BoomerAI/ {
    rewrite ^/BoomerAI/(.*)$ /$1 break;
    proxy_pass http://app_server;
    proxy_set_header Host $http_host;  # Preserves port!
    proxy_set_header X-Forwarded-Prefix /BoomerAI;
    # Fix redirects to include correct host:port
    proxy_redirect http://localhost/ http://$http_host/;
    proxy_redirect https://localhost/ https://$http_host/;
}
```

**CRITICAL:** Use `$http_host` NOT `$host` to preserve port 8088 in redirects.

---

## File Structure

```
Boomer_AI-Docker/
├── docker/
│   ├── nginx.conf          # Reverse proxy config
│   └── entrypoint.sh       # Container startup script
├── prisma/
│   ├── schema.prisma       # Database schema
│   └── seed.ts             # Sample data seeding
├── src/
│   ├── server.ts           # Main app server (port 3000)
│   ├── adminServer.ts      # Admin server (port 3001)
│   ├── routes/
│   │   ├── auth.ts         # Login/logout/register
│   │   └── boomerAdmin.ts  # All admin routes
│   └── middleware/
│       └── boomerAuth.ts   # JWT authentication
├── views/
│   ├── index.ejs           # Splash page
│   ├── chat.ejs            # Voice assistant
│   ├── auth/
│   │   ├── login.ejs
│   │   └── register.ejs
│   └── admin/
│       ├── _sidebar.ejs    # Shared sidebar (include)
│       ├── dashboard.ejs   # "Today" view
│       ├── notes.ejs
│       ├── contacts.ejs
│       ├── medications.ejs
│       ├── appointments.ejs
│       └── ... (other admin pages)
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md               # THIS FILE
```

---

## Key Features

- Calendar/Appointments
- Medications tracking with reminders
- Trial Codes management
- Account Settings (profile, password, 2FA)
- Subscription Management (my-subscription, pricing)
- SMS Settings (Twilio integration)

## Payment Gateways

All 5 payment gateways are fully integrated:

| Gateway | Status | Test Mode Support |
|---------|--------|-------------------|
| **Stripe** | Full integration | Sandbox/Production |
| **PayPal** | Full integration | Sandbox/Production |
| **Square** | Full integration | Sandbox/Production |
| **Braintree** | Full integration | Sandbox/Production |
| **Authorize.net** | Full integration | Test/Live mode |

### Payment Services Location
```
src/services/payments/
├── stripe.service.ts     # Stripe payment processing
├── paypal.service.ts     # PayPal order management
├── square.service.ts     # Square payment processing
├── braintree.service.ts  # Braintree transactions
├── authorize.service.ts  # Authorize.net processing
├── payment.service.ts    # Unified payment orchestrator
└── index.ts              # Service exports
```

---

## More Key Features
- Contacts management (family, doctors, pharmacy)
- Notes with categories and pinning
- Caregiver access
- Voice assistant (OpenAI Realtime API)

---

## Sample Data (from seed.ts)

| Data Type | Count | Examples |
|-----------|-------|----------|
| Users | 4 | admin, member, demo, caregiver |
| Contacts | 6 | Dr. Smith, Sarah Johnson, CVS Pharmacy |
| Appointments | 5 | Doctor checkup, Car inspection, Bridge club |
| Medications | 4 | Lisinopril, Metformin, Vitamin D3, Aspirin |
| Notes | 6 | Garage Code, Insurance Info, Allergies, WiFi |
| Languages | 24 | All enabled |

---

## UI Standards

### Action Buttons - Must Have Tooltips

```html
<button class="btn btn-sm btn-outline-primary"
        data-bs-toggle="tooltip"
        title="Describe what this button does">
  <i class="bi bi-icon-name"></i>
</button>
```

### Data Tables - Must Have

1. Row Selection (checkbox column, select all, bulk actions)
2. Pagination (page size selector, navigation, showing X-Y of Z)

### Color Theme

| Usage | Color |
|-------|-------|
| Primary | #16a34a (Green) |
| Secondary | #15803d |
| Accent | #22c55e |

---

## Common Mistakes to AVOID

1. **Missing basePath in URLs** - ALWAYS use `<%= basePath %>` prefix
2. **Using findFirst() for user** - Use `getDemoUser()` helper instead
3. **Hardcoding /admin/ paths** - Include basePath
4. **Using $host in nginx** - Use `$http_host` to preserve port
5. **Forgetting proxy_redirect rules** - Redirects lose port without them
6. **Not reseeding after schema changes** - Delete app.db and restart

---

## Quick Commands

### Rebuild Everything
```bash
docker compose down
rm -rf data/
docker compose build --no-cache
docker compose up -d
```

### Rebuild Admin Only
```bash
docker compose build admin --no-cache
docker compose up -d admin
```

### Force Reseed Database
```bash
docker compose exec app sh -c "rm -f /app/data/app.db && npx prisma db push --skip-generate && npx prisma db seed"
docker compose restart admin
```

### Check Logs
```bash
docker logs boomerai_app
docker logs boomerai_admin
```

### Test Endpoints
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/BoomerAI/
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/BoomerAI/admin
curl -s -o /dev/null -w "%{http_code}" http://localhost:8088/BoomerAI/auth/login
```

---

## Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **Database:** Prisma + PostgreSQL
- **Frontend:** EJS templates + Bootstrap 5 + Bootstrap Icons
- **Real-time:** WebSockets (OpenAI Realtime API)
- **Container:** Docker + nginx reverse proxy

---

## Logging

Pino-based logging with pretty printing in development:

```
src/utils/logger.ts
```

### Features
- **Pino Logger**: Fast, low-overhead JSON logging
- **Pretty Printing**: Colorized output in development with pino-pretty
- **Log Levels**: Configurable via LOG_LEVEL environment variable
- **Timestamps**: Human-readable timestamps in development
- **Production Mode**: Raw JSON output for log aggregation

### Log Levels
- `fatal` - Critical errors
- `error` - Error conditions
- `warn` - Warning conditions
- `info` - Informational messages (default)
- `debug` - Debug information
- `trace` - Trace-level logging

### Usage
```typescript
import logger from '../utils/logger';

logger.info('Server started on port 8088');
logger.error({ error: err.message }, 'Database connection failed');
logger.debug({ userId, action }, 'User action logged');
```

### Configuration
```bash
# Environment variable
LOG_LEVEL=debug  # Set log level (default: info)
```

---

## Agent Capabilities

When working on this project, apply these specialized behaviors:

### Backend Architect
- Design Express routes with RESTful patterns and proper error handling
- Use Prisma ORM with SQLite for all database operations
- Implement middleware for auth, validation, and error handling
- Structure code in `src/routes/`, `src/middleware/`, `src/services/`

### AI Engineer
- Optimize OpenAI Realtime API for voice interactions with elderly users
- Design clear, patient voice prompts (slower pace, simple language)
- Handle WebSocket connections with proper reconnection logic
- Implement conversation context for natural dialogue flow

### Database Admin
- Design Prisma schemas for Notes, Contacts, Appointments, Medications
- Use `getDemoUser()` helper for user context in admin routes
- Implement soft deletes and audit trails for sensitive data
- Optimize queries for the demo user's sample data

### Security Auditor
- Protect sensitive elderly user data (medical, contacts, personal notes)
- Validate all inputs, especially in admin routes
- Secure JWT authentication for frontend, token-based for admin
- Review caregiver access permissions carefully

### UX Focus (Elderly Users)
- Large fonts (16px+ base), high contrast colors
- Simple navigation with clear labels
- Prominent action buttons with tooltips
- Clear error messages in plain language
- Green theme (#16a34a) for calm, trustworthy feel

### Bug Debugger
- Check basePath in all EJS templates (common source of 404s)
- Verify `getDemoUser()` usage instead of `findFirst()`
- Test nginx proxy_redirect rules for port preservation
- Debug WebSocket connections for voice features
