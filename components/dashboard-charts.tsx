"use client";

import React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Curated modern light theme color palette
const THEME_COLORS = [
  "#0f766e", // Teal (Brand primary)
  "#0284c7", // Sky blue
  "#f59e0b", // Amber
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#64748b", // Slate
];

const STAGE_COLORS: Record<string, string> = {
  NEW: "#94a3b8",
  CONTACTED: "#0284c7",
  REPLIED: "#f59e0b",
  QUALIFIED: "#8b5cf6",
  PROPOSAL_SENT: "#6366f1",
  WON: "#10b981",
  LOST: "#ef4444",
};

// Custom Glassmorphic Tooltip
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur-md">
      {label && <p className="mb-2 text-xs font-semibold text-slate-700">{label}</p>}
      <div className="space-y-1.5 text-xs">
        {payload.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color || item.fill }}
              />
              <span className="text-slate-600">{item.name}</span>
            </div>
            <span className="font-semibold text-slate-900">
              {typeof item.value === "number" ? item.value.toLocaleString() : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 1. Engagement Trends Area Chart (Smooth Spline with Gradient Fills)
export function EngagementAreaChart({
  data,
}: {
  data: { label: string; sent: number; opened: number; clicked: number; replied: number; newLeads: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-400">
        No outreach activity recorded in this timeframe.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0f766e" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorReplied" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<CustomChartTooltip />} />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
          />

          <Area
            type="monotone"
            dataKey="sent"
            name="Sent Emails"
            stroke="#0f766e"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorSent)"
          />
          <Area
            type="monotone"
            dataKey="opened"
            name="Opened"
            stroke="#0284c7"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorOpened)"
          />
          <Area
            type="monotone"
            dataKey="replied"
            name="Replied (Hot)"
            stroke="#f59e0b"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorReplied)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Pipeline Stage Distribution Chart
export function PipelineStageChart({
  data,
}: {
  data: { stage: string; count: number; label: string }[];
}) {
  const total = data.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const color = STAGE_COLORS[item.stage] || "#94a3b8";

        return (
          <div key={item.stage} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-medium text-slate-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="font-semibold text-slate-900">{item.count.toLocaleString()}</span>
                <span className="text-[11px] text-slate-400">({pct}%)</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(item.count > 0 ? 3 : 0, pct)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 3. Sector Distribution Donut Chart
export function SectorDonutChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        No sector data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center sm:flex-row sm:items-center sm:justify-between">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomChartTooltip />} />
            <Pie
              data={data}
              innerRadius={58}
              outerRadius={84}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={THEME_COLORS[index % THEME_COLORS.length]}
                  className="transition-all hover:opacity-80"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Donut Center Metric */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-bold text-slate-900">{total.toLocaleString()}</span>
          <span className="text-[11px] font-medium text-slate-400">Leads</span>
        </div>
      </div>

      {/* Donut Legend */}
      <div className="mt-3 flex flex-1 flex-col gap-1.5 pl-0 sm:mt-0 sm:pl-4">
        {data.map((item, idx) => {
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <div key={item.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: THEME_COLORS[idx % THEME_COLORS.length] }}
                />
                <span className="truncate text-slate-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-1.5 pl-2 font-medium">
                <span className="text-slate-800">{item.value.toLocaleString()}</span>
                <span className="text-[10px] text-slate-400 font-normal">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 4. Regional Distribution Horizontal Bar Chart
export function GeographyBarChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        No regional data available.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={85}
          />
          <Tooltip content={<CustomChartTooltip />} />
          <Bar dataKey="value" name="Leads" fill="#14b8a6" radius={[0, 6, 6, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={THEME_COLORS[i % THEME_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 5. Database Quality & Validation Breakdown
export function DatabaseHealthCard({
  validation,
  totalLeads,
}: {
  validation: { status: string; count: number }[];
  totalLeads: number;
}) {
  const validCount = validation.find((v) => v.status === "VALID")?.count ?? 0;
  const unknownCount = validation.find((v) => v.status === "UNKNOWN")?.count ?? 0;
  const riskyCount = validation.find((v) => v.status === "RISKY")?.count ?? 0;
  const catchAllCount = validation.find((v) => v.status === "CATCH_ALL")?.count ?? 0;
  const invalidCount =
    (validation.find((v) => v.status === "INVALID")?.count ?? 0) +
    (validation.find((v) => v.status === "DISPOSABLE")?.count ?? 0);

  const cleanScore = totalLeads > 0 ? Math.round(((validCount + unknownCount) / totalLeads) * 100) : 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-2xl font-bold text-slate-900">{cleanScore}%</span>
          <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            High Quality
          </span>
        </div>
        <span className="text-xs text-slate-500">{totalLeads.toLocaleString()} total verified records</span>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 p-0.5">
        <div
          title={`Valid: ${validCount}`}
          style={{ width: `${totalLeads > 0 ? (validCount / totalLeads) * 100 : 0}%` }}
          className="bg-emerald-500 first:rounded-l-full last:rounded-r-full"
        />
        <div
          title={`Unknown / Unprobed: ${unknownCount}`}
          style={{ width: `${totalLeads > 0 ? (unknownCount / totalLeads) * 100 : 0}%` }}
          className="bg-slate-300 first:rounded-l-full last:rounded-r-full"
        />
        <div
          title={`Catch-All: ${catchAllCount}`}
          style={{ width: `${totalLeads > 0 ? (catchAllCount / totalLeads) * 100 : 0}%` }}
          className="bg-blue-400 first:rounded-l-full last:rounded-r-full"
        />
        <div
          title={`Risky: ${riskyCount}`}
          style={{ width: `${totalLeads > 0 ? (riskyCount / totalLeads) * 100 : 0}%` }}
          className="bg-amber-400 first:rounded-l-full last:rounded-r-full"
        />
        <div
          title={`Invalid / Disposable: ${invalidCount}`}
          style={{ width: `${totalLeads > 0 ? (invalidCount / totalLeads) * 100 : 0}%` }}
          className="bg-rose-500 first:rounded-l-full last:rounded-r-full"
        />
      </div>

      {/* Validation Breakdown Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-medium">Valid Mailbox</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{validCount.toLocaleString()}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 text-slate-700">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span className="font-medium">Standard / MX</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{unknownCount.toLocaleString()}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 text-amber-700">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="font-medium">Risky / Role</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{riskyCount.toLocaleString()}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-2.5">
          <div className="flex items-center gap-1.5 text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="font-medium">Catch-All</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{catchAllCount.toLocaleString()}</p>
        </div>

        <div className="rounded-lg bg-slate-50 p-2.5 col-span-2 sm:col-span-2">
          <div className="flex items-center gap-1.5 text-rose-700">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="font-medium">Blocked (Disposable / Invalid)</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">{invalidCount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
