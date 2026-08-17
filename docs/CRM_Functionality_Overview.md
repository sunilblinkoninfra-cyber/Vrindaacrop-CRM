# VrindaaCorp CRM — System Overview & Technical Reference

**Prepared for:** VrindaaCorp Services — Business Owners & Technical Lead
**Live URL:** https://vrindaacrop-crm-one.vercel.app
**Source repository:** github.com/sunilblinkoninfra-cyber/Vrindaacrop-CRM
**Document date:** August 2026 · **Version:** 1.0

---

## How to Read This Document

| Reader | Focus sections | What they'll get |
|---|---|---|
| Client / Business Owner | 1–5 | Plain-language walkthrough of every feature and business workflow — no technical background required. |
| Technical Lead | 6–10 | Architecture, data model, integrations, security posture, and deployment details. |

---

## 1. Executive Summary

VrindaaCorp CRM replaces the manual, spreadsheet-driven approach to managing VrindaaCorp Services' ~10,000-lead database with a single system covering four connected functions: cleaning up and organizing the lead list, running automated multi-step email outreach, tracking every lead through a sales pipeline, and alerting the business the moment a lead replies.

It was built as a custom, fully-owned application rather than a rented SaaS subscription — no per-seat licensing fees, complete control over lead data, and room to extend the system as the business grows.

**What it solves:**
- No more manually tracking which leads were emailed, when, and whether they replied.
- No more inconsistent or duplicate outreach to the same contact.
- No more missed "hot" leads sitting unanswered in an inbox.
- No more guessing what's working — open rates, reply rates, and pipeline health are visible on one screen.

**At a glance:**
- 1,148+ leads currently loaded and segmented by sector, city, and region
- Automated 3-step email sequences with AI-personalized or template-based copy
- Real-time tracking of opens, clicks, replies, and bounces
- Instant owner alerts (Email + WhatsApp) when a lead responds, with 48-hour escalation
- Live dashboard and exportable reports (Excel / PDF) for management review

---

## 2. Core Business Functionality

The CRM has seven screens, reached from the left sidebar after login.

### 2.1 Dashboard
The landing screen. At-a-glance view of the whole operation: total leads and how many are currently "Hot" (replied, awaiting owner action); active campaign count and suppressed (bounced/unsubscribed) count; email funnel (sent/opened/clicked/replied/bounced, as counts and %); pipeline snapshot across all seven stages.

### 2.2 Leads
The master contact list, filterable by sector, city/region, pipeline stage, and email-validity status. Clicking a lead opens a full profile with contact details and tags, a complete activity timeline (every email sent/opened/clicked, every reply), notes and assignable follow-up tasks, a one-click "Acknowledge" for hot leads, and a "Suppress" action to permanently stop emailing someone. The filtered list exports to CSV any time — useful for bounce-rate checks or sharing with a bulk verification service.

### 2.3 Pipeline
A Kanban board with every lead as a card across seven stage columns (New → Contacted → Replied → Qualified → Proposal Sent → Won/Lost). Moving a card is one click and automatically logs the change to that lead's timeline.

### 2.4 Import & Cleanup
Where new lead lists (Excel/CSV) come in. Fully automated:
- **Column mapping** — auto-detects which spreadsheet column is email, name, company, etc.
- **Deduplication** — any contact already in the system, or duplicated in the same file, is skipped and reported.
- **Email validation** — checks syntax and mail-server reachability before import; malformed addresses are rejected and flagged.
- **Sector & region cleanup** — inconsistent entries (e.g. "MFG" vs "Mfg", or a raw city like "Gurgaon") are standardized into one sector name and a proper region (NCR, UP, Rajasthan, etc.).

Every import ends with a summary: rows imported, duplicates skipped, validation failures — nothing happens silently.

### 2.5 Campaigns
Where outreach sequences are built and launched: a target segment (e.g. "Healthcare in NCR"), previewed as a lead count before launch; a sequence of emails each with a delay in days (Day 0 → Day 3 → Day 6); a Draft/Active/Paused status. Once active, matching leads are enrolled and emails send automatically in the background, respecting a configurable daily cap to protect sender reputation.

### 2.6 Templates & AI-Personalized Email
Each campaign step uses a template, written one of two ways:
- **Standard template** — fixed HTML with placeholders (first name, company) filled per recipient; supports A/B subject testing.
- **AI-generated email** — the system asks an AI model to write a unique email for every lead, using their actual name, company, and sector, based on a short brief written once (e.g. "Introduce our facility management services and ask for a 15-minute call"). A live preview shows a sample before launch. If the AI is unavailable, it falls back to a personalized standard template automatically — outreach never stops.

### 2.7 Reports
Monthly trend of sent/opened/replied over six months; pipeline distribution by stage and by sector as charts; top templates ranked by open rate; one-click export to Excel (multi-sheet) or a print-ready PDF for owner/board review.

---

## 3. The Reply & Hot-Lead Workflow

The feature most directly tied to not losing a sale. When any lead replies, this happens automatically within moments:

1. The reply is detected and logged to that lead's timeline.
2. The lead is tagged **"Hot — Awaiting Owner Action"** and moves to the "Replied" stage.
3. Any further scheduled emails to that lead are automatically paused.
4. The assigned owner is notified by **Email and WhatsApp** with the lead's name, company, and a direct CRM link.
5. If unacknowledged after **48 hours**, a reminder is sent automatically.

This is the core promise of the original brief: the system handles volume and tracking automatically, so the business only spends time on conversations that actually need a human.

---

## 4. User Roles & Access

| Role | Can do |
|---|---|
| Admin | Full access: import leads, manage templates/campaigns, view/manage all leads, run reports, manage users. |
| Owner | Receives hot-lead alerts (Email + WhatsApp), manages assigned leads, views reports. |
| Agent | Works assigned leads, adds notes/tasks, moves pipeline stages. |

Two accounts exist today (Admin, Owner). Passwords should be changed from the seeded defaults before live use — an in-app change-password screen has been requested but not yet built.

---

## 5. Current Data Snapshot

| Metric | Value |
|---|---|
| Total leads loaded | 1,148 |
| Contacts recovered from multi-contact company records | 1,145 (from a 5,813-row raw NCR facility-management list) |
| Sectors after cleanup | B&I, Manufacturing, Healthcare, Education, Corporate, Industrial (duplicates like "MFG"/"Mfg" merged) |
| Regions after cleanup | NCR, Rajasthan, UP, Uttarakhand, Punjab, Haryana, and others — derived automatically from each contact's city |

---

## 6. Technical Architecture

### 6.1 Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router, TypeScript) | Single app serving both UI and API — no separate backend to deploy. |
| Database | PostgreSQL via Prisma ORM | Hosted on Neon (serverless Postgres); schema fully version-controlled as Prisma migrations. |
| Styling / UI | Tailwind CSS | Shared component library in `components/ui.tsx`. |
| Authentication | NextAuth.js (credentials provider) | Session-based login; role (ADMIN/OWNER/AGENT) checked in middleware on every protected route. |
| Email sending & tracking | Amazon SES (SESv2 API) + SNS webhooks | Outbound sending, delivery/bounce/complaint events, inbound reply detection. |
| AI email generation | Anthropic Claude API (`claude-opus-5`) | Structured JSON output (subject + HTML) per lead; falls back to a deterministic template if unavailable. |
| Owner notifications | Amazon SES (email) + Meta WhatsApp Cloud API | Both channels behind a single `Notifier` interface, pluggable. |
| Hosting | Vercel | Serverless; auto-deploys from the GitHub `main` branch. |
| Scheduled jobs | Vercel Cron → `/api/cron` | Serverless replacement for a traditional always-on worker process. |

### 6.2 Data Model (Core Entities)

- **Lead** — contact record with sector, city, region, pipeline stage, validation status, suppression flag, hot-lead flag.
- **Campaign / SequenceStep / EmailTemplate** — outreach sequences and content, including AI-generation settings (`aiEnabled`, `aiBrief`).
- **Enrollment** — join between a Lead and a Campaign; tracks current step, next-send time, state (active/paused/completed).
- **EmailEvent** — append-only log of Sent/Delivered/Opened/Clicked/Replied/Bounced/Complained/Unsubscribed events, keyed to the SES message ID for webhook correlation.
- **Suppression** — global do-not-email list, auto-populated from hard bounces, spam complaints, and unsubscribes.
- **Notification** — tracks each hot-lead alert and whether it's been acknowledged (drives the 48h escalation).
- **User** — role-based accounts (ADMIN/OWNER/AGENT).

All schema changes are tracked as numbered Prisma migrations under `prisma/migrations` — a full, replayable history of every structural DB change.

### 6.3 Import & Data-Cleaning Pipeline

Located under `lib/import/`. Runs synchronously on upload for typical files, or via a CLI script (`scripts/import-file.ts`) for very large files that would exceed an HTTP request's time limit.

1. **Parse** (`parse.ts`) — reads CSV/XLSX, auto-detects column-to-field mapping by header name.
2. **Flatten** (`flatten.ts`) — detects account-centric spreadsheets where one row embeds multiple contacts (found in the client's real NCR data, up to 7 contact blocks per row) and explodes them into individual leads.
3. **Deduplicate** (`dedup.ts`) — normalizes email addresses, checks both within the current file and against all existing leads.
4. **Validate** (`validate.ts`) — syntax check + MX-record lookup; fails *open* (flags "risky" rather than rejecting) if DNS is temporarily unreachable, so infra hiccups never silently discard good leads. An optional bulk verifier (NeverBounce/ZeroBounce) can be plugged in via env var.
5. **Normalize** (`normalize.ts`) — canonicalizes sector names and maps raw city text to a standard region.

### 6.4 Outreach Engine & Scheduling

The sender (`lib/outreach/sender.ts`) runs on a schedule rather than continuously, since Vercel is serverless:

- A Vercel Cron job calls `GET /api/cron` daily by default (configurable in `vercel.json`), protected by a `CRON_SECRET` bearer token.
- Each run finds enrollments due to send, respects a configurable daily volume cap, renders the email (AI or template), injects open/click tracking + unsubscribe link, sends via SES, and schedules the next step.
- The same logic is available as a long-running process (`npm run worker`) for non-serverless deployments or faster local iteration.
- The same cron run checks for hot leads unacknowledged for 48+ hours and fires the escalation reminder.

### 6.5 Tracking & Webhooks

| Endpoint | Purpose |
|---|---|
| `GET /api/track/open` | 1×1 tracking pixel; records an Opened event. |
| `GET /api/track/click` | Rewrites outbound links; records a Clicked event, then redirects. |
| `POST /api/webhooks/ses` | Handles SNS subscription confirmation, SES delivery/bounce/complaint events, and SES inbound-receiving (reply detection). Auth via shared-secret token on the URL. |
| `GET/POST /api/unsubscribe` | One-click, RFC 8058-compliant opt-out; adds the address to the global Suppression list. |

### 6.6 AI Email Generation

`lib/ai/generate.ts` calls the Anthropic Messages API with a structured JSON output schema (`{subject, bodyHtml}`), grounded in a fixed description of VrindaaCorp's services so the model never invents facts about the company. Thinking is disabled and effort is set to "low" to keep latency/cost predictable at volume. If no API key is configured, or the call fails for any reason, the system transparently falls back to a deterministic, still-personalized template.

### 6.7 Security & Data Handling

- All routes except auth, tracking pixels, webhooks, and the cron endpoint require a logged-in session (`middleware.ts`).
- Secrets (DB URL, SES/AWS creds, Anthropic key, WhatsApp token, NextAuth secret, cron secret) live only as Vercel environment variables — never committed (`.env` is git-ignored, verified before every push).
- Database connection uses Neon's **pooled** connection string, appropriate for serverless (many short-lived concurrent connections).
- Webhook endpoints are protected by a shared-secret token, not open to unauthenticated calls.
- Suppression (hard bounces, complaints, unsubscribes) is automatic and cannot be bypassed by re-enrolling a lead in a new campaign.

### 6.8 Deployment & Environments

| Environment | Details |
|---|---|
| Source control | GitHub — `github.com/sunilblinkoninfra-cyber/Vrindaacrop-CRM` (branch: `main`) |
| Hosting | Vercel, auto-deploying from `main` on every push |
| Database | Neon Postgres (project: VrindaaCorp-CRM), pooled connection |
| Local development | Docker Compose (local Postgres) + `npm run dev` + `npm run worker` for background sending |

Full deployment runbook: `DEPLOY.md` in the repo root. Day-to-day operating procedures for the outreach team: `docs/SOP.md`.

---

## 7. Known Limitations & Suggested Next Steps

- **In-app password change** — currently set only via the DB seed script; a self-service screen has not been built.
- **Production SES sending** — the sending domain still needs SPF/DKIM/DMARC configured and SES moved out of sandbox mode before real campaigns can reach inboxes at volume.
- **Bulk email verification** — NeverBounce/ZeroBounce integration is supported but no provider has been selected/configured yet.
- **AI content review** — AI-generated emails currently send automatically; a "generate draft → approve → send" gate could be added if content oversight is required.
- **WhatsApp Business API approval** — owner WhatsApp alerts require a verified Meta Business/WhatsApp Cloud API setup (client-side dependency).
