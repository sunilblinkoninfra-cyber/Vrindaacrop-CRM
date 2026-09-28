import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function checkAllMail() {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("[Gmail]/All Mail");
    const mb = client.mailbox as any;
    const total = mb?.exists || 0;
    console.log("All Mail total:", total);

    // Look at last 50 messages
    const start = Math.max(1, total - 50);
    const msgs = client.fetch(start + ":*", { envelope: true });
    let count = 0;
    for await (const m of msgs) {
      const from = m.envelope?.from?.[0]?.address || "";
      const sub = m.envelope?.subject || "";
      if (from.includes("mailer-daemon") || sub.includes("Delivery Status")) {
        count++;
        console.log(`[Bounce #${count}] UID: ${m.uid} | Date: ${m.envelope?.date?.toISOString()} | From: ${from} | Sub: ${sub}`);
      }
    }
    console.log("Bounces found in [Gmail]/All Mail:", count);
    lock.release();
  } finally {
    await client.logout();
  }
}
checkAllMail().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_all_mail.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_all_mail.ts && rm -f test_all_mail.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
