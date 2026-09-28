import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmd = "lscpu | head -n 15; free -h; ollama list"
_, stdout, stderr = ssh.exec_command(cmd)
print("=== VPS HARDWARE & OLLAMA ===")
print(stdout.read().decode())
print(stderr.read().decode())

ssh.close()
