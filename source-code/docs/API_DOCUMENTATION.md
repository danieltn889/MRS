# API Documentation

All endpoints are versioned under **`/api/v1`** and served by the Express backend
(default `http://localhost:3001`). Unless noted as *Public*, endpoints require a
`Authorization: Bearer <JWT>` header. Role checks use `authorize(...)` middleware.

Standard response envelope:

```json
{ "success": true,  "data": { ... }, "message": "..." }
{ "success": false, "message": "Error description", "errors": [ ... ] }
```

Common status codes: `200` OK, `201` Created, `400` validation, `401` unauthenticated,
`403` unauthorized, `404` not found, `409` conflict, `500` server error.

---

## Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register a candidate |
| POST | `/auth/login` | Public | Login → `{ user, token }` |
| POST | `/auth/check-email` | Public | Check if an email exists |
| POST | `/auth/resend-verification` | Public | Resend verification email |
| POST | `/auth/forgot-password` | Public | Send reset email |
| POST | `/auth/reset-password` | Public | Reset password with token |
| GET | `/auth/verify-email` | Public | Verify email via token |

**Example — login**

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secret"}'
```

```json
{ "success": true, "data": { "user": { "id": "…", "email": "jane@example.com", "userType": "candidate" }, "token": "<jwt>" } }
```

---

## Candidates / Profile — `/api/v1/candidates`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/candidates/profile[/:userId]` | Get full profile (all sections) |
| PUT | `/candidates/profile` | Update basic info |
| POST | `/candidates/profile/photo` | Upload profile photo |
| POST | `/candidates/documents` | Upload a document → `{ file_url, file_key }` |
| GET | `/candidates/profile-completion-status` | Completion %/sections |
| POST/PUT/DELETE | `/candidates/education[/:id]` | Education CRUD |
| POST/PUT/DELETE | `/candidates/experience[/:id]` | Work experience CRUD |
| GET/POST/PUT/DELETE | `/candidates/skills[...]` | Skills (+ `skills-list` autocomplete) |
| POST/PUT/DELETE | `/candidates/portfolio[/:id]` | Portfolio links/files CRUD |
| POST/GET/DELETE/PUT | `/candidates/resume[...]` | Upload/download/delete/set-primary resume |
| PUT | `/candidates/preferences` / `/availability` / `/privacy` | Settings (server-validated enums) |

---

## Jobs & applications — `/api/v1/jobs`, `/api/v1/applications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List/search jobs |
| GET | `/jobs/:id` | Job details (protected) |
| POST | `/jobs/:jobId/apply` | Submit an application |
| GET | `/applications` | List the user's applications |

---

## Simulations — `/api/v1/simulations`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/my-simulations` | candidate | List candidate simulations |
| POST | `/my-simulations/start` | candidate | Start a simulation |
| GET | `/sessions/:sessionId` | any | Session details |
| POST | `/my-simulations/:id/progress` | candidate | Save progress (auto-save) |
| POST | `/sessions/:id/submit` | candidate | **Submit** → runs evaluation, returns results |
| GET | `/sessions/:id/results` | any | Normalized scores |
| GET | `/sessions/:sessionId/submission-results` | any | Full `submission_results` JSONB |
| GET/POST | `/sessions/:sessionId/chat[...]` | any | Chat: list/threaded/send/edit/delete/unread/mark-read |
| POST | `/github-score` | any | Score a GitHub repo |

**Example — submit** `POST /api/v1/simulations/sessions/:id/submit`

```json
// request
{ "answers": { "task_0": { "code": "…" } }, "timeSpent": 1800 }
```

```json
// response (truncated)
{ "success": true, "data": {
  "sessionId": "…", "score": 82, "passed": true,
  "scoreBreakdown": { "technical": 80, "communication": 75, "github": 70, "...": 0 },
  "feedback": { "strengths": ["…"], "improvements": ["…"], "hiring_recommendation": { "level": "hire", "label": "Hire", "reasoning": "…" } },
  "hiringRecommendation": { "level": "hire", "label": "Hire" },
  "emailSent": true
} }
```

During evaluation the backend emits Socket.IO `evaluation_progress` events to the candidate's
room (`user:{id}` / `session:{id}`).

---

## GitHub — `/api/v1/github`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/github/connect` | Link a GitHub account |
| GET | `/github/status` | Connection status |
| GET | `/github/repo/:owner/:repo/everything` | Repo files + commits |
| GET | `/github/repo/:owner/:repo/stats/*` | Contributor / commit-activity / code-frequency stats |

---

## Blockchain — `/api/v1/blockchain`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/blockchain/chain/stats` | any | `{ totalBlocks, lastBlock }` |
| GET | `/blockchain/chain/verify` | any | Verify entire chain → integrity report |
| GET | `/blockchain/chain` | any | Browse/search blocks |
| GET | `/blockchain/chain/:id` | any | Get a block |
| GET | `/blockchain/chain/:id/verify` | any | Verify a single block |

See [BLOCKCHAIN.md](BLOCKCHAIN.md) for payloads and examples.

---

## Notifications — `/api/v1/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List (paginated, `?read=false` for unread) |
| GET | `/notifications/unread-count` | Unread count |
| PUT | `/notifications/:id/read` | Mark one read |
| PUT | `/notifications/mark-all-read` | Mark all read |
| DELETE | `/notifications/:id` | Delete |
| GET/PUT | `/notifications/preferences` | Get/update preferences |

Real-time: the server pushes `notification` and `notification_unread_count` over Socket.IO.

---

## Files — `/uploads`

Uploaded files are served statically at `/uploads/<key>` (e.g.
`/uploads/candidate-documents/<file>`, `/uploads/resumes/<file>`). URLs are generated by
`getFullFileUrl(fileKey)` as `${API_BASE_URL}/uploads/<key>`.

---

## Validation & errors

- Request validation uses `express-validator` (UUIDs, enums, lengths, ISO dates).
- Failed validation → `400` with an `errors[]` array (`{ path, msg }`).
- Auth failures → `401` (no/invalid token) or `403` (wrong role).
- Server-side enum validation is enforced for preferences/privacy/availability.
