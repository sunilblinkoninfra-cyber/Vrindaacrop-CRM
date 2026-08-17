import { NextRequest, NextResponse } from "next/server";
import { runSender } from "@/lib/outreach/sender";
import { runEscalation } from "@/lib/outreach/escalation";
import { runCompanyAlerts } from "@/lib/outreach/company-alerts";
import { runContractReminders } from "@/lib/outreach/contract-reminders";
import { runEnrichment } from "@/lib/ai/contract";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long batch sends (Vercel Pro)

/**
 * Scheduled runner — the serverless replacement for `npm run worker`. Vercel
 * Cron (see vercel.json) calls this on a schedule. It:
 *   - sends due outreach emails (daily cap),
 *   - fires 48h owner escalations,
 *   - sends 24h "unattended" alerts to the company inbox,
 *   - enriches pending leads with contract intelligence,
 *   - fires 1-month-before contract-renewal reminders.
 *
 * Protected by CRON_SECRET (Vercel sends it as `Authorization: Bearer <secret>`;
 * external cron can use `?token=<secret>`).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const token = req.nextUrl.searchParams.get("token");
    if (auth !== `Bearer ${secret}` && token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const started = new Date();
  const sender = await runSender();
  const escalation = await runEscalation();
  const company = await runCompanyAlerts();
  const enrichment = await runEnrichment(10);
  const contracts = await runContractReminders();

  await prisma.jobRun.create({
    data: {
      job: "cron",
      startedAt: started,
      finishedAt: new Date(),
      ok: true,
      detail: `sent=${sender.sent} escalated=${escalation.escalated} company=${company.replies}/${company.news} enriched=${enrichment.processed} contractReminders=${contracts.reminded}`,
    },
  });

  return NextResponse.json({ ok: true, sender, escalation, company, enrichment, contracts });
}

export const GET = handle;
export const POST = handle;
