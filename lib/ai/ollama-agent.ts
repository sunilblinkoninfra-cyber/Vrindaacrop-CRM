import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getDayEndReportMetrics } from "@/lib/metrics";
import { CRM_TOOL_DEFINITIONS, executeCrmTool } from "@/lib/ai/tools/crm-tools";
import {
  getOwnerStrategicMemory,
  formatMemoryForPrompt,
  autoLearnFromOwnerAction,
} from "@/lib/ai/strategic-memory";
import { fullName } from "@/lib/utils";

export type AgentResponse = {
  text: string;
  toolsExecuted?: string[];
  latencyMs?: number;
};

/**
 * Runs the conversational Ollama agent with deep context, fast-path routing,
 * and continuous strategic memory alignment.
 */
export async function runOllamaAgent(args: {
  userMessage: string;
  userPhone: string;
  userRole: "OWNER" | "ADMIN" | "AGENT";
  userName?: string;
}): Promise<AgentResponse> {
  const startTime = Date.now();
  const { userMessage, userPhone, userRole, userName } = args;
  const trimmedUserMessage = userMessage.trim();
  const rawBase = env.ai.localBaseUrl || "http://127.0.0.1:11434";
  const base = rawBase.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  const model = env.ai.localModel || "llama3.2:3b";

  // 1. FAST-PATH: Direct 1-word confirmation check (< 100ms response time!)
  const isDirectConfirmation = /^(yes|confirm(ed)?|send|approved?|proceed|go\s*ahead|looks?\s*good|send\s*it|ship\s*it|ok(ay)?)(\s*!*)?$/i.test(
    trimmedUserMessage
  );

  if (isDirectConfirmation) {
    const pendingDraft = await prisma.proposedReplyDraft.findFirst({
      where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
      orderBy: { updatedAt: "desc" },
      include: { lead: true },
    });

    if (pendingDraft) {
      const clientName = fullName(pendingDraft.lead.firstName, pendingDraft.lead.lastName) || pendingDraft.lead.email;
      const { sendEmail } = await import("@/lib/ses");

      const emailResult = await sendEmail({
        to: pendingDraft.lead.email,
        subject: pendingDraft.draftSubject,
        html: pendingDraft.draftBody,
        leadId: pendingDraft.lead.id,
        tags: { draftId: pendingDraft.id, type: "whatsapp_fast_approved_reply" },
      });

      await prisma.proposedReplyDraft.update({
        where: { id: pendingDraft.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          sentMessageId: emailResult?.messageId || "sent",
        },
      });

      await prisma.activity.create({
        data: {
          leadId: pendingDraft.lead.id,
          type: "email",
          message: `✅ Reply draft (v${pendingDraft.version}) approved via WhatsApp fast-path and dispatched to ${pendingDraft.lead.email}.`,
        },
      });

      const fastConfirmResponse = `🧠 *WHAT I UNDERSTOOD:*
You confirmed and approved dispatch of the proposal (v${pendingDraft.version}) for *${clientName}* (${pendingDraft.lead.company || "Client"}).

🚀 *PROCEEDED & DISPATCHED:*
✅ Email dispatched to *${pendingDraft.lead.email}* via \`sales@vrindaacorp.com\`.
• Subject: "${pendingDraft.draftSubject}"
• Version: v${pendingDraft.version}
• Time: ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
• Timeline activity recorded.`;

      await saveMemory(userPhone, trimmedUserMessage, fastConfirmResponse);
      return {
        text: fastConfirmResponse,
        toolsExecuted: ["confirm_and_send_reply_draft"],
        latencyMs: Date.now() - startTime,
      };
    } else {
      // Instant confirmation fast-path when no drafts are pending
      const noPendingResponse = `🧠 *WHAT I UNDERSTOOD:*
You sent an execution confirmation ("${trimmedUserMessage}").

📋 *STATUS:*
There are currently no proposals or draft emails awaiting approval. All previous proposals have been executed.

🚀 *NEXT STEP:*
• Reply *STATUS* to check live campaign metrics.
• Reply *WHO OPENED TODAY* to see hot prospects.
• Or provide any strategic instruction (e.g., "Offer 10% discount on annual security contracts").`;

      await saveMemory(userPhone, trimmedUserMessage, noPendingResponse);
      return {
        text: noPendingResponse,
        toolsExecuted: [],
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // 1b. FAST-PATH: Direct Status & Metrics Check (< 50ms response time!)
  if (/^(status|metrics|report|daily\s*status)$/i.test(trimmedUserMessage)) {
    const report = await getDayEndReportMetrics();
    const statusResponse = `🧠 *WHAT I UNDERSTOOD:*
You requested real-time operational status and metrics for VrindaaCorp outreach.

📋 *LIVE CRM METRICS:*
• *Emails Sent Today:* ${report.sentToday}
• *Cumulative Reach:* ${report.cumulativeLeadsOutreached} leads
• *Response Rate:* ${report.responseRatePercent}%
• *Bounces Today:* ${report.bouncesToday}
• *Repeat Openers Today:* ${report.repeatOpeners.length} lead(s)

🚀 *NEXT STEP:*
Reply *WHO OPENED TODAY* to view lead company names and engagement scores.`;

    await saveMemory(userPhone, trimmedUserMessage, statusResponse);
    return {
      text: statusResponse,
      toolsExecuted: ["get_daily_metrics"],
      latencyMs: Date.now() - startTime,
    };
  }

  // 1c. FAST-PATH: Direct Openers / Hot Leads Check (< 50ms response time!)
  if (/^(who\s*opened(\s*today)?|openers|hot\s*leads)$/i.test(trimmedUserMessage)) {
    const report = await getDayEndReportMetrics();
    let leadsList = "No repeat opens recorded today yet.";
    if (report.repeatOpeners.length > 0) {
      leadsList = report.repeatOpeners
        .slice(0, 5)
        .map((r, i) => `${i + 1}. *${r.name || r.email}* (${r.company}) — ${r.openCount} opens`)
        .join("\n");
    }

    const openersResponse = `🧠 *WHAT I UNDERSTOOD:*
You requested the list of high-intent leads who opened emails today.

📋 *HOT LEADS / REPEAT OPENERS:*
${leadsList}

🚀 *NEXT STEP:*
Reply with lead name to review details, or reply *STATUS* for overall metrics.`;

    await saveMemory(userPhone, trimmedUserMessage, openersResponse);
    return {
      text: openersResponse,
      toolsExecuted: ["get_high_intent_leads"],
      latencyMs: Date.now() - startTime,
    };
  }

  // 2. Continuous Memory Learning: Extract rules or preferences from message
  try {
    await autoLearnFromOwnerAction({ userMessage: trimmedUserMessage });
  } catch (err) {
    console.warn("[autoLearnFromOwnerAction error]:", err);
  }

  // 3. Gather Live Strategic Playbook & Situation Context
  let metricsSummary = "No metrics available.";
  let pendingDraftContext = "No client email replies pending approval.";
  let strategicPlaybook = "";
  let conversationHistory: any[] = [];

  try {
    const memory = await getOwnerStrategicMemory();
    strategicPlaybook = formatMemoryForPrompt(memory);
  } catch (err) {
    console.warn("[Ollama Strategic Memory fetch failed]:", err);
  }

  try {
    const report = await getDayEndReportMetrics();
    metricsSummary = `Emails Sent Today: ${report.sentToday} | Cumulative Reach: ${report.cumulativeLeadsOutreached} | Response Rate: ${report.responseRatePercent}% | Bounces Today: ${report.bouncesToday} | Repeat Openers Today: ${report.repeatOpeners.length}`;
  } catch (err) {
    console.warn("[Ollama Agent Context] Metrics fetch failed:", err);
  }

  try {
    const draft = await prisma.proposedReplyDraft.findFirst({
      where: { status: { in: ["PENDING_APPROVAL", "REVISED"] } },
      orderBy: { updatedAt: "desc" },
      include: { lead: true },
    });

    if (draft) {
      const clientName = fullName(draft.lead.firstName, draft.lead.lastName) || draft.lead.email;
      pendingDraftContext = `
[ACTIVE CLIENT REVERT PENDING APPROVAL]
- Client: ${clientName} (${draft.lead.company})
- Client Email: ${draft.lead.email}
- Inbound Client Inquiry: "${draft.inboundBody.slice(0, 250)}"
- Current Draft (v${draft.version}):
  Subject: ${draft.draftSubject}
  Body: ${draft.draftBody.replace(/<[^>]*>/g, "").slice(0, 300)}
- Status: ${draft.status}
`;
    }
  } catch (err) {
    console.warn("[Ollama Agent Context] Draft fetch failed:", err);
  }

  // 4. Fetch Last 4 WhatsApp Conversation Memory turns
  try {
    const pastPayloads = await prisma.inboundLeadLog.findMany({
      where: { channel: "whatsapp_conversation" },
      orderBy: { createdAt: "desc" },
      take: 4,
    });

    for (const p of pastPayloads.reverse()) {
      const data = p.payload as any;
      if (data?.userMessage) {
        conversationHistory.push({ role: "user", content: data.userMessage });
      }
      if (data?.agentResponse) {
        conversationHistory.push({ role: "assistant", content: data.agentResponse });
      }
    }
  } catch (err) {
    console.warn("[Ollama Agent Context] Conversation history fetch failed:", err);
  }

  const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  const systemPrompt = `You are the executive AI Operations Co-Pilot for VrindaaCorp Services CRM running autonomously on the company VPS.
You are communicating directly with ${userName || "the Business Owner / Administrator"} via WhatsApp.
User Role: ${userRole}.
Phone: +${userPhone}.
Current Time: ${nowIST} IST.

${strategicPlaybook}

[LIVE CRM SITUATION]
${metricsSummary}
${pendingDraftContext}

[CORE PROTOCOL: CONTEXTUALIZE, CONFIRM UNDERSTANDING, AND PROCEED]
Never give robotic one-word replies. Understand the Owner's nuances, confirm understanding, and follow the Owner's Strategic Playbook strictly.
- MANDATORY BOOK A CALL LINK: Whenever drafting or revising client emails, proposals, or templates that include an option or CTA to book a call or schedule a meeting, strictly use: https://calendly.com/vrindaacorp-sales/30min and nothing else.

Format every response in clean WhatsApp markdown:

1. 🧠 *WHAT I UNDERSTOOD:*
State explicitly what you understood from the Owner's message in context of the CRM state, active proposals, or standing directives.

2. 📋 *ACTION DETAILS / INSIGHTS / DRAFT:*
- If revising an email draft: Show the revised Subject and Body incorporating the requested terms/discounts.
- If asking for metrics or lead info: Provide real data and insights.
- If adjusting campaigns: Show exact parameters and impact.

3. 🚀 *NEXT STEP & CONFIRMATION:*
- If an action requires sending an email or altering campaigns:
  "👉 To proceed and execute this immediately, reply: *CONFIRM* or *YES*.
  If you'd like any changes, let me know!"
- If the message was an explicit confirmation:
  Execute immediately via tool, and reply with:
  "✅ *Proceeded & Executed Successfully!* [Receipt details]."`;

  // Format tools for Ollama
  const tools = CRM_TOOL_DEFINITIONS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: trimmedUserMessage },
  ];

  try {
    // 1. Model call with warm keep_alive
    let res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 350,
      }),
    });

    if (!res.ok) {
      res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false,
        }),
      });
    }

    if (!res.ok) {
      throw new Error(`Ollama returned status ${res.status}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0] || data.message;
    const message = choice.message || choice;

    const toolCalls = message?.tool_calls || [];
    const toolsExecuted: string[] = [];

    // If model made tool calls, execute them
    if (toolCalls && toolCalls.length > 0) {
      messages.push(message);

      for (const call of toolCalls) {
        const fnName = call.function?.name || call.name;
        let fnArgs = {};
        try {
          fnArgs = typeof call.function?.arguments === "string" ? JSON.parse(call.function.arguments) : call.function?.arguments || {};
        } catch {
          fnArgs = {};
        }

        toolsExecuted.push(fnName);
        const resultString = await executeCrmTool(fnName, fnArgs, userRole, userPhone);

        messages.push({
          role: "tool",
          tool_call_id: call.id || `call_${Date.now()}`,
          name: fnName,
          content: resultString,
        });
      }

      // Second call to synthesize output cleanly
      const finalRes = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 350,
        }),
      });

      if (finalRes.ok) {
        const finalData = await finalRes.json();
        const finalText = finalData.choices?.[0]?.message?.content;
        if (finalText) {
          const trimmed = finalText.trim();
          await saveMemory(userPhone, trimmedUserMessage, trimmed);
          return { text: trimmed, toolsExecuted, latencyMs: Date.now() - startTime };
        }
      }
    }

    // Direct text response
    if (message?.content) {
      const trimmed = message.content.trim();
      await saveMemory(userPhone, trimmedUserMessage, trimmed);
      return { text: trimmed, toolsExecuted, latencyMs: Date.now() - startTime };
    }

    const fallback = `🧠 *WHAT I UNDERSTOOD:*
Received your message: "${trimmedUserMessage}".

📋 *ACTION DETAILS:*
CRM Operations are running in alignment with your Standing Directives.

🚀 *NEXT STEP:*
Reply with *STATUS*, *WHO OPENED TODAY*, or give any strategic directive.`;

    await saveMemory(userPhone, trimmedUserMessage, fallback);
    return { text: fallback, toolsExecuted, latencyMs: Date.now() - startTime };
  } catch (err: any) {
    console.error("[runOllamaAgent error]:", err);
    return {
      text: `⚠️ *AI Agent Error*: Unable to complete request via Ollama model. (Error: ${err.message})`,
      latencyMs: Date.now() - startTime,
    };
  }
}

async function saveMemory(phone: string, userMessage: string, agentResponse: string) {
  try {
    await prisma.inboundLeadLog.create({
      data: {
        channel: "whatsapp_conversation",
        status: "recorded",
        payload: {
          userPhone: phone,
          userMessage,
          agentResponse,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    console.warn("[saveMemory failed]:", err);
  }
}
