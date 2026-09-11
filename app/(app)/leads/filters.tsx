"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { SECTORS, GEOGRAPHIES, STAGES, STAGE_LABELS } from "@/lib/constants";

export function LeadFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);

  const activeCount = [
    params.get("sector"),
    params.get("geography"),
    params.get("stage"),
    params.get("validation"),
  ].filter(Boolean).length;

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/leads?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            aria-label="Search name, company, or email"
            placeholder="Search name / company / email"
            defaultValue={params.get("q") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
            }}
            className="w-full"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="flex md:hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-brand"
          >
            <path
              fillRule="evenodd"
              d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
              clipRule="evenodd"
            />
          </svg>
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-brand px-1.5 py-0.2 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <div
        className={`${
          showFilters ? "grid" : "hidden md:grid"
        } grid-cols-2 md:grid-cols-4 gap-2`}
      >
        <Select
          value={params.get("sector") ?? ""}
          onChange={(e) => set("sector", e.target.value)}
        >
          <option value="">All sectors</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={params.get("geography") ?? ""}
          onChange={(e) => set("geography", e.target.value)}
        >
          <option value="">All geographies</option>
          {GEOGRAPHIES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select
          value={params.get("stage") ?? ""}
          onChange={(e) => set("stage", e.target.value)}
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          value={params.get("validation") ?? ""}
          onChange={(e) => set("validation", e.target.value)}
        >
          <option value="">All validation</option>
          <option value="VALID">Valid</option>
          <option value="RISKY">Risky</option>
          <option value="INVALID">Invalid</option>
          <option value="UNKNOWN">Unknown</option>
          <option value="DISPOSABLE">Disposable</option>
          <option value="CATCH_ALL">Catch-all</option>
        </Select>
      </div>
    </div>
  );
}
