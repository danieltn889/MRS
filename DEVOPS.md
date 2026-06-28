# DEVOPS — Operating the production deployment

Architecture: **pm2** runs the three services on the EC2; **Nginx** is the single
public entry point; **GitHub Actions** deploys on every push to `main` (rsync → server
→ `deploy.sh` → pm2 → health checks). No Docker.

| Service | Process (pm2) | Port | Public path (via Nginx) | Health |
|---|---|---|---|---|
| Backend (Express) | `backend` | 3001 | `/api/…` | `/health` |
| ML matcher gateway (FastAPI) | `ml-gateway` | 8080 | `/matcher/…` | `/matcher/health` |
| Frontend (Vite) | `frontend` | 3000 | `/` | `/` (200) |

Server: `Danny_host_2` · `16.192.28.113` · user `ubuntu` · Ubuntu 26.04 · Node 20 · Python 3.14

---

## Deploy
Push to `main` → GitHub Actions runs automatically. Or trigger manually from the
**Actions** tab. The run **fails** if any post-deploy health check fails.

Manual deploy (on the server): `cd ~/SVWR-CFE && ./deploy.sh`

## Nginx (one-time)
```bash
sudo apt-get install -y nginx
sudo cp ~/SVWR-CFE/deploy/nginx.conf /etc/nginx/sites-available/svwr
sudo ln -sf /etc/nginx/sites-available/svwr /etc/nginx/sites-enabled/svwr
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
**SSL:** needs a real domain pointing at the IP, then:
`sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain.com`

## Health checks
```bash
curl -s localhost:3001/health            # backend
curl -s localhost:8080/matcher/health    # ML
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000   # frontend
```

## Logs
```bash
pm2 status              # all processes
pm2 logs backend        # tail one service
pm2 logs --lines 200    # recent across all
pm2 flush               # clear logs
# pm2 log rotation:
pm2 install pm2-logrotate
```

## Restart / recover
```bash
pm2 restart backend         # one service
pm2 restart all
pm2 startOrReload ~/SVWR-CFE/ecosystem.config.js   # what deploy.sh uses
pm2 startup && pm2 save      # survive server reboot (run once)
```

## Rollback
Deploys are plain `git` state synced to the server. To roll back, deploy a previous
commit: in GitHub, revert the bad commit on `main` (or `git reset` to a known-good SHA
and push) — the workflow redeploys it. On the box you can also:
```bash
cd ~/SVWR-CFE && git log --oneline   # if you deploy via git instead of rsync
```
(Quick local rollback: `pm2 restart all` after restoring the previous build.)

## Secrets
- **GitHub Actions secrets:** `SSH_PRIVATE_KEY`, `SERVER_HOST`, `SERVER_USER`.
- **App secrets** live only in `~/SVWR-CFE/source-code/backend/.env` on the server
  (rsync excludes `.env`, so deploys never overwrite it). Template: `source-code/backend/.env.example`.
- Never commit `.env` or `ssh_key.pem` (both git-ignored).

## Firewall / security (AWS Security Group)
- Inbound **80/443** (Nginx) to the world; **22** to your IP only.
- Once Nginx fronts everything, you can **close** 3000/3001/8080/8000 to the public
  (keep them bound to localhost) so only Nginx is exposed.
- Rotate any secret that has been shared.

## Troubleshooting
| Symptom | Check |
|---|---|
| Health check fails in CI | `pm2 logs <service>` on the server; missing/invalid `.env`? |
| ML 503 on first call | model cold-start — wait ~30–60s; check `pm2 logs ml-gateway` |
| Frontend 502 via Nginx | is `frontend` running? `pm2 status`; port 3000 up? |
| Email in spam | DNS (SPF/DKIM/DMARC) on the sending domain — see notes in repo |
| Reset/verify links point to localhost | set `FRONTEND_URL` to the real domain/IP in `.env` |
