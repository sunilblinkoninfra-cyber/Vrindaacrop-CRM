# VrindaaCorp CRM — Executive Owner Operating Manual

**Comprehensive Business & Operational Guide for the Business Owner & Executive Leadership**  
*VrindaaCorp Services | Integrated Facility Management*  
*Document Version: 2.0 (Production Release)*  

---

## 📑 Table of Contents

1. [Executive Summary & Daily 5-Minute Routine](#1-executive-summary--daily-5-minute-routine)
2. [Login, Security & User Roles](#2-login-security--user-roles)
3. [The Executive Dashboard](#3-the-executive-dashboard)
4. [Managing & Importing Leads](#4-managing--importing-leads)
5. [The Visual Sales Pipeline (Kanban)](#5-the-visual-sales-pipeline-kanban)
6. [Outbound Campaigns & Automated Drip Sequences](#6-outbound-campaigns--automated-drip-sequences)
7. [The Hot-Lead Workflow & WhatsApp Alert System](#7-the-hot-lead-workflow--whatsapp-alert-system)
8. [Contract Intelligence & Renewal Management](#8-contract-intelligence--renewal-management)
9. [Lead Sources & Integrations Hub](#9-lead-sources--integrations-hub)
10. [Executive Reports & Performance Exports](#10-executive-reports--performance-exports)
11. [Owner Troubleshooting & FAQs](#11-owner-troubleshooting--faqs)

---

## 1. Executive Summary & Daily 5-Minute Routine

VrindaaCorp CRM is your dedicated, private enterprise operations platform. It eliminates lost spreadsheet records, automates multi-touch B2B cold outreach across Indian corporate sectors, tracks client email opens and replies in real time, and alerts you the instant a high-value prospect expresses interest.

Because this CRM runs on your own high-performance private VPS (`200.234.47.7`), **your client data is 100% confidential**, there are **$0 recurring SaaS subscription fees**, and all automated email writing is powered by your private, on-server **offline intelligence engine**.

```
  ┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
  │ 1. Import List  │ ───▶  │ 2. Automated Drips   │ ───▶  │ 3. Client Replies!     │
  │ Clean & Segment │       │ Personalized Outreach│       │ Instant Alert to Phone │
  └─────────────────┘       └──────────────────────┘       └───────────┬────────────┘
                                                                       │
  ┌─────────────────┐       ┌──────────────────────┐                   ▼
  │ 5. Close Deal!  │ ◀───  │ 4. AI-Crafted Reply  │ ◀─────────────────┘
  │ Contract Stored │       │ Owner 1-Click Approve│
  └─────────────────┘       └──────────────────────┘
```

---

### ⏱️ The Owner's 5-Minute Daily Morning Routine

Every morning at 09:30 AM, complete these three quick checks:

| Step | Time | What to Check | Where to Click | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **1. Review Hot Leads** | 2 mins | Check if any new prospect replied overnight. | **Dashboard** → *Hot Leads card* | Click the lead, review their reply, approve the AI draft response. |
| **2. Unattended Alerts** | 1 min | Leads sitting in *Replied* stage > 24 hours. | **Dashboard** → *Unattended Banner* | Assign to an agent or reply immediately to prevent lost deals. |
| **3. Outreach Velocity** | 2 mins | Verify campaign send volumes and open rates. | **Dashboard** → *Outreach Funnel* | Ensure health status is green and daily quota is running. |

---

## 2. Login, Security & User Roles

### 2.1 Accessing the CRM
- **CRM Web Address**: `https://crm.vrindaacorp.com` (or your assigned domain)
- **Supported Devices**: Fully responsive on desktop PCs, laptops, iPads/tablets, and mobile phones.

### 2.2 Changing Your Password
1. Click your name / avatar at the bottom-left sidebar.
2. Select **Account Settings** (`/account`).
3. Enter your current password, type your new secure password, and click **Update Password**.

---

### 2.3 User Roles & Permissions Matrix

VrindaaCorp CRM enforces strict Role-Based Access Control (RBAC):

| Feature / Action | OWNER (You) | ADMIN | AGENT |
| :--- | :---: | :---: | :---: |
| View Global Executive Dashboard & KPIs | ✅ | ✅ | ❌ *(Own leads only)* |
| Receive Instant WhatsApp & Email Hot Alerts | ✅ | ❌ | ❌ |
| View & Manage All Leads across India | ✅ | ✅ | ❌ *(Assigned only)* |
| Upload & Cleanse Lead Spreadsheets | ✅ | ✅ | ❌ |
| Create, Edit & Launch Outreach Campaigns | ✅ | ✅ | ❌ |
| Approve & Send AI Reply Drafts | ✅ | ✅ | ✅ *(Assigned only)* |
| Drag & Drop Deals on Pipeline Board | ✅ | ✅ | ✅ |
| Manage System Users & Mailboxes | ✅ | ✅ | ❌ |
| Export Excel & PDF Executive Reports | ✅ | ✅ | ❌ |

---

## 3. The Executive Dashboard

The **Dashboard** is your mission control center. Every card provides actionable business insight:

```
┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
│       TOTAL LEADS         │   HOT LEADS (ACTION REQ)  │      ACTIVE CAMPAIGNS     │
│          1,148            │             4             │             3             │
│   ▲ +12% this month       │   Immediate Follow-up     │    Sending 100/day        │
└───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

### Key Metrics Explained:
1. **Total Leads**: Total verified business contacts stored in your database.
2. **Hot Leads (Action Required)**: Prospective clients who have responded to an outreach email or submitted an inquiry form and are waiting for your team's proposal.
3. **Active Campaigns**: Running automated outreach sequences.
4. **Suppression Count**: Contacts who opted out, unsubscribed, or hard-bounced. The CRM permanently protects these contacts so your company never spams them.
5. **Sync Inbound Replies Button**: Located at the top right. While the background engine syncs automatically every 30 seconds, clicking this manually triggers an instant mailbox fetch.

---

### Understanding the Outreach Funnel
The visual funnel tracks your conversion math in real time:

- **Sent**: Total cold outreach emails successfully dispatched.
- **Delivered**: Percent reaching prospect inboxes (Target: >98%).
- **Opened**: Prospects who viewed your pitch (Industry benchmark: 25–35%; VrindaaCorp benchmark: **40%+**).
- **Clicked**: Prospects who clicked your website, brochure, or calendar link.
- **Replied**: Inbound inquiries received (The ultimate metric of outreach success).

---

## 4. Managing & Importing Leads

### 4.1 Searching & Filtering Leads
Navigate to **Leads** in the left navigation bar. You can instantly filter the master database by:
- **Sector**: Healthcare, Corporate, Manufacturing, Education, Hospitality, Retail, Residential.
- **Region / Geography**: NCR (Noida, Greater Noida, Gurgaon, Delhi), Uttar Pradesh, Haryana, etc.
- **Pipeline Stage**: New, Contacted, Replied, Qualified, Proposal Sent, Won, Lost.
- **Validation Status**: Valid, Risky, Invalid.

---

### 4.2 Importing New Lead Spreadsheets (1-Click Cleaning)
When your marketing team or data vendor provides a new Excel or CSV file of facilities managers, admins, or procurement heads:

1. Click **Import & Cleanup** in the sidebar.
2. Drag and drop your `.xlsx` or `.csv` file.
3. **Automatic Column Matching**: The CRM automatically matches your spreadsheet columns:
   - `First Name`, `Last Name`, `Company`, `Email`, `Phone`, `Sector`, `City`.
4. **Deduplication Engine**: The system automatically scans your existing database. If an email address already exists, it skips it—**preventing duplicate emails to the same client**.
5. **Standardization & Cleanup**:
   - Cleans messy company names (strips `Pvt Ltd`, `LLC`, trailing spaces).
   - Normalizes sectors (e.g., `MFG`, `mfg`, `Manufacture` are all consolidated into `Manufacturing`).
   - Normalizes regions (e.g., `Noida West`, `Gurugram`, `Faridabad` are auto-mapped to `NCR`).
6. Click **Import Leads**. A clear summary shows how many contacts were added, duplicates skipped, and invalid emails rejected.

---

### 4.3 The Lead Profile Screen
Clicking on any lead opens their full command card:
- **Contact Details**: Name, designation, company, phone, corporate email, address.
- **Activity Timeline**: Chronological history of every email sent, exact time opened, links clicked, and replies received.
- **Internal Notes**: Add private notes for your team (e.g., *"Spoke to Mr. Sharma; contract up for renewal in November"*).
- **Follow-up Tasks**: Assign action items with due dates.
- **Suppress Contact**: A one-click button to permanently stop all emails if a prospect requests exclusion.

---

## 5. The Visual Sales Pipeline (Kanban)

Navigate to **Pipeline** to view your deals organized by sales stage:

```
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│     NEW     │  CONTACTED  │   REPLIED   │  QUALIFIED  │  PROPOSAL   │     WON     │
│             │             │   (HOT🔥)   │             │             │             │
│ [Lead Card] │ [Lead Card] │ [Lead Card] │ [Lead Card] │ [Lead Card] │ [Lead Card] │
│ Max Health  │ DLF Cyber   │ Jaypee Hosp │ Fortis Hosp │ Samsung R&D │ Adobe Tower │
│ ₹4.5L/mo    │ ₹8.0L/mo    │ ₹3.2L/mo    │ ₹12.0L/mo   │ ₹6.5L/mo    │ ₹15.0L/mo   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘
```

### How to Operate the Pipeline:
1. **Drag and Drop**: Simply drag a card from one column to another as the deal progresses (e.g., drag from *Replied* to *Qualified* after an introductory phone call).
2. **Deal Values**: Click any card to enter the estimated monthly facility contract value (e.g., ₹5,00,000/month).
3. **Timeline Logging**: Every stage transition is automatically recorded with a timestamp in the lead's history.

---

## 6. Outbound Campaigns & Automated Drip Sequences

Automated outreach runs continuously in the background, reaching corporate decision-makers without manual daily effort.

### 6.1 Creating a Targeted Campaign
1. Click **Campaigns** → **Create Campaign**.
2. Give your campaign a name (e.g., `Q4 NCR Healthcare Outreach`).
3. Select your **Target Segment**:
   - *Sector*: `Healthcare`
   - *Region*: `NCR`
4. Click **Preview Count** to see exactly how many matching leads will receive this outreach.

---

### 6.2 Setting Multi-Step Drips
A standard, high-converting B2B sequence consists of 3 touches:

| Step | Timing | Purpose | Best Strategy |
| :--- | :--- | :--- | :--- |
| **Step 1: Introduction** | Day 0 | Value Proposition & Capabilities | Highlight hard services, hygiene, and Greater Noida West rapid response. |
| **Step 2: Case Study** | Day 3 | Social Proof & Relevant Results | Reference similar sector clients and cost optimization. |
| **Step 3: Break-up Email** | Day 7 | Frictionless Final Call to Action | Polite check-in asking if they are the right person or if timing is off. |

> [!TIP]
> **Automatic Stop on Reply**: The moment a prospect replies to Step 1, the CRM **instantly halts** Steps 2 and 3. Prospects will never receive an automated follow-up after they have already replied!

---

### 6.3 Using Offline AI-Assisted Copywriting
When creating or editing a campaign template, you can toggle **AI-Assisted Personalization**:
1. You provide a brief high-level bullet (e.g., *"Highlight 24/7 HVAC maintenance and compliance audit for hospitals"*).
2. When the background scheduler prepares the email, your VPS's **offline intelligence model** generates a unique, natural, highly tailored message for each specific lead and company.
3. **100% Clean & Natural**: There are **zero** AI watermarks or badges sent to the client. The recipient sees only a crisp, human, executive-level note.

---

### 6.4 Sending Caps & Domain Warm-Up Protection
To ensure your domain (`vrindaacorp.com`) never lands in spam filters:
- The system enforces a **Daily Send Cap** (default: 100 emails/day).
- Emails are staggered with natural random intervals between 09:00 AM and 06:00 PM Indian Standard Time.
- The engine automatically pauses sending on weekends to preserve corporate sender reputation.

---

## 7. The Hot-Lead Workflow & WhatsApp Alert System

When a prospective client replies to an outreach email or fills out your website form, the CRM's automated response pipeline activates:

```
                  ┌────────────────────────────────────────┐
                  │    Lead Replies to Cold Outreach       │
                  │    "We need HVAC & cleaning quote"     │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │          CRM Instant Automation        │
                  │  • Email sequence auto-paused          │
                  │  • Lead moved to 'Replied' stage       │
                  │  • Tagged 'Hot — Awaiting Action'      │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │        WhatsApp Alert to Owner         │
                  │  "🔥 Hot Lead: Vikram Sharma (Max Hosp)│
                  │   Tap link to review AI draft reply"   │
                  └───────────────────┬────────────────────┘
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │      Owner Reviews & Dispatches        │
                  │  1-Click approve or edit in CRM        │
                  │  Lead answered in < 15 minutes!        │
                  └────────────────────────────────────────┘
```

---

### 7.1 Reviewing & Approving Proposed Replies
1. When you receive the WhatsApp notification, tap the link or open the lead in the CRM.
2. Under the **Reply Draft** section, you will see:
   - The exact text of the client's incoming email.
   - A pre-written, professional **Proposed Reply** created by your offline AI assistant.
3. **Your Options**:
   - **Send Now**: If you like the draft, click **Send Proposed Reply**. The email dispatches immediately from your corporate mailbox.
   - **Refine / Edit**: Click into the box to adjust pricing, names, or meeting times.
   - **Request AI Revision**: Type a quick instruction (e.g., *"Offer an on-site audit this Thursday at 3 PM"*) and the AI will regenerate the draft instantly.
4. Click **Acknowledge Hot Lead**. This marks the lead as handled.

### 7.2 The 48-Hour Escalation Guarantee
If a hot lead remains unacknowledged after **48 hours**, the CRM triggers an automatic escalation email to leadership, ensuring no prospective deal ever slips through the cracks.

---

## 8. Contract Intelligence & Renewal Management

VrindaaCorp CRM protects your recurring revenue by tracking active facility management contracts.

### 8.1 Tracking Client Contracts
Inside any won lead's profile, scroll to **Contract Details**:
- **Contract Value**: Total contract sum (e.g., ₹24,00,000 / year).
- **Billing Frequency**: Monthly, Quarterly, or Annual.
- **Service Scope**: Hard Services (HVAC, Electrical, Plumbing), Housekeeping, Security, Pantry.
- **Effective Dates**: Contract Start Date and Expiry Date.

### 8.2 Automated Churn Prevention Alerts
- **60 Days Before Expiry**: The lead card displays a yellow warning badge.
- **30 Days Before Expiry**: The CRM alerts the account owner via WhatsApp/Email to schedule a renewal audit and contract extension meeting.
- **Expired Contracts**: Automatically flagged in monthly executive reviews.

---

## 9. Lead Sources & Integrations Hub

Under **Settings** → **Sources & Integrations**, you can oversee all inbound channels:

| Inbound Channel | How it Connects | Action on New Lead |
| :--- | :--- | :--- |
| **Website Contact Form** | Connected via direct API webhook to `vrindaacorp.com`. | Automatically creates lead, assigns sector, and notifies owner. |
| **Meta Ads (Facebook/Insta)** | Meta Graph Webhook integration. | Captures lead form submissions from digital marketing campaigns in real time. |
| **Google Ads Lead Forms** | Google Webhook Key integration. | Captures search ad inquiries directly into the *New* pipeline stage. |
| **Corporate Inbound Email** | IMAP listener connected to `sales@vrindaacorp.com`. | Automatically captures client replies and matches them to active deals. |

---

## 10. Executive Reports & Performance Exports

Navigate to **Reports** to review performance across your sales and outreach operations.

### 10.1 Monthly Performance Analytics
- **Outreach Velocity**: Monthly progression of emails sent, opened, clicked, and replied over the last 6 months.
- **Sector Conversion Leaderboard**: See which industries yield the highest reply rates (e.g., Healthcare 4.8% vs Corporate 3.2%).
- **Template Performance**: View which subject lines generate the highest opens and responses.

---

### 10.2 Exporting for Board & Management Meetings
- **Export to Excel (`.xlsx`)**: Generates a comprehensive multi-tab spreadsheet containing:
  - Tab 1: Lead database with contact details, sectors, and pipeline statuses.
  - Tab 2: Monthly campaign metrics and open/reply rates.
  - Tab 3: Hot lead response log and conversion timelines.
- **Export Executive PDF**: Generates a print-ready, high-resolution management presentation summary suitable for sharing with partners, banks, or investors.

---

## 11. Owner Troubleshooting & FAQs

### Q1: An email was sent to a client, but they said they didn't receive it. What should I check?
1. Open the lead's profile in the CRM.
2. Check the **Activity Timeline**:
   - If marked *Delivered*: The email successfully reached their mail server. Advise the client to check their spam or promotions folder.
   - If marked *Bounced*: The email address was incorrect or rejected by their IT team. Click *Edit Lead* to update their email.

---

### Q2: We are going on a national holiday (e.g., Diwali). How do I pause outreach?
1. Click **Campaigns** in the sidebar.
2. Click on the active campaign.
3. Change the status from **Active** to **Paused**.
4. The system will immediately pause all outgoing drip emails. When you return, switch it back to **Active** to resume seamlessly.

---

### Q3: A prospect replied asking to be removed from our contact list. What do I do?
1. Open the lead's profile.
2. Click the red **Suppress Contact** button.
3. This adds their email to your global suppression list. The CRM will permanently block any future email from being sent to this contact across all campaigns.

---

### Q4: Can I access the CRM from my iPhone or Android device?
**Yes.** Open Safari or Chrome on your mobile phone and navigate to your CRM URL (`https://crm.vrindaacorp.com`).  
*Tip*: Tap your browser's share icon and choose **"Add to Home Screen"** to create a dedicated app icon on your phone!

---

### Q5: Who do I contact for server or technical maintenance?
- **VPS Provider**: Hostinger Cloud (Server IP: `200.234.47.7`)
- **Offline AI Engine**: Ollama daemon (`llama3.1:8b`)
- **Database**: PostgreSQL 16 (Local, automated daily backup at 02:00 AM)
- **Technical Reference**: Refer to `docs/VPS_DEPLOYMENT_GUIDE.md` and `docs/OLLAMA_SETUP_GUIDE.md`.

---

*© 2026 VrindaaCorp Services. All rights reserved. Confidential Internal Document.*
