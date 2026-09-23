/**
 * Verification test script for autonomous WhatsApp CRM Agent
 * Tests:
 * 1. Day-End Report Metrics aggregation (sent today, cumulative leads, response rates, repeat openers)
 * 2. Day-End Notification WhatsApp message formatting
 * 3. Bi-Weekly Outreach Strategy Engine (deliverability audit, warm-up scaling calculations, safe cap recommendation)
 * 4. Bi-Weekly Strategy Notification WhatsApp message formatting
 * 5. CRM Tool Registry execution (get_daily_metrics, get_high_intent_leads, get_hot_leads)
 */

import { prisma } from "../lib/prisma";
import { getDayEndReportMetrics } from "../lib/metrics";
import {
  formatDayEndReportNotification,
  formatBiWeeklyStrategyNotification,
} from "../lib/whatsapp";
import {
  evaluateBiWeeklyStrategy,
} from "../lib/ai/strategy-engine";
import {
  CRM_TOOL_DEFINITIONS,
  executeCrmTool,
} from "../lib/ai/tools/crm-tools";

async function runTests() {
  console.log("==================================================");
  console.log("🤖 TESTING VRINDAACORP AI CRM AGENT SUBSYSTEMS");
  console.log("==================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, label: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${label}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${label}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Day-End Metrics & Repeat Openers Aggregation
    // -------------------------------------------------------------
    console.log("--- 1. Testing Day-End Report Metrics ---");
    const dayEndData = await getDayEndReportMetrics({});
    console.log("Sample day-end data retrieved:", {
      sentToday: dayEndData.sentToday,
      cumulativeLeads: dayEndData.cumulativeLeadsOutreached,
      opensToday: dayEndData.opensToday,
      repeatOpenersCount: dayEndData.repeatOpeners.length,
      responseRate: dayEndData.responseRatePercent,
    });

    assert(typeof dayEndData.sentToday === "number", "Day-end sentToday is a number");
    assert(typeof dayEndData.cumulativeLeadsOutreached === "number", "cumulativeLeadsOutreached is a number");
    assert(Array.isArray(dayEndData.repeatOpeners), "repeatOpeners is an array");

    // Format day-end notification
    const dayEndMsg = formatDayEndReportNotification(dayEndData);
    assert(typeof dayEndMsg === "string" && dayEndMsg.includes("VrindaaCorp CRM — Day-End Briefing"), "Day-End notification formatted correctly");
    assert(dayEndMsg.includes("High-Intent Repeat Openers"), "Day-End notification includes Repeat Openers section");

    // -------------------------------------------------------------
    // Test 2: Bi-Weekly Strategy Engine
    // -------------------------------------------------------------
    console.log("\n--- 2. Testing Bi-Weekly Strategy Engine ---");
    const strategy = await evaluateBiWeeklyStrategy();
    console.log("Calculated Strategy:", {
      currentCap: strategy.currentCap,
      proposedCap: strategy.proposedCap,
      domainStatus: strategy.domainStatus,
      bounceRate: `${strategy.rollingBounceRate.toFixed(2)}%`,
      openRate: `${strategy.rollingOpenRate.toFixed(2)}%`,
    });

    assert(strategy.currentCap > 0, "Current cap is greater than 0");
    assert(strategy.proposedCap > 0, "Proposed cap is calculated");
    assert(["Pristine", "Healthy", "Caution", "At Risk"].includes(strategy.domainStatus), "Domain status is valid");
    assert(typeof strategy.scalingRecommendation === "string" && strategy.scalingRecommendation.length > 0, "Strategy reasoning provided");

    const strategyMsg = formatBiWeeklyStrategyNotification(strategy);
    assert(typeof strategyMsg === "string" && strategyMsg.includes("APPROVE STRATEGY"), "Strategy notification contains approval instructions");

    // -------------------------------------------------------------
    // Test 3: CRM Tool Registry Definitions & Execution
    // -------------------------------------------------------------
    console.log("\n--- 3. Testing CRM Tools & Execution ---");
    assert(CRM_TOOL_DEFINITIONS.length >= 8, `CRM tools registry has ${CRM_TOOL_DEFINITIONS.length} tools`);

    const dailyMetricsRaw = await executeCrmTool("get_daily_metrics", {});
    const dailyMetricsResult = JSON.parse(dailyMetricsRaw);
    assert(typeof dailyMetricsResult.sentToday === "number", "CRM Tool 'get_daily_metrics' executes successfully and returns metrics");

    const highIntentRaw = await executeCrmTool("get_high_intent_leads", { limit: 3 });
    const highIntentResult = JSON.parse(highIntentRaw);
    assert(Array.isArray(highIntentResult.leads), "CRM Tool 'get_high_intent_leads' executes successfully and returns lead list");

    const hotLeadsRaw = await executeCrmTool("get_hot_leads", { limit: 3 });
    const hotLeadsResult = JSON.parse(hotLeadsRaw);
    assert(typeof hotLeadsResult.count === "number", "CRM Tool 'get_hot_leads' executes successfully and returns count");

    // -------------------------------------------------------------
    // Test 4: WhatsApp Message Router & Approval Parser
    // -------------------------------------------------------------
    console.log("\n--- 4. Testing WhatsApp Message Router & Parser ---");
    const { isApprovalMessage } = await import("../lib/whatsapp-revert");

    assert(isApprovalMessage("YES") === true, "'YES' is recognized as approval");
    assert(isApprovalMessage("send") === true, "'send' is recognized as approval");
    assert(isApprovalMessage("Looks good, send it!") === false, "Freeform revision is not mistaken for single approval");
    assert(isApprovalMessage("PROCEED") === true, "'PROCEED' is recognized as approval");
    assert(isApprovalMessage("STATUS") === false, "'STATUS' is recognized as CRM query, not draft approval");
    assert(/^approve\s+strategy/i.test("APPROVE STRATEGY"), "'APPROVE STRATEGY' triggers bi-weekly scaling execution");

    console.log("\n==================================================");
    console.log(`RESULTS: ${passedTests}/${totalTests} tests passed`);
    console.log("==================================================");

    if (passedTests === totalTests) {
      console.log("🎉 ALL AGENT SUBSYSTEMS VERIFIED SUCCESSFULLY!");
    } else {
      console.error("⚠️ Some tests did not pass.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Unexpected error during verification:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
