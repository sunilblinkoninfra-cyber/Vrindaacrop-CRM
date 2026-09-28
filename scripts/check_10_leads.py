import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { prisma } from "./lib/prisma";

async function checkCounts() {
  const bouncedEvents = await prisma.emailEvent.count({ where: { type: "BOUNCED" } });
  const suppressedLeads = await prisma.lead.count({ where: { isSuppressed: true } });
  const invalidLeads = await prisma.lead.count({ where: { validationStatus: "INVALID" } });
  const catchAllLeads = await prisma.lead.count({ where: { validationStatus: "CATCH_ALL" } });
  const validLeads = await prisma.lead.count({ where: { validationStatus: "VALID" } });
  const sendingDay = await prisma.sendingDay.findMany({ orderBy: { localDate: "desc" }, take: 1 });

  console.log("=== CURRENT DATABASE STATE ===");
  console.log("EmailEvent (BOUNCED):", bouncedEvents);
  console.log("Suppressed Leads:    ", suppressedLeads);
  console.log("Invalid Leads:       ", invalidLeads);
  console.log("Catch-All Leads:     ", catchAllLeads);
  console.log("Valid Leads:         ", validLeads);
  if (sendingDay.length > 0) {
    console.log("SendingDay:", sendingDay[0].localDate.toISOString().slice(0, 10), "sent:", sendingDay[0].sent, "bounced:", sendingDay[0].bounced);
  }
}
checkCounts().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_check_counts.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_check_counts.ts && rm -f test_check_counts.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
