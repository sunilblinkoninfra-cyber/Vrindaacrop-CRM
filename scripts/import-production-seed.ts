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
  if (Array.isArray(data.users)) {
    for (const user of data.users) {
      await prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          passwordHash: user.passwordHash,
          role: user.role,
          whatsappNumber: user.whatsappNumber,
        },
        create: {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          role: user.role,
          whatsappNumber: user.whatsappNumber,
        },
      });
    }
    console.log(`✓ Imported ${data.users.length} users`);
  }

  // 2. Tags
  if (Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      await prisma.tag.upsert({
        where: { name: tag.name },
        update: { kind: tag.kind },
        create: {
          id: tag.id,
          name: tag.name,
          kind: tag.kind,
        },
      });
    }
    console.log(`✓ Imported ${data.tags.length} tags`);
  }

  // 3. EmailTemplates
  if (Array.isArray(data.templates)) {
    for (const t of data.templates) {
      await prisma.emailTemplate.upsert({
        where: { id: t.id },
        update: {
          name: t.name,
          subjectA: t.subjectA,
          subjectB: t.subjectB,
          html: t.html,
          aiEnabled: Boolean(t.aiEnabled),
          aiBrief: t.aiBrief ?? null,
        },
        create: {
          id: t.id,
          name: t.name,
          subjectA: t.subjectA,
          subjectB: t.subjectB,
          html: t.html,
          aiEnabled: Boolean(t.aiEnabled),
          aiBrief: t.aiBrief ?? null,
        },
      });
    }
    console.log(`✓ Imported ${data.templates.length} email templates`);
  }

  // 4. SendingPlans (Must be before campaigns)
  if (Array.isArray(data.sendingPlans)) {
    for (const p of data.sendingPlans) {
      await prisma.sendingPlan.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          fromEmail: p.fromEmail,
          fromDomain: p.fromDomain,
          configurationSet: p.configurationSet,
          timezone: p.timezone,
          sendWindowStart: p.sendWindowStart,
          sendWindowEnd: p.sendWindowEnd,
          hardDailyCap: p.hardDailyCap,
          status: p.status,
          schedule: p.schedule,
        },
        create: {
          id: p.id,
          name: p.name,
          fromEmail: p.fromEmail,
          fromDomain: p.fromDomain,
          configurationSet: p.configurationSet,
          timezone: p.timezone,
          sendWindowStart: p.sendWindowStart,
          sendWindowEnd: p.sendWindowEnd,
          hardDailyCap: p.hardDailyCap,
          status: p.status,
          schedule: p.schedule,
        },
      });
    }
    console.log(`✓ Imported ${data.sendingPlans.length} sending plans`);
  }

  // 5. Campaigns & Steps
  if (Array.isArray(data.campaigns)) {
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
              create: (campaign.steps || []).map((s: any) => ({
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
  }

  // 6. Leads
  if (Array.isArray(data.leads)) {
    for (const lead of data.leads) {
      await prisma.lead.upsert({
        where: { id: lead.id },
        update: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phone: lead.phone,
          sector: lead.sector,
          city: lead.city,
          geography: lead.geography,
          source: lead.source,
          stage: lead.stage,
          validationStatus: lead.validationStatus,
          hot: lead.hot,
        },
        create: {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          email: lead.email,
          emailNormalized: lead.emailNormalized,
          phone: lead.phone,
          sector: lead.sector,
          city: lead.city,
          geography: lead.geography,
          source: lead.source,
          stage: lead.stage,
          validationStatus: lead.validationStatus,
          hot: lead.hot,
        },
      });
    }
    console.log(`✓ Imported ${data.leads.length} leads`);
  }

  // 7. LeadTags
  if (Array.isArray(data.leadTags)) {
    for (const lt of data.leadTags) {
      try {
        await prisma.leadTag.upsert({
          where: {
            leadId_tagId: {
              leadId: lt.leadId,
              tagId: lt.tagId,
            },
          },
          update: {},
          create: {
            leadId: lt.leadId,
            tagId: lt.tagId,
          },
        });
      } catch {
        // ignore unique constraint or missing ref
      }
    }
    console.log(`✓ Imported ${data.leadTags.length} lead tag relations`);
  }

  // 8. Enrollments
  if (Array.isArray(data.enrollments)) {
    for (const enr of data.enrollments) {
      await prisma.enrollment.upsert({
        where: { id: enr.id },
        update: {
          state: enr.state,
          currentStep: enr.currentStep,
          nextSendAt: enr.nextSendAt ? new Date(enr.nextSendAt) : null,
        },
        create: {
          id: enr.id,
          leadId: enr.leadId,
          campaignId: enr.campaignId,
          state: enr.state,
          currentStep: enr.currentStep,
          nextSendAt: enr.nextSendAt ? new Date(enr.nextSendAt) : null,
        },
      });
    }
    console.log(`✓ Imported ${data.enrollments.length} enrollments`);
  }

  console.log("Database import completed successfully!");
}

importSeed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
