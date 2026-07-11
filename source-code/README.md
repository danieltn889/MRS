# MRS   Virtual Workspace for Recruitment & Culture-Fit Evaluation

MRS is a multi-tenant virtual work-simulation platform for recruitment and culture-fit
evaluation. It combines realistic work tasks, AI-based behavioural and code analysis,
recruiter/admin dashboards, real-time chat & notifications, and a tamper-evident
blockchain/audit-chain layer that lets results be independently verified.

> Academic project: see the [root README](../README.md) for capstone/company details.

## Company Information

| Item | Details |
|------|---------|
| Company name | Mpuza Inc. |
| Official email | info@mpuza.com |
| Industry supervisor | Derek J. Blair (CTO) |

---

## Table of contents

- [Key features](#key-features)
- [System architecture](#system-architecture)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Running the project](#running-the-project)
- [Running tests](#running-tests)
- [API documentation](#api-documentation)
- [Further documentation](#further-documentation)
- [Troubleshooting](#troubleshooting)

---

## Key features

| Module | Description |
|--------|-------------|
| **Authentication** | JWT auth, email verification, password reset, team invitations, GitHub OAuth. Protected routes with redirect-after-login. |
| **Candidate Profile** | Basic info, education, work experience, skills, resume, portfolio, preferences, privacy; profile-completion tracking; file uploads with preview/download. |
| **Recruiter / Admin Dashboards** | Job management, candidate search, applications, simulation management, analytics. |
| **Simulations** | Task execution, file explorer (Monaco editor), countdown timer with auto-save, GitHub repo work, real-time chat. |
| **AI Evaluation** | Multi-dimensional scoring, GitHub analysis, hiring recommendation, transparent step-by-step progress. See [AI_EVALUATION.md](docs/AI_EVALUATION.md). |
| **GitHub Integration** | Repository/commit analysis, commit-message quality, commit→task matching (LLM + ML). |
| **Blockchain Verification** | Hash-linked audit chain + optional Ethereum anchoring; verify-chain & explorer. See [BLOCKCHAIN.md](docs/BLOCKCHAIN.md). |
| **Notifications** | Persistent notifications + real-time socket push; notification bell with grouping & navigation. |
| **Email System** | Nodemailer/SMTP; verification, reset, welcome, invitations, submission confirmation (candidate + company) with `email_tracking` logging and dedupe. |
| **File Uploads / Resume Parsing / OCR** | Multer disk storage; client-side OCR & resume/transcript text extraction (`tesseract.js`, `pdfjs-dist`). |
| **Reports / Results Dashboard** | Full assessment report: scores, charts/progress bars, timeline, evidence, hiring recommendation, blockchain verification, print/PDF. |

---

## System architecture

```
┌──────────────┐    REST + WebSocket    ┌──────────────────┐
│   Frontend   │  ───────────────────▶  │     Backend      │
│ React + Vite │   (HTTP / Socket.IO)   │ Express + TS     │
│  :3000       │  ◀───────────────────  │  :3001           │
└──────────────┘                        └──────────────────┘
                                          │   │   │   │
                          ┌───────────────┘   │   │   └──────────────┐
                          ▼                   ▼   ▼                  ▼
                 ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
                 │ PostgreSQL   │   │ AI services  │   │ Ethereum / Hardhat │
                 │  :8090       │   │ Groq, comms  │   │  :8545 (optional)  │
                 └──────────────┘   │ :8091/:8097  │   └────────────────────┘
                                    └──────────────┘
```

The backend also maintains an application-level **audit chain** (in PostgreSQL) that does not
require the Ethereum node.

---

## Technology stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, React Router v6, Socket.IO client,
  Monaco Editor, Lucide icons, `tesseract.js` + `pdfjs-dist` (OCR).
- **Backend:** Node.js, Express, TypeScript (ESM), raw PostgreSQL via `pg`, Socket.IO,
  Nodemailer, Multer, Winston/Morgan, JWT, `ethers` (blockchain), Groq SDK (AI).
- **Blockchain:** Hardhat, Solidity, Ethers.js.
- **AI/ML:** Groq LLM + Python microservices (communication classifier, commit matcher).
- **Database:** PostgreSQL.

---

## Project structure

```text
source-code/
  frontend/    React + Vite SPA (candidate, recruiter, admin UIs)
  backend/     Express + TypeScript API, Socket.IO, services, DB migrations
  blockchain/  Hardhat smart-contract project (LocalSimulation.sol)
  ml/          Python AI/NLP scripts (matching, scoring, behaviour analysis)
  database/    Database scripts/notes
  docs/        Technical documentation (this folder)
  assets/      Static assets
  scripts/     Helper scripts
  tests/       Shared testing resources
```

Backend internals: `backend/src/{config,controllers,middleware,routes/v1,services,utils,db}`.
Frontend internals: `frontend/{components,pages,services,context,utils}`.

---

## Prerequisites

| Tool | Version / Notes |
|------|-----------------|
| Node.js | 18+ (uses ESM, `tsx`, and Node's built-in test runner) |
| npm | 9+ |
| PostgreSQL | 14+ (default local port **8090**) |
| Git | any recent version |
| Python | 3.10+ (only for the AI/ML microservices) |
| Hardhat | optional   only for the on-chain Ethereum layer |

Redis and Docker are **not required**.

---

## Installation

```bash
# 1. Clone
git clone <repo-url>
cd project-Daniel/source-code

# 2. Backend
cd backend
npm install
cp .env.example .env        # then edit values (see Environment variables)

# 3. Database (creates schema + seed data)
npm run db:setup            # = migrate + seed

# 4. Frontend
cd ../frontend
npm install
cp .env.example .env.local  # then edit VITE_API_URL etc.

# 5. (optional) Blockchain node
cd ../blockchain
npm install
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Purpose | Example |
|----------|---------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `8090` |
| `DB_NAME` | Database name | `SVWR-CFE_DB` |
| `DB_USER` | DB user | `postgres` |
| `DB_PASSWORD` | DB password | `********` |
| `PORT` | API/server port | `3001` |
| `NODE_ENV` | `development` / `production` | `development` |
| `JWT_SECRET` | Secret for signing JWTs | `change-me` |
| `JWT_EXPIRE` | Token lifetime | `30d` |
| `CORS_ORIGIN` | Allowed origin | `http://localhost:3000` |
| `FRONTEND_URL` | Used in email links | `http://localhost:3000` |
| `API_BASE_URL` | Base for generated file URLs | `http://localhost:3001` |
| `SMTP_HOST` | Mail server host | `smtp.example.com` |
| `SMTP_PORT` | Mail server port | `587` |
| `SMTP_USER` | SMTP username / from address | `notify@example.com` |
| `SMTP_PASS` | SMTP password | `********` |
| `GROQ_API_KEY` | Groq LLM key (AI evaluation) | `gsk_…` |
| `COMMUNICATION_API_URL` | Communication classifier service | `http://localhost:8091` |
| `USE_BLOCKCHAIN` | Enable Ethereum anchoring | `false` |
| `BLOCKCHAIN_RPC_URL` | Hardhat/Ethereum RPC | `http://127.0.0.1:8545` |
| `CONTRACT_ADDRESS` | Deployed contract (optional) | `0x…` |

### Frontend (`frontend/.env.local`)

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_URL` | Backend API base | `http://localhost:3001/api/v1` |
| `VITE_SOCKET_URL` | Socket.IO base (optional; derived from API URL) | `http://localhost:3001` |

> Never commit `.env` files, secrets, JWT keys, SMTP passwords, or blockchain private keys.

---

## Running the project

### Development

```bash
# Backend (runs db:setup, then tsx server on :3001)
cd backend && npm run dev

# Frontend (Vite dev server on :3000)
cd frontend && npm run dev

# Optional: Ethereum node + deploy
cd blockchain && npx hardhat node
cd blockchain && npx hardhat run scripts/deploy.js --network localhost
```

Open `http://localhost:3000`.

### Production

```bash
cd backend  && npm run build   # type-check; run with `node dist/server.js` / tsx
cd frontend && npm run build   # outputs static assets to dist/
```

Serve the frontend `dist/` behind a web server / CDN and run the backend behind a reverse
proxy. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Running tests

```bash
# Backend   audit-chain hash/verification unit tests (Node test runner via tsx)
cd backend && npm run test:audit-chain

# Backend   type-check
cd backend && npm run type-check

# Frontend   type-check
cd frontend && npx tsc --noEmit
```

> A Jest config is present (`npm test`) but the active unit suite currently runs through
> `tsx` (`test:audit-chain`). End-to-end testing is manual against the running stack.

---

## API documentation

All endpoints are versioned under `/api/v1`. Groups: **auth, candidates, jobs, applications,
simulations, github, blockchain, notifications, files (`/uploads`)**. Full reference with
request/response examples: [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

---

## Further documentation

- [docs/BLOCKCHAIN.md](docs/BLOCKCHAIN.md)   audit chain & Ethereum verification
- [docs/AI_EVALUATION.md](docs/AI_EVALUATION.md)   evaluation flow & scoring
- [docs/DATABASE.md](docs/DATABASE.md)   schema, relationships, migrations
- [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)   endpoint reference
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)   deployment guide
- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)   contributing & conventions
- [frontend/README.md](frontend/README.md) / [backend/README.md](backend/README.md)

---

## Troubleshooting

| Problem | Likely cause / fix |
|---------|--------------------|
| Backend can't connect to DB | Check `DB_*` vars; PostgreSQL must be running on port **8090**. |
| `npm run dev` fails on `db:setup` | Ensure the database exists and migrations can run; check DB credentials. |
| Frontend calls fail (CORS/404) | `VITE_API_URL` must point to the backend (`http://localhost:3001/api/v1`); `CORS_ORIGIN` must include the frontend origin. |
| Sockets not connecting | Confirm the backend is up; the client derives the socket URL from `VITE_API_URL` unless `VITE_SOCKET_URL` is set. |
| Emails not sending | Configure `SMTP_*`; failures are logged and never block submission. |
| AI scores are 0 / missing | `GROQ_API_KEY` / AI microservices unavailable   evaluation degrades gracefully. |
| Blockchain tx is null | `USE_BLOCKCHAIN` not `true` or no node at `BLOCKCHAIN_RPC_URL`; the audit chain still works. |
