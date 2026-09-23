import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import {
  getOwnerStrategicMemory,
  saveDirective,
  deleteDirective,
  DirectiveCategory,
} from "@/lib/ai/strategic-memory";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user || !isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Owner or Admin access required." }, { status: 403 });
    }

    const memory = await getOwnerStrategicMemory();
    return NextResponse.json({ ok: true, memory });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || !isOwnerOrAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden: Owner or Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || "save";

    if (action === "save") {
      const category = (body.category || "standing_rule") as DirectiveCategory;
      const content = String(body.content || "").trim();
      const existingId = body.id ? String(body.id) : undefined;

      if (!content) {
        return NextResponse.json({ error: "Directive content cannot be empty." }, { status: 400 });
      }

      const updated = await saveDirective(category, content, "owner_explicit", existingId);
      return NextResponse.json({ ok: true, memory: updated });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) {
        return NextResponse.json({ error: "Missing directive id to delete." }, { status: 400 });
      }

      const updated = await deleteDirective(id);
      return NextResponse.json({ ok: true, memory: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
