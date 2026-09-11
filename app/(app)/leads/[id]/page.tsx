import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser, canAccessLead, isOwnerOrAdmin } from "@/lib/rbac";
import { DeleteLeadButton } from "../delete-lead-button";
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
import { ReplyDraftCard } from "./reply-draft-card";

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
        proposedDrafts: { orderBy: { createdAt: "desc" }, take: 10 },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-xl sm:text-2xl font-semibold text-slate-900">
            <span>{fullName(lead.firstName, lead.lastName) || lead.email}</span>
            {lead.hot && <Badge className="bg-red-100 text-red-700">Hot — Awaiting Owner</Badge>}
            {lead.isSuppressed && <Badge className="bg-slate-200 text-slate-600">Suppressed</Badge>}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
            {lead.company && <span>{lead.company}</span>}
            {lead.company && <span>·</span>}
            <a href={`mailto:${lead.email}`} className="text-brand hover:underline font-medium">
              {lead.email}
            </a>
            {lead.phone && (
              <>
                <span>·</span>
                <a
                  href={`tel:${lead.phone}`}
                  className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {lead.phone}
                </a>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadActions leadId={lead.id} hot={lead.hot} suppressed={lead.isSuppressed} />
          {isOwnerOrAdmin(user.role) && (
            <DeleteLeadButton
              leadId={lead.id}
              label={fullName(lead.firstName, lead.lastName) || lead.email}
              redirectTo="/leads"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ReplyDraftCard
            leadId={lead.id}
            leadName={fullName(lead.firstName, lead.lastName) || lead.email}
            leadCompany={lead.company}
            leadEmail={lead.email}
            drafts={lead.proposedDrafts}
            defaultAgentPhone={lead.owner?.whatsappNumber || lead.phone}
          />

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
            </div>
          </Card>

          <Card className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Email validation</h2>
            <Badge tone={lead.validationStatus}>{lead.validationStatus}</Badge>
            {lead.validationReason && (
              <p className="text-xs text-slate-500">{lead.validationReason}</p>
            )}
            <div className="text-[11px] text-slate-400">
              {lead.validationCheckedAt
                ? `Last checked ${format(lead.validationCheckedAt, "dd MMM yyyy HH:mm")}`
                : "Not yet checked"}
              {lead.smtpCheckedAt && (
                <>
                  <br />
                  SMTP probe: {format(lead.smtpCheckedAt, "dd MMM yyyy HH:mm")}
                </>
              )}
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
