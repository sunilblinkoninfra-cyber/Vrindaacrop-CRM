"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
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
