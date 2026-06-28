#!/usr/bin/env bash
# Deploy script — runs ON the AWS server (called by the GitHub Actions workflow,
# or manually: `bash deploy.sh`). Installs deps, builds the frontend, prepares the
# ML services, and (re)starts everything with pm2.
#
# Prerequisites on the server (install once — see DEPLOYMENT.md):
#   Node 20+, npm, python3 + python3-venv, pm2 (npm i -g pm2)
#   .env files present in source-code/backend and source-code/ml (NOT in git)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "▶ Deploying from $ROOT"

# ── Backend (Express / tsx, port 3001) ───────────────────────────────────────
echo "── Backend ──"
cd "$ROOT/source-code/backend"
npm ci || npm install
npm run type-check || echo "⚠ type-check reported issues (continuing)"

# ── Frontend (Vite → static build, served on port 3000) ──────────────────────
echo "── Frontend ──"
cd "$ROOT/source-code/frontend"
npm ci || npm install
npm run build

# ── ML (Python FastAPI: gateway 8080 + matcher 8000) ─────────────────────────
echo "── ML ──"
cd "$ROOT/source-code/ml"
python3 -m venv .venv 2>/dev/null || true
# shellcheck disable=SC1091
source .venv/bin/activate
pip install --upgrade pip >/dev/null
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
else
  # No requirements.txt yet — install the libraries the services use.
  pip install fastapi uvicorn httpx "sentence-transformers" scikit-learn nltk numpy pandas psycopg2-binary python-dotenv
fi
deactivate

# ── (Re)start everything with pm2 ────────────────────────────────────────────
echo "── Restart (pm2) ──"
cd "$ROOT"
pm2 startOrReload ecosystem.config.js --update-env
pm2 save
echo "✅ Deploy complete — services running:"
pm2 status
