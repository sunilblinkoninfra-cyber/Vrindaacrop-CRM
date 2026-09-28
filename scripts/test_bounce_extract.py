import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { normalizeEmail } from "./lib/utils";

function isBounceMessage(fromAddr: string, subject: string): boolean {
  const from = fromAddr.toLowerCase();
  const sub = subject.toLowerCase();
  return (
    from.includes("mailer-daemon") ||
    from.includes("postmaster") ||
    sub.includes("delivery status notification") ||
    sub.includes("failure") ||
    sub.includes("undelivered") ||
    sub.includes("returned mail") ||
    sub.includes("message blocked")
  );
}

function extractEmailsFromText(text: string): string[] {
  const regex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = text.match(regex) || [];
  const ownUsers = [
    env.imap.user.toLowerCase(),
    env.smtp.fromEmail.toLowerCase(),
    "mailer-daemon@googlemail.com",
    "mailer-daemon@gmail.com"
  ];
  return Array.from(new Set(matches.map(m => m.toLowerCase().replace(/^[<"']|[>"']$/g, ''))))
    .filter(email => !ownUsers.includes(email) && !email.endsWith("@googlemail.com") && !email.endsWith("@gmail.com"));
}

async function testBounceExtraction() {
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
    const messages = client.fetch({ seq: "1:*" }, { envelope: true, source: true });
    let count = 0;
    for await (const msg of messages) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase()?.trim() || "";
      const subject = msg.envelope?.subject || "";
      if (!isBounceMessage(fromAddr, subject)) continue;

      count++;
      console.log(`\n--- Bounce #${count}: "${subject}" ---`);
      if (msg.source) {
        const parsed = await simpleParser(msg.source);
        const fullText = (parsed.text || "") + " " + (parsed.html || "");
        
        // 1. Direct patterns
        let detectedEmail: string | null = null;
        let reason = "Delivery failed / Address rejected";

        const specificMatch = fullText.match(/(?:wasn't delivered to|message to|failed to deliver to)\s+<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>*/i);
        if (specificMatch) {
          detectedEmail = specificMatch[1];
        }

        const candidates = extractEmailsFromText(fullText);

        let matchedLead = null;
        if (detectedEmail) {
          matchedLead = await prisma.lead.findFirst({
            where: { emailNormalized: normalizeEmail(detectedEmail) },
            select: { id: true, email: true, validationStatus: true }
          });
        }
        if (!matchedLead && candidates.length > 0) {
          matchedLead = await prisma.lead.findFirst({
            where: { emailNormalized: { in: candidates.map(normalizeEmail) } },
            select: { id: true, email: true, validationStatus: true }
          });
        }

        console.log(`Detected Email: ${detectedEmail}`);
        console.log(`Matched Lead in DB: ${matchedLead ? `${matchedLead.email} (id=${matchedLead.id}, status=${matchedLead.validationStatus})` : "NONE"}`);
      }
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

testBounceExtraction().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_bounce_extract.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_bounce_extract.ts && rm -f test_bounce_extract.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
