import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere } from "@/lib/leads-query";
import { getSessionUser, leadScopeWhere } from "@/lib/rbac";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { fullName } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants";
import { LeadFilters } from "./filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][]
  );
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

  // Export is never paginated — drop the page param so the link is unambiguous.
  const exportParams = new URLSearchParams(params);
  exportParams.delete("page");
  const exportUrl = `/api/leads/export?${exportParams.toString()}`;
  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leads"
        subtitle={`${total.toLocaleString()} leads match the current filters.`}
        actions={
          <a href={exportUrl} download>
            <Button variant="secondary">Export CSV ({total.toLocaleString()})</Button>
          </a>
        }
      />

      <Card className="p-4">
        <LeadFilters />
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="data-table">
          <thead>
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Sector</th>
              <th className="px-4 py-2">City</th>
              <th className="px-4 py-2">Region</th>
              <th className="px-4 py-2">Stage</th>
              <th className="px-4 py-2">Validation</th>
              <th className="px-4 py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/leads/${l.id}`} className="font-medium text-brand hover:underline">
                    {fullName(l.firstName, l.lastName) || "—"}
                  </Link>
                  {l.hot && <Badge className="ml-2 bg-red-100 text-red-700">Hot</Badge>}
                </td>
                <td className="px-4 py-2 text-slate-600">{l.company || "—"}</td>
                <td className="px-4 py-2 text-slate-600">{l.email}</td>
                <td className="px-4 py-2 text-slate-600">{l.sector || "—"}</td>
                <td className="px-4 py-2 text-slate-600">{l.city || "—"}</td>
                <td className="px-4 py-2 text-slate-600">{l.geography || "—"}</td>
                <td className="px-4 py-2">
                  <Badge tone={l.stage}>{STAGE_LABELS[l.stage]}</Badge>
                </td>
                <td className="px-4 py-2" title={l.validationReason ?? undefined}>
                  <Badge tone={l.validationStatus}>{l.validationStatus}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-600">{l.owner?.name ?? "—"}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  No leads found. Import a list from the Import & Cleanup page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - page) < 4 || p === 1 || p === pages)
            .map((p) => {
              const np = new URLSearchParams(params.toString());
              np.set("page", String(p));
              return (
                <Link
                  key={p}
                  href={`/leads?${np.toString()}`}
                  className={`rounded px-3 py-1 ${
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
