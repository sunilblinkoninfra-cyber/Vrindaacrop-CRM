/**
 * Emergency password rotation for admin/owner seeded accounts.
 * Generates cryptographically strong random passwords, hashes them with
 * bcryptjs (cost=12), and updates the users in Neon. Prints the plaintext
 * to stdout ONCE for the operator to hand over via a secure channel.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

/** URL-safe strong password (~144 bits of entropy). */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL must be set");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const targets = ["admin@vrindaacorpservices.in", "owner@vrindaacorpservices.in"];

  console.log(`Target DB: ${dbUrl.split("@")[1]?.split("/")[0] ?? "(unknown)"}`);

  const results: { email: string; password: string }[] = [];
  for (const email of targets) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) {
      console.log(`⚠️  ${email} not found — skipping`);
      continue;
    }
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    results.push({ email, password });
    console.log(`✅  Rotated ${email} (role=${user.role})`);
  }

  await prisma.$disconnect();

  console.log("\n=== NEW CREDENTIALS (share via a secure channel; do not paste in chat) ===");
  for (const r of results) console.log(`${r.email}   ${r.password}`);
  console.log("=========================================================================");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
