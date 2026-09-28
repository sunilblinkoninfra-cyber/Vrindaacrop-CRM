import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { pickBestMx, probeMailbox, isCatchAllDomain } from "../lib/import/smtp-probe";
import { normalizeEmail } from "../lib/utils";
import { ValidationStatus, SuppressionReason } from "@prisma/client";

async function testBatch() {
  const leads = await prisma.lead.findMany({
    where: {
      enrollments: { some: { state: "ACTIVE" } },
      validationReason: null,
      isSuppressed: false,
    },
    take: 20,
    select: { id: true, email: true }
  });

  console.log(`Testing batch probe on ${leads.length} leads...`);

  for (const lead of leads) {
    const start = Date.now();
    const domain = lead.email.split("@")[1]?.toLowerCase();
    if (!domain) {
      console.log(`[INVALID] ${lead.email} - no domain`);
      continue;
    }

    const mx = await pickBestMx(domain);
    if (!mx) {
      console.log(`[NO MX] ${lead.email} - domain ${domain} has no MX`);
      continue;
    }

    const catchAll = await isCatchAllDomain(domain, mx);
    if (catchAll) {
      console.log(`[CATCH-ALL] ${lead.email} (${Date.now() - start}ms)`);
      continue;
    }

    const res = await probeMailbox(lead.email, mx);
    console.log(`[${res.outcome.toUpperCase()}] ${lead.email} - ${res.reason} (${Date.now() - start}ms)`);
  }
}

testBatch().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/test_batch_probe.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/test_batch_probe.ts && rm -f scripts/test_batch_probe.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
