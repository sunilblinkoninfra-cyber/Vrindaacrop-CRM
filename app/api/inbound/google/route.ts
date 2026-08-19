import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { mapGoogleLead } from "@/lib/inbound/google";
import { ingestLead } from "@/lib/inbound/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { rejectOversized, ingestInputSchema } from "@/lib/validation/inbound";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google Ads Lead Form webhook. Verified via the google_key configured in Ads. */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { bucket: "inbound-google", limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const oversized = rejectOversized(req);
  if (oversized) return oversized;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (env.inbound.googleLeadKey && body.google_key !== env.inbound.googleLeadKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mapped = mapGoogleLead(body);
  if (!mapped) {
    await prisma.inboundLeadLog.create({
      data: { channel: "google_ads", status: "invalid", payload: body, note: "No email in payload" },
    });
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // Validate the derived fields (Google's own payload shape isn't ours to
  // schema-check, but what we're about to write to the DB is).
  const parsed = ingestInputSchema.safeParse(mapped);
  if (!parsed.success) {
    await prisma.inboundLeadLog.create({
      data: { channel: "google_ads", status: "invalid", payload: body, note: "Failed field validation" },
    });
    return NextResponse.json({ error: "Invalid lead data" }, { status: 400 });
  }

  const result = await ingestLead({ ...mapped, ...parsed.data });
  return NextResponse.json({ ok: result.status !== "error", ...result });
}
