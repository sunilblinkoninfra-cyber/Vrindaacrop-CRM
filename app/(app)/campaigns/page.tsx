import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge, Card, PageHeader } from "@/components/ui";
import { NewCampaign } from "./new-campaign";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { enrollments: true, steps: true } } },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        subtitle="Multi-step drip sequences per segment."
        actions={<NewCampaign />}
      />

      <Card className="p-0">
        <ul className="divide-y divide-slate-100">
          {campaigns.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 p-4 sm:items-center">
              <div className="min-w-0">
                <Link href={`/campaigns/${c.id}`} className="block truncate font-medium text-brand hover:underline">
                  {c.name}
                </Link>
                <div className="text-xs text-slate-400">
                  {c._count.steps} steps · {c._count.enrollments} enrolled
                </div>
              </div>
              <Badge className={`shrink-0 ${statusTone[c.status]}`}>{c.status}</Badge>
            </li>
          ))}
          {campaigns.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-400">
              No campaigns yet. Create one to start outreach.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
