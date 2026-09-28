import paramiko
import sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { pickBestMx, probeMailbox, isCatchAllDomain } from "../lib/import/smtp-probe";
import { normalizeEmail } from "../lib/utils";
import { ValidationStatus, SuppressionReason } from "@prisma/client";

async function main() {
  console.log("=== STEP 1: Reconciling Existing INVALID & DISPOSABLE Leads ===");
  const invalidLeads = await prisma.lead.findMany({
    where: {
      OR: [
        { validationStatus: "INVALID" },
        { validationStatus: "DISPOSABLE" },
        { validationReason: { contains: "does not exist" } }
      ]
    },
    select: { id: true, email: true, emailNormalized: true, isSuppressed: true }
  });

  console.log(`Found ${invalidLeads.length} leads with INVALID status or reason.`);
  let newlySuppressed = 0;
  for (const l of invalidLeads) {
    await prisma.suppression.upsert({
      where: { emailNormalized: l.emailNormalized },
      update: { reason: SuppressionReason.HARD_BOUNCE },
      create: { emailNormalized: l.emailNormalized, reason: SuppressionReason.HARD_BOUNCE }
    });
    if (!l.isSuppressed) {
      await prisma.lead.update({
        where: { id: l.id },
        data: { isSuppressed: true }
      });
      newlySuppressed++;
    }
  }
  console.log(`Suppressed ${newlySuppressed} previously unsuppressed invalid leads.`);

  const pausedEnrollments = await prisma.enrollment.updateMany({
    where: {
      state: "ACTIVE",
      lead: {
        OR: [
          { isSuppressed: true },
          { validationStatus: { in: ["INVALID", "DISPOSABLE"] } }
        ]
      }
    },
    data: { state: "PAUSED" }
  });
  console.log(`Paused ${pausedEnrollments.count} active enrollments attached to invalid/suppressed leads.`);

  console.log("\n=== STEP 2: Pre-Emptive Sweep on Active Enrolled Leads ===");
  const unprobedLeads = await prisma.lead.findMany({
    where: {
      enrollments: { some: { state: "ACTIVE" } },
      isSuppressed: false,
      validationStatus: { notIn: ["INVALID", "DISPOSABLE"] },
      OR: [
        { validationReason: null },
        { validationReason: { startsWith: "Domain MX verified" } }
      ]
    },
    select: { id: true, email: true, emailNormalized: true }
  });

  console.log(`Found ${unprobedLeads.length} active enrolled leads requiring mailbox existence probe.`);

  let invalidCount = 0;
  let validCount = 0;
  let catchAllCount = 0;
  let unknownCount = 0;
  let noMxCount = 0;

  // Process with concurrency pool of 8
  const CONCURRENCY = 8;
  for (let i = 0; i < unprobedLeads.length; i += CONCURRENCY) {
    const chunk = unprobedLeads.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (lead) => {
      const now = new Date();
      const domain = lead.email.split("@")[1]?.toLowerCase();
      if (!domain) {
        await prisma.suppression.upsert({
          where: { emailNormalized: lead.emailNormalized },
          update: { reason: SuppressionReason.HARD_BOUNCE },
          create: { emailNormalized: lead.emailNormalized, reason: SuppressionReason.HARD_BOUNCE }
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationStatus: ValidationStatus.INVALID,
            validationReason: "Malformed email (missing domain)",
            isSuppressed: true,
            smtpCheckedAt: now
          }
        });
        await prisma.enrollment.updateMany({
          where: { leadId: lead.id, state: "ACTIVE" },
          data: { state: "PAUSED" }
        });
        invalidCount++;
        return;
      }

      const mxHost = await pickBestMx(domain);
      if (!mxHost) {
        await prisma.suppression.upsert({
          where: { emailNormalized: lead.emailNormalized },
          update: { reason: SuppressionReason.HARD_BOUNCE },
          create: { emailNormalized: lead.emailNormalized, reason: SuppressionReason.HARD_BOUNCE }
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationStatus: ValidationStatus.INVALID,
            validationReason: "No active MX records found for domain",
            isSuppressed: true,
            smtpCheckedAt: now
          }
        });
        await prisma.enrollment.updateMany({
          where: { leadId: lead.id, state: "ACTIVE" },
          data: { state: "PAUSED" }
        });
        noMxCount++;
        return;
      }

      const catchAll = await isCatchAllDomain(domain, mxHost);
      if (catchAll) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationStatus: ValidationStatus.CATCH_ALL,
            validationReason: "SMTP: catch-all domain — cannot confirm mailbox",
            smtpCheckedAt: now
          }
        });
        catchAllCount++;
        return;
      }

      const probe = await probeMailbox(lead.email, mxHost);
      if (probe.outcome === "confirmed-invalid") {
        await prisma.suppression.upsert({
          where: { emailNormalized: lead.emailNormalized },
          update: { reason: SuppressionReason.HARD_BOUNCE },
          create: { emailNormalized: lead.emailNormalized, reason: SuppressionReason.HARD_BOUNCE }
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationStatus: ValidationStatus.INVALID,
            validationReason: probe.reason,
            isSuppressed: true,
            smtpCheckedAt: now
          }
        });
        await prisma.enrollment.updateMany({
          where: { leadId: lead.id, state: "ACTIVE" },
          data: { state: "PAUSED" }
        });
        console.log(`[INVALID CAUGHT & SUPPRESSED] ${lead.email}: ${probe.reason}`);
        invalidCount++;
      } else if (probe.outcome === "confirmed-valid") {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationStatus: ValidationStatus.VALID,
            validationReason: probe.reason,
            smtpCheckedAt: now
          }
        });
        validCount++;
      } else {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            validationReason: "SMTP: probe inconclusive (timeout/refused)",
            smtpCheckedAt: now
          }
        });
        unknownCount++;
      }
    }));

    if ((i + CONCURRENCY) % 40 === 0 || i + CONCURRENCY >= unprobedLeads.length) {
      console.log(`Progress: ${Math.min(i + CONCURRENCY, unprobedLeads.length)} / ${unprobedLeads.length} probed | Invalid: ${invalidCount} | Valid: ${validCount} | Catch-All: ${catchAllCount} | Unknown: ${unknownCount}`);
    }
  }

  console.log("\n=== SWEEP COMPLETED ===");
  console.log(`Total probed: ${unprobedLeads.length}`);
  console.log(`Confirmed Invalid: ${invalidCount}`);
  console.log(`No MX: ${noMxCount}`);
  console.log(`Confirmed Valid: ${validCount}`);
  console.log(`Catch-All: ${catchAllCount}`);
  console.log(`Inconclusive/Timeout: ${unknownCount}`);
}

main().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/reconcile_and_probe_enrolled.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/reconcile_and_probe_enrolled.ts && rm -f scripts/reconcile_and_probe_enrolled.ts")
while True:
    line = stdout.readline()
    if not line:
        break
    print(line, end="")
print(stderr.read().decode())
ssh.close()
