import { NextRequest, NextResponse } from "next/server";
import { recordEvent } from "@/lib/outreach/events";
import { EmailEventType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const enrollmentId = req.nextUrl.searchParams.get("e");
  const target = req.nextUrl.searchParams.get("url");

  if (leadId) {
    try {
      await recordEvent({
        leadId,
        enrollmentId,
        type: EmailEventType.CLICKED,
        metadata: target ? { url: decodeURIComponent(target) } : undefined,
      });
    } catch {
      // ignore
    }
  }

  // Redirect to the original URL (validate it's http(s)).
  let dest = "/";
  if (target) {
    try {
      const decoded = decodeURIComponent(target);
      const u = new URL(decoded);
      if (u.protocol === "http:" || u.protocol === "https:") dest = decoded;
    } catch {
      // fall through to home
    }
  }
  return NextResponse.redirect(dest, 302);
}
