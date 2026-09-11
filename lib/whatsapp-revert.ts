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
  action: "sent" | "revised" | "none";
  draftId?: string;
  version?: number;
  message?: string;
  error?: string;
}> {
  const { fromPhone, messageText } = args;
  const cleanPhone = fromPhone.replace(/[^\d]/g, "");

  // Find the active pending or revised draft for this agent phone (or most recent pending draft)
  let draft = await prisma.proposedReplyDraft.findFirst({
    where: {
      status: { in: ["PENDING_APPROVAL", "REVISED"] },
      ...(cleanPhone ? { agentPhone: { contains: cleanPhone.slice(-10) } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { lead: true },
  });

  // If no phone match, fallback to the latest active draft in the system
  if (!draft) {
    draft = await prisma.proposedReplyDraft.findFirst({
      where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
      orderBy: { updatedAt: "desc" },
      include: { lead: true },
    });
  }

  if (!draft) {
    return {
      ok: false,
      action: "none",
      error: "No active reply draft found awaiting confirmation.",
    };
  }

  const leadName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;

  // CASE 1: Agent confirmed -> Dispatch email to client
  if (isApprovalMessage(messageText)) {
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

      // Reply back to WhatsApp confirming dispatch
      const confirmMsg = formatConfirmationWhatsAppNotification({
        leadName,
        leadEmail: draft.lead.email,
        version: draft.version,
      });
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

  // CASE 2: Agent suggested changes -> Inculcate changes into draft and re-share for confirmation
  const revisionFeedback = messageText.trim();
  const nextVersion = draft.version + 1;

  try {
    const revised = await generateProposedReply({
      lead: draft.lead,
      inboundSubject: draft.inboundSubject,
      inboundBody: draft.inboundBody,
      currentDraft: {
        subject: draft.draftSubject,
        bodyHtml: draft.draftBody,
      },
      revisionFeedback,
    });

    // Update draft with revised content
    await prisma.proposedReplyDraft.update({
      where: { id: draft.id },
      data: {
        draftSubject: revised.subject,
        draftBody: revised.bodyHtml,
        version: nextVersion,
        revisionNotes: revisionFeedback,
        status: "REVISED",
      },
    });

    // Log revision activity
    await prisma.activity.create({
      data: {
        leadId: draft.lead.id,
        type: "note",
        message: `📝 Agent suggested changes via WhatsApp: "${revisionFeedback}". AI updated draft to v${nextVersion}.`,
      },
    });

    // Disseminate revised draft to agent's WhatsApp
    const revisedWhatsAppMsg = formatRevisedDraftNotification({
      leadName,
      draftSubject: revised.subject,
      draftBody: revised.bodyText,
      version: nextVersion,
      feedback: revisionFeedback,
    });

    await sendWhatsAppTextMessage(fromPhone, revisedWhatsAppMsg);

    return {
      ok: true,
      action: "revised",
      draftId: draft.id,
      version: nextVersion,
      message: `Revised draft (v${nextVersion}) created with feedback and shared to WhatsApp.`,
    };
  } catch (err: any) {
    console.error("[Failed to revise draft]:", err);
    return {
      ok: false,
      action: "none",
      draftId: draft.id,
      error: `Failed to revise draft: ${err.message}`,
    };
  }
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
