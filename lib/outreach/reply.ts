import { prisma } from "@/lib/prisma";
import { recordEvent, findLeadForEvent } from "@/lib/outreach/events";
import { pauseEnrollmentsForLead } from "@/lib/outreach/enroll";
import { notifyOwnerOfReply } from "@/lib/notify";
import { EmailEventType } from "@prisma/client";

/**
 * Handle a detected reply from a lead:
 *  - record REPLIED event
 *  - pause active enrollments (stop over-mailing a warm lead)
 *  - tag lead Hot + move to REPLIED stage
 *  - notify the assigned owner (email + WhatsApp)
 */
export async function handleReply(args: {
  fromEmail: string;
  messageId?: string;
  snippet?: string;
}) {
  const match = await findLeadForEvent(args.messageId, args.fromEmail);
  if (!match) return { matched: false };

  const { leadId, enrollmentId } = match;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { owner: true } });
  if (!lead) return { matched: false };

  await recordEvent({
    leadId,
    enrollmentId,
    type: EmailEventType.REPLIED,
    metadata: args.snippet ? { snippet: args.snippet } : undefined,
  });
  await pauseEnrollmentsForLead(leadId, "replied");
  await prisma.lead.update({
    where: { id: leadId },
    data: { hot: true, stage: lead.stage === "WON" || lead.stage === "LOST" ? lead.stage : "REPLIED" },
  });
  await prisma.activity.create({
    data: { leadId, type: "reply", message: "Lead replied — marked Hot, sequence paused" },
  });

  await notifyOwnerOfReply(lead, args.snippet ?? "");
  return { matched: true, leadId };
}
