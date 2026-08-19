import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { validateEmail, localCheckToValidationStatus } from "@/lib/import/validate";
import { emailKey } from "@/lib/import/dedup";
import { normalizeSector, normalizeCity, toRegion } from "@/lib/import/normalize";
import { TargetField } from "@/lib/import/parse";

export type ProcessResult = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
};

const EXISTENCE_CHECK_CHUNK = 2000;

/**
 * Look up which of the given normalized emails already exist as leads, in
 * chunks — bounded by the size of the current import file rather than the
 * total leads table. At 100k+ existing leads, loading every email into memory
 * (the old approach) allocates tens of MB for a set we mostly never use.
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
 * Process a MAPPED import batch: for each staged row, map source columns to
 * target fields, deduplicate (in-batch + against existing leads), validate the
 * email, and create leads. Invalid-syntax/MX rows are skipped and flagged.
 */
export async function processImportBatch(batchId: string): Promise<ProcessResult> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { rows: true },
  });
  if (!batch) throw new Error("Import batch not found");
  const mapping = (batch.columnMapping ?? {}) as Partial<Record<TargetField, string>>;
  if (!mapping.email) throw new Error("Email column must be mapped before processing");

  await prisma.importBatch.update({ where: { id: batchId }, data: { status: "PROCESSING" } });

  // Only check existence for emails actually present in this import file —
  // scales with the file size, not with however many leads are already in
  // the database.
  const emailColumn = mapping.email;
  const candidateKeys = batch.rows
    .map((row) => {
      const raw = row.raw as Record<string, string>;
      const email = (raw[emailColumn] ?? "").trim();
      return email ? emailKey(email) : null;
    })
    .filter((k): k is string => k !== null);
  const existing = await findExistingEmails([...new Set(candidateKeys)]);
  const seenThisBatch = new Set<string>();

  let imported = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const row of batch.rows) {
    const raw = row.raw as Record<string, string>;
    const get = (f: TargetField) => (mapping[f] ? (raw[mapping[f]!] ?? "").trim() : "");
    const email = get("email");

    if (!email) {
      invalid++;
      await prisma.importRow.update({ where: { id: row.id }, data: { status: "invalid", note: "Missing email" } });
      continue;
    }
    const key = emailKey(email);
    if (existing.has(key) || seenThisBatch.has(key)) {
      duplicates++;
      await prisma.importRow.update({ where: { id: row.id }, data: { status: "duplicate", note: "Duplicate email" } });
      continue;
    }

    const local = await validateEmail(email);
    if (local.check === "invalid") {
      invalid++;
      await prisma.importRow.update({ where: { id: row.id }, data: { status: "invalid", note: "Failed email validation" } });
      continue;
    }

    const rawGeo = get("geography");
    await prisma.lead.create({
      data: {
        firstName: get("firstName") || null,
        lastName: get("lastName") || null,
        company: get("company") || null,
        email,
        emailNormalized: normalizeEmail(email),
        phone: get("phone") || null,
        sector: normalizeSector(get("sector")),
        city: normalizeCity(rawGeo),
        geography: toRegion(rawGeo),
        source: get("source") || batch.filename,
        validationStatus: localCheckToValidationStatus[local.check],
        validationReason: local.typoSuggestion
          ? `${local.reason ?? ""}${local.reason ? "; " : ""}possible typo of ${local.typoSuggestion}`
          : local.reason,
        validationCheckedAt: new Date(),
      },
    });
    seenThisBatch.add(key);
    existing.add(key);
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

  return { total: batch.rows.length, imported, duplicates, invalid };
}
