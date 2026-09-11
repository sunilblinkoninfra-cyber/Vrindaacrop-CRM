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

export async function addStep(campaignId: string, templateId: string, delayDays: number) {
  await requireUser();
  const count = await prisma.sequenceStep.count({ where: { campaignId } });
  await prisma.sequenceStep.create({
    data: { campaignId, templateId, order: count, delayDays: Math.max(0, delayDays) },
  });
  revalidatePath(`/campaigns/${campaignId}`);
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
    throw new Error("Add at least one sequence step before activating.");
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

export async function triggerCampaignOutreach(
  campaignId: string,
  customLimit?: number,
  delaySeconds?: number
) {
  await requireUser();
  const { runSender } = await import("@/lib/outreach/sender");
  const { ensureDefaultIndustryTemplates } = await import("@/lib/templates-seed");

  // Ensure default industry templates are populated
  await ensureDefaultIndustryTemplates();

  const sendLimit = customLimit && customLimit > 0 ? Math.min(customLimit, 1000) : 50;
  const validDelay = delaySeconds && delaySeconds > 0 ? Math.min(delaySeconds, 3600) : 0;
  const now = new Date();

  // If delay is configured, stagger nextSendAt across active enrollments
  if (validDelay > 0) {
    const activeEnrollments = await prisma.enrollment.findMany({
      where: {
        campaignId,
        state: "ACTIVE",
      },
      orderBy: { id: "asc" },
      take: sendLimit,
      select: { id: true },
    });

    for (let i = 0; i < activeEnrollments.length; i++) {
      await prisma.enrollment.update({
        where: { id: activeEnrollments[i].id },
        data: {
          nextSendAt: new Date(now.getTime() + i * validDelay * 1000),
        },
      });
    }
  } else {
    // Make active enrollments for this campaign due immediately
    await prisma.enrollment.updateMany({
      where: {
        campaignId,
        state: "ACTIVE",
      },
      data: {
        nextSendAt: now,
      },
    });
  }

  const estimatedSeconds = sendLimit * validDelay;

  // If total duration <= 12 seconds, execute synchronously
  if (estimatedSeconds <= 12) {
    const result = await runSender({
      limit: sendLimit,
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
      sent: result.sent,
      attempted: result.attempted,
      skipped: result.skipped,
      paused: result.paused,
      capReached: result.capReached,
      limit: sendLimit,
      delaySeconds: validDelay,
    };
  } else {
    // Launch sender in background with delay, without blocking server action
    (async () => {
      try {
        await runSender({
          limit: sendLimit,
          delaySeconds: validDelay,
          ignoreSendWindow: true,
          campaignId,
        });
      } catch (err) {
        console.error("[triggerCampaignOutreach background error]:", err);
      }
    })();

    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/");
    revalidatePath("/leads");
    return {
      ok: true,
      sent: 1,
      attempted: sendLimit,
      skipped: 0,
      paused: false,
      capReached: false,
      limit: sendLimit,
      delaySeconds: validDelay,
      backgroundQueued: true,
      message: `Outreach initiated: dispatching ${sendLimit} emails staggered with ${validDelay}s delay.`,
    };
  }
}

export async function scheduleCampaignOutreach(campaignId: string, scheduledAtISO: string) {
  await requireUser();
  const targetDate = new Date(scheduledAtISO);
  if (isNaN(targetDate.getTime())) {
    throw new Error("Invalid schedule date provided.");
  }

  const updated = await prisma.enrollment.updateMany({
    where: {
      campaignId,
      state: "ACTIVE",
    },
    data: {
      nextSendAt: targetDate,
    },
  });

  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/");
  return {
    ok: true,
    count: updated.count,
    scheduledAt: targetDate.toISOString(),
  };
}
