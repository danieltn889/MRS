# SimuHire — System & User Guide

*A recruitment platform that matches candidates to jobs using a rule-based profile matcher blended with a 5-signal machine-learning recommender ("hybrid engine").*

---

## 1. What the platform does

SimuHire has three kinds of users:

| Role | What they do |
|---|---|
| **Candidate** | Builds a profile (education, skills, experience, preferences), browses/applies to jobs, sees a personalized match score on every job. |
| **Recruiter / Company Admin** | Posts jobs for a company, reviews applicants, sees each candidate ranked/scored against the job. One company can have several recruiters; one email can also belong to more than one company (see §5). |
| **System Admin** | Platform owner. Manages all companies, all users, moderates jobs, sees platform-wide analytics. |

The same email address can now hold **separate accounts per role** (e.g. one person can be a candidate on one account and a recruiter on another, using the same email but different passwords) — see §5.

---

## 2. Architecture

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────────────┐
│   Frontend       │      │   Backend API        │      │   ML Gateway            │
│   React + Vite   │◄────►│   Node.js/Express/TS │◄────►│   Python / FastAPI      │
│   (Tailwind CSS) │      │   (port varies, pm2)  │      │   hybrid_job_recommender │
└─────────────────┘      └──────────┬───────────┘      │   .py (port 8003)       │
                                     │                   └─────────────────────────┘
                                     ▼
                            ┌──────────────────┐
                            │   PostgreSQL       │
                            │   (users, jobs,    │
                            │   applications,     │
                            │   candidate/job     │
                            │   snapshots, etc.)  │
                            └──────────────────┘
```

- **Frontend**: React + Vite, built with `npx vite build`, served as static files, proxied through nginx on the production server.
- **Backend**: Express/TypeScript, run with `tsx`, handles auth, jobs, applications, companies, notifications, etc. Talks to the ML Gateway over HTTP (`/matcher/*`, `/hybrid/*` proxy routes).
- **ML Gateway**: a single Python process (`hybrid_job_recommender.py`) that hosts **two** scoring engines side by side (see §3) plus the endpoints that combine them.
- **Process management**: all three services run under `pm2` (`frontend`, `backend`, `ml-gateway`) so they auto-restart on crash and survive reboots.
- **Database**: PostgreSQL. Candidate and job data is mirrored into lightweight "snapshot" tables that the ML Gateway keeps in memory (with a cache + TTL) so it doesn't have to re-query Postgres on every score request.

---

## 3. The Hybrid Matching Engine

This is the core of the platform — the "% match" you see on every job card is actually **two different scoring systems blended together**.

### 3a. The Matcher — rule-based profile fit (4 factors)

A deterministic, explainable scorer that compares a candidate's actual profile fields against a job's actual requirement fields. No machine learning — pure rules, so every point can be explained ("you got 0% on Qualifications because you have no education on file and the job requires A1 Electricity Sciences").

| Factor | Weight | What it compares |
|---|---|---|
| **Skills** | 40% | Candidate's listed skills vs. the job's required/preferred skills (matched, missing, proficiency level). |
| **Qualifications** | 25% | Candidate's education (degree level, field of study, certifications) vs. the job's minimum degree, allowed fields, and required certifications. Supports Rwanda's TVET levels (A0/A1/A2) as well as standard degree names. |
| **Experience** | 20% | Candidate's work history (total years, relevant roles) vs. the job's required years and specific-role requirements. |
| **Preferences** | 15% | Job type, remote/on-site, location, industry, salary range, and language requirements vs. the candidate's stated preferences. |

**Golden rule enforced everywhere in this engine:** if a job doesn't state a requirement for a given sub-item (e.g. no certificate required), that sub-item contributes **nothing** — its weight is redistributed to the parts of the factor that *are* required, instead of silently handing out a "default" mark. A candidate with **zero** matching qualifications never gets partial credit just because the requirement text was hard to parse — unrecognized-but-present requirements score as unmet, not as "no requirement."

### 3b. The Hybrid Recommender — 5-signal ML engine

A learned recommender, closer to what Netflix/Amazon use, combining five independent signals:

| Signal | Base weight | What it captures |
|---|---|---|
| **Content** | 35% | Semantic + TF-IDF similarity between the candidate's profile text and the job description/requirements. |
| **Behavior** | 30% | A recency-weighted profile of what job attributes the candidate has actually engaged with (views, applies, searches), decaying older interactions. |
| **Collaborative** | 20% | "Candidates similar to you also liked/applied to…" — a matrix-factorization model trained on interaction history across all users. |
| **Freshness** | 10% | Rewards recently-posted jobs so old listings don't dominate. |
| **Popularity** | 5% | General engagement level of the job (views/applies), as a pure job attribute. |

**Cold-start handling:** for a brand-new candidate with no interaction history yet (no Behavior or Collaborative data), those two weights are automatically redistributed onto Content/Freshness/Popularity rather than scoring the candidate 0 on signals that simply don't exist yet.

### 3c. Combined Score — what you actually see

The number shown on a job card blends both engines:

```
Combined Score = (Matcher Score × 70%) + (Hybrid Score × 30%)
```

Each scored job carries a `score_source` label so you can tell which engines actually contributed:

- **`matcher+hybrid`** — both engines scored this job; the normal case.
- **`matcher-only`** — the rule-based matcher scored it, but the ML recommender hasn't picked it up yet (e.g. a very new job with no interaction history).
- **`hybrid-only`** — the ML recommender scored it, but the profile matcher hasn't run against this specific job yet.

The UI always tells you which case you're in and shows the raw contributing percentage, so a "24%" is never a mystery number — you can drill into every factor above and see exactly what you have, what the job needs, and what matched.

### 3d. How a job feed request flows end-to-end

1. Candidate opens their dashboard → frontend calls the backend's job-list endpoint.
2. Backend calls the ML Gateway's `/score/combined` endpoint with the candidate's ID.
3. ML Gateway pulls the candidate's snapshot and the full active-job list from its in-memory cache (refreshed whenever a profile or job is created/edited, via cache invalidation).
4. It runs the Matcher across every active job and the Hybrid Recommender across every active job, blends them per §3c, and returns a ranked list with full per-factor breakdowns.
5. Backend returns that to the frontend, which renders the score, the "Poor/Fair/Good/Great Match" label, and the expandable breakdown (Skills/Qualifications/Experience/Preferences panels).

---

## 4. Progressive Web App (PWA) status

**Not yet implemented.** The frontend is a responsive React/Tailwind web app that works well on mobile browsers, but there is currently no `manifest.json`, no service worker, and no "Add to Home Screen" / offline support wired up. If you want this, it would be a separate, scoped addition (a web app manifest + a service worker for asset caching) — let me know if you'd like it built.

---

## 5. Login: multi-role & multi-company support

- **Same email, different roles**: `danieltn889@gmail.com` can exist as both a `recruiter` account and a `candidate` account, each with its own password. The system distinguishes them by `(email, user_type)` instead of by email alone.
- **Same email, multiple companies**: a recruiter/company-admin can belong to more than one company. `company_team.is_default` tracks which company they're currently "acting as."
- **What you see when you log in**:
  - If your email+password matches exactly one account → you're logged in directly, no extra step.
  - If the same password matches more than one **role** (e.g. both your candidate and recruiter accounts use the same password) → you're shown a role picker (Job Seeker / Recruiter / Company Admin / System Admin) before continuing.
  - If, after resolving the role, you belong to more than one **company** → you're shown a company picker before continuing.
  - The Company Dashboard always shows which company you're currently acting as in the welcome banner, so it's never ambiguous which "hat" you're wearing.

---

## 6. System Admin access

| Field | Value |
|---|---|
| **URL** | `https://51.21.51.222` (production server) |
| **Email** | `admin@recruitment.com` |
| **Password** | *(seed default — see private notes, not stored in this repo)* |

⚠️ **This repo is public.** The actual admin credential is intentionally omitted here. It was set from the seed script's default password — rotate it from the admin account settings, and keep the real value out of version control.

The System Admin account can:
- View/manage all companies and their recruiters.
- View/manage all candidate and recruiter accounts.
- Moderate job postings platform-wide.
- See platform-wide usage/billing analytics.

---

## 7. Production deployment reference

| Item | Value |
|---|---|
| Server | `51.21.51.222` (AWS, `ubuntu` user, `ssh_key.pem`) |
| Process manager | `pm2` — processes: `frontend`, `backend`, `ml-gateway` |
| Frontend build | `npx vite build` inside `source-code/frontend`, served statically |
| Backend runtime | `tsx` (no separate build step), restarted via `pm2 restart backend` |
| ML Gateway | `hybrid_job_recommender.py`, restarted via `pm2 restart ml-gateway` |
| Database | PostgreSQL, database name `SVWR_CFE_DB_OG` |

---

*This document reflects the system as of 2026-07-12. If the scoring weights, roles, or login flow change, this guide should be updated to match.*
