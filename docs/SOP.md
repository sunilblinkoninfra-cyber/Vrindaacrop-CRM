# VrindaaCorp CRM — Standard Operating Procedures (SOP)

Day-to-day operating guide for the outreach & CRM system. For install/setup see `README.md`.

## 1. Roles

| Role  | Can do |
|-------|--------|
| ADMIN | Everything: import, templates, campaigns, all leads, reports, user management |
| OWNER | Receives hot-lead alerts, manages assigned leads, views reports |
| AGENT | Works assigned leads, adds notes/tasks, moves pipeline stages |

## 2. Monthly outreach cycle

### 2.1 Import & clean a lead list (SOW 3.1)
1. **Import & Cleanup** → choose CSV/Excel → **Upload & preview**.
2. Confirm the auto column mapping (email is required). Adjust as needed.
3. **Deduplicate, validate & import**. Review the summary (imported / duplicates / invalid).
   - Duplicates = email already exists (in file or DB). Invalid = bad syntax / no MX / verifier rejection.
   - To reduce bounces below 3%, set `EMAIL_VERIFIER` (NeverBounce/ZeroBounce) in `.env`.

### 2.2 Segment
- In **Leads**, filter by sector / region / validation and bulk-tag as needed.
- Segments are re-used by campaigns (sector, region, validation, tag).
- **Sector** and **region** are auto-normalized on import (e.g. `MFG`/`Mfg` → `Manufacturing`;
  city `Gurgaon` → region `NCR`, with the city preserved in its own column). To re-clean older
  data after adjusting the maps in `lib/import/normalize.ts`, run
  `npx tsx scripts/normalize-existing.ts`.

### 2.3 Prepare templates (SOW 3.2)
- **Templates** → create the 3 drip emails per segment (initial + 2 follow-ups).
- Use tokens: `{{firstName}}`, `{{lastName}}`, `{{company}}`, `{{sector}}`, `{{unsubscribe}}`.
- Add a **Subject B** to A/B test open rates. Keep HTML mobile-friendly (single column, inline styles).

### 2.4 Build & launch a campaign
1. **Campaigns** → create → open it.
2. Set the **segment**, click **Preview count** (suppressed leads are always excluded).
3. Add **sequence steps** (step 1 = day 0; follow-ups with delay days, e.g. +3, +6).
4. **Activate**, then **Enroll matching leads**.
5. Keep `DAILY_SEND_CAP` between 500–1000 during warm-up. The worker respects this cap.

## 3. Handling replies (SOW 3.4)
- A reply auto-pauses the lead's sequence, marks it **Hot — Awaiting Owner Action**, moves it to
  the **Replied** stage, and alerts the owner via Email + WhatsApp.
- The owner opens the lead and clicks **Acknowledge hot lead** once actioned.
- If not acknowledged within `ESCALATION_HOURS` (default 48), a reminder is auto-sent.

## 4. Suppression & compliance
- Hard bounces and complaints are auto-suppressed; unsubscribes (one-click) are suppressed globally.
- Never remove someone from suppression to re-mail them.
- Content/audience lawfulness is the client's responsibility (per SOW §9 / §12.1).

## 5. Reporting (SOW 3.3)
- **Reports** shows monthly funnel, pipeline, sectors, and top templates.
- **Export Excel** for owner review meetings; **Export PDF** opens a print view (Save as PDF).

## 6. Operational checklist
- [ ] Worker (`npm run worker`) running as an always-on process.
- [ ] `APP_URL` publicly reachable (tracking + webhooks).
- [ ] SES configuration set → SNS → `/api/webhooks/ses?token=…` wired for delivery/bounce/complaint/open/click.
- [ ] SES inbound receiving → SNS → same endpoint for replies.
- [ ] Owner email + WhatsApp numbers set on OWNER users.
- [ ] Daily cap tuned for domain warm-up.

## 7. Troubleshooting
| Symptom | Check |
|---------|-------|
| Emails not sending | Worker running? Campaign ACTIVE? Leads enrolled? Daily cap reached? |
| No opens/clicks tracked | `APP_URL` reachable from recipients; SES config set/SNS wired |
| Replies not alerting | SES inbound → SNS → webhook; owner assigned or OWNER users exist |
| High bounce rate | Enable an email verifier; re-clean the list; slow the warm-up |
