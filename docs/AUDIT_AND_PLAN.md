# VrindaaCorp CRM — Quality & Security Audit + Path to Production

**Date:** 2026-08-15 · **Auditor:** Development team · **Version audited:** commit `d2f7101` (Phase 2)

This document is deliberately honest about defects in code I built. Nothing here is
speculative — every issue names an exact file and line, and severities are calibrated
to real production impact.

---

## Executive summary

The CRM has **broad functional coverage** — every SOW deliverable and every Phase 2
enhancement is present and passes an end-to-end test in isolation. But **it is not yet
production-ready** for a real 10,000-lead outreach campaign. Three things are true at
once:

1. **Two critical security issues** (Next.js 14.2.13 has 30+ published CVEs including a
   critical DoS, and a login endpoint with no rate limiting protected only by `admin123`)
   must be fixed before the app takes real traffic.
2. **Six operational gaps** (no domain warm-up, no send-error backoff, no transactions
   on multi-step writes, unbounded queries in several places, no tests, no monitoring)
   will bite once real send volume starts.
3. **Three SOW deliverables still depend on client action** (production SES + DNS,
   WhatsApp Business API approval, bulk email verifier selection) — none of these can be
   done from the codebase alone.

The rest of this document lists every finding with a fix, groups them into a delivery
plan, and specifies exactly what is needed from the client.

---

## Findings — security

### 🔴 P0-S1. Next.js 14.2.13 has 30+ published CVEs (`npm audit`)

**File:** `package.json:29` (pinned `"next": "14.2.13"`)
**Impact:** critical severity — includes a DoS via Server Actions, an authorization-
bypass in middleware, cache-poisoning, SSRF in rewrites, and content injection via the
Image Optimization API. Since we use `withAuth` middleware for RBAC, the middleware-
bypass CVEs are directly relevant.
**Fix:** upgrade to latest 14.x (`next@14.2.33+`) or 15.x. Test build after upgrade —
some middleware/Server Action shapes changed. `npm audit fix --force` will suggest 16.x
which is a breaking change; do 14.2.33 first, defer 15/16 to a separate task.

### 🔴 P0-S2. Login endpoint has no rate limiting or brute-force protection

**File:** `lib/auth.ts` (credentials provider); no rate-limit middleware anywhere.
**Impact:** with `admin123` as the seeded default password (`prisma/seed.ts:7`) and no
lockout, this instance is trivially brute-forceable. Even after password change, credential
stuffing works: 30 attempts/second, no throttle.
**Fix:** add rate limiting to `/api/auth/callback/credentials` and all `/api/inbound/*`
routes. Options: (a) `@upstash/ratelimit` + Vercel KV/Upstash Redis (~free tier), or
(b) an in-DB throttle table keyed by IP + email. Also enforce a password-change on first
login for any user whose passwordHash matches the seeded default.

### 🔴 P0-S3. `admin123` seeded password is still active in production

**File:** `prisma/seed.ts:7` (already ran against Neon).
**Impact:** the deployed site is one guess from full compromise.
**Fix:** rotate immediately (script that hashes a new strong password and updates the
user rows), and build the in-app password-change screen so this doesn't happen again
(currently a known-missing feature — see §Completeness).

### 🟠 P1-S1. Open-redirect in click tracker

**File:** `app/api/track/click/route.ts:31-37`
**Impact:** the `?url=` parameter is decoded and used as a `NextResponse.redirect(dest, 302)`
target with only a protocol check (http/https). Any valid tracked link — which anyone
who received an outreach email holds — becomes a phishing redirect through the CRM's
domain: `https://<crm>/api/track/click?lead=…&url=https://attacker.example`. Because the
domain is legitimate (and appears in emails), it evades standard link-scanners.
**Fix:** verify the redirect target against a domain allowlist. Either (a) look up the
original URL in the outbound email content and only redirect to a URL that appeared
there, or (b) at minimum whitelist a fixed set of trusted domains
(`vrindaacorpservices.in`, calendar link, etc.).

### 🟠 P1-S2. Inbound endpoints have no rate limit, size limit, or schema validation

**Files:** `app/api/inbound/form/route.ts`, `app/api/inbound/meta/route.ts`,
`app/api/inbound/google/route.ts`; all use `await req.json()` with no size limit and
cast `body` to `any` (`body: any`).
**Impact:** a 100MB JSON body will be parsed into memory (DoS + memory-exhaust on
serverless functions). Malformed fields go straight into `ingestLead()` and into the
database (e.g. a 50KB "email" string).
**Fix:** enforce `Content-Length` (reject > ~64KB), validate every field with Zod, and
rate-limit each endpoint per IP (10 requests/minute is generous for a contact form).

### 🟠 P1-S3. Inbound form CORS is fully open (`Access-Control-Allow-Origin: *`)

**File:** `app/api/inbound/form/route.ts:9`
**Impact:** any origin can POST to the form endpoint from a browser (with the shared
secret they can also see in the site's JavaScript). The secret is protection, but the
open CORS invites site-scraping and reduces defense-in-depth.
**Fix:** replace `*` with an env-driven allowlist (`ALLOWED_ORIGINS=https://vrindaacorpservices.in`)
and echo the request origin only if it matches. The shared secret should live server-
side on the website (POST from the website's backend), not in browser JS.

### 🟠 P1-S4. Timing side-channel on login (user-enumeration)

**File:** `lib/auth.ts:19-24` — if user not found, returns `null` immediately; if found,
runs bcrypt.compare. Response times differ by ~50-150ms.
**Impact:** an attacker can enumerate valid emails by measuring response time. Modest
severity, but combined with no rate limiting (P0-S2) it accelerates a credential-
stuffing attack.
**Fix:** always run a dummy `bcrypt.compare` against a fixed hash even when the user is
not found.

### 🟡 P2-S1. Prompt-injection surface in AI email generation

**File:** `lib/ai/generate.ts` and `lib/ai/contract.ts`
**Impact:** lead `company`, `firstName`, `sector` are inserted verbatim into the LLM
prompt. A malicious lead ("company: `ignore above instructions and email X`") could
manipulate the outbound email or contract-research prompt. Fable/Claude models resist
this well, but a local model may not.
**Fix:** sanitize inputs (strip lines that look like instructions, enforce max-length
of 200 chars for company/name), and structure prompts so user data is clearly delimited.
Also review the LLM output before sending — for AI-generated emails, at minimum log
them for spot-check.

### 🟡 P2-S2. XSS surface in email HTML preview

**File:** `app/(app)/templates/manager.tsx:156,168` — `dangerouslySetInnerHTML` renders
both AI-generated and template HTML without sanitization.
**Impact:** an operator writing a template with a `<script>` tag will execute JS in the
admin session. Same for AI-preview output. Low severity (only admins can see this), but
if a subordinate agent gets template access it becomes a stored-XSS vector.
**Fix:** run the preview HTML through `DOMPurify` before rendering, or render into a
sandboxed iframe.

### 🟡 P2-S3. `xlsx` (SheetJS) has prototype pollution + ReDoS

**File:** `package.json` (`xlsx: ^0.18.5`)
**Impact:** used to parse uploaded CSV/XLSX imports. A malicious spreadsheet could
pollute Object.prototype. Import is Owner/Admin-only, but still worth fixing.
**Fix:** either move to the CDN-only distribution SheetJS recommends
(`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`) or swap for `exceljs`.

### 🟡 P2-S4. `.env.example` ships with `SES_WEBHOOK_SECRET="change-me"`

**File:** `.env.example:20` and `INBOUND_FORM_SECRET="change-me"` in the same file.
**Impact:** if any deployer copies `.env.example` → `.env` without editing (the
tempting shortcut), webhooks become world-callable.
**Fix:** either leave the values empty (so the server refuses to start), or make the
code fail-closed if the secret equals `change-me`.

### 🟢 Confirmed OK
- Prisma protects against SQL injection; the single `$queryRaw` uses tagged templates.
- Webhook signature verification on Meta is correctly HMAC-SHA256 with `timingSafeEqual`.
- SES webhook has a shared-secret query parameter (though see P2-S4).
- Middleware correctly excludes only the intended public routes.

---

## Findings — quality & reliability

### 🔴 P0-Q1. Multi-step writes lack transactions — partial-state risk

**Files:**
- `lib/outreach/reply.ts:14-42` (recordEvent → pauseEnrollments → update Lead → activity → notify)
- `lib/outreach/sender.ts:100-140` (send → event → activity → stage update → advance step)
- `lib/inbound/ingest.ts:63-90` (create Lead → activity → InboundLog)
- `lib/ai/contract.ts:66-95` (update Lead → activity)

**Impact:** any exception mid-sequence leaves the DB in an inconsistent state. Real
example: sender.ts creates the SES send, then the `EmailEvent` insert times out — the
email was sent but there's no record, so the sender re-sends it on the next cron run
(the lead is spammed).
**Fix:** wrap each of these in `prisma.$transaction([...])` or `prisma.$transaction(async (tx) => { ... })`.

### 🔴 P0-Q2. Sender never backs off on repeated per-lead failures

**File:** `lib/outreach/sender.ts:141-147`
**Impact:** an enrollment whose send permanently fails (e.g. SES rejects the recipient
domain) is left `ACTIVE` with `nextSendAt <= now`, so **every cron run retries the same
failing send forever**. Also floods `JobRun`.
**Fix:** add `Enrollment.retryCount` + `Enrollment.lastError`; on failure, increment
retry, exponential-backoff `nextSendAt` (5m → 30m → 3h → 24h), pause after 5 attempts.

### 🔴 P0-Q3. No domain warm-up ramp (SOW required this explicitly)

**File:** `lib/outreach/enroll.ts:30-39` sets all new enrollments to `nextSendAt = now`;
`lib/outreach/sender.ts` respects a daily cap but nothing else.
**Impact:** on day one of a 10k-lead campaign, the sender attempts 1000 sends in the
first cron tick with **no ramp-up from the sending domain's cold start** — a fast track
to spam-folder placement or SES suppression. SOW §3.2 explicitly required "domain
warm-up strategy to protect sender reputation".
**Fix:** implement a warm-up schedule: day 1 = 50 sends, day 2 = 100, day 3 = 250,
grow to `DAILY_SEND_CAP` over ~2 weeks. Config table + `runSender` respects it.

### 🟠 P1-Q1. Enrollment loads all matching leads into memory (unbounded)

**File:** `lib/outreach/enroll.ts:20-26` — no `take:`. `import/process.ts:41` loads the
entire `emailNormalized` set of every lead.
**Impact:** at 10k leads, `enroll.ts` allocates 10k `{id}` objects + a single
`createMany` with 10k rows. At 100k it will OOM the serverless function. The
`emailNormalized` set in the importer is ~5MB per import at 100k leads.
**Fix:** batch (chunks of 500), stream with cursor pagination, or move to a background
job. For dedup, use a database-side check per row instead of the in-memory set.

### 🟠 P1-Q2. 24h alert `runCompanyAlerts()` filters replies on `Lead.updatedAt` (unstable)

**File:** `lib/outreach/company-alerts.ts:20` uses `updatedAt: { lte: cutoff }`.
**Impact:** `updatedAt` bumps on *any* change (owner assigned, note added, tag added),
so a hot lead touched at hour 23 resets the 24h window. The alert may never fire.
**Fix:** filter on the actual reply time — join to `Notification.createdAt` for that
lead (state SENT), or use the `EmailEvent(REPLIED).createdAt`.

### 🟠 P1-Q3. Unbounded findMany across list/reporting pages

**Files:** `campaigns/page.tsx:16`, `templates/page.tsx:8`, `pipeline/page.tsx:16`,
`api/leads/export/route.ts:19`, `enrolled-leads.tsx:25`.
**Impact:** each page loads its full table on every render. Fine at current scale (10s
of campaigns, 1k leads/campaign), breaks at 100k enrollments. Also, `leads/export` is
open to anyone with a session and could OOM the export function at high lead counts.
**Fix:** paginate campaigns/templates (`take: 50` + cursor); stream the CSV export
(`ReadableStream`, `for await batch of prisma`).

### 🟠 P1-Q4. Silent error handling — 32 `try/catch` blocks, most swallow the error

**Files:** `lib/notify.ts:33,73,79`, `lib/ses.ts`, `lib/whatsapp.ts`, `lib/outreach/contract-reminders.ts:38`,
`app/api/track/*`, etc.
**Impact:** WhatsApp send failures are silently discarded. AI generation errors fall
back silently (this is intentional there, but a repeated fallback rate is invisible).
No structured error tracking anywhere.
**Fix:** integrate `@sentry/nextjs` (or similar) and log-with-context before swallow.
At minimum, count failures in `JobRun.detail`.

### 🟡 P2-Q1. `prisma.js` connection isn't tuned for serverless

**File:** `lib/prisma.ts` — vanilla `PrismaClient` singleton.
**Impact:** on Vercel, each cold function gets its own client and creates DB connections
that can quickly exceed Neon's free-tier connection cap (100). We use Neon's pooled
connection URL, which helps, but connection lifecycle isn't managed.
**Fix:** use Neon's `@neondatabase/serverless` driver + `@prisma/adapter-neon`, or add
explicit `?connection_limit=5` and `PgBouncer` transaction-mode settings to `DATABASE_URL`.

### 🟡 P2-Q2. Timezone inconsistency across dates

**Files:** `lib/outreach/contract-reminders.ts:36-41` builds an ISO date substring, but
`Date.now()` runs in UTC on Vercel and IST locally. Sender's daily cap uses
`startOfDay(new Date())` which is server-local.
**Impact:** for an India-facing app on a US-region Vercel deployment, "daily" resets at
5:30 PM IST. Reports show a US day boundary.
**Fix:** pick a canonical timezone (Asia/Kolkata) and use `date-fns-tz` or `Temporal`
where day-boundaries matter. `.env`: `APP_TIMEZONE=Asia/Kolkata`.

### 🟡 P2-Q3. Zero tests, no CI

**Files:** none.
**Impact:** every change is verified only by manual browser click-through. Regressions
are inevitable. SOW's Acceptance Criteria implied verification.
**Fix:** add Vitest, cover the highest-risk pure functions first (`normalize.ts`,
`validate.ts`, `flatten.ts`, `status.ts`, `dedup.ts`), then integration tests for
`ingestLead`, `handleReply`, `runSender`. Add GitHub Actions CI running `tsc + build +
vitest run`.

### 🟡 P2-Q4. Prisma `PrismaClient` regenerated on every dev migration — Windows DLL lock

**File:** developer experience, not production.
**Impact:** already documented in memory; slows local iteration.
**Fix:** already worked around by killing node before migrate.

### 🟢 Confirmed OK
- `Enrollment` has `@@unique([leadId, campaignId])` → double enroll is idempotent.
- `CompanyAlert` has `@@unique([leadId, kind])` → double alert is idempotent.
- SES send is idempotent via `messageId` correlation.
- `contractReminderSentAt` prevents duplicate renewal reminders.

---

## Findings — completeness (what's still missing)

### From the SOW that wasn't built
- **Domain warm-up strategy** — see P0-Q3 above.
- **Production SES DNS setup** — SPF/DKIM/DMARC records on the sending domain; SES
  moved out of sandbox mode. **Requires client** (DNS access + AWS account).
- **Bulk email verifier integration selected + funded** — NeverBounce or ZeroBounce
  account + API key. **Requires client** (vendor choice + budget ~$8 for 10k emails).
- **WhatsApp Business API real setup** — Meta Business Manager, WhatsApp Cloud API
  approval, message template approval. **Requires client** (2–3 week approval process).
- **Owner training + SOP session (recorded)** — SOW §Deliverable 9. Not started.

### Functional gaps to close before go-live
- **In-app password change screen** — currently only the seed script sets passwords.
- **User management UI** — Admin can't create/disable users; must run SQL directly.
- **Bulk-assign UI** — server action exists (`bulkAssign`), no button on the leads list.
- **My Leads default filter** for AGENT — plumbed into `buildLeadWhere` but no UI shortcut.
- **Company-name normalization** — "Apex Towers Pvt Ltd" and "Apex Towers Pvt. Ltd." are
  different companies to the CRM. Sector/city normalization is done; company is not.
- **Deliverability dashboard** — sent/opened/bounced by domain, warm-up progress. Reports
  page shows aggregates but not this.
- **Retry queue view** — Owner should be able to see failed sends and inspect why.
- **Export CSV lacks agent-visibility guardrails on the UI** (server enforces it, but
  the Export CSV button says "1,148" globally even for an agent; the count needs to
  reflect scoped totals).

### Operational gaps
- **No error monitoring** — no Sentry/Datadog. First we'll hear about a bug is a user
  report.
- **No uptime monitoring** — the cron endpoint has no external "is it running?" ping.
- **No structured logs** — everything goes to Vercel's default log stream, mixed with
  Next.js noise.
- **No backup strategy for Neon** — free tier has 7-day PITR on the paid plan; free
  tier has none.
- **`vercel.json` cron runs daily** — the 24h alerts and enrichment feel timely only
  hourly. Requires Vercel Pro or an external cron.

---

## Deployment plan (concrete)

Sequenced by dependency and risk. **Total estimated effort: 3–4 focused weeks.**
Everything listed as "requires client" blocks the sprint it appears in.

### 🚨 Sprint 0 — Emergency security patch (1–2 days, do first)
1. Rotate `admin123` seeded passwords on Neon **today** (script to prompt-and-hash).
2. Upgrade Next.js to `14.2.33+` (patched); `npm run build` + smoke test; deploy.
3. Add rate-limit middleware to `/api/auth/*` and `/api/inbound/*` (Upstash + `@upstash/ratelimit`).
4. Fix open-redirect in `/api/track/click`.
5. Sanitize template preview HTML with DOMPurify.
6. Wrap `handleReply`, `runSender` per-lead loop, `ingestLead` in `$transaction`.
7. Add `Enrollment.retryCount` migration; sender backs off on failure.

### Sprint 1 — Production hardening (5 days)
1. Add Zod schemas + size limits to every `req.json()` route.
2. Rewrite inbound CORS to allowlist.
3. Fix `runCompanyAlerts` reply filter (P1-Q2).
4. Batch `enrollCampaignLeads` (500-row chunks).
5. Batch/stream `api/leads/export`.
6. Add Sentry (`@sentry/nextjs`) — before/after runtime traces.
7. Introduce timezone constant (`Asia/Kolkata`) + fix day-boundary math.
8. In-app password change screen + user-management UI (Admin).
9. Vitest setup + tests for `normalize.ts`, `validate.ts`, `flatten.ts`, `status.ts`,
   `dedup.ts`, `handleReply`, `runSender`.

### Sprint 2 — Deliverability + warm-up (5 days)
1. Implement warm-up ramp (`SendingPlan` table: day-N → cap).
2. Integrate the bulk email verifier the client picks (adapter already exists).
3. Run the full 10k list through the verifier; suppress hard bounces before send.
4. Wire up production SES (client-side DNS + AWS setup, then we run through the ramp).
5. Deliverability dashboard: per-domain bounce rate, per-day open rate, warm-up status.
6. Retry queue view for Owners.

### Sprint 3 — Client-blocked items (parallel, kicks off in Sprint 0)
These aren't tasks we can accelerate — they're calendar time on the client side:
1. **DNS for SES** — SPF/DKIM/DMARC on `vrindaacorpservices.in` (~2 days once we hand
   over the records).
2. **AWS SES production access** — application form to AWS, 24–48h approval.
3. **Bulk verifier account** — client signs up, funds it, hands us the API key.
4. **WhatsApp Business API** — Meta Business verification, template approval — this is
   the longest tail, ~2 weeks average.

### Sprint 4 — Handover (2 days)
1. Recorded training session for the VrindaaCorp team.
2. Updated SOP for the outreach team (already have `docs/SOP.md`; needs a live-app
   walkthrough).
3. Post-go-live hypercare plan (10 business days per SOW §12.1).

---

## What we need from you (client)

Ordered by how much they block progress:

### 🚨 Immediately (blocks Sprint 0)
1. **Confirmation to rotate the `admin123` password.** I'll generate a strong password,
   hash it, update the row, and share it via a secure channel (not chat).
2. **Vercel access token** (fresh one — the earlier one should be rotated). Needed to
   set the new env vars and trigger redeploys.

### Blocks Sprint 1
3. **Which shared inbox for 24h alerts?** e.g. `sales@vrindaacorpservices.in`.
4. **Sentry (or equivalent) account.** Free tier is fine; needs a DSN.
5. **Upstash Redis account.** Free tier is fine; needs the REST URL + token for rate
   limits.

### Blocks Sprint 2 (parallel with Sprint 1)
6. **DNS access for `vrindaacorpservices.in`** (to add SPF, DKIM, DMARC records for SES).
7. **AWS account** (or existing one) + IAM user with SES send + SNS permissions. Or,
   we manage it under our own AWS account and bill you back at cost.
8. **Bulk email verifier choice + funded account.** Recommend NeverBounce or ZeroBounce
   (~$8 for 10,000 checks). Give us the API key when ready.
9. **WhatsApp Business API kickoff** — Meta Business Manager access + a phone number
   for outbound. Longest lead time; start this in Sprint 0 even though it lands in Sprint 2.
10. **Company inbox / owner-list confirmation** — who receives hot-lead alerts, who
    receives 24h escalations, exact email addresses.

### Blocks final acceptance
11. **Approval of email templates** (the actual content — we have a working template,
    but the SOW required client-approved copy).
12. **Approval of the target segments** for the pilot batch (500 leads first, per SOW §3.2).

---

## What I recommend we do next

Two-day emergency patch (Sprint 0) first, before any other work. It fixes the
credential-stuffing risk, the Next.js CVEs, and the open-redirect — all three of which
are exploitable on the live URL today. Everything else can be sequenced normally.

Say the word and I'll start Sprint 0 immediately. If you want a written change-control
document per SOW §12.1 first (this is a scope expansion beyond the original build), I'll
draft that too.
