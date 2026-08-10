import { ParsedFile } from "@/lib/import/parse";

/**
 * Some CRM exports are account-centric: one row per company with several
 * contacts embedded as repeated column groups (e.g. "Email id", "Email id (1)",
 * … "Email id (6)"). This flattener explodes such rows into one contact-level
 * row per embedded contact that has an email, carrying the account-level fields.
 *
 * Detection anchors on >1 "Email id" column. Each contact block is assumed to be
 * a contiguous run of 7 columns [firstName, lastName, designation, phone, email,
 * buyerType, linkedin] beginning at the first email-bearing block.
 */

const CONTACT_BLOCK_SIZE = 7;

export function hasContactBlocks(columns: string[]): boolean {
  const emailCols = columns.filter((c) => /^email\s*id/i.test(c.trim()));
  return emailCols.length > 1;
}

/** Account-level columns we try to carry onto every exploded contact row. */
function pickAccount(row: Record<string, string>) {
  const get = (names: string[]) => {
    for (const n of names) if (row[n]?.trim()) return row[n].trim();
    return "";
  };
  return {
    Company: get(["Account Name", "Company", "Account"]),
    Sector: get(["Industry Category", "Industry", "Sector"]),
    "Sub-Sector": get(["Sub-Sector", "Sub Sector"]),
    Geography: get(["City", "State", "Region", "Geography"]),
    Source: get(["Source"]),
  };
}

/** Locate the contiguous contact-block region by finding the first email column. */
function contactBlockStart(columns: string[]): number {
  const idx = columns.findIndex((c) => /^email\s*id/i.test(c.trim()));
  if (idx < 0) return -1;
  // Blocks are [firstName,lastName,designation,phone,EMAIL,buyerType,linkedin];
  // email is offset 4 within a block, so the block starts 4 columns earlier.
  return Math.max(0, idx - 4);
}

export function flattenAccounts(parsed: ParsedFile): ParsedFile {
  const { columns, rows } = parsed;
  const start = contactBlockStart(columns);
  if (start < 0) return parsed;

  const blockCols: string[][] = [];
  for (let i = start; i + CONTACT_BLOCK_SIZE <= columns.length; i += CONTACT_BLOCK_SIZE) {
    const block = columns.slice(i, i + CONTACT_BLOCK_SIZE);
    // A valid block must contain an email column.
    if (block.some((c) => /^email\s*id/i.test(c.trim()))) blockCols.push(block);
  }

  const outColumns = [
    "First Name",
    "Last Name",
    "Designation",
    "Phone",
    "Email",
    "Company",
    "Sector",
    "Sub-Sector",
    "Geography",
    "Source",
  ];
  const outRows: Record<string, string>[] = [];

  for (const row of rows) {
    const account = pickAccount(row);
    for (const block of blockCols) {
      const [fn, ln, desig, phone, email] = block;
      const emailVal = (row[email] ?? "").trim();
      if (!emailVal) continue; // only emit contacts that have an email
      outRows.push({
        "First Name": (row[fn] ?? "").trim(),
        "Last Name": (row[ln] ?? "").trim(),
        Designation: (row[desig] ?? "").trim(),
        Phone: (row[phone] ?? "").trim(),
        Email: emailVal,
        Company: account.Company,
        Sector: account.Sector,
        "Sub-Sector": account["Sub-Sector"],
        Geography: account.Geography,
        Source: account.Source,
      });
    }
  }

  return { columns: outColumns, rows: outRows };
}

/** Flatten only when the account/multi-contact pattern is detected. */
export function maybeFlatten(parsed: ParsedFile): ParsedFile {
  return hasContactBlocks(parsed.columns) ? flattenAccounts(parsed) : parsed;
}
