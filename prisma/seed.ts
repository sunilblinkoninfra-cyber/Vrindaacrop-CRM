import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@vrindaacorp.com" },
    update: { passwordHash },
    create: {
      email: "admin@vrindaacorp.com",
      name: "VrindaaCorp Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@vrindaacorpservices.in" },
    update: { passwordHash },
    create: {
      email: "admin@vrindaacorpservices.in",
      name: "VrindaaCorp Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@vrindaacorp.com" },
    update: { passwordHash },
    create: {
      email: "owner@vrindaacorp.com",
      name: "Business Owner",
      passwordHash,
      role: Role.OWNER,
      whatsappNumber: "+919999999999",
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@vrindaacorpservices.in" },
    update: { passwordHash },
    create: {
      email: "owner@vrindaacorpservices.in",
      name: "Business Owner",
      passwordHash,
      role: Role.OWNER,
      whatsappNumber: "+919999999999",
    },
  });

  // Base tags
  const sectors = ["Corporate", "Healthcare", "Industrial", "Education", "Retail", "Hospitality"];
  const geos = ["NCR", "UP", "pan-India"];
  for (const name of sectors) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name, kind: "sector" } });
  }
  for (const name of geos) {
    await prisma.tag.upsert({ where: { name }, update: {}, create: { name, kind: "geography" } });
  }

  // A few demo leads
  const demo = [
    { firstName: "Rahul", lastName: "Sharma", company: "Apex Towers", email: "rahul@apextowers.example", sector: "Corporate", geography: "NCR" },
    { firstName: "Priya", lastName: "Verma", company: "CityCare Hospital", email: "priya@citycare.example", sector: "Healthcare", geography: "UP" },
    { firstName: "Amit", lastName: "Singh", company: "Steelworks Ltd", email: "amit@steelworks.example", sector: "Industrial", geography: "pan-India" },
  ];
  for (const d of demo) {
    const emailNormalized = d.email.toLowerCase();
    const existing = await prisma.lead.findFirst({ where: { emailNormalized } });
    if (!existing) {
      await prisma.lead.create({
        data: { ...d, emailNormalized, ownerId: owner.id },
      });
    }
  }

  console.log("Seeded:", { admin: admin.email, owner: owner.email });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
