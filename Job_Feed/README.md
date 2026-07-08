# Hybrid Job Recommendation System

A single-file, object-oriented implementation combining **content-based
filtering**, **collaborative filtering (PyTorch matrix factorization)**,
and **behavior modeling** into one ranked job feed per candidate.

## Files

```
hybrid_job_recommender.py   <- everything: config, data loading, models, CLI
requirements.txt
data/                       <- put the 4 CSVs here (or generate synthetic ones)
outputs/                    <- recommendations.csv gets written here
logs/                       <- recommender.log
```

## Setup

### 1. Create and activate a virtual environment

```bash
# Create a venv named "venv" (you can name it whatever you like)
python3 -m venv venv

# Activate it
# On Linux / macOS:
source venv/bin/activate
# On Windows (PowerShell):
venv\Scripts\Activate.ps1
# On Windows (cmd.exe):
venv\Scripts\activate.bat
```

You'll know it worked because your terminal prompt will show `(venv)` at
the start of the line. To leave the venv later, just run `deactivate`.

### 2. Install dependencies inside the venv

```bash
pip install -r requirements.txt
```

## How the script connects to your CSVs

The script never hardcodes file paths — it builds them from `--data-dir`
(default `./data`) inside `RecommenderConfig`:

```python
@property
def candidate_path(self) -> Path:
    return self.data_dir / "Complete_Candidate_Profile.csv"
```

So `DataLoader.load_all()` looks for these **exact filenames** inside
whatever folder you pass as `--data-dir`:

```
<data-dir>/Complete_Candidate_Profile.csv
<data-dir>/Complete_Job_Profile.csv
<data-dir>/Cleaned_Combined_Applications.csv
<data-dir>/Cleaned_Combined_Engagement.csv
```

To use your real data:

1. Create a folder (e.g. `data/` next to `hybrid_job_recommender.py`).
2. Put your 4 CSVs in it, renamed exactly as above if they aren't already
   (case-sensitive on Linux/macOS).
3. Point `--data-dir` at that folder when you run:

```bash
python hybrid_job_recommender.py --run --data-dir ./data --output-dir ./outputs --top-k 20 --evaluate
```

If a file is missing or a required column (e.g. `Candidate_ID`, `Job_ID`)
isn't found, `DataLoader._require` raises a clear error naming the file
and the columns it did find — so you'll see immediately if a column got
renamed somewhere upstream, rather than a cryptic KeyError deep in the
pipeline.

If your filenames genuinely can't match those four, the simplest fix is
to change the four `@property` paths in `RecommenderConfig` (in
`hybrid_job_recommender.py`) rather than renaming your files every time.

## Quick start (no real data needed)

Generate small synthetic CSVs matching the real schema, then run the full
pipeline end to end:

```bash
python hybrid_job_recommender.py --generate-synthetic-data --data-dir ./data
python hybrid_job_recommender.py --run --data-dir ./data --output-dir ./outputs --evaluate
```

## Running on real data

Drop these four files into `--data-dir`:
- `Complete_Candidate_Profile.csv`
- `Complete_Job_Profile.csv`
- `Cleaned_Combined_Applications.csv`
- `Cleaned_Combined_Engagement.csv`

Then:

```bash
python hybrid_job_recommender.py --run --data-dir ./data --output-dir ./outputs --top-k 20 --evaluate
```

This writes `outputs/recommendations.csv` with columns:

```
Candidate_ID, Job_ID, Job_Title, Institution,
Content_Score, Collaborative_Score, Behavior_Score, Final_Score, Recommendation_Rank
```

## Single-candidate lookup

```bash
python hybrid_job_recommender.py --run --data-dir ./data --candidate-id C000123 --top-k 20
```

This uses the same fitted models but skips the CSV export, printing a small
table for just that candidate — the pattern you'd wrap in an API endpoint.

## Class map

| Class                     | Responsibility |
|---------------------------|----------------|
| `RecommenderConfig` / `HybridWeights` / `MFConfig` / `ContentConfig` / `BehaviorConfig` / `InteractionWeights` | All tunables, in one place |
| `DataLoader`               | Chunked, dtype-optimized CSV loading |
| `Preprocessor`             | ID <-> integer index maps, unified interaction event table, sparse interaction matrix |
| `ContentBasedModel`        | Shared TF-IDF/one-hot feature space for candidates & jobs, batched cosine similarity |
| `MatrixFactorizationNet`, `InteractionDataset`, `CollaborativeModel` | PyTorch implicit-feedback matrix factorization |
| `BehaviorModel`            | Recency-weighted per-candidate preference profiles, matched against job attributes |
| `HybridRanker`             | Weighted combination + vectorized top-K extraction |
| `Evaluator`                | Precision@K, Recall@K, MAP@K, NDCG@K, Hit Rate@K |
| `RecommendationEngine`     | Orchestrates the whole pipeline; batch + single-candidate inference |
| `SyntheticDataGenerator`   | Schema-correct fake data for smoke-testing |

## Why these design choices

**Why PyTorch matrix factorization instead of `implicit`/ALS.**
Embeddings + biases trained with a weighted `BCEWithLogitsLoss` over
observed interactions (weighted by implicit-feedback strength: View=1 ...
Hired=10) plus randomly sampled negatives. Functionally similar to ALS
for pure user-item factorization, but differentiable — you can later feed
in side features (e.g. concatenate a candidate/job content embedding into
the same forward pass) without switching libraries or approaches.

**Why batched scoring, not one full `n_candidates x n_jobs` matrix.**
At the stated scale (~322K candidates x ~6.9K jobs) a single dense score
matrix is ~2.2 billion floats (~9 GB in float32) — and the pipeline needs
three of them (content, collaborative, behavior) plus the combined final
score. `RecommendationEngine.generate_all_recommendations` processes
candidates in configurable batches (`candidate_batch_size`, default
5,000), so peak memory is `batch_size x n_jobs` per score type
(~140 MB at defaults) regardless of total candidate count, and each
batch's intermediate arrays are freed before the next batch starts.

**Why a shared feature space for content-based filtering.**
`ContentBasedModel` fits each `OneHotEncoder`/`TfidfVectorizer` on the
*union* of the candidate-side and job-side columns (e.g. candidate
`Field_Of_Study` and job `Required_Field_Of_Study` share one encoder).
Fitting them separately would put candidate and job vectors in different
coordinate systems, making cosine similarity between them meaningless.

**Why behavior modeling is separate from collaborative filtering,
even though both use the same interaction data.**
Collaborative filtering finds *cross-candidate* patterns ("people who
interacted like you also liked this job") and needs a reasonable amount
of population-level data to generalize. Behavior modeling captures
*within-candidate* patterns directly from a candidate's own history
(recency-weighted preference over job category, institution, location,
language, required education), which still produces a meaningful signal
even for candidates whose collaborative embedding hasn't converged yet.

**Why interaction weights are deduplicated to "max per pair" for the
matrix factorization model but kept as full event history for behavior
modeling.** The factorization model needs exactly one confidence value
per (candidate, job) cell. The behavior model benefits from the full
temporal sequence (an old "Hired" and a recent "View" tell a different
story than a fresh "Hired"), so `Preprocessor.build_interaction_events`
keeps every event, and only `build_interaction_matrix` collapses to one
value per pair.

**Why the CLI has both a full-population run and a single-candidate path.**
`generate_all_recommendations` is the batch/offline job (e.g. nightly
cron regenerating everyone's feed). `recommend_for_candidate` reuses the
same fitted models for on-demand scoring — the shape you'd put behind a
`/recommendations/{candidate_id}` endpoint without retraining anything.

## Evaluation

`RecommendationEngine.evaluate()` builds ground truth from strong
interaction signals (Shortlisted/Interviewed/Hired) already in the
interaction data and computes Precision@K, Recall@K, MAP@K, NDCG@K, and
Hit Rate@K via the `Evaluator` class.

**Caveat / recommended upgrade:** the current `evaluate()` reuses events
that were also used to train the collaborative and behavior models, so
its numbers are an optimistic sanity check, not a true generalization
estimate. For a real evaluation, time-split the interaction data (train
on events before date `T`, hold out events after `T` as ground truth) and
retrain on the training split only — the `Evaluator` class itself doesn't
need to change, only what you feed it as `ground_truth`.

## Scaling notes for the real dataset sizes

- **Applications / Engagement (~4.8M rows each):** loaded via
  `pd.read_csv(..., chunksize=...)` with explicit dtypes (`category`,
  `int8`) rather than inferred `object` dtypes, which materially reduces
  memory versus the naive load.
- **IDs:** mapped to dense integer indices once (`Preprocessor`) so every
  downstream structure (sparse matrices, PyTorch embeddings) works on
  small integers instead of repeatedly hashing/joining on strings.
- **Interaction matrix:** stored as `scipy.sparse.csr_matrix` — at
  322K x 6.9K with a few million nonzeros this is megabytes, not
  gigabytes.
- **Negative sampling:** drawn on-the-fly per training example rather
  than pre-materialized, so `negative_sampling_ratio` doesn't multiply
  dataset memory.
- **GPU:** `MFConfig.device="auto"` will use CUDA automatically if
  available for training and batch scoring; falls back to CPU otherwise.

## Suggested future improvements

1. **Time-split evaluation** as described above, for a trustworthy
   generalization estimate rather than a training-reuse sanity check.
2. **Cold-start handling:** candidates/jobs with zero interactions get
   `Collaborative_Score = sigmoid(bias terms only)` and
   `Behavior_Score = 0`; consider a configurable higher content weight
   for such candidates, or a popularity-based fallback list.
3. **Learned hybrid weights:** replace the fixed 0.40/0.35/0.25 blend
   with a small learned re-ranker (e.g. logistic regression or gradient
   boosting over `[content, collaborative, behavior]` plus a few raw
   features) trained on the same held-out labels used for evaluation.
4. **Side-feature-enriched matrix factorization:** concatenate the
   content feature vector (or a PCA/embedding of it) into the PyTorch
   model's forward pass as an additional term — turns pure collaborative
   filtering into a lightweight hybrid neural model in one place.
5. **Approximate nearest-neighbor scoring** (e.g. FAISS) if the job
   catalog grows well beyond ~7K, to avoid full batched matmuls per
   candidate batch.
6. **Diversity / business-rule re-ranking** after `HybridRanker` (e.g.
   cap jobs per institution in a single feed, boost recently-posted
   jobs) — a natural place to add a `PostProcessor` class without
   touching the scoring models.
7. **Model persistence in a serving path:** `CollaborativeModel.save`/
   `load` are provided; extend `RecommendationEngine` with a
   `load_pretrained()` that skips `prepare()`'s training step for fast
   API startup.
