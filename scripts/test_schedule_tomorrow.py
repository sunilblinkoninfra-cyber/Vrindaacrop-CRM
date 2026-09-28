import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { scheduleCampaignOutreach } from "../app/(app)/campaigns/actions";
import { prisma } from "../lib/prisma";

async function testSchedule() {
  const camp = await prisma.campaign.findFirst({
    where: { name: { contains: "Batch 2" } }
  });
  if (!camp) {
    console.log("Campaign not found");
    return;
  }

  // Schedule for tomorrow (Sep 25) at 09:30 AM IST (04:00:00.000Z)
  const tomorrow930UTC = new Date("2026-09-25T04:00:00.000Z");
  const res = await scheduleCampaignOutreach({
    campaignId: camp.id,
    selectedDatesISO: [tomorrow930UTC.toISOString()],
    limit: 50
  });
  console.log("Schedule result:", res);
}
testSchedule().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/test_schedule_api.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/test_schedule_api.ts && rm -f scripts/test_schedule_api.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
