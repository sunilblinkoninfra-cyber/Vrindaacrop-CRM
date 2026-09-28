import paramiko
import json
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

test_js = '''
const fetch = require('node-fetch');

async function test() {
  const tools = [
    {
      type: "function",
      function: {
        name: "get_daily_metrics",
        description: "Get real-time metrics",
        parameters: { type: "object", properties: {} }
      }
    }
  ];

  console.log("--- 1. Testing /v1/chat/completions without tools ---");
  let t0 = Date.now();
  let r1 = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:3b",
      messages: [{ role: "user", content: "Who is the lead in cybersecurity?" }]
    })
  });
  let d1 = await r1.json();
  console.log(`Duration without tools: ${Date.now() - t0}ms`);
  console.log("Content:", d1.choices[0].message.content.slice(0, 100));

  console.log("--- 2. Testing /v1/chat/completions with tools ---");
  let t1 = Date.now();
  let r2 = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:3b",
      messages: [{ role: "user", content: "What are our daily metrics?" }],
      tools: tools
    })
  });
  let d2 = await r2.json();
  console.log(`Duration with tools: ${Date.now() - t1}ms`);
  console.log("Tool calls:", JSON.stringify(d2.choices[0].message.tool_calls));
}

test().catch(console.error);
'''

sftp = ssh.open_sftp()
with sftp.file('/var/www/crm/test_tools_speed.js', 'w') as f:
    f.write(test_js)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('cd /var/www/crm && node test_tools_speed.js')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print('ERR:', err)

ssh.close()
