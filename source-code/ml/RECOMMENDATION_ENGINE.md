# Job Recommendation Engine — How It Works

The job feed a candidate sees on Dashboard Home is produced by **two separate ML
services whose scores are blended together**. This document explains what each
one calculates, how the final number is produced, and which files matter.

```
Candidate opens Dashboard Home
        │
        ▼
frontend/services/aiJobMatchingService.ts
        │  POST /hybrid/score/combined  { candidate_id, top_n }
        ▼
   nginx  →  ml-gateway (port 8080)  →  hybrid_job_recommender.py (port 8003)
                                              │
                                              ├── calls → ai_job_matcher_og.py (port 8000)  [Profile Matcher]
                                              └── computes its own score              [Hybrid Recommender]
                                              │
                                              ▼
                                  combined_score_candidate()
                                  70% matcher + 30% hybrid, per job
                                              │
                                              ▼
                                  { scored_jobs: [...] }  →  JobCard.tsx renders it
```

## 1. The Profile Matcher — `ai_job_matcher_og.py`

A **rule-based, per-job, exact/semantic-match scorer**. For one candidate vs. one
job it computes four factors and adds them up:

| Factor | Weight | What it checks |
|---|---|---|
| Skills | 40% | Candidate skills vs. job's required/preferred skills (fuzzy + typo-corrected string matching) |
| Qualifications | 25% | Degree level + field of study vs. job's education requirement |
| Experience | 20% | Years of experience, and how *relevant* past roles are to this job (semantic similarity of past job titles) |
| Preferences | 15% | Job type, remote/onsite, location, industry, salary range, language — vs. candidate's stated preferences |

`total_score = skills*0.40 + qualifications*0.25 + experience*0.20 + preferences*0.15`, as a 0–100 percentage.

It fetches candidate data from the backend (`/candidates/full-profile/:id`) and
the job list from `/jobs/candidate/list`, then loops over **every job** and
scores it. It has no concept of "similar candidates" or "trending jobs" — it's
a deterministic, explainable checklist match. `criteria_scores`,
`skills_breakdown`, `qualifications_breakdown`, `experience_breakdown`, and
`preferences_breakdown` in its response show exactly which sub-scores made up
the total.

**Important gotcha (fixed 2026-07-05):** `get_jobs()` used to call
`/jobs/candidate/list` with no pagination params, which silently defaulted to
the endpoint's first page (20 jobs). The matcher was only ever scoring 20 of
the ~1,000+ jobs in the database. It now pages through the full result set
(100 per page) until `pagination.has_next_page` is false.

## 2. The Hybrid Recommender — `hybrid_job_recommender.py`

A **statistical/ML recommender** in the LinkedIn/Netflix style — it doesn't
just check a checklist, it learns patterns across all candidates and jobs.
Five signals, each 0–100, blended into one score:

| Signal | Weight | Model | What it does |
|---|---|---|---|
| Content-based | 35% | TF-IDF + sentence-transformer embeddings (`all-MiniLM-L6-v2`) | Matches skills/title/location/field text *semantically* — e.g. "Python" relates to "Backend Developer" even without an exact string match |
| Behavior-based | 30% | Recency-weighted attribute profile + search-query TF-IDF | Learns what the candidate has recently searched, viewed, saved, applied to, or ignored, and scores new jobs against that evolving interest profile |
| Collaborative filtering | 20% | PyTorch matrix factorization (implicit feedback, hard negatives from ignored jobs) | "Candidates similar to you also liked this job" — learns from the whole interaction history across all candidates |
| Freshness | 10% | Recency decay on `published_at` | Newer postings score higher |
| Popularity | 5% | Normalized `view_count`/`application_count` | Jobs other candidates are engaging with score slightly higher |

If a candidate is brand new (no interaction history), the weights **renormalize**
across whichever signals do have data — collaborative filtering doesn't just
silently contribute 0 for a cold-start candidate, its weight share is
redistributed to content/behavior/freshness/popularity instead
(`HybridWeights.normalized()`).

A **business-rule modifier** (salary fit, verified employer) is applied on top
as a multiplier, not as a 6th weighted signal.

Every result carries a `reasons: string[]` — a plain-English explanation
(e.g. "Posted by a verified employer.", "Matches your recent searches for
X.", "Candidates with a similar profile also applied to this job.") — nothing
is ever shown as a bare percentage.

**Important gotcha (fixed 2026-07-05):** `fetch_active_jobs()` selected every
job with `status = 'active'`, but never checked whether `published_at` was
still in the future. 767 of 1,005 "active" jobs in the demo dataset are
scheduled for a future publish date — jobs real candidates can't see yet. The
query now also requires `published_at IS NULL OR published_at <= now()`,
matching exactly what the real candidate-facing job list already enforces.

## 3. Combining them — `combined_score_candidate()`

This is the function the frontend actually calls (`POST /score/combined`).
For every job, it takes whichever of the two scores exist and blends them:

```python
if matcher_score is not None and hybrid_score is not None:
    final = 0.70 * matcher_score + 0.30 * hybrid_score
    source = "matcher+hybrid"
elif matcher_score is not None:
    final = matcher_score           # hybrid had nothing for this job
    source = "matcher-only"
elif hybrid_score is not None:
    final = hybrid_score            # matcher unavailable/had nothing
    source = "hybrid-only"
```

The 70/30 split is **not hardcoded** — `matcher_weight`/`hybrid_weight` are
request parameters (`DEFAULT_MATCHER_WEIGHT = 0.70`, `DEFAULT_HYBRID_WEIGHT =
0.30` in `hybrid_job_recommender.py`), so the split can be tuned per-request
without a redeploy. This graceful-degradation rule (never invent a 0 for a
missing signal) was an explicit requirement — a job never gets penalized for
one service simply not having an opinion on it.

The response's `score_source` field on each job tells you which case applied,
and `weights_used`/`matcher_available` at the top level tell you what
actually happened for that request.

## 4. Key files

| File | Role |
|---|---|
| `source-code/ml/ai_job_matcher_og.py` | Profile Matcher service (port 8000) |
| `source-code/ml/hybrid_job_recommender.py` | Hybrid Recommender service (port 8003) + `combined_score_candidate()` + the `/score` and `/score/combined` endpoints |
| `source-code/ml/gateway.py` | Reverse-proxy gateway (port 8080) that routes `/matcher/*` → 8000, `/hybrid/*` → 8003, etc., and launches/monitors all ML subprocesses |
| `source-code/frontend/services/aiJobMatchingService.ts` | Frontend client — calls `/hybrid/score/combined` |
| `source-code/frontend/components/DashboardHome.tsx` | Fetches the combined feed and transforms it for display |
| `source-code/frontend/components/DashboardHome/JobCard.tsx` | Renders `total_score` / `matcher_score` / `hybrid_score` / `reasons` per job |
| `source-code/backend/src/controllers/job.controller.ts` (`getJobsForCandidates`) | The paginated job list both the matcher and real candidates use — the source of truth for "is this job actually visible yet" |

## 5. Where the numbers actually come from — no fabricated data

Every signal is computed from real database rows only:
- Skills/qualifications/experience/preferences → `candidates`, `candidate_profiles`, `education`, `work_experience`, `jobs`, `job_skills` tables (via the backend API).
- Search/view/save/apply/ignore behavior → `job_searches`, `job_views`, `saved_jobs`, `applications`, `ignored_jobs` tables (via direct DB queries in `hybrid_job_recommender.py`).
- Collaborative filtering → learned only from real `applications`/`ignored_jobs`/`job_views` interaction rows; no synthetic click data is generated.

If a signal has no underlying data for a candidate or job (e.g. a brand-new
candidate with zero interactions), it is *omitted and its weight
redistributed* — never backfilled with a guess.
