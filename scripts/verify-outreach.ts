/**
 * End-to-end outreach verification (uses SES simulated mode — no real email).
 * Sets up a template + 2-step campaign, enrolls 3 real leads, runs the sender,
 * then reports the resulting email events. Safe to run repeatedly.
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { enrollCampaignLeads } from "@/lib/outreach/enroll";
import { runSender } from "@/lib/outreach/sender";

async function main() {
  // Reset any prior verification campaign.
  await prisma.campaign.deleteMany({ where: { name: "VERIFY — Facility Services Intro" } });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  const leads = await prisma.lead.findMany({ where: { isSuppressed: false }, take: 3 });
  const tag = "verify-batch";
  // Tag 3 leads and assign owner so the reply alert has a recipient.
  const t = await prisma.tag.upsert({ where: { name: tag }, update: {}, create: { name: tag, kind: "campaign" } });
  for (const l of leads) {
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId: l.id, tagId: t.id } },
      update: {},
      create: { leadId: l.id, tagId: t.id },
    });
    await prisma.lead.update({ where: { id: l.id }, data: { ownerId: owner?.id ?? null } });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      name: "VERIFY Intro",
      subjectA: "Facility services for {{company}}",
      subjectB: "A quick note for {{firstName}} at {{company}}",
      html: `<p>Hi {{firstName}},</p><p>VrindaaCorp Services supports {{sector}} organizations like {{company}} with integrated facility management. Can we set up a quick call?</p><p><a href="https://vrindaacorp.example/book">Book a slot</a></p>`,
    },
  });

  const campaign = await prisma.campaign.create({
    data: {
      name: "VERIFY — Facility Services Intro",
      status: "ACTIVE",
      segment: { tag },
      steps: {
        create: [
          { order: 0, delayDays: 0, templateId: template.id },
          { order: 1, delayDays: 3, templateId: template.id },
        ],
      },
    },
  });

  const enrolled = await enrollCampaignLeads(campaign.id);
  console.log(`Enrolled ${enrolled} leads.`);

  const send = await runSender(10);
  console.log("Sender result:", send);

  const events = await prisma.emailEvent.groupBy({ by: ["type"], _count: { _all: true } });
  console.log("Email events:", events.map((e) => `${e.type}=${e._count._all}`).join(", "));

  // Emit the first lead's id + email so the HTTP tracking/reply test can target it.
  const first = leads[0];
  console.log("TEST_LEAD_ID=" + first.id);
  console.log("TEST_LEAD_EMAIL=" + first.email);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
