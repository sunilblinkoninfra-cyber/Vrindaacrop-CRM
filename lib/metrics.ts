import { prisma } from "@/lib/prisma";
import { EmailEventType, LeadStage, ValidationStatus, Prisma } from "@prisma/client";

/** Optional lead scope (e.g. AGENT → { ownerId } ) applied to every metric. */
type Scope = Prisma.LeadWhereInput;

export async function leadStageCounts(scope: Scope = {}) {
  const rows = await prisma.lead.groupBy({ by: ["stage"], where: scope, _count: { _all: true } });
  const map = new Map(rows.map((r) => [r.stage, r._count._all]));
  return Object.values(LeadStage).map((stage) => ({
    stage,
    count: map.get(stage) ?? 0,
  }));
}

export async function emailFunnel(since?: Date, scope: Scope = {}) {
  const where: Prisma.EmailEventWhereInput = {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(Object.keys(scope).length ? { lead: scope } : {}),
  };
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

export async function totals(scope: Scope = {}) {
  const [leads, hot, suppressed, activeCampaigns, invalidEmails] = await Promise.all([
    prisma.lead.count({ where: scope }),
    prisma.lead.count({ where: { ...scope, hot: true } }),
    prisma.lead.count({ where: { ...scope, isSuppressed: true } }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.lead.count({
      where: { ...scope, validationStatus: { in: [ValidationStatus.INVALID, ValidationStatus.DISPOSABLE] } },
    }),
  ]);
  return { leads, hot, suppressed, activeCampaigns, invalidEmails };
}
