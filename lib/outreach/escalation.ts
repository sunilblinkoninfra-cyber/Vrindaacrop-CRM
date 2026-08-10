import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendEscalation } from "@/lib/notify";

/**
 * Find notifications still in SENT state older than the escalation window
 * (default 48h) whose lead is still hot, and send a reminder to the owner.
 */
export async function runEscalation(): Promise<{ escalated: number }> {
  const cutoff = new Date(Date.now() - env.sending.escalationHours * 3600 * 1000);
  const pending = await prisma.notification.findMany({
    where: { state: "SENT", createdAt: { lte: cutoff }, lead: { hot: true } },
    select: { id: true },
  });

  for (const n of pending) {
    await sendEscalation(n.id);
  }
  return { escalated: pending.length };
}
