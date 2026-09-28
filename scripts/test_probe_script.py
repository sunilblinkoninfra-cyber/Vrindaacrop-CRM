import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

ts_code = """
import { probeMailbox, pickBestMx } from "./lib/import/smtp-probe";

async function testProbe() {
  const emails = [
    "sunil.gautam@ampf.com",
    "skbehera@mum.amity.edu",
    "niketa.saxena@appinventiv.com",
    "ankita.gupta@anmolindustries.com",
    "parneet.kaur@ail.ac.in",
    "Rakesh.Kumar@aisglass.com",
    "ngupta@aes.ac.in"
  ];

  for (const email of emails) {
    const domain = email.split("@")[1];
    const mx = await pickBestMx(domain);
    if (mx) {
      const res = await probeMailbox(email, mx);
      console.log(email + " -> " + res.outcome + " (" + res.reason + ")");
    }
  }
}
testProbe().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file("/var/www/crm/test_probe_batch.ts", "w") as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/crm && npx tsx test_probe_batch.ts && rm -f test_probe_batch.ts")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
