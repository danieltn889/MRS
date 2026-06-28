# AI Evaluation Documentation

This document explains how the platform evaluates a candidate's simulation submission and
produces scores, feedback, and a hiring recommendation.

Primary implementation: `backend/src/controllers/simulation.controller.ts`
(`submitSimulation` → `calculateFullSessionScores`) and
`backend/src/controllers/github.controller.ts` (repository analysis).

---

## 1. Workflow

When a candidate submits a simulation (`POST /api/v1/simulations/sessions/:id/submit`):

1. **Validate & guard** — session ownership, not already submitted, minimum 3 minutes spent.
2. **Evaluate** (`calculateFullSessionScores`) — synchronous; computes all scores.
   Progress is streamed to the candidate over Socket.IO as `evaluation_progress` events
   (stages: *Saving → Analyzing repository → Communication → Code quality → Technical →
   AI feedback → Finalizing → Complete*).
3. **Persist** in one transaction — `simulation_sessions` (status, answers, score,
   `submission_results` JSONB), `simulations`, `evaluations`, `evaluation_sections`,
   `evaluation_behavioral_metrics`, `evaluation_ai_feedback`, and (if enabled)
   `blockchain_records`.
4. **Audit** — append a `simulation_submitted` block to the audit chain.
5. **Notify** — send a confirmation email (candidate + company) and persist notifications.
6. **Respond** — return the full `submission_results` object including `emailSent`.

The progress events make the evaluation **transparent** — the candidate sees each stage
rather than an opaque wait. The live overlay is `frontend/components/SimulationExecutor/EvaluationProgress.tsx`.

---

## 2. Scores

`calculateFullSessionScores` computes the following (each 0–100):

| Score | Basis |
|-------|-------|
| **Technical** | Code quality of technical/code tasks (`calculateAnswerQuality` / `detectCodeQuality`) |
| **Quality** | Average of technical, punctuality, adaptability |
| **Punctuality** | Per-task on-time vs. late, weighted (partial credit for late work) |
| **Adaptability** | Handling of unexpected tasks; abandonment penalty, creativity bonus |
| **Speed** | On-time completion (binary per task) and session time used |
| **Communication** | Chat analysis (classifier API + Groq LLM) |
| **Collaboration** | Message volume, balance, and sentiment |
| **GitHub** | Repository analysis (see below) |
| **Behavioral** | Average of adaptability and communication |

### Weighted overall

```
overall = quality*0.60 + speed*0.15 + behavioral*0.10 + github*0.15
```

(weights come from the simulation's scoring rubric, falling back to the defaults above).
Pass/fail uses the rubric's passing score (default 70).

---

## 3. GitHub analysis

`calculateGitHubScore` (calls `github.controller.ts`) fetches the repository and scores it
out of a 120-point internal scale, normalized to 0–100:

| Component | Max | Notes |
|-----------|-----|-------|
| Commits | 40 | Count-based tiers, **adjusted by commit-message quality** (see below) |
| README | 15 | Presence + AI quality + task coverage |
| Config files | 10 | `package.json`, `tsconfig.json`, etc. |
| `.gitignore` | 5 | Presence |
| Code files | 20 | Count + language detection |
| Commit→task matching | 30 | Groq LLM (first ~10 commits) + ML service (first ~15) |

### Commit-message quality

`analyzeCommitMessageQuality` flags **empty/spam commits** and **generic messages**
(`update`, `test`, `fix`, `final`, `done`, …) and rewards meaningful ones. The result applies
a bounded factor (0.7–1.0) to the commit score, so generic-heavy histories lose up to 30% of
their commit points. The breakdown is surfaced in the analysis output.

---

## 4. Code quality analysis

`detectCodeQuality` / `calculateAnswerQuality` inspect submitted code for: functions,
conditionals, loops, returns, error handling, classes, imports, lines of code, and detected
language, producing a `codeQuality` score and feature breakdown used by the Technical score.

> Note: the backend computes the categories above. The results UI **only displays scores the
> backend actually computes** — it does not fabricate categories that are not evaluated.

---

## 5. Communication scoring

`calculateCommunicationScore` analyzes the session chat:
- **Classifier API** (`COMMUNICATION_API_URL`, default `http://localhost:8091`) →
  dominant style, communication score, style counts.
- **Groq LLM** → tone, clarity, professionalism, engagement, questions asked, answers
  provided, strengths, improvements.

The combined result feeds the Communication and Collaboration scores.

---

## 6. Hiring recommendation

Derived transparently from the overall score and the strengths/gaps:

| Overall | Recommendation |
|---------|----------------|
| ≥ 85 | **Strong Hire** |
| ≥ 70 | **Hire** |
| ≥ 60 | **Borderline** |
| ≥ 45 | **Needs Improvement** |
| < 45 | **Not Recommended** |

Each carries a reasoning string built from the actual scores (technical, quality,
communication, GitHub) plus the top strengths/gaps. It is stored inside
`submission_results.feedback.hiring_recommendation` and the top-level
`submission_results.hiringRecommendation`, and shown on the results page.

---

## 7. Result generation & retrieval

- `submission_results` (JSONB on `simulation_sessions`) holds the complete result:
  scores, score breakdown, task analysis, feedback (strengths/improvements/summary,
  hiring recommendation), GitHub analysis, communication analysis, time tracking, blockchain
  info, and `emailSent`.
- Retrieve via `GET /api/v1/simulations/sessions/:id/results` (normalized scores) or
  `GET /api/v1/simulations/sessions/:id/submission-results` (full JSONB).
- The results dashboard is `frontend/components/SessionReport.tsx`.

---

## 8. External services / configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `GROQ_API_KEY` | LLM for commit matching, README analysis, communication analysis | (required for AI features) |
| `COMMUNICATION_API_URL` | Communication classifier microservice | `http://localhost:8091` |
| (ML matcher) | Commit→task ML matching service | `http://localhost:8097` |

If a service is unavailable, the evaluator degrades gracefully (that component contributes
its default/0 and the rest of the evaluation still completes).
