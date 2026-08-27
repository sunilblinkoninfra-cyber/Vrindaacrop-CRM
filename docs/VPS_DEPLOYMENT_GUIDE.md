# Production VPS Deployment & Security Guide

> **Target Environment**: Ubuntu 22.04 / 24.04 LTS (AWS EC2, DigitalOcean, Hetzner, Hostinger, Linode, Azure)  
> **Domain Setup**: e.g., `https://crm.vrindaacorp.com`  
> **Concurrency**: Multi-user enterprise setup with 24/7 background worker, isolated database, and zero-downtime process management.

---

## 🏗️ VPS Production Architecture

```
                                 ┌────────────────────────────────────────┐
                                 │       Internet (HTTPS / Port 443)      │
                                 └───────────────────┬────────────────────┘
                                                     │
                                                     ▼
                                 ┌────────────────────────────────────────┐
                                 │          Nginx Reverse Proxy           │
                                 │   • SSL Termination (Let's Encrypt)    │
                                 │   • Security Headers & Rate Limiting   │
                                 └───────────────────┬────────────────────┘
                                                     │
                             ┌───────────────────────┴───────────────────────┐
                             │                                               │
                             ▼                                               ▼
              ┌─────────────────────────────┐                 ┌─────────────────────────────┐
              │    Next.js Web Application  │                 │   24/7 Background Worker    │
              │     (PM2 Cluster Mode)      │                 │       (PM2 Process)         │
              │   • Multi-User Concurrency  │                 │   • Real-Time IMAP Poller   │
              │   • Dashboard & CRM API     │                 │   • Cold Outreach Scheduler │
              │   • Port: 3000 (Internal)   │                 │   • 48h Escalations & Drips │
              └──────────────┬──────────────┘                 └──────────────┬──────────────┘
                             │                                               │
                             └───────────────────────┬───────────────────────┘
                                                     │
                                                     ▼
                                 ┌────────────────────────────────────────┐
                                 │       Local PostgreSQL Database        │
                                 │   • Bound strictly to 127.0.0.1:5432   │
                                 │   • Connection Pooler & Daily Backups  │
                                 └────────────────────────────────────────┘
```

---

## 1. Multi-User Concurrency & High Availability

VrindaaCorp CRM is specifically architected for **high-concurrency multi-user enterprise operations**:

1. **Stateless JWT Sessions**:
   - Authentication utilizes NextAuth JSON Web Tokens (`strategy: "jwt"`).
   - 100+ sales agents, managers, and admins can simultaneously log in, filter records, edit leads, and dispatch emails without session locks or server-side memory bloat.
2. **PostgreSQL Connection Pooling**:
   - Prisma ORM automatically handles connection pooling, preventing database exhaustion under heavy traffic.
3. **Role-Based Isolation (RBAC)**:
   - Built-in data scoping ensures `AGENT` users only see and interact with their assigned leads, while `ADMIN` and `OWNER` have full global visibility.
4. **24/7 Continuous Background Execution**:
   - The background worker runs as an independent daemon under PM2, continuously scanning `sales@vrindaacorp.com` every 30 seconds for lead replies, processing drip sequences, and executing 48-hour escalations.

---

## 2. Server Provisioning & Initial Hardening

### Step 2.1: Update Server & Install Core Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban nginx certbot python3-certbot-nginx postgresql postgresql-contrib
```

### Step 2.2: Install Node.js 20 LTS & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### Step 2.3: Configure Strict UFW Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH (Change if using custom port)
sudo ufw allow 80/tcp     # HTTP for SSL renewal
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```
> **Security Note**: PostgreSQL port `5432` is intentionally NOT opened in the firewall. It communicates strictly via localhost (`127.0.0.1`).

---

## 3. Local PostgreSQL Database Setup

```bash
sudo -u postgres psql
```

Inside the PostgreSQL prompt:
```sql
CREATE DATABASE vrindaacorp_crm;
CREATE USER vrindaa_user WITH ENCRYPTED PASSWORD 'YOUR_STRONG_DATABASE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE vrindaacorp_crm TO vrindaa_user;
ALTER DATABASE vrindaacorp_crm OWNER TO vrindaa_user;
\q
```

---

## 4. Deploying VrindaaCorp CRM Codebase

### Step 4.1: Clone the Repository
```bash
cd /var/www
sudo git clone https://github.com/sunilblinkoninfra-cyber/Vrindaacrop-CRM.git crm
sudo chown -R $USER:$USER /var/www/crm
cd /var/www/crm
```

### Step 4.2: Configure Production Environment Variables (`.env`)
```bash
nano .env
```

Paste your production configuration:
```env
# --- Database ---
DATABASE_URL="postgresql://vrindaa_user:YOUR_STRONG_DATABASE_PASSWORD_HERE@127.0.0.1:5432/vrindaacorp_crm?schema=public"

# --- Authentication & URLs ---
NEXTAUTH_URL="https://crm.vrindaacorp.com"
NEXTAUTH_SECRET="GENERATE_A_64_CHAR_RANDOM_SECRET_KEY_HERE"
APP_URL="https://crm.vrindaacorp.com"

# --- Google Workspace SMTP Sending ---
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="sales@vrindaacorp.com"
SMTP_PASS="YOUR_16_CHAR_GOOGLE_APP_PASSWORD"
SMTP_FROM_EMAIL="sales@vrindaacorp.com"
SMTP_FROM_NAME="VrindaaCorp Services"

# --- Inbound IMAP Polling (Automatic Reply Capture) ---
IMAP_HOST="imap.gmail.com"
IMAP_PORT="993"
IMAP_SECURE="true"
IMAP_USER="sales@vrindaacorp.com"
IMAP_PASS="YOUR_16_CHAR_GOOGLE_APP_PASSWORD"

# --- In-House Engine & Limits ---
EMAIL_VERIFIER="none"
DAILY_SEND_CAP="200"
ESCALATION_HOURS="48"
```

### Step 4.3: Install Dependencies, Migrate Database & Build
```bash
npm ci
npx prisma migrate deploy
npm run db:seed
npm run build
```

---

## 5. PM2 Daemon Process Configuration (24/7 Always-On)

Create a PM2 ecosystem file for managing both the Web App and the Background Worker:

```bash
nano ecosystem.config.js
```

Paste the following:
```javascript
module.exports = {
  apps: [
    {
      name: "crm-web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      instances: "max",       // Scales across all available CPU cores
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1G",
    },
    {
      name: "crm-worker",
      script: "npm",
      args: "run worker",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,           // Single instance for IMAP & scheduler mutex
      autorestart: true,
      max_memory_restart: "500M",
    },
  ],
};
```

### Start & Enable Auto-Restart on Server Reboot:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# (Run the generated sudo env command printed by PM2)
```

---

## 6. Nginx Reverse Proxy & Free SSL (Let's Encrypt)

### Step 6.1: Configure Nginx Server Block
```bash
sudo nano /etc/nginx/sites-available/crm.vrindaacorp.com
```

Paste:
```nginx
server {
    listen 80;
    server_name crm.vrindaacorp.com;

    # Maximum upload size for large lead spreadsheets (50MB)
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 6.2: Enable Site & Issue SSL Certificate
```bash
sudo ln -s /etc/nginx/sites-available/crm.vrindaacorp.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Issue free auto-renewing SSL certificate:
sudo certbot --nginx -d crm.vrindaacorp.com
```

---

## 7. Automated Daily Database Backups

Ensure your lead and customer data is backed up daily:

```bash
sudo mkdir -p /var/backups/crm-database
sudo crontab -e
```

Add this line to back up the database every night at 02:00 AM and keep 14 days of history:
```cron
0 2 * * * pg_dump -U vrindaa_user -h 127.0.0.1 vrindaacorp_crm | gzip > /var/backups/crm-database/crm_backup_$(date +\%F).sql.gz && find /var/backups/crm-database -type f -mtime +14 -delete
```

---

## 8. Summary of Benefits of VPS Deployment

| Aspect | Benefit on Self-Hosted VPS |
| :--- | :--- |
| **Privacy & Security** | Data never leaves your private VPS; database is closed to public access. |
| **24/7 Background Sync** | Real-time IMAP poller and cold sequences run continuously without platform sleep limits. |
| **Multi-User Performance** | PM2 cluster mode scales across all server CPU cores for seamless concurrent user handling. |
| **Cost Efficiency** | Flat, low monthly VPS cost ($5–$20/mo) with zero per-user subscription fees. |
| **Custom Domain** | Clean, branded URL (`https://crm.vrindaacorp.com`) with automated SSL renewal. |
