import { NextRequest, NextResponse } from "next/server";
import { processImportBatch } from "@/lib/import/process";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUser();
    if (!isOwnerOrAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await processImportBatch(params.id, {
      autoFixTypo: body.autoFixTypo ?? true,
      skipDisposable: body.skipDisposable ?? false,
      skipInvalid: body.skipInvalid ?? true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
