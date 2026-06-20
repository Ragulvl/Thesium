# Thesium

AI-powered academic thesis generation platform built with React, Express, Prisma, BullMQ, and OpenRouter.

## Quick Start

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

## Environment Variables

Configure the following variables in your `.env` file:

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `OPENROUTER_API_KEY` | OpenRouter API key for AI generation | Yes |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID | Yes |
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379`) | Yes |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins for CORS (default: `http://localhost:10000`) | No |
| `BODY_LIMIT` | Max request body size (default: `1mb`) | No |
| `LOG_LEVEL` | Pino log level (default: `info`) | No |
| `SEED_SUPER_ADMIN_GOOGLE_SUB` | Google Subject ID of the Super Admin user | No |
| `LLM_CALL_TIMEOUT_MS` | Per-LLM-call timeout in ms (default: `30000`) | No |
| `MAX_JOB_COST_USD` | Max estimated cost per pipeline job (default: `0.50`) | No |
| `MODEL_FAST` | Fast model for outlines/summaries (default: `google/gemma-3n-2b-it`) | No |
| `MODEL_MEDIUM` | Medium model for review/polish (default: `google/gemma-3n-4b-it`) | No |
| `MODEL_LARGE` | Large model for consistency (default: `google/gemma-3-12b-it`) | No |
| `MODEL_DRAFTER` | Primary drafter model (default: `minimax/minimax-m2.5`) | No |

## Security & Deployment

### CORS

CORS is restricted to origins specified in `ALLOWED_ORIGINS`. In production, set this to your actual domain:

```bash
ALLOWED_ORIGINS=https://thesium.example.com
```

### Authentication

- Users authenticate via Google OAuth
- The server verifies Google ID tokens and resolves a full database user record
- All API endpoints (except `/api/health`) require authentication
- Super Admin access is controlled by the `role` field in the User model

### Seeding a Super Admin

1. Set `SEED_SUPER_ADMIN_GOOGLE_SUB` in your `.env` to the Google Subject ID of the user
2. Run the seed script:
   ```bash
   npx tsx -e "
     const { PrismaClient } = require('@prisma/client');
     const prisma = new PrismaClient();
     const sub = process.env.SEED_SUPER_ADMIN_GOOGLE_SUB;
     if (!sub) { console.error('Set SEED_SUPER_ADMIN_GOOGLE_SUB'); process.exit(1); }
     prisma.user.updateMany({ where: { googleSub: sub }, data: { role: 'SUPER_ADMIN' } })
       .then(r => console.log('Updated:', r))
       .finally(() => prisma.\$disconnect());
   "
   ```



### Request Body Limits

All JSON requests are limited to 1MB by default. Set `BODY_LIMIT` to change this.

### Security Headers

[Helmet](https://helmetjs.github.io/) is enabled for all responses, setting headers like:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (in production)

### Log Rotation

In production, configure external log rotation for `server/logs/app.log`:

```bash
# Linux example with logrotate
cat > /etc/logrotate.d/thesium << EOF
/path/to/thesium/server/logs/app.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
}
EOF
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend (Vite) + backend (Express) concurrently |
| `npm run build` | Generate Prisma client + build frontend |
| `npm test` | Run Vitest tests |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |

## Architecture

```
server/
├── config/          # env, logger, prisma, redis, models
├── controllers/     # Route handlers (theses, sections, users, admin, export)
├── middleware/       # auth, metrics, rateLimiter
├── routes/          # Express router definitions
├── services/        # AI pipeline, openRouter, scholar, queue, metrics
├── shared/          # Shared constants (DEFAULT_SECTIONS)
├── validators/      # Zod input validation schemas
├── workers/         # BullMQ generation worker
└── __tests__/       # Vitest unit tests

src/
├── components/      # React components
├── contexts/        # Auth, Theme, Toast contexts
├── pages/           # Route pages
└── utils/           # Frontend utilities
```

### AI Generation Pipeline

`server/services/pipeline.ts` runs a **7-stage pipeline** per thesis section (plus an optional 8th Image stage):

| Stage | Name | Scope | Description |
|-------|------|-------|-------------|
| 0 | **Blueprint** | Once per thesis | Generates research questions, key arguments, methodology and citation strategy. Injected into every Draft for consistency. |
| 1 | **Outline** | Once per section | Produces 3–6 subsection titles via LLM. |
| 2 | **Research** | Per subsection | Fetches relevant academic papers from Semantic Scholar (API only, no LLM). |
| 3 | **Draft** | Per subsection | Writes the subsection with blueprint context + paper evidence injected. |
| 4 | **Citation Validation** | Per subsection | Fast LLM check that every in-text citation maps to a fetched paper. Skipped when no papers were found. |
| 5 | **Review** | Per subsection | Large LLM fixes consistency, originality, and any citation issues raised in stage 4. |
| 6 | **Polish** | Per subsection | Medium LLM corrects grammar/tone and extracts a structured memory object for subsequent subsections. |
| 7 | **Image** *(optional)* | Per subsection | Generates an SVG diagram. Skipped for title, table of contents, and references sections. |

## CI/CD

GitHub Actions runs on every push/PR to `main`:
- `npm ci` — install dependencies
- `npx prisma generate` — generate Prisma client
- `tsc --noEmit` — TypeScript check
- `npm run lint` — ESLint
- `npx vitest run` — unit tests
