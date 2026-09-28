import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmd = 'sudo -u postgres psql -d vrindaacorp_crm -c \'SELECT id, email, name, role, "whatsappNumber" FROM "User";\''
_, stdout, _ = ssh.exec_command(cmd)
print(stdout.read().decode())

ssh.close()
