/**
 * CLI bulk importer — for large lead files (5–10k rows) where an HTTP upload
 * would time out. Parses a CSV/XLSX, flattens account-centric sheets into
 * contact rows, then runs the same dedup/validate/import pipeline as the UI.
 *
 * Usage: npx tsx scripts/import-file.ts "C:/path/to/leads.xlsx"
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { basename } from "path";
import { prisma } from "@/lib/prisma";
import { parseFile, guessMapping } from "@/lib/import/parse";
import { maybeFlatten } from "@/lib/import/flatten";
import { processImportBatch } from "@/lib/import/process";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx scripts/import-file.ts "<path-to-file>"');
    process.exit(1);
  }

  const buffer = readFileSync(path);
  let parsed = parseFile(basename(path), buffer);
  const before = parsed.rows.length;
  parsed = maybeFlatten(parsed);
  const flattened = parsed.rows.length;
  const mapping = guessMapping(parsed.columns);

  console.log(`Parsed ${before} rows → ${flattened} contact rows after flatten.`);
  console.log("Column mapping:", mapping);
  if (!mapping.email) {
    console.error("Could not auto-detect an email column. Aborting.");
    process.exit(1);
  }

  const batch = await prisma.importBatch.create({
    data: {
      filename: basename(path),
      status: "MAPPED",
      totalRows: parsed.rows.length,
      columnMapping: mapping,
      rows: { create: parsed.rows.map((raw) => ({ raw })) },
    },
  });

  console.log(`Staged batch ${batch.id}. Processing…`);
  const result = await processImportBatch(batch.id);
  console.log("Done:", result);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
