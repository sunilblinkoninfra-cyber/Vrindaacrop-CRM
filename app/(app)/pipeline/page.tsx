import { prisma } from "@/lib/prisma";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { PipelineCard } from "./card";

export const dynamic = "force-dynamic";

const PER_COLUMN = 50;

export default async function PipelinePage() {
  const [leads, counts] = await Promise.all([
    prisma.lead.findMany({
      where: { stage: { in: STAGES } },
      orderBy: { updatedAt: "desc" },
      include: {},
    }),
    prisma.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
  ]);

  const countMap = new Map(counts.map((c) => [c.stage, c._count._all]));
  const byStage = new Map(STAGES.map((s) => [s, leads.filter((l) => l.stage === s).slice(0, PER_COLUMN)]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle="Move leads through stages with the arrows on each card."
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <div key={stage} className="w-64 flex-shrink-0 rounded-xl bg-slate-100/60 p-2">
            <div className="mb-2 flex items-center justify-between px-1 pt-1">
              <span className="text-sm font-semibold text-slate-700">{STAGE_LABELS[stage]}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                {countMap.get(stage) ?? 0}
              </span>
            </div>
            <div className="space-y-2">
              {byStage.get(stage)!.map((l) => (
                <PipelineCard
                  key={l.id}
                  id={l.id}
                  title={fullName(l.firstName, l.lastName) || l.email}
                  company={l.company ?? ""}
                  stage={l.stage}
                  hot={l.hot}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
