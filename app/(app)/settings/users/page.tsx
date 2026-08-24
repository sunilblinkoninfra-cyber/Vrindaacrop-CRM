import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { CreateUserForm, UserRoleControl, DeleteUserButton } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSessionUser();
  if (!isOwnerOrAdmin(session.role)) redirect("/leads");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { ownedLeads: true } },
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Add team members and control who can see which leads. Agents only see leads assigned to them; Owner and Admin see everything."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">
            Team ({users.length})
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Assigned leads</th>
                  <th>Access role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-slate-800">{u.name || "—"}</td>
                    <td className="text-slate-600">{u.email}</td>
                    <td className="text-slate-600">{u._count.ownedLeads}</td>
                    <td><UserRoleControl userId={u.id} role={u.role} isSelf={u.id === session.id} /></td>
                    <td>{u.id !== session.id && <DeleteUserButton userId={u.id} name={u.name} email={u.email} leadCount={u._count.ownedLeads} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 lg:hidden">
            {users.map((u) => (
              <article key={u.id} className="space-y-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{u.name || "Unnamed user"}</div>
                  <div className="break-all text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{u._count.ownedLeads} assigned lead{u._count.ownedLeads === 1 ? "" : "s"}</span>
                  {u.id === session.id && <span className="rounded-full bg-brand/10 px-2 py-1 font-medium text-brand">You</span>}
                </div>
                <UserRoleControl userId={u.id} role={u.role} isSelf={u.id === session.id} />
                {u.id !== session.id && <DeleteUserButton userId={u.id} name={u.name} email={u.email} leadCount={u._count.ownedLeads} />}
              </article>
            ))}
          </div>
        </Card>

        <CreateUserForm />
      </div>
    </div>
  );
}
