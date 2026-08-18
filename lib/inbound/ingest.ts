import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import { validateEmail } from "@/lib/import/validate";
import { emailKey } from "@/lib/import/dedup";
import { normalizeSector, normalizeCity, toRegion } from "@/lib/import/normalize";
import { pickAssignee } from "@/lib/assign";
import { ValidationStatus } from "@prisma/client";

const statusMap: Record<string, ValidationStatus> = {
  valid: ValidationStatus.VALID,
  invalid: ValidationStatus.INVALID,
  risky: ValidationStatus.RISKY,
  unknown: ValidationStatus.UNKNOWN,
};

export type IngestInput = {
  channel: "website_form" | "meta_ads" | "google_ads";
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  sector?: string;
  city?: string;
  sourceDetail?: string;
  raw: unknown;
};

export type IngestResult = {
  status: "created" | "duplicate" | "invalid" | "error";
  leadId?: string;
  note?: string;
};

/**
 * Single funnel every inbound source (website form, Meta, Google Ads) flows
 * through. Normalizes, validates, dedups by email, creates the Lead (stage NEW,
 * auto-assigned to an agent), logs an activity and an InboundLeadLog row, and
 * leaves contractCheckedAt=null so the enrichment cron step picks it up.
 * Mirrors the create logic in lib/import/process.ts.
 */
export async function ingestLead(input: IngestInput): Promise<IngestResult> {
  const email = (input.email ?? "").trim();
  const log = async (status: string, leadId?: string, note?: string) => {
    await prisma.inboundLeadLog.create({
      data: { channel: input.channel, status, payload: input.raw as object, leadId, note },
    });
  };

  if (!email) {
    await log("invalid", undefined, "Missing email");
    return { status: "invalid", note: "Missing email" };
  }

  const key = emailKey(email);
  const existing = await prisma.lead.findFirst({ where: { emailNormalized: key }, select: { id: true } });
  if (existing) {
    await log("duplicate", existing.id, "Duplicate email");
    // Still record the touch on the existing lead's timeline.
    await prisma.activity.create({
      data: { leadId: existing.id, type: "import", message: `Re-submitted via ${input.channel}` },
    });
    return { status: "duplicate", leadId: existing.id, note: "Duplicate email" };
  }

  const check = await validateEmail(email);
  if (check === "invalid") {
    await log("invalid", undefined, "Failed email validation");
    return { status: "invalid", note: "Failed email validation" };
  }

  const rawGeo = input.city ?? "";
  const ownerId = await pickAssignee();

  // Atomic: Lead + its Activity + the InboundLog together, so a partial failure
  // never leaves an orphan Lead or a "created" log pointing at nothing.
  const lead = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        company: input.company?.trim() || null,
        email,
        emailNormalized: normalizeEmail(email),
        phone: input.phone?.trim() || null,
        sector: normalizeSector(input.sector),
        city: normalizeCity(rawGeo),
        geography: toRegion(rawGeo),
        source: input.channel,
        sourceDetail: input.sourceDetail?.trim() || null,
        validationStatus: statusMap[check],
        ownerId,
        // contractCheckedAt left null → enrichment cron will pick it up.
      },
    });
    await tx.activity.create({
      data: {
        leadId: lead.id,
        type: "import",
        message: `Lead captured via ${input.channel}${ownerId ? " and auto-assigned" : ""}`,
      },
    });
    await tx.inboundLeadLog.create({
      data: { channel: input.channel, status: "created", payload: input.raw as object, leadId: lead.id },
    });
    return lead;
  });

  return { status: "created", leadId: lead.id };
}
