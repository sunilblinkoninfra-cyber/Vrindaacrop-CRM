import { LeadStage } from "@prisma/client";

import { CANONICAL_SECTORS, CANONICAL_REGIONS } from "@/lib/import/normalize";

export const SECTORS = CANONICAL_SECTORS;

export const GEOGRAPHIES = CANONICAL_REGIONS;

export const STAGES: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
];

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  QUALIFIED: "Qualified",
  PROPOSAL_SENT: "Proposal Sent",
  WON: "Won",
  LOST: "Lost",
};
