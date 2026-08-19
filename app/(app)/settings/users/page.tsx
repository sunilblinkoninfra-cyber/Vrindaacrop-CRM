import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser, isOwnerOrAdmin } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { CreateUserForm, UserRoleControl } from "./users-client";

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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-0">
          <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">
            Team ({users.length})
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Assigned leads</th>
                <th>Access role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-slate-800">{u.name || "—"}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td className="text-slate-600">{u._count.ownedLeads}</td>
                  <td>
                    <UserRoleControl userId={u.id} role={u.role} isSelf={u.id === session.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <CreateUserForm />
      </div>
    </div>
  );
}
