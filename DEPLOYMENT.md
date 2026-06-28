# CI/CD Deployment — push to `main` → auto-deploy to AWS

On every push to `main`, GitHub Actions SSHes into the EC2 server and deploys all
three projects (backend, frontend, ML) via [`deploy.sh`](deploy.sh) + pm2.

**Server:** `Danny_host_2` (i-029e4024e1eca4416) · Public IP `16.192.28.113` · user `ubuntu`

---

## 1. Add GitHub Secrets  ⚠️ required (do this first)

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `SSH_PRIVATE_KEY` | The **full contents** of `ssh_key.pem` (open the file, copy everything incl. the `-----BEGIN/END-----` lines) |
| `SERVER_HOST` | `16.192.28.113` |
| `SERVER_USER` | `ubuntu` |

> 🔒 **Never commit `ssh_key.pem`.** It's already in `.gitignore`. The key lives only
> in GitHub Secrets. If it was ever committed, rotate it.

---

## 2. One-time server setup (SSH in once)

```bash
ssh -i ssh_key.pem ubuntu@16.192.28.113

# Node 20 + pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs python3 python3-venv python3-pip git
sudo npm i -g pm2

# Let pm2 restart your apps after a server reboot
pm2 startup            # run the command it prints
```

Create the env files the apps need (these are **not** in git):

```bash
mkdir -p ~/SVWR-CFE/source-code/backend ~/SVWR-CFE/source-code/ml
nano ~/SVWR-CFE/source-code/backend/.env   # DB, SMTP, GROQ_API_KEY, FRONTEND_URL, etc.
nano ~/SVWR-CFE/source-code/ml/.env        # ML service config
```

---

## 3. AWS Security Group — open the ports

In the EC2 instance's security group, allow inbound TCP for the ports you expose:

| Port | Service |
|---|---|
| 22 | SSH (your IP only, ideally) |
| 3000 | Frontend |
| 3001 | Backend API |
| 8080 | ML gateway |
| 8000 | AI matcher |

---

## 4. Deploy

Just **push to `main`** (or run the workflow manually from the **Actions** tab). The
workflow will: clone the repo on first run, then on each push `git reset --hard` to
the new commit and run `deploy.sh`, which:

1. installs backend deps,
2. builds the frontend (`vite build` → `dist/`),
3. prepares the ML Python venv,
4. restarts everything with **pm2** (`backend`, `ml-gateway`, `frontend`).

Check status on the server: `pm2 status` · logs: `pm2 logs backend`.

---

## Notes / things to verify
- **ML dependencies:** there's no `requirements.txt` yet, so `deploy.sh` installs a
  best-guess list (fastapi, uvicorn, sentence-transformers, scikit-learn, nltk, …).
  For reproducible installs, run `pip freeze > source-code/ml/requirements.txt` on a
  working setup and commit it — `deploy.sh` will use it automatically.
- **Frontend in production:** `vite preview` is fine to start; for real traffic, serve
  `source-code/frontend/dist/` with **nginx** and reverse-proxy `/api` → `:3001`.
- The first deploy is slow (ML installs sentence-transformers models). Later deploys
  are fast.
- This was authored from the repo structure; you may need to tweak ports/paths to match
  how you actually run things on the box. Watch the first run's Actions log + `pm2 logs`.
