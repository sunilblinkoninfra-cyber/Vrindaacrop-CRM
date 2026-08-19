import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/ses";
import { applyTokens, pickSubject, injectTracking } from "@/lib/email/render";
import { generateEmail } from "@/lib/ai/generate";
import { isFurther } from "@/lib/outreach/status";
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
    // A lead can be reclassified INVALID/DISPOSABLE after enrollment (SES
    // bounce feedback, or the SMTP revalidation cron) — stop sending to it.
    if (lead.validationStatus === "INVALID" || lead.validationStatus === "DISPOSABLE") {
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: { state: "PAUSED", pausedReason: "invalid_email", nextSendAt: null },
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
      // Actual SES call happens BEFORE the transaction (it's a network side
      // effect; we don't want to hold a DB tx open across it).
      const { messageId } = await sendEmail({
        to: lead.email,
        subject: renderedSubject,
        html: body,
        leadId: lead.id,
        tags: { leadId: lead.id, enrollmentId: enr.id, step: String(step.order) },
      });

      // Wrap all bookkeeping in a single transaction so partial failures (e.g.
      // DB blip after send succeeds) can't leave the enrollment in a state
      // where we re-send the same email on the next cron run.
      const lastEventType = isFurther(enr.lastEventType, EmailEventType.SENT)
        ? EmailEventType.SENT
        : enr.lastEventType;
      const nextStep = enr.campaign.steps.find((s) => s.order === enr.currentStep + 1);
      const nextSendAt = nextStep ? new Date(Date.now() + nextStep.delayDays * 86_400_000) : null;

      await prisma.$transaction([
        prisma.emailEvent.create({
          data: {
            leadId: lead.id,
            enrollmentId: enr.id,
            stepOrder: step.order,
            type: EmailEventType.SENT,
            messageId,
            subjectVariant: variant,
          },
        }),
        prisma.activity.create({
          data: { leadId: lead.id, type: "email_sent", message: `Step ${step.order + 1} sent: "${renderedSubject}"` },
        }),
        ...(lead.stage === "NEW"
          ? [prisma.lead.update({ where: { id: lead.id }, data: { stage: "CONTACTED" } })]
          : []),
        prisma.enrollment.update({
          where: { id: enr.id },
          data: nextStep
            ? { currentStep: enr.currentStep + 1, nextSendAt, lastEventType, lastEventAt: new Date(), retryCount: 0, lastError: null }
            : { state: "COMPLETED", nextSendAt: null, lastEventType, lastEventAt: new Date(), retryCount: 0, lastError: null },
        }),
      ]);
      sent++;
    } catch (e) {
      // Exponential backoff on repeated per-lead failures. Pause after 5 tries
      // so a permanently-failing recipient doesn't get retried forever.
      const msg = (e as Error).message.slice(0, 500);
      const nextRetry = (enr.retryCount ?? 0) + 1;
      const backoffMs = [5, 30, 180, 720, 1440][Math.min(nextRetry - 1, 4)] * 60_000;
      await prisma.enrollment.update({
        where: { id: enr.id },
        data: nextRetry >= 5
          ? { state: "PAUSED", pausedReason: "send_failed", nextSendAt: null, retryCount: nextRetry, lastError: msg }
          : { nextSendAt: new Date(Date.now() + backoffMs), retryCount: nextRetry, lastError: msg },
      });
      await prisma.jobRun.create({
        data: { job: "sender", ok: false, finishedAt: new Date(), detail: `send failed for ${lead.email} (attempt ${nextRetry}): ${msg}` },
      });
      skipped++;
    }
  }

  return { attempted: due.length, sent, skipped, capReached: false };
}
