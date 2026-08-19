"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCanActOnLead, getSessionUser, requireRole } from "@/lib/rbac";
import { LeadStage, ContractStatus } from "@prisma/client";

export async function updateStage(leadId: string, stage: LeadStage) {
  const userId = await assertCanActOnLead(leadId);
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { stage } });
  await prisma.activity.create({
    data: { leadId, userId, type: "stage_change", message: `Stage changed to ${stage}` },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return lead;
}

/** Assignment is an Owner/Admin action (agents can't reassign leads). */
export async function assignOwner(leadId: string, ownerId: string | null) {
  const user = await requireRole("ADMIN", "OWNER");
  await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });
  await prisma.activity.create({
    data: { leadId, userId: user.id, type: "note", message: ownerId ? "Owner assigned" : "Owner cleared" },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

/** Bulk-assign many leads to one owner (Owner/Admin, from the leads list). */
export async function bulkAssign(leadIds: string[], ownerId: string | null) {
  await requireRole("ADMIN", "OWNER");
  if (!leadIds.length) return;
  await prisma.lead.updateMany({ where: { id: { in: leadIds } }, data: { ownerId } });
  revalidatePath("/leads");
}

export async function addNote(leadId: string, body: string) {
  const userId = await assertCanActOnLead(leadId);
  if (!body.trim()) return;
  await prisma.note.create({ data: { leadId, userId, body: body.trim() } });
  await prisma.activity.create({ data: { leadId, userId, type: "note", message: "Note added" } });
  revalidatePath(`/leads/${leadId}`);
}

export async function addTask(leadId: string, title: string, dueAt?: string, assigneeId?: string) {
  await assertCanActOnLead(leadId);
  if (!title.trim()) return;
  await prisma.task.create({
    data: {
      leadId,
      title: title.trim(),
      dueAt: dueAt ? new Date(dueAt) : null,
      assigneeId: assigneeId || null,
    },
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function toggleTask(taskId: string, completed: boolean) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { leadId: true } });
  if (task?.leadId) await assertCanActOnLead(task.leadId);
  else await getSessionUser();
  const updated = await prisma.task.update({ where: { id: taskId }, data: { completed } });
  if (updated.leadId) revalidatePath(`/leads/${updated.leadId}`);
}

export async function setSuppressed(leadId: string, suppressed: boolean) {
  const userId = await assertCanActOnLead(leadId);
  await prisma.lead.update({ where: { id: leadId }, data: { isSuppressed: suppressed } });
  await prisma.activity.create({
    data: {
      leadId,
      userId,
      type: "note",
      message: suppressed ? "Lead suppressed" : "Suppression removed",
    },
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function acknowledgeHot(leadId: string) {
  const userId = await assertCanActOnLead(leadId);
  await prisma.lead.update({ where: { id: leadId }, data: { hot: false } });
  await prisma.notification.updateMany({
    where: { leadId, state: { not: "ACKNOWLEDGED" } },
    data: { state: "ACKNOWLEDGED", acknowledgedAt: new Date() },
  });
  await prisma.activity.create({
    data: { leadId, userId, type: "note", message: "Hot lead acknowledged by owner" },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

export async function addTag(leadId: string, tagName: string, kind = "general") {
  await assertCanActOnLead(leadId);
  const name = tagName.trim();
  if (!name) return;
  const tag = await prisma.tag.upsert({
    where: { name },
    update: {},
    create: { name, kind },
  });
  await prisma.leadTag.upsert({
    where: { leadId_tagId: { leadId, tagId: tag.id } },
    update: {},
    create: { leadId, tagId: tag.id },
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function removeTag(leadId: string, tagId: string) {
  await assertCanActOnLead(leadId);
  await prisma.leadTag.delete({ where: { leadId_tagId: { leadId, tagId } } });
  revalidatePath(`/leads/${leadId}`);
}

/** Confirm the AI-discovered contract data (agent trusts it → reminder can fire). */
export async function confirmContract(leadId: string) {
  const userId = await assertCanActOnLead(leadId);
  await prisma.lead.update({ where: { id: leadId }, data: { contractConfirmed: true } });
  await prisma.activity.create({
    data: { leadId, userId, type: "note", message: "Contract intelligence confirmed" },
  });
  revalidatePath(`/leads/${leadId}`);
}

/** Manually set/override contract fields (trusted immediately). */
export async function setContract(
  leadId: string,
  input: { status: ContractStatus; vendor?: string; expiry?: string }
) {
  const userId = await assertCanActOnLead(leadId);
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      contractStatus: input.status,
      incumbentVendor: input.vendor?.trim() || null,
      contractExpiry: input.expiry ? new Date(input.expiry) : null,
      contractSource: "manual",
      contractConfidence: "high",
      contractConfirmed: true,
      contractCheckedAt: new Date(),
      contractReminderSentAt: null, // re-arm the reminder for the new date
    },
  });
  await prisma.activity.create({
    data: { leadId, userId, type: "note", message: "Contract details updated manually" },
  });
  revalidatePath(`/leads/${leadId}`);
}

/** Bulk-tag many leads at once (Owner/Admin, from the leads list). */
export async function bulkTag(leadIds: string[], tagName: string, kind = "general") {
  await requireRole("ADMIN", "OWNER");
  const name = tagName.trim();
  if (!name || !leadIds.length) return;
  const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name, kind } });
  await prisma.leadTag.createMany({
    data: leadIds.map((leadId) => ({ leadId, tagId: tag.id })),
    skipDuplicates: true,
  });
  revalidatePath("/leads");
}

/**
 * Permanently delete a lead (Owner/Admin only). Cascades to notes, tasks,
 * activities, tags, enrollments, and email events via the existing FK
 * constraints — nothing else needs to be cleaned up manually.
 */
export async function deleteLead(leadId: string) {
  await requireRole("ADMIN", "OWNER");
  await prisma.lead.delete({ where: { id: leadId } });
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/** Bulk-delete many leads at once (Owner/Admin, from the leads list). */
export async function bulkDelete(leadIds: string[]) {
  await requireRole("ADMIN", "OWNER");
  if (!leadIds.length) return;
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/");
}
