import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function check() {
  const activeEnrolledLeads = await prisma.enrollment.findMany({
    where: { state: "ACTIVE" },
    select: {
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
    }
  });
  console.log("Total active enrollments:", activeEnrolledLeads.length);
  const reasonCounts: Record<string, number> = {};
  for (const e of activeEnrolledLeads) {
    const r = String(e.lead.validationReason);
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  }
  console.log("Validation reasons for active enrolled:", reasonCounts);
}
check().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/inspect_active_reasons.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/inspect_active_reasons.ts && rm -f scripts/inspect_active_reasons.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
