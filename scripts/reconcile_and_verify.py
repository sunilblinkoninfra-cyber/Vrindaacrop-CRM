import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import "dotenv/config";
import { prisma } from "./lib/prisma";
import { normalizeEmail } from "./lib/utils";
import { pickBestMx, probeMailbox, isCatchAllDomain } from "./lib/import/smtp-probe";
import { recordEvent, suppressLead } from "./lib/outreach/events";
import { pauseEnrollmentsForLead } from "./lib/outreach/enroll";
import { localDate } from "./lib/outreach/scheduler";
import { env } from "./lib/env";
import { EmailEventType, SuppressionReason, ValidationStatus } from "@prisma/client";

// The known hard bounces received from Google Mailer Daemon today
const knownBounces: Record<string, string> = {
  "devendra@amarujala.com": "550 5.1.1 User unknown; rejecting",
  "ngupta@aes.ac.in": "550 5.2.1 Inactive account / disabled user",
  "sunil.gautam@ampf.com": "550 #5.1.0 Address rejected",
  "skbehera@mum.amity.edu": "550 5.4.1 Recipient address rejected: Access denied",
  "niketa.saxena@appinventiv.com": "550 5.1.1 The email account that you tried to reach does not exist",
  "ankita.gupta@anmolindustries.com": "550 5.4.1 Recipient address rejected: Access denied",
  "parneet.kaur@ail.ac.in": "550 5.1.1 The email account that you tried to reach does not exist",
  "Rakesh.Kumar@aisglass.com": "550 5.4.1 Recipient address rejected: Access denied",
  "praveen.malik@atkearney.com": "550 #5.1.0 Address rejected",
};

async function main() {
  console.log("=== STEP 1: PROCESSING KNOWN TODAY NDR BOUNCES ===");
  const today = localDate(new Date(), env.sending.timezone);
  let ndrProcessed = 0;

  for (const [email, reason] of Object.entries(knownBounces)) {
    const norm = normalizeEmail(email);
    const lead = await prisma.lead.findFirst({
      where: { emailNormalized: norm },
      select: { id: true, email: true },
    });

    if (!lead) {
      console.log(`[NDR] ${email} not found in DB`);
      continue;
    }

    const lastSent = await prisma.emailEvent.findFirst({
      where: { leadId: lead.id, type: EmailEventType.SENT },
      orderBy: { createdAt: "desc" },
      select: { enrollmentId: true, messageId: true },
    });

    // Check if BOUNCED event exists
    const existing = await prisma.emailEvent.findFirst({
      where: { leadId: lead.id, type: EmailEventType.BOUNCED },
    });

    if (!existing) {
      await recordEvent({
        leadId: lead.id,
        enrollmentId: lastSent?.enrollmentId ?? null,
        type: EmailEventType.BOUNCED,
        messageId: lastSent?.messageId ?? undefined,
        metadata: { reason, source: "ndr_reconciliation" },
      });
      ndrProcessed++;
    }

    await suppressLead(
      lead.id,
      lead.email,
      SuppressionReason.HARD_BOUNCE,
      `Bounced (NDR): ${reason}`
    );

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: "email",
        message: `Outreach email hard bounced: ${reason}`,
      },
    }).catch(() => undefined);

    console.log(`[NDR SUPPRESSED] ${email} -> Reason: ${reason}`);
  }

  // Update SendingDay bounced counter for today
  await prisma.sendingDay.updateMany({
    where: { localDate: today },
    data: { bounced: ndrProcessed },
  });
  console.log(`SendingDay bounced count updated to: ${ndrProcessed}`);

  console.log("\\n=== STEP 2: PROBING ALL REMAINING LEADS SENT TODAY ===");
  const todayAttempts = await prisma.sendAttempt.findMany({
    where: { createdAt: { gte: new Date("2026-09-24T00:00:00Z") } },
    include: { enrollment: { include: { lead: true } } },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Checking remaining ${todayAttempts.length} send attempts from today...`);
  let validCount = 0;
  let invalidCount = 0;
  let catchAllCount = 0;
  let unknownCount = 0;

  for (const a of todayAttempts) {
    const lead = a.enrollment.lead;
    const email = lead.email;

    // Skip if already marked invalid/suppressed
    if (lead.validationStatus === "INVALID" || lead.isSuppressed) {
      invalidCount++;
      continue;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    const now = new Date();
    if (!domain) {
      await suppressLead(lead.id, email, SuppressionReason.HARD_BOUNCE, "Malformed email");
      invalidCount++;
      continue;
    }

    const mx = await pickBestMx(domain);
    if (!mx) {
      await suppressLead(lead.id, email, SuppressionReason.HARD_BOUNCE, "No MX records");
      invalidCount++;
      continue;
    }

    const catchAll = await isCatchAllDomain(domain, mx);
    if (catchAll) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          validationStatus: ValidationStatus.CATCH_ALL,
          validationReason: "SMTP: catch-all domain",
          smtpCheckedAt: now,
        },
      });
      catchAllCount++;
      continue;
    }

    const probe = await probeMailbox(email, mx);
    if (probe.outcome === "confirmed-invalid") {
      await suppressLead(lead.id, email, SuppressionReason.HARD_BOUNCE, probe.reason);
      invalidCount++;
      console.log(`[PROBED INVALID] ${email} -> ${probe.reason}`);
    } else if (probe.outcome === "confirmed-valid") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          validationStatus: ValidationStatus.VALID,
          validationReason: probe.reason,
          smtpCheckedAt: now,
        },
      });
      validCount++;
    } else {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { smtpCheckedAt: now },
      });
      unknownCount++;
    }
  }

  console.log("\\n--- TODAY SENDS RE-VERIFICATION SUMMARY ---");
  console.log(`Valid: ${validCount}`);
  console.log(`Invalid & Suppressed: ${invalidCount}`);
  console.log(`Catch-All: ${catchAllCount}`);
  console.log(`Unknown / Timeout: ${unknownCount}`);
}

main().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/reconcile_and_verify.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx reconcile_and_verify.ts && rm -f reconcile_and_verify.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
