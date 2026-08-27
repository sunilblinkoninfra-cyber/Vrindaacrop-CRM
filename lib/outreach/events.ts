import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { pauseEnrollmentsForLead } from "@/lib/outreach/enroll";
import { isFurther } from "@/lib/outreach/status";
import { EmailEventType, SuppressionReason, ValidationStatus, Prisma } from "@prisma/client";

/** Record an email event for a lead and (optionally) enrollment. */
export async function recordEvent(args: {
  leadId: string;
  enrollmentId?: string | null;
  type: EmailEventType;
  messageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  // If OPENED event was triggered within last 5 seconds, skip duplicate proxy fetch
  if (args.type === EmailEventType.OPENED) {
    const recent = await prisma.emailEvent.findFirst({
      where: {
        leadId: args.leadId,
        type: EmailEventType.OPENED,
        createdAt: { gte: new Date(Date.now() - 5000) },
      },
    });
    if (recent) return;
  }

  await prisma.emailEvent.create({
    data: {
      leadId: args.leadId,
      enrollmentId: args.enrollmentId ?? null,
      type: args.type,
      messageId: args.messageId ?? null,
      metadata: (args.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  // If OPENED event, log to lead activity feed
  if (args.type === EmailEventType.OPENED) {
    const openCount = await prisma.emailEvent.count({
      where: { leadId: args.leadId, type: EmailEventType.OPENED },
    });
    const message =
      openCount > 1
        ? `Lead re-opened email (opened ${openCount} times)`
        : "Lead opened email";

    await prisma.activity.create({
      data: {
        leadId: args.leadId,
        type: "email",
        message,
      },
    }).catch(() => undefined);
  }

  // Denormalize the furthest status onto the enrollment for fast campaign views.
  if (args.enrollmentId) {
    const enr = await prisma.enrollment.findUnique({
      where: { id: args.enrollmentId },
      select: { lastEventType: true },
    });
    if (enr && isFurther(enr.lastEventType, args.type)) {
      await prisma.enrollment.update({
        where: { id: args.enrollmentId },
        data: { lastEventType: args.type, lastEventAt: new Date() },
      });
    }
  }
}

/**
 * Add/refresh a global suppression entry and flag the lead. A real hard bounce
 * is stronger evidence than anything the local/SMTP validation layers could
 * guess, so it also permanently downgrades validationStatus to INVALID. A
 * complaint means "don't email me" (consent), not "this address doesn't
 * exist" (deliverability) — it leaves validationStatus untouched.
 */
export async function suppressLead(leadId: string, email: string, reason: SuppressionReason) {
  const emailNormalized = normalizeEmail(email);
  await prisma.suppression.upsert({
    where: { emailNormalized },
    update: { reason },
    create: { emailNormalized, reason },
  });
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      isSuppressed: true,
      ...(reason === SuppressionReason.HARD_BOUNCE
        ? {
            validationStatus: ValidationStatus.INVALID,
            validationReason: "SES hard bounce",
            validationCheckedAt: new Date(),
          }
        : {}),
    },
  });
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
