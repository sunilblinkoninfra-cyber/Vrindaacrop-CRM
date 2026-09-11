import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

async function importSeed() {
  const filePath = path.join(process.cwd(), "prisma", "production-seed-data.json");
  if (!fs.existsSync(filePath)) {
    console.log("No production-seed-data.json found. Skipping seed.");
    return;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  console.log("Importing production seed data...");

  // 1. Users
  for (const user of data.users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role,
        whatsappNumber: user.whatsappNumber,
      },
      create: user,
    });
  }
  console.log(`✓ Imported ${data.users.length} users`);

  // 2. Tags
  for (const tag of data.tags) {
    await prisma.tag.upsert({
      where: { name: tag.name },
      update: { kind: tag.kind },
      create: tag,
    });
  }
  console.log(`✓ Imported ${data.tags.length} tags`);

  // 3. EmailTemplates
  for (const t of data.templates) {
    await prisma.emailTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        industry: t.industry,
        subjectA: t.subjectA,
        subjectB: t.subjectB,
        html: t.html,
        aiEnabled: t.aiEnabled,
        aiBrief: t.aiBrief,
      },
      create: t,
    });
  }
  console.log(`✓ Imported ${data.templates.length} email templates`);

  // 4. Leads
  for (const lead of data.leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: {
        stage: lead.stage,
        validationStatus: lead.validationStatus,
        hot: lead.hot,
      },
      create: lead,
    });
  }
  console.log(`✓ Imported ${data.leads.length} leads`);

  // 5. Campaigns & Steps
  for (const campaign of data.campaigns) {
    const existing = await prisma.campaign.findUnique({ where: { id: campaign.id } });
    if (!existing) {
      await prisma.campaign.create({
        data: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          segment: campaign.segment,
          sendingPlanId: campaign.sendingPlanId,
          steps: {
            create: campaign.steps.map((s: any) => ({
              id: s.id,
              order: s.order,
              delayDays: s.delayDays,
              templateId: s.templateId,
            })),
          },
        },
      });
    }
  }
  console.log(`✓ Imported ${data.campaigns.length} campaigns`);

  // 6. Enrollments
  for (const enr of data.enrollments) {
    await prisma.enrollment.upsert({
      where: { id: enr.id },
      update: {
        state: enr.state,
        currentStep: enr.currentStep,
      },
      create: enr,
    });
  }
  console.log(`✓ Imported ${data.enrollments.length} enrollments`);

  console.log("Database import completed successfully!");
}

importSeed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
