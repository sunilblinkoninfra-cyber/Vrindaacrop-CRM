import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function check() {
  const invalidActive = await prisma.enrollment.findMany({
    where: {
      state: "ACTIVE",
      lead: {
        validationReason: { contains: "mailbox does not exist" }
      }
    },
    include: {
      lead: true
    },
    take: 10
  });

  console.log("Count of ACTIVE enrollments with 'mailbox does not exist':", invalidActive.length);
  for (const e of invalidActive) {
    console.log(`Lead: ${e.lead.email} | valStatus: ${e.lead.validationStatus} | suppressed: ${e.lead.isSuppressed} | enrollState: ${e.state}`);
  }
}
check().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/inspect_invalid_active.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/inspect_invalid_active.ts && rm -f scripts/inspect_invalid_active.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
