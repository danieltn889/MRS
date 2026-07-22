# HRS ML Services

Python + FastAPI services that score every candidate–job pair and power search/feed/matching.
Part of the [HRS platform](../../README.md).

## Tech stack

- **FastAPI** + **Uvicorn**
- **scikit-learn**, **NLTK**, **spaCy** — NLP (search, text extraction)
- **sentence-transformers** + **PyTorch** — semantic embeddings and the matrix-factorization
  collaborative model
- **psycopg2** — reads directly from the same PostgreSQL database as the backend

## Folder structure

```text
ml/
  gateway.py                 Single entry point (port 8085) - proxies to the 3 services below
  ml_search.py                5-level NLP job search            (port 8001, /search)
  feed_recommender.py         Job feed scoring                  (port 8002, /feed)
  hybrid_job_recommender.py   Hybrid recommender + AI Matcher   (port 8003, /hybrid, /matcher)
  requirements.txt
  venv/                       created locally, not committed
  search_logs/, logs/         per-service debug logs, cleared on every start
```

## Installation & running

Requires Python 3.11+ (verified on 3.14) and the backend's `.env` already set up — these
services read DB credentials from `../backend/.env` and expect the backend API reachable at
`http://localhost:3001/api/v1`.

```bash
cd source-code/ml
python -m venv venv
venv\Scripts\activate            # Windows
# source venv/bin/activate       # Linux/macOS

pip install -r requirements.txt
python -m spacy download en_core_web_md   # separate download - pip install alone won't fetch it

python gateway.py                # starts all 3 services and proxies them on :8085
```

Docs once running: http://localhost:8085/docs

### Prerequisites

- PostgreSQL running and reachable per `source-code/backend/.env` (`DB_HOST`, `DB_PORT`,
  `DB_NAME`, `DB_USER`, `DB_PASSWORD`)
- Backend API running on `http://localhost:3001` (ML services fetch candidates/jobs from it)

### Ports

| Service | Port | Gateway prefix |
|---|---|---|
| Job Feed Recommender | 8002 | `/feed` |
| ML Job Search | 8001 | `/search` |
| Hybrid Job Recommender + AI Job Matcher (merged) | 8003 | `/hybrid`, `/matcher` |
| Gateway | 8085 | all of the above |

The gateway frees each port on startup (killing whatever's already bound to it) and opens
immediately even if a service is still warming up — slow services announce themselves in the
console when ready, up to a 5-minute window.

## Logs

Each service's stdout/stderr goes to `<name>_service.log` next to `gateway.py`, truncated fresh
on every start so old runs don't obscure the current one. `ml_search.py` additionally keeps
detailed per-category logs under `search_logs/` (training, NLP processing, skills extraction,
etc.), and `hybrid_job_recommender.py` under `logs/` — both also cleared on startup.

## More detail

See [`report/USER_GUIDE.md`](../../report/USER_GUIDE.md) for the hybrid matching engine's
scoring breakdown (Skills/Qualifications/Experience/Preferences weights, the 5-signal hybrid
recommender, how the two are blended).
