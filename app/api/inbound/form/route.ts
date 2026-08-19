import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { ingestLead } from "@/lib/inbound/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { rejectOversized, websiteFormSchema } from "@/lib/validation/inbound";

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
  const limited = rateLimit(req, { bucket: "inbound-form", limit: 20, windowSeconds: 60 });
  if (limited) return limited;

  const oversized = rejectOversized(req);
  if (oversized) return oversized;

  const secret = env.inbound.formSecret;
  if (secret) {
    const header = req.headers.get("x-form-secret");
    const token = req.nextUrl.searchParams.get("token");
    if (header !== secret && token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors });
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
  }

  const parsed = websiteFormSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400, headers: cors }
    );
  }
  const body = parsed.data;

  // Honeypot: silently accept but drop obvious bots.
  if (body.website) {
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const result = await ingestLead({
    channel: "website_form",
    email: body.email,
    firstName: body.firstName ?? body.name,
    lastName: body.lastName,
    company: body.company,
    phone: body.phone,
    sector: body.sector,
    city: body.city,
    sourceDetail: body.source ?? body.page,
    raw: rawBody,
  });

  return NextResponse.json({ ok: result.status !== "error", ...result }, { headers: cors });
}
