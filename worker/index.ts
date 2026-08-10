/**
 * Background worker. Runs three jobs on an interval:
 *  - sender:     send due outreach emails (respecting the daily cap)
 *  - escalation: remind owners of unacknowledged hot leads after 48h
 *
 * Run with: npm run worker
 * In production, run this as a separate always-on process (PM2/systemd) or a
 * scheduled task. Follow-up scheduling is handled implicitly by the sender via
 * each enrollment's nextSendAt.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runSender } from "@/lib/outreach/sender";
import { runEscalation } from "@/lib/outreach/escalation";

const SENDER_INTERVAL_MS = 60_000; // every minute
const ESCALATION_INTERVAL_MS = 15 * 60_000; // every 15 minutes

async function tickSender() {
  const started = new Date();
  try {
    const r = await runSender();
    await prisma.jobRun.create({
      data: {
        job: "sender",
        startedAt: started,
        finishedAt: new Date(),
        ok: true,
        detail: `sent=${r.sent} skipped=${r.skipped} cap=${r.capReached}`,
      },
    });
    if (r.sent || r.skipped) console.log(`[sender] sent=${r.sent} skipped=${r.skipped}`);
  } catch (e) {
    console.error("[sender] error", e);
  }
}

async function tickEscalation() {
  try {
    const r = await runEscalation();
    if (r.escalated) console.log(`[escalation] escalated=${r.escalated}`);
  } catch (e) {
    console.error("[escalation] error", e);
  }
}

async function main() {
  console.log("VrindaaCorp worker started.");
  await tickSender();
  await tickEscalation();
  setInterval(tickSender, SENDER_INTERVAL_MS);
  setInterval(tickEscalation, ESCALATION_INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
