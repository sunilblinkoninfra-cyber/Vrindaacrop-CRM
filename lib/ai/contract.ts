import { prisma } from "@/lib/prisma";
import { chatJSON, isAiConfigured } from "@/lib/ai/client";
import { webSearch } from "@/lib/ai/websearch";
import { ContractStatus } from "@prisma/client";

type ContractResult = {
  hasContract: "yes" | "no" | "unknown";
  incumbentVendor: string | null;
  contractExpiry: string | null; // "YYYY-MM" or "YYYY-MM-DD"
  confidence: "low" | "medium" | "high";
  rationale: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    hasContract: { type: "string", enum: ["yes", "no", "unknown"] },
    incumbentVendor: { type: ["string", "null"] },
    contractExpiry: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    rationale: { type: "string" },
  },
  required: ["hasContract", "confidence", "rationale"],
  additionalProperties: false,
};

/**
 * Best-effort discovery of a lead-company's current facility-management vendor
 * and contract expiry, using the (local) model plus optional web-search
 * snippets. Writes the result to the lead with contractSource="ai" and
 * contractConfirmed=false — an agent must confirm before it's trusted. Always
 * sets contractCheckedAt so a lead is processed once, even on a null result.
 */
export async function enrichContract(lead: {
  id: string;
  company: string | null;
  city: string | null;
  sector: string | null;
}): Promise<{ enriched: boolean }> {
  // Nothing to research without a company name.
  if (!lead.company || !isAiConfigured()) {
    await prisma.lead.update({ where: { id: lead.id }, data: { contractCheckedAt: new Date() } });
    return { enriched: false };
  }

  const query = `${lead.company}${lead.city ? " " + lead.city : ""} facility management housekeeping security services vendor contract`;
  const snippets = await webSearch(query, 5);
  const snippetText = snippets.length
    ? snippets.map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet} (${s.url})`).join("\n")
    : "(no web search results available)";

  const system = `You are a precise B2B research assistant. Determine whether a company currently outsources its facility management (housekeeping, security, technical maintenance, or catering) to a third-party vendor, who that incumbent vendor is, and when the contract might expire.
Rules:
- Rely ONLY on the provided search snippets and well-known public facts. Do NOT fabricate a vendor or date.
- If the snippets don't support a conclusion, return hasContract "unknown" with low confidence.
- contractExpiry may be a month ("YYYY-MM") or a date ("YYYY-MM-DD"); use null if unknown.
- Keep rationale to one sentence citing the snippet number(s) used.`;

  const user = `Company: ${lead.company}
City/region: ${lead.city ?? "unknown"}
Sector: ${lead.sector ?? "unknown"}

Search snippets:
${snippetText}`;

  const result = await chatJSON<ContractResult>({ system, user, schema: SCHEMA, maxTokens: 700 });

  if (!result) {
    // Model/local endpoint unavailable → leave UNKNOWN, queue a manual task.
    await prisma.lead.update({ where: { id: lead.id }, data: { contractCheckedAt: new Date() } });
    await prisma.task.create({
      data: {
        leadId: lead.id,
        title: `Research current FM vendor & contract expiry for ${lead.company}`,
        assigneeId: (await prisma.lead.findUnique({ where: { id: lead.id }, select: { ownerId: true } }))?.ownerId ?? null,
      },
    });
    return { enriched: false };
  }

  const status: ContractStatus =
    result.hasContract === "yes" ? "ACTIVE" : result.hasContract === "no" ? "NONE" : "UNKNOWN";

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      contractStatus: status,
      incumbentVendor: result.incumbentVendor?.trim() || null,
      contractExpiry: parseExpiry(result.contractExpiry),
      contractConfidence: result.confidence,
      contractSource: "ai",
      contractCheckedAt: new Date(),
      contractConfirmed: false,
    },
  });
  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: "note",
      message: `Contract intelligence (AI, ${result.confidence} confidence): ${result.rationale}`,
    },
  });

  return { enriched: true };
}

/** Process a batch of leads whose enrichment is pending (contractCheckedAt null). */
export async function runEnrichment(limit = 10): Promise<{ processed: number }> {
  if (!isAiConfigured()) return { processed: 0 };
  const pending = await prisma.lead.findMany({
    where: { contractCheckedAt: null, isSuppressed: false },
    select: { id: true, company: true, city: true, sector: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  for (const lead of pending) {
    try {
      await enrichContract(lead);
    } catch {
      await prisma.lead.update({ where: { id: lead.id }, data: { contractCheckedAt: new Date() } });
    }
  }
  return { processed: pending.length };
}

/** Parse "YYYY-MM" or "YYYY-MM-DD" to a Date (first of month if no day). Null-safe. */
function parseExpiry(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 1;
  if (month < 1 || month > 12) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? null : d;
}
