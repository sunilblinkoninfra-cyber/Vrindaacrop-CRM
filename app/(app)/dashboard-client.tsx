"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Select } from "@/components/ui";
import { STAGE_LABELS, SECTORS, GEOGRAPHIES } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import {
  EngagementAreaChart,
  PipelineStageChart,
  SectorDonutChart,
  GeographyBarChart,
  DatabaseHealthCard,
} from "@/components/dashboard-charts";
import {
  IconLeads,
  IconFire,
  IconCampaigns,
  IconReports,
  IconPipeline,
} from "@/components/icons";

type UserOption = {
  id: string;
  name: string | null;
  email: string;
};

type CampaignOption = {
  id: string;
  name: string;
  status: string;
  _count: { enrollments: number; steps: number };
};

type HotLeadItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string;
  sector: string | null;
  geography: string | null;
  stage: string;
  updatedAt: Date;
  owner: { name: string | null; email: string } | null;
};

type DashboardDataProps = {
  kpi: {
    leads: number;
    hot: number;
    suppressed: number;
    activeCampaigns: number;
    invalidEmails: number;
    wonLeads: number;
  };
  funnel: {
    sent: number;
    opened: number;
    totalOpened?: number;
    clicked: number;
    totalClicked?: number;
    replied: number;
    totalReplied?: number;
    bounced: number;
    openRate: number;
    replyRate: number;
    clickRate: number;
  };
  stages: { stage: string; count: number }[];
  timeline: {
    date: string;
    label: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    newLeads: number;
  }[];
  sectors: { name: string; value: number }[];
  geographies: { name: string; value: number }[];
  validation: { status: string; count: number }[];
  hotLeads: HotLeadItem[];
  campaigns: CampaignOption[];
  users: UserOption[];
  isOwnerOrAdmin: boolean;
};

const TIMEFRAME_OPTIONS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "6m", label: "Last 6 Months" },
  { value: "ytd", label: "Year to Date" },
  { value: "all", label: "All Time" },
];

export function DashboardClient({
  initialData,
  users,
  isOwnerOrAdmin,
}: {
  initialData: DashboardDataProps;
  users: UserOption[];
  isOwnerOrAdmin: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"overview" | "outreach" | "quality">("overview");

  // Read active filters from URL query params
  const timeframe = searchParams.get("timeframe") || "all";
  const sector = searchParams.get("sector") || "ALL";
  const geography = searchParams.get("geography") || "ALL";
  const ownerId = searchParams.get("ownerId") || "ALL";
  const validationStatus = searchParams.get("validation") || "ALL";
  const campaignId = searchParams.get("campaignId") || "ALL";

  const hasActiveFilters =
    timeframe !== "all" ||
    sector !== "ALL" ||
    geography !== "ALL" ||
    ownerId !== "ALL" ||
    validationStatus !== "ALL" ||
    campaignId !== "ALL";

  function applyFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ALL" || (key === "timeframe" && value === "all")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  function resetAllFilters() {
    startTransition(() => {
      router.push("/");
    });
  }

  // Prepared stages with labels
  const formattedStages = useMemo(() => {
    return initialData.stages.map((s) => ({
      stage: s.stage,
      count: s.count,
      label: STAGE_LABELS[s.stage as keyof typeof STAGE_LABELS] || s.stage,
    }));
  }, [initialData.stages]);

  return (
    <div className="space-y-6">
      {/* Header & Quick Date Range Pills */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Executive Dashboard</h1>
          <p className="text-sm text-slate-500">
            Real-time pipeline health, outreach engagement velocity, and lead intelligence.
          </p>
        </div>

        {/* Timeframe Quick Selector + Export Button inline */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyFilter("timeframe", opt.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                timeframe === opt.value
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {opt.label}
            </button>
          ))}

          <div className="mx-1 h-4 w-px bg-slate-200" />

          {/* Export Filtered Report Button directly next to All Time */}
          <a
            href={`/api/reports/export?${searchParams.toString()}&format=xlsx`}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 hover:text-emerald-800"
            title="Download executive report (.xlsx) with applied filters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 text-emerald-600"
            >
              <path
                fillRule="evenodd"
                d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 6.75a.75.75 0 011.5 0v3.69l1.22-1.22a.75.75 0 111.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-2.5-2.5a.75.75 0 111.06-1.06l1.22 1.22V8.75z"
                clipRule="evenodd"
              />
            </svg>
            <span>Export Report</span>
          </a>
        </div>
      </div>

      {/* Multi-Dimensional Filter Toolbar */}
      <Card className="border-slate-200/90 bg-white/90 p-3 sm:p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 text-brand"
            >
              <path
                fillRule="evenodd"
                d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
                clipRule="evenodd"
              />
            </svg>
            <span>Analytics Filters</span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-medium text-brand hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* Sector Filter */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Sector</label>
            <Select
              value={sector}
              onChange={(e) => applyFilter("sector", e.target.value)}
              className="h-9 min-h-0 text-xs"
            >
              <option value="ALL">All Sectors</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          {/* Geography Filter */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Region</label>
            <Select
              value={geography}
              onChange={(e) => applyFilter("geography", e.target.value)}
              className="h-9 min-h-0 text-xs"
            >
              <option value="ALL">All Regions</option>
              {GEOGRAPHIES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </div>

          {/* Owner Filter */}
          {isOwnerOrAdmin && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">Assigned Owner</label>
              <Select
                value={ownerId}
                onChange={(e) => applyFilter("ownerId", e.target.value)}
                className="h-9 min-h-0 text-xs"
              >
                <option value="ALL">All Team Members</option>
                <option value="UNASSIGNED">Unassigned Leads</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Validation Filter */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Validation Status</label>
            <Select
              value={validationStatus}
              onChange={(e) => applyFilter("validation", e.target.value)}
              className="h-9 min-h-0 text-xs"
            >
              <option value="ALL">All Validation States</option>
              <option value="VALID">Valid Mailbox Only</option>
              <option value="UNKNOWN">Standard / MX OK</option>
              <option value="RISKY">Risky / Catch-All</option>
              <option value="INVALID">Invalid / Disposable</option>
            </Select>
          </div>

          {/* Campaign Filter */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Campaign</label>
            <Select
              value={campaignId}
              onChange={(e) => applyFilter("campaignId", e.target.value)}
              className="h-9 min-h-0 text-xs"
            >
              <option value="ALL">All Campaigns</option>
              {initialData.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Active Filter Tags */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs">
            <span className="text-slate-400">Active filters:</span>
            {timeframe !== "all" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                Timeframe: {TIMEFRAME_OPTIONS.find((t) => t.value === timeframe)?.label}
                <button type="button" onClick={() => applyFilter("timeframe", "all")}>
                  &times;
                </button>
              </span>
            )}
            {sector !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                Sector: {sector}
                <button type="button" onClick={() => applyFilter("sector", "ALL")}>
                  &times;
                </button>
              </span>
            )}
            {geography !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
                Region: {geography}
                <button type="button" onClick={() => applyFilter("geography", "ALL")}>
                  &times;
                </button>
              </span>
            )}
            {ownerId !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-800">
                Owner: {users.find((u) => u.id === ownerId)?.name || ownerId}
                <button type="button" onClick={() => applyFilter("ownerId", "ALL")}>
                  &times;
                </button>
              </span>
            )}
            {validationStatus !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                Validation: {validationStatus}
                <button type="button" onClick={() => applyFilter("validation", "ALL")}>
                  &times;
                </button>
              </span>
            )}
            {campaignId !== "ALL" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-800">
                Campaign: {initialData.campaigns.find((c) => c.id === campaignId)?.name || campaignId}
                <button type="button" onClick={() => applyFilter("campaignId", "ALL")}>
                  &times;
                </button>
              </span>
            )}
          </div>
        )}
      </Card>

      {/* Executive Metric Strip */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {/* Total Leads */}
        <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Leads</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {initialData.kpi.leads.toLocaleString()}
              </h3>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <IconLeads />
            </div>
          </div>
          <div className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-emerald-600">{initialData.kpi.wonLeads} won</span>
            <span className="mx-1 text-slate-300">·</span>
            <span>{initialData.kpi.activeCampaigns} active campaigns</span>
          </div>
        </Card>

        {/* Hot Leads */}
        <Link href="/leads?hot=true" className="block">
          <Card className="relative overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50/40 via-white to-white p-4 transition-all hover:border-amber-300 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-amber-900">Hot Leads</p>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                  </span>
                </div>
                <h3 className="mt-1 text-2xl font-bold text-amber-950">
                  {initialData.kpi.hot.toLocaleString()}
                </h3>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <IconFire />
              </div>
            </div>
            <div className="mt-3 text-xs font-medium text-amber-700">
              Awaiting owner action &rarr;
            </div>
          </Card>
        </Link>

        {/* Outreach Sent */}
        <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Emails Sent</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {initialData.funnel.sent.toLocaleString()}
              </h3>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <IconCampaigns />
            </div>
          </div>
          <div className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">
              {initialData.funnel.sent > 0
                ? Math.round(
                    ((initialData.funnel.sent - initialData.funnel.bounced) /
                      initialData.funnel.sent) *
                      100
                  )
                : 100}
              %
            </span>{" "}
            <span>delivery rate</span>
          </div>
        </Card>

        {/* Open Rate */}
        <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Open Engagement</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {initialData.funnel.openRate}%
              </h3>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <IconReports />
            </div>
          </div>
          <div className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-indigo-600">
              {initialData.funnel.opened.toLocaleString()}
            </span>{" "}
            <span>unique {initialData.funnel.opened === 1 ? "lead" : "leads"} opened</span>
            {initialData.funnel.totalOpened && initialData.funnel.totalOpened > initialData.funnel.opened ? (
              <span className="text-slate-400"> ({initialData.funnel.totalOpened} total)</span>
            ) : null}
          </div>
        </Card>

        {/* Reply Rate */}
        <Card className="relative overflow-hidden p-4 transition-all hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Reply Rate</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">
                {initialData.funnel.replyRate}%
              </h3>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <IconPipeline />
            </div>
          </div>
          <div className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-emerald-600">
              {initialData.funnel.replied.toLocaleString()}
            </span>{" "}
            <span>direct lead {initialData.funnel.replied === 1 ? "reply" : "replies"}</span>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs for In-Depth Analytics */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-6 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`border-b-2 py-2.5 transition-colors ${
              activeTab === "overview"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Overview &amp; Trends
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("outreach")}
            className={`border-b-2 py-2.5 transition-colors ${
              activeTab === "outreach"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Outreach Velocity &amp; Funnel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("quality")}
            className={`border-b-2 py-2.5 transition-colors ${
              activeTab === "quality"
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            Lead Quality &amp; Deliverability
          </button>
        </nav>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Main Visualizations Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Outreach Activity Spline Area Chart */}
            <Card className="lg:col-span-2 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Outreach Velocity &amp; Engagement
                  </h3>
                  <p className="text-xs text-slate-500">
                    Volume of sent emails, opens, and replies over time
                  </p>
                </div>
              </div>
              <EngagementAreaChart data={initialData.timeline} />
            </Card>

            {/* Pipeline Stage Funnel */}
            <Card className="p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Pipeline Stages</h3>
                  <p className="text-xs text-slate-500">Distribution of leads across sales stages</p>
                </div>
                <Link href="/pipeline" className="text-xs font-medium text-brand hover:underline">
                  Kanban &rarr;
                </Link>
              </div>
              <PipelineStageChart data={formattedStages} />
            </Card>
          </div>

          {/* Sector & Region Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Sector Donut Chart */}
            <Card className="p-5 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Sector Breakdown</h3>
                <p className="text-xs text-slate-500">Market share by target industry segment</p>
              </div>
              <SectorDonutChart data={initialData.sectors} />
            </Card>

            {/* Regional Bar Chart */}
            <Card className="p-5 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Top Geographies</h3>
                <p className="text-xs text-slate-500">Lead distribution across regional hubs</p>
              </div>
              <GeographyBarChart data={initialData.geographies} />
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Outreach & Funnel */}
      {activeTab === "outreach" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Full Email Funnel Step Breakdown */}
            <Card className="p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Lifecycle Funnel Drop-off</h3>
              <p className="mb-4 text-xs text-slate-500">Progression from send to reply</p>

              <div className="space-y-4">
                {[
                  {
                    label: "1. Sent",
                    count: initialData.funnel.sent,
                    pct: 100,
                    color: "bg-teal-600",
                    hint: "Total outreach delivered",
                  },
                  {
                    label: "2. Opened",
                    count: initialData.funnel.opened,
                    pct: initialData.funnel.openRate,
                    color: "bg-sky-500",
                    hint: `${initialData.funnel.openRate}% open rate`,
                  },
                  {
                    label: "3. Clicked",
                    count: initialData.funnel.clicked,
                    pct: initialData.funnel.clickRate,
                    color: "bg-violet-500",
                    hint: `${initialData.funnel.clickRate}% click-through`,
                  },
                  {
                    label: "4. Replied (Hot)",
                    count: initialData.funnel.replied,
                    pct: initialData.funnel.replyRate,
                    color: "bg-amber-500",
                    hint: `${initialData.funnel.replyRate}% direct conversion`,
                  },
                  {
                    label: "5. Bounced / Rejected",
                    count: initialData.funnel.bounced,
                    pct:
                      initialData.funnel.sent > 0
                        ? Math.round((initialData.funnel.bounced / initialData.funnel.sent) * 100)
                        : 0,
                    color: "bg-rose-500",
                    hint: "Excluded from subsequent sequences",
                  },
                ].map((step) => (
                  <div key={step.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{step.label}</span>
                      <span className="text-slate-500">
                        <strong>{step.count.toLocaleString()}</strong> ({step.hint})
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${step.color} transition-all duration-500`}
                        style={{ width: `${Math.min(100, Math.max(step.count > 0 ? 3 : 0, step.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Active Campaigns Progress */}
            <Card className="p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Active Campaigns</h3>
                  <p className="text-xs text-slate-500">Live outreach drip sequences</p>
                </div>
                <Link href="/campaigns" className="text-xs font-medium text-brand hover:underline">
                  Manage all &rarr;
                </Link>
              </div>

              <div className="divide-y divide-slate-100">
                {initialData.campaigns.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-semibold text-brand hover:underline text-sm"
                      >
                        {c.name}
                      </Link>
                      <Badge className="bg-emerald-50 text-emerald-700">ACTIVE</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span>{c._count.steps} sequence steps</span>
                      <span>·</span>
                      <span>{c._count.enrollments.toLocaleString()} leads enrolled</span>
                    </div>
                  </div>
                ))}
                {initialData.campaigns.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No active campaigns. Create one in the Campaigns section.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 3: Lead Quality & Health */}
      {activeTab === "quality" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Database Health Score */}
            <Card className="p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Database Quality Score</h3>
              <p className="mb-4 text-xs text-slate-500">
                Real-time validation against disposable domains, syntax errors, and MX routing
              </p>
              <DatabaseHealthCard
                validation={initialData.validation}
                totalLeads={initialData.kpi.leads}
              />
            </Card>

            {/* Protection Safeguards */}
            <Card className="p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">Deliverability Safeguards</h3>
              <p className="mb-4 text-xs text-slate-500">
                Automated protections preventing spam complaints and domain reputation damage
              </p>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                    ✓
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Automatic Bounce Suppression</h4>
                    <p className="text-slate-500">
                      {initialData.kpi.suppressed.toLocaleString()} addresses automatically suppressed
                      to protect your email domain reputation.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700">
                    ✓
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">One-Click Unsubscribe</h4>
                    <p className="text-slate-500">
                      RFC-8058 compliant headers injected into every sent message for high deliverability.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                    ✓
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Sending Warm-Up Caps</h4>
                    <p className="text-slate-500">
                      Automated cadence limits enforce progressive daily sending ramp-up.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Priority Hot Leads Action Stream */}
      <Card className="overflow-hidden p-0 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            <h3 className="font-semibold text-slate-900 text-sm">High-Priority Hot Leads</h3>
          </div>
          <Link
            href="/leads?hot=true"
            className="text-xs font-semibold text-brand hover:underline"
          >
            View all {initialData.kpi.hot} hot leads &rarr;
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {initialData.hotLeads.map((lead) => {
            const name = fullName(lead.firstName, lead.lastName) || lead.email;

            return (
              <div
                key={lead.id}
                className="flex flex-col items-start justify-between gap-3 p-4 transition-colors hover:bg-slate-50/80 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-brand hover:underline text-sm"
                    >
                      {name}
                    </Link>
                    <Badge className="bg-amber-100 text-amber-800 text-[10px]">Hot</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>{lead.company || "No company"}</span>
                    <span>·</span>
                    <span>{lead.email}</span>
                    {lead.sector && (
                      <>
                        <span>·</span>
                        <span>{lead.sector}</span>
                      </>
                    )}
                    {lead.geography && (
                      <>
                        <span>·</span>
                        <span>{lead.geography}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right text-xs">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Assigned To</div>
                    <div className="font-medium text-slate-700">
                      {lead.owner?.name || lead.owner?.email || "Unassigned"}
                    </div>
                  </div>
                  <Link href={`/leads/${lead.id}`}>
                    <Button variant="secondary" className="h-8 min-h-0 px-3 py-1 text-xs font-medium">
                      Open Profile
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}

          {initialData.hotLeads.length === 0 && (
            <div className="p-6 text-center text-xs text-slate-400">
              No hot leads awaiting owner action. Leads that reply to campaigns will appear here automatically.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
