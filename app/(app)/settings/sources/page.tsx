import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const channelLabel: Record<string, string> = {
  website_form: "Website form",
  meta_ads: "Meta Lead Ads",
  google_ads: "Google Ads",
};

const statusTone: Record<string, string> = {
  created: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  duplicate: "bg-amber-50 text-amber-700 ring-amber-200",
  invalid: "bg-red-50 text-red-700 ring-red-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  received: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function SourcesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role === "AGENT") redirect("/leads");

  const base = env.appUrl.replace(/\/$/, "");
  const [logs, counts] = await Promise.all([
    prisma.inboundLeadLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);
  const bySource = new Map(counts.map((c) => [c.source, c._count._all]));

  const endpoints = [
    {
      channel: "website_form",
      url: `${base}/api/inbound/form`,
      note: "POST JSON { email, firstName, company, phone, sector, city }. Send header X-Form-Secret (INBOUND_FORM_SECRET) or ?token=.",
    },
    {
      channel: "meta_ads",
      url: `${base}/api/inbound/meta`,
      note: "Set as the Meta app webhook (leadgen). Verify token = META_VERIFY_TOKEN; the app subscribes to the Page and needs META_PAGE_TOKEN + META_APP_SECRET.",
    },
    {
      channel: "google_ads",
      url: `${base}/api/inbound/google`,
      note: "Set as the Google Ads Lead Form webhook URL; set the form 'Key' to GOOGLE_LEAD_KEY.",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lead Sources"
        subtitle="Inbound capture endpoints and recent activity. Leads created here are auto-assigned and queued for contract enrichment."
      />

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Endpoints</h2>
        {endpoints.map((e) => (
          <div key={e.channel} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-800">{channelLabel[e.channel]}</span>
              <span className="text-xs text-slate-400">
                {bySource.get(e.channel) ?? 0} leads captured
              </span>
            </div>
            <code className="mt-1 block break-all rounded bg-slate-50 px-2 py-1 text-xs text-brand">
              {e.url}
            </code>
            <p className="mt-1 text-xs text-slate-500">{e.note}</p>
          </div>
        ))}
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">
          Recent inbound events
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">
                  {format(l.createdAt, "dd MMM HH:mm")}
                </td>
                <td>{channelLabel[l.channel] ?? l.channel}</td>
                <td>
                  <Badge className={statusTone[l.status] ?? statusTone.received}>{l.status}</Badge>
                </td>
                <td className="text-xs text-slate-500">{l.note ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No inbound leads captured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
