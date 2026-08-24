import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { runSender } from "@/lib/outreach/sender";
import { runEscalation } from "@/lib/outreach/escalation";
import { runCompanyAlerts } from "@/lib/outreach/company-alerts";
import { runContractReminders } from "@/lib/outreach/contract-reminders";
import { runEnrichment } from "@/lib/ai/contract";
import { runEmailRevalidation } from "@/lib/outreach/revalidate-leads";

const SENDER_INTERVAL_MS = Math.max(1, env.sending.schedulerIntervalMinutes) * 60_000;
const MAINTENANCE_INTERVAL_MS = 15 * 60_000;

let senderRunning = false;
let maintenanceRunning = false;

async function tickSender() {
  if (senderRunning) return;
  senderRunning = true;
  const started = new Date();
  try {
    const r = await runSender();
    await prisma.jobRun.create({
      data: {
        job: "sender",
        startedAt: started,
        finishedAt: new Date(),
        ok: true,
        detail: `sent=${r.sent} skipped=${r.skipped} attempted=${r.attempted} warmupDay=${r.warmupDay} allowed=${r.allowedToday} sentToday=${r.sentToday} reserved=${r.reservedToday} paused=${r.paused}`,
      },
    });
    if (r.sent || r.skipped || r.paused) {
      console.log(`[sender] sent=${r.sent} skipped=${r.skipped} warmupDay=${r.warmupDay} allowed=${r.allowedToday} sentToday=${r.sentToday} paused=${r.paused}`);
    }
  } catch (e) {
    console.error("[sender] error", e);
    await prisma.jobRun.create({
      data: { job: "sender", startedAt: started, finishedAt: new Date(), ok: false, detail: String((e as Error).message ?? e).slice(0, 500) },
    }).catch(() => undefined);
  } finally {
    senderRunning = false;
  }
}

async function tickMaintenance() {
  if (maintenanceRunning) return;
  maintenanceRunning = true;
  const started = new Date();
  try {
    const [escalation, company, enrichment, contracts, revalidation] = await Promise.all([
      runEscalation(),
      runCompanyAlerts(),
      runEnrichment(10),
      runContractReminders(),
      runEmailRevalidation(),
    ]);
    await prisma.jobRun.create({
      data: {
        job: "scheduler",
        startedAt: started,
        finishedAt: new Date(),
        ok: true,
        detail: `escalated=${escalation.escalated} company=${company.replies}/${company.news} enriched=${enrichment.processed} contractReminders=${contracts.reminded} revalidated=${revalidation.processed}/${revalidation.changed}`,
      },
    });
    if (escalation.escalated || company.replies || company.news || contracts.reminded) {
      console.log(`[maintenance] escalated=${escalation.escalated} company=${company.replies}/${company.news} contractReminders=${contracts.reminded}`);
    }
  } catch (e) {
    console.error("[maintenance] error", e);
    await prisma.jobRun.create({
      data: { job: "scheduler", startedAt: started, finishedAt: new Date(), ok: false, detail: String((e as Error).message ?? e).slice(0, 500) },
    }).catch(() => undefined);
  } finally {
    maintenanceRunning = false;
  }
}

async function main() {
  console.log(`VrindaaCorp worker started. sender=${SENDER_INTERVAL_MS / 60_000}m maintenance=${MAINTENANCE_INTERVAL_MS / 60_000}m`);
  await tickSender();
  await tickMaintenance();
  setInterval(() => void tickSender(), SENDER_INTERVAL_MS);
  setInterval(() => void tickMaintenance(), MAINTENANCE_INTERVAL_MS);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
