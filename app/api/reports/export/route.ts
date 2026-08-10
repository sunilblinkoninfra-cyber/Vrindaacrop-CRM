import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";
import { emailFunnel, leadStageCounts, totals } from "@/lib/metrics";
import { monthlyFunnel, topSectors, topTemplates } from "@/lib/reporting";
import { STAGE_LABELS } from "@/lib/constants";

export const runtime = "nodejs";

// Excel export of the monthly reporting dashboard.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx") {
    return NextResponse.json({ error: "Use the Print/PDF view for PDF export." }, { status: 400 });
  }

  const [t, funnel, monthly, stages, sectors, templates] = await Promise.all([
    totals(),
    emailFunnel(),
    monthlyFunnel(6),
    leadStageCounts(),
    topSectors(),
    topTemplates(),
  ]);

  const wb = XLSX.utils.book_new();

  const summary = [
    ["VrindaaCorp — Outreach Report", ""],
    ["Generated", new Date().toISOString()],
    [],
    ["Metric", "Value"],
    ["Total leads", t.leads],
    ["Hot leads", t.hot],
    ["Suppressed", t.suppressed],
    ["Active campaigns", t.activeCampaigns],
    ["Emails sent", funnel.sent],
    ["Opened", funnel.opened],
    ["Clicked", funnel.clicked],
    ["Replied", funnel.replied],
    ["Bounced", funnel.bounced],
    ["Open rate %", funnel.openRate],
    ["Reply rate %", funnel.replyRate],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(monthly.map((m) => ({ Month: m.label, Sent: m.sent, Opened: m.opened, Replied: m.replied }))),
    "Monthly"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(stages.map((s) => ({ Stage: STAGE_LABELS[s.stage], Leads: s.count }))),
    "Pipeline"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(sectors.map((s) => ({ Sector: s.sector, Leads: s.count }))),
    "Sectors"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      templates.map((tp) => ({ Template: tp.name, Sent: tp.sent, Opened: tp.opened, "Open %": tp.openRate }))
    ),
    "Templates"
  );

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vrindaacorp-report-${Date.now()}.xlsx"`,
    },
  });
}
