import { prisma } from "@/lib/prisma";
import { STAGES, STAGE_LABELS } from "@/lib/constants";
import { fullName } from "@/lib/utils";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { PipelineCard } from "./card";

export const dynamic = "force-dynamic";

const PER_COLUMN = 50;

export default async function PipelinePage() {
  const user = await getSessionUser();
  const scope = leadScopeWhere(user);

  // One bounded query per stage (take: PER_COLUMN) run in parallel, instead of
  // loading every lead across all stages into memory and slicing in JS — that
  // approach pulls the whole table on a large lead base.
  const [counts, ...stageLeads] = await Promise.all([
    prisma.lead.groupBy({ by: ["stage"], where: scope, _count: { _all: true } }),
    ...STAGES.map((stage) =>
      prisma.lead.findMany({
        where: { stage, ...scope },
        orderBy: { updatedAt: "desc" },
        take: PER_COLUMN,
      })
    ),
  ]);

  const countMap = new Map(counts.map((c) => [c.stage, c._count._all]));
  const byStage = new Map(STAGES.map((s, i) => [s, stageLeads[i]]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle="Move leads through stages with the arrows on each card."
      />

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-4 [-webkit-overflow-scrolling:touch] sm:gap-4">
        {STAGES.map((stage) => (
          <div key={stage} className="w-[min(18rem,calc(100vw-2rem))] shrink-0 snap-start rounded-xl bg-slate-100/60 p-2 sm:w-64">
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
