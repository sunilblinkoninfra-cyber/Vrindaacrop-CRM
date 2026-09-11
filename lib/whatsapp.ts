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
 * Send a free-form WhatsApp text message via Meta Cloud API.
 * Used for sharing proposed AI email drafts, revision updates, and confirmation notifications.
 */
export async function sendWhatsAppTextMessage(to: string, message: string): Promise<WhatsAppResult> {
  const cleanPhone = to.replace(/[^\d+]/g, "");
  if (!cleanPhone) {
    return { ok: false, simulated: false, error: "Missing or invalid recipient phone number." };
  }

  if (!env.whatsapp.enabled || !env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    console.log(`\n================== [WHATSAPP OUTBOUND SIMULATOR] ==================`);
    console.log(`To: ${cleanPhone}`);
    console.log(`Message:\n${message}`);
    console.log(`===================================================================\n`);
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone.replace(/^\+/, ""),
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

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[WhatsApp Text API Error ${res.status}]:`, text);
      return { ok: false, simulated: false, error: text };
    }
    const data = (await res.json()) as any;
    return { ok: true, simulated: false, messageId: data?.messages?.[0]?.id };
  } catch (e) {
    console.error(`[WhatsApp Send Failed]:`, e);
    return { ok: false, simulated: false, error: (e as Error).message };
  }
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
