import crypto from "node:crypto";
import { EmailEventType, Prisma, SendAttemptStatus, SendingPlanStatus } from "@prisma/client";
import { env, isSmtpConfigured } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isFurther } from "@/lib/outreach/status";

const DAY_MS = 86_400_000;
const CLAIM_TTL_MS = 5 * 60_000;
const STALE_ATTEMPT_MS = 10 * 60_000;

export type WarmupEntry = { day: number; cap: number };

export type PlanHealth = {
  sent: number;
  bounced: number;
  complained: number;
  bounceRate: number;
  complaintRate: number;
  mode: "green" | "reduced" | "paused";
  reason?: string;
};

export type SendingClaim = {
  enrollmentId: string;
  sendingDayId: string;
  attemptId: string;
  claimToken: string;
  attemptNumber: number;
};

export const DEFAULT_WARMUP_SCHEDULE: WarmupEntry[] = [
  { day: 1, cap: 50 },
  { day: 2, cap: 75 },
  { day: 3, cap: 100 },
  { day: 4, cap: 150 },
  { day: 5, cap: 225 },
  { day: 6, cap: 325 },
  { day: 7, cap: 450 },
  { day: 8, cap: 600 },
  { day: 9, cap: 750 },
  { day: 10, cap: 900 },
  { day: 11, cap: 1000 },
  { day: 12, cap: 1000 },
  { day: 13, cap: 1000 },
  { day: 14, cap: 1000 },
];

function configuredHardCap(): number {
  return Math.max(1, Math.min(env.sending.dailyCap, 100_000));
}

function parseSchedule(value: Prisma.JsonValue | null | undefined): WarmupEntry[] {
  if (!Array.isArray(value)) return DEFAULT_WARMUP_SCHEDULE;
  const entries = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row = item as Record<string, unknown>;
      const day = Number(row.day);
      const cap = Number(row.cap);
      if (!Number.isInteger(day) || day < 1 || !Number.isFinite(cap) || cap < 1) return null;
      return { day, cap: Math.floor(cap) };
    })
    .filter((item): item is WarmupEntry => item !== null)
    .sort((a, b) => a.day - b.day);
  return entries.length ? entries : DEFAULT_WARMUP_SCHEDULE;
}

export function capForWarmupDay(schedule: WarmupEntry[], warmupDay: number): number {
  let cap = schedule[0]?.cap ?? configuredHardCap();
  for (const entry of schedule) {
    if (entry.day > warmupDay) break;
    cap = entry.cap;
  }
  return cap;
}

function dateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Date at UTC midnight representing the local calendar date for a timezone. */
export function localDate(date: Date, timezone: string): Date {
  const p = dateParts(date, timezone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

export function localDateKey(date: Date, timezone: string): string {
  return localDate(date, timezone).toISOString().slice(0, 10);
}

function parseClock(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Math.min(23, Math.max(0, hour)) * 60 + Math.min(59, Math.max(0, minute));
}

export function withinSendWindow(date: Date, plan: { timezone: string; sendWindowStart: string; sendWindowEnd: string }): boolean {
  const p = dateParts(date, plan.timezone);
  const nowMinutes = p.hour * 60 + p.minute;
  const start = parseClock(plan.sendWindowStart);
  const end = parseClock(plan.sendWindowEnd);
  if (start === end) return true;
  return start < end ? nowMinutes >= start && nowMinutes < end : nowMinutes >= start || nowMinutes < end;
}

export async function ensureDefaultSendingPlan() {
  const fromEmail = (
    isSmtpConfigured()
      ? env.smtp.fromEmail || env.smtp.user
      : env.aws.fromEmail
  ).trim().toLowerCase() || "sales@vrindaacorp.com";
  const fromDomain = fromEmail.split("@")[1] || "vrindaacorp.com";
  const now = new Date();
  const today = localDate(now, env.sending.timezone);

  const plan = await prisma.sendingPlan.upsert({
    where: { fromEmail },
    update: {},
    create: {
      name: "Default outbound plan",
      fromEmail,
      fromDomain,
      configurationSet: env.aws.configurationSet || null,
      timezone: env.sending.timezone,
      sendWindowStart: env.sending.sendWindowStart,
      sendWindowEnd: env.sending.sendWindowEnd,
      hardDailyCap: configuredHardCap(),
      status: SendingPlanStatus.ACTIVE,
      warmupDay: 1,
      warmupStartedAt: now,
      lastWarmupDate: today,
      schedule: DEFAULT_WARMUP_SCHEDULE as unknown as Prisma.InputJsonValue,
    },
  });

  // Preserve existing campaigns created before SendingPlan existed.
  await prisma.campaign.updateMany({ where: { sendingPlanId: null }, data: { sendingPlanId: plan.id } });
  return plan;
}

async function advanceWarmupIfHealthy(plan: Awaited<ReturnType<typeof ensureDefaultSendingPlan>>, today: Date) {
  if (plan.status !== SendingPlanStatus.ACTIVE) return plan;
  if (plan.lastWarmupDate && plan.lastWarmupDate.getTime() >= today.getTime()) return plan;

  const previous = new Date(today.getTime() - DAY_MS);
  const previousDay = await prisma.sendingDay.findUnique({
    where: { planId_localDate: { planId: plan.id, localDate: previous } },
  });

  const nextDay = previousDay && !previousDay.paused && previousDay.sent > 0 ? plan.warmupDay + 1 : plan.warmupDay;
  return prisma.sendingPlan.update({
    where: { id: plan.id },
    data: { warmupDay: nextDay, lastWarmupDate: today },
  });
}

export async function evaluatePlanHealth(plan: Awaited<ReturnType<typeof ensureDefaultSendingPlan>>, now = new Date()): Promise<PlanHealth> {
  const since = new Date(now.getTime() - DAY_MS);
  const where = {
    createdAt: { gte: since },
    enrollment: { campaign: { sendingPlanId: plan.id } },
  } as const;

  const [sent, bounced, complained] = await Promise.all([
    prisma.emailEvent.count({ where: { ...where, type: "SENT" } }),
    prisma.emailEvent.count({ where: { ...where, type: "BOUNCED" } }),
    prisma.emailEvent.count({ where: { ...where, type: "COMPLAINED" } }),
  ]);

  const bounceRate = sent ? bounced / sent : 0;
  const complaintRate = sent ? complained / sent : 0;
  if (sent < plan.minSampleSize) {
    return { sent, bounced, complained, bounceRate, complaintRate, mode: "green" };
  }

  if (bounceRate >= plan.bounceStopRate) {
    return {
      sent,
      bounced,
      complained,
      bounceRate,
      complaintRate,
      mode: "paused",
      reason: `hard-bounce rate ${(bounceRate * 100).toFixed(2)}% >= ${(plan.bounceStopRate * 100).toFixed(2)}%`,
    };
  }
  if (complaintRate >= plan.complaintStopRate) {
    return {
      sent,
      bounced,
      complained,
      bounceRate,
      complaintRate,
      mode: "paused",
      reason: `complaint rate ${(complaintRate * 100).toFixed(3)}% >= ${(plan.complaintStopRate * 100).toFixed(3)}%`,
    };
  }
  if (bounceRate >= plan.bounceReduceRate || complaintRate >= plan.complaintReduceRate) {
    return { sent, bounced, complained, bounceRate, complaintRate, mode: "reduced", reason: "reputation threshold requires reduced volume" };
  }
  return { sent, bounced, complained, bounceRate, complaintRate, mode: "green" };
}

export async function ensureSendingDay(planInput: Awaited<ReturnType<typeof ensureDefaultSendingPlan>>, now = new Date()) {
  const today = localDate(now, planInput.timezone);
  const plan = await advanceWarmupIfHealthy(planInput, today);
  const health = await evaluatePlanHealth(plan, now);
  const schedule = parseSchedule(plan.schedule);
  const baseCap = Math.min(configuredHardCap(), plan.hardDailyCap, capForWarmupDay(schedule, plan.warmupDay));
  const effectiveCap = health.mode === "reduced" ? Math.max(1, Math.floor(baseCap * plan.reduceFactor)) : baseCap;

  let day = await prisma.sendingDay.upsert({
    where: { planId_localDate: { planId: plan.id, localDate: today } },
    update: {},
    create: { planId: plan.id, localDate: today, warmupDay: plan.warmupDay, allowed: effectiveCap },
  });

  const shouldPause = plan.status === SendingPlanStatus.PAUSED || health.mode === "paused";
  if (health.mode === "paused" && plan.status !== SendingPlanStatus.PAUSED) {
    await prisma.sendingPlan.update({
      where: { id: plan.id },
      data: { status: SendingPlanStatus.PAUSED, pauseReason: health.reason, lastHealthCheckAt: now },
    });
  } else {
    await prisma.sendingPlan.update({ where: { id: plan.id }, data: { lastHealthCheckAt: now } });
  }

  const targetAllowed = Math.max(day.sent + day.reserved, effectiveCap);
  if (day.allowed !== targetAllowed || day.paused !== shouldPause || (shouldPause && day.pauseReason !== (health.reason ?? plan.pauseReason))) {
    day = await prisma.sendingDay.update({
      where: { id: day.id },
      data: {
        allowed: targetAllowed,
        paused: shouldPause,
        pauseReason: shouldPause ? health.reason ?? plan.pauseReason ?? "sending plan paused" : null,
      },
    });
  }
  return { plan, day, health, effectiveCap };
}

/** Release claims that were stranded by a crashed worker. Unknown sends stay paused for reconciliation. */
export async function reapStaleClaims(now = new Date()): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_ATTEMPT_MS);
  const attempts = await prisma.sendAttempt.findMany({
    where: { status: SendAttemptStatus.PENDING, createdAt: { lt: staleBefore } },
    take: 100,
  });
  let reaped = 0;
  for (const attempt of attempts) {
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.sendAttempt.updateMany({
        where: { id: attempt.id, status: SendAttemptStatus.PENDING },
        data: { status: SendAttemptStatus.UNKNOWN, error: "stale claim; provider result requires reconciliation", finalizedAt: now },
      });
      if (!updated.count) return false;

      await tx.enrollment.updateMany({
        where: { id: attempt.enrollmentId, sendClaimToken: attempt.claimToken },
        data: { state: "PAUSED", pausedReason: "send_unknown", nextSendAt: null, sendClaimToken: null, sendClaimedUntil: null, lastError: "Provider result unknown after worker crash" },
      });
      await tx.sendingDay.updateMany({ where: { id: attempt.sendingDayId, reserved: { gt: 0 } }, data: { reserved: { decrement: 1 } } });
      return true;
    });
    if (changed) reaped++;
  }
  return reaped;
}

/** Atomically claim one due enrollment and reserve one unit of the daily budget. */
export async function claimNextEnrollment(
  planId: string,
  sendingDayId: string,
  now = new Date(),
  campaignId?: string
): Promise<SendingClaim | null> {
  return prisma.$transaction(async (tx) => {
    // Ensure active campaigns are mapped to plan
    await tx.campaign.updateMany({
      where: { OR: [{ sendingPlanId: null }, { sendingPlanId: { not: planId } }] },
      data: { sendingPlanId: planId },
    });

    const campaignFilter = campaignId
      ? Prisma.sql`AND c."id" = ${campaignId}`
      : Prisma.sql``;

    const due = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT e."id"
      FROM "Enrollment" e
      JOIN "Campaign" c ON c."id" = e."campaignId"
      JOIN "Lead" l ON l."id" = e."leadId"
      WHERE (c."sendingPlanId" = ${planId} OR c."sendingPlanId" IS NULL)
        AND c."status" = 'ACTIVE'
        AND e."state" = 'ACTIVE'
        AND e."nextSendAt" <= ${now}
        AND (e."sendClaimedUntil" IS NULL OR e."sendClaimedUntil" < ${now})
        AND l."isSuppressed" = false
        AND l."validationStatus" NOT IN ('INVALID', 'DISPOSABLE')
        ${campaignFilter}
      ORDER BY
        CASE WHEN l."validationStatus" = 'VALID' THEN 0 ELSE 1 END,
        CASE WHEN l."source" IN ('website_form', 'meta_ads', 'google_ads') THEN 0 ELSE 1 END,
        e."nextSendAt" ASC,
        e."id" ASC
      FOR UPDATE OF e SKIP LOCKED
      LIMIT 1
    `);
    if (!due[0]) return null;

    const ledger = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "SendingDay"
      SET "reserved" = "reserved" + 1, "updatedAt" = NOW()
      WHERE "id" = ${sendingDayId}
        AND "paused" = false
        AND ("sent" + "reserved") < "allowed"
      RETURNING "id"
    `);
    if (!ledger[0]) return null;

    const enrollment = await tx.enrollment.findUnique({ where: { id: due[0].id }, select: { currentStep: true, retryCount: true } });
    if (!enrollment) return null;

    const claimToken = crypto.randomUUID();
    await tx.enrollment.update({
      where: { id: due[0].id },
      data: { sendClaimToken: claimToken, sendClaimedUntil: new Date(now.getTime() + CLAIM_TTL_MS), lastAttemptAt: now },
    });
    const attempt = await tx.sendAttempt.create({
      data: { enrollmentId: due[0].id, sendingDayId, stepOrder: enrollment.currentStep, attemptNumber: enrollment.retryCount + 1, claimToken },
    });
    return { enrollmentId: due[0].id, sendingDayId, attemptId: attempt.id, claimToken, attemptNumber: attempt.attemptNumber };
  });
}

export async function releaseClaim(args: { claim: SendingClaim; state?: "PAUSED" | "ACTIVE"; reason: string }) {
  await prisma.$transaction(async (tx) => {
    await tx.enrollment.updateMany({
      where: { id: args.claim.enrollmentId, sendClaimToken: args.claim.claimToken },
      data: { state: args.state ?? "PAUSED", pausedReason: args.reason, nextSendAt: args.state === "ACTIVE" ? new Date() : null, sendClaimToken: null, sendClaimedUntil: null },
    });
    await tx.sendAttempt.updateMany({ where: { id: args.claim.attemptId, status: SendAttemptStatus.PENDING }, data: { status: SendAttemptStatus.FAILED, error: args.reason, finalizedAt: new Date() } });
    await tx.sendingDay.updateMany({
      where: { id: args.claim.sendingDayId, reserved: { gt: 0 } },
      data: { reserved: { decrement: 1 }, failed: { increment: 1 } },
    });
  });
}

export async function finalizeClaimSuccess(args: {
  claim: SendingClaim;
  leadId: string;
  stepOrder: number;
  messageId: string;
  subjectVariant: "A" | "B";
  renderedSubject: string;
  nextStep?: { order: number; delayDays: number };
  updateStage: boolean;
}) {
  const nextSendAt = args.nextStep ? new Date(Date.now() + args.nextStep.delayDays * DAY_MS) : null;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.enrollment.findUnique({ where: { id: args.claim.enrollmentId }, select: { sendClaimToken: true, lastEventType: true } });
    if (claim?.sendClaimToken !== args.claim.claimToken) throw new Error("Send claim is no longer owned by this worker");
    const lastEventType = isFurther(claim.lastEventType, EmailEventType.SENT)
      ? EmailEventType.SENT
      : claim.lastEventType;

    await tx.emailEvent.create({ data: { leadId: args.leadId, enrollmentId: args.claim.enrollmentId, stepOrder: args.stepOrder, type: "SENT", messageId: args.messageId, subjectVariant: args.subjectVariant } });
    await tx.activity.create({ data: { leadId: args.leadId, type: "email_sent", message: `Step ${args.stepOrder + 1} sent: \"${args.renderedSubject}\"` } });
    if (args.updateStage) await tx.lead.update({ where: { id: args.leadId }, data: { stage: "CONTACTED" } });

    await tx.enrollment.update({
      where: { id: args.claim.enrollmentId },
      data: args.nextStep
        ? { currentStep: args.nextStep.order, nextSendAt, lastEventType: lastEventType ?? "SENT", lastEventAt: new Date(), retryCount: 0, lastError: null, sendClaimToken: null, sendClaimedUntil: null }
        : { state: "COMPLETED", nextSendAt: null, lastEventType: lastEventType ?? "SENT", lastEventAt: new Date(), retryCount: 0, lastError: null, sendClaimToken: null, sendClaimedUntil: null },
    });
    await tx.sendAttempt.update({ where: { id: args.claim.attemptId }, data: { status: SendAttemptStatus.SENT, providerId: args.messageId, finalizedAt: new Date() } });
    await tx.sendingDay.update({ where: { id: args.claim.sendingDayId }, data: { reserved: { decrement: 1 }, sent: { increment: 1 } } });
  });
}

export async function finalizeClaimUnknown(args: { claim: SendingClaim; error: string }) {
  const message = args.error.slice(0, 500);
  await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: args.claim.enrollmentId }, select: { sendClaimToken: true } });
    if (enrollment?.sendClaimToken !== args.claim.claimToken) return;
    await tx.enrollment.update({
      where: { id: args.claim.enrollmentId },
      data: { state: "PAUSED", pausedReason: "send_unknown", nextSendAt: null, lastError: message, sendClaimToken: null, sendClaimedUntil: null },
    });
    await tx.sendAttempt.update({ where: { id: args.claim.attemptId }, data: { status: SendAttemptStatus.UNKNOWN, error: message, finalizedAt: new Date() } });
    await tx.sendingDay.update({ where: { id: args.claim.sendingDayId }, data: { reserved: { decrement: 1 }, failed: { increment: 1 } } });
  });
}

export async function finalizeClaimFailure(args: { claim: SendingClaim; error: string }) {
  const message = args.error.slice(0, 500);
  await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({ where: { id: args.claim.enrollmentId }, select: { retryCount: true, sendClaimToken: true } });
    if (enrollment?.sendClaimToken !== args.claim.claimToken) return;
    const retryCount = (enrollment.retryCount ?? 0) + 1;
    const backoffMinutes = [5, 30, 180, 720, 1440][Math.min(retryCount - 1, 4)];
    await tx.enrollment.update({
      where: { id: args.claim.enrollmentId },
      data: retryCount >= 5
        ? { state: "PAUSED", pausedReason: "send_failed", nextSendAt: null, retryCount, lastError: message, sendClaimToken: null, sendClaimedUntil: null }
        : { state: "ACTIVE", nextSendAt: new Date(Date.now() + backoffMinutes * 60_000), retryCount, lastError: message, sendClaimToken: null, sendClaimedUntil: null },
    });
    await tx.sendAttempt.update({ where: { id: args.claim.attemptId }, data: { status: SendAttemptStatus.FAILED, error: message, finalizedAt: new Date() } });
    await tx.sendingDay.update({ where: { id: args.claim.sendingDayId }, data: { reserved: { decrement: 1 }, failed: { increment: 1 } } });
  });
}
