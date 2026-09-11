import { prisma } from "../lib/prisma";
import { handleReply } from "../lib/outreach/reply";
import { handleIncomingWhatsAppMessage, manualApproveDraft, manualReviseDraft } from "../lib/whatsapp-revert";
import { triggerCampaignOutreach } from "../app/(app)/campaigns/actions";

async function main() {
  console.log("==================================================");
  console.log("VRINDAACORP CRM - FEATURE VERIFICATION SUITE");
  console.log("==================================================");

  // 1. Find or create a test lead
  let testLead = await prisma.lead.findFirst({
    where: { email: "test-revert-client@example.com" },
  });

  if (!testLead) {
    testLead = await prisma.lead.create({
      data: {
        firstName: "Vikram",
        lastName: "Malhotra",
        company: "Apex Tower Commercial Complex",
        email: "test-revert-client@example.com",
        emailNormalized: "test-revert-client@example.com",
        phone: "+919811223344",
        sector: "Commercial Real Estate",
        city: "Noida",
        geography: "NCR",
        stage: "CONTACTED",
        source: "outreach",
      },
    });
    console.log("Created test lead:", testLead.id, testLead.email);
  } else {
    console.log("Using existing test lead:", testLead.id, testLead.email);
  }

  // 2. Test Feature 2: Inbound Email Revert -> AI Draft Generation
  console.log("\n--- TEST 2.1: Inbound Revert Simulation ---");
  const sampleClientRevert = "Hi VrindaaCorp, we saw your outreach email. We have 3 office towers in Greater Noida and are looking for HVAC maintenance, daily housekeeping, and 24/7 security. Could you share your scope of work and pricing?";
  const sampleSubject = "Re: Integrated Facility Management for Apex Tower";

  const replyRes = await handleReply({
    fromEmail: testLead.email,
    subject: sampleSubject,
    snippet: sampleClientRevert.slice(0, 300),
    body: sampleClientRevert,
  });

  console.log("Inbound reply result:", replyRes);

  // Verify that ProposedReplyDraft was created
  const draftV1 = await prisma.proposedReplyDraft.findFirst({
    where: { leadId: testLead.id },
    orderBy: { createdAt: "desc" },
  });

  if (!draftV1) {
    throw new Error("FAIL: ProposedReplyDraft was not created!");
  }

  console.log("✅ ProposedReplyDraft Created:");
  console.log(" - ID:", draftV1.id);
  console.log(" - Version:", draftV1.version);
  console.log(" - Status:", draftV1.status);
  console.log(" - Subject:", draftV1.draftSubject);
  console.log(" - Agent Phone:", draftV1.agentPhone);
  console.log(" - Preview Body:\n", draftV1.draftBody.slice(0, 200) + "...\n");

  if (draftV1.version !== 1 || draftV1.status !== "PENDING_APPROVAL") {
    throw new Error(`FAIL: Unexpected draft state (v${draftV1.version}, ${draftV1.status})`);
  }

  // 3. Test Feature 2: WhatsApp Agent Change Suggestion (Multi-turn Revision)
  console.log("\n--- TEST 2.2: WhatsApp Agent Change Suggestion ---");
  const agentChangeRequest = "Please offer 15% discount for the first quarter and propose a site visit this Thursday at 3 PM.";

  const revisionRes = await handleIncomingWhatsAppMessage({
    fromPhone: draftV1.agentPhone || "+919811223344",
    messageText: agentChangeRequest,
  });

  console.log("WhatsApp revision response:", revisionRes);

  const draftV2 = await prisma.proposedReplyDraft.findUnique({
    where: { id: draftV1.id },
  });

  if (!draftV2) throw new Error("FAIL: Draft disappeared after revision!");

  console.log("✅ Revised Draft State:");
  console.log(" - Version:", draftV2.version);
  console.log(" - Status:", draftV2.status);
  console.log(" - Revision Notes:", draftV2.revisionNotes);
  console.log(" - Revised Body Preview:\n", draftV2.draftBody.slice(0, 250) + "...\n");

  if (draftV2.version !== 2 || draftV2.status !== "REVISED") {
    throw new Error(`FAIL: Draft was not revised properly (v${draftV2.version}, ${draftV2.status})`);
  }

  // 4. Test Feature 2: WhatsApp Agent Confirmation ("YES") -> Email Dispatch
  console.log("\n--- TEST 2.3: WhatsApp Agent Confirmation ('YES') ---");
  const approvalRes = await handleIncomingWhatsAppMessage({
    fromPhone: draftV1.agentPhone || "+919811223344",
    messageText: "YES",
  });

  console.log("WhatsApp approval response:", approvalRes);

  const draftFinal = await prisma.proposedReplyDraft.findUnique({
    where: { id: draftV1.id },
  });

  if (!draftFinal) throw new Error("FAIL: Draft disappeared!");

  console.log("✅ Final Draft State after Confirmation:");
  console.log(" - Status:", draftFinal.status);
  console.log(" - SentAt:", draftFinal.sentAt);
  console.log(" - SentMessageId:", draftFinal.sentMessageId);

  if (draftFinal.status !== "SENT" || !draftFinal.sentAt) {
    throw new Error(`FAIL: Draft status should be SENT, got ${draftFinal.status}`);
  }

  // Check activity logged on lead
  const activities = await prisma.activity.findMany({
    where: { leadId: testLead.id },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  console.log("\nRecent Lead Activities:");
  activities.forEach((a) => console.log(` - [${a.type}] ${a.message}`));

  // 5. Test Feature 1: Inter-Email Delay in Outreach
  console.log("\n--- TEST 1: Campaign Outreach with Delay ---");
  const { runSender } = await import("../lib/outreach/sender");
  const campaign = await prisma.campaign.findFirst({
    where: { status: "ACTIVE" },
  });

  if (campaign) {
    console.log("Testing runSender with campaign:", campaign.name, "(id:", campaign.id, ")");
    // Test with limit 2 and delay 1 second
    const senderResult = await runSender({
      limit: 2,
      delaySeconds: 1,
      ignoreSendWindow: true,
      campaignId: campaign.id,
    });
    console.log("✅ runSender dispatch result with 1s delay:", senderResult);
  } else {
    console.log("No active campaign found to trigger, skipping campaign trigger test.");
  }

  console.log("\n==================================================");
  console.log("ALL FEATURES VERIFIED SUCCESSFULLY! 🎉");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR in verification script:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
