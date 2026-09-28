import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { syncImapReplies } from "./lib/inbound/imap";
import { prisma } from "./lib/prisma";

async function runLiveTest() {
  console.log("Triggering live IMAP sync on VPS...");
  const res = await syncImapReplies({ sinceDays: 7, maxMessages: 50 });
  console.log("IMAP Sync Result:", {
    ok: res.ok,
    checked: res.checked,
    matchedReplies: res.matchedReplies,
    matchedBounces: res.matchedBounces,
    error: res.error,
  });

  console.log("\\nDetails of matched items:");
  for (const d of res.details) {
    if (d.leadMatched) {
      console.log(`- From: ${d.from} | Subject: ${d.subject} | isBounce: ${d.isBounce} | email: ${d.bouncedEmail}`);
    }
  }

  // Check the status of the bounced leads in database
  const bouncedEvents = await prisma.emailEvent.findMany({
    where: { type: "BOUNCED" },
    include: { lead: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  console.log(`\\nTotal BOUNCED email events recorded in DB: ${bouncedEvents.length}`);
  for (const b of bouncedEvents) {
    console.log(`  Lead: ${b.lead.email} | Status: ${b.lead.validationStatus} | Reason: ${b.lead.validationReason} | Suppressed: ${b.lead.isSuppressed}`);
  }

  // Check SendingDay bounced counter
  const today = await prisma.sendingDay.findMany({
    orderBy: { localDate: "desc" },
    take: 2,
  });
  console.log("\\nSendingDay metrics:");
  for (const d of today) {
    console.log(`  Date: ${d.localDate.toISOString().slice(0, 10)} | Sent: ${d.sent} | Bounced: ${d.bounced}`);
  }
}

runLiveTest().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_live_bounce_sync.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_live_bounce_sync.ts && rm -f test_live_bounce_sync.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
