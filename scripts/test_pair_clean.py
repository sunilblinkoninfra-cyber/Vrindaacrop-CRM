import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmds = [
    'curl -s -X DELETE -H "apikey: vrindaacorp-evolution-key" http://127.0.0.1:8080/instance/logout/vrindaacorp-crm',
    'curl -s -H "apikey: vrindaacorp-evolution-key" http://127.0.0.1:8080/instance/connect/vrindaacorp-crm'
]

for cmd in cmds:
    print(f"=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    print(out[:400])

ssh.close()
