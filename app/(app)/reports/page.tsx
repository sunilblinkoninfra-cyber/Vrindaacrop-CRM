import { Button, Card, PageHeader, StatCard } from "@/components/ui";
import { STAGE_LABELS } from "@/lib/constants";
import { emailFunnel, leadStageCounts, totals } from "@/lib/metrics";
import { monthlyFunnel, topSectors, topTemplates } from "@/lib/reporting";
import { MonthlyFunnelChart, PipelineChart, SectorChart } from "./charts";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [t, funnel, monthly, stages, sectors, templates] = await Promise.all([
    totals(),
    emailFunnel(),
    monthlyFunnel(6),
    leadStageCounts(),
    topSectors(),
    topTemplates(),
  ]);

  const stageData = stages.map((s) => ({ stage: STAGE_LABELS[s.stage], count: s.count }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle="Outreach performance & pipeline health."
        actions={
          <>
            <a href="/api/reports/export?format=xlsx">
              <Button variant="secondary">Export Excel</Button>
            </a>
            <a href="/reports/print" target="_blank">
              <Button variant="secondary">Export PDF</Button>
            </a>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total leads" value={t.leads.toLocaleString()} />
        <StatCard label="Sent" value={funnel.sent} />
        <StatCard label="Open rate" value={`${funnel.openRate}%`} />
        <StatCard label="Reply rate" value={`${funnel.replyRate}%`} />
        <StatCard label="Hot leads" value={t.hot} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Monthly funnel (sent / opened / replied)</h2>
          <MonthlyFunnelChart data={monthly} />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Pipeline by stage</h2>
          <PipelineChart data={stageData} />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Leads by sector</h2>
          <SectorChart data={sectors} />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Top templates by open rate</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1">Template</th>
                <th className="py-1">Sent</th>
                <th className="py-1">Opened</th>
                <th className="py-1">Open %</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.name} className="border-t border-slate-100">
                  <td className="py-1 text-slate-700">{tpl.name}</td>
                  <td className="py-1 text-slate-600">{tpl.sent}</td>
                  <td className="py-1 text-slate-600">{tpl.opened}</td>
                  <td className="py-1 font-medium text-brand">{tpl.openRate}%</td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-400">
                    No sent emails yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

