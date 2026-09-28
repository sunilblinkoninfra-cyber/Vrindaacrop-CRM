import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./lib/env";

async function testClean() {
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
    const mb = client.mailbox as any;
    const total = mb?.exists || 0;
    console.log("Total messages in INBOX:", total);

    // Fetch envelopes of last 30 messages
    const start = Math.max(1, total - 30);
    const messages = client.fetch(start + ":*", { envelope: true, uid: true });
    
    const buffer: any[] = [];
    for await (const m of messages) {
      buffer.push({ uid: m.uid, seq: m.seq, envelope: m.envelope });
    }
    console.log("Buffered envelopes:", buffer.length);

    if (buffer.length > 0) {
      const last = buffer[buffer.length - 1];
      console.log("Testing download for UID:", last.uid, "From:", last.envelope?.from?.[0]?.address);
      const download = await client.download(last.uid.toString(), undefined, { uid: true });
      if (download && download.content) {
        const parsed = await simpleParser(download.content);
        console.log("Download successful! Subject:", parsed.subject, "Text len:", (parsed.text || "").length);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}
testClean().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_clean.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_clean.ts && rm -f test_clean.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
