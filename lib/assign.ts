import { prisma } from "@/lib/prisma";

/**
 * Pick an assignee (owner) for a newly captured lead. v1 is round-robin across
 * active AGENT users by current open-lead load (fewest leads first), which keeps
 * distribution even without extra config. Falls back to OWNER users if there are
 * no agents. Returns null if there are no eligible users (lead stays unassigned).
 *
 * Extension point: swap this for sector/geography routing rules later.
 */
export async function pickAssignee(): Promise<string | null> {
  const agents = await prisma.user.findMany({
    where: { role: "AGENT" },
    select: { id: true, _count: { select: { ownedLeads: true } } },
  });
  const pool = agents.length
    ? agents
    : await prisma.user.findMany({
        where: { role: "OWNER" },
        select: { id: true, _count: { select: { ownedLeads: true } } },
      });
  if (!pool.length) return null;
  pool.sort((a, b) => a._count.ownedLeads - b._count.ownedLeads);
  return pool[0].id;
}
