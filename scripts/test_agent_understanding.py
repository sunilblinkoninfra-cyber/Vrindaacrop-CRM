import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmd = """cd /var/www/crm && npx tsx -e '
import { runOllamaAgent } from "./lib/ai/ollama-agent";
async function test() {
  const res = await runOllamaAgent({
    userMessage: "Pause all outreach today because of the festival",
    userPhone: "918287868122",
    userRole: "OWNER",
    userName: "Business Owner"
  });
  console.log("=== AGENT OUTPUT ===");
  console.log(res.text);
}
test().catch(console.error);
'"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()
