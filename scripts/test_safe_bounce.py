import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./lib/env";

async function testSafeBounceDownload() {
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
    // 1. Fetch only envelope and uid (no source in bulk)
    const messages = client.fetch({ since: sinceDate }, { envelope: true, uid: true });
    const buffer: any[] = [];
    for await (const m of messages) {
      buffer.push(m);
    }
    console.log("Envelopes collected in buffer:", buffer.length);

    // 2. Iterate buffer after fetch stream is done
    let bouncesFound = 0;
    for (const msg of buffer) {
      const from = msg.envelope?.from?.[0]?.address || "";
      const subject = msg.envelope?.subject || "";
      const isBounce =
        from.includes("mailer-daemon") ||
        from.includes("postmaster") ||
        /delivery|failure|undelivered|blocked/i.test(subject);

      if (!isBounce) continue;
      bouncesFound++;

      let failedEmail: string | null = null;
      let bounceReason = "Delivery failed";
      try {
        const dl = await client.download(msg.uid.toString(), undefined, { uid: true });
        if (dl && dl.content) {
          const parsed = await simpleParser(dl.content);
          const fullText = (parsed.text || "") + " " + (parsed.html || "");
          
          const m1 = fullText.match(/(?:wasn't delivered to|message to|failed to deliver to)\\s+<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})>*/i);
          if (m1) failedEmail = m1[1];

          const reasonMatch = fullText.match(/(?:The response (?:from the remote server )?was:\\s*)?(55\\d[^\\r\\n]+|The email account that you tried to reach[^\\r\\n]+|Address rejected[^\\r\\n]+|Recipient address rejected[^\\r\\n]+|User unknown[^\\r\\n]+)/i);
          if (reasonMatch) bounceReason = reasonMatch[1].trim().slice(0, 100);
        }
      } catch (err: any) {
        console.error("  Error downloading UID " + msg.uid + ":", err.message);
      }

      console.log(`[Bounce #${bouncesFound}] UID ${msg.uid} -> Email: ${failedEmail} | Reason: ${bounceReason}`);
    }
    console.log(`\\nTotal Bounces Processed: ${bouncesFound}`);
  } finally {
    lock.release();
    await client.logout();
  }
}
testSafeBounceDownload().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_safe_bounce.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_safe_bounce.ts && rm -f test_safe_bounce.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
