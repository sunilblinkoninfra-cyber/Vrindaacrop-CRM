"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";

const MIN_PASSWORD_LENGTH = 10;

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Self-service password change. Requires the caller to already be
 * authenticated AND know their current password — this only ever changes the
 * signed-in user's own credential, never anyone else's. No admin override,
 * no lookup-by-email: by construction this cannot become an account-takeover
 * primitive the way an admin "reset any user's password" endpoint would.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const session = await getSessionUser();

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Both fields are required." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: "New password must be different from the current one." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) return { ok: false, error: "Account not found." };

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect." };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { ok: true };
}
