# Deploying to Vercel

The app is Vercel-ready. Because Vercel is **serverless**, two things differ from local:

- The always-on `npm run worker` does **not** run on Vercel. It's replaced by a
  **Cron endpoint** `GET /api/cron` (see `vercel.json`) that sends due emails and
  runs 48h escalations on a schedule.
- You need a **hosted PostgreSQL** database (the local Docker one isn't reachable).
  Use Neon, Supabase, or Vercel Postgres. Prefer the provider's **pooled** connection
  string for serverless.

## 1. Provision a database

Create a Postgres instance (e.g. [Neon](https://neon.tech) free tier) and copy its
**pooled** connection string. Apply the schema from your machine:

```bash
DATABASE_URL="postgresql://…pooled…" npx prisma migrate deploy
DATABASE_URL="postgresql://…pooled…" npm run db:seed
```

The seed creates `admin@vrindaacorpservices.in` / `admin123` — change the password after first login.

## 2. Import the repo in Vercel

Vercel → **Add New… → Project → Import** `sunilblinkoninfra-cyber/Vrindaacrop-CRM`.
Framework preset auto-detects **Next.js**. The build command is already
`prisma generate && next build` (from `package.json`) — leave it as-is.

## 3. Set Environment Variables

In the Vercel project → **Settings → Environment Variables** (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | your hosted Postgres **pooled** URL |
| `NEXTAUTH_URL` | `https://<your-app>.vercel.app` (set after first deploy) |
| `NEXTAUTH_SECRET` | a long random string (`openssl rand -base64 32`) |
| `APP_URL` | same as `NEXTAUTH_URL` (used in tracking pixels/links + webhooks) |
| `CRON_SECRET` | a random string — protects `/api/cron` (Vercel sends it as a Bearer token) |
| `SES_WEBHOOK_SECRET` | random string (used in the SES webhook URL) |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | SES credentials (leave blank to run in simulated mode) |
| `SES_CONFIGURATION_SET`, `SES_FROM_EMAIL`, `SES_FROM_NAME` | SES sending config |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | AI email generation (blank → templated fallback) |
| `WHATSAPP_ENABLED`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME` | owner WhatsApp alerts |
| `EMAIL_VERIFIER`, `EMAIL_VERIFIER_API_KEY` | optional bulk email verifier |
| `DAILY_SEND_CAP`, `ESCALATION_HOURS` | outreach limits (defaults 1000 / 48) |

Deploy. After the first deploy, set `NEXTAUTH_URL` and `APP_URL` to the assigned
domain and redeploy (or add your custom domain first, then use that).

## 4. Scheduling (the worker replacement)

`vercel.json` runs `/api/cron` **daily at 03:00 UTC**. That's fine for this system
because follow-up delays are day-level and the batch cap is per-day.

- **Hobby plan:** cron is limited to once per day, and functions cap at ~60s — keep
  `DAILY_SEND_CAP` modest so a run finishes in time.
- **Near-real-time sending / large batches:** use **Vercel Pro**, then change the
  schedule in `vercel.json` (e.g. `*/5 * * * *` every 5 min) and rely on `maxDuration`.
- **Alternative:** any external cron (e.g. cron-job.org) can hit
  `https://<domain>/api/cron?token=<CRON_SECRET>` on whatever interval you want.

## 5. Wire up SES webhooks (production sending)

Point your SES configuration-set SNS destination and SES inbound receiving at:

```
https://<your-app>.vercel.app/api/webhooks/ses?token=<SES_WEBHOOK_SECRET>
```

This delivers open/click/bounce/complaint events and inbound replies (which trigger
the Hot-lead owner alert). `APP_URL` must equal your public domain so tracking links resolve.

## 6. Schema changes later

When you change `prisma/schema.prisma`, run `prisma migrate deploy` against the
production `DATABASE_URL` (from your machine or CI) — Vercel's build runs
`prisma generate`, not migrations.
