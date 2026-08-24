import { Card, PageHeader, StatCard } from "@/components/ui";
import { totals, emailFunnel, leadStageCounts } from "@/lib/metrics";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";
import { STAGE_LABELS } from "@/lib/constants";
import { IconLeads, IconFire, IconCampaigns, IconReports, IconContract } from "@/components/icons";

export const dynamic = "force-dynamic";

const stageBar: Record<string, string> = {
  NEW: "bg-slate-400",
  CONTACTED: "bg-sky-500",
  REPLIED: "bg-amber-500",
  QUALIFIED: "bg-violet-500",
  PROPOSAL_SENT: "bg-indigo-500",
  WON: "bg-emerald-500",
  LOST: "bg-red-500",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  const scope = leadScopeWhere(user);
  const [t, funnel, stages] = await Promise.all([
    totals(scope),
    emailFunnel(undefined, scope),
    leadStageCounts(scope),
  ]);
  const maxStage = Math.max(1, ...stages.map((s) => s.count));

  const funnelSteps = [
    { label: "Sent", value: funnel.sent, color: "bg-brand" },
    { label: "Opened", value: funnel.opened, color: "bg-sky-500", pct: funnel.openRate },
    { label: "Clicked", value: funnel.clicked, color: "bg-violet-500" },
    { label: "Replied", value: funnel.replied, color: "bg-amber-500", pct: funnel.replyRate },
    { label: "Bounced", value: funnel.bounced, color: "bg-red-500" },
  ];
  const funnelMax = Math.max(1, funnel.sent);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of leads, outreach & pipeline health." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Total leads" value={t.leads.toLocaleString()} icon={<IconLeads />} accent="text-brand" />
        <StatCard label="Hot leads" value={t.hot} hint="Awaiting owner action" icon={<IconFire />} accent="text-amber-500" />
        <StatCard label="Active campaigns" value={t.activeCampaigns} icon={<IconCampaigns />} accent="text-indigo-500" />
        <StatCard label="Suppressed" value={t.suppressed} hint="Bounced / unsubscribed" icon={<IconReports />} accent="text-slate-400" />
        <StatCard label="Invalid/disposable" value={t.invalidEmails} hint="Excluded from sending" icon={<IconContract />} accent="text-red-500" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Email funnel (all time)</h2>
          <div className="space-y-3">
            {funnelSteps.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">{s.label}</span>
                  <span className="text-slate-400">
                    {s.value.toLocaleString()}
                    {s.pct != null ? ` · ${s.pct}%` : ""}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${s.color}`}
                    style={{ width: `${Math.min(100, (s.value / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Pipeline by stage</h2>
          <div className="space-y-2.5">
            {stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-slate-500">{STAGE_LABELS[s.stage]}</div>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={`flex h-full items-center rounded-md ${stageBar[s.stage]} px-2 text-[11px] font-medium text-white`}
                    style={{ width: `${Math.max(6, (s.count / maxStage) * 100)}%` }}
                  >
                    {s.count > 0 && s.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
