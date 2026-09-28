import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

stdin, stdout, stderr = ssh.exec_command('sudo -u postgres psql -d vrindaacorp_crm -c "SELECT email, \\"whatsappNumber\\" FROM \\"User\\";"')
print("OUT:", stdout.read().decode('utf-8', errors='ignore'))
print("ERR:", stderr.read().decode('utf-8', errors='ignore'))

ssh.close()
