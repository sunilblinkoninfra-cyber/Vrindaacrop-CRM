import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendNotificationEmail } from "@/lib/ses";
import { sendWhatsApp } from "@/lib/whatsapp";
import { fullName } from "@/lib/utils";

const MS_PER_DAY = 86_400_000;

/**
 * Fire a reminder exactly ~1 month before a lead's contract expires, so the
 * agent can start the renewal conversation. Only trusted expiries count:
 * either agent-confirmed AI data, or manually-entered. Idempotent via
 * contractReminderSentAt. Creates a Task for the owner + notifies them.
 */
export async function runContractReminders(): Promise<{ reminded: number }> {
  const now = Date.now();
  const windowStart = new Date(now + 30 * MS_PER_DAY); // reminder fires when expiry is within 30 days

  const due = await prisma.lead.findMany({
    where: {
      contractReminderSentAt: null,
      contractExpiry: { not: null, lte: windowStart, gte: new Date(now) },
      OR: [{ contractConfirmed: true }, { contractSource: "manual" }],
    },
    include: { owner: true },
    take: 200,
  });

  for (const lead of due) {
    const name = fullName(lead.firstName, lead.lastName) || lead.email;
    const expiry = lead.contractExpiry!;
    const appLink = `${env.appUrl.replace(/\/$/, "")}/leads/${lead.id}`;
    const title = `Contract expiring ${expiry.toISOString().slice(0, 10)} — reconnect with ${lead.company ?? name}`;

    await prisma.task.create({
      data: { leadId: lead.id, assigneeId: lead.ownerId ?? null, title, dueAt: new Date(expiry.getTime() - 30 * MS_PER_DAY) },
    });
    await prisma.activity.create({
      data: { leadId: lead.id, type: "task", message: `Contract-expiry reminder created (expires ${expiry.toISOString().slice(0, 10)})` },
    });

    if (lead.owner) {
      try {
        await sendNotificationEmail(
          lead.owner.email,
          `📅 Contract renewal window — ${lead.company ?? name}`,
          `<div style="font-family:system-ui;color:#334155">
            <h2 style="color:#0f766e">Contract renewal opportunity</h2>
            <p><strong>${lead.company ?? name}</strong>${lead.incumbentVendor ? ` (current vendor: ${lead.incumbentVendor})` : ""} has a contract expiring on <strong>${expiry.toISOString().slice(0, 10)}</strong>.</p>
            <p>Now is the time to reconnect and pitch VrindaaCorp before renewal.</p>
            <p><a href="${appLink}" style="background:#0f766e;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open lead in CRM</a></p>
          </div>`
        );
      } catch {
        /* ignore */
      }
      if (lead.owner.whatsappNumber) {
        await sendWhatsApp(lead.owner.whatsappNumber, [`Contract renewal: ${name}`, lead.company ?? "—", appLink]);
      }
    }

    await prisma.lead.update({ where: { id: lead.id }, data: { contractReminderSentAt: new Date() } });
  }

  return { reminded: due.length };
}
