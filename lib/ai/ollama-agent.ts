import { env } from "@/lib/env";
import { CRM_TOOL_DEFINITIONS, executeCrmTool } from "@/lib/ai/tools/crm-tools";

export type AgentResponse = {
  text: string;
  toolsExecuted?: string[];
};

/**
 * Runs the conversational Ollama agent with tool calling for incoming WhatsApp messages.
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

  const systemPrompt = `You are the executive AI Operations Co-Pilot for VrindaaCorp Services CRM running on the company VPS.
You are communicating directly with ${userName || "the Business Owner"} via WhatsApp.
User Role: ${userRole}.
Phone: +${userPhone}.

Core Rules:
1. Keep responses clear, concise, and beautifully formatted for WhatsApp (use *bold*, clean bullet points, emojis).
2. You have full access to CRM tools: get_daily_metrics, get_high_intent_leads, get_hot_leads, get_lead_details, trigger_outreach, pause_outreach, resume_outreach, create_or_update_lead, generate_day_end_report, run_biweekly_strategy_analysis, approve_strategy.
3. If the user asks for stats, high-intent leads, pause/resume, search, or creating a lead, call the appropriate tool immediately.
4. When reporting repeat openers, always highlight their company and open count to help the team close deals.
5. If the user commands "pause" or "stop", immediately invoke pause_outreach. If "resume", invoke resume_outreach.`;

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
    { role: "user", content: userMessage },
  ];

  try {
    // 1. Initial call to model
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

    // Fallback to /api/chat if /v1/chat/completions is unavailable
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

      // 2. Second call to model to summarize tool output
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
          return { text: finalText.trim(), toolsExecuted };
        }
      }
    }

    // Direct text response
    if (message?.content) {
      return { text: message.content.trim(), toolsExecuted };
    }

    return {
      text: "✅ Command received and executed.",
      toolsExecuted,
    };
  } catch (err: any) {
    console.error("[runOllamaAgent error]:", err);
    // Fallback response for offline or timeout
    return {
      text: `⚠️ *AI Agent Offline*: Ollama model is currently unreachable on the VPS. Please check if \`ollama serve\` is running. (Error: ${err.message})`,
    };
  }
}
