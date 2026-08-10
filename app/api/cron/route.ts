import { NextRequest, NextResponse } from "next/server";
import { runSender } from "@/lib/outreach/sender";
import { runEscalation } from "@/lib/outreach/escalation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long batch sends (Vercel Pro)

/**
 * Scheduled outreach runner — the serverless replacement for `npm run worker`.
 * Vercel Cron (see vercel.json) calls this on a schedule; it sends due emails
 * (respecting the daily cap) and fires 48h escalations.
 *
 * Protected by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when that env var is set. External cron services can call
 * `/api/cron?token=<CRON_SECRET>` instead.
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

  await prisma.jobRun.create({
    data: {
      job: "cron",
      startedAt: started,
      finishedAt: new Date(),
      ok: true,
      detail: `sent=${sender.sent} skipped=${sender.skipped} escalated=${escalation.escalated}`,
    },
  });

  return NextResponse.json({ ok: true, sender, escalation });
}

export const GET = handle;
export const POST = handle;
