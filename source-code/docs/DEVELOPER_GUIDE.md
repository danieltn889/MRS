# Developer Guide

How to work in the MRS codebase: architecture, conventions, and common tasks.

---

## Architecture

- **Frontend** (`frontend/`)   React 18 + Vite SPA. Talks to the backend over REST
  (`/api/v1`) and Socket.IO. Auth state in a React context; protected routes redirect to login.
- **Backend** (`backend/`)   Express + TypeScript (ESM). Layered:
  `routes/v1` → `controllers` → `services` → PostgreSQL (`pg`). Middleware handles auth,
  validation, and uploads. Socket.IO is initialized in `src/server.ts`.
- **Blockchain** (`blockchain/`)   Hardhat project; the backend also keeps an app-level
  audit chain in PostgreSQL.

```
Request → route (validation) → controller → service → DB
                                   │
                                   └── side-effects: sockets, email, notifications, audit chain
```

---

## Coding standards

- **TypeScript strict mode** is on (both apps): `strict`, `noUnusedLocals`,
  `noUnusedParameters`, `exactOptionalPropertyTypes`. Keep imports used; coalesce
  `undefined` → `null` when assigning to `T | null` fields.
- **ESM** on the backend: import local modules with the `.js` extension
  (e.g. `import x from '../services/x.service.js'`) even though the source is `.ts`.
- **Database access** is raw parameterized SQL via `pg`. For JSONB columns, pass
  `JSON.stringify(value)` (objects are auto-serialized, but **arrays must be stringified**).
- **Naming:** `camelCase` for variables/functions, `PascalCase` for components/classes,
  `snake_case` for database columns. Services end with `.service.ts`, routes with
  `.routes.ts`, controllers with `.controller.ts`.
- **Side-effects must be best-effort:** email, notifications, and audit-chain writes must
  never throw into the request path or fail the primary action.

---

## How to add a backend API

1. Add a handler in the relevant `controllers/*.controller.ts` (or a new one).
2. Register the route + validators in `routes/v1/*.routes.ts` with `protect` / `authorize`
   and `express-validator` checks. Put **literal paths before `/:param`** routes.
3. Put reusable logic in a `services/*.service.ts`.
4. Type-check: `npm run type-check`.

## How to add a frontend page/feature

1. Add a component under `frontend/components/`.
2. Add an API function in `frontend/services/*.ts` (use `getAuthHeaders()`).
3. Wire navigation: a route in `App.jsx` (wrap in `ProtectedRoute` if private) **or** a
   Dashboard view (`Dashboard.renderView` switch + a `Sidebar` menu item id).
4. Type-check: `npx tsc --noEmit`.

## How to add an audit-chain event

```ts
import AuditChainService from '../services/audit-chain.service.js';
await AuditChainService.appendBlock({
  eventType: 'task_completed',
  candidateId, simulationId,
  action: 'Task 2 completed',
  metadata: { taskIndex: 2 },
});
```

---

## Running & testing

```bash
# Backend
cd backend
npm run dev               # db:setup + tsx server on :3001
npm run type-check        # tsc --noEmit
npm run test:audit-chain  # Node test runner via tsx (10 tests)

# Frontend
cd frontend
npm run dev               # Vite on :3000
npx tsc --noEmit          # type-check
```

> The frontend build (`vite build`) uses esbuild and does **not** fail on type errors  
> always run `tsc --noEmit` to catch them. Several pre-existing unused-import warnings exist
> in older files; avoid adding new ones in files you touch.

---

## Debugging tips

- Backend logs verbosely to the console and `backend/logs/`. Submission/evaluation steps log
  each phase.
- Socket issues: confirm the client joined the right room (`user:{id}`, `session:{id}`) and
  that the token is sent in the handshake `auth`.
- DB errors on JSONB: check you stringified arrays.
- 403 on a route: check the `authorize(...)` roles; 401 means the token is missing/expired.

---

## Contribution guidelines

- Branch from the default branch; keep commits small with **meaningful messages**
  (the GitHub-analysis scorer penalizes generic messages like `update`/`fix`/`final`).
- Run type-checks (and `test:audit-chain` if touching the chain) before pushing.
- Never commit `.env`, secrets, keys, uploaded private files, or `node_modules`.
- Update the relevant doc in `docs/` when you change behaviour, env vars, or APIs.
