import { Prisma, LeadStage, ValidationStatus } from "@prisma/client";

/** Build a Prisma `where` filter for leads from URL search params.
 *  Shared by the leads list, CSV export, and campaign segment preview. */
export function buildLeadWhere(params: URLSearchParams): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  const q = params.get("q")?.trim();
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const sector = params.get("sector");
  if (sector) where.sector = sector;

  const geography = params.get("geography");
  if (geography) where.geography = geography;

  const stage = params.get("stage");
  if (stage && stage in LeadStage) where.stage = stage as LeadStage;

  const validation = params.get("validation");
  if (validation && validation in ValidationStatus) where.validationStatus = validation as ValidationStatus;

  const hot = params.get("hot");
  if (hot === "1") where.hot = true;

  const suppressed = params.get("suppressed");
  if (suppressed === "1") where.isSuppressed = true;
  else if (suppressed === "0") where.isSuppressed = false;

  const tag = params.get("tag");
  if (tag) where.tags = { some: { tag: { name: tag } } };

  const assignee = params.get("assignee");
  if (assignee === "unassigned") where.ownerId = null;
  else if (assignee) where.ownerId = assignee;

  const source = params.get("source");
  if (source) where.source = source;

  const contract = params.get("contract");
  if (contract && ["UNKNOWN", "NONE", "ACTIVE"].includes(contract)) {
    where.contractStatus = contract as "UNKNOWN" | "NONE" | "ACTIVE";
  }

  return where;
}

/** Same as buildLeadWhere but from a plain object (used by campaign segments). */
export function segmentToWhere(segment: Record<string, string> | null | undefined): Prisma.LeadWhereInput {
  const params = new URLSearchParams();
  if (segment) for (const [k, v] of Object.entries(segment)) if (v) params.set(k, v);
  // Segments should never target suppressed leads.
  params.set("suppressed", "0");
  return buildLeadWhere(params);
}
