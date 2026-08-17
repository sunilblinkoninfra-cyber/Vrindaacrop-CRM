import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { mapGoogleLead } from "@/lib/inbound/google";
import { ingestLead } from "@/lib/inbound/ingest";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google Ads Lead Form webhook. Verified via the google_key configured in Ads. */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (env.inbound.googleLeadKey && body.google_key !== env.inbound.googleLeadKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const input = mapGoogleLead(body);
  if (!input) {
    await prisma.inboundLeadLog.create({
      data: { channel: "google_ads", status: "invalid", payload: body, note: "No email in payload" },
    });
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const result = await ingestLead(input);
  return NextResponse.json({ ok: result.status !== "error", ...result });
}
