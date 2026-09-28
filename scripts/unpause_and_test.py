import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

print("1. Unpausing SendingPlan and SendingDay for today on VPS database...")
sql = """
sudo -u postgres psql -d vrindaacorp_crm -c "UPDATE \\"SendingPlan\\" SET \\"status\\" = 'ACTIVE', \\"pauseReason\\" = NULL;"
sudo -u postgres psql -d vrindaacorp_crm -c "UPDATE \\"SendingDay\\" SET \\"paused\\" = false, \\"pauseReason\\" = NULL WHERE \\"localDate\\" = '2026-09-24';"
"""
stdin, stdout, stderr = ssh.exec_command(sql)
print("SQL OUT:", stdout.read().decode())
print("SQL ERR:", stderr.read().decode())

print("\n2. Verifying SendingPlan and SendingDay status...")
verify_sql = """
sudo -u postgres psql -d vrindaacorp_crm -c "SELECT id, \\"fromEmail\\", status, \\"pauseReason\\" FROM \\"SendingPlan\\";"
sudo -u postgres psql -d vrindaacorp_crm -c "SELECT id, \\"localDate\\", allowed, reserved, sent, paused, \\"pauseReason\\" FROM \\"SendingDay\\" WHERE \\"localDate\\" = '2026-09-24';"
"""
stdin, stdout, stderr = ssh.exec_command(verify_sql)
print(stdout.read().decode())

print("\n3. Waiting 65 seconds for PM2 vrindaa-worker to execute its tickSender() loop...")
time.sleep(65)

print("\n4. Checking vrindaa-worker logs...")
stdin, stdout, stderr = ssh.exec_command("pm2 logs vrindaa-worker --lines 25 --nostream")
print(stdout.read().decode())

print("\n5. Checking JobRun table...")
stdin, stdout, stderr = ssh.exec_command("sudo -u postgres psql -d vrindaacorp_crm -c 'SELECT job, \"startedAt\", ok, detail FROM \"JobRun\" WHERE job = \x27sender\x27 ORDER BY \"startedAt\" DESC LIMIT 5;'")
print(stdout.read().decode())

ssh.close()
