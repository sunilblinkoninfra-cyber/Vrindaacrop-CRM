import type { IngestInput } from "@/lib/inbound/ingest";

type GoogleColumn = { column_id?: string; column_name?: string; string_value?: string };

/**
 * Map a Google Ads Lead Form webhook payload to our ingest shape.
 * Google posts: { lead_id, campaign_id, user_column_data: [{column_id, string_value}], google_key }
 */
export function mapGoogleLead(body: {
  user_column_data?: GoogleColumn[];
  campaign_id?: string | number;
  lead_id?: string;
}): IngestInput | null {
  const cols = body.user_column_data ?? [];
  const get = (...ids: string[]) => {
    for (const c of cols) {
      const id = (c.column_id ?? c.column_name ?? "").toString().toLowerCase();
      if (ids.some((x) => id === x || id.includes(x))) return c.string_value;
    }
    return undefined;
  };
  const email = get("email");
  if (!email) return null;

  const fullName = get("full_name", "name");
  const [first, ...rest] = (fullName ?? "").split(" ");

  return {
    channel: "google_ads",
    email,
    firstName: get("first_name") ?? first,
    lastName: get("last_name") ?? (rest.length ? rest.join(" ") : undefined),
    company: get("company_name", "company"),
    phone: get("phone_number", "phone"),
    city: get("city"),
    sourceDetail: body.campaign_id ? `campaign:${body.campaign_id}` : undefined,
    raw: body,
  };
}
