import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

test_ts = '''
import { runOllamaAgent } from './lib/ai/ollama-agent';
import { getOwnerStrategicMemory } from './lib/ai/strategic-memory';

async function run() {
  console.log('--- 1. TESTING STRATEGIC PLAYBOOK RETRIEVAL ---');
  const memory = await getOwnerStrategicMemory();
  console.log(`Active Directives Count: ${memory.directives.length}`);
  memory.directives.forEach((d, i) => {
    console.log(`  ${i+1}. [${d.category.toUpperCase()}] ${d.rule} (Active: ${d.active})`);
  });

  console.log('\\n--- 2. BENCHMARKING FAST-PATH CONFIRMATION (NO LLM DELAY) ---');
  const t0 = Date.now();
  const fastRes = await runOllamaAgent({
    userMessage: 'CONFIRM',
    userPhone: '918287868122',
    userName: 'Sunil Agarwal',
    userRole: 'OWNER'
  });
  console.log(`Fast-path Latency: ${Date.now() - t0} ms`);
  console.log('Fast-path Response:\\n', fastRes.text);

  console.log('\\n--- 3. BENCHMARKING NUANCED OWNER PROPOSAL REVISION (WITH LLM + STRATEGIC PLAYBOOK) ---');
  const t1 = Date.now();
  const llmRes = await runOllamaAgent({
    userMessage: 'The client wants a 10% discount on the 3-month retainer. Revise the proposal accordingly.',
    userPhone: '918287868122',
    userName: 'Sunil Agarwal',
    userRole: 'OWNER'
  });
  console.log(`LLM Latency: ${Date.now() - t1} ms`);
  console.log('LLM Response:\\n', llmRes.text);
}

run().catch(console.error);
'''

sftp = ssh.open_sftp()
with sftp.file('/var/www/crm/test_speed_vps.ts', 'w') as f:
    f.write(test_ts)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('cd /var/www/crm && npx tsx test_speed_vps.ts')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print('ERR:', err)

ssh.close()
