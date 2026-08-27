import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { SourcesClient } from "./sources-client";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role === "AGENT") redirect("/leads");

  const [logs, counts] = await Promise.all([
    prisma.inboundLeadLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.lead.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of counts) {
    if (c.source) countMap[c.source] = c._count._all;
  }

  const config = {
    appUrl: env.appUrl,
    googleLeadKey: env.inbound.googleLeadKey,
    metaVerifyToken: env.inbound.metaVerifyToken,
    metaAppSecretConfigured: Boolean(env.inbound.metaAppSecret),
    metaPageTokenConfigured: Boolean(env.inbound.metaPageToken),
    formSecret: env.inbound.formSecret,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Capture & Ad Integrations"
        subtitle="Manage inbound webhooks for Google Ads, Meta Ads (Facebook/Instagram), and Website Forms. Leads captured here are automatically validated, de-duplicated, and assigned."
      />

      <SourcesClient config={config} counts={countMap} logs={logs} />
    </div>
  );
}
