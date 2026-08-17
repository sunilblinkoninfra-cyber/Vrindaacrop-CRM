import crypto from "crypto";
import { env } from "@/lib/env";
import type { IngestInput } from "@/lib/inbound/ingest";

/** Verify the X-Hub-Signature-256 header Meta sends on webhook POSTs. */
export function verifyMetaSignature(rawBody: string, signature: string | null): boolean {
  if (!env.inbound.metaAppSecret) return true; // not configured → skip (dev)
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", env.inbound.metaAppSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

type MetaFieldDatum = { name: string; values: string[] };

/**
 * Given a leadgen_id from the webhook, fetch the full lead from the Graph API
 * and map Meta's field_data to our ingest shape. Requires META_PAGE_TOKEN.
 */
export async function fetchMetaLead(
  leadgenId: string,
  sourceDetail?: string
): Promise<IngestInput | null> {
  if (!env.inbound.metaPageToken) return null;
  const url = `https://graph.facebook.com/v20.0/${leadgenId}?access_token=${encodeURIComponent(
    env.inbound.metaPageToken
  )}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { field_data?: MetaFieldDatum[] };
  const fields = data.field_data ?? [];
  const get = (...names: string[]) => {
    for (const f of fields) {
      const n = f.name.toLowerCase();
      if (names.some((x) => n === x || n.includes(x))) return f.values?.[0];
    }
    return undefined;
  };
  const email = get("email");
  if (!email) return null;

  const fullName = get("full_name", "name");
  const [first, ...rest] = (fullName ?? "").split(" ");

  return {
    channel: "meta_ads",
    email,
    firstName: get("first_name") ?? first,
    lastName: get("last_name") ?? (rest.length ? rest.join(" ") : undefined),
    company: get("company", "company_name", "organization"),
    phone: get("phone_number", "phone"),
    city: get("city"),
    sourceDetail: sourceDetail ?? get("campaign_name", "ad_name"),
    raw: data,
  };
}
