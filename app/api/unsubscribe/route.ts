import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordEvent, suppressLead } from "@/lib/outreach/events";
import { EmailEventType, SuppressionReason } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function doUnsubscribe(leadId: string, enrollmentId?: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return false;
  await recordEvent({ leadId, enrollmentId, type: EmailEventType.UNSUBSCRIBED });
  await suppressLead(leadId, lead.email, SuppressionReason.UNSUBSCRIBE);
  await prisma.activity.create({
    data: { leadId, type: "note", message: "Lead unsubscribed (one-click opt-out)" },
  });
  return true;
}

const page = (msg: string) =>
  new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head>
     <body style="font-family:system-ui;max-width:480px;margin:80px auto;text-align:center;color:#334155">
     <h2 style="color:#0f766e">VrindaaCorp Services</h2><p>${msg}</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

// One-click opt-out. Supports GET (link) and POST (RFC 8058 List-Unsubscribe-Post).
export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const e = req.nextUrl.searchParams.get("e");
  if (!leadId) return page("Invalid unsubscribe link.");
  const ok = await doUnsubscribe(leadId, e);
  return page(ok ? "You have been unsubscribed and will not receive further emails." : "Link not recognized.");
}

export async function POST(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const e = req.nextUrl.searchParams.get("e");
  if (!leadId) return NextResponse.json({ ok: false }, { status: 400 });
  const ok = await doUnsubscribe(leadId, e);
  return NextResponse.json({ ok });
}
