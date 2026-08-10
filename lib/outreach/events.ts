import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { pauseEnrollmentsForLead } from "@/lib/outreach/enroll";
import { EmailEventType, SuppressionReason, Prisma } from "@prisma/client";

/** Record an email event for a lead and (optionally) enrollment. */
export async function recordEvent(args: {
  leadId: string;
  enrollmentId?: string | null;
  type: EmailEventType;
  messageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.emailEvent.create({
    data: {
      leadId: args.leadId,
      enrollmentId: args.enrollmentId ?? null,
      type: args.type,
      messageId: args.messageId ?? null,
      metadata: (args.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

/** Add/refresh a global suppression entry and flag the lead. */
export async function suppressLead(leadId: string, email: string, reason: SuppressionReason) {
  const emailNormalized = normalizeEmail(email);
  await prisma.suppression.upsert({
    where: { emailNormalized },
    update: { reason },
    create: { emailNormalized, reason },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { isSuppressed: true } });
  await pauseEnrollmentsForLead(leadId, reason.toLowerCase());
}

/** Resolve a lead by SES messageId (from webhook) falling back to email. */
export async function findLeadForEvent(messageId?: string, email?: string) {
  if (messageId) {
    const ev = await prisma.emailEvent.findFirst({
      where: { messageId, type: EmailEventType.SENT },
      orderBy: { createdAt: "desc" },
    });
    if (ev) return { leadId: ev.leadId, enrollmentId: ev.enrollmentId };
  }
  if (email) {
    const lead = await prisma.lead.findFirst({ where: { emailNormalized: normalizeEmail(email) } });
    if (lead) return { leadId: lead.id, enrollmentId: null as string | null };
  }
  return null;
}
