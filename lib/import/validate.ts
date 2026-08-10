import { promises as dns } from "dns";
import { env } from "@/lib/env";

export type EmailCheck = "valid" | "invalid" | "risky" | "unknown";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common disposable/role-based hints → mark risky.
const ROLE_PREFIXES = ["info", "admin", "support", "sales", "contact", "noreply", "no-reply", "office"];

const mxCache = new Map<string, MxResult>();

/** Syntax check only (synchronous, cheap). */
export function checkSyntax(email: string): boolean {
  return EMAIL_RE.test(email);
}

type MxResult = "has-mx" | "no-mx" | "lookup-failed";

/**
 * MX-record lookup for the email domain, cached per-domain. Distinguishes a
 * definitive "no MX" (domain resolves but has no mail servers) from a network
 * "lookup-failed" (DNS unreachable) so we never hard-reject a lead just because
 * DNS was unavailable at import time.
 */
export async function mxLookup(email: string): Promise<MxResult> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return "no-mx";
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let result: MxResult;
  try {
    const records = await dns.resolveMx(domain);
    result = records.length > 0 ? "has-mx" : "no-mx";
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // NXDOMAIN / NODATA = domain genuinely has no mail; anything else = network.
    result = code === "ENOTFOUND" || code === "ENODATA" ? "no-mx" : "lookup-failed";
  }
  mxCache.set(domain, result);
  return result;
}

/**
 * Validate an email. Only a syntax failure is a hard "invalid". A domain that
 * definitively has no MX is "risky" (still imported, flagged). If DNS can't be
 * reached we fail open. An external verifier, when configured, is authoritative.
 */
export async function validateEmail(email: string): Promise<EmailCheck> {
  const normalized = email.trim().toLowerCase();
  if (!checkSyntax(normalized)) return "invalid";

  if (env.verifier.provider !== "none" && env.verifier.apiKey) {
    const external = await externalVerify(normalized);
    if (external) return external;
  }

  const localPart = normalized.split("@")[0];
  const roleBased = ROLE_PREFIXES.some((p) => localPart === p || localPart.startsWith(p + "."));
  if (roleBased) return "risky";

  const mx = await mxLookup(normalized);
  if (mx === "no-mx") return "risky"; // resolves but no mail servers
  // has-mx or lookup-failed → syntax-clean and not disqualified.
  return "unknown";
}

async function externalVerify(email: string): Promise<EmailCheck | null> {
  try {
    if (env.verifier.provider === "neverbounce") {
      const url = `https://api.neverbounce.com/v4/single/check?key=${encodeURIComponent(
        env.verifier.apiKey
      )}&email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      const data = (await res.json()) as { result?: string };
      switch (data.result) {
        case "valid":
          return "valid";
        case "invalid":
          return "invalid";
        case "catchall":
        case "unknown":
          return "risky";
        case "disposable":
          return "risky";
        default:
          return null;
      }
    }
    if (env.verifier.provider === "zerobounce") {
      const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(
        env.verifier.apiKey
      )}&email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      const data = (await res.json()) as { status?: string };
      switch (data.status) {
        case "valid":
          return "valid";
        case "invalid":
          return "invalid";
        case "catch-all":
        case "unknown":
        case "do_not_mail":
          return "risky";
        default:
          return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}
