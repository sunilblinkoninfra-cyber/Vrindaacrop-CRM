# VrindaaCorp CRM — Permanent Agent Instructions & Operating Rules

## 1. Outbound Campaign Deliverability Rules
- **VALID Leads Only**: Under no circumstances should any lead with `validationStatus` other than `VALID` (`UNKNOWN`, `RISKY`, `CATCH_ALL`, `INVALID`, `DISPOSABLE`) ever be enrolled, scheduled, claimed, or emailed in any outbound campaign.
- **Intra-Batch Spacing Delay**: Applies to both immediate and calendar scheduled dispatches. Spacing between emails avoids triggering rate limits with email providers.
- **Dedicated Outbound Mailbox**: Cold outreach is dispatched exclusively through authenticated Google Workspace SMTP (`sales@vrindaacorp.com`).
- **Target Segment Lock**: Campaign validation segments must remain locked to `VALID Only (Enforced)`.

## 2. Inbound Email & Lead Reply Qualification Rules
When processing inbound emails (via IMAP polling, webhook ingestion, or AI analysis):
1. **Never consider bounce emails as reply**: Delivery status notifications, failed delivery notices, and NDRs are system failures. They must be recorded as `BOUNCED` events and suppressed (`HARD_BOUNCE`), never logged as customer replies.
2. **Never consider invalid/incorrect email notifications as reply**: Notifications indicating mailbox unknown, does not exist, recipient rejected, or address not found must be treated as invalid bounces and suppressed.
3. **Never consider away messages as a hot lead or reply**: Out-of-office (OOO) messages, vacation auto-responders, and leave notices must NOT be recorded as replies, must NOT move the lead to `REPLIED`, and must NEVER be flagged as `hot: true`.
4. **Meaningful Reverts Only**: Only consider a revert as a valid reply if the prospect is asking for more info, further communication, company profile, or providing a meaningful human response.
5. **Hot Lead Qualification**: Strictly classify prospects as **HOT LEADS** (`hot: true`) only when the client shows interest to know more or requests more information (such as asking for company profile, brochure, rates, quotation, site visit, or scheduling a call/meeting).

## 3. Meeting Link & Scheduling Directives
- **Mandatory Calendly Link**: Whenever the AI agent or email template drafting includes a "book a call" option or meeting link, strictly use:
  `https://calendly.com/vrindaacorp-sales/30min`
  and nothing else.

## 4. WhatsApp AI Co-Pilot Response Format
Every response to the business owner or sales agent via WhatsApp must follow the 3-step structured protocol:
1. 🧠 **WHAT I UNDERSTOOD:** Explicit contextual understanding of the request.
2. 📋 **ACTION DETAILS / INSIGHTS / DRAFT:** The drafted copy, metrics, or proposed parameters.
3. 🚀 **NEXT STEP & CONFIRMATION:** Concrete call-to-action to proceed with `CONFIRM` or `YES`.
