import { prisma } from "@/lib/prisma";
import { generateProposedReply } from "@/lib/ai/reply-draft";
import {
  sendWhatsAppTextMessage,
  formatDraftWhatsAppNotification,
  formatRevisedDraftNotification,
  formatConfirmationWhatsAppNotification,
} from "@/lib/whatsapp";
import { sendEmail } from "@/lib/ses";
import { fullName } from "@/lib/utils";
import type { ProposedReplyDraft } from "@prisma/client";

// ============================================================================
// CORE SECURITY DIRECTIVE: STRICT SINGLE RECIPIENT POLICY
// ============================================================================
const STRICT_AUTHORIZED_PHONE = "+917351138751";

function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("91") ? `+${digits}` : `+91${digits.replace(/^0+/, "")}`;
}

/**
 * Triggered when a lead reverts/replies to our email outreach.
 * 1. Generates an AI proposed reply draft grounded in VrindaaCorp services.
 * 2. Persists the ProposedReplyDraft in the database (status: PENDING_APPROVAL).
 * 3. Sends an interactive prompt exclusively to the authorized Owner WhatsApp (+917351138751).
 */
export async function processInboundEmailForDrafting(args: {
  leadId: string;
  fromEmail: string;
  subject?: string | null;
  body: string;
}) {
  const { leadId, subject, body } = args;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { owner: true },
  });

  if (!lead) return null;

  // Single authorized recipient enforced by Core Security Directive
  const targetPhone = STRICT_AUTHORIZED_PHONE;

  // Generate proposed reply draft using VrindaaCorp intelligence layer
  const aiDraft = await generateProposedReply({
    lead,
    inboundSubject: subject,
    inboundBody: body,
  });

  // Persist draft to database
  const draft = await prisma.proposedReplyDraft.create({
    data: {
      leadId: lead.id,
      inboundSubject: subject || "(No subject)",
      inboundBody: body,
      draftSubject: aiDraft.subject,
      draftBody: aiDraft.bodyHtml,
      status: "PENDING_APPROVAL",
      agentPhone: targetPhone,
      agentUserId: lead.ownerId,
      version: 1,
    },
  });

  // Log activity on lead timeline
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: "reply",
      message: `🤖 AI generated proposed reply draft (v1) for revert: "${subject || "Inbound Revert"}". Sent to authorized WhatsApp (${targetPhone}) for owner approval.`,
    },
  });

  // Dispatch WhatsApp notification strictly to the single authorized recipient
  const leadName = fullName(lead.firstName, lead.lastName) || lead.email;
  const whatsappMsg = formatDraftWhatsAppNotification({
    leadName,
    leadCompany: lead.company,
    leadEmail: lead.email,
    inboundSnippet: body.slice(0, 300),
    draftSubject: aiDraft.subject,
    draftBody: aiDraft.bodyText,
    version: 1,
  });

  await sendWhatsAppTextMessage(targetPhone, whatsappMsg);

  return draft;
}

/**
 * Checks if a received WhatsApp text represents an approval action.
 */
export function isApprovalMessage(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  // Match single-word or short confirmations: YES, SEND, APPROVE, APPROVED, OK, CONFIRMED, PROCEED, GO AHEAD
  return /^(yes|send|approved?|proceed|confirm(ed)?|ok(ay)?|go\s*ahead|looks?\s*good|send\s*it|ship\s*it)(\s*!*)?$/i.test(
    trimmed
  );
}

/**
 * Orchestrates incoming WhatsApp message from the single authorized owner (+917351138751).
 * Completely drops messages from any unauthorized, unknown, or secondary number without responding.
 */
export async function handleIncomingWhatsAppMessage(args: {
  fromPhone: string;
  messageText: string;
}): Promise<{
  ok: boolean;
  action: "sent" | "revised" | "agent" | "none";
  draftId?: string;
  version?: number;
  message?: string;
  error?: string;
}> {
  const { fromPhone, messageText } = args;
  const normalizedSender = normalizePhoneNumber(fromPhone);

  // CORE SECURITY DIRECTIVE: STRICT SINGLE RECIPIENT VERIFICATION
  // NO auto-authorization, NO fallback linking. Drop unauthorized inbound messages immediately.
  if (normalizedSender !== STRICT_AUTHORIZED_PHONE) {
    console.warn(
      `[SECURITY DIRECTIVE ENFORCED] Inbound WhatsApp from unauthorized sender (${fromPhone} -> ${normalizedSender}) dropped silently without response.`
    );
    return {
      ok: false,
      action: "none",
      error: `Unauthorized sender (${fromPhone}). Discarded per Core Security Directive.`,
    };
  }

  const user = await prisma.user.findFirst({
    where: {
      role: { in: ["OWNER", "ADMIN"] },
    },
  });

  const userRole = (user?.role as "OWNER" | "ADMIN" | "AGENT") || "OWNER";
  const userName = user?.name || "Business Owner";
  const trimmedText = messageText.trim();

  // 1. Handle Bi-Weekly Strategy Approval ("APPROVE STRATEGY")
  if (/^approve\s+strategy/i.test(trimmedText)) {
    const { applyBiWeeklyStrategy, evaluateBiWeeklyStrategy } = await import("@/lib/ai/strategy-engine");
    const evalResult = await evaluateBiWeeklyStrategy();
    const res = await applyBiWeeklyStrategy(evalResult.proposedCap);
    await sendWhatsAppTextMessage(STRICT_AUTHORIZED_PHONE, res.message);
    return { ok: true, action: "sent", message: res.message };
  }

  // 2. Find active pending or revised draft
  const draft = await prisma.proposedReplyDraft.findFirst({
    where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
    orderBy: { updatedAt: "desc" },
    include: { lead: true },
  });

  // 3. If an active draft exists AND the message is an approval keyword ("YES", "SEND", "PROCEED")
  if (draft && isApprovalMessage(trimmedText)) {
    const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
    try {
      const emailResult = await sendEmail({
        to: draft.lead.email,
        subject: draft.draftSubject,
        html: draft.draftBody,
        leadId: draft.lead.id,
        tags: { draftId: draft.id, type: "whatsapp_approved_reply" },
      });

      // Update draft record
      await prisma.proposedReplyDraft.update({
        where: { id: draft.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentMessageId: emailResult?.messageId || "sent",
        },
      });

      // Log activity
      await prisma.activity.create({
        data: {
          leadId: draft.lead.id,
          type: "email",
          message: `✅ Reply draft (v${draft.version}) confirmed via WhatsApp by owner (${STRICT_AUTHORIZED_PHONE}) and dispatched to ${draft.lead.email}.`,
        },
      });

      // Reply back to WhatsApp confirming understanding and successful dispatch
      const confirmMsg = `🧠 *WHAT I UNDERSTOOD:*
You approved the proposal draft (v${draft.version}) for *${leadName}* (${draft.lead.company || "Client"}).

🚀 *PROCEEDED & DISPATCHED:*
✅ Email dispatched to *${draft.lead.email}* via \`sales@vrindaacorp.com\`.
• Subject: "${draft.draftSubject}"
• Version: v${draft.version}
• Time: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
• Timeline activity recorded in CRM.`;

      await sendWhatsAppTextMessage(STRICT_AUTHORIZED_PHONE, confirmMsg);

      return {
        ok: true,
        action: "sent",
        draftId: draft.id,
        version: draft.version,
        message: `Reply email (v${draft.version}) dispatched to ${draft.lead.email}.`,
      };
    } catch (err: any) {
      console.error("[Failed to send approved reply email]:", err);
      return {
        ok: false,
        action: "none",
        draftId: draft.id,
        error: `Failed to dispatch email: ${err.message}`,
      };
    }
  }

  // 4. Intelligent Conversational Agent Execution
  // Contextualizes message, confirms understanding, modifies drafts or executes CRM tools, and provides next steps
  const { env } = await import("@/lib/env");
  const agentRes = env.ai.provider === "hermes"
    ? await (await import("@/lib/ai/hermes-agent")).runHermesAgent({
        userMessage: trimmedText,
        userPhone: STRICT_AUTHORIZED_PHONE,
        userRole,
        userName,
      })
    : await (await import("@/lib/ai/ollama-agent")).runOllamaAgent({
        userMessage: trimmedText,
        userPhone: STRICT_AUTHORIZED_PHONE,
        userRole,
        userName,
      });

  await sendWhatsAppTextMessage(STRICT_AUTHORIZED_PHONE, agentRes.text);
  return {
    ok: true,
    action: "agent",
    message: agentRes.text,
  };
}

/**
 * Manually approve and send a draft directly from the CRM UI.
 */
export async function manualApproveDraft(draftId: string) {
  const draft = await prisma.proposedReplyDraft.findUnique({
    where: { id: draftId },
    include: { lead: true },
  });

  if (!draft) throw new Error("Draft not found.");
  if (draft.status === "SENT") throw new Error("Draft has already been sent.");

  const emailResult = await sendEmail({
    to: draft.lead.email,
    subject: draft.draftSubject,
    html: draft.draftBody,
    leadId: draft.lead.id,
    tags: { draftId: draft.id, type: "crm_manual_approved_reply" },
  });

  await prisma.proposedReplyDraft.update({
    where: { id: draft.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      sentMessageId: emailResult?.messageId || "sent",
    },
  });

  await prisma.activity.create({
    data: {
      leadId: draft.lead.id,
      type: "email",
      message: `✅ Reply draft (v${draft.version}) approved directly in CRM and dispatched to ${draft.lead.email}.`,
    },
  });

  const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
  const confirmMsg = formatConfirmationWhatsAppNotification({
    leadName,
    leadEmail: draft.lead.email,
    version: draft.version,
  });
  await sendWhatsAppTextMessage(STRICT_AUTHORIZED_PHONE, confirmMsg);

  return { ok: true, version: draft.version };
}

/**
 * Manually trigger a revision directly from the CRM UI.
 */
export async function manualReviseDraft(draftId: string, feedback: string) {
  const draft = await prisma.proposedReplyDraft.findUnique({
    where: { id: draftId },
    include: { lead: true },
  });

  if (!draft) throw new Error("Draft not found.");
  if (draft.status === "SENT") throw new Error("Draft has already been sent.");

  const nextVersion = draft.version + 1;
  const revised = await generateProposedReply({
    lead: draft.lead,
    inboundSubject: draft.inboundSubject,
    inboundBody: draft.inboundBody,
    currentDraft: {
      subject: draft.draftSubject,
      bodyHtml: draft.draftBody,
    },
    revisionFeedback: feedback,
  });

  await prisma.proposedReplyDraft.update({
    where: { id: draft.id },
    data: {
      draftSubject: revised.subject,
      draftBody: revised.bodyHtml,
      version: nextVersion,
      revisionNotes: feedback,
      status: "REVISED",
    },
  });

  await prisma.activity.create({
    data: {
      leadId: draft.lead.id,
      type: "note",
      message: `📝 Revision requested via CRM: "${feedback}". AI updated draft to v${nextVersion}.`,
    },
  });

  const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
  const revisedWhatsAppMsg = formatRevisedDraftNotification({
    leadName,
    draftSubject: revised.subject,
    draftBody: revised.bodyText,
    version: nextVersion,
    feedback,
  });
  await sendWhatsAppTextMessage(STRICT_AUTHORIZED_PHONE, revisedWhatsAppMsg);

  return { ok: true, version: nextVersion, subject: revised.subject, bodyHtml: revised.bodyHtml };
}
