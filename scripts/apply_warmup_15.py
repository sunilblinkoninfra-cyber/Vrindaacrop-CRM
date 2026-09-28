import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmd = '''cd /var/www/crm && npx tsx -e '
import { prisma } from "./lib/prisma";
async function main() {
  const res = await prisma.sendingPlan.updateMany({
    data: {
      hardDailyCap: 15,
      schedule: [
        { day: 1, cap: 15 },
        { day: 8, cap: 25 },
        { day: 15, cap: 35 },
        { day: 22, cap: 50 },
        { day: 29, cap: 75 },
        { day: 36, cap: 100 }
      ]
    }
  });
  console.log("Updated sending plans:", res);
}
main();
' '''

print(f"=== {cmd} ===")
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("OUT:", out)
print("ERR:", err)

ssh.close()
