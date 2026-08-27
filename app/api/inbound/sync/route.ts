import { NextResponse } from "next/server";
import { syncImapReplies } from "@/lib/inbound/imap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncImapReplies({ sinceDays: 7, maxMessages: 50 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await syncImapReplies({ sinceDays: 7, maxMessages: 50 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Sync failed" }, { status: 500 });
  }
}
