import { prisma } from "@/lib/prisma";
import { EmailEventType, LeadStage } from "@prisma/client";
import { formatBiWeeklyStrategyNotification, sendWhatsAppTextMessage } from "@/lib/whatsapp";
import { subDays } from "date-fns";

export type StrategyEvaluationResult = {
  rolling14DaysSent: number;
  rollingBounceRate: number;
  rollingOpenRate: number;
  rollingReplyRate: number;
  domainStatus: "Pristine" | "Healthy" | "Caution" | "At Risk";
  currentCap: number;
  proposedCap: number;
  scalingRecommendation: string;
  topSector: string;
};

/**
 * Analyzes the last 14 days of outreach deliverability and engagement,
 * formulating an intelligent scaling / warmup recommendation.
 */
export async function evaluateBiWeeklyStrategy(): Promise<StrategyEvaluationResult> {
  const cutoffDate = subDays(new Date(), 14);

  // 1. Fetch 14-day events
  const [eventRows, openEvents, replyEvents, sectorEvents, plan] = await Promise.all([
    prisma.emailEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: cutoffDate } },
      _count: { _all: true },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { type: EmailEventType.OPENED, createdAt: { gte: cutoffDate } },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { type: EmailEventType.REPLIED, createdAt: { gte: cutoffDate } },
    }),
    prisma.lead.groupBy({
      by: ["sector"],
      where: {
        emailEvents: { some: { type: EmailEventType.REPLIED, createdAt: { gte: cutoffDate } } },
      },
      _count: { _all: true },
      orderBy: { _count: { sector: "desc" } },
      take: 1,
    }),
    prisma.sendingPlan.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const map = new Map(eventRows.map((r) => [r.type, r._count._all]));
  const sent = map.get(EmailEventType.SENT) ?? 0;
  const bounced = map.get(EmailEventType.BOUNCED) ?? 0;
  const uniqueOpens = openEvents.length;
  const uniqueReplies = replyEvents.length;

  const rollingBounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
  const rollingOpenRate = sent > 0 ? (uniqueOpens / sent) * 100 : 0;
  const rollingReplyRate = sent > 0 ? (uniqueReplies / sent) * 100 : 0;

  const topSector = sectorEvents[0]?.sector || "Corporate";

  // Determine current cap
  const currentCap = plan?.hardDailyCap || 50;
  let proposedCap = currentCap;
  let domainStatus: StrategyEvaluationResult["domainStatus"] = "Healthy";
  let scalingRecommendation = "";

  if (sent < 30) {
    domainStatus = "Pristine";
    proposedCap = Math.max(35, currentCap);
    scalingRecommendation = `Low volume period (${sent} emails sent). Recommended initial warmup cap of ${proposedCap}/day across ${topSector} leads to condition mailbox reputation.`;
  } else if (rollingBounceRate > 3.0) {
    domainStatus = "At Risk";
    proposedCap = Math.max(20, Math.floor(currentCap * 0.7));
    scalingRecommendation = `⚠️ High bounce rate detected (${rollingBounceRate.toFixed(1)}% > 3.0%). Recommending emergency 30% reduction to ${proposedCap}/day and re-running MX mailbox probing to protect vrindaacorp.com reputation.`;
  } else if (rollingBounceRate >= 1.5) {
    domainStatus = "Caution";
    proposedCap = currentCap;
    scalingRecommendation = `Bounce rate is borderline (${rollingBounceRate.toFixed(1)}%). Recommend maintaining current ${currentCap}/day cap for another 7 days before expanding.`;
  } else {
    // Healthy / Pristine: scale up progressively
    domainStatus = rollingBounceRate < 0.5 ? "Pristine" : "Healthy";
    if (currentCap < 35) {
      proposedCap = 50;
    } else if (currentCap < 60) {
      proposedCap = 75;
    } else if (currentCap < 90) {
      proposedCap = 100;
    } else if (currentCap < 125) {
      proposedCap = 125;
    } else {
      proposedCap = Math.min(200, currentCap + 25);
    }

    scalingRecommendation = `Deliverability is pristine (Bounce rate: ${rollingBounceRate.toFixed(2)}%, Open rate: ${rollingOpenRate.toFixed(1)}%). Domain is fully conditioned. Safe to increase daily quota by +${proposedCap - currentCap} leads/day with focus on ${topSector}.`;
  }

  return {
    rolling14DaysSent: sent,
    rollingBounceRate,
    rollingOpenRate,
    rollingReplyRate,
    domainStatus,
    currentCap,
    proposedCap,
    scalingRecommendation,
    topSector,
  };
}

/**
 * Dispatches the Bi-Weekly Strategic Strategy Briefing to the Owner's WhatsApp.
 */
export async function runAndDispatchBiWeeklyStrategyReport(ownerPhone?: string): Promise<{
  ok: boolean;
  result: StrategyEvaluationResult;
  messageDispatched: boolean;
}> {
  const result = await evaluateBiWeeklyStrategy();

  // Find owner WhatsApp number if not provided
  let targetPhone = ownerPhone;
  if (!targetPhone) {
    const owner = await prisma.user.findFirst({
      where: { role: { in: ["OWNER", "ADMIN"] }, whatsappNumber: { not: null } },
      select: { whatsappNumber: true },
    });
    targetPhone = owner?.whatsappNumber || undefined;
  }

  let messageDispatched = false;
  if (targetPhone) {
    const text = formatBiWeeklyStrategyNotification({
      rolling14DaysSent: result.rolling14DaysSent,
      rollingBounceRate: result.rollingBounceRate,
      rollingOpenRate: result.rollingOpenRate,
      domainStatus: result.domainStatus,
      currentCap: result.currentCap,
      proposedCap: result.proposedCap,
      scalingRecommendation: result.scalingRecommendation,
      topSector: result.topSector,
    });

    const sendRes = await sendWhatsAppTextMessage(targetPhone, text);
    messageDispatched = sendRes.ok;
  }

  return { ok: true, result, messageDispatched };
}

/**
 * Executes the Owner's confirmation ("APPROVE STRATEGY") to update the sending plan in the database.
 */
export async function applyBiWeeklyStrategy(proposedCap: number): Promise<{
  ok: boolean;
  newCap: number;
  message: string;
}> {
  const safeCap = Math.max(10, Math.min(proposedCap, 500));

  const plan = await prisma.sendingPlan.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (plan) {
    await prisma.sendingPlan.update({
      where: { id: plan.id },
      data: {
        hardDailyCap: safeCap,
        lastHealthCheckAt: new Date(),
      },
    });
  }

  await prisma.jobRun.create({
    data: {
      job: "strategy_scaling",
      ok: true,
      finishedAt: new Date(),
      detail: `Bi-Weekly Strategy Approved: Daily outreach sending cap updated to ${safeCap}/day to optimize domain scaling.`,
    },
  });

  return {
    ok: true,
    newCap: safeCap,
    message: `✅ Bi-Weekly Strategy Applied! Daily sending cap has been safely updated to ${safeCap} emails/day.`,
  };
}
