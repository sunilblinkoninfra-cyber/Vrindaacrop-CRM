import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Hard cap on request body size for public inbound endpoints (bytes). */
export const MAX_BODY_BYTES = 65_536; // 64KB — generous for a contact form/webhook payload

/**
 * Reject oversized request bodies before we ever call req.json()/req.text().
 * Checks Content-Length first (cheap), then re-checks the actual byte length
 * after reading (Content-Length can be missing or spoofed).
 */
export function rejectOversized(req: NextRequest, maxBytes = MAX_BODY_BYTES): NextResponse | null {
  const len = req.headers.get("content-length");
  if (len && Number(len) > maxBytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  return null;
}

export function rejectOversizedText(text: string, maxBytes = MAX_BODY_BYTES): NextResponse | null {
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  return null;
}

// Shared field limits — generous enough for real data, tight enough to stop abuse.
// Empty string collapses to undefined so "" and omitted behave the same.
const shortStr = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

/** Website contact-form submission body. */
export const websiteFormSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: shortStr(100),
  lastName: shortStr(100),
  name: shortStr(150), // fallback for firstName
  company: shortStr(200),
  phone: shortStr(30),
  sector: shortStr(100),
  city: shortStr(100),
  source: shortStr(200),
  page: shortStr(300),
  website: shortStr(200), // honeypot field
});

/**
 * Validated shape of what we pass to ingestLead, regardless of channel. Applied
 * after channel-specific mapping (meta/google) so malformed upstream payloads
 * can't push oversized or malformed values into the DB.
 */
export const ingestInputSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: shortStr(100),
  lastName: shortStr(100),
  company: shortStr(200),
  phone: shortStr(30),
  sector: shortStr(100),
  city: shortStr(100),
  sourceDetail: shortStr(300),
});

export type ValidatedIngestFields = z.infer<typeof ingestInputSchema>;
