import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getDayEndReportMetrics } from "@/lib/metrics";
import { CRM_TOOL_DEFINITIONS, executeCrmTool } from "@/lib/ai/tools/crm-tools";
import { fullName } from "@/lib/utils";

export type AgentResponse = {
  text: string;
  toolsExecuted?: string[];
};

/**
 * Runs the conversational Ollama agent with deep context and tool calling.
 * Strict protocol: Contextualize -> Confirm Understanding -> Propose/Execute -> Proceed.
 */
export async function runOllamaAgent(args: {
  userMessage: string;
  userPhone: string;
  userRole: "OWNER" | "ADMIN" | "AGENT";
  userName?: string;
}): Promise<AgentResponse> {
  const { userMessage, userPhone, userRole, userName } = args;

  const base = (env.ai.localBaseUrl || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = env.ai.localModel || "llama3.1:8b";

  // 1. Gather Live CRM Context
  let metricsSummary = "No metrics available.";
  let pendingDraftContext = "No client email replies pending approval.";
  let conversationHistory: any[] = [];

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
- Inbound Client Email Inquiry: "${draft.inboundBody.slice(0, 300)}"
- Current AI Draft (Version ${draft.version}):
  Subject: ${draft.draftSubject}
  Body Preview: ${draft.draftBody.replace(/<[^>]*>/g, "").slice(0, 350)}
- Status: ${draft.status} (Awaiting owner confirmation to send)
`;
    }
  } catch (err) {
    console.warn("[Ollama Agent Context] Draft fetch failed:", err);
  }

  // 2. Fetch Recent WhatsApp Conversation Memory (Last 4 messages)
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
Current Local Time: ${nowIST} IST.

[LIVE CRM SYSTEM SITUATION]
${metricsSummary}
${pendingDraftContext}

[CORE PROTOCOL: CONTEXTUALIZE, CONFIRM UNDERSTANDING, AND PROCEED]
The Business Owner requires that you NEVER rely only on rigid keyword commands.
You must contextualize every incoming message against the current CRM state, confirm what you understood, and present the clear path forward.

For EVERY response, format your message cleanly using WhatsApp markdown (*bold*, bullet points, emojis) following this 3-step structure:

1. 🧠 *WHAT I UNDERSTOOD:*
Synthesize the Owner's exact intent and instructions in context of the CRM state, pending proposals, or active campaigns. Show that you comprehend their nuances, pricing changes, strategic direction, or inquiry.

2. 📋 *ACTION DETAILS / INSIGHTS / DRAFT:*
- If modifying or revising an email proposal: Present the updated draft with Subject and Body incorporating the owner's feedback (e.g. customized discounts, meeting times, scope).
- If the owner asks a question or for data: Provide real numbers, lead names, open counts, and actionable insights.
- If adjusting campaigns or settings: Explain the exact operational adjustments.

3. 🚀 *NEXT STEP & CONFIRMATION:*
- If an action requires sending an email or altering campaigns:
  "👉 To proceed and execute this immediately, reply: *CONFIRM* or *YES*.
  If you want any changes or further refinements, simply tell me."
- If the Owner ALREADY explicitly confirmed (e.g., "YES", "CONFIRM", "SEND IT", "GO AHEAD", "PROCEED"):
  Immediately execute the action using your tools, and reply:
  "✅ *Proceeded & Executed Successfully!* [Clear receipt of what was dispatched/executed, recipient email, timestamp, and next steps]."

TOOLS AVAILABLE:
- revise_reply_draft: Call when owner wants changes to the pending client email draft.
- confirm_and_send_reply_draft: Call when owner approves/confirms dispatching the pending email draft.
- get_daily_metrics: Real-time send counts, opens, response rate.
- get_high_intent_leads: Top repeat openers.
- get_hot_leads: Leads marked hot or with recent replies.
- get_lead_details: Look up any lead by company, name, or email.
- pause_outreach / resume_outreach: Campaign halt/restart.
- approve_strategy: Approve bi-weekly warmup scaling cap.`;

  // Format tools for Ollama / OpenAI API format
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
    { role: "user", content: userMessage },
  ];

  try {
    // 1. Initial call to Ollama
    let res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: "auto",
        temperature: 0.2,
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

      // 2. Second call to model to synthesize output with the 3-step protocol
      const finalRes = await fetch(`${base}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
        }),
      });

      if (finalRes.ok) {
        const finalData = await finalRes.json();
        const finalText = finalData.choices?.[0]?.message?.content;
        if (finalText) {
          const trimmed = finalText.trim();
          // Save to conversation memory
          await saveMemory(userPhone, userMessage, trimmed);
          return { text: trimmed, toolsExecuted };
        }
      }
    }

    // Direct text response
    if (message?.content) {
      const trimmed = message.content.trim();
      await saveMemory(userPhone, userMessage, trimmed);
      return { text: trimmed, toolsExecuted };
    }

    const fallback = `🧠 *WHAT I UNDERSTOOD:*
Received your message: "${userMessage}".

📋 *STATUS:*
CRM Operations are running normally. No pending actions require confirmation.

🚀 *NEXT STEP:*
Reply with *STATUS*, *WHO OPENED TODAY*, or give any instruction (e.g. revise draft, search lead, pause campaign).`;

    await saveMemory(userPhone, userMessage, fallback);
    return { text: fallback, toolsExecuted };
  } catch (err: any) {
    console.error("[runOllamaAgent error]:", err);
    return {
      text: `⚠️ *AI Agent Error*: Unable to complete request via Ollama model. (Error: ${err.message})`,
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
