import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/utils";
import { Card } from "@/components/ui";
import {
  campaignLeadStatus,
  STATUS_LABEL,
  STATUS_TONE,
  enrollmentStateLabel,
  type CampaignLeadStatus,
} from "@/lib/outreach/status";

const PAGE = 100;

/** Server component: the enrolled-leads table with live per-lead status. */
export async function EnrolledLeads({ campaignId }: { campaignId: string }) {
  const enrollments = await prisma.enrollment.findMany({
    where: { campaignId },
    orderBy: { updatedAt: "desc" },
    take: PAGE,
    include: { lead: { include: { owner: true } } },
  });

  // Status distribution across the whole campaign (not just this page).
  const all = await prisma.enrollment.findMany({
    where: { campaignId },
    select: { lastEventType: true },
  });
  const dist = new Map<CampaignLeadStatus, number>();
  for (const e of all) {
    const s = campaignLeadStatus(e.lastEventType);
    dist.set(s, (dist.get(s) ?? 0) + 1);
  }

  if (all.length === 0) {
    return (
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Enrolled leads</h2>
        <p className="text-sm text-slate-400">No leads enrolled yet. Save a segment and click “Enroll matching leads”.</p>
      </Card>
    );
  }

  const order: CampaignLeadStatus[] = ["PENDING", "CONTACTED", "OPENED", "CLICKED", "REPLIED", "BOUNCED", "UNSUBSCRIBED"];

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
        <h2 className="text-sm font-semibold text-slate-700">Enrolled leads ({all.length})</h2>
        <div className="flex flex-wrap gap-1">
          {order
            .filter((s) => dist.get(s))
            .map((s) => (
              <span
                key={s}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[s]}`}
              >
                {STATUS_LABEL[s]} {dist.get(s)}
              </span>
            ))}
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Company</th>
            <th>Owner</th>
            <th>Step</th>
            <th>Status</th>
            <th>Sequence</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => {
            const status = campaignLeadStatus(e.lastEventType);
            return (
              <tr key={e.id}>
                <td>
                  <Link href={`/leads/${e.lead.id}`} className="font-medium text-brand hover:underline">
                    {fullName(e.lead.firstName, e.lead.lastName) || e.lead.email}
                  </Link>
                </td>
                <td className="text-slate-600">{e.lead.company || "—"}</td>
                <td className="text-slate-600">{e.lead.owner?.name ?? "—"}</td>
                <td className="text-slate-600">Step {e.currentStep + 1}</td>
                <td>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </td>
                <td className="text-xs text-slate-500">{enrollmentStateLabel(e.state)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {all.length > PAGE && (
        <div className="border-t border-slate-100 p-2 text-center text-xs text-slate-400">
          Showing the {PAGE} most recently updated of {all.length} enrolled leads.
        </div>
      )}
    </Card>
  );
}
