import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function checkMailboxes() {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    const list = await client.list();
    console.log("Mailbox folders:");
    for (const b of list) {
      console.log(`- ${b.path} (flags: ${Array.from(b.flags || []).join(", ")})`);
    }

    // Check Trash or Spam or All Mail for UID 146-153
    for (const path of ["[Gmail]/Trash", "[Gmail]/Spam", "[Gmail]/All Mail"]) {
      try {
        const lock = await client.getMailboxLock(path);
        console.log(`\\nFolder ${path}: exists = ${client.mailbox ? (client.mailbox as any).exists : 0}`);
        const msgs = client.fetch("1:*", { envelope: true });
        for await (const m of msgs) {
          const from = m.envelope?.from?.[0]?.address || "";
          const sub = m.envelope?.subject || "";
          if (from.includes("mailer-daemon") || sub.includes("Delivery Status")) {
            console.log(`  [FOUND IN ${path}] UID ${m.uid} | From: ${from} | Sub: ${sub}`);
          }
        }
        lock.release();
      } catch (e: any) {
        console.log(`  Could not open ${path}: ${e.message}`);
      }
    }
  } finally {
    await client.logout();
  }
}
checkMailboxes().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_folders.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_folders.ts && rm -f test_folders.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
