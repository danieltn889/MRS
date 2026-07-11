# Simulation Scoring   Full Calculation

How a candidate's simulation score is calculated, end to end, from submission to the
final number shown on the **Candidate Results & Performance Analysis** table.

Source of truth: `backend/src/controllers/simulation.controller.ts` (the
`submitSimulation` / AI-evaluation flow). Line references below.

---

## Step 0   Trigger
When the candidate **submits** the session (`submitSimulation`), the AI evaluation runs
over their task progress, chat messages, time data, and GitHub repository.

## Step 1   Score each task (per task, 0–100)   `~line 4121`
For every task, four sub-scores are computed:

| Sub-score | Meaning |
|---|---|
| **completion** | 100 if completed, partial if in-progress, 0 if not started |
| **time** | time taken vs. the task's time limit |
| **quality** | code/essay quality of the work |
| **answer_quality** | code (≤50) + essay (≤50) + completeness (≤30), normalized to 100 (`~4080–4118`) |

```
Task overall = (completion + time + quality + answer_quality) / 4
```

## Step 2   Aggregate task metrics   `~4157–4165`
```
completionRate         = completedTasks / totalTasks * 100
averageTaskScore       = sum(task.overall) / totalTasks
overallTaskPercentage  = totalPointsEarned / (totalTasks * 100) * 100
```

## Step 3   Competency scores (0–100 each)
| Competency | How | Line |
|---|---|---|
| **Punctuality** | weighted on-time + partial credit across tasks ÷ total weight | `4279` |
| **Speed** | time-efficiency, weighted across tasks | `4577` |
| **Technical** | average quality of the *technical* tasks (default 50 if none) | `4488` |
| **Adaptability** | base − abandonment penalty + creativity bonus (clamped 0–100) | `4415` |
| **Communication** | chat analysis (`communicationScoreResult.score`) | `4006` |
| **Collaboration** | volume (msgs) + balance (msg ratio ×30) + responsiveness (≤30), capped 100 | `4622–4658` |
| **GitHub** | `calculateGitHubScore()`   repo commits/structure/practices | `3973` |

## Step 4   Composite scores
```
Quality    = (Technical + Punctuality + Adaptability) / 3      // ~4599
Behavioral = (Adaptability + Communication) / 2                // ~4611
```

## Step 5   AI Simulation Overall   `4678–4697`
Weighted sum (weights come from the simulation's scoring rubric; defaults shown):

| Component | Default weight |
|---|---|
| Quality | 0.60 |
| Speed | 0.15 |
| Behavioral | 0.10 |
| GitHub | 0.15 |

```
AI Overall % = Quality×0.60 + Speed×0.15 + Behavioral×0.10 + GitHub×0.15
```

This is the **Simulation Score** column.

## Step 6   Pass / Fail   `4703–4704`
```
passed = AI Overall >= passingScore     // rubric.passingScore, default 70
```

## Step 7   Final platform Overall (the table)
The AI score is combined with the **recruiter's task evaluation** (per-task scores the
recruiter enters, 0–100, stored in `simulation_tasks.score`):

```
recruiterAvg = sum(per-task recruiter scores) / totalTasks   // unscored tasks count as 0
Final        = AI Simulation × 0.70 + recruiterAvg × 0.30
```

---

## Worked example
AI components: Quality 85, Speed 70, Behavioral 60, GitHub 50.

```
AI Overall = 85×0.60 + 70×0.15 + 60×0.10 + 50×0.15
           = 51 + 10.5 + 6 + 7.5 = 75%

Recruiter task avg = 80%
Final = 75×0.70 + 80×0.30 = 52.5 + 24 = 76.5%
```

---

## Where each number appears in the UI
- **Candidate Results table**   `Tasks` (recruiter avg %), `Recruiter (30%)`, `Simulation`
  (AI %), `AI (70%)`, `Overall Score` (Final).
- **Candidate Details modal**   "How this score is calculated" → "Show full calculation"
  shows these steps and the candidate's competency scores.

## No new database fields
This reuses existing data only: `evaluations.*` (AI competency scores),
`simulation_tasks.score` / `feedback` (recruiter per-task evaluation), and computes the
averages + weighting at read time. No duplicate tables or columns are introduced.
