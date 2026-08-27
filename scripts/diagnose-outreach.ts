import { prisma } from "../lib/prisma";
import { recordEvent } from "../lib/outreach/events";
import { EmailEventType } from "@prisma/client";

async function main() {
  const enrollment = await prisma.enrollment.findFirst({
    where: { campaign: { status: "ACTIVE" } },
    include: { lead: true },
  });

  if (!enrollment) {
    console.log("No active enrollment found.");
    return;
  }

  console.log("Simulating email open for:", {
    leadEmail: enrollment.lead.email,
    leadId: enrollment.leadId,
    enrollmentId: enrollment.id,
    currentStatus: enrollment.lastEventType,
  });

  // Record open event
  await recordEvent({
    leadId: enrollment.leadId,
    enrollmentId: enrollment.id,
    type: EmailEventType.OPENED,
  });

  const updated = await prisma.enrollment.findUnique({
    where: { id: enrollment.id },
    select: { id: true, lastEventType: true, lastEventAt: true },
  });
  console.log("Updated Enrollment:", updated);

  const eventCount = await prisma.emailEvent.count({
    where: { leadId: enrollment.leadId, type: "OPENED" },
  });
  console.log("Total OPENED events for this lead:", eventCount);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
