import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { env } from "./lib/env";

async function searchBounces() {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    for (const folder of ["INBOX", "[Gmail]/All Mail", "[Gmail]/Trash", "[Gmail]/Spam"]) {
      try {
        const lock = await client.getMailboxLock(folder);
        const uids1 = await client.search({ from: "mailer-daemon" });
        const uids2 = await client.search({ header: ["from", "mailer-daemon"] });
        console.log(`Folder "${folder}": search {from: "mailer-daemon"} -> ${(uids1 || []).length}, search header -> ${(uids2 || []).length}`);
        if (uids1 && uids1.length > 0) {
          const msgs = client.fetch(uids1, { envelope: true });
          for await (const m of msgs) {
            console.log(`  UID: ${m.uid} | Date: ${m.envelope?.date?.toISOString()} | From: ${m.envelope?.from?.[0]?.address} | Sub: ${m.envelope?.subject}`);
          }
        }
        lock.release();
      } catch (err: any) {
        console.log(`Error on ${folder}:`, err.message);
      }
    }
  } finally {
    await client.logout();
  }
}
searchBounces().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_search_all.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_search_all.ts && rm -f test_search_all.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
