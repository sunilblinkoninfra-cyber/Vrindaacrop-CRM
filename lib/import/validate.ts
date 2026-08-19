import { promises as dns } from "dns";
import { env } from "@/lib/env";
import { ValidationStatus } from "@prisma/client";
// Offline, MIT-licensed disposable-domain blocklist — no per-check network call.
import disposableDomains from "disposable-email-domains";

export type EmailCheck = "valid" | "invalid" | "risky" | "unknown" | "disposable";

export type LocalValidationResult = {
  check: EmailCheck;
  reason: string | null;
  typoSuggestion?: string;
};

/** Maps a local-layer `EmailCheck` to the persisted `ValidationStatus` enum. Shared
 *  by every caller (bulk import, inbound capture) so there's one source of truth. */
export const localCheckToValidationStatus: Record<EmailCheck, ValidationStatus> = {
  valid: ValidationStatus.VALID,
  invalid: ValidationStatus.INVALID,
  risky: ValidationStatus.RISKY,
  unknown: ValidationStatus.UNKNOWN,
  disposable: ValidationStatus.DISPOSABLE,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common disposable/role-based hints → mark risky.
const ROLE_PREFIXES = ["info", "admin", "support", "sales", "contact", "noreply", "no-reply", "office"];

const disposableSet = new Set((disposableDomains as string[]).map((d) => d.toLowerCase()));

const COMMON_PROVIDERS = [
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "rediffmail.com",
  "icloud.com",
  "yahoo.co.in",
  "hotmail.co.in",
];

const mxCache = new Map<string, MxResult>();

/** Syntax check only (synchronous, cheap). */
export function checkSyntax(email: string): boolean {
  return EMAIL_RE.test(email);
}

/** True if the domain is a known disposable/temp-mail provider. */
export function isDisposableDomain(domain: string): boolean {
  return disposableSet.has(domain.toLowerCase());
}

/** Standard Levenshtein edit distance (small DP, no dependency needed). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Suggests a "did you mean X?" correction when the domain is a near-miss of a
 *  common provider (edit distance 1-2). Returns null when no close match exists
 *  or the domain already *is* a common provider. */
export function suggestTypoCorrection(domain: string): string | null {
  const lower = domain.toLowerCase();
  if (COMMON_PROVIDERS.includes(lower)) return null;
  let best: { provider: string; distance: number } | null = null;
  for (const provider of COMMON_PROVIDERS) {
    const distance = levenshtein(lower, provider);
    if (distance >= 1 && distance <= 2 && (!best || distance < best.distance)) {
      best = { provider, distance };
    }
  }
  return best?.provider ?? null;
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
 * Local-layer validation (synchronous, no per-check network call beyond DNS
 * MX lookup). Only a syntax failure is a hard "invalid". Disposable domains
 * and no-MX domains are flagged but still imported — exclusion from actual
 * sending is enforced later (segment filtering / sender guard), not here. If
 * DNS can't be reached we fail open. An external verifier, when configured,
 * is authoritative and short-circuits everything below it.
 */
export async function validateEmail(email: string): Promise<LocalValidationResult> {
  const normalized = email.trim().toLowerCase();
  if (!checkSyntax(normalized)) {
    return { check: "invalid", reason: "invalid email syntax" };
  }

  if (env.verifier.provider !== "none" && env.verifier.apiKey) {
    const external = await externalVerify(normalized);
    if (external) return { check: external, reason: `external verifier: ${external}` };
  }

  const [localPart, domain] = normalized.split("@");

  if (domain && isDisposableDomain(domain)) {
    return { check: "disposable", reason: "disposable email domain" };
  }

  const roleBased = ROLE_PREFIXES.some((p) => localPart === p || localPart.startsWith(p + "."));
  if (roleBased) {
    return { check: "risky", reason: "role-based address" };
  }

  const typoSuggestion = domain ? suggestTypoCorrection(domain) ?? undefined : undefined;

  const mx = await mxLookup(normalized);
  if (mx === "no-mx") {
    return { check: "risky", reason: "no MX records", typoSuggestion };
  }
  // has-mx or lookup-failed → syntax-clean and not disqualified.
  return {
    check: "unknown",
    reason: typoSuggestion ? `possible typo of ${typoSuggestion}` : null,
    typoSuggestion,
  };
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
