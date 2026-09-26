import "dotenv/config";
import { runHermesAgent } from "@/lib/ai/hermes-agent";
import { runAutonomousHermesLoop } from "@/lib/ai/autonomous-loop";
import { classifyInboundEmail } from "@/lib/inbound/classification";
import { executeCrmTool } from "@/lib/ai/tools/crm-tools";
import { env } from "@/lib/env";

async function main() {
  const args = process.argv.slice(2);
  console.log("==================================================");
  console.log("  VrindaaCorp CRM — Hermes Agent Verification CLI  ");
  console.log("==================================================");
  console.log(`Provider: ${env.ai.provider}`);
  console.log(`Base URL: ${env.ai.localBaseUrl}`);
  console.log(`Model:    ${env.ai.localModel}\n`);

  if (args.includes("--ping")) {
    console.log("📡 Testing local model endpoint connection...");
    try {
      const res = await fetch(`${env.ai.localBaseUrl}/api/version`).catch(() => null);
      if (res && res.ok) {
        const v = await res.json();
        console.log(`✅ Connection successful! Ollama version: ${JSON.stringify(v)}`);
      } else {
        console.log(`ℹ️ Endpoint responsive at ${env.ai.localBaseUrl}`);
      }
    } catch (e: any) {
      console.warn(`⚠️ Warning connecting to endpoint: ${e.message}`);
    }
    return;
  }

  if (args.includes("--test-tools")) {
    console.log("🧪 Testing CRM tool execution (VALID Leads Only)...");
    const resMetrics = await executeCrmTool("get_daily_metrics", {});
    console.log("\n📊 get_daily_metrics result:", resMetrics);

    const resAudit = await executeCrmTool("audit_deliverability", {});
    console.log("\n🛡️ audit_deliverability result:", resAudit);

    const resEnroll = await executeCrmTool("enroll_valid_leads", { limit: 10 });
    console.log("\n🔒 enroll_valid_leads result:", resEnroll);
    return;
  }

  if (args.includes("--test-classification")) {
    console.log("🔍 Testing AGENTS.md Inbound Reply Classification Rules...\n");

    const tests = [
      {
        label: "Rule 1 & 2: Bounce / Invalid Email",
        subject: "Delivery Status Notification (Failure)",
        body: "550 5.1.1 User unknown: The email account that you tried to reach does not exist.",
      },
      {
        label: "Rule 3: Out-of-Office (OOO) Auto-Responder",
        subject: "Automatic reply: Out of office until Monday",
        body: "I am currently away from my desk on annual leave with limited access to email.",
      },
      {
        label: "Rule 4 & 5: Hot Lead Requesting Pricing & Meeting",
        subject: "Re: Facility management support for 360Logica",
        body: "Hi, please send us your company profile, brochure, and rates for housekeeping and HVAC maintenance. Would like to schedule a call.",
      },
    ];

    for (const t of tests) {
      const res = classifyInboundEmail({ subject: t.subject, body: t.body });
      console.log(`Test: ${t.label}`);
      console.log(`Result: category=${res.category}, isBounce=${res.isBounce}, isAway=${res.isAwayMessage}, isHot=${res.isHotLead}`);
      console.log(`Reason: ${res.reason}\n---`);
    }
    return;
  }

  if (args.includes("--test-loop")) {
    console.log("🔄 Testing Hermes Agent Autonomous Execution Loop...");
    const res = await runAutonomousHermesLoop();
    console.log("Result:", JSON.stringify(res, null, 2));
    return;
  }

  // Default: Run interactive command test
  const command = args.join(" ") || "Status today";
  console.log(`🤖 Simulating WhatsApp Command: "${command}"\n`);
  const response = await runHermesAgent({
    userMessage: command,
    userPhone: "919999999999",
    userRole: "OWNER",
    userName: "Business Owner",
  });

  console.log("==================== RESPONSE ====================");
  console.log(response.text);
  console.log("==================================================");
  console.log(`Latency: ${response.latencyMs}ms | Tools Executed: ${response.toolsExecuted?.join(", ") || "None"}`);
}

main().catch((err) => {
  console.error("CLI Error:", err);
  process.exit(1);
});
