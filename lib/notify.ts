import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendNotificationEmail } from "@/lib/ses";
import { sendWhatsApp } from "@/lib/whatsapp";
import { fullName } from "@/lib/utils";
import type { Lead, User } from "@prisma/client";

type LeadWithOwner = Lead & { owner: User | null };

/**
 * Notify the assigned owner (or all OWNER-role users if unassigned) that a lead
 * replied. Sends via Email + WhatsApp per configured channels, and records a
 * Notification row for the 48h escalation loop.
 */
export async function notifyOwnerOfReply(lead: LeadWithOwner, snippet: string) {
  const recipients = lead.owner
    ? [lead.owner]
    : await prisma.user.findMany({ where: { role: "OWNER" } });

  const name = fullName(lead.firstName, lead.lastName) || lead.email;
  const appLink = `${env.appUrl.replace(/\/$/, "")}/leads/${lead.id}`;
  const channels: string[] = [];

  for (const owner of recipients) {
    // Email
    try {
      await sendNotificationEmail(
        owner.email,
        `🔥 Hot lead replied: ${name}`,
        replyEmailHtml(name, lead.company ?? "", snippet, appLink)
      );
      if (!channels.includes("email")) channels.push("email");
    } catch {
      /* continue */
    }

    // WhatsApp
    if (owner.whatsappNumber) {
      const res = await sendWhatsApp(owner.whatsappNumber, [name, lead.company ?? "—", appLink]);
      if (res.ok && !channels.includes("whatsapp")) channels.push("whatsapp");
    }
  }

  await prisma.notification.create({
    data: {
      leadId: lead.id,
      ownerId: lead.ownerId,
      channels: channels.join(",") || "none",
      state: "SENT",
      context: snippet.slice(0, 500),
    },
  });
}

/** Send an escalation reminder for an unacknowledged notification. */
export async function sendEscalation(notificationId: string) {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { lead: { include: { owner: true } } },
  });
  if (!n) return;
  const lead = n.lead;
  const name = fullName(lead.firstName, lead.lastName) || lead.email;
  const appLink = `${env.appUrl.replace(/\/$/, "")}/leads/${lead.id}`;

  const owners = lead.owner ? [lead.owner] : await prisma.user.findMany({ where: { role: "OWNER" } });
  for (const owner of owners) {
    try {
      await sendNotificationEmail(
        owner.email,
        `⏰ Reminder: hot lead still awaiting action — ${name}`,
        `<p>The hot lead <strong>${name}</strong> (${lead.company ?? ""}) replied over ${env.sending.escalationHours}h ago and hasn't been actioned.</p><p><a href="${appLink}">Open in CRM</a></p>`
      );
    } catch {
      /* ignore */
    }
    if (owner.whatsappNumber) {
      await sendWhatsApp(owner.whatsappNumber, [`REMINDER: ${name}`, lead.company ?? "—", appLink]);
    }
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { state: "ESCALATED", escalatedAt: new Date() },
  });
}

function replyEmailHtml(name: string, company: string, snippet: string, link: string) {
  return `
  <div style="font-family:system-ui;color:#334155">
    <h2 style="color:#0f766e">🔥 Hot lead replied</h2>
    <p><strong>${name}</strong>${company ? ` — ${company}` : ""} just replied to your outreach.</p>
    ${snippet ? `<blockquote style="border-left:3px solid #14b8a6;padding-left:10px;color:#475569">${snippet}</blockquote>` : ""}
    <p>The sequence has been paused automatically. Please respond promptly.</p>
    <p><a href="${link}" style="background:#0f766e;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Open lead in CRM</a></p>
  </div>`;
}
