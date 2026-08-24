import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";
import { getSessionUser, leadScopeWhere, isOwnerOrAdmin } from "@/lib/rbac";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { fullName } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { LeadFilters } from "./filters";
import { DeleteLeadButton } from "./delete-lead-button";

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

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { owner: true, tags: { include: { tag: true } } },
    }),
    prisma.lead.count({ where }),
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
          <a href={exportUrl} download className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">Export CSV ({total.toLocaleString()})</Button>
          </a>
        }
      />

      <Card className="p-3 sm:p-4">
        <LeadFilters />
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="hidden overflow-x-auto lg:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Sector</th>
                <th>City</th>
                <th>Region</th>
                <th>Stage</th>
                <th>Validation</th>
                <th>Owner</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/leads/${l.id}`} className="font-medium text-brand hover:underline">
                      {fullName(l.firstName, l.lastName) || "—"}
                    </Link>
                    {l.hot && <Badge className="ml-2 bg-red-100 text-red-700">Hot</Badge>}
                  </td>
                  <td className="text-slate-600">{l.company || "—"}</td>
                  <td className="text-slate-600">{l.email}</td>
                  <td className="text-slate-600">{l.sector || "—"}</td>
                  <td className="text-slate-600">{l.city || "—"}</td>
                  <td className="text-slate-600">{l.geography || "—"}</td>
                  <td><Badge tone={l.stage}>{STAGE_LABELS[l.stage]}</Badge></td>
                  <td title={l.validationReason ?? undefined}><Badge tone={l.validationStatus}>{l.validationStatus}</Badge></td>
                  <td className="text-slate-600">{l.owner?.name ?? "—"}</td>
                  {canManage && <td><DeleteLeadButton leadId={l.id} label={fullName(l.firstName, l.lastName) || l.email} /></td>}
                </tr>
              ))}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 10 : 9} className="px-4 py-8 text-center text-slate-400">
                    No leads found. Import a list from the Import &amp; Cleanup page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 lg:hidden">
          {leads.map((l) => {
            const name = fullName(l.firstName, l.lastName) || "Unnamed lead";
            return (
              <article key={l.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="block truncate font-semibold text-brand hover:underline">
                      {name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{l.company || "No company"}</div>
                  </div>
                  {l.hot && <Badge className="shrink-0 bg-red-100 text-red-700">Hot</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="col-span-2 min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email</div>
                    <div className="break-all text-slate-600">{l.email}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Stage</div>
                    <Badge tone={l.stage}>{STAGE_LABELS[l.stage]}</Badge>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Validation</div>
                    <span title={l.validationReason ?? undefined}><Badge tone={l.validationStatus}>{l.validationStatus}</Badge></span>
                  </div>
                  <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sector</div><div className="truncate text-slate-600">{l.sector || "—"}</div></div>
                  <div><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Location</div><div className="truncate text-slate-600">{[l.city, l.geography].filter(Boolean).join(", ") || "—"}</div></div>
                  <div className="col-span-2"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Owner</div><div className="truncate text-slate-600">{l.owner?.name ?? "—"}</div></div>
                </div>
                {canManage && <DeleteLeadButton leadId={l.id} label={name} />}
              </article>
            );
          })}
          {leads.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-400">No leads found. Import a list from the Import &amp; Cleanup page.</div>}
        </div>
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
                  className={`inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded px-3 py-1 ${p === page ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}
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
