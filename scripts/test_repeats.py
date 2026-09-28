import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

test_js = """
async function test() {
  for (let i = 1; i <= 3; i++) {
    let t0 = Date.now();
    let r = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'Say OK in 2 words.' }]
      })
    });
    let d = await r.json();
    console.log('Call ' + i + ' time: ' + (Date.now() - t0) + 'ms -> ' + d.choices[0].message.content);
  }
}
test().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file('/var/www/crm/test_warm_repeats.js', 'w') as f:
    f.write(test_js)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('node /var/www/crm/test_warm_repeats.js')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print('ERR:', err)

ssh.close()
