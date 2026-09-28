import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function inspectEnrollments() {
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    include: {
      _count: { select: { enrollments: true } },
      steps: { orderBy: { order: "asc" } }
    }
  });

  console.log("=== ACTIVE CAMPAIGNS ===");
  for (const c of activeCampaigns) {
    console.log(`Campaign: "${c.name}" (id: ${c.id}) | Steps: ${c.steps.length} | Enrollments: ${c._count.enrollments}`);
  }

  const enrollmentStates = await prisma.enrollment.groupBy({
    by: ["state"],
    _count: { id: true },
  });
  console.log("\n=== ENROLLMENT STATES ===");
  for (const s of enrollmentStates) {
    console.log(`State: ${s.state} -> ${s._count.id}`);
  }

  const pendingValidation = await prisma.enrollment.count({
    where: {
      state: "ACTIVE",
      lead: {
        isSuppressed: false,
        validationStatus: { notIn: ["INVALID", "DISPOSABLE"] },
        smtpCheckedAt: null,
      }
    }
  });
  console.log("\nActive enrollments with unprobed leads (smtpCheckedAt == null):", pendingValidation);
}

inspectEnrollments().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/inspect_enrollments.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/inspect_enrollments.ts && rm -f scripts/inspect_enrollments.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
