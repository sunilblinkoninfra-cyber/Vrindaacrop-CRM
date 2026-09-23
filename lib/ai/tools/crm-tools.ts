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

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: `Execution error in ${toolName}: ${err.message}` });
  }
}
