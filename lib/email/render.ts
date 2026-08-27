import { env } from "@/lib/env";
import { fullName } from "@/lib/utils";
import { sign } from "@/lib/hmac";

export type RenderLead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  sector?: string | null;
  city?: string | null;
  geography?: string | null;
  email: string;
};

export const INDUSTRY_HOOKS: Record<string, string> = {
  Healthcare: "specialized hospital dietary catering, clinical patient nutrition, and 24/7 staff cafeteria operations",
  Corporate: "modern corporate cafeteria management, live chef stations, executive pantries, and daily staff lunch subscriptions",
  Manufacturing: "industrial plant workforce dining, 24/7 shift meals, high-volume hygiene standards, and subsidized meal management",
  Education: "institutional student dining, campus food court management, and nutritional meal planning",
  Industrial: "heavy industrial site mess operations, safety-compliant food handling, and remote plant dining services",
  Hospitality: "hotel back-of-house staff meals, event catering support, and luxury hospitality dining",
  Retail: "mall staff pantries, retail outlet cafeteria management, and scheduled food deliveries",
  Residential: "society clubhouse dining, resident pantry services, and event banqueting",
  "B&I": "business and industry facility dining, multi-tenant cafeteria hubs, and facility catering solutions",
};

export function getIndustryHook(sector?: string | null): string {
  if (!sector) return "corporate catering, institutional cafeteria, and executive pantry management";
  return INDUSTRY_HOOKS[sector] || `${sector.toLowerCase()} facility catering and dietary management`;
}

/** Replace personalization tokens in subject/body. */
export function applyTokens(text: string, lead: RenderLead): string {
  const sector = lead.sector || "your industry";
  const tokens: Record<string, string> = {
    firstName: lead.firstName ?? "there",
    lastName: lead.lastName ?? "",
    fullName: fullName(lead.firstName, lead.lastName) || "there",
    company: lead.company ?? "your organization",
    sector: sector,
    industry: sector,
    industryHook: getIndustryHook(lead.sector),
    city: lead.city || lead.geography || "your location",
    geography: lead.geography || lead.city || "your region",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => tokens[key] ?? "");
}

/** Pick subject A/B variant deterministically per lead+step for stable A/B testing. */
export function pickSubject(
  subjectA: string,
  subjectB: string | null | undefined,
  seed: string
): { subject: string; variant: "A" | "B" } {
  if (!subjectB) return { subject: subjectA, variant: "A" };
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? { subject: subjectA, variant: "A" } : { subject: subjectB, variant: "B" };
}

/**
 * Inject tracking into an HTML email:
 *  - rewrite <a href> through the click-redirect endpoint
 *  - append a 1x1 open pixel
 *  - append an unsubscribe footer ({{unsubscribe}} token or auto-appended)
 */
export function injectTracking(html: string, opts: { leadId: string; enrollmentId?: string }): string {
  const base = env.appUrl.replace(/\/$/, "");
  const q = (extra: Record<string, string>) =>
    new URLSearchParams({ lead: opts.leadId, ...(opts.enrollmentId ? { e: opts.enrollmentId } : {}), ...extra }).toString();

  // Rewrite links (skip mailto/unsubscribe/anchor links). Each rewritten URL is
  // HMAC-signed so /api/track/click cannot be abused as an open-redirect —
  // attackers with a valid lead+enrollment id can't craft a redirect to a URL
  // we didn't originally send.
  let out = html.replace(/href\s*=\s*"([^"]+)"/gi, (m, url: string) => {
    if (/^(mailto:|#|\{\{)/i.test(url) || url.includes("/api/unsubscribe")) return m;
    const encoded = encodeURIComponent(url);
    const sig = sign(`${opts.leadId}|${opts.enrollmentId ?? ""}|${url}`);
    const redirect = `${base}/api/track/click?${q({ url: encoded, sig })}`;
    return `href="${redirect}"`;
  });

  const unsubUrl = `${base}/api/unsubscribe?${q({})}`;
  // Replace {{unsubscribe}} token if present, else append footer.
  if (out.includes("{{unsubscribe}}")) {
    out = out.replace(/\{\{\s*unsubscribe\s*\}\}/g, unsubUrl);
  } else {
    out += `<p style="font-size:11px;color:#94a3b8;margin-top:24px">If you'd prefer not to receive these emails, <a href="${unsubUrl}">unsubscribe here</a>.</p>`;
  }

  const pixel = `<img src="${base}/api/track/open?${q({})}" width="1" height="1" alt="" style="display:none" />`;
  out += pixel;
  return out;
}

export function unsubscribeUrl(leadId: string): string {
  const base = env.appUrl.replace(/\/$/, "");
  return `${base}/api/unsubscribe?lead=${leadId}`;
}
