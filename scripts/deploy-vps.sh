#!/usr/bin/env bash
# ==============================================================================
# VrindaaCorp CRM — Automated VPS Production Deployment & Provisioning Script
# Target OS: Ubuntu 22.04 / 24.04 LTS
# ==============================================================================

set -e

# Color helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================================================${NC}"
echo -e "${GREEN}     🚀 VrindaaCorp CRM — Automated Production VPS Installer       ${NC}"
echo -e "${BLUE}===================================================================${NC}"

# Check root / sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This script must be run as root or with sudo.${NC}"
  exit 1
fi

# Prompt for essential parameters if not preset in environment
DOMAIN=${DOMAIN:-""}
if [ -z "$DOMAIN" ]; then
  read -rp "Enter your domain or subdomain (e.g. crm.vrindaacorp.com): " DOMAIN
fi

DB_PASSWORD=${DB_PASSWORD:-$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-$(openssl rand -base64 32)}

echo -e "\n${YELLOW}Deployment Settings:${NC}"
echo -e "Domain:              ${GREEN}${DOMAIN}${NC}"
echo -e "PostgreSQL Database: ${GREEN}vrindaacorp_crm${NC}"
echo -e "PostgreSQL User:     ${GREEN}vrindaa_user${NC}"
echo -e "PostgreSQL Password: ${GREEN}${DB_PASSWORD}${NC}"
echo -e "App Directory:       ${GREEN}/var/www/crm${NC}"
echo ""
read -rp "Proceed with installation? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Installation aborted.${NC}"
  exit 0
fi

# 1. System packages & updates
echo -e "\n${BLUE}[1/8] Updating package index & installing prerequisites...${NC}"
apt-get update -y
apt-get install -y curl git ufw fail2ban nginx certbot python3-certbot-nginx postgresql postgresql-contrib build-essential

# 2. Install Node.js 20 LTS
echo -e "\n${BLUE}[2/8] Installing Node.js 20 LTS & PM2...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v) != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

# 3. Configure Firewall (UFW)
echo -e "\n${BLUE}[3/8] Configuring UFW Firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

# 4. Configure PostgreSQL
echo -e "\n${BLUE}[4/8] Configuring Local PostgreSQL Database...${NC}"
systemctl start postgresql
systemctl enable postgresql

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'vrindaacorp_crm'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE vrindaacorp_crm;"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = 'vrindaa_user'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE USER vrindaa_user WITH ENCRYPTED PASSWORD '${DB_PASSWORD}';"

sudo -u postgres psql -c "ALTER USER vrindaa_user WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE vrindaacorp_crm TO vrindaa_user;"
sudo -u postgres psql -c "ALTER DATABASE vrindaacorp_crm OWNER TO vrindaa_user;"

# 5. Clone or update repository
echo -e "\n${BLUE}[5/8] Setting up application repository...${NC}"
mkdir -p /var/www
if [ -d "/var/www/crm/.git" ]; then
  echo "Existing repository detected. Pulling latest main branch..."
  cd /var/www/crm
  git fetch origin main
  git reset --hard origin/main
else
  echo "Cloning repository from GitHub..."
  git clone https://github.com/sunilblinkoninfra-cyber/Vrindaacrop-CRM.git /var/www/crm
  cd /var/www/crm
fi

# 6. Configure Environment Variables
echo -e "\n${BLUE}[6/8] Writing production .env configuration...${NC}"
if [ ! -f /var/www/crm/.env ]; then
  cat > /var/www/crm/.env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://vrindaa_user:${DB_PASSWORD}@localhost:5432/vrindaacorp_crm?schema=public"

APP_URL="https://${DOMAIN}"
NEXTAUTH_URL="https://${DOMAIN}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"

# Company Notification Config
COMPANY_ALERT_EMAIL="sales@vrindaacorp.com"
UNATTENDED_HOURS=24
ESCALATION_HOURS=48

# Sending Policy
DAILY_SEND_CAP=1000
SCHEDULER_MAX_PER_RUN=25
SCHEDULER_INTERVAL_MINUTES=1
SEND_TIMEZONE="Asia/Kolkata"
SEND_WINDOW_START="09:00"
SEND_WINDOW_END="18:00"

# AI Provider (anthropic or local)
AI_PROVIDER="local"
LOCAL_AI_BASE_URL="http://127.0.0.1:11434/v1"
LOCAL_AI_MODEL="llama3.1:8b"
ANTHROPIC_API_KEY=""
AI_MODEL="claude-opus-5"

# WhatsApp Cloud API
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_TEMPLATE_NAME="hot_lead_alert"
WHATSAPP_VERIFY_TOKEN="vrindaacorp_crm_whatsapp_secret"
META_VERIFY_TOKEN="vrindaacorp_crm_whatsapp_secret"

# Outbound SMTP Mailbox
SMTP_HOST="mail.vrindaacorp.com"
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER="sales@vrindaacorp.com"
SMTP_PASS=""
SMTP_FROM_EMAIL="sales@vrindaacorp.com"
SMTP_FROM_NAME="VrindaaCorp Services"

# Inbound IMAP Mailbox (for reply polling every 30s)
IMAP_HOST="mail.vrindaacorp.com"
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER="sales@vrindaacorp.com"
IMAP_PASS=""
EOF
  echo -e "${GREEN}Created default .env file. Please edit SMTP/IMAP passwords later in /var/www/crm/.env${NC}"
fi

# 7. Install dependencies, run database migrations, and build Next.js app
echo -e "\n${BLUE}[7/8] Installing dependencies and building production assets...${NC}"
npm install
npx prisma generate
npx prisma db push
npm run build

# Setup PM2 ecosystem
cat > /var/www/crm/ecosystem.config.js <<'EOF'
module.exports = {
  apps: [
    {
      name: "vrindaa-web",
      script: "npm",
      args: "start",
      cwd: "/var/www/crm",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "vrindaa-worker",
      script: "node_modules/.bin/tsx",
      args: "worker/index.ts",
      cwd: "/var/www/crm",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
EOF

pm2 start /var/www/crm/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root || true

# 8. Configure Nginx & Let's Encrypt SSL
echo -e "\n${BLUE}[8/8] Configuring Nginx reverse proxy & SSL...${NC}"
cat > /etc/nginx/sites-available/vrindaacorp-crm <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_read_timeout 180s;
        proxy_connect_timeout 60s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/vrindaacorp-crm /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Attempt automatic SSL certificate installation if DNS is pointed
echo -e "\n${YELLOW}Attempting Let's Encrypt SSL certificate provisioning for ${DOMAIN}...${NC}"
certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || {
  echo -e "${YELLOW}Notice: Let's Encrypt was unable to automatically provision SSL.${NC}"
  echo -e "${YELLOW}Please ensure your domain DNS A-Record points to this VPS IP, then run:${NC}"
  echo -e "${GREEN}sudo certbot --nginx -d ${DOMAIN}${NC}"
}

echo -e "\n${GREEN}===================================================================${NC}"
echo -e "${GREEN}       🎉 VrindaaCorp CRM VPS Deployment Complete!                ${NC}"
echo -e "${GREEN}===================================================================${NC}"
echo -e "Access your CRM at:     ${BLUE}https://${DOMAIN}${NC}"
echo -e "PM2 Monitoring:         ${BLUE}pm2 status${NC} or ${BLUE}pm2 logs${NC}"
echo -e "Configuration:          ${BLUE}/var/www/crm/.env${NC}"
echo -e "Database:               ${BLUE}vrindaacorp_crm (user: vrindaa_user)${NC}"
echo -e "PostgreSQL Password:    ${BLUE}${DB_PASSWORD}${NC}"
echo -e "===================================================================\n"
