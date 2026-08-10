// Canonicalization of messy sector / geography values from imported lead lists.
// Used by the import pipeline (new leads) and the backfill script (existing leads).

/** Title-case a free-text value (handles ALL CAPS and lower case). */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "and");
}

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export const CANONICAL_SECTORS = [
  "B&I",
  "Manufacturing",
  "Healthcare",
  "Education",
  "Corporate",
  "Industrial",
  "Retail",
  "Hospitality",
  "Residential",
];

const SECTOR_ALIASES: Record<string, string> = {
  "b&i": "B&I",
  "b & i": "B&I",
  bi: "B&I",
  "business & industry": "B&I",
  "business and industry": "B&I",
  mfg: "Manufacturing",
  manufacturing: "Manufacturing",
  factory: "Manufacturing",
  healthcare: "Healthcare",
  "health care": "Healthcare",
  hospital: "Healthcare",
  medical: "Healthcare",
  education: "Education",
  edu: "Education",
  school: "Education",
  college: "Education",
  university: "Education",
  corporate: "Corporate",
  corp: "Corporate",
  industrial: "Industrial",
  industry: "Industrial",
  retail: "Retail",
  hospitality: "Hospitality",
  hotel: "Hospitality",
  residential: "Residential",
};

/** Canonicalize a sector value. Unknown values are title-cased, not dropped. */
export function normalizeSector(raw?: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  return SECTOR_ALIASES[key] ?? titleCase(raw.trim());
}

// ---------------------------------------------------------------------------
// Geography — normalize city name + derive region
// ---------------------------------------------------------------------------

export const CANONICAL_REGIONS = [
  "NCR",
  "UP",
  "Uttarakhand",
  "Himachal Pradesh",
  "Rajasthan",
  "Punjab",
  "Haryana",
  "Madhya Pradesh",
  "Gujarat",
  "Jharkhand",
  "West Bengal",
  "Telangana",
  "Tamil Nadu",
  "Maharashtra",
  "pan-India",
  "Other",
];

// City → region lookup (lowercased city keys). Covers the values seen in the
// client's data; extend as new cities appear.
const CITY_REGION: Record<string, string> = {
  // NCR
  delhi: "NCR",
  "new delhi": "NCR",
  gurgaon: "NCR",
  gurugram: "NCR",
  noida: "NCR",
  "greater noida": "NCR",
  faridabad: "NCR",
  ghaziabad: "NCR",
  manesar: "NCR",
  sonipat: "NCR",
  bawal: "NCR",
  rewari: "NCR",
  binola: "NCR",
  hapur: "NCR",
  bahadurgarh: "NCR",
  ncr: "NCR",
  // UP
  lucknow: "UP",
  kanpur: "UP",
  meerut: "UP",
  moradabad: "UP",
  mathura: "UP",
  bareilly: "UP",
  etah: "UP",
  vrindavan: "UP",
  aligarh: "UP",
  agra: "UP",
  chaumuhan: "UP",
  jalalpur: "UP",
  hisar: "Haryana",
  up: "UP",
  // Uttarakhand
  dehradun: "Uttarakhand",
  haridwar: "Uttarakhand",
  roorkee: "Uttarakhand",
  pantnagar: "Uttarakhand",
  ghorakhal: "Uttarakhand",
  rudrapur: "Uttarakhand",
  kashipur: "Uttarakhand",
  // Himachal
  baddi: "Himachal Pradesh",
  solan: "Himachal Pradesh",
  una: "Himachal Pradesh",
  // Rajasthan
  jaipur: "Rajasthan",
  alwar: "Rajasthan",
  bhilwara: "Rajasthan",
  bhiwadi: "Rajasthan",
  neemrana: "Rajasthan",
  udaipur: "Rajasthan",
  pilani: "Rajasthan",
  kishangarh: "Rajasthan",
  // Punjab / Chandigarh
  mohali: "Punjab",
  ludhiana: "Punjab",
  "fatehgarh sahib": "Punjab",
  chandigarh: "Punjab",
  // Haryana (non-NCR)
  panipat: "Haryana",
  kurukshetra: "Haryana",
  karnal: "Haryana",
  ambala: "Haryana",
  rohtak: "Haryana",
  aurangpur: "Haryana",
  haryana: "Haryana",
  // Madhya Pradesh
  indore: "Madhya Pradesh",
  bhopal: "Madhya Pradesh",
  malanpur: "Madhya Pradesh",
  gwalior: "Madhya Pradesh",
  // Others
  ahmedabad: "Gujarat",
  jamshedpur: "Jharkhand",
  ranchi: "Jharkhand",
  rachi: "Jharkhand",
  kolkata: "West Bengal",
  hyderabad: "Telangana",
  chennai: "Tamil Nadu",
  "pan-india": "pan-India",
  panindia: "pan-India",
};

// Known misspelling → canonical city display name.
const CITY_ALIASES: Record<string, string> = {
  rachi: "Ranchi",
  gurugram: "Gurgaon",
};

/** Canonical city display name (title-cased, common misspellings fixed). */
export function normalizeCity(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  // Region tokens aren't cities.
  if (["ncr", "up", "pan-india", "panindia"].includes(key)) return null;
  return titleCase(trimmed);
}

/**
 * Derive a canonical region for a raw geography value (which may be a city or
 * already a region). Returns "Other" for unrecognized cities, null for empty.
 */
export function toRegion(raw?: string | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  if (CITY_REGION[key]) return CITY_REGION[key];
  // Already a canonical region?
  const match = CANONICAL_REGIONS.find((r) => r.toLowerCase() === key);
  if (match) return match;
  return "Other";
}
