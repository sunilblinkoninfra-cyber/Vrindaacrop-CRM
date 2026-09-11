import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

async function exportData() {
  console.log("Exporting database records...");

  const users = await prisma.user.findMany();
  const leads = await prisma.lead.findMany();
  const campaigns = await prisma.campaign.findMany({
    include: {
      steps: {
        include: { template: true },
      },
    },
  });
  const enrollments = await prisma.enrollment.findMany();
  const tags = await prisma.tag.findMany();
  const leadTags = await prisma.leadTag.findMany();
  const templates = await prisma.emailTemplate.findMany();
  const sendingPlans = await prisma.sendingPlan.findMany();

  const data = {
    users,
    tags,
    templates,
    campaigns,
    leads,
    enrollments,
    leadTags,
    sendingPlans,
  };

  const outputPath = path.join(process.cwd(), "prisma", "production-seed-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Successfully exported data to ${outputPath}:`);
  console.log(`- ${users.length} users`);
  console.log(`- ${leads.length} leads`);
  console.log(`- ${campaigns.length} campaigns`);
  console.log(`- ${templates.length} templates`);
  console.log(`- ${enrollments.length} enrollments`);
}

exportData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
