import paramiko
import json
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('200.234.47.7', username='root', password='Agarwal@#2026')

cmd = 'curl -w "\\nTime: %{time_total}s\\n" -s http://127.0.0.1:11434/api/generate -d \'{"model": "llama3.2:3b", "prompt": "Say hello in 5 words.", "stream": false}\''
stdin, stdout, stderr = ssh.exec_command(cmd)
res = stdout.read().decode('utf-8')
print("--- CURL GENERATE ---")
print(res)

cmd_chat = 'curl -w "\\nTime: %{time_total}s\\n" -s http://127.0.0.1:11434/api/chat -d \'{"model": "llama3.2:3b", "messages": [{"role": "user", "content": "Say hello in 5 words."}], "stream": false}\''
stdin, stdout, stderr = ssh.exec_command(cmd_chat)
res_chat = stdout.read().decode('utf-8')
print("--- CURL CHAT ---")
print(res_chat)

ssh.close()
