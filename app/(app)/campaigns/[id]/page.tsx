import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveOutboundSender } from "@/lib/ses";
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

  const outboundSender = getActiveOutboundSender();

  return (
    <div className="space-y-4">
      <CampaignBuilder
        campaignId={campaign.id}
        campaignName={campaign.name}
        status={campaign.status}
        segment={(campaign.segment ?? {}) as Record<string, string>}
        steps={campaign.steps.map((s) => ({
          id: s.id,
          order: s.order,
          delayDays: s.delayDays,
          templateId: s.templateId,
          templateName: s.template.name,
        }))}
        templates={templates}
        enrolledCount={campaign._count.enrollments}
        outboundSender={outboundSender}
      />
      <EnrolledLeads campaignId={campaign.id} />
    </div>
  );
}

