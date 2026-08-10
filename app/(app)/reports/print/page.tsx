import { emailFunnel, leadStageCounts, totals } from "@/lib/metrics";
import { monthlyFunnel, topSectors, topTemplates } from "@/lib/reporting";
import { STAGE_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { AutoPrint } from "./auto-print";

export const dynamic = "force-dynamic";

// Print-optimized report. Use the browser's "Save as PDF" from the print dialog.
export default async function PrintReportPage() {
  const [t, funnel, monthly, stages, sectors, templates] = await Promise.all([
    totals(),
    emailFunnel(),
    monthlyFunnel(6),
    leadStageCounts(),
    topSectors(),
    topTemplates(),
  ]);

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-800 print:p-0">
      <AutoPrint />
      <h1 className="text-2xl font-bold text-brand">VrindaaCorp Services</h1>
      <p className="text-sm text-slate-500">
        Outreach & Pipeline Report — {format(new Date(), "dd MMM yyyy")}
      </p>

      <Section title="Summary">
        <Grid
          rows={[
            ["Total leads", t.leads],
            ["Hot leads (awaiting owner)", t.hot],
            ["Suppressed", t.suppressed],
            ["Active campaigns", t.activeCampaigns],
            ["Emails sent", funnel.sent],
            ["Open rate", `${funnel.openRate}%`],
            ["Reply rate", `${funnel.replyRate}%`],
            ["Bounced", funnel.bounced],
          ]}
        />
      </Section>

      <Section title="Monthly funnel">
        <Table
          head={["Month", "Sent", "Opened", "Replied"]}
          rows={monthly.map((m) => [m.label, m.sent, m.opened, m.replied])}
        />
      </Section>

      <Section title="Pipeline by stage">
        <Table head={["Stage", "Leads"]} rows={stages.map((s) => [STAGE_LABELS[s.stage], s.count])} />
      </Section>

      <Section title="Leads by sector">
        <Table head={["Sector", "Leads"]} rows={sectors.map((s) => [s.sector, s.count])} />
      </Section>

      <Section title="Top templates by open rate">
        <Table
          head={["Template", "Sent", "Opened", "Open %"]}
          rows={templates.map((tp) => [tp.name, tp.sent, tp.opened, `${tp.openRate}%`])}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-slate-200 pb-1 text-lg font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between rounded bg-slate-50 px-3 py-1">
          <span className="text-slate-500">{k}</span>
          <span className="font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="min-w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-400">
        <tr>
          {head.map((h) => (
            <th key={h} className="py-1 pr-4">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            {r.map((c, j) => (
              <td key={j} className="py-1 pr-4">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
