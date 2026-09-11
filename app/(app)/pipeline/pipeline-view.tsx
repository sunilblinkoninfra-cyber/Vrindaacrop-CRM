"use client";

import { useState, useRef } from "react";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import type { LeadStage } from "@prisma/client";
import { PipelineCard } from "./card";

type LeadItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string;
  stage: LeadStage;
  hot: boolean;
};

interface PipelineViewProps {
  countMap: Record<string, number>;
  byStage: Record<string, LeadItem[]>;
}

export function PipelineView({ countMap, byStage }: PipelineViewProps) {
  const [activeStage, setActiveStage] = useState<string>("ALL");
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function handleStageSelect(stage: string) {
    setActiveStage(stage);
    if (stage !== "ALL" && columnRefs.current[stage]) {
      columnRefs.current[stage]?.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
    }
  }

  return (
    <div className="space-y-3">
      {/* Mobile/Tablet Stage Filter Pills: horizontally scrollable bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 [-webkit-overflow-scrolling:touch]">
        <button
          type="button"
          onClick={() => handleStageSelect("ALL")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
            activeStage === "ALL"
              ? "bg-brand text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          All Stages (Swipe)
        </button>

        {STAGES.map((stage) => {
          const count = countMap[stage] ?? 0;
          const isSelected = activeStage === stage;
          const isHotStage = stage === "REPLIED";

          return (
            <button
              key={stage}
              type="button"
              onClick={() => handleStageSelect(stage)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? "bg-slate-900 text-white shadow-sm font-semibold"
                  : isHotStage && count > 0
                  ? "bg-amber-50 text-amber-800 border border-amber-300 font-semibold"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span>{STAGE_LABELS[stage as keyof typeof STAGE_LABELS] || stage}</span>
              {isHotStage && count > 0 && <span aria-label="hot">🔥</span>}
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  isSelected
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Kanban Board Horizontal Snap Scroll */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-4 [-webkit-overflow-scrolling:touch] sm:gap-4">
        {STAGES.map((stage) => {
          const leads = byStage[stage] ?? [];
          const count = countMap[stage] ?? 0;
          const isHighlighted = activeStage === stage;

          return (
            <div
              key={stage}
              ref={(el) => {
                columnRefs.current[stage] = el;
              }}
              className={`w-[min(20rem,calc(100vw-2.5rem))] shrink-0 snap-start rounded-2xl p-2.5 sm:w-72 transition-all ${
                isHighlighted
                  ? "bg-teal-50/50 ring-2 ring-brand/40 shadow-sm"
                  : "bg-slate-200/50"
              }`}
            >
              {/* Stage Header */}
              <div className="mb-2.5 flex items-center justify-between px-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-800">
                    {STAGE_LABELS[stage as keyof typeof STAGE_LABELS] || stage}
                  </span>
                  {stage === "REPLIED" && count > 0 && (
                    <span className="text-xs" title="Hot Inbound Replies">🔥</span>
                  )}
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 shadow-xs ring-1 ring-slate-200/80">
                  {count}
                </span>
              </div>

              {/* Cards Container */}
              <div className="space-y-2.5">
                {leads.map((l) => (
                  <PipelineCard
                    key={l.id}
                    id={l.id}
                    title={l.firstName ? `${l.firstName} ${l.lastName ?? ""}`.trim() : l.email}
                    company={l.company ?? ""}
                    stage={l.stage}
                    hot={l.hot}
                  />
                ))}

                {leads.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300/80 p-5 text-center text-xs text-slate-400">
                    No leads in this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
