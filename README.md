# Boomer AI

**Voice-first digital assistant for older adults**

**Production Domain:** www.lifestyleproai.com

An AI-powered assistant that helps manage daily life through natural conversation - calendar, medications, contacts, notes, and caregiver coordination.

## Core Principle

*Talk to it like a person.*

## Quick Start (Docker)

```bash
# Start the application
docker compose up -d

# Access URLs
# Splash Page: http://localhost:8088/BoomerAI/
# Login: http://localhost:8088/BoomerAI/auth/login
# Admin: http://localhost:8088/BoomerAI/admin
```

## Demo Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@boomerai.com | admin123 | Admin |
| member@demo.com | member123 | Member |
| demo@boomerai.com | demo123 | Demo User (has sample data) |
| sarah@example.com | caregiver123 | Caregiver |

## Features

- **Voice-First Interface** - Natural speech commands, TTS responses
- **Calendar Management** - Appointments, reminders, recurring events
- **Medication Tracking** - Schedules, "Taken" logging, refill reminders
- **Contact Management** - Relationships, preferred communication
- **Notes** - Voice dictation, categories, pinning
- **Caregiver Support** - Delegated access, escalation alerts
- **Accessibility** - Large text, high contrast, simple navigation

## Example Voice Commands

```
"Add a doctor appointment on January 12 at 3 PM"
"What's my schedule tomorrow?"
"Add Lisinopril 10 mg every day at 8 AM"
"Did I take my morning meds?"
"Take a note: garage code is 4182"
"Text Mike: I'll be 10 minutes late"
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express + TypeScript |
| Database | Prisma ORM + SQLite |
| Frontend | EJS templates + Bootstrap 5 |
| Voice AI | OpenAI Realtime API |
| SMS | Twilio (medication & appointment reminders) |
| Container | Docker + nginx reverse proxy |

## Project Structure

```
Boomer_AI-Docker/
├── docker/                 # Docker configuration
│   ├── nginx.conf          # Reverse proxy config
│   └── entrypoint.sh       # Container startup
├── src/                    # Backend TypeScript source
│   ├── server.ts           # Main server (port 3000)
│   ├── adminServer.ts      # Admin server (port 3001)
│   ├── routes/             # API routes
│   └── middleware/         # Auth, etc.
├── views/                  # EJS templates
│   ├── index.ejs           # Splash page
│   ├── chat.ejs            # Voice assistant
│   ├── auth/               # Login/register
│   └── admin/              # Admin panel pages
├── prisma/                 # Database schema & seed
├── docs/                   # Documentation
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md               # Development conventions
```

## Docker Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# Rebuild
docker compose build --no-cache
docker compose up -d

# View logs
docker logs boomerai_app
docker logs boomerai_admin

# Force reseed database
docker compose exec app sh -c "rm -f /app/data/app.db && npx prisma db push --skip-generate && npx prisma db seed"
docker compose restart admin
```

## Environment Variables

Set in `docker-compose.yml`:

```env
OPENAI_API_KEY=sk-...       # Required: OpenAI API key
PORT=3000                   # Internal app port
ADMIN_PORT=3001             # Internal admin port
DATABASE_URL=file:/app/data/app.db
ADMIN_TOKEN=admin           # Admin panel token

# Twilio SMS (optional)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
```

## Color Theme

| Element | Color |
|---------|-------|
| Primary | #16a34a (Green) |
| Secondary | #15803d |
| Accent | #22c55e |

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Development conventions (READ FIRST)
- [docs/BOOMER_AI_ROADMAP.md](./docs/BOOMER_AI_ROADMAP.md) - Product roadmap
- [docs/AI-for-Boomers.md](./docs/AI-for-Boomers.md) - Full product spec

## Multi-Tenancy Note

This project uses **Groups** instead of Companies:
- `groupId` instead of `companyId`
- `GROUP_ADMIN` role instead of `COMPANY_ADMIN`
- `MEMBER` role instead of `MANAGER`

## License

MIT
