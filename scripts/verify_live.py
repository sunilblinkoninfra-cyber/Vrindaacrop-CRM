import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmds = [
    "pm2 logs vrindaa-worker --lines 20 --nostream",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT job, \"startedAt\", ok, detail FROM \"JobRun\" WHERE job = \x27sender\x27 ORDER BY \"startedAt\" DESC LIMIT 5;'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, \"localDate\", allowed, reserved, sent, paused, \"pauseReason\" FROM \"SendingDay\" WHERE \"localDate\" = \x272026-09-24\x27;'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, \"fromEmail\", status, \"pauseReason\" FROM \"SendingPlan\";'"
]

for cmd in cmds:
    print(f"\n=== CMD: {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())

ssh.close()
