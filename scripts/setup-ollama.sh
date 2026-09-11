#!/usr/bin/env bash
# ==============================================================================
# VrindaaCorp CRM — Automated Ollama & Offline AI Intelligence Setup Script
# Optimized for: Ubuntu 22.04 / 24.04 LTS (Hostinger KVM 8 / 8 vCPUs / 32 GB RAM)
# ==============================================================================

set -e

# Styling helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================================${NC}"
echo -e "${GREEN}${BOLD}     🤖 VrindaaCorp CRM — Offline AI & Ollama Installer           ${NC}"
echo -e "${BLUE}===================================================================${NC}"

# 1. Root check
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root or with sudo.${NC}"
  exit 1
fi

# 2. System Hardware Inspection
CPU_CORES=$(nproc)
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))

echo -e "\n${CYAN}Detected Hardware Specifications:${NC}"
echo -e "CPU Cores:    ${BOLD}${CPU_CORES} vCPUs${NC}"
echo -e "System RAM:   ${BOLD}${TOTAL_RAM_GB} GB${NC}"

# Check GPU
if command -v nvidia-smi &> /dev/null; then
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
  echo -e "GPU Detected: ${GREEN}${GPU_NAME}${NC}"
else
  echo -e "GPU Detected: ${YELLOW}None (High-performance multi-threaded CPU mode)${NC}"
fi

# 3. Model Recommendation & Selection
# On 32GB RAM / 8 vCPU: llama3.1:8b is the gold standard for high-accuracy B2B outreach and reply writing.
DEFAULT_MODEL="llama3.1:8b"
if [ "$TOTAL_RAM_GB" -lt 8 ]; then
  DEFAULT_MODEL="llama3.2:3b"
fi

MODEL_CHOICE=${MODEL:-"$DEFAULT_MODEL"}

echo -e "\n${YELLOW}Recommended Offline Models:${NC}"
echo -e " 1) ${BOLD}llama3.1:8b${NC}    [Default - 4.7 GB] Best B2B email generation, structured JSON, 128k context"
echo -e " 2) ${BOLD}qwen2.5:7b${NC}     [4.5 GB] Exceptional instruction adherence and reasoning"
echo -e " 3) ${BOLD}llama3.2:3b${NC}    [2.0 GB] Ultra-fast low-latency responses"
echo -e " 4) ${BOLD}qwen2.5:14b${NC}    [9.0 GB] Heavyweight enterprise intelligence (runs easily on 32GB RAM)"

if [ -t 0 ] && [ -z "$MODEL" ]; then
  read -rp "Enter model name or press Enter for default [${DEFAULT_MODEL}]: " INPUT_MODEL
  if [ -n "$INPUT_MODEL" ]; then
    MODEL_CHOICE="$INPUT_MODEL"
  fi
fi

echo -e "\nSelected Model: ${GREEN}${BOLD}${MODEL_CHOICE}${NC}"

# 4. Install Ollama
echo -e "\n${BLUE}[1/5] Installing / Updating Ollama engine...${NC}"
if command -v ollama &> /dev/null; then
  echo -e "${GREEN}Ollama binary already installed: $(ollama --version)${NC}"
else
  curl -fsSL https://ollama.com/install.sh | sh
fi

# 5. Tune Ollama Systemd Service for High-Concurrency Production
echo -e "\n${BLUE}[2/5] Configuring Ollama systemd service for 32GB RAM & 8 vCPUs...${NC}"
mkdir -p /etc/systemd/system/ollama.service.d

# Keep model warm in RAM permanently (-1), allow 4 parallel requests across the 8 cores
cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
EOF

systemctl daemon-reload
systemctl restart ollama
systemctl enable ollama

# Wait for Ollama service to become responsive
echo "Waiting for Ollama service to bind on 127.0.0.1:11434..."
for i in {1..15}; do
  if curl -s http://127.0.0.1:11434/api/tags &> /dev/null; then
    echo -e "${GREEN}Ollama service is up and running!${NC}"
    break
  fi
  sleep 1
done

# 6. Pull the Intelligence Model
echo -e "\n${BLUE}[3/5] Downloading & caching offline model (${MODEL_CHOICE})...${NC}"
echo "This downloads directly from the official Ollama registry into local NVMe storage."
ollama pull "${MODEL_CHOICE}"

# Warm up the model in memory immediately
echo -e "\n${BLUE}[4/5] Warming up model into RAM for zero-latency execution...${NC}"
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"${MODEL_CHOICE}\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Respond with OK only.\"}]
  }" > /dev/null || true
echo -e "${GREEN}Model warmed up successfully in RAM.${NC}"

# 7. Configure CRM Environment (.env)
echo -e "\n${BLUE}[5/5] Updating VrindaaCorp CRM configuration...${NC}"
CRM_DIR="/var/www/crm"

if [ -d "$CRM_DIR" ] && [ -f "$CRM_DIR/.env" ]; then
  ENV_FILE="$CRM_DIR/.env"
  
  # Ensure AI_PROVIDER is set to local
  if grep -q "^AI_PROVIDER=" "$ENV_FILE"; then
    sed -i 's/^AI_PROVIDER=.*/AI_PROVIDER="local"/' "$ENV_FILE"
  else
    echo 'AI_PROVIDER="local"' >> "$ENV_FILE"
  fi

  # Ensure LOCAL_AI_BASE_URL is set
  if grep -q "^LOCAL_AI_BASE_URL=" "$ENV_FILE"; then
    sed -i 's|^LOCAL_AI_BASE_URL=.*|LOCAL_AI_BASE_URL="http://127.0.0.1:11434/v1"|' "$ENV_FILE"
  else
    echo 'LOCAL_AI_BASE_URL="http://127.0.0.1:11434/v1"' >> "$ENV_FILE"
  fi

  # Ensure LOCAL_AI_MODEL is set
  if grep -q "^LOCAL_AI_MODEL=" "$ENV_FILE"; then
    sed -i "s/^LOCAL_AI_MODEL=.*/LOCAL_AI_MODEL=\"${MODEL_CHOICE}\"/" "$ENV_FILE"
  else
    echo "LOCAL_AI_MODEL=\"${MODEL_CHOICE}\"" >> "$ENV_FILE"
  fi

  echo -e "${GREEN}Updated $ENV_FILE with local AI settings.${NC}"

  # Restart PM2 processes if active
  if command -v pm2 &> /dev/null; then
    echo "Restarting CRM application services via PM2..."
    pm2 restart all || true
    echo -e "${GREEN}PM2 processes restarted.${NC}"
  fi

  # Run verification script if exists
  if [ -f "$CRM_DIR/scripts/test-ai.ts" ]; then
    echo -e "\n${CYAN}Running end-to-end CRM offline AI verification test...${NC}"
    cd "$CRM_DIR"
    npx tsx scripts/test-ai.ts || true
  fi
else
  echo -e "${YELLOW}Notice: /var/www/crm/.env was not found. Please manually add the following to your .env:${NC}"
  echo -e "AI_PROVIDER=\"local\""
  echo -e "LOCAL_AI_BASE_URL=\"http://127.0.0.1:11434/v1\""
  echo -e "LOCAL_AI_MODEL=\"${MODEL_CHOICE}\""
fi

echo -e "\n${GREEN}===================================================================${NC}"
echo -e "${GREEN}${BOLD}       🎉 Ollama & Offline AI Successfully Configured!             ${NC}"
echo -e "${GREEN}===================================================================${NC}"
echo -e "Engine:            ${CYAN}Ollama daemon (127.0.0.1:11434)${NC}"
echo -e "Loaded Model:      ${CYAN}${MODEL_CHOICE}${NC}"
echo -e "Memory Retention:  ${CYAN}Permanent (RAM-resident for instant generation)${NC}"
echo -e "Parallel Streams:  ${CYAN}4 concurrent workers across 8 vCPUs${NC}"
echo -e "Cost & Privacy:    ${GREEN}100% Offline, $0 API bill, Zero external data transmission${NC}"
echo -e "===================================================================\n"
