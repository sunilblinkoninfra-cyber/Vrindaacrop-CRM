import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmd = "docker exec evolution_api grep -E 'phoneNumber' -rn /evolution/dist/ | grep -E 'this\\.phoneNumber' | head -n 10"
_, stdout, _ = ssh.exec_command(cmd)
print("phoneNumber assignments:", stdout.read().decode('utf-8', errors='ignore'))

ssh.close()
