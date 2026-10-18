import { Prisma, ValidationStatus, LeadStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { segmentToWhere } from "@/lib/leads-query";
import { isWeekend, getNextWeekday } from "@/lib/outreach/scheduler";
import { env } from "@/lib/env";

const BATCH_SIZE = 500;

/**
 * Enroll all leads matching a campaign's segment that are strictly VALID, not suppressed,
 * and not already enrolled. If allowRecontacting is false (default), already contacted emails
 * are strictly excluded even across new campaigns.
 */
export async function enrollCampaignLeads(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.steps.length === 0) throw new Error("Campaign has no sequence steps");

  const segment = (campaign.segment ?? {}) as Record<string, string>;
  const allowRecontact = String(segment?.allowRecontacting ?? "false") === "true";

  const where: Prisma.LeadWhereInput = {
    ...segmentToWhere(segment),
    validationStatus: ValidationStatus.VALID,
    isSuppressed: false,
    enrollments: { none: { campaignId } },
  };

  if (!allowRecontact) {
    where.stage = LeadStage.NEW;
    where.emailEvents = { none: { type: "SENT" } };
    where.activities = { none: { type: "email_sent" } };
    where.enrollments = {
      none: {
        OR: [
          { campaignId },
          { lastEventType: { in: ["SENT", "OPENED", "CLICKED", "REPLIED"] } },
          { currentStep: { gt: 0 } },
        ],
      },
    };

    // Find any emailNormalized that has already had an outreach email sent anywhere in the CRM
    const sentEvents = await prisma.emailEvent.findMany({
      where: { type: "SENT" },
      select: { lead: { select: { emailNormalized: true } } },
      distinct: ["leadId"],
    });
    const contactedEmails = Array.from(
      new Set(sentEvents.map((e) => e.lead?.emailNormalized).filter(Boolean) as string[])
    );
    if (contactedEmails.length > 0) {
      where.emailNormalized = { notIn: contactedEmails };
    }
  }

  let totalEnrolled = 0;
  let cursor: string | undefined;

  for (;;) {
    const leads = await prisma.lead.findMany({
      where,
      select: { id: true },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (leads.length === 0) break;

    const now = new Date();
    const initialSendAt = isWeekend(now, env.sending.timezone)
      ? getNextWeekday(now, env.sending.timezone, env.sending.sendWindowStart)
      : now;

    await prisma.enrollment.createMany({
      data: leads.map((l) => ({
        leadId: l.id,
        campaignId,
        currentStep: 0,
        state: "ACTIVE" as const,
        nextSendAt: initialSendAt,
      })),
      skipDuplicates: true,
    });

    totalEnrolled += leads.length;
    cursor = leads[leads.length - 1].id;
    if (leads.length < BATCH_SIZE) break;
  }

  return totalEnrolled;
}

/** Pause every active enrollment for a lead (used on reply / unsubscribe / bounce). */
export async function pauseEnrollmentsForLead(leadId: string, reason: string) {
  await prisma.enrollment.updateMany({
    where: { leadId, state: "ACTIVE" },
    data: { state: "PAUSED", pausedReason: reason, nextSendAt: null },
  });
}
