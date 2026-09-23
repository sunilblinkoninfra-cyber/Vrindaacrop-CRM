# VrindaaCorp CRM — Autonomous AI Agent & WhatsApp Co-Pilot Setup Guide

This guide details how to configure, pair, and run the autonomous AI Agent on your **32GB RAM / 8 vCPU VPS** with **Ollama (`llama3.1:8b`)** and the **Evolution API WhatsApp Gateway**.

---

## 1. System Overview

```
                      ┌────────────────────────────────────────┐
                      │            VrindaaCorp VPS             │
                      │       (32GB RAM / 8 vCPU Ubuntu)       │
                      └───────────────────┬────────────────────┘
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼                                 ▼                                 ▼
 ┌──────────────┐                 ┌──────────────┐                  ┌──────────────┐
 │  Next.js CRM │◄───────────────►│    Ollama    │                  │Evolution API │
 │ (Port 3000)  │  Tool Calling   │ (Port 11434) │                  │ (Port 8080)  │
 │  PM2 Cluster │                 │ Llama 3.1 8B │                  │ Docker/QR    │
 └──────┬───────┘                 └──────────────┘                  └──────┬───────┘
        │                                                                  │
        │ Webhook Notification                                             │ WhatsApp
        ▼                                                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                       Owner & Sales Team Mobile Phones                      │
 │ • 09:00 AM Daily Morning Game Plan                                          │
 │ • 09:00 PM Day-End Briefing (Total sent, cumulative leads, repeat openers)  │
 │ • Real-Time Client Revert Alerts + AI Proposed Drafts                       │
 │ • 1-Click "YES" Approvals or Conversational Revisions                       │
 │ • Bi-Weekly Domain Warmup Scaling Reviews (Every 14 days)                   │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Deploying Evolution API (Self-Hosted WhatsApp Gateway)

Evolution API runs as a lightweight Docker container on your VPS. It connects your existing WhatsApp phone number via QR code and provides instant 2-way messaging with zero Meta template fees.

### Step 2.1: Run Evolution API with Docker Compose
On your VPS terminal:
```bash
sudo mkdir -p /var/www/evolution-api
cd /var/www/evolution-api
sudo nano docker-compose.yml
```

Paste the following configuration:
```yaml
version: "3.7"
services:
  evolution-api:
    image: atendai/evolution-api:v2.1.2
    container_name: evolution_api
    restart: always
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      - SERVER_PORT=8080
      - AUTHENTICATION_API_KEY=vrindaacorp-evolution-key
      - WEBHOOK_GLOBAL_ENABLED=true
      - WEBHOOK_GLOBAL_URL=http://127.0.0.1:3000/api/webhooks/whatsapp-evolution
      - WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
      - WEBHOOK_EVENTS_MESSAGES_UPSERT=true
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_instances:
```

Start the container:
```bash
sudo docker compose up -d
```

### Step 2.2: Create CRM Instance and Link via QR Code
Run this command on the VPS to create the `vrindaacorp-crm` instance:
```bash
curl -X POST http://127.0.0.1:8080/instance/create \
  -H "apikey: vrindaacorp-evolution-key" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "vrindaacorp-crm",
    "token": "vrindaacorp-evolution-key",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

To view the QR code and scan with your WhatsApp phone:
```bash
curl -X GET http://127.0.0.1:8080/instance/connect/vrindaacorp-crm \
  -H "apikey: vrindaacorp-evolution-key"
```
Open **WhatsApp on the Owner's phone** → **Linked Devices** → **Link a Device** → scan the displayed QR code. Once paired, your VPS can send and receive WhatsApp messages automatically.

---

## 3. Configuring Local Ollama Engine on the VPS

Your VPS already has Ollama installed with `llama3.1:8b`.

### Step 3.1: Verify Ollama Service & Model
```bash
ollama list
```
Ensure `llama3.1:8b` is listed. If needed, pull the latest release:
```bash
ollama pull llama3.1:8b
```

### Step 3.2: Configure Environment Variables in the CRM
In `/var/www/crm/.env`:
```env
# --- AI Engine (Local Ollama on VPS) ---
AI_PROVIDER="local"
AI_MODEL="llama3.1:8b"
LOCAL_AI_BASE_URL="http://127.0.0.1:11434"
LOCAL_AI_MODEL="llama3.1:8b"

# --- WhatsApp Gateway Configuration ---
WHATSAPP_ENABLED="true"
WHATSAPP_GATEWAY="evolution"
EVOLUTION_API_URL="http://127.0.0.1:8080"
EVOLUTION_API_KEY="vrindaacorp-evolution-key"
EVOLUTION_INSTANCE_NAME="vrindaacorp-crm"
```

---

## 4. Registering Authorized WhatsApp Numbers (Role-Based Access)

To ensure the AI agent only responds to authorized team members:

1. Open your CRM database or Admin panel.
2. In the `User` table, set the `whatsappNumber` for your team members in international format (e.g. `+919876543210`):
   - **`OWNER`**: Receives 09:00 AM Morning Game Plans, 09:00 PM Day-End Briefings, Bi-Weekly Strategy Audits, all hot revert alerts, and full CRM command control.
   - **`ADMIN`**: Global management access.
   - **`AGENT`**: Scoped access to their assigned leads and reply drafts.

---

## 5. Daily Autonomous Workflows

### 1. ☀️ 09:00 AM Morning Game Plan
Every morning at 09:00 AM (Asia/Kolkata), the agent analyzes today's verified leads, inbox deliverability, and send caps, delivering a brief:
```
☀️ Good Morning! VrindaaCorp Outreach Game Plan (09:00 AM)

📋 Today's Targeted Plan:
• Target Volume: 50 verified leads
• Target Sectors: Corporate, Healthcare
• Daily Pacing Cap: 50 emails/day (safety window 09:30 AM – 05:00 PM)
• Domain Health: Pristine (0 bounces)
• Verified Pool Remaining: 1,145 leads

📲 Owner Quick Controls:
• Reply PAUSE anytime to suspend today's sending.
• Reply STATUS for real-time dispatch progress.
```

### 2. ⚡ Inbound Revert Capture & Human-in-the-Loop Approval
When a prospect replies to an outreach email:
1. Inbound IMAP poller catches the email within 30 seconds.
2. Sequence auto-pauses, lead marked `Hot`.
3. Llama 3.1 parses client intent and drafts a tailored B2B reply.
4. A rich briefing is pushed to the Owner's WhatsApp:
   - **To send immediately**: Reply `"YES"` or `"SEND"`.
   - **To revise**: Reply with feedback (e.g. *"Change meeting to Wednesday 3 PM and offer complimentary audit"*). Llama 3.1 updates to version 2 and re-confirms.

### 3. 🌙 09:00 PM Day-End Performance Briefing
Every evening at 21:00 (Asia/Kolkata), the agent delivers a comprehensive summary:
```
🌙 VrindaaCorp CRM — Day-End Briefing (09:00 PM)

📊 Outreach & Reach Today:
• Emails Dispatched Today: 48
• Total Leads Outreached (To Date): 1,196 unique prospects
• Deliverability: 100% (0 bounces)

📬 Engagement & Conversions:
• Emails Opened Today: 19 opens (39.5% overall open rate)
• Cumulative Engaged Leads: 412 unique readers
• Overall Response Rate: 6.8%

🔥 High-Intent Repeat Openers (Ready for Closing!):
1. Meetika Chaudhry (360Logica) — Opened 4x! (meetika.c@360logica.com)
2. Awadhesh Chaubey (AAPC India) — Opened 3x! (awadhesh.chaubey@aapc.com)

⏳ Pending Action Items:
• 1 hot client revert awaiting action.
• Reply HOT to list pending leads, or STATUS anytime.
```

### 4. 🧠 Bi-Weekly Domain Warmup & Scaling Strategy (Every 14 Days)
Every two weeks, the agent audits 14-day deliverability to protect `vrindaacorp.com`:
- Calculates 14-day bounce rate (< 2.0% safety rule).
- Recommends the next safe warmup tier (e.g. 50/day ➔ 75/day ➔ 100/day).
- Highlights best-performing sectors and template subject lines.
- **1-Click Execution**: Reply `"APPROVE STRATEGY"` to update the CRM sending cap automatically.

---

## 6. On-Demand WhatsApp Chat Commands

You can text the agent anytime in plain English:

| Command / Question | Agent Action |
| :--- | :--- |
| `"Status today"` / `"Metrics"` | Returns live emails sent, opens, replies, and remaining quota. |
| `"Who opened the email?"` | Lists prospects who opened outreach emails today and repeat openers. |
| `"Show hot leads"` | Lists all warm/replied leads currently awaiting action. |
| `"Pause outreach"` | Halts all outgoing campaign email sending immediately. |
| `"Resume outreach"` | Restarts scheduled campaign sending. |
| `"Lookup Apex Towers"` | Returns contact details, stage, sector, and recent email exchanges. |
| `"Add lead Rajesh Kumar from Apex Media, rajesh@apex.com, NCR"` | Creates or updates the lead record directly in the CRM. |
| `"Audit domain strategy"` | Runs an on-demand deliverability audit and scaling analysis. |
