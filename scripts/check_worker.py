import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmds = [
    "pm2 status",
    "pm2 logs vrindaa-worker --lines 40 --nostream",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, name, status, \"sendingPlanId\" FROM \"Campaign\";'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, \"fromEmail\", status, \"hardDailyCap\", \"sendWindowStart\", \"sendWindowEnd\", timezone FROM \"SendingPlan\";'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, \"localDate\", allowed, reserved, sent, failed, bounced, paused, \"pauseReason\" FROM \"SendingDay\" ORDER BY \"localDate\" DESC LIMIT 5;'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT id, \"campaignId\", state, \"pausedReason\", \"nextSendAt\", \"sendClaimToken\", \"lastAttemptAt\" FROM \"Enrollment\" WHERE \"nextSendAt\" IS NOT NULL ORDER BY \"nextSendAt\" ASC LIMIT 10;'",
    "sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT job, \"startedAt\", \"finishedAt\", ok, detail FROM \"JobRun\" ORDER BY \"startedAt\" DESC LIMIT 10;'"
]

for cmd in cmds:
    print(f"\n=== CMD: {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    if out:
        print(out)
    if err:
        print("ERR:", err)

ssh.close()
