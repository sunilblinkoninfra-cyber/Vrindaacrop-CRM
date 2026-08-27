import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { validateEmail, normalizePhone } from "@/lib/import/validate";
import { normalizeSector, normalizeCity, toRegion } from "@/lib/import/normalize";
import { TargetField } from "@/lib/import/parse";

export type ProcessOptions = {
  autoFixTypo?: boolean;
  skipDisposable?: boolean;
  skipInvalid?: boolean;
};

export type ProcessResult = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
  disposable: number;
  validCount: number;
  riskyCount: number;
  corporateCount: number;
  webmailCount: number;
  typoFixedCount: number;
};

const EXISTENCE_CHECK_CHUNK = 2000;

/**
 * Look up which normalized emails already exist in database.
 */
async function findExistingEmails(normalizedEmails: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < normalizedEmails.length; i += EXISTENCE_CHECK_CHUNK) {
    const chunk = normalizedEmails.slice(i, i + EXISTENCE_CHECK_CHUNK);
    const rows = await prisma.lead.findMany({
      where: { emailNormalized: { in: chunk } },
      select: { emailNormalized: true },
    });
    for (const r of rows) existing.add(r.emailNormalized);
  }
  return existing;
}

/**
 * Helper to ensure tags exist and connect them to a lead.
 */
async function attachTagsToLead(leadId: string, tags: string[]) {
  if (!tags.length) return;
  for (const tagName of tags) {
    try {
      const tag = await prisma.tag.upsert({
        where: { name: tagName },
        create: { name: tagName, kind: "validation" },
        update: {},
      });
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId, tagId: tag.id } },
        create: { leadId, tagId: tag.id },
        update: {},
      });
    } catch {
      // ignore concurrent tag insertion conflict
    }
  }
}

/**
 * Process a MAPPED import batch:
 * - Data normalization (Phone E.164, Sector canonicalization, City & Region hubs)
 * - Strict In-batch & Database Deduplication
 * - Multi-layer in-house email validation (Syntax, Disposable blocklist, Role-based check, Typo auto-fix, Live DNS MX)
 * - Automatic Validation Tag assignment (VALID, CORPORATE, FREE_WEBMAIL, RISKY, DISPOSABLE, TYPO_CORRECTED)
 */
export async function processImportBatch(
  batchId: string,
  options?: ProcessOptions
): Promise<ProcessResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { rows: true },
  });
  if (!batch) throw new Error("Import batch not found");
  const mapping = (batch.columnMapping ?? {}) as Partial<Record<TargetField, string>>;
  if (!mapping.email) throw new Error("Email column must be mapped before processing");

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "PROCESSING" } });

  const emailColumn = mapping.email;
  const candidateEmails = batch.rows
    .map((row) => {
      const raw = row.raw as Record<string, string>;
      const email = (raw[emailColumn] ?? "").trim();
      return email ? normalizeEmail(email) : null;
    })
    .filter((k): k is string => k !== null);

  const existing = await findExistingEmails([...new Set(candidateEmails)]);
  const seenThisBatch = new Set<string>();

  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  let disposable = 0;
  let validCount = 0;
  let riskyCount = 0;
  let corporateCount = 0;
  let webmailCount = 0;
  let typoFixedCount = 0;

  const autoFix = options?.autoFixTypo ?? true;
  const skipDisposable = options?.skipDisposable ?? false;

  for (const row of batch.rows) {
    const raw = row.raw as Record<string, string>;
    const get = (f: TargetField) => (mapping[f] ? (raw[mapping[f]!] ?? "").trim() : "");
    const rawEmail = get("email");

    if (!rawEmail) {
      invalid++;
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: "invalid", note: "Missing email address" },
      });
      continue;
    }

    const rawNormalized = normalizeEmail(rawEmail);
    if (existing.has(rawNormalized) || seenThisBatch.has(rawNormalized)) {
      duplicates++;
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: "duplicate", note: "Duplicate email address" },
      });
      continue;
    }

    // Run multi-layer in-house validator
    const local = await validateEmail(rawEmail, { autoFixTypo: autoFix });

    // Handle invalid syntax or missing MX servers
    if (local.check === "invalid") {
      invalid++;
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: "invalid", note: local.reason ?? "Failed email validation (Invalid/No MX)" },
      });
      continue;
    }

    // Handle disposable burner emails
    if (local.check === "disposable") {
      disposable++;
      if (skipDisposable) {
        await prisma.importRow.update({
          where: { id: row.id },
          data: { status: "invalid", note: "Skipped disposable/burner email domain" },
        });
        continue;
      }
    }

    const effectiveEmail = local.correctedEmail ?? rawEmail;
    const effectiveNormalized = normalizeEmail(effectiveEmail);

    // Re-check deduplication against effective/corrected email
    if (existing.has(effectiveNormalized) || seenThisBatch.has(effectiveNormalized)) {
      duplicates++;
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: "duplicate", note: `Duplicate email address (${effectiveEmail})` },
      });
      continue;
    }

    // Direct database existence verification as an absolute safeguard
    const dbExists = await prisma.lead.findFirst({
      where: { emailNormalized: effectiveNormalized },
      select: { id: true },
    });

    if (dbExists) {
      duplicates++;
      existing.add(effectiveNormalized);
      seenThisBatch.add(effectiveNormalized);
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: "duplicate", note: `Duplicate email address (${effectiveEmail})` },
      });
      continue;
    }

    const rawGeo = get("geography");
    const rawPhone = get("phone");

    const createdLead = await prisma.lead.create({
      data: {
        firstName: get("firstName") || null,
        lastName: get("lastName") || null,
        company: get("company") || null,
        email: effectiveEmail,
        emailNormalized: effectiveNormalized,
        phone: normalizePhone(rawPhone) || rawPhone || null,
        sector: normalizeSector(get("sector")),
        city: normalizeCity(rawGeo),
        geography: toRegion(rawGeo),
        source: get("source") || batch.filename,
        validationStatus: local.status,
        validationReason: local.reason,
        validationCheckedAt: new Date(),
      },
    });

    // Auto-attach validation and classification tags
    await attachTagsToLead(createdLead.id, local.tags);

    // Track metrics
    if (local.check === "valid") validCount++;
    else if (local.check === "risky") riskyCount++;
    if (local.isCorporate) corporateCount++;
    if (local.isFreeWebmail) webmailCount++;
    if (local.correctedEmail) typoFixedCount++;

    seenThisBatch.add(rawNormalized);
    existing.add(rawNormalized);
    seenThisBatch.add(effectiveNormalized);
    existing.add(effectiveNormalized);
    imported++;
    await prisma.importRow.update({ where: { id: row.id }, data: { status: "imported" } });
  }

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      importedRows: imported,
      duplicateRows: duplicates,
      invalidRows: invalid,
    },
  });

  return {
    total: batch.rows.length,
    imported,
    duplicates,
    invalid,
    disposable,
    validCount,
    riskyCount,
    corporateCount,
    webmailCount,
    typoFixedCount,
  };
}
