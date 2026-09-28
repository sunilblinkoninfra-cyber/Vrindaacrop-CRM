import paramiko
import json
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

test_js = """
async function run() {
  console.log('=== 1. TESTING FAST-PATH STATUS (< 100ms) ===');
  let t0 = Date.now();
  let r1 = await fetch('http://127.0.0.1:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Host': 'vrindaacorp-crm.tech' },
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
  let d1 = await r1.json();
  console.log('Status latency: ' + (Date.now() - t0) + 'ms');
  console.log('Status response:', JSON.stringify(d1));

  console.log('\\n=== 2. TESTING FAST-PATH CONFIRMATION (< 100ms) ===');
  let t1 = Date.now();
  let r2 = await fetch('http://127.0.0.1:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Host': 'vrindaacorp-crm.tech' },
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
  console.log('Confirm latency: ' + (Date.now() - t1) + 'ms');
  console.log('Confirm response:', JSON.stringify(d2));

  console.log('\\n=== 3. TESTING NUANCED INSTRUCTION WITH STRATEGIC LEARNING ===');
  let t2 = Date.now();
  let r3 = await fetch('http://127.0.0.1:3000/api/webhooks/whatsapp-evolution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Host': 'vrindaacorp-crm.tech' },
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
  let d3 = await r3.json();
  console.log('Nuanced instruction latency: ' + (Date.now() - t2) + 'ms');
  console.log('Nuanced response:', JSON.stringify(d3));
}

run().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_webhook_speed.js', 'w') as f:
    f.write(test_js)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /tmp/test_webhook_speed.js && rm -f /tmp/test_webhook_speed.js')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print('ERR:', err)

ssh.close()
