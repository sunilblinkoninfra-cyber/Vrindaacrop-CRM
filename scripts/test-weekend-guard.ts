import { isWeekend, getNextWeekday, withinSendWindow, claimNextEnrollment, ensureDefaultSendingPlan } from "../lib/outreach/scheduler";
import { runSender } from "../lib/outreach/sender";
import { env } from "../lib/env";

async function main() {
  console.log("=== 1. Testing isWeekend Unit Function ===");
  // Test specific dates in Asia/Kolkata (UTC + 5:30)
  // 2026-10-17 is Saturday
  const sat = new Date("2026-10-17T06:00:00.000Z"); // 11:30 AM IST
  // 2026-10-18 is Sunday (today)
  const sun = new Date("2026-10-18T06:00:00.000Z"); // 11:30 AM IST
  // 2026-10-19 is Monday
  const mon = new Date("2026-10-19T06:00:00.000Z"); // 11:30 AM IST
  // 2026-10-16 is Friday
  const fri = new Date("2026-10-16T06:00:00.000Z"); // 11:30 AM IST

  console.log("Saturday 2026-10-17 isWeekend:", isWeekend(sat, "Asia/Kolkata"), "— expected true");
  console.log("Sunday 2026-10-18 isWeekend:", isWeekend(sun, "Asia/Kolkata"), "— expected true");
  console.log("Monday 2026-10-19 isWeekend:", isWeekend(mon, "Asia/Kolkata"), "— expected false");
  console.log("Friday 2026-10-16 isWeekend:", isWeekend(fri, "Asia/Kolkata"), "— expected false");

  if (!isWeekend(sat) || !isWeekend(sun) || isWeekend(mon) || isWeekend(fri)) {
    throw new Error("isWeekend test failed!");
  }
  console.log("✅ isWeekend tests passed!\n");

  console.log("=== 2. Testing getNextWeekday ===");
  const nextFromSat = getNextWeekday(sat, "Asia/Kolkata", "09:30");
  const nextFromSun = getNextWeekday(sun, "Asia/Kolkata", "09:30");
  console.log("Next weekday from Saturday:", nextFromSat.toISOString(), "IST:", nextFromSat.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
  console.log("Next weekday from Sunday:", nextFromSun.toISOString(), "IST:", nextFromSun.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));

  if (isWeekend(nextFromSat, "Asia/Kolkata") || isWeekend(nextFromSun, "Asia/Kolkata")) {
    throw new Error("getNextWeekday landed on a weekend!");
  }
  console.log("✅ getNextWeekday tests passed!\n");

  console.log("=== 3. Testing withinSendWindow on Weekends ===");
  const plan = { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00" };
  const inWindowOnSat = withinSendWindow(sat, plan);
  const inWindowOnSun = withinSendWindow(sun, plan);
  const inWindowOnMon = withinSendWindow(mon, plan);
  console.log("withinSendWindow Saturday (11:30 IST):", inWindowOnSat, "— expected false");
  console.log("withinSendWindow Sunday (11:30 IST):", inWindowOnSun, "— expected false");
  console.log("withinSendWindow Monday (11:30 IST):", inWindowOnMon, "— expected true");

  if (inWindowOnSat || inWindowOnSun || !inWindowOnMon) {
    throw new Error("withinSendWindow weekend block failed!");
  }
  console.log("✅ withinSendWindow tests passed!\n");

  console.log("=== 4. Live Check: runSender() right now (Sunday Oct 18) ===");
  const now = new Date();
  console.log("Current time:", now.toISOString(), "IST:", now.toLocaleString("en-IN", { timeZone: env.sending.timezone }));
  console.log("Is today weekend in sending timezone?", isWeekend(now, env.sending.timezone));

  const result = await runSender();
  console.log("runSender() result:", result);
  if (result.sent !== 0 || result.attempted !== 0) {
    throw new Error(`CRITICAL FAILURE: runSender attempted or sent emails on a weekend! sent=${result.sent}`);
  }
  console.log("✅ Live runSender() confirmed: 0 emails sent, 0 attempted, completely blocked by weekend guard!\n");

  console.log("=== ALL WEEKEND GUARDS VERIFIED LOCALLY ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
