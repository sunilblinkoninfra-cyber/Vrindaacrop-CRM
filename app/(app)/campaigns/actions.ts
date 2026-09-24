"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { segmentToWhere } from "@/lib/leads-query";
import { enrollCampaignLeads } from "@/lib/outreach/enroll";
import { requireRole } from "@/lib/rbac";
import { CampaignStatus } from "@prisma/client";

// Campaign management is restricted to Owner/Admin.
async function requireUser() {
  await requireRole("ADMIN", "OWNER");
}

export async function createCampaign(name: string) {
  await requireUser();
  const c = await prisma.campaign.create({ data: { name: name.trim() || "Untitled campaign" } });
  revalidatePath("/campaigns");
  return c.id;
}

export async function updateCampaign(
  campaignId: string,
  data: { name?: string; description?: string }
) {
  await requireUser();
  const updateData: Record<string, string | null> = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) throw new Error("Campaign name cannot be empty.");
    updateData.name = data.name.trim();
  }
  if (data.description !== undefined) {
    updateData.description = data.description.trim() || null;
  }
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: updateData,
  });
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return updated;
}

export async function deleteCampaign(campaignId: string) {
  await requireUser();
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath("/campaigns");
  revalidatePath("/");
}

export async function updateSegment(campaignId: string, segment: Record<string, string>) {
  await requireUser();
  await prisma.campaign.update({ where: { id: campaignId }, data: { segment } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function addStep(
  campaignId: string,
  templateId?: string | null,
  delayDays: number = 0
) {
  await requireUser();
  const count = await prisma.sequenceStep.count({ where: { campaignId } });

  let finalTemplateId = templateId?.trim();
  if (!finalTemplateId || finalTemplateId === "auto") {
    const { resolveOrCreateTemplateForCampaign } = await import("@/lib/templates-seed");
    const tpl = await resolveOrCreateTemplateForCampaign(campaignId, count);
    finalTemplateId = tpl.id;
  }

  await prisma.sequenceStep.create({
    data: { campaignId, templateId: finalTemplateId, order: count, delayDays: Math.max(0, delayDays) },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function autoAddSequenceStep(campaignId: string, delayDays: number = 0) {
  return addStep(campaignId, "auto", delayDays);
}

export async function removeStep(stepId: string, campaignId: string) {
  await requireUser();
  await prisma.sequenceStep.delete({ where: { id: stepId } });
  // Re-number remaining steps to keep order contiguous.
  const steps = await prisma.sequenceStep.findMany({
    where: { campaignId },
    orderBy: { order: "asc" },
  });
  await Promise.all(
    steps.map((s, i) => prisma.sequenceStep.update({ where: { id: s.id }, data: { order: i } }))
  );
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function updateStep(
  stepId: string,
  campaignId: string,
  templateId: string,
  delayDays: number
) {
  await requireUser();
  await prisma.sequenceStep.update({
    where: { id: stepId },
    data: {
      templateId,
      delayDays: Math.max(0, delayDays),
    },
  });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function setStatus(campaignId: string, status: CampaignStatus) {
  await requireUser();
  const steps = await prisma.sequenceStep.count({ where: { campaignId } });
  if (status === "ACTIVE" && steps === 0) {
    // Automatically generate Step 0 using industry match or Ollama AI so user is never blocked
    const { resolveOrCreateTemplateForCampaign } = await import("@/lib/templates-seed");
    const tpl = await resolveOrCreateTemplateForCampaign(campaignId, 0);
    await prisma.sequenceStep.create({
      data: { campaignId, templateId: tpl.id, order: 0, delayDays: 0 },
    });
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { status } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function enrollNow(campaignId: string) {
  await requireUser();
  const n = await enrollCampaignLeads(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  return n;
}

export async function segmentCount(segment: Record<string, string>) {
  await requireUser();
  return prisma.lead.count({ where: segmentToWhere(segment) });
}

export type ScheduleOutreachOptions = {
  campaignId: string;
  selectedDatesISO?: string[];
  startDateISO?: string;
  limit?: number;
  delaySeconds?: number;
  activateIfDraft?: boolean;
};

export async function scheduleCampaignOutreach(
  campaignIdOrOptions: string | ScheduleOutreachOptions,
  legacyScheduledAtISO?: string
) {
  await requireUser();

  const options: ScheduleOutreachOptions =
    typeof campaignIdOrOptions === "string"
      ? { campaignId: campaignIdOrOptions, startDateISO: legacyScheduledAtISO }
      : campaignIdOrOptions;

  const {
    campaignId,
    selectedDatesISO,
    startDateISO,
    limit,
    delaySeconds = 0,
    activateIfDraft = true,
  } = options;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true },
  });
  if (!campaign) throw new Error("Campaign not found.");

  if (activateIfDraft && campaign.status === "DRAFT") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "ACTIVE" },
    });
  }

  // Ensure the sending plan and today's sending day are UNPAUSED so outreach will actually send!
  const { ensureDefaultSendingPlan, ensureSendingDay } = await import("@/lib/outreach/scheduler");
  const plan = await ensureDefaultSendingPlan();
  if (plan.status === "PAUSED") {
    await prisma.sendingPlan.update({
      where: { id: plan.id },
      data: { status: "ACTIVE", pauseReason: null },
    });
  }
  const now = new Date();
  const prepared = await ensureSendingDay(plan, now);
  if (prepared.day.paused) {
    await prisma.sendingDay.update({
      where: { id: prepared.day.id },
      data: { paused: false, pauseReason: null },
    });
  }

  const { ensureDefaultIndustryTemplates } = await import("@/lib/templates-seed");
  await ensureDefaultIndustryTemplates();

  // Ensure campaign has at least one sequence step; if not, automatically create Step 0
  const stepCount = await prisma.sequenceStep.count({ where: { campaignId } });
  if (stepCount === 0) {
    const { resolveOrCreateTemplateForCampaign } = await import("@/lib/templates-seed");
    const tpl = await resolveOrCreateTemplateForCampaign(campaignId, 0);
    await prisma.sequenceStep.create({
      data: { campaignId, templateId: tpl.id, order: 0, delayDays: 0 },
    });
  }

  const sendLimit = limit && limit > 0 ? Math.min(limit, 1000) : 50;

  // Query target active enrollments — strictly VALID leads only
  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      campaignId,
      state: "ACTIVE",
      lead: {
        isSuppressed: false,
        validationStatus: "VALID",
      },
    },
    orderBy: { id: "asc" },
    take: sendLimit,
    select: { id: true },
  });

  if (activeEnrollments.length === 0) {
    return {
      ok: true,
      count: 0,
      scheduledAt: new Date().toISOString(),
      message: "No active VALID enrollments found for this campaign.",
    };
  }

  // Check if calendar selected dates were provided
  const validSelectedDates = (selectedDatesISO || [])
    .map((iso) => new Date(iso))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (validSelectedDates.length > 0) {
    const chunkCount = validSelectedDates.length;
    const leadsPerDay = Math.max(1, Math.ceil(activeEnrollments.length / chunkCount));

    for (let i = 0; i < activeEnrollments.length; i++) {
      const dateIdx = Math.min(Math.floor(i / leadsPerDay), chunkCount - 1);
      const targetDay = validSelectedDates[dateIdx];
      // Stagger intra-day by 20s so emails on the same day don't collide
      const intraDayOffsetMs = (i % leadsPerDay) * 20 * 1000;
      const nextSendAt = new Date(targetDay.getTime() + intraDayOffsetMs);

      await prisma.enrollment.update({
        where: { id: activeEnrollments[i].id },
        data: { nextSendAt },
      });
    }

    const firstDate = validSelectedDates[0];
    const lastDate = validSelectedDates[validSelectedDates.length - 1];

    // Save schedule metadata on campaign for display
    const campData = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { segment: true } });
    const existingSegment = (campData?.segment as Record<string, any>) || {};
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        segment: {
          ...existingSegment,
          _schedule: {
            type: "calendar",
            scheduledDates: validSelectedDates.map((d) => d.toISOString()),
            firstSendAt: firstDate.toISOString(),
            lastSendAt: lastDate.toISOString(),
            leadsPerDay,
            totalScheduled: activeEnrollments.length,
            scheduledAt: now.toISOString(),
          },
        },
      },
    });

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/");
    revalidatePath("/leads");

    // If the earliest scheduled date/time is already due now or in the past, dispatch first batch immediately
    const hasDueNow = validSelectedDates.some((d) => d.getTime() <= now.getTime());
    if (hasDueNow) {
      (async () => {
        try {
          const { runSender } = await import("@/lib/outreach/sender");
          await runSender({
            limit: leadsPerDay,
            delaySeconds: 15,
            campaignId,
          });
        } catch (err) {
          console.error("[scheduleCampaignOutreach immediate background send error]:", err);
        }
      })();
    }

    return {
      ok: true,
      count: activeEnrollments.length,
      scheduledAt: firstDate.toISOString(),
      lastSendAt: lastDate.toISOString(),
      datesCount: validSelectedDates.length,
      isImmediate: false,
      message: `Outreach scheduled across ${validSelectedDates.length} selected calendar date(s) for ${activeEnrollments.length} lead(s). Sending plan is ACTIVE.`,
    };
  }

  const parsedStart = startDateISO ? new Date(startDateISO) : new Date();
  const startDate = isNaN(parsedStart.getTime()) ? new Date() : parsedStart;
  const isImmediate = startDate.getTime() <= now.getTime();

  // Support delay up to 30 days (1 month = 2,592,000 seconds)
  const MAX_DELAY_SECONDS = 30 * 24 * 3600;
  const validDelay = Math.max(0, Math.min(delaySeconds, MAX_DELAY_SECONDS));

  // Stagger nextSendAt for each enrollment: startDate + (i * validDelay)
  const baseTime = startDate.getTime();
  for (let i = 0; i < activeEnrollments.length; i++) {
    const nextSendAt = new Date(baseTime + i * validDelay * 1000);
    await prisma.enrollment.update({
      where: { id: activeEnrollments[i].id },
      data: { nextSendAt },
    });
  }

  const firstSendDate = new Date(baseTime);
  const lastSendDate = new Date(baseTime + (activeEnrollments.length - 1) * validDelay * 1000);

  // Save schedule metadata on campaign for display
  const campData = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { segment: true } });
  const existingSegment = (campData?.segment as Record<string, any>) || {};
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      segment: {
        ...existingSegment,
        _schedule: {
          type: isImmediate ? "immediate" : "datetime",
          scheduledDates: [startDate.toISOString()],
          firstSendAt: firstSendDate.toISOString(),
          lastSendAt: lastSendDate.toISOString(),
          leadsPerDay: activeEnrollments.length,
          totalScheduled: activeEnrollments.length,
          scheduledAt: now.toISOString(),
        },
      },
    },
  });
  const totalSpanSeconds = (activeEnrollments.length - 1) * validDelay;

  // If immediate dispatch requested (startDate <= now):
  if (isImmediate) {
    const { runSender } = await import("@/lib/outreach/sender");
    const estimatedSeconds = activeEnrollments.length * validDelay;

    if (estimatedSeconds <= 12) {
      // Execute immediately synchronously
      const result = await runSender({
        limit: activeEnrollments.length,
        delaySeconds: validDelay,
        ignoreSendWindow: true,
        campaignId,
      });

      revalidatePath("/campaigns");
      revalidatePath(`/campaigns/${campaignId}`);
      revalidatePath("/");
      revalidatePath("/leads");

      return {
        ok: true,
        count: activeEnrollments.length,
        sent: result.sent,
        attempted: result.attempted,
        skipped: result.skipped,
        paused: result.paused,
        capReached: result.capReached,
        limit: activeEnrollments.length,
        delaySeconds: validDelay,
        scheduledAt: firstSendDate.toISOString(),
        lastSendAt: lastSendDate.toISOString(),
        totalSpanSeconds,
        isImmediate: true,
      };
    } else if (validDelay <= 120) {
      // Short delay: launch sender in background
      (async () => {
        try {
          await runSender({
            limit: activeEnrollments.length,
            delaySeconds: validDelay,
            ignoreSendWindow: true,
            campaignId,
          });
        } catch (err) {
          console.error("[scheduleCampaignOutreach background error]:", err);
        }
      })();

      revalidatePath("/campaigns");
      revalidatePath(`/campaigns/${campaignId}`);
      revalidatePath("/");
      revalidatePath("/leads");

      return {
        ok: true,
        count: activeEnrollments.length,
        sent: 1,
        attempted: activeEnrollments.length,
        backgroundQueued: true,
        delaySeconds: validDelay,
        scheduledAt: firstSendDate.toISOString(),
        lastSendAt: lastSendDate.toISOString(),
        totalSpanSeconds,
        isImmediate: true,
        message: `Outreach initiated: dispatching ${activeEnrollments.length} emails staggered with ${validDelay}s delay.`,
      };
    } else {
      // Long delay (e.g. 1 hour, 1 day, etc.): dispatch the FIRST due lead immediately
      try {
        await runSender({
          limit: 1,
          delaySeconds: 0,
          ignoreSendWindow: true,
          campaignId,
        });
      } catch (err) {
        console.error("[scheduleCampaignOutreach initial send error]:", err);
      }

      revalidatePath("/campaigns");
      revalidatePath(`/campaigns/${campaignId}`);
      revalidatePath("/");
      revalidatePath("/leads");

      return {
        ok: true,
        count: activeEnrollments.length,
        sent: 1,
        attempted: activeEnrollments.length,
        delaySeconds: validDelay,
        scheduledAt: firstSendDate.toISOString(),
        lastSendAt: lastSendDate.toISOString(),
        totalSpanSeconds,
        isImmediate: true,
        message: `First email dispatched now! Remaining ${activeEnrollments.length - 1} email(s) are scheduled at ${validDelay}s intervals.`,
      };
    }
  }

  // Future scheduled dispatch (startDate > now):
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
  revalidatePath("/leads");

  return {
    ok: true,
    count: activeEnrollments.length,
    scheduledAt: firstSendDate.toISOString(),
    lastSendAt: lastSendDate.toISOString(),
    totalSpanSeconds,
    delaySeconds: validDelay,
    isImmediate: false,
    message: `Outreach scheduled starting ${firstSendDate.toLocaleString()} across ${activeEnrollments.length} leads.`,
  };
}

export async function triggerCampaignOutreach(
  campaignId: string,
  customLimit?: number,
  delaySeconds?: number
) {
  return scheduleCampaignOutreach({
    campaignId,
    startDateISO: new Date().toISOString(),
    limit: customLimit,
    delaySeconds,
    activateIfDraft: true,
  });
}

export type CampaignPreviewData = {
  campaignId: string;
  campaignName: string;
  lead: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    sector: string | null;
    city: string | null;
    email: string;
  };
  steps: Array<{
    stepId: string;
    order: number;
    delayDays: number;
    templateId: string;
    templateName: string;
    subjectA: string;
    subjectB: string | null;
    renderedSubjectA: string;
    renderedSubjectB: string | null;
    renderedHtml: string;
    aiEnabled: boolean;
  }>;
};

export async function getCampaignPreviewData(campaignId: string): Promise<CampaignPreviewData> {
  await requireUser();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: { template: true },
      },
    },
  });
  if (!campaign) throw new Error("Campaign not found.");

  let steps = campaign.steps;
  if (steps.length === 0) {
    const { resolveOrCreateTemplateForCampaign } = await import("@/lib/templates-seed");
    const tpl = await resolveOrCreateTemplateForCampaign(campaignId, 0);
    const createdStep = await prisma.sequenceStep.create({
      data: { campaignId, templateId: tpl.id, order: 0, delayDays: 0 },
      include: { template: true },
    });
    steps = [createdStep];
  }

  // Find first active enrolled lead for realistic token replacement
  const firstEnrollment = await prisma.enrollment.findFirst({
    where: { campaignId },
    include: { lead: true },
  });

  const segment = (campaign.segment as Record<string, string> | null) ?? {};

  const lead = firstEnrollment?.lead ?? {
    id: "sample-preview",
    firstName: "Rahul",
    lastName: "Sharma",
    company: "Apex Towers",
    sector: segment.sector || "Corporate",
    city: segment.geography || "Gurgaon",
    geography: "NCR",
    email: "rahul.sharma@apextowers.com",
  };

  const { applyTokens } = await import("@/lib/email/render");

  const renderedSteps = steps.map((s) => ({
    stepId: s.id,
    order: s.order,
    delayDays: s.delayDays,
    templateId: s.template.id,
    templateName: s.template.name,
    subjectA: s.template.subjectA,
    subjectB: s.template.subjectB,
    renderedSubjectA: applyTokens(s.template.subjectA, lead),
    renderedSubjectB: s.template.subjectB ? applyTokens(s.template.subjectB, lead) : null,
    renderedHtml: applyTokens(s.template.html, lead),
    aiEnabled: s.template.aiEnabled,
  }));

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    lead: {
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      sector: lead.sector,
      city: lead.city,
      email: lead.email,
    },
    steps: renderedSteps,
  };
}

/**
 * Calls Ollama AI to refine/rewrite an auto-generated or custom campaign email template
 * based on user instructions and suggestions, respecting the Owner's Strategic Playbook.
 */
export async function refineCampaignTemplateWithAI(args: {
  campaignId: string;
  templateId: string;
  currentSubjectA: string;
  currentSubjectB?: string | null;
  currentHtml: string;
  instruction: string;
}) {
  await requireUser();

  const campaign = await prisma.campaign.findUnique({
    where: { id: args.campaignId },
    select: { name: true, segment: true },
  });
  const segment = (campaign?.segment as Record<string, string> | null) ?? {};

  const { refineTemplateWithOllama } = await import("@/lib/ai/generate-template");
  const result = await refineTemplateWithOllama({
    currentSubjectA: args.currentSubjectA,
    currentSubjectB: args.currentSubjectB,
    currentHtml: args.currentHtml,
    instruction: args.instruction,
    campaignContext: {
      name: campaign?.name,
      sector: segment.sector,
      geography: segment.geography,
    },
  });

  return result;
}

/**
 * Saves manual or AI-assisted changes to a campaign's email template.
 */
export async function saveCampaignTemplateChanges(args: {
  campaignId: string;
  templateId: string;
  subjectA: string;
  subjectB?: string | null;
  html: string;
  name?: string;
}) {
  await requireUser();

  const updated = await prisma.emailTemplate.update({
    where: { id: args.templateId },
    data: {
      subjectA: args.subjectA.trim(),
      subjectB: args.subjectB?.trim() || null,
      html: args.html,
      ...(args.name ? { name: args.name.trim() } : {}),
      aiBrief: `Revised via Ollama AI for campaign ${args.campaignId}`,
    },
  });

  revalidatePath(`/campaigns/${args.campaignId}`);
  revalidatePath("/templates");

  return {
    id: updated.id,
    name: updated.name,
    subjectA: updated.subjectA,
    subjectB: updated.subjectB,
    html: updated.html,
  };
}

export type OutreachSendingStatus = {
  planId: string;
  fromEmail: string;
  planStatus: "ACTIVE" | "PAUSED";
  planPauseReason: string | null;
  dayPaused: boolean;
  dayPauseReason: string | null;
  sentToday: number;
  reservedToday: number;
  allowedToday: number;
  hardDailyCap: number;
  warmupDay: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  timezone: string;
  isPaused: boolean;
  pauseReason: string | null;
};

export async function getOutreachSendingStatus(): Promise<OutreachSendingStatus> {
  await requireUser();
  const { ensureDefaultSendingPlan, ensureSendingDay } = await import("@/lib/outreach/scheduler");
  const plan = await ensureDefaultSendingPlan();
  const now = new Date();
  const prepared = await ensureSendingDay(plan, now);
  const isPaused = prepared.day.paused || plan.status === "PAUSED" || prepared.health.mode === "paused";
  const pauseReason =
    prepared.day.pauseReason ||
    plan.pauseReason ||
    (prepared.health.mode === "paused" ? prepared.health.reason : null);

  return {
    planId: plan.id,
    fromEmail: plan.fromEmail,
    planStatus: plan.status as "ACTIVE" | "PAUSED",
    planPauseReason: plan.pauseReason,
    dayPaused: prepared.day.paused,
    dayPauseReason: prepared.day.pauseReason,
    sentToday: prepared.day.sent,
    reservedToday: prepared.day.reserved,
    allowedToday: prepared.day.allowed,
    hardDailyCap: plan.hardDailyCap,
    warmupDay: plan.warmupDay,
    sendWindowStart: plan.sendWindowStart,
    sendWindowEnd: plan.sendWindowEnd,
    timezone: plan.timezone,
    isPaused,
    pauseReason: pauseReason || null,
  };
}

export async function resumeOutreachSending() {
  await requireUser();
  const { ensureDefaultSendingPlan, ensureSendingDay } = await import("@/lib/outreach/scheduler");
  const plan = await ensureDefaultSendingPlan();
  await prisma.sendingPlan.updateMany({
    where: { id: plan.id },
    data: { status: "ACTIVE", pauseReason: null },
  });
  const now = new Date();
  const prepared = await ensureSendingDay(plan, now);
  await prisma.sendingDay.updateMany({
    where: { id: prepared.day.id },
    data: { paused: false, pauseReason: null },
  });
  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: true, status: "ACTIVE", message: "Outreach sending resumed successfully." };
}

export async function pauseOutreachSending(reason = "Manual pause via CRM UI") {
  await requireUser();
  const { ensureDefaultSendingPlan, ensureSendingDay } = await import("@/lib/outreach/scheduler");
  const plan = await ensureDefaultSendingPlan();
  await prisma.sendingPlan.updateMany({
    where: { id: plan.id },
    data: { status: "PAUSED", pauseReason: reason },
  });
  const now = new Date();
  const prepared = await ensureSendingDay(plan, now);
  await prisma.sendingDay.updateMany({
    where: { id: prepared.day.id },
    data: { paused: true, pauseReason: reason },
  });
  revalidatePath("/campaigns");
  revalidatePath("/");
  return { ok: true, status: "PAUSED", message: "Outreach sending paused." };
}
