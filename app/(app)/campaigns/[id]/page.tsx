import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CampaignBuilder } from "./builder";
import { EnrolledLeads } from "./enrolled-leads";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, templates] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        steps: { orderBy: { order: "asc" }, include: { template: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.emailTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!campaign) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{campaign.name}</h1>
        <p className="text-sm text-slate-500">Configure segment, sequence and launch.</p>
      </div>
      <CampaignBuilder
        campaignId={campaign.id}
        status={campaign.status}
        segment={(campaign.segment ?? {}) as Record<string, string>}
        steps={campaign.steps.map((s) => ({
          id: s.id,
          order: s.order,
          delayDays: s.delayDays,
          templateName: s.template.name,
        }))}
        templates={templates}
        enrolledCount={campaign._count.enrollments}
      />
      <EnrolledLeads campaignId={campaign.id} />
    </div>
  );
}
