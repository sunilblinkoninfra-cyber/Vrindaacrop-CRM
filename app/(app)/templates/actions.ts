"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

// Template management is restricted to Owner/Admin.
async function requireUser() {
  await requireRole("ADMIN", "OWNER");
}

export async function upsertTemplate(input: {
  id?: string;
  name: string;
  subjectA: string;
  subjectB?: string;
  html: string;
  aiEnabled?: boolean;
  aiBrief?: string;
}) {
  await requireUser();
  const data = {
    name: input.name.trim(),
    subjectA: input.subjectA.trim(),
    subjectB: input.subjectB?.trim() || null,
    html: input.html,
    aiEnabled: Boolean(input.aiEnabled),
    aiBrief: input.aiBrief?.trim() || null,
  };
  const tpl = input.id
    ? await prisma.emailTemplate.update({ where: { id: input.id }, data })
    : await prisma.emailTemplate.create({ data });
  revalidatePath("/templates");
  return tpl.id;
}

export async function deleteTemplate(id: string) {
  await requireUser();
  // Guard: don't delete if used by a sequence step.
  const used = await prisma.sequenceStep.count({ where: { templateId: id } });
  if (used > 0) throw new Error("Template is used by a campaign sequence and cannot be deleted.");
  await prisma.emailTemplate.delete({ where: { id } });
  revalidatePath("/templates");
}
