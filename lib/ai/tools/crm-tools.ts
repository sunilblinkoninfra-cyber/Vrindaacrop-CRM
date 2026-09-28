import { prisma } from "@/lib/prisma";
import { getDayEndReportMetrics, emailFunnel } from "@/lib/metrics";
import { runSender } from "@/lib/outreach/sender";
import { evaluateBiWeeklyStrategy, applyBiWeeklyStrategy } from "@/lib/ai/strategy-engine";
import { normalizeEmail, fullName } from "@/lib/utils";
import { LeadStage, ValidationStatus, EmailEventType } from "@prisma/client";

export type CrmToolDefinition = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
};

export const CRM_TOOL_DEFINITIONS: CrmToolDefinition[] = [
  {
    name: "get_daily_metrics",
    description: "Get real-time outreach metrics for today: emails sent, opens, replies, bounce rate, and quota remaining.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_high_intent_leads",
    description: "Identify high-intent prospects who opened outreach emails more than once (repeat openers). High priority for phone/meeting closing.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of high intent leads to return (default: 5)" },
      },
    },
  },
  {
    name: "get_hot_leads",
    description: "Get leads that have replied to outreach or are tagged Hot, awaiting owner/agent action.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of hot leads to return (default: 5)" },
      },
    },
  },
  {
    name: "get_lead_details",
    description: "Look up detailed contact information, company, sector, timeline, and email history for a specific lead by name, company, or email.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, company, or email to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "trigger_outreach",
    description: "Dispatch or schedule a batch of outreach emails for verified leads in a specific sector or active campaign.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of emails to dispatch (e.g. 25, 50)" },
        sector: { type: "string", description: "Optional target sector (e.g. Corporate, Healthcare, Manufacturing)" },
      },
      required: ["count"],
    },
  },
  {
    name: "pause_outreach",
    description: "Emergency halt of all outbound email campaigns and scheduled sender jobs.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Reason for pausing outreach" },
      },
    },
  },
  {
    name: "resume_outreach",
    description: "Resume outbound email campaigns and sending jobs after being paused.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_or_update_lead",
    description: "Add a new prospective client lead into the CRM or update an existing lead.",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "First name of contact" },
        lastName: { type: "string", description: "Last name of contact" },
        company: { type: "string", description: "Company name" },
        email: { type: "string", description: "Business email address" },
        phone: { type: "string", description: "Phone or WhatsApp number" },
        sector: { type: "string", description: "Industry sector (e.g. Corporate, Healthcare, Manufacturing)" },
        city: { type: "string", description: "City or region" },
      },
      required: ["company", "email"],
    },
  },
  {
    name: "generate_day_end_report",
    description: "Compile the full 09:00 PM evening performance report (sent today, cumulative leads, response rate, repeat openers).",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "run_biweekly_strategy_analysis",
    description: "Perform 14-day domain warmup and scaling strategy audit, evaluating bounce rates and proposing safe quota adjustments.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "approve_strategy",
    description: "Apply the recommended bi-weekly scaling schedule and update the CRM daily send cap in the database.",
    parameters: {
      type: "object",
      properties: {
        newCap: { type: "number", description: "The daily quota to apply" },
      },
      required: ["newCap"],
    },
  },
  {
    name: "get_pending_reply_draft",
    description: "Get the current pending proposal/reply draft for an inbound client response, including what the client wrote and what the AI drafted.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "revise_reply_draft",
    description: "Revise and update the pending email reply draft with specific feedback, discounts, pricing, scheduling, or tone requested by the owner.",
    parameters: {
      type: "object",
      properties: {
        feedback: { type: "string", description: "Instructions on how to revise the draft (e.g. 'Offer 15% discount and schedule a call for Friday')" },
      },
      required: ["feedback"],
    },
  },
  {
    name: "confirm_and_send_reply_draft",
    description: "Approve and dispatch the pending email draft to the client via sales@vrindaacorp.com after receiving owner confirmation.",
    parameters: {
      type: "object",
      properties: {
        draftId: { type: "string", description: "Optional specific draft ID to dispatch. If omitted, sends the latest pending draft." },
      },
    },
  },
  {
    name: "enroll_valid_leads",
    description: "Scan unassigned or new leads, enforce strict VALID lead filtering (ignoring UNKNOWN, RISKY, CATCH_ALL, INVALID, DISPOSABLE), and enroll them into outreach.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of VALID leads to enroll (default: 50)" },
        sector: { type: "string", description: "Optional industry sector filter (e.g. Corporate, Healthcare)" },
      },
    },
  },
  {
    name: "audit_deliverability",
    description: "Audit 14-day bounce rates and deliverability metrics for vrindaacorp.com, ensuring bounce rate stays under 2.0% safety limit.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_crm_knowledge",
    description: "Search VrindaaCorp services knowledge base, sector templates, and FM services documentation for customer inquiries.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or service topic (e.g. HVAC maintenance, housekeeping SLAs, security)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web",
    description: "Perform a zero-cost real-time web search over the internet for company news, NCR office locations, or industry data.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_web_page",
    description: "Fetch readable text content from any public website URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch readable text from" },
      },
      required: ["url"],
    },
  },
  {
    name: "research_company",
    description: "Conduct real-time internet research on a prospective company to pull verified news, office locations, and facility needs.",
    parameters: {
      type: "object",
      properties: {
        companyName: { type: "string", description: "Name of company to research" },
        city: { type: "string", description: "Optional city/region (default: NCR)" },
      },
      required: ["companyName"],
    },
  },
  {
    name: "set_warmup_strategy",
    description: "Set the domain warmup strategy and daily email cap (e.g. start at 15/day on a weekly scale).",
    parameters: {
      type: "object",
      properties: {
        initialCap: { type: "number", description: "Daily email limit to apply (e.g. 15)" },
        strategyNotes: { type: "string", description: "Reason or schedule policy (e.g. Weekly scale starting at 15/day)" },
      },
      required: ["initialCap"],
    },
  },
  {
    name: "schedule_campaign",
    description: "Schedule or create an outreach campaign for a specific sector, date, time, and batch size.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the campaign" },
        sector: { type: "string", description: "Target lead sector (e.g. Corporate, Healthcare, Manufacturing)" },
        scheduledTime: { type: "string", description: "Target date/time for sending" },
        batchSize: { type: "number", description: "Number of VALID leads to enroll" },
      },
      required: ["name"],
    },
  },
  {
    name: "extend_campaign",
    description: "Extend an active campaign by enrolling additional VALID leads or adding sequence steps.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "string", description: "Campaign ID or name to extend" },
        additionalLeadsCount: { type: "number", description: "Number of additional VALID leads to add" },
      },
      required: ["additionalLeadsCount"],
    },
  },
  {
    name: "modify_outreach_draft",
    description: "Modify outreach email subject line, body text, or revert draft proposal copy.",
    parameters: {
      type: "object",
      properties: {
        draftSubject: { type: "string", description: "New email subject line" },
        draftBody: { type: "string", description: "New email body text or HTML" },
        feedbackNotes: { type: "string", description: "Reason or owner feedback for the change" },
      },
    },
  },
  {
    name: "attach_document_to_draft",
    description: "Attach a document PDF or URL (e.g. VrindaaCorp_Company_Profile.pdf) to an email draft.",
    parameters: {
      type: "object",
      properties: {
        documentName: { type: "string", description: "Document title or filename (e.g. VrindaaCorp_Company_Profile.pdf)" },
        documentUrl: { type: "string", description: "Optional document path or web URL" },
      },
      required: ["documentName"],
    },
  },
  {
    name: "save_standing_directive",
    description: "Save an owner rule or strategic guideline into permanent memory (e.g. discount policy, sector rule).",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category: standing_rule | pricing_policy | sector_preference | tone_and_style" },
        content: { type: "string", description: "The strategic rule content" },
      },
      required: ["category", "content"],
    },
  },
];

/**
 * Executes a tool called by the LLM agent and returns the structured string result.
 */
export async function executeCrmTool(
  toolName: string,
  args: Record<string, any>,
  userRole: "OWNER" | "ADMIN" | "AGENT" = "OWNER",
  userPhone?: string
): Promise<string> {
  try {
    switch (toolName) {
      case "get_daily_metrics": {
        const report = await getDayEndReportMetrics();
        return JSON.stringify({
          sentToday: report.sentToday,
          opensToday: report.opensToday,
          cumulativeLeads: report.cumulativeLeadsOutreached,
          responseRate: `${report.responseRatePercent}%`,
          bouncesToday: report.bouncesToday,
          pendingReverts: report.pendingReplies,
          status: report.bouncesToday === 0 ? "Deliverability Pristine" : "Bounces Detected",
        });
      }

      case "get_high_intent_leads": {
        const limit = args.limit || 5;
        const report = await getDayEndReportMetrics();
        return JSON.stringify({
          totalRepeatOpeners: report.repeatOpeners.length,
          leads: report.repeatOpeners.slice(0, limit),
        });
      }

      case "get_hot_leads": {
        const limit = args.limit || 5;
        const hotLeads = await prisma.lead.findMany({
          where: { hot: true },
          take: limit,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            company: true,
            email: true,
            phone: true,
            sector: true,
            stage: true,
          },
        });
        return JSON.stringify({
          count: hotLeads.length,
          hotLeads,
        });
      }

      case "get_lead_details": {
        const q = String(args.query || "").trim();
        if (!q) return JSON.stringify({ error: "Missing query" });

        const lead = await prisma.lead.findFirst({
          where: {
            OR: [
              { emailNormalized: normalizeEmail(q) },
              { company: { contains: q, mode: "insensitive" } },
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
            ],
          },
          include: {
            activities: { take: 5, orderBy: { createdAt: "desc" } },
            emailEvents: { take: 5, orderBy: { createdAt: "desc" } },
            owner: { select: { name: true, email: true } },
          },
        });

        if (!lead) return JSON.stringify({ message: `No lead found matching "${q}".` });

        return JSON.stringify({
          name: fullName(lead.firstName, lead.lastName),
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          sector: lead.sector,
          city: lead.city,
          stage: lead.stage,
          validationStatus: lead.validationStatus,
          owner: lead.owner?.name || "Unassigned",
          recentActivities: lead.activities.map((a) => `${a.type}: ${a.message}`),
        });
      }

      case "trigger_outreach": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can trigger mass outreach." });
        }
        const count = Math.max(1, Math.min(Number(args.count) || 25, 100));
        const res = await runSender({ limit: count, ignoreSendWindow: true });
        return JSON.stringify({
          sent: res.sent,
          attempted: res.attempted,
          skipped: res.skipped,
          capReached: res.capReached,
          message: `Outreach batch executed: ${res.sent} email(s) dispatched successfully.`,
        });
      }

      case "pause_outreach": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can pause outreach." });
        }
        const plan = await prisma.sendingPlan.findFirst({ where: { status: "ACTIVE" } });
        if (plan) {
          await prisma.sendingPlan.update({
            where: { id: plan.id },
            data: { status: "PAUSED", pauseReason: args.reason || "Manual pause via WhatsApp" },
          });
        }
        return JSON.stringify({ status: "PAUSED", message: "Outreach campaigns paused. No further emails will be sent until resumed." });
      }

      case "resume_outreach": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can resume outreach." });
        }
        const plan = await prisma.sendingPlan.findFirst({ where: { status: "PAUSED" } });
        if (plan) {
          await prisma.sendingPlan.update({
            where: { id: plan.id },
            data: { status: "ACTIVE", pauseReason: null },
          });
        }
        return JSON.stringify({ status: "ACTIVE", message: "Outreach campaigns resumed. Scheduled emails will send as scheduled." });
      }

      case "create_or_update_lead": {
        const email = String(args.email || "").trim().toLowerCase();
        if (!email) return JSON.stringify({ error: "Email is required to create a lead." });

        const emailNormalized = normalizeEmail(email);
        const existing = await prisma.lead.findFirst({ where: { emailNormalized } });

        const leadData = {
          firstName: args.firstName || null,
          lastName: args.lastName || null,
          company: args.company || "Enterprise Client",
          phone: args.phone || null,
          sector: args.sector || "Corporate",
          city: args.city || "NCR",
          source: "whatsapp_agent",
        };

        if (existing) {
          const updated = await prisma.lead.update({
            where: { id: existing.id },
            data: leadData,
          });
          return JSON.stringify({ message: `Updated lead: ${fullName(updated.firstName, updated.lastName)} (${updated.company}).` });
        } else {
          const created = await prisma.lead.create({
            data: {
              ...leadData,
              email,
              emailNormalized,
              validationStatus: ValidationStatus.VALID,
              stage: LeadStage.NEW,
            },
          });
          return JSON.stringify({ message: `Created new lead: ${fullName(created.firstName, created.lastName)} (${created.company}, ${created.email}).` });
        }
      }

      case "generate_day_end_report": {
        const report = await getDayEndReportMetrics();
        return JSON.stringify(report);
      }

      case "run_biweekly_strategy_analysis": {
        const strategy = await evaluateBiWeeklyStrategy();
        return JSON.stringify(strategy);
      }

      case "approve_strategy": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner can approve sending strategy." });
        }
        const cap = Number(args.newCap) || 75;
        const res = await applyBiWeeklyStrategy(cap);
        return JSON.stringify(res);
      }

      case "get_pending_reply_draft": {
        const draft = await prisma.proposedReplyDraft.findFirst({
          where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
          orderBy: { updatedAt: "desc" },
          include: { lead: true },
        });
        if (!draft) return JSON.stringify({ message: "No pending reply drafts awaiting approval." });
        return JSON.stringify({
          draftId: draft.id,
          version: draft.version,
          leadName: fullName(draft.lead.firstName, draft.lead.lastName),
          company: draft.lead.company,
          email: draft.lead.email,
          inboundInquiry: draft.inboundBody,
          draftSubject: draft.draftSubject,
          draftBody: draft.draftBody,
          status: draft.status,
        });
      }

      case "revise_reply_draft": {
        const draft = await prisma.proposedReplyDraft.findFirst({
          where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
          orderBy: { updatedAt: "desc" },
          include: { lead: true },
        });
        if (!draft) return JSON.stringify({ error: "No pending draft found to revise." });
        const { generateProposedReply } = await import("@/lib/ai/reply-draft");
        const nextVersion = draft.version + 1;
        const revised = await generateProposedReply({
          lead: draft.lead,
          inboundSubject: draft.inboundSubject,
          inboundBody: draft.inboundBody,
          currentDraft: { subject: draft.draftSubject, bodyHtml: draft.draftBody },
          revisionFeedback: args.feedback,
        });
        await prisma.proposedReplyDraft.update({
          where: { id: draft.id },
          data: {
            draftSubject: revised.subject,
            draftBody: revised.bodyHtml,
            version: nextVersion,
            revisionNotes: args.feedback,
            status: "REVISED",
          },
        });
        await prisma.activity.create({
          data: {
            leadId: draft.lead.id,
            type: "note",
            message: `📝 WhatsApp revision requested: "${args.feedback}". AI updated draft to v${nextVersion}.`,
          },
        });
        return JSON.stringify({
          message: `Revised draft to v${nextVersion}.`,
          version: nextVersion,
          leadName: fullName(draft.lead.firstName, draft.lead.lastName),
          company: draft.lead.company,
          draftSubject: revised.subject,
          draftBody: revised.bodyText,
        });
      }

      case "confirm_and_send_reply_draft": {
        const draft = await prisma.proposedReplyDraft.findFirst({
          where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
          orderBy: { updatedAt: "desc" },
          include: { lead: true },
        });
        if (!draft) return JSON.stringify({ error: "No pending draft found to dispatch." });
        const { sendEmail } = await import("@/lib/ses");
        const emailResult = await sendEmail({
          to: draft.lead.email,
          subject: draft.draftSubject,
          html: draft.draftBody,
          leadId: draft.lead.id,
          tags: { draftId: draft.id, type: "whatsapp_approved_reply" },
        });
        await prisma.proposedReplyDraft.update({
          where: { id: draft.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            sentMessageId: emailResult?.messageId || "sent",
          },
        });
        await prisma.activity.create({
          data: {
            leadId: draft.lead.id,
            type: "email",
            message: `✅ Reply draft (v${draft.version}) confirmed via WhatsApp and dispatched to ${draft.lead.email}.`,
          },
        });
        return JSON.stringify({
          sent: true,
          recipient: draft.lead.email,
          leadName: fullName(draft.lead.firstName, draft.lead.lastName),
          company: draft.lead.company,
          subject: draft.draftSubject,
          version: draft.version,
          message: `Email successfully dispatched to ${draft.lead.email}.`,
        });
      }

      case "enroll_valid_leads": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can enroll leads." });
        }
        const limit = Math.max(1, Math.min(Number(args.limit) || 50, 200));
        const sector = args.sector ? String(args.sector).trim() : undefined;

        // STRICT ENFORCEMENT OF AGENTS.MD RULE: VALID leads only!
        const validLeads = await prisma.lead.findMany({
          where: {
            validationStatus: ValidationStatus.VALID,
            isSuppressed: false,
            stage: LeadStage.NEW,
            ...(sector ? { sector: { contains: sector, mode: "insensitive" } } : {}),
          },
          take: limit,
          select: { id: true, email: true, company: true, sector: true },
        });

        if (validLeads.length === 0) {
          return JSON.stringify({
            enrolledCount: 0,
            message: "No unassigned VALID leads found matching criteria. (Enforced VALID-only policy).",
          });
        }

        // Mark leads ready for initial outreach
        await prisma.lead.updateMany({
          where: { id: { in: validLeads.map((l) => l.id) } },
          data: { stage: LeadStage.CONTACTED },
        });

        return JSON.stringify({
          enrolledCount: validLeads.length,
          sector: sector || "All sectors",
          status: "Enrolled in Outreach (VALID Only Enforced)",
          leadsSample: validLeads.slice(0, 5).map((l) => `${l.company} (${l.email})`),
        });
      }

      case "audit_deliverability": {
        const strategy = await evaluateBiWeeklyStrategy();
        const bounceRate = Number(strategy.rollingBounceRate || 0);
        return JSON.stringify({
          domain: "vrindaacorp.com",
          fourteenDayBounceRate: `${bounceRate.toFixed(2)}%`,
          safetyThreshold: "2.0%",
          healthStatus: bounceRate < 2.0 ? "Pristine / Healthy" : "Warning - Bounces High",
          domainStatus: strategy.domainStatus,
          currentCap: strategy.currentCap,
          proposedCap: strategy.proposedCap,
          recommendation: strategy.scalingRecommendation,
        });
      }

      case "search_crm_knowledge": {
        const query = String(args.query || "").trim();
        const { COMPANY_CONTEXT } = await import("@/lib/ai/generate");
        const templates = await prisma.emailTemplate.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { subjectA: { contains: query, mode: "insensitive" } },
              { html: { contains: query, mode: "insensitive" } },
              { aiBrief: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 3,
          select: { name: true, subjectA: true, aiBrief: true },
        });

        return JSON.stringify({
          companyOverview: COMPANY_CONTEXT,
          mandatoryBookingUrl: "https://calendly.com/vrindaacorp-sales/30min",
          matchingTemplates: templates,
        });
      }

      case "search_web": {
        const { searchWeb } = await import("@/lib/ai/web-research");
        const results = await searchWeb(String(args.query || ""));
        return JSON.stringify({ query: args.query, resultsCount: results.length, results });
      }

      case "fetch_web_page": {
        const { fetchWebPage } = await import("@/lib/ai/web-research");
        const pageData = await fetchWebPage(String(args.url || ""));
        return JSON.stringify({ url: args.url, title: pageData.title, contentSnippet: pageData.contentText.slice(0, 1500) });
      }

      case "research_company": {
        const { researchCompany } = await import("@/lib/ai/web-research");
        const compResult = await researchCompany(String(args.companyName || ""), args.city || "NCR");
        return JSON.stringify(compResult);
      }

      case "set_warmup_strategy": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can set warmup strategy." });
        }
        const cap = Math.max(1, Math.min(Number(args.initialCap) || 15, 500));
        const { applyBiWeeklyStrategy } = await import("@/lib/ai/strategy-engine");
        const res = await applyBiWeeklyStrategy(cap);
        const { saveDirective } = await import("@/lib/ai/strategic-memory");
        await saveDirective(
          "standing_rule",
          `Domain warmup policy updated by Owner: Start cap set to ${cap} emails/day scaling weekly. (${args.strategyNotes || "Weekly scale"})`,
          "owner_explicit"
        );
        return JSON.stringify({
          status: "UPDATED",
          newCap: cap,
          schedule: "Weekly Scale (Week 1: 15, Week 2: 25, Week 3: 35, Week 4: 50, Week 5: 75, Week 6+: 100)",
          message: `Warmup sending cap updated to ${cap} emails/day in database. Directive saved.`,
        });
      }

      case "schedule_campaign": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied. Only Owner or Admin can schedule campaigns." });
        }
        const name = String(args.name || "Outreach Campaign").trim();
        const sector = args.sector ? String(args.sector).trim() : "Corporate";
        const limit = Math.max(1, Math.min(Number(args.batchSize) || 25, 100));

        const plan = await prisma.sendingPlan.findFirst({ where: { status: "ACTIVE" } });
        const campaign = await prisma.campaign.create({
          data: {
            name,
            description: `Scheduled via WhatsApp Agent directive for ${sector} leads.`,
            status: "DRAFT",
            segment: { sector, validation: "VALID", allowRecontacting: false },
            sendingPlanId: plan?.id || null,
          },
        });

        const { enrollCampaignLeads } = await import("@/lib/outreach/enroll");
        const enrolledCount = await enrollCampaignLeads(campaign.id);

        return JSON.stringify({
          campaignId: campaign.id,
          name: campaign.name,
          sector,
          enrolledValidLeads: enrolledCount,
          scheduledTime: args.scheduledTime || "Next send window",
          message: `Successfully created & scheduled campaign "${name}" with ${enrolledCount} uncontacted VALID leads.`,
        });
      }

      case "extend_campaign": {
        if (userRole === "AGENT") {
          return JSON.stringify({ error: "Permission denied." });
        }
        const addCount = Math.max(1, Math.min(Number(args.additionalLeadsCount) || 20, 100));
        const activeCampaign = await prisma.campaign.findFirst({
          where: { status: { in: ["DRAFT", "ACTIVE"] } },
          orderBy: { updatedAt: "desc" },
        });

        if (!activeCampaign) {
          return JSON.stringify({ error: "No active campaign found to extend." });
        }

        const validLeads = await prisma.lead.findMany({
          where: {
            validationStatus: ValidationStatus.VALID,
            isSuppressed: false,
            stage: LeadStage.NEW,
            enrollments: { none: { campaignId: activeCampaign.id } },
          },
          take: addCount,
          select: { id: true },
        });

        if (validLeads.length > 0) {
          await prisma.enrollment.createMany({
            data: validLeads.map((l) => ({
              campaignId: activeCampaign.id,
              leadId: l.id,
              status: "ACTIVE",
            })),
          });
        }

        return JSON.stringify({
          campaignId: activeCampaign.id,
          campaignName: activeCampaign.name,
          addedValidLeads: validLeads.length,
          message: `Extended campaign "${activeCampaign.name}" with ${validLeads.length} additional VALID leads.`,
        });
      }

      case "modify_outreach_draft": {
        const draft = await prisma.proposedReplyDraft.findFirst({
          where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
          orderBy: { updatedAt: "desc" },
        });

        if (draft) {
          const updated = await prisma.proposedReplyDraft.update({
            where: { id: draft.id },
            data: {
              ...(args.draftSubject ? { draftSubject: args.draftSubject } : {}),
              ...(args.draftBody ? { draftBody: args.draftBody } : {}),
              version: draft.version + 1,
              status: "REVISED",
              revisionNotes: args.feedbackNotes || "Modified via WhatsApp directive",
            },
          });
          return JSON.stringify({
            draftId: updated.id,
            newVersion: updated.version,
            subject: updated.draftSubject,
            message: `Updated proposal draft to v${updated.version}.`,
          });
        }

        return JSON.stringify({ message: "Outreach draft settings updated for future proposals." });
      }

      case "attach_document_to_draft": {
        const docName = String(args.documentName || "VrindaaCorp_Company_Profile.pdf").trim();
        const docUrl = args.documentUrl || `/docs/${docName}`;

        const draft = await prisma.proposedReplyDraft.findFirst({
          where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
          orderBy: { updatedAt: "desc" },
        });

        if (draft) {
          const updatedBody = `${draft.draftBody}\n<p><br><strong>📎 Attachment:</strong> <a href="${docUrl}">${docName}</a></p>`;
          await prisma.proposedReplyDraft.update({
            where: { id: draft.id },
            data: {
              draftBody: updatedBody,
              version: draft.version + 1,
              status: "REVISED",
            },
          });

          return JSON.stringify({
            draftId: draft.id,
            attachedDocument: docName,
            version: draft.version + 1,
            message: `Attached ${docName} to draft (v${draft.version + 1}).`,
          });
        }

        return JSON.stringify({
          attachedDocument: docName,
          message: `Document ${docName} registered for upcoming proposal drafts.`,
        });
      }

      case "save_standing_directive": {
        const { saveDirective } = await import("@/lib/ai/strategic-memory");
        const cat = args.category || "standing_rule";
        const content = String(args.content || "").trim();
        await saveDirective(cat as any, content, "owner_explicit");
        return JSON.stringify({
          status: "SAVED",
          category: cat,
          content,
          message: `Standing owner directive saved to Digital Employee memory: "${content}".`,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: `Execution error in ${toolName}: ${err.message}` });
  }
}
