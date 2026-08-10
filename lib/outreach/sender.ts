import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/ses";
import { applyTokens, pickSubject, injectTracking } from "@/lib/email/render";
import { generateEmail } from "@/lib/ai/generate";
import { startOfDay } from "date-fns";
import { EmailEventType } from "@prisma/client";

export type SendBatchResult = { attempted: number; sent: number; skipped: number; capReached: boolean };

/**
 * Send all due emails, respecting the daily cap (SOW: 500–1000/day) and
 * warm-up. Called by the worker on a schedule. Idempotent per enrollment step.
 */
export async function runSender(limit?: number): Promise<SendBatchResult> {
  const cap = env.sending.dailyCap;

  // How many already sent today (against the cap).
  const sentToday = await prisma.emailEvent.count({
    where: { type: EmailEventType.SENT, createdAt: { gte: startOfDay(new Date()) } },
  });
  let remaining = Math.max(0, cap - sentToday);
  if (limit != null) remaining = Math.min(remaining, limit);
  if (remaining === 0) return { attempted: 0, sent: 0, skipped: 0, capReached: true };

  const due = await prisma.enrollment.findMany({
    where: { state: "ACTIVE", nextSendAt: { lte: new Date() } },
    orderBy: { nextSendAt: "asc" },
    take: remaining,
    include: {
      lead: true,
      campaign: {
        include: { steps: { orderBy: { order: "asc" }, include: { template: true } } },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const enr of due) {
    const lead = enr.lead;

    // Guard: suppressed or campaign not active → pause/skip.
    if (lead.isSuppressed) {
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: { state: "PAUSED", pausedReason: "suppressed", nextSendAt: null },
      });
      skipped++;
      continue;
    }
    if (enr.campaign.status !== "ACTIVE") {
      skipped++;
      continue;
    }

    const step = enr.campaign.steps.find((s) => s.order === enr.currentStep);
    if (!step) {
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: { state: "COMPLETED", nextSendAt: null },
      });
      continue;
    }

    const tpl = step.template;
    const seed = `${lead.id}:${step.id}`;

    // AI-enabled templates generate a personalized email per lead (name + company +
    // sector); otherwise use the static HTML with token substitution.
    let renderedSubject: string;
    let variant: "A" | "B" = "A";
    let rawHtml: string;
    if (tpl.aiEnabled) {
      const stepLabel = step.order === 0 ? "initial outreach" : `follow-up ${step.order}`;
      const ai = await generateEmail({ lead, brief: tpl.aiBrief ?? tpl.html, stepLabel });
      renderedSubject = ai.subject;
      rawHtml = ai.html;
    } else {
      const picked = pickSubject(tpl.subjectA, tpl.subjectB, seed);
      variant = picked.variant;
      renderedSubject = applyTokens(picked.subject, lead);
      rawHtml = applyTokens(tpl.html, lead);
    }
    const body = injectTracking(rawHtml, {
      leadId: lead.id,
      enrollmentId: enr.id,
    });

    try {
      const { messageId } = await sendEmail({
        to: lead.email,
        subject: renderedSubject,
        html: body,
        leadId: lead.id,
        tags: { leadId: lead.id, enrollmentId: enr.id, step: String(step.order) },
      });

      await prisma.emailEvent.create({
        data: {
          leadId: lead.id,
          enrollmentId: enr.id,
          stepOrder: step.order,
          type: EmailEventType.SENT,
          messageId,
          subjectVariant: variant,
        },
      });
      await prisma.activity.create({
        data: { leadId: lead.id, type: "email_sent", message: `Step ${step.order + 1} sent: "${renderedSubject}"` },
      });

      // Advance stage on first contact.
      if (lead.stage === "NEW") {
        await prisma.lead.update({ where: { id: lead.id }, data: { stage: "CONTACTED" } });
      }

      // Schedule next step or complete.
      const nextStep = enr.campaign.steps.find((s) => s.order === enr.currentStep + 1);
      if (nextStep) {
        const nextSendAt = new Date();
        nextSendAt.setDate(nextSendAt.getDate() + nextStep.delayDays);
        await prisma.enrollment.update({
          where: { id: enr.id },
          data: { currentStep: enr.currentStep + 1, nextSendAt },
        });
      } else {
        await prisma.enrollment.update({
          where: { id: enr.id },
          data: { state: "COMPLETED", nextSendAt: null },
        });
      }
      sent++;
    } catch (e) {
      // Leave enrollment active for retry next run; log.
      await prisma.jobRun.create({
        data: { job: "sender", ok: false, finishedAt: new Date(), detail: `send failed for ${lead.email}: ${(e as Error).message}` },
      });
      skipped++;
    }
  }

  return { attempted: due.length, sent, skipped, capReached: false };
}
