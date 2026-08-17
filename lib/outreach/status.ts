import { EmailEventType, EnrollmentState } from "@prisma/client";

export type CampaignLeadStatus =
  | "PENDING"
  | "CONTACTED"
  | "OPENED"
  | "CLICKED"
  | "REPLIED"
  | "BOUNCED"
  | "UNSUBSCRIBED";

/**
 * Furthest status a lead has reached in a campaign, derived from its last
 * (denormalized) email event. Progress ranks Replied > Clicked > Opened >
 * Contacted; terminal states (Bounced/Unsubscribed) are shown as-is.
 */
export function campaignLeadStatus(
  lastEventType: EmailEventType | null | undefined
): CampaignLeadStatus {
  switch (lastEventType) {
    case "REPLIED":
      return "REPLIED";
    case "CLICKED":
      return "CLICKED";
    case "OPENED":
      return "OPENED";
    case "DELIVERED":
    case "SENT":
      return "CONTACTED";
    case "BOUNCED":
      return "BOUNCED";
    case "COMPLAINED":
    case "UNSUBSCRIBED":
      return "UNSUBSCRIBED";
    default:
      return "PENDING";
  }
}

/** Rank used to keep `lastEventType` monotonic (never regress Opened→Sent). */
const RANK: Record<EmailEventType, number> = {
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  CLICKED: 4,
  REPLIED: 5,
  BOUNCED: 6,
  COMPLAINED: 6,
  UNSUBSCRIBED: 6,
};

/** Whether `next` is a further-along status than `current` (for denormalizing). */
export function isFurther(current: EmailEventType | null | undefined, next: EmailEventType): boolean {
  if (!current) return true;
  return RANK[next] >= RANK[current];
}

export const STATUS_LABEL: Record<CampaignLeadStatus, string> = {
  PENDING: "Pending",
  CONTACTED: "Contacted",
  OPENED: "Opened",
  CLICKED: "Clicked",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
};

export const STATUS_TONE: Record<CampaignLeadStatus, string> = {
  PENDING: "bg-slate-100 text-slate-500 ring-slate-200",
  CONTACTED: "bg-sky-50 text-sky-700 ring-sky-200",
  OPENED: "bg-amber-50 text-amber-700 ring-amber-200",
  CLICKED: "bg-violet-50 text-violet-700 ring-violet-200",
  REPLIED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  BOUNCED: "bg-red-50 text-red-700 ring-red-200",
  UNSUBSCRIBED: "bg-red-50 text-red-700 ring-red-200",
};

export function enrollmentStateLabel(state: EnrollmentState): string {
  return state === "ACTIVE" ? "Active" : state === "PAUSED" ? "Paused" : "Completed";
}
