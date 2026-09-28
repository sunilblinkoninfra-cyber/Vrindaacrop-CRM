import paramiko
import json
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

test_js = """
async function run() {
  console.log('=== 1. TESTING /api/whatsapp/memory GET ===');
  let t0 = Date.now();
  let r1 = await fetch('http://localhost:3000/api/whatsapp/memory');
  let d1 = await r1.json();
  console.log('Memory fetch time: ' + (Date.now() - t0) + 'ms');
  console.log('Version:', d1.version, 'Directives count:', d1.directives?.length);

  console.log('\\n=== 2. TESTING FAST-PATH CONFIRMATION WEBHOOK ===');
  let t1 = Date.now();
  let r2 = await fetch('http://localhost:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '918287868122@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_' + Date.now()
        },
        message: {
          conversation: 'CONFIRM'
        }
      }
    })
  });
  let d2 = await r2.json();
  console.log('Fast-path webhook latency: ' + (Date.now() - t1) + 'ms');
  console.log('Response:', JSON.stringify(d2));

  console.log('\\n=== 3. TESTING FAST-PATH STATUS WEBHOOK ===');
  let t2 = Date.now();
  let r3 = await fetch('http://localhost:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '918287868122@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_' + Date.now()
        },
        message: {
          conversation: 'STATUS'
        }
      }
    })
  });
  let d3 = await r3.json();
  console.log('Status webhook latency: ' + (Date.now() - t2) + 'ms');
  console.log('Response:', JSON.stringify(d3));

  console.log('\\n=== 4. TESTING NUANCED OWNER INSTRUCTION (LLM + STRATEGIC PLAYBOOK) ===');
  let t3 = Date.now();
  let r4 = await fetch('http://localhost:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '918287868122@s.whatsapp.net',
          fromMe: false,
          id: 'TEST_' + Date.now()
        },
        message: {
          conversation: 'Remember that all security proposals for Gurgaon IT parks should emphasize our 15-minute emergency response unit.'
        }
      }
    })
  });
  let d4 = await r4.json();
  console.log('Nuanced instruction webhook latency: ' + (Date.now() - t3) + 'ms');
  console.log('Response:', JSON.stringify(d4));

  console.log('\\n=== 5. VERIFYING STRATEGIC MEMORY AUTO-UPDATED ===');
  let r5 = await fetch('http://localhost:3000/api/whatsapp/memory');
  let d5 = await r5.json();
  console.log('Updated Version:', d5.version, 'Directives count:', d5.directives?.length);
  console.log('Latest Directive:', JSON.stringify(d5.directives?.[d5.directives.length - 1]));
}

run().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_live_webhook_speed.js', 'w') as f:
    f.write(test_js)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /tmp/test_live_webhook_speed.js && rm /tmp/test_live_webhook_speed.js')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print('ERR:', err)

ssh.close()
