import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

stdin, stdout, stderr = ssh.exec_command('curl -s -H "apikey: vrindaacorp-evolution-key" http://127.0.0.1:8080/instance/fetchInstances')
out = stdout.read().decode('utf-8', errors='ignore')
print("Instances:", out)

ssh.close()
