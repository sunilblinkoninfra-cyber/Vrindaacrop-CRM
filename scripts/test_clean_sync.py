import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { syncImapReplies } from "../lib/inbound/imap";

async function testSync() {
  console.log("Triggering syncImapReplies with new lightweight engine...");
  const res = await syncImapReplies({ sinceDays: 7, maxMessages: 50 });
  console.log("Sync Result:", {
    ok: res.ok,
    checked: res.checked,
    matchedReplies: res.matchedReplies,
    matchedBounces: res.matchedBounces,
    detailsCount: res.details.length,
    error: res.error,
  });
}
testSync().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/test_sync_clean.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/test_sync_clean.ts && rm -f scripts/test_sync_clean.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
