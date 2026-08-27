import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getDashboardAnalytics, buildDashboardWhere, type DashboardFilter } from "@/lib/metrics";
import { leadScopeWhere } from "@/lib/rbac";
import { STAGE_LABELS } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import { format as formatDate } from "date-fns";

export const runtime = "nodejs";

// Excel export of the executive dashboard filtered metrics & matching leads.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";
  if (format !== "xlsx") {
    return NextResponse.json({ error: "Use the Print/PDF view for PDF export." }, { status: 400 });
  }

  const user = session.user as { id: string; role: string; email: string };
  const userScope = leadScopeWhere({ id: user.id, role: user.role as any, email: user.email });

  const url = req.nextUrl;
  const filters: DashboardFilter = {
    timeframe: (url.searchParams.get("timeframe") as DashboardFilter["timeframe"]) || undefined,
    sector: url.searchParams.get("sector") || undefined,
    geography: url.searchParams.get("geography") || undefined,
    ownerId: url.searchParams.get("ownerId") || undefined,
    validationStatus: (url.searchParams.get("validation") as DashboardFilter["validationStatus"]) || undefined,
    campaignId: url.searchParams.get("campaignId") || undefined,
  };

  const [analytics, matchingLeads] = await Promise.all([
    getDashboardAnalytics(userScope, filters),
    prisma.lead.findMany({
      where: buildDashboardWhere(userScope, filters),
      take: 1000,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true, email: true } },
        tags: { include: { tag: true } },
      },
    }),
  ]);

  const { kpi, funnel, stages, timeline, sectors, geographies } = analytics;

  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const summaryAOA: (string | number)[][] = [
    ["VrindaaCorp Services — Executive Outreach & Pipeline Report", ""],
    ["Generated At", formatDate(new Date(), "dd MMM yyyy, HH:mm:ss")],
    [],
    ["Applied Filters", ""],
    ["Timeframe", filters.timeframe ? filters.timeframe.toUpperCase() : "All Time"],
    ["Sector", filters.sector && filters.sector !== "ALL" ? filters.sector : "All Sectors"],
    ["Geography / Region", filters.geography && filters.geography !== "ALL" ? filters.geography : "All Regions"],
    ["Assigned Owner", filters.ownerId && filters.ownerId !== "ALL" ? filters.ownerId : "All Team Members"],
    ["Campaign", filters.campaignId && filters.campaignId !== "ALL" ? filters.campaignId : "All Campaigns"],
    ["Validation Status", filters.validationStatus && filters.validationStatus !== "ALL" ? filters.validationStatus : "All"],
    [],
    ["Executive Key Performance Indicators", "Value"],
    ["Total Pipeline Leads", kpi.leads],
    ["Won Deals", kpi.wonLeads],
    ["Hot Leads (Awaiting Owner Action)", kpi.hot],
    ["Active Campaigns", kpi.activeCampaigns],
    ["Suppressed Leads", kpi.suppressed],
    ["Invalid / Disposable Leads", kpi.invalidEmails],
    [],
    ["Outreach & Engagement Funnel", "Value"],
    ["Emails Sent", funnel.sent],
    ["Unique Leads Sent", funnel.uniqueSent],
    ["Unique Leads Opened", funnel.opened],
    ["Total Email Opens", funnel.totalOpened ?? funnel.opened],
    ["Open Engagement Rate %", `${funnel.openRate}%`],
    ["Unique Leads Replied", funnel.replied],
    ["Total Lead Replies", funnel.totalReplied ?? funnel.replied],
    ["Reply Rate %", `${funnel.replyRate}%`],
    ["Unique Leads Clicked", funnel.clicked],
    ["Bounced", funnel.bounced],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAOA), "Executive Summary");

  // 2. Timeline & Funnel Progression Sheet
  if (timeline.length > 0) {
    const timelineData = timeline.map((t) => ({
      Period: t.label,
      "New Leads": t.newLeads,
      "Emails Sent": t.sent,
      "Emails Opened": t.opened,
      "Link Clicks": t.clicked,
      "Lead Replies": t.replied,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(timelineData), "Outreach Velocity");
  }

  // 3. Pipeline Stages Breakdown Sheet
  if (stages.length > 0) {
    const stagesData = stages.map((s) => ({
      Stage: STAGE_LABELS[s.stage as keyof typeof STAGE_LABELS] || s.stage,
      Leads: s.count,
      "Share %": kpi.leads > 0 ? `${Math.round((s.count / kpi.leads) * 100)}%` : "0%",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stagesData), "Pipeline Stages");
  }

  // 4. Sector Breakdown Sheet
  if (sectors.length > 0) {
    const sectorsData = sectors.map((s) => ({
      Sector: s.name,
      Leads: s.value,
      "Share %": kpi.leads > 0 ? `${Math.round((s.value / kpi.leads) * 100)}%` : "0%",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectorsData), "Sector Distribution");
  }

  // 5. Regional Distribution Sheet
  if (geographies.length > 0) {
    const geoData = geographies.map((g) => ({
      Region: g.name,
      Leads: g.value,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(geoData), "Regional Hubs");
  }

  // 6. Matching Leads Detailed Export Sheet
  if (matchingLeads.length > 0) {
    const leadsData = matchingLeads.map((l) => ({
      "Lead Name": fullName(l.firstName, l.lastName) || "—",
      Company: l.company || "—",
      Email: l.email,
      Phone: l.phone || "—",
      Sector: l.sector || "—",
      City: l.city || "—",
      Region: l.geography || "—",
      Stage: STAGE_LABELS[l.stage as keyof typeof STAGE_LABELS] || l.stage,
      "Hot Lead": l.hot ? "YES" : "NO",
      "Validation Status": l.validationStatus,
      "Owner / Assignee": l.owner?.name ?? l.owner?.email ?? "Unassigned",
      Tags: l.tags.map((t) => t.tag.name).join(", ") || "—",
      "Created Date": formatDate(l.createdAt, "yyyy-MM-dd HH:mm"),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadsData), "Filtered Leads");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const timeframeTag = filters.timeframe ? `-${filters.timeframe}` : "";
  const filename = `vrindaacorp-report${timeframeTag}-${Date.now()}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
