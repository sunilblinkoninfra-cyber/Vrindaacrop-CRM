import { env } from "@/lib/env";

export type WhatsAppResult = { ok: boolean; simulated: boolean; error?: string; messageId?: string };

/**
 * Send a WhatsApp template message via the Meta Cloud API. If WhatsApp is not
 * enabled/configured the send is simulated (returns ok+simulated) so the flow
 * works end-to-end in dev/staging.
 */
export async function sendWhatsApp(to: string, params: string[]): Promise<WhatsAppResult> {
  if (!env.whatsapp.enabled || !env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    console.log(`[WhatsApp Template Simulated -> ${to}]:`, params);
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: to.replace(/[^\d+]/g, ""),
    type: "template",
    template: {
      name: env.whatsapp.templateName,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[WhatsApp Template API Error]:`, text);
      return { ok: false, simulated: false, error: text };
    }
    const data = (await res.json()) as any;
    return { ok: true, simulated: false, messageId: data?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, simulated: false, error: (e as Error).message };
  }
}

/**
 * Send a free-form WhatsApp text message via Evolution API (Self-Hosted on VPS) or Meta Cloud API.
 * Used for sharing proposed AI email drafts, revision updates, daily briefings, and status reports.
 */
export async function sendWhatsAppTextMessage(to: string, message: string): Promise<WhatsAppResult> {
  const cleanPhone = to.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!cleanPhone) {
    return { ok: false, simulated: false, error: "Missing or invalid recipient phone number." };
  }

  // 1. Try Evolution API (Self-Hosted on VPS) if configured
  if (env.whatsapp.gateway === "evolution" && env.whatsapp.evolutionApiUrl) {
    try {
      const url = `${env.whatsapp.evolutionApiUrl.replace(/\/$/, "")}/message/sendText/${env.whatsapp.evolutionInstanceName}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          apikey: env.whatsapp.evolutionApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: cleanPhone,
          text: message,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: true, simulated: false, messageId: data?.key?.id || `evo-${Date.now()}` };
      }
      console.warn(`[Evolution API Warning ${res.status}]: falling back to Meta/Simulator`);
    } catch (evoErr: any) {
      console.warn(`[Evolution API Connection Error]:`, evoErr.message);
    }
  }

  // 2. Try Meta Cloud API if configured
  if (env.whatsapp.accessToken && env.whatsapp.phoneNumberId) {
    const url = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`;
    const body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        return { ok: true, simulated: false, messageId: data?.messages?.[0]?.id };
      }
      const text = await res.text();
      console.warn(`[Meta WhatsApp API Error ${res.status}]:`, text);
    } catch (e: any) {
      console.error(`[Meta WhatsApp Send Failed]:`, e);
    }
  }

  // 3. Fallback to Local Simulator in dev or when gateways are offline
  console.log(`\n================== [WHATSAPP OUTBOUND NOTIFICATION] ==================`);
  console.log(`To: +${cleanPhone}`);
  console.log(`Message:\n${message}`);
  console.log(`======================================================================\n`);
  return { ok: true, simulated: true };
}

/**
 * Formats an outbound WhatsApp prompt for an AI proposed email revert draft.
 */
export function formatDraftWhatsAppNotification(args: {
  leadName: string;
  leadCompany?: string | null;
  leadEmail: string;
  inboundSnippet: string;
  draftSubject: string;
  draftBody: string;
  version: number;
}): string {
  const { leadName, leadCompany, leadEmail, inboundSnippet, draftSubject, draftBody, version } = args;
  const companyLabel = leadCompany ? ` (${leadCompany})` : "";

  return `🔥 *Client Revert Received!*
👤 *Lead:* ${leadName}${companyLabel}
📧 *Email:* ${leadEmail}

📩 *Client's Message:*
"${inboundSnippet.trim()}"

━━━━━━━━━━━━━━━━━━━━
🤖 *AI Proposed Reply Draft (v${version}):*
*Subject:* ${draftSubject}

${draftBody.trim()}
━━━━━━━━━━━━━━━━━━━━

📲 *Next Steps (Reply directly to this chat):*
• Reply *YES* or *SEND* to approve and automatically dispatch this email to the client.
• Or reply with your suggested changes (e.g., _"Offer 15% discount for first quarter and propose a call for Thursday 3pm"_) to revise the draft.`;
}

/**
 * Formats an outbound WhatsApp prompt for a revised draft incorporating agent feedback.
 */
export function formatRevisedDraftNotification(args: {
  leadName: string;
  draftSubject: string;
  draftBody: string;
  version: number;
  feedback: string;
}): string {
  const { leadName, draftSubject, draftBody, version, feedback } = args;

  return `📝 *Revised Draft (v${version}) Ready for Review:*
👤 *For:* ${leadName}
💡 *Inculcated Feedback:* "${feedback.trim()}"

━━━━━━━━━━━━━━━━━━━━
*Subject:* ${draftSubject}

${draftBody.trim()}
━━━━━━━━━━━━━━━━━━━━

📲 *Next Steps:*
• Reply *YES* or *SEND* to approve and dispatch this email.
• Or reply with further edits to revise again.`;
}

/**
 * Formats a confirmation message when an email is successfully sent to the lead.
 */
export function formatConfirmationWhatsAppNotification(args: {
  leadName: string;
  leadEmail: string;
  version: number;
}): string {
  const { leadName, leadEmail, version } = args;

  return `✅ *Email Successfully Sent!*
The reply draft (v${version}) to *${leadName}* (${leadEmail}) has been dispatched via sales@vrindaacorp.com.`;
}

/**
 * 09:00 AM Morning Game Plan Briefing formatter.
 */
export function formatMorningGamePlanNotification(args: {
  targetCount: number;
  sectors: string[];
  capToday: number;
  unassignedLeads: number;
  reputationHealth: string;
}): string {
  const { targetCount, sectors, capToday, unassignedLeads, reputationHealth } = args;
  const sectorList = sectors.length > 0 ? sectors.join(", ") : "Corporate & Healthcare";

  return `☀️ *Good Morning! VrindaaCorp Outreach Game Plan (09:00 AM)*

📋 *Today's Targeted Plan:*
• Target Volume: ${targetCount} verified leads
• Target Sectors: ${sectorList}
• Daily Pacing Cap: ${capToday} emails/day (safety window 09:30 AM – 05:00 PM)
• Domain Health: ${reputationHealth}
• Verified Pool Remaining: ${unassignedLeads} leads

📲 *Owner Quick Controls:*
• Reply *PAUSE* anytime to suspend today's sending.
• Reply *STATUS* for real-time dispatch progress.`;
}

/**
 * 09:00 PM Day-End Comprehensive Performance Briefing formatter.
 */
export function formatDayEndReportNotification(args: {
  sentToday: number;
  cumulativeLeadsOutreached: number;
  responseRatePercent: number;
  opensToday: number;
  totalUniqueOpens: number;
  overallOpenRatePercent: number;
  repeatOpeners: Array<{
    name: string;
    company: string | null;
    openCount: number;
    email: string;
  }>;
  bouncesToday: number;
  pendingReplies: number;
}): string {
  const {
    sentToday,
    cumulativeLeadsOutreached,
    responseRatePercent,
    opensToday,
    totalUniqueOpens,
    overallOpenRatePercent,
    repeatOpeners,
    bouncesToday,
    pendingReplies,
  } = args;

  const repeatOpenersText =
    repeatOpeners.length > 0
      ? repeatOpeners
          .slice(0, 5)
          .map(
            (r, i) =>
              `${i + 1}. *${r.name}*${r.company ? ` (${r.company})` : ""} — Opened *${r.openCount}x*! (${r.email})`
          )
          .join("\n")
      : "_None recorded today. All opens were single interactions._";

  return `🌙 *VrindaaCorp CRM — Day-End Briefing (09:00 PM)*

📊 *Outreach & Reach Today:*
• Emails Dispatched Today: *${sentToday}*
• Total Leads Outreached (To Date): *${cumulativeLeadsOutreached}* unique prospects
• Deliverability: *${bouncesToday === 0 ? "100% (0 bounces)" : `${bouncesToday} bounces`}*

📬 *Engagement & Conversions:*
• Emails Opened Today: *${opensToday}* opens (${overallOpenRatePercent}% overall open rate)
• Cumulative Engaged Leads: *${totalUniqueOpens}* unique readers
• Overall Response Rate: *${responseRatePercent}%*

🔥 *High-Intent Repeat Openers (Ready for Closing!):*
${repeatOpenersText}

⏳ *Pending Action Items:*
• *${pendingReplies}* hot client revert(s) awaiting action.
• Reply *HOT* to list pending leads, or *STATUS* anytime.`;
}

/**
 * Bi-Weekly Warmup & Outreach Scaling Strategy Briefing formatter.
 */
export function formatBiWeeklyStrategyNotification(args: {
  rolling14DaysSent: number;
  rollingBounceRate: number;
  rollingOpenRate: number;
  domainStatus: string;
  currentCap: number;
  proposedCap: number;
  scalingRecommendation: string;
  topSector: string;
}): string {
  const {
    rolling14DaysSent,
    rollingBounceRate,
    rollingOpenRate,
    domainStatus,
    currentCap,
    proposedCap,
    scalingRecommendation,
    topSector,
  } = args;

  return `🧠 *Bi-Weekly Outreach Strategy & Warmup Review (Ollama AI)*

📈 *14-Day Performance Audit:*
• Volume Dispatched: *${rolling14DaysSent}* emails
• Rolling Bounce Rate: *${rollingBounceRate.toFixed(2)}%* (Target: < 2.0%)
• Rolling Open Rate: *${rollingOpenRate.toFixed(1)}%*
• Domain Reputation: *${domainStatus}*
• Top Performing Sector: *${topSector}*

🚀 *Recommended Warmup & Scaling Plan (Next 14 Days):*
• Current Cap: ${currentCap}/day ➔ *Proposed Cap: ${proposedCap}/day*
• Strategic Insight: ${scalingRecommendation}

📲 *Action:*
Reply *APPROVE STRATEGY* to automatically apply this ${proposedCap}/day schedule to the CRM, or reply with your custom instructions.`;
}
