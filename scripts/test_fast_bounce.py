import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { normalizeEmail } from "./lib/utils";

function isBounce(fromAddr: string, subject: string): boolean {
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

function extractBouncedEmail(parsed: any, ownDomain = "vrindaacorp.com"): string | null {
  const text = (parsed.text || "") + " " + (parsed.html || "");
  
  // 1. Direct patterns
  const m1 = text.match(/(?:wasn't delivered to|message to|failed to deliver to|recipient)\s+<*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})>*/i);
  if (m1) {
    const candidate = m1[1].toLowerCase();
    if (!candidate.includes(ownDomain) && !candidate.includes("googlemail")) {
      return candidate;
    }
  }

  const m2 = text.match(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})>:\s*(?:user unknown|recipient address rejected|address rejected|does not exist)/i);
  if (m2) {
    const candidate = m2[1].toLowerCase();
    if (!candidate.includes(ownDomain)) return candidate;
  }

  // 2. Scan all emails in text
  const allMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g) || [];
  for (const raw of allMatches) {
    const email = raw.toLowerCase().trim();
    if (
      email.includes(ownDomain) ||
      email.includes("googlemail.com") ||
      email.includes("gmail.com") ||
      email.includes("mailer-daemon") ||
      email.includes("postmaster")
    ) {
      continue;
    }
    return email;
  }
  return null;
}

async function run() {
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
    const messages = client.fetch({ since: new Date(Date.now() - 2 * 24 * 3600 * 1000) }, { envelope: true, source: true });
    let count = 0;
    for await (const msg of messages) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase()?.trim() || "";
      const subject = msg.envelope?.subject || "";
      if (!isBounce(fromAddr, subject)) continue;

      count++;
      if (msg.source) {
        const parsed = await simpleParser(msg.source);
        const bouncedEmail = extractBouncedEmail(parsed);
        let lead = null;
        if (bouncedEmail) {
          lead = await prisma.lead.findFirst({
            where: { emailNormalized: normalizeEmail(bouncedEmail) },
            select: { id: true, email: true, validationStatus: true, isSuppressed: true }
          });
        }
        console.log(`Bounce #${count}: extracted=${bouncedEmail} -> lead=${lead ? `${lead.email} (id=${lead.id})` : "NOT FOUND IN DB"}`);
      }
    }
    console.log(`Processed ${count} bounces total.`);
  } finally {
    lock.release();
    await client.logout();
  }
}
run().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_fast_bounce.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_fast_bounce.ts && rm -f test_fast_bounce.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
