# Deployment Guide

This guide covers deploying the V-WES backend, frontend, and database to a server.

## Overview

| Component | Build | Runtime |
|-----------|-------|---------|
| Backend | `npm run build` (type-check) | Node 18+ running `dist/server.js` (or `tsx src/server.ts`) on a private port (e.g. 3001) |
| Frontend | `npm run build` (Vite) | Static `dist/` served by Nginx / CDN |
| Database | — | Managed/self-hosted PostgreSQL 14+ |

A reverse proxy (Nginx) terminates TLS and routes `/api` and the WebSocket upgrade to the
backend, and serves the frontend static files.

---

## 1. Database

```bash
# Provision PostgreSQL 14+ and create the database + user
createdb SVWR-CFE_DB

# Apply schema + seed (from backend/)
DB_HOST=… DB_PORT=… DB_NAME=… DB_USER=… DB_PASSWORD=… npm run db:setup
```

Use a strong password, restrict network access, and schedule `pg_dump` backups.

---

## 2. Backend

```bash
cd source-code/backend
npm ci
npm run build                 # type-check
# Set production env (see below), then run:
NODE_ENV=production node dist/server.js     # or: npx tsx src/server.ts
```

Run under a process manager (systemd or PM2) for restarts/logging:

```bash
pm2 start "npx tsx src/server.ts" --name vwes-api
```

Production environment (`.env`): set `NODE_ENV=production`, real `DB_*`, a strong
`JWT_SECRET`, `FRONTEND_URL`/`CORS_ORIGIN` to your domain, `API_BASE_URL` to the public API
URL, valid `SMTP_*`, and `GROQ_API_KEY`. Set `USE_BLOCKCHAIN=true` only if a node is reachable.

---

## 3. Frontend

```bash
cd source-code/frontend
npm ci
# Set VITE_API_URL to the public API (e.g. https://api.example.com/api/v1)
npm run build                 # outputs dist/
```

Serve `dist/` as static files. Because it is a single-page app, route all unknown paths to
`index.html`.

---

## 4. Reverse proxy (Nginx example)

```nginx
server {
  listen 443 ssl;
  server_name example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  # Frontend (SPA)
  root /var/www/vwes/dist;
  location / { try_files $uri /index.html; }

  # API
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # WebSocket (Socket.IO)
  location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # Uploaded files
  location /uploads/ { proxy_pass http://127.0.0.1:3001; }
}
```

---

## 5. SSL

Use Let's Encrypt / Certbot to issue and auto-renew certificates for the domain, and redirect
HTTP → HTTPS.

---

## 6. Production checklist

- [ ] Strong `JWT_SECRET`, DB password, SMTP credentials — none committed to git.
- [ ] `NODE_ENV=production`, `CORS_ORIGIN`/`FRONTEND_URL` set to the real domain.
- [ ] `VITE_API_URL` points to the public API; frontend rebuilt after changing it.
- [ ] Database migrated, seeded (if needed), and backed up.
- [ ] HTTPS enforced; WebSocket upgrade proxied.
- [ ] File-upload directory (`backend/uploads`) persisted and backed up.
- [ ] Process manager configured for restart; logs rotated.
- [ ] (Optional) Ethereum node reachable if `USE_BLOCKCHAIN=true`.

---

## 7. Scaling notes

- The backend is stateless except for Socket.IO connection tracking; to run multiple
  instances, add a Socket.IO adapter (e.g. Redis) so rooms/events fan out across nodes.
- Move uploaded files to object storage (e.g. S3) and update `getFullFileUrl` accordingly.
- Put PostgreSQL on a managed/replicated instance; add read replicas for heavy reporting.
- The AI/ML microservices can be scaled independently behind the URLs the backend calls.
