import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { pickBestMx, probeMailbox, isCatchAllDomain } from "@/lib/import/smtp-probe";
import { ValidationStatus } from "@prisma/client";

const BATCH_SIZE = 25; // SMTP probes are network round-trips; keep small vs runEnrichment's batch size.

type RevalidateLead = { id: string; email: string; validationStatus: ValidationStatus };

/**
 * Best-effort SMTP re-check for one lead. Always stamps smtpCheckedAt on
 * every path — including "no MX" and "unknown" outcomes — because most
 * probes will resolve "unknown" given the port-25 constraint, and without
 * this stamp the same lead would be re-selected by every future cron run
 * forever. Only ever *tightens* a status: never resurrects a DISPOSABLE or
 * already-INVALID lead back to VALID.
 */
export async function revalidateOneLead(lead: RevalidateLead): Promise<{ changed: boolean }> {
  const domain = lead.email.split("@")[1]?.toLowerCase();
  const now = new Date();

  if (!domain) {
    await prisma.lead.update({ where: { id: lead.id }, data: { smtpCheckedAt: now } });
    return { changed: false };
  }

  const mxHost = await pickBestMx(domain);
  if (!mxHost) {
    await prisma.lead.update({ where: { id: lead.id }, data: { smtpCheckedAt: now } });
    return { changed: false };
  }

  const catchAll = await isCatchAllDomain(domain, mxHost);
  if (catchAll) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        validationStatus: ValidationStatus.CATCH_ALL,
        validationReason: "SMTP: catch-all domain — cannot confirm mailbox",
        validationCheckedAt: now,
        smtpCheckedAt: now,
      },
    });
    return { changed: true };
  }

  const probe = await probeMailbox(lead.email, mxHost);

  if (probe.outcome === "confirmed-invalid") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        validationStatus: ValidationStatus.INVALID,
        validationReason: probe.reason,
        validationCheckedAt: now,
        smtpCheckedAt: now,
      },
    });
    return { changed: true };
  }

  if (probe.outcome === "confirmed-valid") {
    // Only upgrade an uncertain status — never resurrect a disposable/bounce-confirmed lead.
    const canUpgrade = lead.validationStatus === "UNKNOWN" || lead.validationStatus === "RISKY";
    if (canUpgrade) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          validationStatus: ValidationStatus.VALID,
          validationReason: probe.reason,
          validationCheckedAt: now,
          smtpCheckedAt: now,
        },
      });
      return { changed: true };
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { smtpCheckedAt: now } });
    return { changed: false };
  }

  // "unknown" — timeout, refused, blocked port 25, etc. Leave validationStatus untouched.
  await prisma.lead.update({ where: { id: lead.id }, data: { smtpCheckedAt: now } });
  return { changed: false };
}

/** Batched re-validation pass, wired into the cron runner. */
export async function runEmailRevalidation(limit = BATCH_SIZE): Promise<{ processed: number; changed: number }> {
  if (!env.validation.smtpProbeEnabled) return { processed: 0, changed: 0 };

  const staleBefore = new Date(Date.now() - env.validation.revalidateDays * 24 * 60 * 60 * 1000);
  const pending = await prisma.lead.findMany({
    where: {
      isSuppressed: false,
      validationStatus: { notIn: [ValidationStatus.INVALID, ValidationStatus.DISPOSABLE] },
      OR: [{ smtpCheckedAt: null }, { smtpCheckedAt: { lt: staleBefore } }],
    },
    select: { id: true, email: true, validationStatus: true },
    orderBy: { smtpCheckedAt: { sort: "asc", nulls: "first" } },
    take: limit,
  });

  let changed = 0;
  for (const lead of pending) {
    try {
      const result = await revalidateOneLead(lead);
      if (result.changed) changed++;
    } catch {
      await prisma.lead.update({ where: { id: lead.id }, data: { smtpCheckedAt: new Date() } });
    }
  }
  return { processed: pending.length, changed };
}
