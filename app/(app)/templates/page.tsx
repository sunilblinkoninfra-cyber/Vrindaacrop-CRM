import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { TemplateManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Email Templates"
        subtitle="Personalized, mobile-friendly HTML templates with A/B subject variants."
      />
      <TemplateManager templates={templates} />
    </div>
  );
}
