# Accountability — MVP (Phases 1–3)

A personal accountability web app. Not a to-do list: the product loop is

```
Goal → Commitment → Daily plan → Check-in → Completed / Partial / Missed → Reason → Score & streak → (weekly review → adjust)
```

and every screen answers four questions: **What did you promise? What did you actually do? Why was there a difference? What should change next?**

This repository implements **Phases 1–3** of the spec (Foundation, Goal Engine, Accountability), the analytics and calendar the dashboard needs, and the **mentor & admin** workspace. See [Scope](#scope) for what is deliberately left to later phases.

---

## Quick start (one command)

Prerequisites: **Node 22+**, **Docker** (for Postgres). Redis is no longer needed — background jobs run on Postgres.

```bash
npm run start:local
```

That script (`scripts/dev.sh`):

1. creates `.env` from `.env.example` with freshly generated secrets (first run only),
2. installs dependencies,
3. starts Postgres 16 via Docker Compose,
4. applies database migrations,
5. seeds demo data (first run only),
6. starts the API and web app with hot reload.

| | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:4000/api/v1 |
| Swagger / OpenAPI | http://localhost:4000/docs |
| Health | http://localhost:4000/health |

**Demo accounts** (password `Password123` for all) — 1 admin, 5 mentors, 5 clients:

| Role | Email | Lands on | Notes |
|---|---|---|---|
| ADMIN | `admin@accountability.dev` | `/admin` | Overview, clients, mentors, audit log |
| MENTOR | `priya@accountability.dev` | `/mentor` | Mentors Aravind and Sneha; a past session with notes, an upcoming call, a nudge rule |
| MENTOR | `meera@accountability.dev` | `/mentor` | Mentors Divya (needs attention) |
| MENTOR | `rahul@accountability.dev` | `/mentor` | Vikram hasn’t accepted yet — Rahul sees only his name |
| MENTOR | `arjun@…`, `kavya@accountability.dev` | `/mentor` | No clients yet |
| USER | `aravind@accountability.dev` | `/app/dashboard` | 30 days of history, mentor Priya, WhatsApp opt-in on |
| USER | `vikram@accountability.dev` | `/app/dashboard` | Has a pending mentor request to accept |
| USER | `sneha@…`, `divya@…`, `karthik@accountability.dev` | `/app/dashboard` | On track · struggling · inactive and unassigned |

Everyone signs in on the same `/login` page; the app sends each role to its own area.

**Real accounts:** clients sign up at `/register`. The first admin is created from the command line (there is no way to become an admin on the website):

```bash
npm run create-admin -- --email you@example.com --name "Your Name"   # asks for a password (or set ADMIN_PASSWORD)
```

Admins invite mentors from **Admin → Mentors → Invite mentor** (a one-time link, valid 7 days, that you send yourself). Mentors fill in their directory profile (headline, bio, focus areas, languages) under **Settings**. Clients choose a mentor themselves on the **Goals** page — choosing is their consent, so the mentor starts following their progress straight away — and admins can still assign or reassign from **Admin → Clients** (the client accepts first). See [docs/architecture.md → Mentoring](docs/architecture.md#mentoring).

### Manual setup

```bash
cp .env.example .env            # then set JWT_SECRET and STORAGE_SIGNING_SECRET
npm install
npm run db:up                   # docker compose up -d postgres
npm run db:migrate
npm run db:seed                 # re-runnable: recreates the demo accounts
npm run dev                     # API :4000 + web :3000
```

---

## Testing

| Command | What it runs |
|---|---|
| `npm test` | API unit tests (streak, score, completion, recurrence, timezone, deadlines, storage signing) + web component/unit tests (Vitest + Testing Library: radio-group keyboard behaviour, task row, check-in model, schemas, open-redirect guard) |
| `npm run test:integration` | API against a **real** Postgres test DB (`TEST_DATABASE_URL`, auto-created + migrated): register/login, goal wizard, generation idempotency, complete/partial, check-in, score + streak, next-day generation, commitment edit with immutable history, missed check-in, rest days, pausing, goal rules, plan limits, evidence upload security, and **User A cannot access User B** across every resource |
| `npm run test:e2e` | Playwright (mobile + desktop) against the **static production build**: register → onboarding → dashboard → complete → partial → photo evidence (compressed in-browser, direct signed upload) → check-in → streak; plus "every route is pre-rendered". Run `npm run build`, start the API, then `npm start -w apps/web` (static preview + API proxy). |
| `npm run lint` / `npm run typecheck` / `npm run build` | as named |

CI (`.github/workflows/ci.yml`) runs lint → typecheck → unit → integration → build, then a Playwright job.

---

## Repository layout

```
apps/
  api/                    NestJS REST API (TypeScript)
    prisma/               schema.prisma, migrations, seed.ts
    src/
      domain/             PURE business rules (no I/O): dates/timezones, recurrence, completion,
                          scoring, streaks, check-in deadlines, plan validation — fully unit-tested
      accountability/     occurrence generation, completion service, day closing, daily results, streaks
      auth/ users/ goals/ commitments/ tasks/ checkins/ evidence/
      dashboard/ analytics/ notifications/ jobs/ health/ audit/
      common/             guards (auth, CSRF), error filter, response envelope, logger, validators
    test/unit, test/integration
  web/                    Next.js 15 App Router (static export), Tailwind v4, shadcn-style UI, TanStack Query, RHF + Zod, Recharts
    src/app               routes only: thin server pages with metadata (all SSG)
    src/features/<name>   auth, shell, dashboard, tasks, check-in, goals, calendar, insights, settings — each with api.ts + index.ts
    src/components/ui     design system (Button, Segmented, ToggleChip, Dialog, ConfirmDialog, states, skeletons…)
    src/lib               API client, query keys, providers, formatting, shared types
    functions/            Cloudflare Pages Function that proxies /api/v1 in production
    scripts/              static preview server, _headers writer
    e2e/                  Playwright specs
docs/                     architecture, ERD, API, deployment, engineering rules
```

---

## Scope

**Built (Phases 1–3 + supporting analytics)**

- Auth: register, login, logout, logout-everywhere, `GET /auth/me`; bcrypt (cost 12); JWT in an httpOnly SameSite=Lax cookie; tokens revocable via `tokenVersion`; rate-limited auth.
- Users: IANA timezone (mandatory), check-in time, rest days, notification preferences, onboarding flag.
- Goals: wizard creation (goal + commitments + check-in time atomically), edit, activate, pause, resume, explicit completion (`confirm: true`), read-only once completed (notes still editable), delete → hard delete only without history, otherwise **abandoned** (history kept), primary-goal handling, numeric progress from a chosen commitment or manual completion.
- Commitments: structured recurrence (`DAILY`, `WEEKLY_DAYS`, `TIMES_PER_WEEK`, `MONTHLY`), units (count, minutes, hours, boolean, custom…), preferred time, evidence requirement, pause/resume (with optional resume date), archive instead of delete, soft plan warnings (“guide, don’t block”).
- Occurrence engine: idempotent generation (`UNIQUE(taskId, scheduledDate)` + `skipDuplicates`), a Postgres-backed job queue (SKIP LOCKED workers, retries, dead-letter) **and** lazy catch-up on dashboard load, settings snapshotted per occurrence so **edits never rewrite history**.
- Accountability: complete / partial / miss / progress / reset, 48 h late-edit window (flagged “completed late”), append-only `TaskCompletion` log with one current row (DB-enforced), guided check-in (statuses → blockers → confidence → reflection), one check-in per user per date, check-in reminder + follow-up (in-app), day closing at local midnight (missed tasks/check-in, kind notification), deterministic daily score, streaks with rest days, previous-streak recovery messaging, deterministic post-check-in feedback.
- Evidence: photos are resized to WebP and stripped of EXIF on the device, then uploaded **directly** to storage (Cloudflare R2 or the local signed-URL driver) and confirmed with size + magic-byte checks; thumbnails, per-task and per-user quotas, abandoned-upload cleanup, link and text evidence, soft delete.
- Dashboard (single aggregated endpoint), week/month/day/goal analytics, calendar heat-map with day drill-down, insights page.
- **Mentoring**: invite-only mentors, admin assignment with client consent, mentor board with status rules and a “reviewed today” tick, read-only client page, timeline, private versioned notes with shared summaries, action items, sessions with reminders, prep sheet with talking points, nudges (templates, limits, quiet hours, WhatsApp link after opt-in), automatic nudge rules, alerts, morning summary, weekly reports, “My day”, admin overview/clients/mentors/activity/audit, browser push notifications.
- Audit log for important mutations, structured JSON logs with request ids and redaction, `GET /health` (app + DB + scheduler heartbeat), OpenAPI.

**Deferred to later phases** (schema already in place where relevant): weekly review generation & AI coach (Phase 4/6 — `WeeklyReview` table exists), email and WhatsApp Business API delivery (Phase 5 — notifications are shown in-app and, with VAPID keys, as browser push), S3 storage driver, payments (`Subscription` exists; free-plan limits enforced: 1 active goal, 5 active commitments; disable with `PLAN_LIMITS_ENABLED=false`).

---

Rules for contributors (and AI agents): [docs/engineering-rules.md](docs/engineering-rules.md) · [AGENTS.md](AGENTS.md)

**Deploying:** [docs/deployment-free.md](docs/deployment-free.md) — free with no credit card (Cloudflare Pages + Render + Supabase). Prefer one server you control? [docs/deployment.md](docs/deployment.md) (Oracle VM / any Docker host).

More detail: [docs/architecture.md](docs/architecture.md) · [docs/api.md](docs/api.md) · [docs/deployment.md](docs/deployment.md)
