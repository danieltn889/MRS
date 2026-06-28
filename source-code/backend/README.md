# V-WES Backend

Node.js + Express + TypeScript API for the V-WES recruitment and culture-fit evaluation
platform. Handles authentication, profiles, jobs/applications, simulations, AI evaluation,
GitHub analysis, notifications, email, and blockchain verification. Part of the
[V-WES platform](../README.md).

## Company Information

| Item | Details |
|------|---------|
| Company name | Mpuza Inc. |
| Official email | info@mpuza.com |
| Industry supervisor | Derek J. Blair (CTO) |

---

## Architecture

Layered request flow:

```
routes/v1 (validation, auth) → controllers → services → PostgreSQL (pg)
                                     │
                                     └── Socket.IO, email, notifications, audit chain
```

- **ESM TypeScript** run with `tsx` in development; type-checked with `tsc --noEmit`.
- **Raw SQL** via `pg` (parameterized; no ORM).
- **Socket.IO** initialized in `src/server.ts` with JWT-verified handshakes and per-user rooms.

### Project structure

```text
backend/
  src/
    config/       App, database (pg pool), logger configuration
    controllers/  Request handlers (auth, candidate, simulation, github, blockchain, …)
    middleware/   auth (protect/authorize), validation, upload
    routes/v1/    Versioned API routes
    services/     Business logic & integrations
                  (email, notification, audit-chain, blockchain, database, …)
    utils/        Helpers (fileUrl, logger, …)
    db/           schema.sql, migrate.ts, seed.ts, reset.ts
  emails/         (legacy) email artifacts
  logs/           Runtime logs
  uploads/        Uploaded files (served at /uploads)
```

---

## Installation

```bash
npm install
cp .env.example .env      # configure (see below)
npm run db:setup          # migrate + seed
npm run dev               # tsx server on :3001
```

### Environment

See the full table in the [main README](../README.md#environment-variables). Minimum:
`DB_HOST/PORT/NAME/USER/PASSWORD`, `JWT_SECRET`, `PORT=3001`, `FRONTEND_URL`, `CORS_ORIGIN`,
`SMTP_*`, `GROQ_API_KEY`. Optional: `USE_BLOCKCHAIN`, `BLOCKCHAIN_RPC_URL`, `CONTRACT_ADDRESS`,
`COMMUNICATION_API_URL`.

---

## Running

```bash
npm run dev          # development (db:setup + tsx src/server.ts)
npm run build        # type-check (tsc --noEmit)
npm run type-check   # type-check
node dist/server.js  # production (after a build step that emits dist/)
```

---

## Useful scripts

```bash
npm run migrate            # apply schema.sql
npm run seed               # seed data
npm run db:setup           # migrate + seed
npm run db:reset           # drop & recreate (destructive)
npm run test:audit-chain   # audit-chain unit tests (Node test runner via tsx)
```

---

## Database

PostgreSQL, schema in `src/db/queries/schema.sql`, applied idempotently by
`src/db/migrate.ts`. Full schema, relationships, and backup instructions:
[docs/DATABASE.md](../docs/DATABASE.md).

---

## API

Versioned under `/api/v1`. Groups: auth, candidates, jobs/applications, simulations, github,
blockchain, notifications, files. Full reference with examples:
[docs/API_DOCUMENTATION.md](../docs/API_DOCUMENTATION.md).

---

## Security

- **JWT** auth (`protect`) + role checks (`authorize`); tokens signed with `JWT_SECRET`.
- **Password hashing** (bcrypt) for stored credentials.
- **Validation** via `express-validator` (UUIDs, enums, lengths, dates); server-side enum
  validation for preferences/privacy/availability.
- **Socket auth**: handshake JWT is verified; `join_user` is restricted to the user's own room.
- **Uploads**: type/size limits via Multer; files served from `/uploads`.
- Do not commit `.env`, secrets, JWT keys, SMTP passwords, private keys, or logs.

---

## Email system

Nodemailer over SMTP (`src/services/email.service.ts`). Workflows: account verification,
password reset, welcome, team invitations, and **simulation submission confirmation** (sent to
the candidate **and** the company after the submission is saved; idempotent via
`email_tracking`; every attempt logged). Configure `SMTP_HOST/PORT/USER/PASS`.

---

## GitHub integration

`src/controllers/github.controller.ts` analyzes a candidate's repository: commits, branches,
README/config detection, commit-message quality (spam/generic detection), and commit→task
matching (Groq LLM + ML service). Requires a GitHub token / connection.

---

## AI evaluation

`submitSimulation` → `calculateFullSessionScores` produces multi-dimensional scores, a hiring
recommendation, and feedback, streaming progress to the client over Socket.IO. Full details:
[docs/AI_EVALUATION.md](../docs/AI_EVALUATION.md).

---

## Blockchain

The backend maintains a **hash-linked audit chain** (`audit_chain` table +
`audit-chain.service.ts`) and optionally anchors to a local Ethereum chain via
`ethers`/Hardhat. Architecture, block format, hashing, verification, APIs, and testing are
documented in [docs/BLOCKCHAIN.md](../docs/BLOCKCHAIN.md).
