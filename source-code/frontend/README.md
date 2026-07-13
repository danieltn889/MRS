# HRS Frontend

React + Vite + TypeScript single-page application for candidates, recruiters, and
administrators. Part of the [HRS platform](../README.md).

## Tech stack

- **React 18** + **Vite** + **TypeScript** (strict mode)
- **Tailwind CSS** for styling
- **React Router v6** for routing
- **Socket.IO client** for real-time chat, notifications, and evaluation progress
- **Monaco Editor** (simulation code editor), **Lucide** icons
- **tesseract.js** + **pdfjs-dist** for client-side OCR / resume & transcript parsing

## Folder structure

```text
frontend/
  components/     UI components (profile, simulation, dashboard, results, blockchain, …)
  pages/          Page-level components (e.g. OAuth callbacks)
  services/       API clients (authAPI, candidateAPI, simulationAPI, notificationAPI,
                  blockchainAPI, …)
  context/        React contexts (AuthContext, ThemeContext)
  utils/          Helpers (e.g. documentTextExtractor for OCR)
  App.jsx         Route definitions
  Dashboard.tsx   Authenticated shell (sidebar + header + view switch)
```

## Installation & running

```bash
npm install
cp .env.example .env.local      # set VITE_API_URL etc.
npm run dev                     # Vite dev server on http://localhost:3000
npm run build                   # production build → dist/
npm run preview                 # preview the production build
```

### Environment

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_URL` | Backend API base | `http://localhost:3001/api/v1` |
| `VITE_SOCKET_URL` | Socket.IO base (optional; derived from API URL) | `http://localhost:3001` |

## Routing & state

- Routes are declared in `App.jsx`. Private routes are wrapped in `ProtectedRoute`, which
  stores the attempted URL and redirects to `/login`; `Login` reads it and returns the user
  to where they were after authenticating.
- Authenticated users render `Dashboard.tsx`, which uses a **view switch**
  (`currentView` + `renderView()`) driven by the `Sidebar` menu (`onViewChange(id)`), in
  addition to React-Router routes for deep-linkable pages (e.g. `/session-report/:id`,
  `/jobs/:id`, `/blockchain`).
- Auth state lives in `AuthContext` (token + user in `localStorage`, exposed via `useAuth()`).

## Authentication flow

1. User logs in → `authAPI.loginUser` → `AuthContext.login(user, token)` stores both.
2. Requests attach `Authorization: Bearer <token>` (see `getAuthHeaders` in services).
3. `ProtectedRoute` blocks unauthenticated access and remembers the target URL.
4. Sockets send the token in the handshake `auth` so the server can identify the user.

## Services

Each file in `services/` wraps a backend area and centralizes auth headers + error handling,
e.g. `candidateAPI.ts` (profile), `simulationAPI.ts` (simulations/chat + `SOCKET_BASE_URL`),
`notificationAPI.ts` (bell), `blockchainAPI.ts` (audit-chain verify/explorer).

## Key components

- **Profile**: `ProfileManagement` + `profile/*` sections (education, experience, skills,
  resume, portfolio, preferences, privacy) with file upload/preview/download.
- **Simulation**: `SimulationExecutor` + `SimulationExecutor/*` (task list, file explorer,
  chat, GitHub panels, countdown timer, `EvaluationProgress` overlay).
- **Results**: `SessionReport` (full assessment), `SimulationSessionViewer` (results modal).
- **Blockchain**: `BlockchainExplorer` (chain status, verify, browse blocks).
- **Shell**: `Dashboard`, `Sidebar`, `Header` (search + notification bell).

## Styling

Tailwind utility classes with a small set of theme colors (`ThemeContext`). Components favor
cards, progress bars, and consistent spacing; destructive actions use a shared `ConfirmDialog`.

## Build process

`npm run build` runs Vite (esbuild) and emits static assets to `dist/`. Note esbuild does
**not** type-check   run `npx tsc --noEmit` separately to catch type errors before shipping.
