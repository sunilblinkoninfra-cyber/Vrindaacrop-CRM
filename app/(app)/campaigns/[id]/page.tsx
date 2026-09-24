import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveOutboundSender } from "@/lib/ses";
import { ensureDefaultSendingPlan } from "@/lib/outreach/scheduler";
import { CampaignBuilder } from "./builder";
import { EnrolledLeads } from "./enrolled-leads";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, defaultPlan, templates, firstEnrollment] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        steps: { orderBy: { order: "asc" }, include: { template: true } },
        sendingPlan: {
          select: {
            sendWindowStart: true,
            sendWindowEnd: true,
            timezone: true,
            fromEmail: true,
            hardDailyCap: true,
            status: true,
          },
        },
        _count: { select: { enrollments: true } },
      },
    }),
    ensureDefaultSendingPlan(),
    prisma.emailTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.enrollment.findFirst({
      where: { campaignId: params.id },
      include: { lead: true },
    }),
  ]);

  if (!campaign) notFound();

  const outboundSender = getActiveOutboundSender();
  const plan = campaign.sendingPlan || defaultPlan;

  const [
    nextEnrollment,
    latestEnrollment,
    activeValidCount,
    activeTotalCount,
    pausedCount,
    completedCount,
    upcomingEnrollments,
  ] = await Promise.all([
    prisma.enrollment.findFirst({
      where: {
        campaignId: campaign.id,
        state: "ACTIVE",
        nextSendAt: { not: null },
        lead: { isSuppressed: false, validationStatus: "VALID" },
      },
      orderBy: { nextSendAt: "asc" },
      select: { nextSendAt: true },
    }),
    prisma.enrollment.findFirst({
      where: {
        campaignId: campaign.id,
        state: "ACTIVE",
        nextSendAt: { not: null },
        lead: { isSuppressed: false, validationStatus: "VALID" },
      },
      orderBy: { nextSendAt: "desc" },
      select: { nextSendAt: true },
    }),
    prisma.enrollment.count({
      where: {
        campaignId: campaign.id,
        state: "ACTIVE",
        lead: { isSuppressed: false, validationStatus: "VALID" },
      },
    }),
    prisma.enrollment.count({
      where: { campaignId: campaign.id, state: "ACTIVE" },
    }),
    prisma.enrollment.count({
      where: { campaignId: campaign.id, state: "PAUSED" },
    }),
    prisma.enrollment.count({
      where: { campaignId: campaign.id, state: "COMPLETED" },
    }),
    prisma.enrollment.findMany({
      where: {
        campaignId: campaign.id,
        state: "ACTIVE",
        nextSendAt: { not: null },
        lead: { isSuppressed: false, validationStatus: "VALID" },
      },
      select: { nextSendAt: true },
      orderBy: { nextSendAt: "asc" },
      take: 500,
    }),
  ]);

  // Aggregate upcoming schedule batches by calendar day
  const batchMap = new Map<string, { count: number; sampleTime: string }>();
  for (const e of upcomingEnrollments) {
    if (!e.nextSendAt) continue;
    const d = e.nextSendAt;
    const dateKey = d.toLocaleDateString("en-IN", { timeZone: plan.timezone, month: "short", day: "numeric", year: "numeric" });
    const timeKey = d.toLocaleTimeString("en-IN", { timeZone: plan.timezone, hour: "2-digit", minute: "2-digit", hour12: true });
    const existing = batchMap.get(dateKey);
    if (existing) {
      existing.count++;
    } else {
      batchMap.set(dateKey, { count: 1, sampleTime: timeKey });
    }
  }

  const upcomingBatches = Array.from(batchMap.entries())
    .map(([dateStr, val]) => ({
      dateStr,
      count: val.count,
      sampleTime: val.sampleTime,
    }))
    .slice(0, 7);

  const scheduleMeta = ((campaign.segment as Record<string, any>) || {})?._schedule || null;

  let nextScheduledAt: string | null = nextEnrollment?.nextSendAt ? nextEnrollment.nextSendAt.toISOString() : null;
  if (scheduleMeta?.firstSendAt) {
    const metaDate = new Date(scheduleMeta.firstSendAt);
    if (!isNaN(metaDate.getTime()) && metaDate > new Date()) {
      nextScheduledAt = metaDate.toISOString();
    }
  }

  const scheduleDetails = {
    nextScheduledAt,
    lastScheduledAt: latestEnrollment?.nextSendAt ? latestEnrollment.nextSendAt.toISOString() : null,
    activeValidCount,
    activeTotalCount,
    pausedCount,
    completedCount,
    sendWindowStart: plan.sendWindowStart,
    sendWindowEnd: plan.sendWindowEnd,
    timezone: plan.timezone,
    hardDailyCap: plan.hardDailyCap,
    fromEmail: plan.fromEmail,
    scheduleMeta,
    upcomingBatches,
  };

  return (
    <div className="space-y-4">
      <CampaignBuilder
        campaignId={campaign.id}
        campaignName={campaign.name}
        status={campaign.status}
        segment={(campaign.segment ?? {}) as Record<string, string>}
        scheduleDetails={scheduleDetails}
        steps={campaign.steps.map((s) => ({
          id: s.id,
          order: s.order,
          delayDays: s.delayDays,
          templateId: s.templateId,
          templateName: s.template.name,
          subjectA: s.template.subjectA,
          subjectB: s.template.subjectB,
          html: s.template.html,
          aiEnabled: s.template.aiEnabled,
        }))}
        templates={templates}
        enrolledCount={campaign._count.enrollments}
        outboundSender={outboundSender}
        sampleLead={
          firstEnrollment?.lead
            ? {
                firstName: firstEnrollment.lead.firstName,
                lastName: firstEnrollment.lead.lastName,
                company: firstEnrollment.lead.company,
                sector: firstEnrollment.lead.sector,
                city: firstEnrollment.lead.city,
                email: firstEnrollment.lead.email,
              }
            : undefined
        }
      />
      <EnrolledLeads campaignId={campaign.id} />
    </div>
  );
}
