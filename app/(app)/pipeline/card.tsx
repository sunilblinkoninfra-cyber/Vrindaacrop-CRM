"use client";

import Link from "next/link";
import { useTransition } from "react";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
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

  const prevLabel = prev ? STAGE_LABELS[prev as keyof typeof STAGE_LABELS] || prev : null;
  const nextLabel = next ? STAGE_LABELS[next as keyof typeof STAGE_LABELS] || next : null;

  return (
    <div className={`rounded-xl border bg-white p-3 shadow-xs transition-all hover:shadow-md ${
      hot ? "border-amber-300 bg-amber-50/20" : "border-slate-200/90"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${id}`}
          className="min-w-0 flex-1 truncate font-semibold text-slate-900 hover:text-brand"
        >
          {title}
        </Link>
        {hot && (
          <span className="shrink-0 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
            HOT 🔥
          </span>
        )}
      </div>

      <div className="mt-0.5 truncate text-xs text-slate-500">
        {company || "No company listed"}
      </div>

      {/* Stage Shift Controls: Finger-friendly 36px buttons */}
      <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-slate-100 pt-2 text-xs">
        {prev ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => updateStage(id, prev).then(() => {}))}
            aria-label={`Move backward to ${prevLabel}`}
            className="flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200 active:scale-95 disabled:opacity-40"
          >
            <span>←</span>
            <span className="max-w-[80px] truncate">{prevLabel}</span>
          </button>
        ) : (
          <div />
        )}

        {next ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => updateStage(id, next).then(() => {}))}
            aria-label={`Advance forward to ${nextLabel}`}
            className="flex h-8 items-center gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-teal-100 active:scale-95 disabled:opacity-40"
          >
            <span className="max-w-[80px] truncate">{nextLabel}</span>
            <span>→</span>
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
