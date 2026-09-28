import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmds = [
    'sed -i \'s|AI_PROVIDER=.*|AI_PROVIDER="hermes"|\' /var/www/crm/.env',
    'sed -i \'s|LOCAL_AI_BASE_URL=.*|LOCAL_AI_BASE_URL="http://127.0.0.1:11434"|\' /var/www/crm/.env',
    'sed -i \'s|LOCAL_AI_MODEL=.*|LOCAL_AI_MODEL="hermes3:8b"|\' /var/www/crm/.env',
    'grep -i AI_PROVIDER /var/www/crm/.env',
    'grep -i LOCAL_AI_MODEL /var/www/crm/.env',
    'cd /var/www/crm && git pull origin main',
    'cd /var/www/crm && npm install',
    'cd /var/www/crm && npx prisma generate',
    'cd /var/www/crm && npm run build',
    'pm2 restart all --update-env',
    'pm2 status'
]

for cmd in cmds:
    print(f"=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    if exit_status != 0 and "npm run build" in cmd:
        print("Build failed!")
        break

ssh.close()
