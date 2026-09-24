# 🔐 VrindaaCorp Services — Master Access Vault & Credentials Register
**Confidential & Proprietary • Final Client Handover Document**  
*System: VrindaaCorp Enterprise CRM & Autonomous Outreach Infrastructure*  
*Handover Date: September 2026 • Document Version: 1.0 (Production Release)*

---

## 1. System Overview & Asset Metadata

| Parameter | Specification Details |
| :--- | :--- |
| **Client Legal Name** | VrindaaCorp / VrindaaCorp Services |
| **Public Web Portal** | [https://www.vrindaacorp.com](https://www.vrindaacorp.com) |
| **Enterprise CRM Portal** | [https://vrindaacorp-crm.tech](https://vrindaacorp-crm.tech) |
| **Primary Production VPS** | Hostinger KVM 8 (`srv1967428.hstgr.cloud`) |
| **Static IPv4 Address** | `200.234.47.7` |
| **Data Center Location** | India – Mumbai 2 |
| **Operating System** | Ubuntu 24.04 / 26.04 LTS (64-bit Linux) |
| **Hardware Specification** | 8 vCPU Cores, 32 GB RAM, 400 GB NVMe Storage, 32 TB Monthly Bandwidth |
| **Hosting Contract Expiration** | **2027-09-09** (Fully prepaid 3-year term) |
| **Warranty & Support** | 30-Day Engineering Bug-Fix Warranty included from handover date |

---

## 2. Infrastructure & Server Access Register

### 2.1 SSH / Terminal Access (Root Level)

> [!WARNING]
> Root access grants unrestricted control over the production filesystem, database, and process manager. Never distribute these credentials over unsecured channels.

| Attribute | Value / Configuration |
| :--- | :--- |
| **SSH Host / IP** | `200.234.47.7` (`srv1967428.hstgr.cloud`) |
| **SSH Port** | `22` (Standard OpenSSH) |
| **Default User** | `root` |
| **Authentication Type** | Password / Public-Key Supported |
| **Root Password** | `Agarwal@#2026` |
| **SSH Connect Command** | `ssh root@200.234.47.7` |
| **Web Server Root** | `/var/www/crm` (Production CRM Next.js application) |
| **Landing Page Root** | `/var/www/landing` (Public Marketing Portal) |
| **Evolution API Root** | `/var/www/evolution-api` (WhatsApp Gateway Docker stack) |

### 2.2 Process Manager (PM2) Services on Server

All core application services are managed via **PM2** under `root`, configured with automatic process resurrection on system reboots:

| PM2 ID | App Name | Mode | Port / Binding | Internal Path | Purpose |
| :---: | :--- | :---: | :---: | :--- | :--- |
| `0` | `vrindaa-web` | cluster | `127.0.0.1:3000` | `/var/www/crm` | Next.js 14 Web Application & API |
| `2` | `vrindaa-web` | cluster | `127.0.0.1:3000` | `/var/www/crm` | Next.js Worker Thread (Cluster Instance) |
| `1` | `vrindaa-worker` | fork | Background | `/var/www/crm` | Email Dispatcher, IMAP Poller, Briefings |
| `3` | `vrindaa-landing`| fork | `127.0.0.1:3001` | `/var/www/landing` | Public Corporate Web Portal |

---

## 3. Domains, DNS & SSL Certificates

### 3.1 Domain Ownership & Registrars

| Domain | Registrar | Primary Nameservers | SSL Certificate |
| :--- | :--- | :--- | :--- |
| **`vrindaacorp.com`** | BigRock | Custom / Cloudflare / BigRock DNS | Let's Encrypt / Auto-renew via Certbot |
| **`vrindaacorp-crm.tech`** | Hostinger | `ns1.dns-parking.com`<br/>`ns2.dns-parking.com` | Let's Encrypt SSL (Wildcard / HTTPS Port 443) |

### 3.2 Production Nginx Reverse Proxy & SSL Mapping

Nginx terminates TLS on port `443` and handles HTTP-to-HTTPS redirection on port `80`.

- **Configuration File:** `/etc/nginx/sites-available/vrindaacorp-crm.tech`
- **SSL Certificates:**
  - Fullchain: `/etc/letsencrypt/live/vrindaacorp-crm.tech/fullchain.pem`
  - Private Key: `/etc/letsencrypt/live/vrindaacorp-crm.tech/privkey.pem`
- **Auto-Renewal:** Managed via Systemd Certbot timer (`certbot renew --dry-run`).

---

## 4. CRM Application Authentication & User Vault

The CRM uses **NextAuth.js** with bcrypt-hashed credentials (salt cost factor: 12) to thwart timing attacks and email enumeration.

### 4.1 Production Super Admin Accounts

| Account Type | Email Address | Initial Default Password | Configured Role | Access Level |
| :--- | :--- | :--- | :---: | :--- |
| **Super Admin (CRM)** | `admin@vrindaacorp.com` | `admin123` | `ADMIN` | Unrestricted global CRM admin rights |

> [!IMPORTANT]
> Change the default seed password (`admin123`) immediately upon first login via **Account Settings** or **Settings &rarr; Users**.

### 4.2 Role-Based Access Control (RBAC) Matrix

| Capability / Module | `ADMIN` | `OWNER` | `AGENT` (Field Staff) |
| :--- | :---: | :---: | :---: |
| **Dashboard & Lead Management** | Full | Full | Assigned Leads Only |
| **Visual Sales Pipeline (Kanban)** | Full | Full | Read/Update Assigned |
| **Import & In-House Data Cleansing** | ✅ Allowed | ✅ Allowed | ❌ Blocked (Redirected) |
| **Campaign Sequence Builder & Outreach** | ✅ Allowed | ✅ Allowed | ❌ Blocked (Redirected) |
| **Email Template Editor & AI Refinement** | ✅ Allowed | ✅ Allowed | ❌ Blocked (Redirected) |
| **Team Management & Mailbox Settings** | ✅ Allowed | ✅ Allowed | ❌ Blocked (Redirected) |
| **WhatsApp AI Co-Pilot & Directives** | ✅ Global | ✅ Executive | ❌ No Directive Editing |

---

## 5. PostgreSQL Database Credentials

The database runs natively on PostgreSQL 16 on the VPS host with external ports firewalled to local connections only.

| Parameter | Value |
| :--- | :--- |
| **Database Engine** | PostgreSQL 16.x |
| **Database Host** | `localhost` / `127.0.0.1` (Port `5432`) |
| **Database Name** | `vrindaacorp_crm` |
| **Database User** | `vrindaa` |
| **Database Password** | `vrindaa` *(Production local socket access)* |
| **Connection String** | `postgresql://vrindaa:vrindaa@localhost:5432/vrindaacorp_crm?schema=public` |
| **Prisma Schema File** | `/var/www/crm/prisma/schema.prisma` |
| **Active DB Records** | 1,196+ Enterprise leads, 24 Relational Models |

---

## 6. WhatsApp Autonomous Gateway (Evolution API)

The self-hosted WhatsApp Gateway allows bidirectional communication with zero per-template or per-conversation Meta Cloud API fees.

| Configuration Key | Production Setting | Description |
| :--- | :--- | :--- |
| **Service Engine** | Evolution API v2.1.2 | Dockerized Baileys WhatsApp Web Engine |
| **Internal Endpoint** | `http://127.0.0.1:8080` | Internal VPS Docker socket binding |
| **Global API Key** | `vrindaacorp-evolution-key` | Secured header authentication key |
| **Instance Identifier** | `vrindaacorp-crm` | Dedicated CRM WhatsApp instance |
| **Webhook Delivery URL** | `http://127.0.0.1:3000/api/webhooks/whatsapp-evolution` | Local fast-path Next.js webhook listener |
| **QR Code Pairing** | Available via CRM UI | `/settings/whatsapp` (Clean QR-only scanner) |

---

## 7. Local Ollama AI Engine (VPS On-Premise)

An on-premise Large Language Model runs directly on the VPS CPU/RAM, providing 100% private, zero-token-cost intelligence for email copywriting and WhatsApp conversation parsing.

| Property | Value |
| :--- | :--- |
| **Ollama Service Port** | `11434` (`http://127.0.0.1:11434`) |
| **Primary Production Model** | `llama3.2:3b` *(Optimized for warm, ultra-low latency execution: ~55 tokens/sec)* |
| **Alternative Installed Model** | `llama3.1:8b` *(High-reasoning general model)* |
| **Model Warming Status** | Pre-warmed via systemd daemon on boot |
| **Enforced Meeting Link** | `https://calendly.com/vrindaacorp-sales/30min` |

---

## 8. Inbound Mailbox & Email Delivery (SMTP / IMAP)

| Channel | Protocol | Host / Port | Credentials / Username | Security Notes |
| :--- | :---: | :--- | :--- | :--- |
| **Outbound Email** | SMTP | `smtp.gmail.com`<br/>Port `587` | `sales@vrindaacorp.com`<br/>*Google App Password* | TLS / STARTTLS enabled; sender stamped as "VrindaaCorp Services" |
| **Inbound Reply Polling**| IMAP | `imap.gmail.com`<br/>Port `993` | `sales@vrindaacorp.com`<br/>*Google App Password* | SSL/TLS; polled every 30s by `vrindaa-worker` |
| **AWS SES (Optional Fallback)**| SES API | `ap-south-1` (Mumbai) | AWS Access Key & Secret | Pre-configured in `.env.example` for massive volume |

---

## 9. Security Webhooks & Inbound Form Secrets

These secrets authenticate external webhook events coming into the CRM:

| Webhook Route | Authentication Header / Parameter | Secret Value / Key Name |
| :--- | :--- | :--- |
| `/api/inbound/form` | `X-Form-Secret` or `?token=` | `INBOUND_FORM_SECRET` |
| `/api/webhooks/ses` | `?token=` query parameter | `SES_WEBHOOK_SECRET` |
| `/api/cron` | `Authorization: Bearer <secret>` or `?token=` | `CRON_SECRET` |
| `/api/inbound/meta` | `hub.verify_token` & `X-Hub-Signature-256` | `META_VERIFY_TOKEN` / `META_APP_SECRET` |
| `/api/inbound/google`| Webhook Authorization Key | `GOOGLE_LEAD_KEY` |

---

## 10. Backup Schedule & Disaster Recovery

### 10.1 Hostinger Automated VPS Snapshots
- **Frequency:** Weekly automated full-image hypervisor snapshot.
- **Retention:** 2 active snapshot points stored off-host in Hostinger cloud infrastructure.
- **Restoration Time:** < 15 minutes to bare-metal state via Hostinger hPanel.

### 10.2 Daily Database Cron Dump
- **Cron Schedule:** `0 2 * * *` (02:00 AM IST nightly)
- **Backup Command:**
  ```bash
  pg_dump -U vrindaa -d vrindaacorp_crm -F c -b -v -f /var/backups/crm/vrindaacorp_crm_$(date +\%Y\%m\%d).dump
  ```
- **Local Directory:** `/var/backups/crm/` (Retained for 30 rolling days).

---

## 11. Engineering Warranty & Support Service Level Agreement (SLA)

The deployment is covered by a **30-Day Technical Bug-Fix Warranty** beginning upon formal client handover:

```mermaid
journey
    title 30-Day Engineering Warranty Support Lifecycle
    section Handover
      System Audit & Access Verification: 5: Engineering, Client
      Credentials Registered in Vault: 5: Engineering
    section 30-Day Active Warranty
      Sev-1 Blocker (Outreach / DB down): 5: 2h Response / 8h Resolution
      Sev-2 Major Issue (IMAP / Sync issue): 4: 4h Response / 24h Resolution
      Sev-3 Minor Glitch (UI / Form issue): 3: 8h Response / 72h Resolution
      Sev-4 Feature / Content Tweaks: 3: Next Scheduled Deployment
    section Post-Warranty Transition
      Standard Retainer / Maintenance: 5: Client Operations
```

### SLA Severity Matrix

| Severity Level | Definition | First Response Time | Target Resolution Time |
| :--- | :--- | :---: | :---: |
| **Sev-1 (Critical)** | Core CRM down, database corrupted, email sequence completely halted, or security breach. | **< 2 Hours** | **6 – 8 Hours** |
| **Sev-2 (Major)** | WhatsApp notifications failing, IMAP reply ingestion delayed, or CSV import errors. | **< 4 Hours** | **< 24 Hours** |
| **Sev-3 (Moderate)**| Visual glitch, report export formatting anomaly, or single-user authentication issue. | **< 8 Hours** | **< 72 Hours** |
| **Sev-4 (Minor)** | Minor text adjustments, template prompt suggestions, or cosmetic improvements. | **< 24 Hours** | Next Patch Cycle |

---
*End of Master Access Vault. Keep this document stored in an encrypted offline password manager or secure corporate archive.*
