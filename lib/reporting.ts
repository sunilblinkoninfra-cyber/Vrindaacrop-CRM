import { prisma } from "@/lib/prisma";
import { EmailEventType, Prisma } from "@prisma/client";
import { format, subMonths, startOfMonth } from "date-fns";

export type MonthlyRow = {
  month: string; // "YYYY-MM"
  label: string; // "Aug 2026"
  sent: number;
  opened: number;
  replied: number;
};

/** Sent/opened/replied per month for the last N months. */
export async function monthlyFunnel(months = 6): Promise<MonthlyRow[]> {
  const since = startOfMonth(subMonths(new Date(), months - 1));
  const events = await prisma.emailEvent.findMany({
    where: { createdAt: { gte: since }, type: { in: [EmailEventType.SENT, EmailEventType.OPENED, EmailEventType.REPLIED] } },
    select: { type: true, createdAt: true },
  });

  const buckets = new Map<string, MonthlyRow>();
  for (let i = 0; i < months; i++) {
    const d = startOfMonth(subMonths(new Date(), months - 1 - i));
    const key = format(d, "yyyy-MM");
    buckets.set(key, { month: key, label: format(d, "MMM yyyy"), sent: 0, opened: 0, replied: 0 });
  }
  for (const e of events) {
    const key = format(e.createdAt, "yyyy-MM");
    const row = buckets.get(key);
    if (!row) continue;
    if (e.type === EmailEventType.SENT) row.sent++;
    else if (e.type === EmailEventType.OPENED) row.opened++;
    else if (e.type === EmailEventType.REPLIED) row.replied++;
  }
  return Array.from(buckets.values());
}

/** Top segments by lead count (sector). */
export async function topSectors(): Promise<{ sector: string; count: number }[]> {
  const rows = await prisma.lead.groupBy({
    by: ["sector"],
    _count: { _all: true },
    orderBy: { _count: { sector: "desc" } },
  });
  return rows
    .filter((r) => r.sector)
    .map((r) => ({ sector: r.sector as string, count: r._count._all }))
    .slice(0, 8);
}

/**
 * Top-performing templates by open rate. Correlates SENT and OPENED events to
 * the template via the sequence step's subject (best-effort using SENT counts).
 */
export async function topTemplates(): Promise<
  { name: string; sent: number; opened: number; openRate: number }[]
> {
  // Join email events to steps → templates via enrollment + stepOrder.
  const rows = await prisma.$queryRaw<
    { name: string; sent: bigint; opened: bigint }[]
  >(Prisma.sql`
    SELECT t."name" AS name,
           COUNT(*) FILTER (WHERE e."type" = 'SENT')   AS sent,
           COUNT(*) FILTER (WHERE e."type" = 'OPENED') AS opened
    FROM "EmailEvent" e
    JOIN "Enrollment" en ON en."id" = e."enrollmentId"
    JOIN "SequenceStep" s ON s."campaignId" = en."campaignId" AND s."order" = e."stepOrder"
    JOIN "EmailTemplate" t ON t."id" = s."templateId"
    WHERE e."enrollmentId" IS NOT NULL
    GROUP BY t."name"
    ORDER BY sent DESC
    LIMIT 10
  `);

  return rows.map((r) => {
    const sent = Number(r.sent);
    const opened = Number(r.opened);
    return { name: r.name, sent, opened, openRate: sent ? Math.round((opened / sent) * 100) : 0 };
  });
}
