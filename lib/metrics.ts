import { prisma } from "@/lib/prisma";
import { EmailEventType, LeadStage, ValidationStatus, Prisma } from "@prisma/client";
import { subDays, subMonths, startOfYear, format } from "date-fns";

/** Optional lead scope (e.g. AGENT → { ownerId } ) applied to every metric. */
export type Scope = Prisma.LeadWhereInput;

export type DashboardFilter = {
  timeframe?: "7d" | "30d" | "90d" | "6m" | "ytd" | "all";
  sector?: string;
  geography?: string;
  ownerId?: string;
  validationStatus?: ValidationStatus | "ALL";
  campaignId?: string;
};

export function getTimeframeDate(timeframe?: string): Date | undefined {
  const now = new Date();
  switch (timeframe) {
    case "7d":
      return subDays(now, 7);
    case "30d":
      return subDays(now, 30);
    case "90d":
      return subDays(now, 90);
    case "6m":
      return subMonths(now, 6);
    case "ytd":
      return startOfYear(now);
    case "all":
    default:
      return undefined;
  }
}

export function buildDashboardWhere(
  userScope: Scope = {},
  filters: DashboardFilter = {}
): Prisma.LeadWhereInput {
  const conditions: Prisma.LeadWhereInput[] = [userScope];

  const since = getTimeframeDate(filters.timeframe);
  if (since) {
    conditions.push({ createdAt: { gte: since } });
  }

  if (filters.sector && filters.sector !== "ALL") {
    conditions.push({ sector: filters.sector });
  }

  if (filters.geography && filters.geography !== "ALL") {
    conditions.push({ geography: filters.geography });
  }

  if (filters.ownerId && filters.ownerId !== "ALL") {
    if (filters.ownerId === "UNASSIGNED") {
      conditions.push({ ownerId: null });
    } else {
      conditions.push({ ownerId: filters.ownerId });
    }
  }

  if (filters.validationStatus && filters.validationStatus !== "ALL") {
    conditions.push({ validationStatus: filters.validationStatus });
  }

  if (filters.campaignId && filters.campaignId !== "ALL") {
    conditions.push({
      enrollments: { some: { campaignId: filters.campaignId } },
    });
  }

  return { AND: conditions };
}

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

  const [rows, openLeads, sentLeads, replyLeads, clickLeads] = await Promise.all([
    prisma.emailEvent.groupBy({
      by: ["type"],
      where,
      _count: { _all: true },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { ...where, type: EmailEventType.OPENED },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { ...where, type: EmailEventType.SENT },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { ...where, type: EmailEventType.REPLIED },
    }),
    prisma.emailEvent.groupBy({
      by: ["leadId"],
      where: { ...where, type: EmailEventType.CLICKED },
    }),
  ]);

  const map = new Map(rows.map((r) => [r.type, r._count._all]));
  const totalSent = map.get(EmailEventType.SENT) ?? 0;
  const totalOpened = map.get(EmailEventType.OPENED) ?? 0;
  const totalClicked = map.get(EmailEventType.CLICKED) ?? 0;
  const totalReplied = map.get(EmailEventType.REPLIED) ?? 0;
  const bounced = map.get(EmailEventType.BOUNCED) ?? 0;

  const uniqueSent = sentLeads.length || totalSent;
  const uniqueOpened = openLeads.length;
  const uniqueReplied = replyLeads.length;
  const uniqueClicked = clickLeads.length;

  return {
    sent: totalSent,
    uniqueSent,
    opened: uniqueOpened,
    totalOpened,
    clicked: uniqueClicked,
    totalClicked,
    replied: uniqueReplied,
    totalReplied,
    bounced,
    openRate: uniqueSent ? Math.min(100, Math.round((uniqueOpened / uniqueSent) * 100)) : 0,
    replyRate: uniqueSent ? Math.min(100, Math.round((uniqueReplied / uniqueSent) * 100)) : 0,
    clickRate: uniqueSent ? Math.min(100, Math.round((uniqueClicked / uniqueSent) * 100)) : 0,
  };
}

export async function totals(scope: Scope = {}) {
  const [leads, hot, suppressed, activeCampaigns, invalidEmails, wonLeads] = await Promise.all([
    prisma.lead.count({ where: scope }),
    prisma.lead.count({ where: { ...scope, hot: true } }),
    prisma.lead.count({ where: { ...scope, isSuppressed: true } }),
    prisma.campaign.count({ where: { status: "ACTIVE" } }),
    prisma.lead.count({
      where: { ...scope, validationStatus: { in: [ValidationStatus.INVALID, ValidationStatus.DISPOSABLE] } },
    }),
    prisma.lead.count({ where: { ...scope, stage: LeadStage.WON } }),
  ]);
  return { leads, hot, suppressed, activeCampaigns, invalidEmails, wonLeads };
}

export async function timelineMetrics(since?: Date, scope: Scope = {}) {
  const eventWhere: Prisma.EmailEventWhereInput = {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(Object.keys(scope).length ? { lead: scope } : {}),
  };

  const [events, leads] = await Promise.all([
    prisma.emailEvent.findMany({
      where: eventWhere,
      select: { type: true, createdAt: true, leadId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lead.findMany({
      where: {
        ...scope,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Group by date bucket (e.g. YYYY-MM-DD or MMM yyyy)
  const map = new Map<
    string,
    { date: string; label: string; sent: number; opened: number; clicked: number; replied: number; newLeads: number }
  >();
  const leadSets = new Map<
    string,
    { sent: Set<string>; opened: Set<string>; clicked: Set<string>; replied: Set<string> }
  >();

  // Helper to format date
  const isShortTimeframe = since && (Date.now() - since.getTime()) < 45 * 24 * 60 * 60 * 1000;

  function getKey(d: Date): { key: string; label: string } {
    if (isShortTimeframe) {
      return { key: format(d, "yyyy-MM-dd"), label: format(d, "MMM d") };
    }
    return { key: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") };
  }

  for (const e of events) {
    const { key, label } = getKey(e.createdAt);
    if (!map.has(key)) {
      map.set(key, { date: key, label, sent: 0, opened: 0, clicked: 0, replied: 0, newLeads: 0 });
      leadSets.set(key, { sent: new Set(), opened: new Set(), clicked: new Set(), replied: new Set() });
    }
    const sets = leadSets.get(key)!;
    const item = map.get(key)!;

    if (e.type === EmailEventType.SENT) {
      if (!sets.sent.has(e.leadId)) {
        sets.sent.add(e.leadId);
        item.sent++;
      }
    } else if (e.type === EmailEventType.OPENED) {
      if (!sets.opened.has(e.leadId)) {
        sets.opened.add(e.leadId);
        item.opened++;
      }
    } else if (e.type === EmailEventType.CLICKED) {
      if (!sets.clicked.has(e.leadId)) {
        sets.clicked.add(e.leadId);
        item.clicked++;
      }
    } else if (e.type === EmailEventType.REPLIED) {
      if (!sets.replied.has(e.leadId)) {
        sets.replied.add(e.leadId);
        item.replied++;
      }
    }
  }

  for (const l of leads) {
    const { key, label } = getKey(l.createdAt);
    if (!map.has(key)) {
      map.set(key, { date: key, label, sent: 0, opened: 0, clicked: 0, replied: 0, newLeads: 0 });
    }
    map.get(key)!.newLeads++;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function sectorDistribution(scope: Scope = {}) {
  const rows = await prisma.lead.groupBy({
    by: ["sector"],
    where: scope,
    _count: { _all: true },
    orderBy: { _count: { sector: "desc" } },
  });

  return rows
    .filter((r) => r.sector)
    .map((r) => ({
      name: r.sector as string,
      value: r._count._all,
    }))
    .slice(0, 7);
}

export async function geographyDistribution(scope: Scope = {}) {
  const rows = await prisma.lead.groupBy({
    by: ["geography"],
    where: scope,
    _count: { _all: true },
    orderBy: { _count: { geography: "desc" } },
  });

  return rows
    .filter((r) => r.geography)
    .map((r) => ({
      name: r.geography as string,
      value: r._count._all,
    }))
    .slice(0, 6);
}

export async function validationBreakdown(scope: Scope = {}) {
  const rows = await prisma.lead.groupBy({
    by: ["validationStatus"],
    where: scope,
    _count: { _all: true },
  });
  const map = new Map(rows.map((r) => [r.validationStatus, r._count._all]));

  return Object.values(ValidationStatus).map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));
}

export async function getDashboardAnalytics(userScope: Scope = {}, filters: DashboardFilter = {}) {
  const where = buildDashboardWhere(userScope, filters);
  const since = getTimeframeDate(filters.timeframe);

  const [
    kpiTotals,
    funnel,
    stages,
    timeline,
    sectors,
    geographies,
    validation,
    hotLeads,
    campaigns,
  ] = await Promise.all([
    totals(where),
    emailFunnel(since, where),
    leadStageCounts(where),
    timelineMetrics(since, where),
    sectorDistribution(where),
    geographyDistribution(where),
    validationBreakdown(where),
    prisma.lead.findMany({
      where: { ...where, hot: true },
      take: 6,
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { name: true, email: true } } },
    }),
    prisma.campaign.findMany({
      where: { status: "ACTIVE" },
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { enrollments: true, steps: true } },
      },
    }),
  ]);

  return {
    kpi: kpiTotals,
    funnel,
    stages,
    timeline,
    sectors,
    geographies,
    validation,
    hotLeads,
    campaigns,
  };
}
