import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function testRange() {
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
    const total = lock.mailbox.exists || 0;
    console.log("Total messages in INBOX:", total);

    const start = Math.max(1, total - 40);
    const seqRange = start + ":*";
    const msgs = client.fetch(seqRange, { envelope: true });
    let count = 0;
    for await (const m of msgs) {
      count++;
      const from = m.envelope?.from?.[0]?.address;
      const sub = m.envelope?.subject || "";
      const d = m.envelope?.date?.toISOString();
      console.log("[" + m.seq + "] Date: " + d + " | From: " + from + " | Sub: " + sub.slice(0, 45));
    }
    console.log("Fetched count:", count);
  } finally {
    lock.release();
    await client.logout();
  }
}
testRange().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_range.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_range.ts && rm -f test_range.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
