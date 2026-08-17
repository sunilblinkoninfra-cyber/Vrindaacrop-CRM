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
