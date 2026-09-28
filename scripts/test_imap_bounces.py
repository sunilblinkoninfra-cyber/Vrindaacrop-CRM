import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

ts_code = """
import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import { env } from './lib/env';
import { simpleParser } from 'mailparser';

async function inspectBounces() {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: env.imap.secure,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const messages = client.fetch({ seq: '1:*' }, { envelope: true, source: true });
    let count = 0;
    let bounceCount = 0;
    for await (const msg of messages) {
      count++;
      const from = msg.envelope?.from?.[0]?.address || '';
      const subject = msg.envelope?.subject || '';
      const date = msg.envelope?.date;
      const isBounce = from.includes('mailer-daemon') || from.includes('postmaster') || /delivery|failure|undelivered/i.test(subject);
      if (isBounce) {
        bounceCount++;
        console.log(`[BOUNCE ${bounceCount}] From: ${from} | Date: ${date} | Subject: ${subject}`);
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          const text = (parsed.text || '').replace(/\\s+/g, ' ');
          console.log('  Snippet: ' + text.slice(0, 300));
          // Look for email inside
          const recipientMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/g);
          console.log('  Extracted emails:', recipientMatch ? recipientMatch.slice(0, 5) : 'none');
        }
      }
    }
    console.log(`Total messages scanned: ${count}, Bounces found: ${bounceCount}`);
  } finally {
    lock.release();
    await client.logout();
  }
}
inspectBounces().catch(console.error);
"""

sftp = ssh.open_sftp()
with sftp.file('/var/www/crm/test_bounce_scan.ts', 'w') as f:
    f.write(ts_code)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('cd /var/www/crm && npx tsx test_bounce_scan.ts && rm -f test_bounce_scan.ts')
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
