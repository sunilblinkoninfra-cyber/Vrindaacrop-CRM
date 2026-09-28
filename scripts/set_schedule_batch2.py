import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = r"""
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function setSchedule() {
  const camp = await prisma.campaign.findFirst({
    where: { name: { contains: "Batch 2" } }
  });
  if (!camp) return;

  // Tomorrow Sep 25 at 09:30 AM IST (04:00:00.000Z)
  const tomorrow930UTC = new Date("2026-09-25T04:00:00.000Z");

  const enrollments = await prisma.enrollment.findMany({
    where: {
      campaignId: camp.id,
      state: "ACTIVE",
      lead: { validationStatus: "VALID", isSuppressed: false }
    },
    take: 50,
    select: { id: true }
  });

  for (let i = 0; i < enrollments.length; i++) {
    const offsetMs = i * 20 * 1000;
    await prisma.enrollment.update({
      where: { id: enrollments[i].id },
      data: { nextSendAt: new Date(tomorrow930UTC.getTime() + offsetMs) }
    });
  }

  const existingSeg = (camp.segment as Record<string, any>) || {};
  await prisma.campaign.update({
    where: { id: camp.id },
    data: {
      segment: {
        ...existingSeg,
        _schedule: {
          type: "calendar",
          scheduledDates: [tomorrow930UTC.toISOString()],
          firstSendAt: tomorrow930UTC.toISOString(),
          lastSendAt: new Date(tomorrow930UTC.getTime() + (enrollments.length - 1) * 20 * 1000).toISOString(),
          leadsPerDay: 50,
          totalScheduled: enrollments.length,
          scheduledAt: new Date().toISOString()
        }
      }
    }
  });

  console.log(`Updated ${enrollments.length} enrollments to tomorrow 09:30 AM IST!`);
}

setSchedule().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/scripts/set_schedule_batch2.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx scripts/set_schedule_batch2.ts && rm -f scripts/set_schedule_batch2.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
