import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

cmd = '''sudo -u postgres psql -d vrindaacorp_crm -c "SELECT id, \\"campaignId\\", \\"nextSendAt\\", \\"updatedAt\\" FROM \\"Enrollment\\" WHERE \\"nextSendAt\\"::text LIKE '%06:%' OR \\"nextSendAt\\"::text LIKE '%11:30%';"'''
stdin, stdout, stderr = ssh.exec_command(cmd)
print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())

ssh.close()
