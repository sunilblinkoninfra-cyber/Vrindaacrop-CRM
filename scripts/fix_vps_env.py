import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

# 1. Unload 8b
stdin, stdout, stderr = ssh.exec_command('ollama stop llama3.1:8b')
print('STOP 8b:', stdout.read().decode('utf-8'))

# 2. Update .env on VPS
cmds = [
    'sed -i "s/LOCAL_AI_MODEL=.*/LOCAL_AI_MODEL=\\"llama3.2:3b\\"/" /var/www/crm/.env',
    'sed -i "s/AI_MODEL=.*/AI_MODEL=\\"llama3.2:3b\\"/" /var/www/crm/.env',
    'grep -i AI_MODEL /var/www/crm/.env',
    'ollama ps',
    'pm2 restart all --update-env'
]

for cmd in cmds:
    print(f"=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8'))
    err = stderr.read().decode('utf-8')
    if err:
        print("ERR:", err)

ssh.close()
