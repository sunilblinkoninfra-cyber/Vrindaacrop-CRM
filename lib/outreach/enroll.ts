import { prisma } from "@/lib/prisma";
import { segmentToWhere } from "@/lib/leads-query";

const BATCH_SIZE = 500;

/**
 * Enroll all leads matching a campaign's segment that are not suppressed and
 * not already enrolled. Returns the number newly enrolled. First send is due
 * immediately (step 0); the sender worker picks them up.
 *
 * Processes leads in cursor-paginated batches of 500 rather than loading the
 * whole segment into memory at once — a 10k+-lead segment would otherwise
 * allocate 10k+ row objects and risk a single createMany() call bumping into
 * Postgres's bound-parameter limit.
 */
export async function enrollCampaignLeads(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.steps.length === 0) throw new Error("Campaign has no sequence steps");

  const segment = (campaign.segment ?? {}) as Record<string, string>;
  const where = {
    ...segmentToWhere(segment),
    enrollments: { none: { campaignId } },
  };

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

    await prisma.enrollment.createMany({
      data: leads.map((l) => ({
        leadId: l.id,
        campaignId,
        currentStep: 0,
        state: "ACTIVE" as const,
        nextSendAt: new Date(),
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
