import "dotenv/config";
import { syncImapReplies } from "../lib/inbound/imap";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("=== TESTING IMAP INBOX SYNC FOR REPLIES ===");
  const result = await syncImapReplies({ sinceDays: 30, maxMessages: 50 });
  console.log("IMAP Sync Result:", result);

  const hotLeads = await prisma.lead.findMany({
    where: { hot: true },
    select: { id: true, email: true, stage: true, hot: true, updatedAt: true },
  });
  console.log("\n=== HOT / REPLIED LEADS IN CRM ===");
  console.log(hotLeads);

  const replyEvents = await prisma.emailEvent.findMany({
    where: { type: "REPLIED" },
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { email: true, company: true } } },
  });
  console.log("\n=== REPLIED EMAIL EVENTS ===");
  console.log(replyEvents);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
