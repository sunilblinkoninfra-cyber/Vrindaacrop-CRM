"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui";
import { SECTORS, GEOGRAPHIES, STAGES, STAGE_LABELS } from "@/lib/constants";

export function LeadFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/leads?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-6">
      <Input
        aria-label="Search name, company, or email"
        placeholder="Search name / company / email"
        defaultValue={params.get("q") ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") set("q", (e.target as HTMLInputElement).value);
        }}
        className="sm:col-span-2 md:col-span-2"
      />
      <Select value={params.get("sector") ?? ""} onChange={(e) => set("sector", e.target.value)}>
        <option value="">All sectors</option>
        {SECTORS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Select value={params.get("geography") ?? ""} onChange={(e) => set("geography", e.target.value)}>
        <option value="">All geographies</option>
        {GEOGRAPHIES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </Select>
      <Select value={params.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)}>
        <option value="">All stages</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </Select>
      <Select value={params.get("validation") ?? ""} onChange={(e) => set("validation", e.target.value)}>
        <option value="">All validation</option>
        <option value="VALID">Valid</option>
        <option value="RISKY">Risky</option>
        <option value="INVALID">Invalid</option>
        <option value="UNKNOWN">Unknown</option>
        <option value="DISPOSABLE">Disposable</option>
        <option value="CATCH_ALL">Catch-all</option>
      </Select>
    </div>
  );
}
