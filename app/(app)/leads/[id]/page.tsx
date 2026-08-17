import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser, canAccessLead } from "@/lib/rbac";
import { Badge, Card } from "@/components/ui";
import { fullName } from "@/lib/utils";
import { campaignLeadStatus, STATUS_LABEL, STATUS_TONE } from "@/lib/outreach/status";
import { format } from "date-fns";
import {
  StageControl,
  OwnerControl,
  NoteForm,
  TaskForm,
  TaskToggle,
  TagEditor,
  LeadActions,
} from "./detail-client";
import { ContractCard } from "./contract-card";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const [lead, users] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: params.id },
      include: {
        owner: true,
        tags: { include: { tag: true } },
        notes: { include: { user: true }, orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "desc" } },
        activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 30 },
        emailEvents: { orderBy: { createdAt: "desc" }, take: 30 },
        enrollments: { include: { campaign: { select: { name: true } } }, orderBy: { updatedAt: "desc" } },
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  if (!lead) notFound();

  // AGENT users may only open leads assigned to them.
  const user = await getSessionUser();
  if (!(await canAccessLead(user, lead.id))) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            {fullName(lead.firstName, lead.lastName) || lead.email}
            {lead.hot && <Badge className="bg-red-100 text-red-700">Hot — Awaiting Owner</Badge>}
            {lead.isSuppressed && <Badge className="bg-slate-200 text-slate-600">Suppressed</Badge>}
          </h1>
          <p className="text-sm text-slate-500">
            {lead.company} · {lead.email} {lead.phone ? `· ${lead.phone}` : ""}
          </p>
        </div>
        <LeadActions leadId={lead.id} hot={lead.hot} suppressed={lead.isSuppressed} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Notes</h2>
            <NoteForm leadId={lead.id} />
            <div className="mt-4 space-y-2">
              {lead.notes.map((n) => (
                <div key={n.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <div className="text-slate-700">{n.body}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {n.user?.name ?? n.user?.email ?? "System"} ·{" "}
                    {format(n.createdAt, "dd MMM yyyy HH:mm")}
                  </div>
                </div>
              ))}
              {lead.notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Tasks</h2>
            <TaskForm leadId={lead.id} users={users} />
            <div className="mt-4 space-y-1">
              {lead.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <TaskToggle taskId={t.id} completed={t.completed} />
                  <span className={t.completed ? "text-slate-400 line-through" : "text-slate-700"}>
                    {t.title}
                  </span>
                  {t.dueAt && (
                    <span className="text-xs text-slate-400">
                      due {format(t.dueAt, "dd MMM")}
                    </span>
                  )}
                </div>
              ))}
              {lead.tasks.length === 0 && <p className="text-sm text-slate-400">No tasks.</p>}
            </div>
          </Card>

          {lead.enrollments.length > 0 && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Campaigns</h2>
              <div className="space-y-2">
                {lead.enrollments.map((e) => {
                  const status = campaignLeadStatus(e.lastEventType);
                  return (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{e.campaign.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Step {e.currentStep + 1}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[status]}`}
                        >
                          {STATUS_LABEL[status]}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Email activity</h2>
            <div className="space-y-1">
              {lead.emailEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{e.type}</span>
                  <span className="text-xs text-slate-400">
                    {format(e.createdAt, "dd MMM yyyy HH:mm")}
                  </span>
                </div>
              ))}
              {lead.emailEvents.length === 0 && (
                <p className="text-sm text-slate-400">No email events yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Activity timeline</h2>
            <div className="space-y-2">
              {lead.activities.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" />
                  <div>
                    <div className="text-slate-700">{a.message}</div>
                    <div className="text-xs text-slate-400">
                      {a.user?.name ?? "System"} · {format(a.createdAt, "dd MMM yyyy HH:mm")}
                    </div>
                  </div>
                </div>
              ))}
              {lead.activities.length === 0 && (
                <p className="text-sm text-slate-400">No activity yet.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Stage</div>
              <StageControl leadId={lead.id} stage={lead.stage} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Owner</div>
              <OwnerControl leadId={lead.id} ownerId={lead.ownerId} users={users} />
            </div>
            <div className="text-xs text-slate-500">
              Sector: <span className="text-slate-700">{lead.sector ?? "—"}</span>
              <br />
              City: <span className="text-slate-700">{lead.city ?? "—"}</span>
              <br />
              Region: <span className="text-slate-700">{lead.geography ?? "—"}</span>
              <br />
              Source: <span className="text-slate-700">{lead.source ?? "—"}</span>
              <br />
              Validation: <span className="text-slate-700">{lead.validationStatus}</span>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Contract intelligence</h2>
            <ContractCard
              leadId={lead.id}
              status={lead.contractStatus}
              vendor={lead.incumbentVendor}
              expiry={lead.contractExpiry ? lead.contractExpiry.toISOString().slice(0, 10) : null}
              confidence={lead.contractConfidence}
              source={lead.contractSource}
              checked={lead.contractCheckedAt != null}
              confirmed={lead.contractConfirmed}
            />
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Tags</h2>
            <TagEditor
              leadId={lead.id}
              tags={lead.tags.map((t) => ({ tagId: t.tag.id, name: t.tag.name }))}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
