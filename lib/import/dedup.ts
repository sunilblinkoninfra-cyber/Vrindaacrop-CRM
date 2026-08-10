import { normalizeEmail } from "@/lib/utils";

/** Normalize a company name for fuzzy comparison (drop suffixes/punctuation). */
export function normalizeCompany(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|co|company|services|solutions)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** A row is a duplicate of another if the normalized email matches exactly. */
export function emailKey(email: string): string {
  return normalizeEmail(email);
}

/**
 * Given a list of candidate emails, returns the set of emails that are
 * duplicated within the batch (appear more than once).
 */
export function findInBatchDuplicates(emails: string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const e of emails) {
    const k = emailKey(e);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [k, n] of seen) if (n > 1) dupes.add(k);
  return dupes;
}
