import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function testFetch() {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const status = await client.status("INBOX", { messages: true, unseen: true });
    console.log("Mailbox status:", status);

    const sinceDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const uids = await client.search({ since: sinceDate });
    console.log("Search { since: 7 days } UIDs count:", (uids || []).length);

    // Fetch last 30 messages by sequence:
    const total = status.messages || 70;
    const startSeq = Math.max(1, total - 30);
    const msgs = client.fetch(`${startSeq}:*`, { envelope: true });
    console.log("\\nLast 30 messages by sequence range (" + startSeq + ":*):");
    for await (const m of msgs) {
      console.log(`Seq ${m.seq} | UID ${m.uid} | Date: ${m.envelope?.date?.toISOString()} | From: ${m.envelope?.from?.[0]?.address} | Subject: ${m.envelope?.subject}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
testFetch().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_imap_search.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_imap_search.ts && rm -f test_imap_search.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
