# In-house lead/email validation system (ZeroBounce-style)

## Context

Right now email quality checking (`lib/import/validate.ts`) only does syntax + MX-record
presence + a hardcoded role-account list, with an already-built but unused pluggable
adapter for a paid external verifier (NeverBounce/ZeroBounce — nobody has funded an
account, and `docs/AUDIT_AND_PLAN.md` still lists that as a client-blocked item). There's
no disposable-email detection, no typo-domain hints, and — the actual differentiator of a
service like ZeroBounce — no check of whether a *specific mailbox* exists.

The user wants an in-house system that gets as close to that as is reasonably buildable,
including real SMTP mailbox probing. They were told explicitly that Vercel's underlying
AWS infra blocks outbound port 25 by default, so the probe will likely resolve "unknown"
for most/all leads in production until a relay/VPS with port 25 open exists — and chose to
build it anyway, so it's ready the moment a working relay path exists. Everything is
designed to fail open: nothing here ever blocks a lead from being created or throws up the
import/inbound pipeline.

There's also an existing real gap this closes: a real SES hard bounce today only sets
`isSuppressed=true` — it never downgrades `validationStatus`, so a lead validated "VALID"
at import keeps showing "VALID" forever even after we know for a fact the mailbox bounced.

## Design: two layers feeding one status

1. **Local layer (synchronous, runs at lead-creation time, extends `lib/import/validate.ts`)**
   — syntax → external verifier if configured (unchanged) → disposable-domain check →
   role-account (existing) → typo-domain suggestion → MX lookup (existing). No new network
   dependency beyond DNS. This is what both `lib/import/process.ts` (bulk CSV) and
   `lib/inbound/ingest.ts` (website/Meta/Google inbound) call today, so it must stay fast.

2. **SMTP probe layer (asynchronous, batched via cron, new `lib/import/smtp-probe.ts` +
   `lib/outreach/revalidate-leads.ts`)** — connects to the domain's MX host on port 25,
   does the HELO/MAIL FROM/RCPT TO handshake without sending `DATA`, and reads whether the
   mailbox was accepted or rejected. Includes catch-all detection (probe a deliberately
   fake address at the same domain; if that's also accepted, the domain accepts everything
   and the earlier result can't be trusted). Every code path resolves to `unknown` on
   timeout/refusal/exception — it never throws, never retries indefinitely, and only
   *tightens* a status (can flip `UNKNOWN`/`VALID` → `INVALID`/`CATCH_ALL`, never loosens
   something the local layer or a real bounce already rejected). Runs from
   `app/api/cron/route.ts`, same pattern as the existing `runEnrichment` (contract AI)
   batch job.

A real SES hard bounce becomes the strongest signal of all — stronger than either
verification layer — and permanently sets `validationStatus=INVALID`.

## Prisma schema changes (`prisma/schema.prisma`)

- Extend `enum ValidationStatus` with `DISPOSABLE` and `CATCH_ALL`.
- Add to `model Lead`: `validationReason String?`, `validationCheckedAt DateTime?`,
  `smtpCheckedAt DateTime?` (nullable — distinguishes "never probed" from "probed,
  inconclusive" so the cron query stays cheap), `@@index([smtpCheckedAt])`.
- New `model DomainReputation { domain String @id, isCatchAll Boolean @default(false),
  mxHost String?, lastCheckedAt DateTime @default(now()) }` — caches the (expensive)
  catch-all probe per domain instead of re-probing every lead at that domain.
- Migration: `npx prisma migrate dev --name add_email_validation_layers`. Purely additive
  (nullable/defaulted columns, additive enum values) — no data-loss risk. Backfill
  `validationCheckedAt = createdAt` for existing rows in the generated SQL so the
  revalidation cron doesn't try to reprocess the entire existing ~1,150-lead table in one
  burst on first deploy.

## `lib/import/validate.ts` changes

- Add dependency `disposable-email-domains` (npm, MIT, offline JSON list — no per-check
  network call) for `isDisposableDomain()`.
- Add a small hand-written `levenshtein()` + `suggestTypoCorrection()` against a short
  common-provider list (gmail.com, yahoo.com, outlook.com, hotmail.com, rediffmail.com,
  icloud.com, yahoo.co.in, hotmail.co.in).
- Change `validateEmail()`'s return type from a bare `EmailCheck` string to
  `{ check: EmailCheck /* now includes "disposable" */, reason: string | null,
  typoSuggestion?: string }`. This is a breaking signature change — both call sites need
  updating.
- Move the `EmailCheck → ValidationStatus` map into this file as an exported
  `localCheckToValidationStatus`, so `process.ts` and `ingest.ts` share one source of
  truth instead of each keeping their own copy of `statusMap` (they currently duplicate
  it identically).
- Keep existing MX caching and fail-open behavior exactly as-is.
- Policy: disposable domains are **imported but flagged**, not hard-rejected (consistent
  with the module's existing philosophy — only a syntax failure hard-rejects). Exclusion
  from actual sending is enforced later, at the segment/sender level (below), not at
  import time.

## New `lib/import/smtp-probe.ts`

- `pickBestMx(domain)`, `probeMailbox(email, mxHost)`, `isCatchAllDomain(domain, mxHost)`
  (checks/writes `DomainReputation` cache, ~30-day TTL).
- Raw `net.createConnection({ port: 25, ... })` (Node's `net` module — already available,
  all relevant routes run `export const runtime = "nodejs"`), 5s timeout, destroys the
  socket and resolves `unknown` on any failure. Response code `250/251` → accepted,
  `550/551/553` → definitively rejected, anything else → `unknown`.
- Fully decoupled from `validate.ts` — only ever called from the batch cron job, never
  from the synchronous create path.

## `lib/outreach/revalidate-leads.ts` (new, mirrors `lib/ai/contract.ts`'s `runEnrichment`)

- `runEmailRevalidation(limit = 25)`: selects leads where `smtpCheckedAt` is null or older
  than `env.validation.revalidateDays` (default 30), `isSuppressed: false`,
  `validationStatus` not already `INVALID`/`DISPOSABLE`, ordered oldest-first.
- Per lead: no MX → leave as-is, just stamp `smtpCheckedAt`. Catch-all domain → set
  `CATCH_ALL`. Otherwise probe: confirmed-invalid → `INVALID`; confirmed-valid → upgrade
  only if current status is `UNKNOWN`/`RISKY` (never resurrects a `DISPOSABLE`/bounce-
  confirmed `INVALID`); `unknown` → leave `validationStatus` untouched.
- **Always** stamps `smtpCheckedAt = now()` regardless of outcome, wrapped in try/catch —
  critical because most probes will likely resolve `unknown` given the port-25 constraint,
  and without this stamp the same batch gets reselected every single cron run forever,
  burning the whole `maxDuration=300` budget on leads that can never succeed until a relay
  exists.
- Add `env.validation = { smtpProbeEnabled: process.env.SMTP_PROBE_ENABLED !== "false",
  revalidateDays: ... }` to `lib/env.ts` so it can be killed via env var without a
  redeploy once it's confirmed port 25 is a dead end in production, without touching the
  local layer.
- Wire into `app/api/cron/route.ts` alongside the existing `runSender`/`runEscalation`/
  `runCompanyAlerts`/`runEnrichment`/`runContractReminders` calls, same `JobRun` logging
  pattern.

## Bounce feedback loop — `lib/outreach/events.ts`

Extend `suppressLead()`: when `reason === SuppressionReason.HARD_BOUNCE`, also set
`validationStatus: INVALID, validationReason: "SES hard bounce", validationCheckedAt: now()`
on the lead update it already does. Complaints stay untouched (a complaint is a consent
signal, not a deliverability signal). No change needed in `app/api/webhooks/ses/route.ts`
itself — it already calls `suppressLead` with the right reason.

## Enforcement, not just labeling

- `lib/leads-query.ts` `buildLeadWhere`: add a `validationNot` comma-list param (exclude
  set), used by `segmentToWhere` unconditionally to exclude `INVALID`/`DISPOSABLE` from
  campaign segments by default — keeps the leads-list UI's existing single-value
  `validation` filter (for browsing) separate from this exclude-set (for sending).
- `lib/outreach/sender.ts` `runSender()`: next to the existing `if (lead.isSuppressed)`
  guard (~line 46), add the same pause-and-skip for `lead.validationStatus === "INVALID"
  || "DISPOSABLE"` — `pausedReason: "invalid_email"`. This is what actually matters: a
  lead enrolled before it was later reclassified (by the revalidation cron or a real
  bounce) must stop being sent to, not just show a red badge.

## UI

- `components/ui.tsx`: merge validation-status tones into the existing `stageStyles` map
  used by `Badge` (VALID emerald, RISKY amber, INVALID red, UNKNOWN slate, DISPOSABLE
  orange, CATCH_ALL violet) — no `Badge` signature change needed since the enums' keys
  don't collide.
- `app/(app)/leads/page.tsx` (~line 93): replace the plain-text validation cell with
  `<Badge tone={l.validationStatus}>`, `title` attribute showing `validationReason`.
- `app/(app)/leads/[id]/detail-client.tsx`: small inline block (not a whole new file —
  it's a handful of fields, unlike the contract-intelligence card) showing status badge,
  reason, "last checked" timestamps, and typo-suggestion hint if present.
- `app/(app)/leads/filters.tsx` (~line 52-58): add `DISPOSABLE`/`CATCH_ALL` options to the
  existing validation `<Select>`.
- `app/(app)/page.tsx` (dashboard): one more `StatCard` — invalid/disposable count,
  sourced from a `prisma.lead.count` alongside the file's existing totals query.

## Verification

1. `npx prisma generate && npx tsc --noEmit` — catches every remaining call site still
   using the old bare-string `validateEmail` return.
2. `npx prisma migrate dev --name add_email_validation_layers` against local Docker
   Postgres; confirm new table/columns/enum values.
3. Interactive smoke test of `validateEmail` against known cases: disposable
   (`test@mailinator.com`), role (`admin@realcompany.com`), typo (`x@gmial.com`), no-MX
   domain — confirm `check`/`reason`/`typoSuggestion`.
4. Run a small CSV through `/import` covering those cases; confirm `Lead.validationStatus`/
   `validationReason` match and import speed is unaffected (Layer 1 adds no new network
   round-trips beyond the MX lookup that already existed).
5. `curl` an inbound webhook with a disposable-domain email; confirm the lead is created
   (not rejected) and flagged `DISPOSABLE`.
6. `curl` the SES webhook with a synthetic hard-bounce payload for a test lead; confirm
   `validationStatus` flips to `INVALID` and a `Complaint` payload leaves it untouched.
7. `curl` `/api/cron?token=...`; confirm `smtpCheckedAt` gets stamped even when the probe
   times out (the fail-open guarantee), and a `JobRun` row is written.
8. Flip a test lead with an active enrollment to `INVALID` and run the sender path;
   confirm the enrollment gets `PAUSED`/`pausedReason: "invalid_email"` with no SES call.
9. Browser smoke test: `/leads` shows colored badges + filter options, lead detail shows
   the new block, dashboard shows the new stat card.
