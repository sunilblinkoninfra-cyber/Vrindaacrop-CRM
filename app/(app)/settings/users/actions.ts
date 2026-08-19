"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { normalizeEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";

const MIN_PASSWORD_LENGTH = 10;

export type ActionResult = { ok: true } | { ok: false; error: string };

const createUserSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  name: z.string().trim().max(150).optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  role: z.nativeEnum(Role),
});

/** ADMIN/OWNER-only: create a new team member with a chosen access role. */
export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
}): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!isOwnerOrAdmin(session.role)) return { ok: false, error: "Forbidden" };

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, name, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "A user with this email already exists." };

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, name: name || null, passwordHash, role },
  });

  revalidatePath("/settings/users");
  return { ok: true };
}

/** ADMIN/OWNER-only: change another user's access role. Cannot change your own. */
export async function updateUserRole(userId: string, role: Role): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!isOwnerOrAdmin(session.role)) return { ok: false, error: "Forbidden" };
  if (userId === session.id) return { ok: false, error: "You cannot change your own access role." };

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings/users");
  return { ok: true };
}
