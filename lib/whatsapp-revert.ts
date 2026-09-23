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

/**
 * Triggered when a lead reverts/replies to our email outreach.
 * 1. Generates an AI proposed reply draft grounded in VrindaaCorp services.
 * 2. Persists the ProposedReplyDraft in the database (status: PENDING_APPROVAL).
 * 3. Sends an interactive prompt to the assigned agent's WhatsApp.
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

  // Determine the recipient agent's WhatsApp phone number
  let targetPhone = lead.owner?.whatsappNumber || lead.phone;

  if (!targetPhone) {
    // Fallback: look for an admin/owner with a configured WhatsApp number
    const adminUser = await prisma.user.findFirst({
      where: {
        role: { in: ["OWNER", "ADMIN"] },
        whatsappNumber: { not: null },
      },
      select: { whatsappNumber: true, id: true },
    });
    targetPhone = adminUser?.whatsappNumber || "+919999999999";
  }

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
      message: `🤖 AI generated proposed reply draft (v1) for revert: "${subject || "Inbound Revert"}". Sent to WhatsApp (${targetPhone}) for agent approval.`,
    },
  });

  // Dispatch WhatsApp notification to the agent
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
 * Orchestrates incoming WhatsApp message from an agent.
 * Handles both confirmation dispatch and iterative change revision.
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
  const cleanPhone = fromPhone.replace(/[^\d]/g, "");

  // 1. Authorization & Role Verification
  const user = cleanPhone
    ? await prisma.user.findFirst({
        where: {
          whatsappNumber: { contains: cleanPhone.slice(-10) },
        },
      })
    : null;

  const totalRegisteredUsers = await prisma.user.count({
    where: { whatsappNumber: { not: null } },
  });

  if (totalRegisteredUsers > 0 && !user) {
    const unauthMsg = `⚠️ *Unauthorized WhatsApp Sender*\nThe phone number *+${cleanPhone}* is not registered in VrindaaCorp CRM. Please have your system administrator add your WhatsApp number under Settings / Team to access the AI Co-Pilot.`;
    await sendWhatsAppTextMessage(fromPhone, unauthMsg);
    return {
      ok: false,
      action: "none",
      error: `Phone +${cleanPhone} is not authorized.`,
    };
  }

  const userRole = (user?.role as "OWNER" | "ADMIN" | "AGENT") || "OWNER";
  const userName = user?.name || undefined;
  const trimmedText = messageText.trim();

  // 2. Handle Bi-Weekly Strategy Approval ("APPROVE STRATEGY")
  if (/^approve\s+strategy/i.test(trimmedText)) {
    if (userRole === "AGENT") {
      await sendWhatsAppTextMessage(fromPhone, "⚠️ *Permission Denied*: Only the Business Owner or Admin can approve scaling strategies.");
      return { ok: false, action: "none", error: "Permission denied" };
    }
    const { applyBiWeeklyStrategy, evaluateBiWeeklyStrategy } = await import("@/lib/ai/strategy-engine");
    const evalResult = await evaluateBiWeeklyStrategy();
    const res = await applyBiWeeklyStrategy(evalResult.proposedCap);
    await sendWhatsAppTextMessage(fromPhone, res.message);
    return { ok: true, action: "sent", message: res.message };
  }

  // 3. Find active pending or revised draft
  let draft = await prisma.proposedReplyDraft.findFirst({
    where: {
      status: { in: ["PENDING_APPROVAL", "REVISED"] },
      ...(cleanPhone ? { agentPhone: { contains: cleanPhone.slice(-10) } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { lead: true },
  });

  if (!draft && userRole !== "AGENT") {
    draft = await prisma.proposedReplyDraft.findFirst({
      where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
      orderBy: { updatedAt: "desc" },
      include: { lead: true },
    });
  }

  // 4. If an active draft exists AND the message is an approval keyword ("YES", "SEND", "PROCEED")
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
          message: `✅ Reply draft (v${draft.version}) confirmed via WhatsApp by agent (${fromPhone}) and dispatched to ${draft.lead.email}.`,
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

      await sendWhatsAppTextMessage(fromPhone, confirmMsg);

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

  // 5. Intelligent Conversational Agent Execution
  // Contextualizes message, confirms understanding, modifies drafts or executes CRM tools, and provides next steps
  const { runOllamaAgent } = await import("@/lib/ai/ollama-agent");
  const agentRes = await runOllamaAgent({
    userMessage: trimmedText,
    userPhone: fromPhone,
    userRole,
    userName,
  });

  await sendWhatsAppTextMessage(fromPhone, agentRes.text);
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

  if (draft.agentPhone) {
    const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
    const confirmMsg = formatConfirmationWhatsAppNotification({
      leadName,
      leadEmail: draft.lead.email,
      version: draft.version,
    });
    await sendWhatsAppTextMessage(draft.agentPhone, confirmMsg);
  }

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

  if (draft.agentPhone) {
    const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
    const revisedWhatsAppMsg = formatRevisedDraftNotification({
      leadName,
      draftSubject: revised.subject,
      draftBody: revised.bodyText,
      version: nextVersion,
      feedback,
    });
    await sendWhatsAppTextMessage(draft.agentPhone, revisedWhatsAppMsg);
  }

  return { ok: true, version: nextVersion, subject: revised.subject, bodyHtml: revised.bodyHtml };
}
