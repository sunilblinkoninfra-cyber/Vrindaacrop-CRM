import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function check() {
  const statuses = await prisma.lead.groupBy({
    by: ["validationStatus"],
    _count: { id: true }
  });
  console.log("=== Lead Validation Statuses ===");
  for (const s of statuses) {
    console.log(`Status: ${s.validationStatus} -> ${s._count.id}`);
  }

  const unprobed = await prisma.lead.count({
    where: { smtpCheckedAt: null }
  });
  console.log("\n=== Total Leads with smtpCheckedAt == null ===", unprobed);

  const suppressed = await prisma.lead.count({
    where: { isSuppressed: true }
  });
  console.log("=== Total Suppressed Leads ===", suppressed);

  // Check enrolled active leads in Batch 1 / Batch 2
  const activeEnrolled = await prisma.enrollment.findMany({
    where: { state: "ACTIVE" },
    select: {
      id: true,
      campaignId: true,
      lead: {
        select: {
          id: true,
          email: true,
          validationStatus: true,
          validationReason: true,
          smtpCheckedAt: true,
          isSuppressed: true
        }
      }
    },
    take: 10
  });
  console.log("\n=== Sample 10 Active Enrolled Leads ===");
  for (const e of activeEnrolled) {
    console.log(e.lead.email, "| status:", e.lead.validationStatus, "| reason:", e.lead.validationReason, "| smtpCheckedAt:", e.lead.smtpCheckedAt, "| suppressed:", e.lead.isSuppressed);
  }
}
check().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/inspect_leads_stats.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/inspect_leads_stats.ts && rm -f scripts/inspect_leads_stats.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
