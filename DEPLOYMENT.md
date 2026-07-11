# CI/CD Deployment   push to `main` → auto-deploy to AWS

On every push to `main`, GitHub Actions SSHes into the EC2 server and deploys all
three projects (backend, frontend, ML) via [`deploy.sh`](deploy.sh) + pm2.

**Server:** `Danny_host_2` (i-029e4024e1eca4416) · Public IP `16.192.28.113` · user `ubuntu`

---

## 1. Add GitHub Secrets  required (do this first)

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | The **full contents** of `ssh_key.pem` (open the file, copy everything incl. the `-----BEGIN/END-----` lines) |
| `SERVER_HOST` | `16.192.28.113` |
| `SERVER_USER` | `ubuntu` |

> 🔒 **Never commit `ssh_key.pem`.** It's already in `.gitignore`. The key lives only
> in GitHub Secrets. If it was ever committed, rotate it.

---

## 2. One-time server setup (fresh server → deploy-ready)

First create the env files the apps need (these hold secrets, so they are **not** in
git   template: `source-code/backend/.env.example`):

```bash
# on the server, in the repo root (~/SVWR-CFE):
nano source-code/backend/.env    # DB_*, JWT_SECRET, SMTP_*, GROQ_API_KEY, GITHUB_*, NODE_ENV=production
nano source-code/frontend/.env   # VITE_API_URL=/api/v1  VITE_ML_GATEWAY_URL=/matcher  VITE_SEARCH_URL=/search/search
```

Then run the **bootstrap script once**   it installs Node 20, pm2, Python, PostgreSQL
(+ creates the DB matching your `.env`), Nginx (reverse proxy), and enables pm2 on boot:

```bash
bash deploy/bootstrap-server.sh
```

That's the whole server. The database **tables** are created automatically   `deploy.sh`
runs the idempotent migration on every deploy.

---

## 3. AWS Security Group   open the ports

Nginx fronts everything on port 80/443, so you only need to expose:

| Port | Service |
|---|---|
| 80 | HTTP (Nginx → all services) |
| 443 | HTTPS (after SSL) |
| 22 | SSH (your IP only, ideally) |

The internal ports (3000/3001/8080/8000) stay private   Nginx proxies to them on localhost.

---

## 4. Deploy

Just **push to `main`** (or run the workflow manually from the **Actions** tab). The
workflow rsyncs the code to the server (preserving the server's `.env`) and runs
`deploy.sh`, which:

1. installs backend deps,
2. **runs database migrations** (idempotent   creates the DB/tables if missing),
3. builds the frontend (`vite build` → `dist/`),
4. prepares the ML Python venv,
5. restarts everything with **pm2** (`backend`, `ml-gateway`, `frontend`),
6. health-checks all services (the run fails if any is unhealthy).

Check status on the server: `pm2 status` · logs: `pm2 logs backend`.

---

## Notes / things to verify
- **ML dependencies:** there's no `requirements.txt` yet, so `deploy.sh` installs a
  best-guess list (fastapi, uvicorn, sentence-transformers, scikit-learn, nltk, …).
  For reproducible installs, run `pip freeze > source-code/ml/requirements.txt` on a
  working setup and commit it   `deploy.sh` will use it automatically.
- **Frontend in production:** `vite preview` is fine to start; for real traffic, serve
  `source-code/frontend/dist/` with **nginx** and reverse-proxy `/api` → `:3001`.
- The first deploy is slow (ML installs sentence-transformers models). Later deploys
  are fast.
- This was authored from the repo structure; you may need to tweak ports/paths to match
  how you actually run things on the box. Watch the first run's Actions log + `pm2 logs`.
