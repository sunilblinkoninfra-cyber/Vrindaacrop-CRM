import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedFile = {
  columns: string[];
  rows: Record<string, string>[];
};

/** Parse a CSV or Excel file buffer into columns + row objects keyed by header. */
export function parseFile(filename: string, buffer: Buffer): ParsedFile {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseExcel(buffer);
  }
  return parseCsv(buffer);
}

function parseCsv(buffer: Buffer): ParsedFile {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const columns = result.meta.fields ?? [];
  const rows = (result.data ?? []).filter((r) => Object.values(r).some((v) => v && String(v).trim()));
  return { columns, rows };
}

function parseExcel(buffer: Buffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return { columns: [], rows: [] };
  }

  // Find the sheet with the most rows (in case Sheet 1 is a title/instructions tab)
  let bestSheetName = wb.SheetNames[0];
  let maxRows = 0;
  for (const name of wb.SheetNames) {
    const s = wb.Sheets[name];
    if (s && s["!ref"]) {
      const range = XLSX.utils.decode_range(s["!ref"]);
      const numRows = range.e.r - range.s.r + 1;
      if (numRows > maxRows) {
        maxRows = numRows;
        bestSheetName = name;
      }
    }
  }

  const sheet = wb.Sheets[bestSheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "", raw: false });

  // Collect unique column names across all rows so no columns are omitted
  const colSet = new Set<string>();
  for (const r of json) {
    for (const k of Object.keys(r)) {
      if (k && k.trim()) colSet.add(k.trim());
    }
  }
  const columns = Array.from(colSet);

  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k.trim()] = v == null ? "" : String(v);
    return out;
  });
  return { columns, rows };
}

/** Standard target fields the importer maps source columns onto. */
export const TARGET_FIELDS = [
  "firstName",
  "lastName",
  "company",
  "email",
  "phone",
  "sector",
  "geography",
  "source",
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

/** Heuristic auto-mapping of source columns to target fields by name. */
export function guessMapping(columns: string[]): Partial<Record<TargetField, string>> {
  const map: Partial<Record<TargetField, string>> = {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const col of columns) {
    const n = norm(col);
    if (!map.email && (n.includes("email") || n === "mail")) map.email = col;
    else if (!map.firstName && (n === "firstname" || n === "fname" || n === "first")) map.firstName = col;
    else if (!map.lastName && (n === "lastname" || n === "lname" || n === "last")) map.lastName = col;
    else if (!map.company && (n.includes("company") || n.includes("organisation") || n.includes("organization") || n === "org")) map.company = col;
    else if (!map.phone && (n.includes("phone") || n.includes("mobile") || n.includes("contact"))) map.phone = col;
    else if (!map.sector && (n.includes("sector") || n.includes("industry") || n.includes("vertical"))) map.sector = col;
    else if (!map.geography && (n.includes("geo") || n.includes("region") || n.includes("city") || n.includes("state") || n.includes("location"))) map.geography = col;
    else if (!map.source && n.includes("source")) map.source = col;
  }
  // fall back: a single "name" column → firstName
  if (!map.firstName) {
    const nameCol = columns.find((c) => norm(c) === "name" || norm(c) === "fullname" || norm(c) === "contactname");
    if (nameCol) map.firstName = nameCol;
  }
  return map;
}
