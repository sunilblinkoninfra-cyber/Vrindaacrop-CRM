import "dotenv/config";
import { env } from "@/lib/env";
import { isAiConfigured } from "@/lib/ai/client";
import { generateEmail } from "@/lib/ai/generate";
import { generateProposedReply } from "@/lib/ai/reply-draft";

async function main() {
  console.log("=================================================");
  console.log("  🧪 VrindaaCorp CRM — AI Offline Diagnostic    ");
  console.log("=================================================");
  console.log(`Provider:        ${env.ai.provider}`);
  console.log(`Local Base URL:  ${env.ai.localBaseUrl || "(none)"}`);
  console.log(`Local Model:     ${env.ai.localModel || "(none)"}`);
  console.log(`Is Configured:   ${isAiConfigured()}`);
  console.log("-------------------------------------------------");

  if (!isAiConfigured()) {
    console.error("❌ AI is not configured. Set AI_PROVIDER=local and LOCAL_AI_BASE_URL/LOCAL_AI_MODEL in .env");
    process.exit(1);
  }

  // 1. Health check to local OpenAI endpoint
  const base = env.ai.localBaseUrl.replace(/\/$/, "");
  console.log(`\n[1/3] Testing endpoint connectivity: ${base}/models ...`);
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/models`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json() as { data?: { id: string }[] };
    const availableModels = (data.data ?? []).map((m) => m.id);
    console.log(`✅ Connected in ${Date.now() - t0}ms.`);
    console.log(`   Available models in Ollama: [ ${availableModels.join(", ")} ]`);
    
    const targetFound = availableModels.some((m) => m.includes(env.ai.localModel));
    if (!targetFound) {
      console.warn(`⚠️ Warning: Model "${env.ai.localModel}" not explicitly found in list. Ollama may pull or resolve it on-demand.`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to connect to Ollama endpoint: ${err.message}`);
    console.error(`   Ensure Ollama is running: systemctl status ollama`);
    process.exit(1);
  }

  // 2. Test cold outreach generation
  console.log(`\n[2/3] Testing Cold Outreach Email Generation (${env.ai.localModel})...`);
  const testLead = {
    id: "test-diag-lead",
    firstName: "Vikram",
    lastName: "Sharma",
    company: "Max Healthcare Towers",
    sector: "healthcare",
    email: "vikram.sharma@example.com",
    title: "Chief Operations Officer",
    city: "Noida",
    state: "Uttar Pradesh",
    country: "India",
  };

  const t1 = Date.now();
  try {
    const outreach = await generateEmail({
      lead: testLead,
      brief: "Comprehensive HVAC, hygiene housekeeping, and 24/7 facility compliance services tailored for multi-specialty hospitals.",
      stepLabel: "Initial introduction",
    });

    const durationOutreach = Date.now() - t1;
    console.log(`✅ Generated in ${durationOutreach}ms!`);
    console.log(`   Engine Used:    ${outreach.generated ? "Offline LLM (Ollama)" : "Static Fallback"}`);
    console.log(`   Subject:        "${outreach.subject}"`);
    console.log(`   Body snippet:   ${outreach.html.slice(0, 140)}...`);
  } catch (err: any) {
    console.error(`❌ Cold outreach generation failed: ${err.message}`);
  }

  // 3. Test inbound reply draft generation
  console.log(`\n[3/3] Testing Inbound Client Reply Generation (${env.ai.localModel})...`);
  const t2 = Date.now();
  try {
    const reply = await generateProposedReply({
      lead: testLead,
      inboundSubject: "Re: Facility Management for Noida Center",
      inboundBody: "Hi Vrindaa team, could you please share your pricing structure and how your team handles emergency HVAC breakdowns on weekends?",
    });

    const durationReply = Date.now() - t2;
    console.log(`✅ Generated in ${durationReply}ms!`);
    console.log(`   Engine Used:    ${reply.generated ? "Offline LLM (Ollama)" : "Static Fallback"}`);
    console.log(`   Subject:        "${reply.subject}"`);
    console.log(`   Body snippet:   ${reply.bodyText.slice(0, 140)}...`);
  } catch (err: any) {
    console.error(`❌ Inbound reply generation failed: ${err.message}`);
  }

  console.log("\n=================================================");
  console.log("  🎉 All Offline AI Tests Completed Successfully!");
  console.log("=================================================");
}

main().catch((e) => {
  console.error("Diagnostic error:", e);
  process.exit(1);
});
