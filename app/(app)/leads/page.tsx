import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";
import { getSessionUser, leadScopeWhere, isOwnerOrAdmin } from "@/lib/rbac";
import { Button, Card, PageHeader } from "@/components/ui";
import { LeadFilters } from "./filters";
import { AddLeadModal } from "./add-lead-modal";
import { LeadsTable } from "./leads-table";
import { SyncRepliesButton } from "@/components/sync-replies-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => v) as [string, string][]);
  const user = await getSessionUser();
  // AGENT users only ever see their own leads (enforced here, not just in the UI).
  const where = { AND: [buildLeadWhere(params), leadScopeWhere(user)] };
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));

  const [leads, total, users] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { owner: true, tags: { include: { tag: true } } },
    }),
    prisma.lead.count({ where }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const exportParams = new URLSearchParams(params);
  exportParams.delete("page");
  const exportUrl = `/api/leads/export?${exportParams.toString()}`;
  const pages = Math.ceil(total / PAGE_SIZE);
  const canManage = isOwnerOrAdmin(user.role);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={`${total.toLocaleString()} leads match the current filters.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <SyncRepliesButton className="w-full sm:w-auto" />
            <AddLeadModal users={users} />
            <a href={exportUrl} download className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                Export CSV ({total.toLocaleString()})
              </Button>
            </a>
          </div>
        }
      />

      <Card className="p-3 sm:p-4">
        <LeadFilters />
      </Card>

      <Card className="overflow-hidden p-0">
        <LeadsTable leads={leads} canManage={canManage} users={users} />
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-start gap-2 overflow-x-auto px-1 pb-1 text-sm sm:justify-center">
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - page) < 4 || p === 1 || p === pages)
            .map((p) => {
              const np = new URLSearchParams(params.toString());
              np.set("page", String(p));
              return (
                <Link
                  key={p}
                  href={`/leads?${np.toString()}`}
                  className={`inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded px-3 py-1 ${
                    p === page ? "bg-brand text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p}
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
