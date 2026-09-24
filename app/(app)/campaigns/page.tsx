import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { NewCampaign } from "./new-campaign";
import { CampaignsList } from "./campaigns-list";
import { ensureDefaultSendingPlan } from "@/lib/outreach/scheduler";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaignsRaw, defaultPlan] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { enrollments: true, steps: true } },
        sendingPlan: {
          select: {
            timezone: true,
            sendWindowStart: true,
            sendWindowEnd: true,
            fromEmail: true,
            status: true,
            hardDailyCap: true,
          },
        },
      },
    }),
    ensureDefaultSendingPlan(),
  ]);

  const campaigns = await Promise.all(
    campaignsRaw.map(async (c) => {
      const [nextEnrollment, activeValidCount, activeTotalCount, pausedCount] = await Promise.all([
        prisma.enrollment.findFirst({
          where: { campaignId: c.id, state: "ACTIVE", nextSendAt: { not: null } },
          orderBy: { nextSendAt: "asc" },
          select: { nextSendAt: true },
        }),
        prisma.enrollment.count({
          where: {
            campaignId: c.id,
            state: "ACTIVE",
            lead: { isSuppressed: false, validationStatus: "VALID" },
          },
        }),
        prisma.enrollment.count({
          where: { campaignId: c.id, state: "ACTIVE" },
        }),
        prisma.enrollment.count({
          where: { campaignId: c.id, state: "PAUSED" },
        }),
      ]);

      const plan = c.sendingPlan || defaultPlan;
      const scheduleMeta = ((c.segment as Record<string, any>) || {})?._schedule || null;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        nextScheduledAt: nextEnrollment?.nextSendAt ?? null,
        activeValidCount,
        activeTotalCount,
        pausedCount,
        scheduleMeta,
        plan: {
          sendWindowStart: plan.sendWindowStart,
          sendWindowEnd: plan.sendWindowEnd,
          timezone: plan.timezone,
          fromEmail: plan.fromEmail,
          hardDailyCap: plan.hardDailyCap,
        },
        _count: c._count,
      };
    })
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step drip sequences per segment with live deliverability and schedule tracking."
        actions={<NewCampaign />}
      />

      <Card className="p-0">
        <CampaignsList campaigns={campaigns} />
      </Card>
    </div>
  );
}
