import { prisma } from "@/lib/prisma";
import { segmentToWhere } from "@/lib/leads-query";

/**
 * Enroll all leads matching a campaign's segment that are not suppressed and
 * not already enrolled. Returns the number newly enrolled. First send is due
 * immediately (step 0); the sender worker picks them up.
 */
export async function enrollCampaignLeads(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.steps.length === 0) throw new Error("Campaign has no sequence steps");

  const segment = (campaign.segment ?? {}) as Record<string, string>;
  const where = segmentToWhere(segment);

  const leads = await prisma.lead.findMany({
    where: {
      ...where,
      enrollments: { none: { campaignId } },
    },
    select: { id: true },
  });

  if (leads.length === 0) return 0;

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

  return leads.length;
}

/** Pause every active enrollment for a lead (used on reply / unsubscribe / bounce). */
export async function pauseEnrollmentsForLead(leadId: string, reason: string) {
  await prisma.enrollment.updateMany({
    where: { leadId, state: "ACTIVE" },
    data: { state: "PAUSED", pausedReason: reason, nextSendAt: null },
  });
}
