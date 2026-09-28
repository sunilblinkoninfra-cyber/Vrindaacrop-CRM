import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./lib/env";

async function testSafeFetch() {
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
    const sinceDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    // Fetch only envelope and uid — fast and never crashes Gmail!
    const messages = client.fetch({ since: sinceDate }, { envelope: true, uid: true });

    let count = 0;
    let bounceCount = 0;
    for await (const m of messages) {
      count++;
      const from = m.envelope?.from?.[0]?.address || "";
      const subject = m.envelope?.subject || "";
      const isBounce = from.includes("mailer-daemon") || from.includes("postmaster") || /delivery|failure|undelivered|blocked/i.test(subject);

      if (isBounce) {
        bounceCount++;
        console.log(`[Bounce #${bounceCount}] UID ${m.uid} | From: ${from} | Subject: ${subject}`);
        
        // Fetch source individually for this single message
        try {
          const download = await client.download(m.uid.toString(), undefined, { uid: true });
          if (download && download.content) {
            const parsed = await simpleParser(download.content);
            console.log("  Successfully parsed source! Text length:", (parsed.text || "").length);
            const m1 = (parsed.text || "").match(/(?:wasn't delivered to|message to|failed to deliver to)\s+<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})>*/i);
            if (m1) console.log("  Extracted recipient:", m1[1]);
          }
        } catch (e: any) {
          console.error("  Error downloading source:", e.message);
        }
      }
    }
    console.log(`\\nTotal messages scanned: ${count}, Bounces found: ${bounceCount}`);
  } finally {
    lock.release();
    await client.logout();
  }
}
testSafeFetch().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_safe_fetch.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_safe_fetch.ts && rm -f test_safe_fetch.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
