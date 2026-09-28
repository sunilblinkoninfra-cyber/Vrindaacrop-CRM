import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { prisma } from "./lib/prisma";
import { probeMailbox, pickBestMx, isCatchAllDomain } from "./lib/import/smtp-probe";

async function checkTodaySends() {
  const attempts = await prisma.sendAttempt.findMany({
    where: { createdAt: { gte: new Date("2026-09-24T00:00:00Z") } },
    include: { enrollment: { include: { lead: true } } },
    orderBy: { createdAt: "asc" }
  });

  console.log("Analyzing " + attempts.length + " emails sent today...");
  let validCount = 0;
  let invalidCount = 0;
  let catchAllCount = 0;
  let unknownCount = 0;
  const invalidList: string[] = [];

  for (const a of attempts) {
    const email = a.enrollment.lead.email;
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      invalidCount++;
      invalidList.push(email + " (no domain)");
      continue;
    }
    const mx = await pickBestMx(domain);
    if (!mx) {
      invalidCount++;
      invalidList.push(email + " (no MX)");
      continue;
    }
    const catchAll = await isCatchAllDomain(domain, mx);
    if (catchAll) {
      catchAllCount++;
      continue;
    }
    const res = await probeMailbox(email, mx);
    if (res.outcome === "confirmed-invalid") {
      invalidCount++;
      invalidList.push(email + " - " + res.reason);
    } else if (res.outcome === "confirmed-valid") {
      validCount++;
    } else {
      unknownCount++;
    }
  }

  console.log("\\n--- PROBE RESULTS FOR TODAY 100 EMAILS ---");
  console.log("Confirmed Valid:   " + validCount);
  console.log("Confirmed Invalid: " + invalidCount);
  console.log("Catch-All Domain:  " + catchAllCount);
  console.log("Unknown / Timeout: " + unknownCount);
  console.log("\\nSample of Invalid Inboxes (" + invalidList.length + "):");
  invalidList.slice(0, 20).forEach((e, i) => console.log(" " + (i + 1) + ". " + e));
}

checkTodaySends().catch(console.error);
"""

# Write to a temporary file on the VPS
sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scratch_audit.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scratch_audit.ts && rm -f scratch_audit.ts")
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("ERR:", err)

ssh.close()
