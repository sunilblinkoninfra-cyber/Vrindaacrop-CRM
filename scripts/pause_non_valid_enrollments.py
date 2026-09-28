import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function run() {
  const nonValidActive = await prisma.enrollment.findMany({
    where: {
      state: "ACTIVE",
      lead: {
        validationStatus: { not: "VALID" }
      }
    },
    select: {
      id: true,
      lead: {
        select: {
          id: true,
          email: true,
          validationStatus: true,
          validationReason: true,
        }
      }
    }
  });

  console.log(`Found ${nonValidActive.length} ACTIVE enrollments for leads with validationStatus != 'VALID'.`);
  const breakdown: Record<string, number> = {};
  for (const e of nonValidActive) {
    breakdown[e.lead.validationStatus] = (breakdown[e.lead.validationStatus] || 0) + 1;
  }
  console.log("Breakdown by status:", breakdown);

  const res = await prisma.enrollment.updateMany({
    where: {
      state: "ACTIVE",
      lead: {
        validationStatus: { not: "VALID" }
      }
    },
    data: {
      state: "PAUSED",
      pausedReason: "non_valid_email_policy"
    }
  });

  console.log(`Successfully paused ${res.count} non-valid enrollments.`);

  const remainingActive = await prisma.enrollment.count({
    where: { state: "ACTIVE" }
  });
  const remainingActiveValid = await prisma.enrollment.count({
    where: {
      state: "ACTIVE",
      lead: { validationStatus: "VALID", isSuppressed: false }
    }
  });

  console.log(`Remaining ACTIVE enrollments: ${remainingActive} (all 100% VALID: ${remainingActive === remainingActiveValid})`);
}

run().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/pause_non_valid_enrollments.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/pause_non_valid_enrollments.ts && rm -f scripts/pause_non_valid_enrollments.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
