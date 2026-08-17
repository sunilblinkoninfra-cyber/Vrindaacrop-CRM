import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ingestLead } from "@/lib/inbound/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Form-Secret",
};

export function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

/**
 * Website contact-form intake. The site posts JSON here. Protected by a shared
 * secret (INBOUND_FORM_SECRET) sent as the X-Form-Secret header or ?token=,
 * plus a honeypot field ("website") that real users never fill.
 */
export async function POST(req: NextRequest) {
  const secret = env.inbound.formSecret;
  if (secret) {
    const header = req.headers.get("x-form-secret");
    const token = req.nextUrl.searchParams.get("token");
    if (header !== secret && token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
  }

  // Honeypot: silently accept but drop obvious bots.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const email = str("email");
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400, headers: cors });
  }

  const result = await ingestLead({
    channel: "website_form",
    email,
    firstName: str("firstName") ?? str("name"),
    lastName: str("lastName"),
    company: str("company"),
    phone: str("phone"),
    sector: str("sector"),
    city: str("city"),
    sourceDetail: str("source") ?? str("page"),
    raw: body,
  });

  return NextResponse.json({ ok: result.status !== "error", ...result }, { headers: cors });
}
