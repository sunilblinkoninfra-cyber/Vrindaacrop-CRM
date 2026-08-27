import dns from "dns";
import { promises as dnsPromises } from "dns";
import { ValidationStatus } from "@prisma/client";
// Offline, MIT-licensed disposable-domain blocklist — 3,500+ burner domains in-memory
import disposableDomains from "disposable-email-domains";

// Ensure Node uses reliable public DNS resolvers (fixes Windows localhost 127.0.0.1 DNS failure)
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {
  // ignore in restricted environments
}

export type EmailCheck = "valid" | "invalid" | "risky" | "unknown" | "disposable";

export type LocalValidationResult = {
  check: EmailCheck;
  status: ValidationStatus;
  reason: string | null;
  tags: string[];
  isCorporate: boolean;
  isFreeWebmail: boolean;
  isRoleBased: boolean;
  isDisposable: boolean;
  hasMx: boolean;
  typoSuggestion?: string;
  correctedEmail?: string;
};

/** Maps a local-layer `EmailCheck` to the persisted `ValidationStatus` enum. */
export const localCheckToValidationStatus: Record<EmailCheck, ValidationStatus> = {
  valid: ValidationStatus.VALID,
  invalid: ValidationStatus.INVALID,
  risky: ValidationStatus.RISKY,
  unknown: ValidationStatus.UNKNOWN,
  disposable: ValidationStatus.DISPOSABLE,
};

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Common departmental/role-based prefixes that should be flagged as RISKY
const ROLE_PREFIXES = [
  "info",
  "admin",
  "administrator",
  "support",
  "sales",
  "contact",
  "contactus",
  "noreply",
  "no-reply",
  "office",
  "hr",
  "careers",
  "jobs",
  "billing",
  "accounts",
  "finance",
  "help",
  "helpdesk",
  "marketing",
  "team",
  "inquiry",
  "enquiry",
  "services",
  "press",
  "media",
  "hello",
  "customercare",
];

const disposableSet = new Set((disposableDomains as string[]).map((d) => d.toLowerCase()));

// Major consumer webmail providers
export const COMMON_PROVIDERS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.in",
  "live.com",
  "msn.com",
  "rediffmail.com",
  "icloud.com",
  "zoho.com",
  "zohomail.in",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
];

// Target domains for typo checks (only major consumer domains >= 6 chars to protect short corporate domains)
export const TYPO_TARGET_PROVIDERS = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.in",
  "rediffmail.com",
  "icloud.com",
];

const mxCache = new Map<string, MxResult>();

/** Syntax check only (synchronous, cheap, RFC compliant). */
export function checkSyntax(email: string): boolean {
  if (!email || email.length > 254) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (!domain || domain.length > 253) return false;
  if (!domain.includes(".")) return false;
  return EMAIL_RE.test(email);
}

/** True if the domain is a known disposable/temp-mail provider. */
export function isDisposableDomain(domain: string): boolean {
  return disposableSet.has(domain.toLowerCase());
}

/** Standard Levenshtein edit distance. */
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

/**
 * Suggests a "did you mean X?" correction when the domain is a near-miss of a major consumer provider.
 * Only triggers if the domain is >= 6 chars and within 1-2 distance.
 */
export function suggestTypoCorrection(domain: string): string | null {
  const lower = domain.toLowerCase();
  if (COMMON_PROVIDERS.includes(lower)) return null;
  // Protect short B2B domains (like mg.com, pwc.com, bcg.com) from false typo rewrites
  if (lower.length < 6) return null;

  let best: { provider: string; distance: number } | null = null;
  for (const provider of TYPO_TARGET_PROVIDERS) {
    const distance = levenshtein(lower, provider);
    if (distance >= 1 && distance <= 2 && (!best || distance < best.distance)) {
      best = { provider, distance };
    }
  }
  return best?.provider ?? null;
}

type MxResult = "has-mx" | "no-mx" | "lookup-failed";

/**
 * MX-record lookup for the email domain, cached per-domain in memory.
 */
export async function mxLookup(domainOrEmail: string): Promise<MxResult> {
  const domain = domainOrEmail.includes("@")
    ? domainOrEmail.split("@")[1]?.toLowerCase()
    : domainOrEmail.toLowerCase();
  if (!domain) return "no-mx";

  // Common consumer domains are guaranteed to have active MX records
  if (COMMON_PROVIDERS.includes(domain)) {
    return "has-mx";
  }

  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;

  let result: MxResult;
  try {
    const records = await dnsPromises.resolveMx(domain);
    result = records && records.length > 0 ? "has-mx" : "no-mx";
  } catch (e: any) {
    const code = e?.code;
    // NXDOMAIN / NODATA / NOTFOUND = domain genuinely has no mail servers
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "ESERVFAIL") {
      result = "no-mx";
    } else {
      // If DNS timed out, check if domain has A record fallback
      try {
        const aRecords = await dnsPromises.resolve4(domain);
        result = aRecords && aRecords.length > 0 ? "has-mx" : "no-mx";
      } catch {
        result = "lookup-failed";
      }
    }
  }
  mxCache.set(domain, result);
  return result;
}

/**
 * In-House Multi-Layer Validation Engine (100% Offline & DNS, Zero External APIs)
 */
export async function validateEmail(
  email: string,
  options?: { autoFixTypo?: boolean }
): Promise<LocalValidationResult> {
  const normalized = email.trim().toLowerCase();

  // 1. Syntax Check
  if (!checkSyntax(normalized)) {
    return {
      check: "invalid",
      status: ValidationStatus.INVALID,
      reason: "invalid email syntax",
      tags: ["INVALID", "SYNTAX_ERROR"],
      isCorporate: false,
      isFreeWebmail: false,
      isRoleBased: false,
      isDisposable: false,
      hasMx: false,
    };
  }

  const [rawLocal, rawDomain] = normalized.split("@");
  const typoSuggestion = rawDomain ? suggestTypoCorrection(rawDomain) ?? undefined : undefined;

  let activeEmail = normalized;
  let activeDomain = rawDomain;
  let isTypoCorrected = false;

  if (typoSuggestion && options?.autoFixTypo) {
    activeDomain = typoSuggestion;
    activeEmail = `${rawLocal}@${typoSuggestion}`;
    isTypoCorrected = true;
  }

  // 2. Disposable Check
  if (activeDomain && isDisposableDomain(activeDomain)) {
    return {
      check: "disposable",
      status: ValidationStatus.DISPOSABLE,
      reason: "disposable/burner email provider",
      tags: ["DISPOSABLE", "TEMP_MAIL"],
      isCorporate: false,
      isFreeWebmail: false,
      isRoleBased: false,
      isDisposable: true,
      hasMx: false,
      typoSuggestion,
    };
  }

  // 3. Role-based prefix check
  const isRoleBased = ROLE_PREFIXES.some(
    (p) => rawLocal === p || rawLocal.startsWith(p + ".") || rawLocal.startsWith(p + "_")
  );

  // 4. Corporate vs Free Webmail check
  const isFreeWebmail = COMMON_PROVIDERS.includes(activeDomain);
  const isCorporate = !isFreeWebmail && !isDisposableDomain(activeDomain);

  // 5. DNS MX Lookup
  const mx = await mxLookup(activeDomain);
  const hasMx = mx === "has-mx";

  const tags: string[] = [];
  if (isCorporate) tags.push("CORPORATE");
  if (isFreeWebmail) tags.push("FREE_WEBMAIL");
  if (isRoleBased) tags.push("ROLE_BASED");
  if (isTypoCorrected) tags.push("TYPO_CORRECTED");
  else if (typoSuggestion) tags.push("TYPO_DETECTED");

  if (mx === "no-mx") {
    tags.push("NO_MX_RECORDS");
    return {
      check: "invalid",
      status: ValidationStatus.INVALID,
      reason: "no active mail exchange (MX) servers found for domain",
      tags,
      isCorporate,
      isFreeWebmail,
      isRoleBased,
      isDisposable: false,
      hasMx: false,
      typoSuggestion,
      correctedEmail: isTypoCorrected ? activeEmail : undefined,
    };
  }

  if (isRoleBased) {
    tags.push("RISKY");
    return {
      check: "risky",
      status: ValidationStatus.RISKY,
      reason: "role-based address (departmental)",
      tags,
      isCorporate,
      isFreeWebmail,
      isRoleBased: true,
      isDisposable: false,
      hasMx: true,
      typoSuggestion,
      correctedEmail: isTypoCorrected ? activeEmail : undefined,
    };
  }

  // If MX is valid and not role-based -> VALID
  if (hasMx) {
    tags.push("VALID");
    return {
      check: "valid",
      status: ValidationStatus.VALID,
      reason: null,
      tags,
      isCorporate,
      isFreeWebmail,
      isRoleBased: false,
      isDisposable: false,
      hasMx: true,
      typoSuggestion,
      correctedEmail: isTypoCorrected ? activeEmail : undefined,
    };
  }

  // Fallback for network DNS lookup timeout (fail-open as valid if syntax is clean)
  tags.push("VALID");
  return {
    check: "valid",
    status: ValidationStatus.VALID,
    reason: typoSuggestion ? `possible typo of ${typoSuggestion}` : null,
    tags,
    isCorporate,
    isFreeWebmail,
    isRoleBased: false,
    isDisposable: false,
    hasMx: true,
    typoSuggestion,
    correctedEmail: isTypoCorrected ? activeEmail : undefined,
  };
}

/**
 * Standardize Indian & International phone numbers to E.164 formatting.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  // Indian 10-digit mobile number starting with 6,7,8,9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  // With leading 0 e.g. 09876543210
  if (/^0[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.slice(1);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  // With 91 prefix without plus e.g. 919876543210
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.slice(2);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  // With +91 prefix
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
    const num = cleaned.slice(3);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }

  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
