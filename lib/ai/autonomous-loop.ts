import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { executeCrmTool } from "@/lib/ai/tools/crm-tools";
import { evaluateBiWeeklyStrategy } from "@/lib/ai/strategy-engine";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp";

let isAutonomousLoopRunning = false;

/**
 * Periodically executed by worker/index.ts.
 * Executes background autonomous checks for Hermes Agent:
 *  - Enrolls newly verified VALID leads into outreach.
 *  - Monitors 14-day domain deliverability (auto-pauses if bounce rate > 2.0%).
 *  - Escalates unattended hot lead replies via WhatsApp.
 */
export async function runAutonomousHermesLoop(): Promise<{
  ok: boolean;
  enrolled: number;
  deliverabilityStatus: string;
  unattendedEscalated: number;
  message: string;
}> {
  if (isAutonomousLoopRunning) {
    return {
      ok: true,
      enrolled: 0,
      deliverabilityStatus: "Skipped (already running)",
      unattendedEscalated: 0,
      message: "Loop already in progress.",
    };
  }

  isAutonomousLoopRunning = true;
  const startedAt = new Date();

  try {
    let enrolled = 0;
    let unattendedEscalated = 0;

    const strategy = await evaluateBiWeeklyStrategy();
    const bounceRate = Number(strategy.rollingBounceRate || 0);
    const isDeliverabilityHealthy = bounceRate < 2.0;

    if (!isDeliverabilityHealthy) {
      console.warn(`[Hermes Loop Warning] 14-day bounce rate is ${bounceRate.toFixed(2)}% (above 2.0% threshold). Pausing automated lead enrollments.`);
    } else {
      // 2. Auto-Enroll VALID Leads into Active Outreach
      const activePlan = await prisma.sendingPlan.findFirst({ where: { status: "ACTIVE" } });
      if (activePlan) {
        const enrollResultStr = await executeCrmTool(
          "enroll_valid_leads",
          { limit: Math.min(25, env.sending.schedulerMaxPerRun) },
          "OWNER"
        );
        try {
          const parsed = JSON.parse(enrollResultStr);
          enrolled = parsed.enrolledCount || 0;
        } catch {
          enrolled = 0;
        }
      }
    }

    // 3. Check for Unattended Pending Reply Drafts (> 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const pendingDrafts = await prisma.proposedReplyDraft.findMany({
      where: {
        status: "PENDING_APPROVAL",
        createdAt: { lte: twoHoursAgo },
      },
      include: { lead: true },
      take: 5,
    });

    if (pendingDrafts.length > 0) {
      const owner = await prisma.user.findFirst({
        where: { role: { in: ["OWNER", "ADMIN"] }, whatsappNumber: { not: null } },
        select: { whatsappNumber: true },
      });

      if (owner?.whatsappNumber) {
        for (const draft of pendingDrafts) {
          unattendedEscalated++;
          const alertMsg = `⚠️ *UNATTENDED CLIENT REVERT ALERT (Hermes Agent)*
The client *${draft.lead.firstName || ""} ${draft.lead.lastName || ""}* (${draft.lead.company}) replied over 2 hours ago.

📋 *Pending Proposal Draft (v${draft.version}):*
• Subject: "${draft.draftSubject}"
• Client Inquiry: "${draft.inboundBody.slice(0, 150)}..."

🚀 *ACTION REQUIRED:*
Reply *YES* to approve and dispatch immediately, or reply with feedback to revise.`;
          await sendWhatsAppTextMessage(owner.whatsappNumber, alertMsg);
        }
      }
    }

    const detailMsg = `Hermes Agent Autonomous Loop: enrolled=${enrolled}, bounceRate=${bounceRate.toFixed(2)}%, escalated=${unattendedEscalated}`;
    console.log(`[Hermes Autonomous Loop] ${detailMsg}`);

    return {
      ok: true,
      enrolled,
      deliverabilityStatus: isDeliverabilityHealthy ? `Pristine (${bounceRate.toFixed(2)}%)` : `Warning (${bounceRate.toFixed(2)}%)`,
      unattendedEscalated,
      message: detailMsg,
    };
  } catch (err: any) {
    console.error("[Hermes Autonomous Loop Error]:", err);
    return {
      ok: false,
      enrolled: 0,
      deliverabilityStatus: "Error",
      unattendedEscalated: 0,
      message: err?.message || String(err),
    };
  } finally {
    isAutonomousLoopRunning = false;
  }
}
