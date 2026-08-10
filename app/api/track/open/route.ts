import { NextRequest, NextResponse } from "next/server";
import { recordEvent } from "@/lib/outreach/events";
import { EmailEventType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const enrollmentId = req.nextUrl.searchParams.get("e");
  if (leadId) {
    try {
      await recordEvent({ leadId, enrollmentId, type: EmailEventType.OPENED });
    } catch {
      // never fail a tracking pixel
    }
  }
  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  });
}
