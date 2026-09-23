import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveOutboundSender } from "@/lib/ses";
import { CampaignBuilder } from "./builder";
import { EnrolledLeads } from "./enrolled-leads";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, templates, firstEnrollment] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        steps: { orderBy: { order: "asc" }, include: { template: true } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.emailTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.enrollment.findFirst({
      where: { campaignId: params.id },
      include: { lead: true },
    }),
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
          subjectA: s.template.subjectA,
          subjectB: s.template.subjectB,
          html: s.template.html,
          aiEnabled: s.template.aiEnabled,
        }))}
        templates={templates}
        enrolledCount={campaign._count.enrollments}
        outboundSender={outboundSender}
        sampleLead={
          firstEnrollment?.lead
            ? {
                firstName: firstEnrollment.lead.firstName,
                lastName: firstEnrollment.lead.lastName,
                company: firstEnrollment.lead.company,
                sector: firstEnrollment.lead.sector,
                city: firstEnrollment.lead.city,
                email: firstEnrollment.lead.email,
              }
            : undefined
        }
      />
      <EnrolledLeads campaignId={campaign.id} />
    </div>
  );
}

