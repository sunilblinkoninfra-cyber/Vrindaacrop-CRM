import { prisma } from "@/lib/prisma";
import { getDashboardAnalytics, DashboardFilter } from "@/lib/metrics";
import { getSessionUser, leadScopeWhere, isOwnerOrAdmin } from "@/lib/rbac";
import { DashboardClient } from "./dashboard-client";
import { ValidationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const user = await getSessionUser();
  const scope = leadScopeWhere(user);
  const canManage = isOwnerOrAdmin(user.role);

  const filters: DashboardFilter = {
    timeframe: (searchParams?.timeframe as any) || "all",
    sector: searchParams?.sector,
    geography: searchParams?.geography,
    ownerId: searchParams?.ownerId,
    validationStatus: searchParams?.validation as ValidationStatus,
    campaignId: searchParams?.campaignId,
  };

  const [analyticsData, users] = await Promise.all([
    getDashboardAnalytics(scope, filters),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <DashboardClient
      initialData={analyticsData as any}
      users={users}
      isOwnerOrAdmin={canManage}
    />
  );
}
