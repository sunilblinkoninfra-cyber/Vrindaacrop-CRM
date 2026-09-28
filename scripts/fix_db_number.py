import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmd = 'sudo -u postgres psql -d vrindaacorp_crm -c "UPDATE \\"User\\" SET \\"whatsappNumber\\" = \'+919773643993\';"'
print(f"=== {cmd} ===")
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='ignore')
err = stderr.read().decode('utf-8', errors='ignore')
print("OUT:", out)
print("ERR:", err)

ssh.close()
