#!/usr/bin/env bash
# ============================================================================
# ONE-TIME server bootstrap for a FRESH Ubuntu EC2 instance.
# Turns a blank server into a deploy-ready one. Run ONCE, as the `ubuntu` user:
#
#     bash deploy/bootstrap-server.sh
#
# Installs: Node 20, pm2, Python3 + venv, PostgreSQL (+ creates the app DB),
# and Nginx (reverse proxy). Idempotent — safe to re-run.
#
# PREREQUISITE: the production env files must already exist (they hold secrets,
# so they are NOT in git):
#     source-code/backend/.env     (see source-code/backend/.env.example)
#     source-code/frontend/.env    (VITE_API_URL=/api/v1, etc.)
# This script reads DB_NAME / DB_PASSWORD from the backend .env so PostgreSQL
# is configured to match. After bootstrapping, deploy with `bash deploy.sh`
# (or just push to main and let GitHub Actions do it).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/source-code/backend/.env"

# Pull DB settings from the backend .env (fallback to safe defaults).
DB_NAME="SVWR_CFE_DB_OG"
DB_PASSWORD=""
if [ -f "$ENV_FILE" ]; then
  DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  DB_PASSWORD="$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
fi
: "${DB_NAME:=SVWR_CFE_DB_OG}"
if [ -z "$DB_PASSWORD" ]; then
  echo "⚠ No DB_PASSWORD found in $ENV_FILE — create the .env first (see .env.example). Aborting."
  exit 1
fi

echo "▶ [1/5] System packages…"
sudo apt-get update -y
sudo apt-get install -y curl git python3 python3-venv python3-pip nginx

echo "▶ [2/5] Node 20 + pm2…"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | tr -d v | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "▶ [3/5] PostgreSQL + database '$DB_NAME'…"
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE \"$DB_NAME\";"
# (the app's migrate step creates all tables; this just ensures the DB + auth exist)

echo "▶ [4/5] Nginx reverse proxy…"
sudo cp "$ROOT/deploy/nginx.conf" /etc/nginx/sites-available/svwr
sudo ln -sf /etc/nginx/sites-available/svwr /etc/nginx/sites-enabled/svwr
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "▶ [5/5] pm2 start-on-boot…"
sudo env PATH="$PATH:$(dirname "$(command -v node)")" pm2 startup systemd -u "$USER" --hp "$HOME" || true

echo ""
echo "✅ Bootstrap complete. This server is deploy-ready."
echo "   Next: run  bash deploy.sh   (or push to main). deploy.sh runs migrations,"
echo "   builds, and starts everything with pm2."
echo "   Don't forget: open ports 80/443 in the AWS Security Group for public access."
