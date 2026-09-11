import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/constants";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { PipelineView } from "./pipeline-view";
import { SyncRepliesButton } from "@/components/sync-replies-button";

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

  const countMapObj: Record<string, number> = {};
  for (const c of counts) {
    countMapObj[c.stage] = c._count._all;
  }

  const byStageObj: Record<string, any[]> = {};
  STAGES.forEach((s, i) => {
    byStageObj[s] = stageLeads[i].map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      company: l.company,
      email: l.email,
      stage: l.stage,
      hot: l.hot,
    }));
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle="Move leads through stages with the arrows on each card."
        actions={<SyncRepliesButton />}
      />

      <PipelineView countMap={countMapObj} byStage={byStageObj} />
    </div>
  );
}
