import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { NewCampaign } from "./new-campaign";
import { CampaignsList } from "./campaigns-list";

export const dynamic = "force-dynamic";

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
        <CampaignsList campaigns={campaigns} />
      </Card>
    </div>
  );
}
