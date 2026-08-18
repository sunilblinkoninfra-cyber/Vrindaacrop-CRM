import { NextRequest, NextResponse } from "next/server";
import { recordEvent } from "@/lib/outreach/events";
import { verify } from "@/lib/hmac";
import { EmailEventType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Click-tracking redirect. The `url` query param must be HMAC-signed at email
 * render time (see lib/email/render.ts), so this endpoint cannot be used as an
 * open-redirect: only URLs we actually put in an outbound email will redirect.
 * Unsigned or invalid-signature requests still log the click (best-effort) but
 * redirect to the app root instead of the attacker-controlled target.
 */
export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead");
  const enrollmentId = req.nextUrl.searchParams.get("e");
  const target = req.nextUrl.searchParams.get("url");
  const sig = req.nextUrl.searchParams.get("sig");

  // Default destination is the app root (absolute URL — NextResponse.redirect
  // requires it in Node runtime).
  const root = new URL("/", req.url).toString();
  let dest = root;
  let verified = false;
  if (leadId && target && sig) {
    try {
      const decoded = decodeURIComponent(target);
      const payload = `${leadId}|${enrollmentId ?? ""}|${decoded}`;
      if (verify(payload, sig)) {
        const u = new URL(decoded);
        if (u.protocol === "http:" || u.protocol === "https:") {
          dest = decoded;
          verified = true;
        }
      }
    } catch {
      // fall through to the app root
    }
  }

  if (leadId) {
    try {
      await recordEvent({
        leadId,
        enrollmentId,
        type: EmailEventType.CLICKED,
        metadata: verified ? { url: dest } : { rejected: true },
      });
    } catch {
      // never fail a tracking hit
    }
  }

  return NextResponse.redirect(dest, 302);
}
