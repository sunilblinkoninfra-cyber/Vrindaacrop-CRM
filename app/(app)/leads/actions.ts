"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStage } from "@prisma/client";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id as string;
}

export async function updateStage(leadId: string, stage: LeadStage) {
  const userId = await requireUser();
  const lead = await prisma.lead.update({ where: { id: leadId }, data: { stage } });
  await prisma.activity.create({
    data: { leadId, userId, type: "stage_change", message: `Stage changed to ${stage}` },
  });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return lead;
}

export async function assignOwner(leadId: string, ownerId: string | null) {
  const userId = await requireUser();
  await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });
  await prisma.activity.create({
    data: { leadId, userId, type: "note", message: ownerId ? "Owner assigned" : "Owner cleared" },
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function addNote(leadId: string, body: string) {
  const userId = await requireUser();
  if (!body.trim()) return;
  await prisma.note.create({ data: { leadId, userId, body: body.trim() } });
  await prisma.activity.create({ data: { leadId, userId, type: "note", message: "Note added" } });
  revalidatePath(`/leads/${leadId}`);
}

export async function addTask(leadId: string, title: string, dueAt?: string, assigneeId?: string) {
  await requireUser();
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
  await requireUser();
  const task = await prisma.task.update({ where: { id: taskId }, data: { completed } });
  if (task.leadId) revalidatePath(`/leads/${task.leadId}`);
}

export async function setSuppressed(leadId: string, suppressed: boolean) {
  const userId = await requireUser();
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
  const userId = await requireUser();
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
  await requireUser();
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
  await requireUser();
  await prisma.leadTag.delete({ where: { leadId_tagId: { leadId, tagId } } });
  revalidatePath(`/leads/${leadId}`);
}

/** Bulk-tag many leads at once (used from the leads list). */
export async function bulkTag(leadIds: string[], tagName: string, kind = "general") {
  await requireUser();
  const name = tagName.trim();
  if (!name || !leadIds.length) return;
  const tag = await prisma.tag.upsert({ where: { name }, update: {}, create: { name, kind } });
  await prisma.leadTag.createMany({
    data: leadIds.map((leadId) => ({ leadId, tagId: tag.id })),
    skipDuplicates: true,
  });
  revalidatePath("/leads");
}
