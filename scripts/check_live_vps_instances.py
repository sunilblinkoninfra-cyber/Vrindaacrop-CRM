import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmds = [
    'curl -s -H "apikey: vrindaacorp-evolution-key" http://127.0.0.1:8080/instance/fetchInstances',
    'curl -s -H "apikey: vrindaacorp-evolution-key" http://127.0.0.1:8080/instance/connectionState/vrindaacorp-crm',
    'cat /var/www/crm/.env | grep -i WHATSAPP',
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode('utf-8', errors='ignore'))

ssh.close()
