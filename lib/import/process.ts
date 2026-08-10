import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { validateEmail } from "@/lib/import/validate";
import { emailKey } from "@/lib/import/dedup";
import { normalizeSector, normalizeCity, toRegion } from "@/lib/import/normalize";
import { TargetField } from "@/lib/import/parse";
import { ValidationStatus } from "@prisma/client";

const statusMap: Record<string, ValidationStatus> = {
  valid: ValidationStatus.VALID,
  invalid: ValidationStatus.INVALID,
  risky: ValidationStatus.RISKY,
  unknown: ValidationStatus.UNKNOWN,
};

export type ProcessResult = {
  total: number;
  imported: number;
  duplicates: number;
  invalid: number;
};

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

  // Existing emails to dedup against.
  const existing = new Set(
    (await prisma.lead.findMany({ select: { emailNormalized: true } })).map((l) => l.emailNormalized)
  );
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

    const check = await validateEmail(email);
    if (check === "invalid") {
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
        validationStatus: statusMap[check],
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
