# VrindaaCorp CRM + Lead Cleanup + Outreach Automation

Custom application for **VrindaaCorp Services** covering the four components of the SOW:

1. **Lead Database Cleanup & Segmentation** — CSV/Excel import, dedup, email validation, tagging, export.
2. **Automated Email Outreach** — multi-step drip sequences, A/B subjects, batching + warm-up, suppression.
3. **CRM** — lead pipeline, tracking (sent/opened/clicked/replied/bounced), notes, tasks, owner assignment.
4. **Owner Notification & Reply Loop** — reply detection → Email + WhatsApp alert → 48h escalation.

## Tech stack

- **Next.js 14** (App Router, TypeScript) — UI, API routes, server actions
- **PostgreSQL + Prisma**
- **Tailwind CSS**, **Recharts** (reporting)
- **Amazon SES** for sending, open/click tracking, bounce/complaint + inbound (reply) via SNS webhook
- **Meta WhatsApp Cloud API** for owner alerts
- Background **worker** for batch sending + escalation

> If AWS SES / WhatsApp are not configured, sends are **simulated** (fake message ids) so the
> whole flow can be exercised locally without real delivery.

## Prerequisites

- Node.js 20+
- A PostgreSQL 16 database. Easiest is Docker (`docker-compose.yml`), or any local/cloud Postgres.

## Setup

```bash
npm install
cp .env.example .env          # then edit values (at minimum NEXTAUTH_SECRET)
```

### 1. Start a database

**Option A — Docker (recommended):**

```bash
docker compose up -d
```

**Option B — existing Postgres:** set `DATABASE_URL` in `.env` to your instance.

### 2. Migrate + seed

An initial migration is already generated in `prisma/migrations/0_init`. Apply it:

```bash
npx prisma migrate deploy
npm run db:seed
```

(For subsequent schema changes during development, use `npx prisma migrate dev`.)

Seed creates two logins (password `admin123`):
- `admin@vrindaacorpservices.in` (ADMIN)
- `owner@vrindaacorpservices.in` (OWNER, receives hot-lead alerts)

**Change these passwords immediately in any real deployment.**

### 3. Run

```bash
npm run dev        # web app at http://localhost:3000
npm run worker     # background sender + escalation (separate terminal)
```

### Bulk import (large files)

For large lead files (thousands of rows) an HTTP upload can time out. Use the CLI importer,
which runs the same parse → flatten → dedup → validate → import pipeline:

```bash
npx tsx scripts/import-file.ts "C:/path/to/leads.xlsx"
```

**Account-centric sheets** (one row per company with several contacts embedded as repeated
`Email id`, `Email id (1)`… columns) are automatically flattened into one lead per contact —
in both the UI upload and the CLI. Email validation fails *open*: only malformed addresses are
rejected; a domain with no reachable MX is imported and flagged `RISKY`.

**Normalization.** On import, `sector` is canonicalized (e.g. `MFG`/`Mfg` → `Manufacturing`),
and the raw location is split into a normalized `city` (title-cased, dedup'd) plus a canonical
`geography` **region** (e.g. `Gurgaon`/`Bawal` → `NCR`, `Jaipur` → `Rajasthan`) used for
segmentation. City/region maps live in [lib/import/normalize.ts](lib/import/normalize.ts).

To clean data imported before this logic existed, run the idempotent backfill:

```bash
npx tsx scripts/normalize-existing.ts
```

## Typical flow

1. **Import & Cleanup** → upload lead CSV/Excel, map columns, dedup + validate + import.
2. **Templates** → write drip emails with tokens (`{{firstName}}`, `{{company}}`, `{{sector}}`, `{{unsubscribe}}`) and A/B subjects. Or enable **AI generation**: tick "AI-generate a personalized email per lead", give a brief, and the system writes a unique email per lead from their name + company + sector at send time (Claude `claude-opus-5`; set `ANTHROPIC_API_KEY`). Use "Generate AI preview" to sample it. Without a key it falls back to a personalized template so the flow still works.
3. **Campaigns** → create a campaign, pick a segment, add 3 sequence steps (e.g. day 0 / +3 / +6), Activate, Enroll matching leads.
4. **Worker** sends due emails within the daily cap; opens/clicks/replies flow back via tracking + SES webhooks.
5. On reply, lead is marked **Hot**, sequence pauses, and the owner is alerted (Email + WhatsApp). Unacknowledged after 48h → escalation.
6. **Reports** → monthly funnel, pipeline, sectors, top templates; export Excel or Print→PDF.

## Phase 2 features (inbound, RBAC, contract intelligence)

- **Inbound lead capture** — public endpoints funnel website-form, Meta Lead Ads, and Google
  Ads Lead Form submissions straight into leads (normalized, deduped, auto-assigned):
  `POST /api/inbound/form` (secret), `/api/inbound/meta` (webhook + Graph API), `/api/inbound/google`
  (keyed). See the **Lead Sources** admin page for URLs + setup and recent activity.
- **RBAC** — `AGENT` users see and act only on leads assigned to them (enforced in queries,
  server actions, API routes, and middleware); `OWNER`/`ADMIN` see everything and manage
  campaigns/imports/templates. New leads are auto-assigned round-robin (`lib/assign.ts`).
- **Per-lead campaign status** — each campaign shows an Enrolled-leads table with a live
  Contacted / Opened / Clicked / Replied badge per lead (denormalized on `Enrollment.lastEventType`).
- **24h unattended alerts** — a shared inbox (`COMPANY_ALERT_EMAIL`) is notified for replied-but-
  unactioned hot leads and untouched inbound leads (idempotent; separate from the 48h owner escalation).
- **Contract intelligence** — best-effort discovery of a lead-company's current FM vendor + contract
  expiry via a pluggable model (`AI_PROVIDER=local` for an on-server OpenAI-compatible model, shared
  with the website) plus optional web search; agent confirms, and a reminder fires one month before
  expiry. Manual entry is always available. All of these run from the consolidated `/api/cron`.

## Deploying to Vercel

See **[DEPLOY.md](DEPLOY.md)** for the full guide. In short: provision a hosted
Postgres (Neon/Supabase/Vercel Postgres), import the GitHub repo in Vercel, set the
environment variables, and deploy. The always-on worker is replaced on Vercel by a
scheduled Cron endpoint (`/api/cron`, configured in `vercel.json`).

## Production notes

- Configure SES (SPF/DKIM/DMARC on the sending domain), a configuration set with an SNS
  event destination pointing at `/api/webhooks/ses?token=<SES_WEBHOOK_SECRET>`, and SES inbound
  receiving → SNS to the same endpoint for reply detection.
- `APP_URL` must be publicly reachable so tracking pixels/links and webhooks work.
- Run `npm run worker` as an always-on process (PM2/systemd) or a scheduled task.
- See `docs/SOP.md` for day-to-day operating procedures.
