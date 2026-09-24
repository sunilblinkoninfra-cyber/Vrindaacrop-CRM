import { prisma } from "@/lib/prisma";
import { findLeadForEvent } from "@/lib/outreach/events";
import { isFurther } from "@/lib/outreach/status";
import { notifyOwnerOfReply } from "@/lib/notify";
import { EmailEventType, Prisma } from "@prisma/client";

/**
 * Handle a detected reply from a lead:
 *  - record REPLIED event
 *  - pause active enrollments (stop over-mailing a warm lead)
 *  - tag lead Hot + move to REPLIED stage
 *  - notify the assigned owner (email + WhatsApp)
 *
 * All DB writes happen inside a single transaction so a partial failure can't
 * leave the lead in an inconsistent state (e.g. paused sequence but not Hot).
 * The owner notification is fired *after* the transaction commits — it's a
 * side-effect and doesn't need atomicity with the DB writes.
 */
export async function handleReply(args: {
  fromEmail: string;
  messageId?: string;
  snippet?: string;
  subject?: string;
  body?: string;
  isHotLead?: boolean;
  intentReason?: string;
}) {
  const match = await findLeadForEvent(args.messageId, args.fromEmail);
  if (!match) return { matched: false };

  const { leadId, enrollmentId } = match;
  const isHot = Boolean(args.isHotLead);

  // Deduplication check: if messageId exists, check if already recorded
  if (args.messageId) {
    const existing = await prisma.emailEvent.findFirst({
      where: {
        leadId,
        type: EmailEventType.REPLIED,
        messageId: args.messageId,
      },
    });
    if (existing) return { matched: true, leadId, alreadyProcessed: true };
  }

  const leadForNotify = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, include: { owner: true } });
    if (!lead) return null;

    await tx.emailEvent.create({
      data: {
        leadId,
        enrollmentId: enrollmentId ?? null,
        type: EmailEventType.REPLIED,
        messageId: args.messageId ?? null,
        metadata: {
          snippet: args.snippet,
          isHotLead: isHot,
          reason: args.intentReason,
        } as Prisma.InputJsonValue,
      },
    });

    // Denormalize the furthest status onto the enrollment.
    if (enrollmentId) {
      const enr = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { lastEventType: true },
      });
      if (enr && isFurther(enr.lastEventType, EmailEventType.REPLIED)) {
        await tx.enrollment.update({
          where: { id: enrollmentId },
          data: { lastEventType: EmailEventType.REPLIED, lastEventAt: new Date() },
        });
      }
    }

    // Pause every active enrollment for this lead.
    await tx.enrollment.updateMany({
      where: { leadId, state: "ACTIVE" },
      data: { state: "PAUSED", pausedReason: "replied", nextSendAt: null },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: {
        hot: isHot,
        stage: lead.stage === "WON" || lead.stage === "LOST" ? lead.stage : "REPLIED",
      },
    });

    await tx.activity.create({
      data: {
        leadId,
        type: "reply",
        message: isHot
          ? `🔥 Hot Lead replied: "${args.subject || "Inquiry"}" — showed interest to know more / requested details. Sequence paused.`
          : `Lead replied: "${args.subject || "Reply"}" — sequence paused.`,
      },
    });

    return lead;
  });

  if (!leadForNotify) return { matched: false };

  // Only notify owner as HOT lead alert if isHot is true
  if (isHot) {
    await notifyOwnerOfReply(leadForNotify, args.snippet ?? "");
  }

  // Generate AI Proposed Draft & trigger WhatsApp Human-in-the-Loop Loop
  const fullBody = args.body || args.snippet || "Client replied to outreach email.";
  try {
    const { processInboundEmailForDrafting } = await import("@/lib/whatsapp-revert");
    await processInboundEmailForDrafting({
      leadId: leadForNotify.id,
      fromEmail: args.fromEmail,
      subject: args.subject,
      body: fullBody,
    });
  } catch (draftErr) {
    console.error("[processInboundEmailForDrafting error]:", draftErr);
  }

  return { matched: true, leadId };
}
