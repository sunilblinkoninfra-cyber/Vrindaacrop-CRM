import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseFile, guessMapping } from "@/lib/import/parse";
import { maybeFlatten } from "@/lib/import/flatten";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Only Business Owner or Admin can import lead sheets." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized: Please log in again." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided in the upload request." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed;
    try {
      parsed = parseFile(file.name, buffer);
      // Account-centric sheets (multiple embedded contacts) are flattened to
      // one row per contact before staging.
      parsed = maybeFlatten(parsed);
    } catch (err: any) {
      console.error("[Upload file parse error]:", err);
      return NextResponse.json({ error: `Could not parse spreadsheet: ${err?.message || "Invalid CSV/XLSX file format."}` }, { status: 400 });
    }

    if (!parsed.rows.length) {
      return NextResponse.json({ error: "File has no data rows with a contact email. Please verify your sheet headers." }, { status: 400 });
    }

    const mapping = guessMapping(parsed.columns);

    // 1. Create the parent batch record first
    const batch = await prisma.importBatch.create({
      data: {
        filename: file.name,
        status: "MAPPED",
        totalRows: parsed.rows.length,
        columnMapping: mapping,
      },
    });

    // 2. Batch insert the ImportRow records in safe chunks of 500 to avoid parameter limit/memory exhaustion
    const CHUNK_SIZE = 500;
    for (let i = 0; i < parsed.rows.length; i += CHUNK_SIZE) {
      const chunk = parsed.rows.slice(i, i + CHUNK_SIZE);
      await prisma.importRow.createMany({
        data: chunk.map((raw) => ({
          batchId: batch.id,
          raw,
          status: "pending",
        })),
      });
    }

    return NextResponse.json({
      batchId: batch.id,
      columns: parsed.columns,
      mapping,
      totalRows: parsed.rows.length,
      preview: parsed.rows.slice(0, 5),
    });
  } catch (err: any) {
    console.error("[Upload unhandled error]:", err);
    return NextResponse.json(
      { error: err?.message || "An unexpected server error occurred while processing the spreadsheet." },
      { status: 500 }
    );
  }
}
