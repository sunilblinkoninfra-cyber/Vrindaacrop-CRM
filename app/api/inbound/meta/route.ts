import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyMetaSignature, fetchMetaLead } from "@/lib/inbound/meta";
import { ingestLead } from "@/lib/inbound/ingest";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meta webhook verification handshake (GET). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  if (mode === "subscribe" && token && token === env.inbound.metaVerifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/** Meta Lead Ads webhook (POST): a leadgen_id per new lead → Graph API fetch. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 403 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changes: { leadgenId: string; formId?: string }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (v.leadgen_id) changes.push({ leadgenId: String(v.leadgen_id), formId: v.form_id });
    }
  }

  let created = 0;
  for (const c of changes) {
    try {
      const input = await fetchMetaLead(c.leadgenId, c.formId);
      if (input) {
        const r = await ingestLead(input);
        if (r.status === "created") created++;
      } else {
        await prisma.inboundLeadLog.create({
          data: { channel: "meta_ads", status: "error", payload: c as object, note: "Graph fetch failed / no email" },
        });
      }
    } catch (e) {
      await prisma.inboundLeadLog.create({
        data: { channel: "meta_ads", status: "error", payload: c as object, note: (e as Error).message },
      });
    }
  }

  // Always 200 so Meta doesn't retry endlessly.
  return NextResponse.json({ ok: true, received: changes.length, created });
}
