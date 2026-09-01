import { EmailEventType } from "@prisma/client";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/ses";
import { applyTokens, pickSubject, injectTracking } from "@/lib/email/render";
import { generateEmail } from "@/lib/ai/generate";
import { resolveTemplateForLead } from "@/lib/templates-seed";
import { prisma } from "@/lib/prisma";
import {
  claimNextEnrollment,
  ensureDefaultSendingPlan,
  ensureSendingDay,
  finalizeClaimFailure,
  finalizeClaimSuccess,
  finalizeClaimUnknown,
  releaseClaim,
  reapStaleClaims,
  withinSendWindow,
} from "@/lib/outreach/scheduler";

const JITTER_MIN_MS = 250;
const JITTER_MAX_MS = 1_000;

export type SendBatchResult = {
  attempted: number;
  sent: number;
  skipped: number;
  capReached: boolean;
  paused: boolean;
  warmupDay: number;
  allowedToday: number;
  sentToday: number;
  reservedToday: number;
  staleClaimsReaped: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitterMs() {
  return JITTER_MIN_MS + Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

export type RunSenderOptions = {
  limit?: number;
  ignoreSendWindow?: boolean;
  campaignId?: string;
};

/**
 * Claim and send a bounded batch of due emails. The daily budget is stored in
 * SendingDay, and every enrollment is claimed with a database transaction so
 * concurrent cron/worker invocations cannot send the same enrollment twice.
 */
export async function runSender(options?: number | RunSenderOptions): Promise<SendBatchResult> {
  const opts: RunSenderOptions =
    typeof options === "number" ? { limit: options } : options ?? {};

  const now = new Date();
  const plan = await ensureDefaultSendingPlan();
  const prepared = await ensureSendingDay(plan, now);
  const staleClaimsReaped = await reapStaleClaims(now);
  const { day, health } = prepared;
  const paused = day.paused || prepared.plan.status !== "ACTIVE" || health.mode === "paused";

  const empty = (capReached: boolean): SendBatchResult => ({
    attempted: 0,
    sent: 0,
    skipped: 0,
    capReached,
    paused,
    warmupDay: prepared.plan.warmupDay,
    allowedToday: day.allowed,
    sentToday: day.sent,
    reservedToday: day.reserved,
    staleClaimsReaped,
  });

  if (paused) return empty(false);
  if (!opts.ignoreSendWindow && !withinSendWindow(now, prepared.plan)) return empty(false);

  const maxPerRun = Math.max(1, Math.min(opts.limit ?? env.sending.schedulerMaxPerRun, 1000));
  let attempted = 0;
  let sent = 0;
  let skipped = 0;

  while (attempted < maxPerRun) {
    const claim = await claimNextEnrollment(
      prepared.plan.id,
      day.id,
      new Date(),
      opts.campaignId
    );
    if (!claim) break;
    attempted++;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: claim.enrollmentId },
      include: {
        lead: true,
        campaign: {
          include: { steps: { orderBy: { order: "asc" }, include: { template: true } } },
        },
      },
    });

    if (!enrollment) {
      await releaseClaim({ claim, state: "PAUSED", reason: "enrollment_missing" });
      skipped++;
      continue;
    }

    const lead = enrollment.lead;
    if (lead.isSuppressed) {
      await releaseClaim({ claim, state: "PAUSED", reason: "suppressed" });
      skipped++;
      continue;
    }
    if (lead.validationStatus === "INVALID" || lead.validationStatus === "DISPOSABLE") {
      await releaseClaim({ claim, state: "PAUSED", reason: "invalid_email" });
      skipped++;
      continue;
    }
    if (enrollment.campaign.status !== "ACTIVE") {
      await releaseClaim({ claim, state: "PAUSED", reason: "campaign_inactive" });
      skipped++;
      continue;
    }

    const step = enrollment.campaign.steps.find((s) => s.order === enrollment.currentStep);
    if (!step) {
      await releaseClaim({ claim, state: "PAUSED", reason: "no_sequence_step" });
      skipped++;
      continue;
    }

    let renderedSubject = "";
    let variant: "A" | "B" = "A";
    let body = "";
    let providerAccepted = false;

    try {
      const tpl = await resolveTemplateForLead(step.template, lead);
      const seed = `${lead.id}:${step.id}`;
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

      body = injectTracking(rawHtml, { leadId: lead.id, enrollmentId: enrollment.id });
      const result = await sendEmail({
        to: lead.email,
        subject: renderedSubject,
        html: body,
        leadId: lead.id,
        tags: { leadId: lead.id, enrollmentId: enrollment.id, step: String(step.order) },
      });
      providerAccepted = true;

      const nextStep = enrollment.campaign.steps.find((s) => s.order === enrollment.currentStep + 1);
      await finalizeClaimSuccess({
        claim,
        leadId: lead.id,
        stepOrder: step.order,
        messageId: result.messageId,
        subjectVariant: variant,
        renderedSubject,
        nextStep: nextStep ? { order: nextStep.order, delayDays: nextStep.delayDays } : undefined,
        updateStage: lead.stage === "NEW",
      });
      sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (providerAccepted) {
        // SES accepted the message but bookkeeping failed. Pause for manual
        // reconciliation rather than blindly sending the same step again.
        await finalizeClaimUnknown({ claim, error: `Provider accepted message; ${message}` });
      } else {
        await finalizeClaimFailure({ claim, error: message });
      }
      await prisma.jobRun.create({
        data: {
          job: "sender",
          ok: false,
          finishedAt: new Date(),
          detail: `${providerAccepted ? "unknown" : "send failed"} for ${lead.email}: ${message.slice(0, 450)}`,
        },
      });
      skipped++;
    }

    if (attempted < maxPerRun) await sleep(jitterMs());
  }

  const finalDay = await prisma.sendingDay.findUnique({ where: { id: day.id } });
  const current = finalDay ?? day;
  return {
    attempted,
    sent,
    skipped,
    capReached: current.sent + current.reserved >= current.allowed,
    paused,
    warmupDay: prepared.plan.warmupDay,
    allowedToday: current.allowed,
    sentToday: current.sent,
    reservedToday: current.reserved,
    staleClaimsReaped,
  };
}
