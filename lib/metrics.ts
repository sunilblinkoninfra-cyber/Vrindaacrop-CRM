import { prisma } from "@/lib/prisma";
import { EmailEventType, LeadStage } from "@prisma/client";

export async function leadStageCounts() {
  const rows = await prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } });
  const map = new Map(rows.map((r) => [r.stage, r._count._all]));
  return Object.values(LeadStage).map((stage) => ({
    stage,
    count: map.get(stage) ?? 0,
  }));
}

export async function emailFunnel(since?: Date) {
  const where = since ? { createdAt: { gte: since } } : {};
  const rows = await prisma.emailEvent.groupBy({
    by: ["type"],
    where,
    _count: { _all: true },
  });
  const map = new Map(rows.map((r) => [r.type, r._count._all]));
  const sent = map.get(EmailEventType.SENT) ?? 0;
  const opened = map.get(EmailEventType.OPENED) ?? 0;
  const clicked = map.get(EmailEventType.CLICKED) ?? 0;
  const replied = map.get(EmailEventType.REPLIED) ?? 0;
  const bounced = map.get(EmailEventType.BOUNCED) ?? 0;
  return {
    sent,
    opened,
    clicked,
    replied,
    bounced,
    openRate: sent ? Math.round((opened / sent) * 100) : 0,
    replyRate: sent ? Math.round((replied / sent) * 100) : 0,
  };
}

export async function totals() {
  const [leads, hot, suppressed, activeCampaigns] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { hot: true } }),
    prisma.lead.count({ where: { isSuppressed: true } }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
  ]);
  return { leads, hot, suppressed, activeCampaigns };
}
