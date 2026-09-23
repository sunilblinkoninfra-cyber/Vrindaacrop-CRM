import { ParsedFile } from "@/lib/import/parse";

/**
 * Some CRM exports (like Smartsheet exports) are account-centric: one row per company
 * with several contacts embedded as repeated column groups (e.g. "Email id", "Email id (1)",
 * … "Email id (6)"). This flattener explodes such rows into one contact-level
 * row per embedded contact that has an email, carrying the account-level fields.
 */

export function hasContactBlocks(columns: string[]): boolean {
  const emailCols = columns.filter((c) => /email|mail/i.test(c.trim()));
  return emailCols.length > 1;
}

/** Account-level columns we try to carry onto every exploded contact row. */
function pickAccount(row: Record<string, string>) {
  const get = (patterns: string[]) => {
    for (const p of patterns) {
      for (const [k, v] of Object.entries(row)) {
        if (k.toLowerCase().includes(p.toLowerCase()) && v && String(v).trim()) {
          return String(v).trim();
        }
      }
    }
    return "";
  };
  return {
    Company: get(["account name", "company name", "organization", "organisation", "company", "account"]),
    Sector: get(["industry category", "industry", "sector", "vertical", "category"]),
    "Sub-Sector": get(["sub-sector", "sub sector", "subcategory", "sub category"]),
    Geography: get(["city", "state", "region", "geography", "location"]),
    Source: get(["source", "lead source"]),
  };
}

export function flattenAccounts(parsed: ParsedFile): ParsedFile {
  const { columns, rows } = parsed;

  // Find all columns that represent an email address
  const emailColIndices: number[] = [];
  for (let i = 0; i < columns.length; i++) {
    const colName = columns[i].trim();
    if (/email|mail/i.test(colName)) {
      emailColIndices.push(i);
    }
  }

  if (emailColIndices.length <= 1) return parsed;

  // Build contact descriptors dynamically for each email column
  type ContactBlockMeta = {
    emailCol: string;
    firstNameCol?: string;
    lastNameCol?: string;
    fullNameCol?: string;
    designationCol?: string;
    phoneCol?: string;
  };

  const blocks: ContactBlockMeta[] = [];

  for (let b = 0; b < emailColIndices.length; b++) {
    const currentEmailIdx = emailColIndices[b];
    const prevEmailIdx = b > 0 ? emailColIndices[b - 1] : -1;
    const nextEmailIdx = b < emailColIndices.length - 1 ? emailColIndices[b + 1] : columns.length;

    // Window of columns associated with this contact:
    // From previous email column boundary up to next email column boundary
    const windowStart = Math.max(prevEmailIdx + 1, currentEmailIdx - 6);
    const windowEnd = Math.min(columns.length, nextEmailIdx);
    const candidateCols = columns.slice(windowStart, windowEnd);

    const blockMeta: ContactBlockMeta = {
      emailCol: columns[currentEmailIdx],
    };

    for (const c of candidateCols) {
      const norm = c.trim().toLowerCase();
      if (/first\s*name|fname/i.test(norm) && !blockMeta.firstNameCol) {
        blockMeta.firstNameCol = c;
      } else if (/last\s*name|lname/i.test(norm) && !blockMeta.lastNameCol) {
        blockMeta.lastNameCol = c;
      } else if (/(contact|full|^)\s*name/i.test(norm) && !blockMeta.fullNameCol && !blockMeta.firstNameCol) {
        blockMeta.fullNameCol = c;
      } else if (/designation|title|role|position/i.test(norm) && !blockMeta.designationCol) {
        blockMeta.designationCol = c;
      } else if (/phone|mobile|cell|contact\s*no/i.test(norm) && !blockMeta.phoneCol) {
        blockMeta.phoneCol = c;
      }
    }

    blocks.push(blockMeta);
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
    for (const b of blocks) {
      const emailVal = (row[b.emailCol] ?? "").trim();
      if (!emailVal || !emailVal.includes("@")) continue; // only emit contacts that have an email

      let firstName = b.firstNameCol ? (row[b.firstNameCol] ?? "").trim() : "";
      let lastName = b.lastNameCol ? (row[b.lastNameCol] ?? "").trim() : "";

      if (!firstName && b.fullNameCol) {
        const full = (row[b.fullNameCol] ?? "").trim();
        if (full) {
          const parts = full.split(/\s+/);
          firstName = parts[0] || "";
          lastName = parts.slice(1).join(" ") || "";
        }
      }

      const designation = b.designationCol ? (row[b.designationCol] ?? "").trim() : "";
      const phone = b.phoneCol ? (row[b.phoneCol] ?? "").trim() : "";

      outRows.push({
        "First Name": firstName,
        "Last Name": lastName,
        Designation: designation,
        Phone: phone,
        Email: emailVal,
        Company: account.Company,
        Sector: account.Sector,
        "Sub-Sector": account["Sub-Sector"],
        Geography: account.Geography,
        Source: account.Source,
      });
    }
  }

  // Gracefully fall back to original parsed rows if flattening found 0 contacts
  if (outRows.length > 0) {
    return { columns: outColumns, rows: outRows };
  }

  return parsed;
}

/** Flatten only when the account/multi-contact pattern is detected. */
export function maybeFlatten(parsed: ParsedFile): ParsedFile {
  return hasContactBlocks(parsed.columns) ? flattenAccounts(parsed) : parsed;
}

