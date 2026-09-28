import paramiko
import json
import time

HOST = "200.234.47.7"
USER = "root"
PASS = "Agarwal@#2026"
CLEAN_PHONE = "918287868122"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

def check_state():
    cmd = """curl -s -X GET http://127.0.0.1:8080/instance/connectionState/vrindaacorp-crm -H "apikey: vrindaacorp-evolution-key" """
    _, stdout, _ = ssh.exec_command(cmd)
    raw = stdout.read().decode().strip()
    try:
        data = json.loads(raw)
        return data.get("instance", {}).get("state")
    except Exception:
        return raw

print("Listening for WhatsApp QR scan...")
start_time = time.time()
while time.time() - start_time < 90:
    state = check_state()
    print(f"[{int(time.time() - start_time)}s] Connection State: {state}")
    if state == "open":
        print("\n🎉 WhatsApp Connected Successfully!")
        test_msg = """🎉 *VrindaaCorp AI Sales Agent Connected!*

Hello! I am your autonomous AI Sales Agent running 24/7 on your VPS.

*What I will do for you:*
1. ☀️ *09:00 AM Morning Game Plan*: Daily outreach target volume, sector focus, pacing cap, and domain deliverability status.
2. ⚡ *Inbound Client Revert Alerts (<30s)*: Whenever a prospect replies to an email, I analyze their needs with local Ollama Llama 3.1, generate a tailored proposal draft, and send it here for your confirmation.
   • Reply *YES* or *SEND* to dispatch it immediately via sales@vrindaacorp.com.
   • Reply with revisions (e.g. "Offer a meeting at 3 PM Thursday") to refine the draft.
3. 🌙 *09:00 PM Day-End Briefing*: Sent today, cumulative reach, open rates, response rates, and high-intent repeat openers.
4. 📈 *Bi-Weekly Domain Scaling*: 14-day deliverability audit and safe warmup tier recommendations with 1-tap *APPROVE STRATEGY*.

*You can test me right now by replying:*
• *STATUS* — view live outreach stats
• *WHO OPENED TODAY* — see top engaged prospects
• *SHOW HOT LEADS* — see active leads"""

        send_cmd = f"""curl -s -X POST http://127.0.0.1:8080/message/sendText/vrindaacorp-crm \
          -H "apikey: vrindaacorp-evolution-key" \
          -H "Content-Type: application/json" \
          -d '{{"number": "{CLEAN_PHONE}", "text": {json.dumps(test_msg)}}}' """
        _, s_out, _ = ssh.exec_command(send_cmd)
        print("Welcome message sent response:\n", s_out.read().decode())
        break
    time.sleep(3)

ssh.close()
