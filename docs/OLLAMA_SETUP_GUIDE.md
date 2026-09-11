# VrindaaCorp CRM — Offline AI & Ollama Production Guide

This guide documents the installation, optimization, and operation of **Ollama** running offline Large Language Models (LLMs) on your VPS.

---

## 🖥️ Server Environment Profile

- **VPS Plan**: Hostinger KVM 8
- **Compute**: 8 vCPU Cores
- **Memory**: 32 GB RAM
- **Disk Storage**: 400 GB NVMe SSD (~395 GB free)
- **Public IP**: `200.234.47.7`
- **Operating System**: Ubuntu 22.04 / 24.04 LTS

With **32 GB RAM and 8 vCPUs**, this server easily runs enterprise-grade open-weights models (like `llama3.1:8b` or `qwen2.5:7b`) with **permanent in-memory caching** (`OLLAMA_KEEP_ALIVE=-1`), delivering instantaneous response times with zero cloud API fees.

---

## ⚡ Option A: 1-Click Automated Installation (Recommended)

Connect to your VPS via SSH and run the automated setup script:

```bash
ssh root@200.234.47.7
```

Once logged in, run:

```bash
cd /var/www/crm
git pull origin main
chmod +x scripts/setup-ollama.sh
./scripts/setup-ollama.sh
```

### What the script automates:
1. Installs or updates the Ollama engine.
2. Tunes systemd for **4 parallel streams** and **permanent RAM retention**.
3. Downloads & caches **`llama3.1:8b`** (or your chosen model).
4. Configures `/var/www/crm/.env` with `AI_PROVIDER="local"`.
5. Restarts PM2 processes and runs an end-to-end CRM verification test.

---

## 🛠️ Option B: Step-by-Step Manual Installation

If you prefer to run commands manually:

### Step 1: Install Ollama
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 2: Configure Systemd for High-Performance Production
By default, Ollama unloads idle models after 5 minutes. On a 32 GB RAM server, you want the model permanently cached in memory for instant generation:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo nano /etc/systemd/system/ollama.service.d/override.conf
```

Paste the following:
```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
```

Apply changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
sudo systemctl enable ollama
```

Verify the service is running:
```bash
systemctl status ollama
```

### Step 3: Pull the Offline Intelligence Model
For B2B outreach email generation and client inquiry reply drafting, **`llama3.1:8b`** is the top-tier choice:

```bash
ollama pull llama3.1:8b
```

*(Optional: If you also want an ultra-lightweight secondary model for quick tasks, pull `ollama pull llama3.2:3b`)*

### Step 4: Configure CRM Environment Variables
Edit your CRM `.env` file:

```bash
nano /var/www/crm/.env
```

Set the AI section:
```env
# --- AI (Local Offline Intelligence) ---
AI_PROVIDER="local"
LOCAL_AI_BASE_URL="http://127.0.0.1:11434/v1"
LOCAL_AI_MODEL="llama3.1:8b"
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Step 5: Restart the CRM Application
Restart your PM2 web application and background worker so they reload the new configuration:

```bash
pm2 restart all
```

---

## 🧪 Verification & Testing

### 1. Test via Curl (Direct Ollama Check)
```bash
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.1:8b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant. Respond with valid JSON."},
      {"role": "user", "content": "Return a JSON with status OK and greeting."}
    ]
  }'
```

### 2. Test via CRM AI Diagnostic Script
We have built an end-to-end diagnostic script directly in the codebase:

```bash
cd /var/www/crm
npx tsx scripts/test-ai.ts
```

This tests:
- Endpoint health and model availability.
- Cold outreach generation with dynamic JSON schema compliance.
- Inbound client reply draft generation with tone and SLA matching.
- Latency and token throughput.

---

## 📊 Model Comparison for Your 32 GB VPS

| Model | Memory Footprint | Context Window | Best For |
|---|---|---|---|
| **`llama3.1:8b`** *(Default)* | ~4.7 GB RAM | 128k tokens | **Standard choice**: Professional B2B email generation, nuanced vocabulary, structured JSON. |
| **`qwen2.5:7b`** | ~4.5 GB RAM | 128k tokens | **Alternative**: Excellent reasoning, precise constraint adherence, multilingual. |
| **`llama3.2:3b`** | ~2.0 GB RAM | 128k tokens | **Speed champion**: Sub-second response times, minimal CPU load. |
| **`qwen2.5:14b`** | ~9.0 GB RAM | 128k tokens | **Heavyweight**: Maximum intelligence; fits comfortably within 32 GB RAM. |

*Even with `llama3.1:8b` permanently cached in RAM (4.7 GB) and the CRM web app + Postgres + Worker running (1.5 GB), you still have over **25 GB RAM free**.*

---

## 🔧 Useful Operational Commands

- **List installed models**: `ollama list`
- **View active model in memory**: `ollama ps`
- **View Ollama logs**: `journalctl -u ollama -f`
- **Stop Ollama**: `sudo systemctl stop ollama`
- **Restart Ollama**: `sudo systemctl restart ollama`
- **Switch model**: Simply run `ollama pull <model>` and update `LOCAL_AI_MODEL="<model>"` in `/var/www/crm/.env`, then `pm2 restart all`.
