"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#0f766e", "#14b8a6", "#f59e0b", "#6366f1", "#ef4444", "#8b5cf6", "#0ea5e9", "#10b981"];

export function MonthlyFunnelChart({
  data,
}: {
  data: { label: string; sent: number; opened: number; replied: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" fontSize={12} stroke="#94a3b8" />
        <YAxis fontSize={12} stroke="#94a3b8" allowDecimals={false} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="sent" stroke="#0f766e" strokeWidth={2} name="Sent" />
        <Line type="monotone" dataKey="opened" stroke="#f59e0b" strokeWidth={2} name="Opened" />
        <Line type="monotone" dataKey="replied" stroke="#6366f1" strokeWidth={2} name="Replied" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PipelineChart({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="stage" fontSize={11} stroke="#94a3b8" />
        <YAxis fontSize={12} stroke="#94a3b8" allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SectorChart({ data }: { data: { sector: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis type="number" fontSize={12} stroke="#94a3b8" allowDecimals={false} />
        <YAxis type="category" dataKey="sector" fontSize={12} stroke="#94a3b8" width={90} />
        <Tooltip />
        <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
