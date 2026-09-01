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

export async function triggerCampaignOutreach(campaignId: string, customLimit?: number) {
  await requireUser();
  const { runSender } = await import("@/lib/outreach/sender");
  const { ensureDefaultIndustryTemplates } = await import("@/lib/templates-seed");

  // Ensure default industry templates are populated
  await ensureDefaultIndustryTemplates();

  // Make active enrollments for this campaign due immediately
  const now = new Date();
  await prisma.enrollment.updateMany({
    where: {
      campaignId,
      state: "ACTIVE",
    },
    data: {
      nextSendAt: now,
    },
  });

  const sendLimit = customLimit && customLimit > 0 ? Math.min(customLimit, 1000) : 50;

  // Execute the sender pipeline bypassing send window for manual trigger
  const result = await runSender({
    limit: sendLimit,
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
  };
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
