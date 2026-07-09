# Job Recommendation Engine — How It Works

There are **three independent ML services** in this system. They don't share
code, weights, or state — each powers a different part of the app. This
document explains what each one calculates, how cold start (a brand-new
candidate with no history) is handled, and which files matter.

```
                    ┌─────────────────────────────────────────┐
                    │        THREE SEPARATE ENGINES            │
                    └─────────────────────────────────────────┘

Dashboard / Job Details / Application Modal
        │
        ▼
frontend/services/aiJobMatchingService.ts
        │  POST /hybrid/score/combined  { candidate_id, top_n }
        ▼
   nginx  →  ml-gateway (8080)  →  hybrid_job_recommender.py (8003)
                                          │
                                          ├── calls → ai_job_matcher_og.py (8000)   [Matcher]
                                          └── computes its own score               [Hybrid]
                                          │
                                          ▼
                              combined_score_candidate()
                              matcher% + hybrid% (dynamic split, see §3)
                                          │
                                          ▼
                              { scored_jobs: [...] }  →  JobCard.tsx / JobDetails.tsx renders it


"For You" tab (PersonalizedFeed.tsx)
        │
        ▼
GET /api/v1/feed?page=1&top_n=10  (feed.controller.ts)
        │
        ▼
   ml-gateway (8080)  →  feed_recommender.py (8002)   [Feed — fully separate, no relation to the above]
```

## 1. The Matcher — `ai_job_matcher_og.py` (port 8000)

A **rule-based, per-job, exact/semantic-match scorer**. For one candidate vs.
one job it computes four factors and adds them up:

| Factor | Weight | What it checks |
|---|---|---|
| Skills | 40% | Candidate skills (from the skills table + skills tagged on past jobs) vs. job's required/preferred skills — semantic similarity, typo-corrected against a vocabulary built dynamically from the candidate's + job's own skills |
| Qualifications | 25% | Degree hierarchy (15%) + field-of-study similarity (70%) + certifications (15%) |
| Experience | 20% | Years of experience + how *relevant* past roles are (title+description+skills+industry semantic similarity, not just title) |
| Preferences | 15% | Job type, remote/onsite, location, industry, salary, language (95%) + candidate age vs. job's age requirement (5%) |

`total_score = skills*0.40 + qualifications*0.25 + experience*0.20 + preferences*0.15`, as a 0–100 percentage.

It fetches candidate data from `/candidates/full-profile/:id` and the full job
list from `/jobs/candidate/list` (paginated through every page, not just the
first 20), then scores **every job**. No concept of "similar candidates" or
"trending" — a deterministic, explainable checklist. `criteria_scores`,
`skills_breakdown`, `qualifications_breakdown`, `experience_breakdown`, and
`preferences_breakdown` in its response show exactly which sub-scores made up
the total.

**Cold start**: there isn't really a special case — an empty profile just
scores each factor honestly low (e.g. 0% skills match) rather than failing.
A job with no stated requirement for a factor (e.g. no experience minimum)
scores that factor 100%, since there's nothing to fail against.

## 2. The Hybrid Recommender — `hybrid_job_recommender.py` (port 8003)

A **statistical/ML recommender** in the LinkedIn/Netflix style — it learns
patterns across all candidates and jobs rather than checking a fixed
checklist. Five signals, each 0–100, blended into one score:

| Signal | Base weight | Model | What it does |
|---|---|---|---|
| Content | 35% | TF-IDF + sentence-transformer embeddings (`all-MiniLM-L6-v2`) across 7 paired fields: skills, fields (education), location, title (+job_type +company_industry), languages, certifications, and **experience_text** (title+description+skills+industry, mirroring the Matcher's Factor3) | Matches your declared profile against the job semantically |
| Behavior | 30% | (a) Recency-weighted categorical attribute profile (department/job_type/work_arrangement/experience_level/company_name) **and** (b) a content-similarity profile built from the *actual skills/education/experience vectors* of jobs you've viewed/saved/applied to — reusing Content's own feature space — **and** (c) search-query TF-IDF | Recommends jobs like the ones you've actually engaged with, not just generic category matches |
| Collaborative | 20% | PyTorch matrix factorization (implicit feedback, hard negatives from ignored jobs) | "Candidates similar to you also liked this job" — learned only from real interaction rows |
| Freshness | 10% | Exponential decay on `created_at` | Newer postings score higher |
| Popularity | 5% | `application_count` normalized within department | Jobs other candidates engage with score slightly higher |

On top of the weighted sum: a **Business Rules modifier** (±15%: salary fit,
verified employer) and an **Age-fit modifier** (±15%: candidate age vs. the
job's stated age requirement, parsed from free text like "18+"/"25-35").
Neither is a 6th weighted signal — both are policy multipliers applied after.

### Cold start — checked *per candidate*, not globally

Each signal's availability is checked individually for the specific candidate
being scored:

- **Behavior**: `has_behavior = candidate_idx in candidate_preferences or candidate_idx in content_profile`. Zero personal views/saves/applies → Behavior's 30% is fully redistributed onto Content/Collaborative/Freshness/Popularity.
- **Collaborative**: matrix factorization only updates a user's embedding when they appear in at least one training interaction. A candidate with zero interactions has an untrained, random embedding — `has_collaborative` is `False` for them specifically (checked against the real interaction log, not just "is the model trained at all"), and both the raw score *and* the "similar candidates" list are zeroed/emptied rather than showing meaningless noise as if it were real.
- **Content** is always computable (it just needs a declared profile), so it's never zeroed for cold start on its own.

`HybridWeights.normalized(has_collab, has_behavior)` does the redistribution
math, so a candidate with no history at all ends up scoring almost entirely
on Content + Freshness + Popularity, with the freed Behavior/Collaborative
weight going to whichever signals remain.

Every result carries a `reasons: string[]` (plain-English explanations) and a
`detail` object exposing every sub-signal separately: per-pair TF-IDF scores
and matched terms, the standalone semantic score, Behavior's TF-IDF/semantic
split and the actual interacted-job titles that built the profile,
Collaborative's real similar-candidate IDs, Freshness's days-old, Popularity's
raw counts, and the Business Rules reasons — nothing is ever shown as a bare
percentage with no way to inspect what produced it.

## 3. Combining them — `combined_score_candidate()`

This is what the frontend actually calls (`POST /score/combined`). For every
job it blends whichever of the two scores exist:

```python
if matcher_score is not None and hybrid_score is not None:
    final = matcher_weight * matcher_score + hybrid_weight * hybrid_score
    source = "matcher+hybrid"
elif matcher_score is not None:
    final = matcher_score           # hybrid had nothing for this job
    source = "matcher-only"
elif hybrid_score is not None:
    final = hybrid_score            # matcher unavailable/had nothing
    source = "hybrid-only"
```

Two corrections layered on top of the base 70/30 split:

1. **Content is excluded from the hybrid side of this blend.** The Matcher's
   entire score IS a profile-vs-job fit, computed with different math
   (structured factors) from Content's TF-IDF/semantic cosine — but measuring
   the same underlying thing. Including both would silently double-count
   profile-fit and understate how much of the blend is genuinely new signal.
   Content's 35% is redistributed onto Behavior/Collaborative/Freshness/
   Popularity *only within this combined call* — the standalone `/hybrid/score`
   endpoint (no matcher involved) still uses Content normally.

2. **The 70/30 split itself shifts per candidate**, based on how much of
   Hybrid's own composition is genuinely personalized for them:
   ```python
   personalization_ratio = (freshness + popularity + [behavior if present] + [collaborative if present])
                          / (behavior + collaborative + freshness + popularity)
   hybrid_weight_adjusted = hybrid_weight * personalization_ratio
   matcher_weight_adjusted = matcher_weight + (hybrid_weight - hybrid_weight_adjusted)
   ```
   A candidate with real Behavior + Collaborative data keeps the full 70/30
   split. A candidate with neither gets pushed toward ~93% matcher / ~7%
   hybrid — because that 7% is now just Freshness/Popularity (real, but not
   "does this fit YOU"), so it shouldn't dilute the Matcher's always-genuine
   profile-fit score with mostly-generic signal.

`matcher_weight`/`hybrid_weight` are request parameters
(`DEFAULT_MATCHER_WEIGHT = 0.70`, `DEFAULT_HYBRID_WEIGHT = 0.30`), tunable
per-request without a redeploy. The graceful-degradation rule (never invent a
0 for a missing signal) applies throughout — a job never gets penalized for
one service simply not having an opinion on it.

The response's `score_source` field tells you which case applied per job;
`weights_used`/`matcher_available` at the top level tell you what actually
happened for that request (including the adjusted split).

## 4. The Job Feed — `feed_recommender.py` (port 8002)

A **completely separate, third engine** with its own text pipeline (NLTK
lemmatize+stem for exact matching, spaCy `en_core_web_md` word vectors for
semantic similarity, dynamic typo-correction built only from the job data's
own vocabulary). It powers *only* `GET /api/v1/feed` (the "For You" tab) —
nothing else in the app calls it, and it shares no code with the Matcher or
Hybrid Recommender above.

7-component weighted score (clamped 0–100%):

| Component | Weight | What it measures |
|---|---|---|
| Profile Match | 35% | Skills (Jaccard + smart TF-IDF/semantic blend, 50%) + experience-range fit (25%) + location (15%) + title similarity (10%) |
| Search History | 20% | Past search queries vs. this job's title/skills/category text |
| View History | 10% | Average similarity (category+skills+title) across every job you've viewed |
| Save History | 10% | Same as View, weighted more toward skills — saving is a stronger intent signal |
| Save Bonus | 10% | Flat 100% if you saved *this exact job* before |
| Recency | 5% | Exponential decay, today=1.0, ~37% at 30 days |
| Popularity | 10% | Application count, normalized within the same category |
| Applied Penalty | −10% | Flat penalty if already applied |

Jobs you've ignored score 0 outright and are excluded.

**Cold start**: `cold_start: true` whenever you have no search queries, no
viewed jobs, no applications, and no saves. The frontend shows "Trending jobs
in your field" messaging in that case; the score itself naturally falls back
to Profile Match + Recency + Popularity since Search/View/Save History all
default to 0 with nothing to compare against.

## 5. Key files

| File | Role |
|---|---|
| `source-code/ml/ai_job_matcher_og.py` | Matcher service (port 8000) |
| `source-code/ml/hybrid_job_recommender.py` | Hybrid Recommender service (port 8003) + `combined_score_candidate()` + `/score`, `/score/combined`, `/score/combined/job/{id}` endpoints |
| `source-code/ml/feed_recommender.py` | Feed service (port 8002) — powers only `/api/v1/feed`, unrelated to the other two |
| `source-code/ml/gateway.py` | Reverse-proxy (port 8080): `/matcher/*`→8000, `/hybrid/*`→8003, `/feed/*`→8002; launches/monitors all ML subprocesses |
| `source-code/backend/src/controllers/feed.controller.ts` | `GET /api/v1/feed` — fetches candidate profile + activity + jobs, calls `feed_recommender.py` |
| `source-code/frontend/services/aiJobMatchingService.ts` | Frontend client for `/hybrid/score/combined` (Matcher+Hybrid combined feed) |
| `source-code/frontend/components/jobs/PersonalizedFeed.tsx` | "For You" tab — calls `/api/v1/feed` directly (not the combined feed) |
| `source-code/frontend/components/DashboardHome.tsx` / `DashboardHome/JobCard.tsx` | Main dashboard feed — fetches the combined feed, renders `total_score`/`matcher_score`/`hybrid_score`/`reasons`/`hybridDetail` |
| `source-code/frontend/components/jobs/JobDetails.tsx`, `JobViewModal.tsx`, `JobApplicationModal.tsx` | Per-job match analysis views — render the Matcher's 4-factor breakdown *and* the Hybrid's full signal breakdown ("Hybrid Recommendation Signals" section) side by side |

## 6. Where the numbers actually come from — no fabricated data

Every signal is computed from real database rows only:
- Skills/qualifications/experience/preferences → `candidates`, `candidate_profiles`, `education`, `work_experience`, `user_skills`/`skills`, `jobs` tables.
- Search/view/save/apply/ignore behavior → `job_searches`, `job_views`, `saved_jobs`, `applications`, `ignored_jobs` tables (real-time via Postgres `LISTEN`/`NOTIFY` — a trigger fires on every insert/update/delete to these tables, and each service's listener picks it up without waiting for a scheduled retrain).
- Collaborative filtering → learned only from real interaction rows; no synthetic click data.

If a signal has no underlying data for a candidate or job, it is *omitted and
its weight redistributed* — never backfilled with a guess, a default, or a
value computed from an untrained model dressed up as if it were real.
