import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function listAll() {
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
    const msgs = client.fetch("1:*", { envelope: true });
    let i = 0;
    for await (const m of msgs) {
      i++;
      const from = m.envelope?.from?.[0]?.address || "";
      const sub = m.envelope?.subject || "";
      const d = m.envelope?.date?.toISOString()?.slice(0, 10) || "";
      console.log("[" + i + "] UID: " + m.uid + " | Date: " + d + " | From: " + from + " | Sub: " + sub.slice(0, 45));
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
listAll().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_list_all.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_list_all.ts && rm -f test_list_all.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
