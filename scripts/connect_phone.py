import paramiko
import json
import base64
import os

HOST = "200.234.47.7"
USER = "root"
PASS = "Agarwal@#2026"
PHONE = "+918287868122"
CLEAN_PHONE = "918287868122"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

def run(cmd):
    _, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

# 1. Update database user
sql = f'''sudo -u postgres psql -d vrindaacorp_crm -c "UPDATE \\"User\\" SET \\"whatsappNumber\\" = '{PHONE}' WHERE role = 'OWNER'; UPDATE \\"User\\" SET \\"whatsappNumber\\" = '{PHONE}' WHERE email = 'admin@vrindaacorp.com';" '''
out, err = run(sql)
print("Database update result:\n", out)
if err:
    print("Database err:\n", err)

# 2. Check connection state of Evolution API
state_cmd = """curl -s -X GET http://127.0.0.1:8080/instance/connectionState/vrindaacorp-crm -H "apikey: vrindaacorp-evolution-key" """
state_out, _ = run(state_cmd)
print("\nEvolution API connection state:\n", state_out)

is_open = False
try:
    state_json = json.loads(state_out)
    instance_state = state_json.get("instance", {}).get("state")
    if instance_state == "open":
        is_open = True
except Exception:
    pass

print(f"Is instance already paired/open? {is_open}")

if is_open:
    # Send test handshake message
    test_msg = """🎉 *VrindaaCorp AI Agent Connected!*

Hello! I am your 24/7 AI Sales Agent running on your VPS.

*What I will do:*
1. ☀️ Send you a daily game plan every morning at 09:00 AM.
2. ⚡ Detect client email replies within 30s, write tailored proposal drafts, and send them to you here for a 1-tap *YES* confirmation.
3. 🌙 Provide a full day-end briefing at 09:00 PM with repeat email openers.
4. 📈 Recalculate domain warmup scaling every 14 days.

*Try asking me right now:*
• Reply *STATUS* for real-time outreach metrics.
• Reply *WHO OPENED TODAY* to see top engaged leads."""
    
    send_cmd = f"""curl -s -X POST http://127.0.0.1:8080/message/sendText/vrindaacorp-crm \
      -H "apikey: vrindaacorp-evolution-key" \
      -H "Content-Type: application/json" \
      -d '{{"number": "{CLEAN_PHONE}", "text": {json.dumps(test_msg)}}}' """
    send_res, _ = run(send_cmd)
    print("\nTest message sent result:\n", send_res)

else:
    # Get pairing code for the number
    pairing_cmd = f"""curl -s -X GET "http://127.0.0.1:8080/instance/connect/vrindaacorp-crm?number={CLEAN_PHONE}" \
      -H "apikey: vrindaacorp-evolution-key" """
    pairing_res, _ = run(pairing_cmd)
    print("\nPairing code response:\n", pairing_res)
    
    try:
        data = json.loads(pairing_res)
        code = data.get("pairingCode") or data.get("code")
        print(f"\n🔑 8-digit WhatsApp Pairing Code: {code}")
        
        b64 = data.get("base64")
        if b64:
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            img_bytes = base64.b64decode(b64)
            artifact_dir = r"C:\Users\kumar\.gemini\antigravity-ide\brain\c43c650a-fa72-4c56-a674-4fe5cfa75767"
            out_path = os.path.join(artifact_dir, "whatsapp_qr.png")
            with open(out_path, "wb") as f:
                f.write(img_bytes)
            print(f"Refreshed QR code saved to {out_path}")
    except Exception as e:
        print("Parsing pairing code error:", e)

ssh.close()
