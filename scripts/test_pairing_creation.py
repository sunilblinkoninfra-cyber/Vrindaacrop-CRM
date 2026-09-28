import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("200.234.47.7", username="root", password="Agarwal@#2026")

test_payload = json.dumps({
    "instanceName": "test-pair",
    "token": "test-key",
    "number": "918287868122",
    "qrcode": False,
    "integration": "WHATSAPP-BAILEYS"
})

cmd = f"curl -s -X POST -H 'Content-Type: application/json' -H 'apikey: vrindaacorp-evolution-key' -d '{test_payload}' http://127.0.0.1:8080/instance/create"
_, stdout, _ = ssh.exec_command(cmd)
print("Create test-pair:", stdout.read().decode('utf-8', errors='ignore'))

import time
time.sleep(2)

cmd2 = "curl -s -H 'apikey: test-key' http://127.0.0.1:8080/instance/connect/test-pair"
_, stdout2, _ = ssh.exec_command(cmd2)
print("Connect test-pair:", stdout2.read().decode('utf-8', errors='ignore'))

cmd3 = "curl -s -X DELETE -H 'apikey: test-key' http://127.0.0.1:8080/instance/delete/test-pair"
_, stdout3, _ = ssh.exec_command(cmd3)
print("Delete test-pair:", stdout3.read().decode('utf-8', errors='ignore'))

ssh.close()
