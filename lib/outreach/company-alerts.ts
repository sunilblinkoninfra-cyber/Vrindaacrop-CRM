import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { sendCompanyUnattendedAlert } from "@/lib/notify";

/**
 * Emails the shared company inbox (COMPANY_ALERT_EMAIL) when a lead has been
 * unattended for 24h — for both (a) replied hot leads not acknowledged and
 * (b) new leads sitting untouched. Idempotent: one CompanyAlert row per
 * (lead, kind), so re-runs never double-send. No-op without a company inbox.
 */
export async function runCompanyAlerts(): Promise<{ replies: number; news: number }> {
  if (!env.company.alertEmail) return { replies: 0, news: 0 };
  const cutoff = new Date(Date.now() - env.company.unattendedHours * 3600 * 1000);

  // (a) Replied hot leads not acknowledged within the window.
  const hotLeads = await prisma.lead.findMany({
    where: {
      hot: true,
      updatedAt: { lte: cutoff },
      companyAlerts: { none: { kind: "unattended_reply" } },
    },
    include: { owner: true },
    take: 200,
  });

  let replies = 0;
  for (const lead of hotLeads) {
    const ok = await sendCompanyUnattendedAlert(lead, "unattended_reply");
    if (ok) {
      await prisma.companyAlert.create({ data: { leadId: lead.id, kind: "unattended_reply" } });
      replies++;
    }
  }

  // (b) Inbound-captured leads sitting untouched (never contacted) past the
  // window. Restricted to inbound channels so a bulk-imported cold list does not
  // each generate a company alert — only genuine form/ad inquiries need a fast
  // human response.
  const newLeads = await prisma.lead.findMany({
    where: {
      stage: "NEW",
      isSuppressed: false,
      source: { in: ["website_form", "meta_ads", "google_ads"] },
      createdAt: { lte: cutoff },
      emailEvents: { none: { type: "SENT" } },
      companyAlerts: { none: { kind: "unattended_new" } },
    },
    include: { owner: true },
    take: 200,
  });

  let news = 0;
  for (const lead of newLeads) {
    const ok = await sendCompanyUnattendedAlert(lead, "unattended_new");
    if (ok) {
      await prisma.companyAlert.create({ data: { leadId: lead.id, kind: "unattended_new" } });
      news++;
    }
  }

  return { replies, news };
}
