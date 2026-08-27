# VrindaaCorp CRM — Handover & System Architecture Manual

---

## 1. Executive Summary & Technology Stack

VrindaaCorp CRM is an enterprise-grade Lead Management, Multi-Channel Campaign Outreach, and Intelligence platform built for B2B services.

### Core Stack
- **Framework**: Next.js 14 (App Router, Server Components & Server Actions)
- **Language**: TypeScript 5 (Strict Mode, 100% type-safe)
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js (Session-based RBAC: `OWNER`, `ADMIN`, `AGENT`)
- **Email Infrastructure**:
  - **Outbound**: Node.js SMTP / AWS SES with personalized sector template injection.
  - **Inbound**: ImapFlow IMAP client for real-time lead reply capture.
  - **Tracking**: In-house 1x1 GIF tracking pixel with deduplicated unique open analytics.
- **Analytics & Reporting**: Recharts, ExcelJS / SheetJS (`xlsx`) multi-sheet generator.

---

## 2. In-House Lead Import, Cleansing & Multi-Layer Validation Engine

The CRM includes a **100% in-house, zero-external-cost validation and cleansing pipeline** that processes CSV and Excel lead uploads without relying on third-party paid APIs (e.g. NeverBounce, ZeroBounce).

```
   ┌──────────────────────────────────────────────────────────┐
   │             Uploaded CSV / Excel Spreadsheet             │
   └─────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │            Stage 1: Column Mapping & Staging             │
   └─────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │        Stage 2: Normalization & Field Cleansing          │
   │  • Phone numbers -> E.164 (+91 XXXXX XXXXX)              │
   │  • Industry Sector -> Canonical (Healthcare, Mfg, etc.)  │
   │  • City & Regional Hub -> NCR, UP, Maharashtra, etc.     │
   │  • Name & Company -> Title-casing & whitespace trimming  │
   └─────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │       Stage 3: Deduplication (In-Batch & Database)       │
   └─────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │       Stage 4: 6-Layer Email Validation Engine           │
   │  1. RFC 5322 Syntax & Structure Check                    │
   │  2. Disposable/Burner Domain Filter (3,500+ Domains DB)  │
   │  3. Role-Based & Spam Trap Check (info@, sales@, admin@) │
   │  4. Levenshtein Typo Auto-Fix (gamil.com -> gmail.com)   │
   │  5. Live DNS MX Mail Server Handshake (dns.resolveMx)    │
   │  6. B2B Corporate vs Free Webmail Domain Classifier      │
   └─────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │         Stage 5: Automated Tag Assignment & Storage      │
   │  Tags: VALID, CORPORATE, FREE_WEBMAIL, RISKY, DISPOSABLE │
   └──────────────────────────────────────────────────────────┘
```

### Validation Layers in Detail
1. **RFC 5322 Syntax Check**: Rejects malformed addresses, consecutive dots, and invalid characters.
2. **Disposable/Burner Blocklist**: In-memory matching against 3,500+ known temporary email providers (`mailinator.com`, `tempmail.com`, `yopmail.com`, etc.).
3. **Role-Based Account Detection**: Flags generic inbox prefixes (`info@`, `admin@`, `support@`, `sales@`, `contact@`, `noreply@`, `office@`, `billing@`, `jobs@`) as `RISKY` to protect cold sending reputation.
4. **Domain Typo Detection & Correction**: Standard Levenshtein distance algorithm identifies near-misses of major providers and auto-corrects them (e.g. `gamil.com` &rarr; `gmail.com`, `yaho.com` &rarr; `yahoo.com`, `outlok.com` &rarr; `outlook.com`).
5. **Real-Time DNS MX Verification**: Uses Node.js native `dns.promises.resolveMx()` to verify that the domain has active, reachable mail exchange servers.
6. **Corporate vs Webmail Classification**: Automatically tags enterprise B2B domains (`@tcs.com`, `@infosys.com`) vs consumer addresses (`@gmail.com`, `@yahoo.com`).

---

## 3. Automated Outbound Cold Outreach & Dynamic Sector Templates

- **Sender Stamping**: Sends live outbound emails from `sales@vrindaacorp.com` with formatted headers `From: "VrindaaCorp Services" <sales@vrindaacorp.com>` and `Reply-To: sales@vrindaacorp.com`.
- **Dynamic Industry Matching**: Automatically selects and injects tailored copy matching the lead's sector (`Healthcare`, `Corporate`, `Manufacturing`, `Education`, `Industrial`, `Hospitality`) using token interpolation (`{{sector}}`, `{{industryHook}}`, `{{company}}`, `{{city}}`).
- **24/7 Manual Trigger & Scheduling**: Provides one-click instant execution (`⚡ Trigger Outreach Now`) with send window override alongside custom scheduling presets (`Tomorrow 09:30 AM`, `In 1 Hour`).

---

## 4. Real-Time Open Tracking & Inbound Reply Capture

### Open Tracking & Deduplication
- **Tracking Endpoint**: `/api/track/open?lead=[id]&e=[enrollmentId]` returns a 1x1 transparent GIF with `no-store` cache headers.
- **Unique Open Rate Metric**:
  $$\text{Open Engagement \%} = \frac{\text{Distinct Leads Who Opened}}{\text{Distinct Leads Sent}} \times 100\%$$
  Guarantees open rates never exceed 100%.
- **Multi-Open Badges**: When a lead opens multiple times, the campaign table displays **`OPENED (2x)`** or **`OPENED (3x)`**.
- **Proxy Debounce**: 5-second window prevents duplicate counts from automated security crawlers.

### Inbound Reply Detection via IMAP
- **Mailbox Poller** ([`lib/inbound/imap.ts`](file:///e:/AI/Vrindaacorp-CRM/lib/inbound/imap.ts)): Continuously polls `sales@vrindaacorp.com` (IMAP port 993).
- **Automated Workflow**:
  1. Matches incoming sender email against CRM leads.
  2. Records an `EmailEvent` of type `REPLIED` with message snippet and `messageId` deduplication.
  3. Advances lead stage to **`REPLIED`**.
  4. Tags lead as **`Hot Lead: true`** (🔥).
  5. **Pauses active cold sequence steps** to prevent redundant automated emails.
  6. Sends instant notification to assigned sales owner.

---

## 5. Executive Dashboard & Dynamic Report Export

- **Modern Light Theme**: Clean slate/teal executive styling with responsive KPI cards.
- **Multi-Filter Toolbar**: Filter by Timeframe (7D, 30D, 90D, 6M, YTD, All Time), Sector, Region, Owner, Campaign, and Validation Status.
- **Dynamic Excel Report Export** ([`app/api/reports/export/route.ts`](file:///e:/AI/Vrindaacorp-CRM/app/api/reports/export/route.ts)):
  - Generates multi-sheet `.xlsx` workbooks containing:
    1. `Executive Summary` (KPIs, engagement percentages, applied filter parameters).
    2. `Outreach Velocity` (Timeline of Sent, Opened, Clicked, Replied).
    3. `Pipeline Stages` (Counts and percentages).
    4. `Sector Distribution` (Industry market share).
    5. `Regional Hubs` (Geographic distribution).
    6. `Filtered Leads` (Full data table of matching leads).

---

## 6. Google Ads & Meta Ads Lead Ingestion

- **Webhooks**: Endpoints configured at `/api/inbound/google-ads` and `/api/inbound/meta-ads`.
- **Simulator & Verification**: Interactive test simulator in **Settings &rarr; Sources** for testing lead capture and webhook payloads without live ad spend.

---

## 7. Handover Checklist & Deployment Guidelines

### Environment Variables (`.env`)
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname"
NEXTAUTH_SECRET="your-32-char-random-secret"
NEXTAUTH_URL="https://yourdomain.com"
APP_URL="https://yourdomain.com"

# Outbound SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="sales@vrindaacorp.com"
SMTP_PASS="your-app-specific-password"
SMTP_FROM_EMAIL="sales@vrindaacorp.com"
SMTP_FROM_NAME="VrindaaCorp Services"

# Inbound IMAP
IMAP_HOST="imap.gmail.com"
IMAP_PORT="993"
IMAP_SECURE="true"
IMAP_USER="sales@vrindaacorp.com"
IMAP_PASS="your-app-specific-password"
```

### Build & Verification Commands
```bash
# 1. Run database migrations
npx prisma migrate deploy

# 2. TypeScript compilation check
npx tsc --noEmit

# 3. Production build
npm run build

# 4. Start CRM application
npm start

# 5. Start background worker (cron scheduler & IMAP poller)
npm run worker
```
