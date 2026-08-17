import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, Role } from "@prisma/client";

export type SessionUser = { id: string; role: Role; email: string };

/** Current user + role, or throw if not logged in. */
export async function getSessionUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const u = session?.user as { id?: string; role?: Role; email?: string } | undefined;
  if (!u?.id) throw new Error("Unauthorized");
  return { id: u.id, role: (u.role ?? "AGENT") as Role, email: u.email ?? "" };
}

export function isOwnerOrAdmin(role: Role): boolean {
  return role === "ADMIN" || role === "OWNER";
}

/** Throw unless the user has one of the allowed roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!roles.includes(user.role)) throw new Error("Forbidden: insufficient role");
  return user;
}

/**
 * Lead visibility scope: ADMIN/OWNER see everything, AGENT sees only leads they
 * own. Merge this into any lead `where` clause (list, detail, pipeline, metrics).
 */
export function leadScopeWhere(user: SessionUser): Prisma.LeadWhereInput {
  return isOwnerOrAdmin(user.role) ? {} : { ownerId: user.id };
}

/** True if the user may view/act on this specific lead. */
export async function canAccessLead(user: SessionUser, leadId: string): Promise<boolean> {
  if (isOwnerOrAdmin(user.role)) return true;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
  return Boolean(lead && lead.ownerId === user.id);
}

/** Throw unless the current user may act on this lead. Returns the user id. */
export async function assertCanActOnLead(leadId: string): Promise<string> {
  const user = await getSessionUser();
  if (!(await canAccessLead(user, leadId))) throw new Error("Forbidden: lead not assigned to you");
  return user.id;
}
