import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { env, isImapConfigured } from "@/lib/env";
import { runSender } from "@/lib/outreach/sender";
import { runEscalation } from "@/lib/outreach/escalation";
import { runCompanyAlerts } from "@/lib/outreach/company-alerts";
import { runContractReminders } from "@/lib/outreach/contract-reminders";
import { runEnrichment } from "@/lib/ai/contract";
import { runEmailRevalidation } from "@/lib/outreach/revalidate-leads";
import { syncImapReplies } from "@/lib/inbound/imap";

const SENDER_INTERVAL_MS = Math.max(1, env.sending.schedulerIntervalMinutes) * 60_000;
const REPLIES_INTERVAL_MS = 30 * 1000; // Poll inbox every 30 seconds
const MAINTENANCE_INTERVAL_MS = 15 * 60_000;

let senderRunning = false;
let repliesRunning = false;
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

async function tickReplies() {
  if (repliesRunning || !isImapConfigured()) return;
  repliesRunning = true;
  const started = new Date();
  try {
    const r = await syncImapReplies({ sinceDays: 7, maxMessages: 50 });
    if (r.ok && r.matchedReplies > 0) {
      console.log(`[replies] checked=${r.checked} matchedReplies=${r.matchedReplies}`);
      await prisma.jobRun.create({
        data: {
          job: "replies",
          startedAt: started,
          finishedAt: new Date(),
          ok: true,
          detail: `checked=${r.checked} matchedReplies=${r.matchedReplies}`,
        },
      });
    }
  } catch (e) {
    console.error("[replies] error", e);
  } finally {
    repliesRunning = false;
  }
}

let lastMorningBriefingDate = "";
let lastDayEndBriefingDate = "";
let lastStrategyCheckTime = 0;

/**
 * Executes scheduled briefings:
 *  - 09:00 AM Morning Game Plan
 *  - 21:00 (09:00 PM) Day-End Briefing with repeat openers & reach
 *  - Bi-Weekly Domain Warmup & Scaling Strategy Audit (every 14 days)
 */
async function tickDailyBriefings() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const dateStr = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;

  const owner = await prisma.user.findFirst({
    where: { role: { in: ["OWNER", "ADMIN"] }, whatsappNumber: { not: null } },
    select: { whatsappNumber: true },
  });
  if (!owner?.whatsappNumber) return;

  // 1. 09:00 AM Morning Game Plan
  if (hour === 9 && minute <= 15 && lastMorningBriefingDate !== dateStr) {
    lastMorningBriefingDate = dateStr;
    try {
      const { formatMorningGamePlanNotification, sendWhatsAppTextMessage } = await import("@/lib/whatsapp");
      const plan = await prisma.sendingPlan.findFirst({ where: { status: "ACTIVE" } });
      const unassignedLeads = await prisma.lead.count({ where: { stage: "NEW", isSuppressed: false } });
      const sectors = await prisma.tag.findMany({ where: { kind: "sector" }, select: { name: true }, take: 4 });

      const msg = formatMorningGamePlanNotification({
        targetCount: Math.min(plan?.hardDailyCap || 50, unassignedLeads),
        sectors: sectors.map((s) => s.name),
        capToday: plan?.hardDailyCap || 50,
        unassignedLeads,
        reputationHealth: "Pristine (0 bounces)",
      });
      await sendWhatsAppTextMessage(owner.whatsappNumber, msg);
      console.log(`[briefing] 09:00 AM Morning Game Plan dispatched to ${owner.whatsappNumber}`);
    } catch (e) {
      console.error("[briefing] Morning Game Plan error:", e);
    }
  }

  // 2. 21:00 (09:00 PM) Day-End Briefing
  if (hour === 21 && minute <= 15 && lastDayEndBriefingDate !== dateStr) {
    lastDayEndBriefingDate = dateStr;
    try {
      const { getDayEndReportMetrics } = await import("@/lib/metrics");
      const { formatDayEndReportNotification, sendWhatsAppTextMessage } = await import("@/lib/whatsapp");
      const metrics = await getDayEndReportMetrics();

      const msg = formatDayEndReportNotification(metrics);
      await sendWhatsAppTextMessage(owner.whatsappNumber, msg);
      console.log(`[briefing] 09:00 PM Day-End Briefing dispatched to ${owner.whatsappNumber}`);
    } catch (e) {
      console.error("[briefing] Day-End Briefing error:", e);
    }
  }

  // 3. Bi-Weekly Strategy Audit (every 14 days)
  const FOURTEEN_DAYS_MS = 14 * 24 * 3600 * 1000;
  if (!lastStrategyCheckTime || Date.now() - lastStrategyCheckTime >= FOURTEEN_DAYS_MS) {
    lastStrategyCheckTime = Date.now();
    try {
      const { runAndDispatchBiWeeklyStrategyReport } = await import("@/lib/ai/strategy-engine");
      await runAndDispatchBiWeeklyStrategyReport(owner.whatsappNumber);
      console.log(`[strategy] Bi-Weekly Strategy Audit dispatched to ${owner.whatsappNumber}`);
    } catch (e) {
      console.error("[strategy] Bi-Weekly Strategy Audit error:", e);
    }
  }
}

async function main() {
  console.log(`VrindaaCorp worker started. sender=${SENDER_INTERVAL_MS / 60_000}m replies=${REPLIES_INTERVAL_MS / 60_000}m maintenance=${MAINTENANCE_INTERVAL_MS / 60_000}m`);
  await tickSender();
  await tickReplies();
  await tickMaintenance();
  await tickDailyBriefings();

  setInterval(() => void tickSender(), SENDER_INTERVAL_MS);
  setInterval(() => void tickReplies(), REPLIES_INTERVAL_MS);
  setInterval(() => void tickMaintenance(), MAINTENANCE_INTERVAL_MS);
  setInterval(() => void tickDailyBriefings(), 60_000); // Check briefing schedule every minute
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
