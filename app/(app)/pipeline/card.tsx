"use client";

import Link from "next/link";
import { useTransition } from "react";
import { STAGES } from "@/lib/constants";
import type { LeadStage } from "@prisma/client";
import { updateStage } from "../leads/actions";

export function PipelineCard({
  id,
  title,
  company,
  stage,
  hot,
}: {
  id: string;
  title: string;
  company: string;
  stage: LeadStage;
  hot: boolean;
}) {
  const [pending, start] = useTransition();
  const idx = STAGES.indexOf(stage);
  const prev = STAGES[idx - 1];
  const next = STAGES[idx + 1];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
      <Link href={`/leads/${id}`} className="block truncate font-medium text-brand hover:underline">
        {title}
      </Link>
      {hot && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">Hot</span>}
      <div className="truncate text-xs text-slate-500">{company}</div>
      <div className="mt-2 flex justify-between">
        <button
          disabled={pending || !prev}
          onClick={() => prev && start(() => updateStage(id, prev).then(() => {}))}
          className="min-h-9 px-1 text-xs text-slate-400 hover:text-brand disabled:opacity-30"
        >
          ← {prev ?? ""}
        </button>
        <button
          disabled={pending || !next}
          onClick={() => next && start(() => updateStage(id, next).then(() => {}))}
          className="min-h-9 px-1 text-xs text-slate-400 hover:text-brand disabled:opacity-30"
        >
          {next ?? ""} →
        </button>
      </div>
    </div>
  );
}
