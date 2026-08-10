import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseFile, guessMapping } from "@/lib/import/parse";
import { maybeFlatten } from "@/lib/import/flatten";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseFile(file.name, buffer);
    // Account-centric sheets (multiple embedded contacts) are flattened to
    // one row per contact before staging.
    parsed = maybeFlatten(parsed);
  } catch {
    return NextResponse.json({ error: "Could not parse file. Use CSV or XLSX." }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "File has no data rows with a contact email." }, { status: 400 });
  }

  const mapping = guessMapping(parsed.columns);

  const batch = await prisma.importBatch.create({
    data: {
      filename: file.name,
      status: "MAPPED",
      totalRows: parsed.rows.length,
      columnMapping: mapping,
      rows: {
        create: parsed.rows.map((raw) => ({ raw })),
      },
    },
  });

  return NextResponse.json({
    batchId: batch.id,
    columns: parsed.columns,
    mapping,
    totalRows: parsed.rows.length,
    preview: parsed.rows.slice(0, 5),
  });
}
