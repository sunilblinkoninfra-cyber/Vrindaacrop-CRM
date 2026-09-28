import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmds = [
    "cd /var/www/crm && git pull origin main",
    "cd /var/www/crm && npm run build",
    "pm2 restart all",
    "pm2 status"
]

for cmd in cmds:
    print(f"=== RUNNING: {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)
    print(f"Exit status: {exit_status}")
    if exit_status != 0 and "npm run build" in cmd:
        print("Build failed!")
        break

ssh.close()
