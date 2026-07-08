#!/usr/bin/env python3
"""
SimuHire Rwanda — Personalized Job Feed Recommender  (Dynamic Semantic v4.1)
=============================================================================
No hardcoded word lists. Vocabulary built at runtime from real job data.

Text processing (two modes):
  process()          → lemma + stem  (for TF-IDF, Jaccard — exact normalized overlap)
  process_semantic() → lemma only    (for spaCy vectors — stems break word embeddings)

Per-token pipeline:
  1. Lowercase + strip punctuation
  2. Fuzzy-correct typos against CANONICAL vocab (built from JOB data only,
     so candidate "Recat" → "react" when jobs have "React")
  3. Lemmatize   (engineers → engineer, databases → database)
  4. Stem        (only in process() path; develop/developing → develop)

Scoring weights:
  Profile Match      35%   Skills + experience + location + title
  Search History     20%   Past queries matched to job text
  View History       10%   Previously viewed jobs matched to current job
  Save History       10%   Jobs similar to what you saved
  Save Bonus         10%   You saved THIS exact job before
  Recency             5%   Exponential decay
  Popularity         10%   Normalized application count
  Applied penalty   -10%
  Ignored penalty  -100%
"""

import subprocess, sys, re, difflib
from collections import defaultdict

for pkg in ["fastapi", "uvicorn[standard]", "scikit-learn", "numpy", "nltk"]:
    try:
        __import__(pkg.split("[")[0].replace("-", "_"))
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

# ── NLTK SETUP ───────────────────────────────────────────────
import nltk
for resource in ["punkt", "punkt_tab", "wordnet", "stopwords",
                 "averaged_perceptron_tagger", "omw-1.4"]:
    try:
        nltk.data.find(f"tokenizers/{resource}" if "punkt" in resource
                       else f"corpora/{resource}" if resource in ("wordnet", "stopwords", "omw-1.4")
                       else f"taggers/{resource}")
    except LookupError:
        nltk.download(resource, quiet=True)

from nltk.stem import WordNetLemmatizer, PorterStemmer
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords as nltk_stopwords

# ── spaCy SETUP ──────────────────────────────────────────────
import spacy
print("Loading spaCy en_core_web_md …", flush=True)
nlp = spacy.load("en_core_web_md", disable=["ner", "parser"])
print("spaCy ready.", flush=True)

# ── OTHER IMPORTS ────────────────────────────────────────────
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional
import numpy as np
import uvicorn
import math
from datetime import datetime, timezone
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

# ── NLP TOOLS ────────────────────────────────────────────────
_lem   = WordNetLemmatizer()
_stem  = PorterStemmer()
_stops = set(nltk_stopwords.words("english"))

# ── VECTOR CACHES ─────────────────────────────────────────────
_spacy_cache: Dict[str, any] = {}
_proc_cache:  Dict[str, str] = {}   # raw text → processed (stemmed)
_sem_cache:   Dict[str, str] = {}   # raw text → semantic (lemmatized, no stem)

def _spacy_doc(text: str):
    if text not in _spacy_cache:
        _spacy_cache[text] = nlp(text)
    return _spacy_cache[text]

# ── DYNAMIC TEXT PROCESSOR ───────────────────────────────────

class DynamicTextProcessor:
    """
    Two vocab modes:
      canonical_vocab   — built from JOB skills/titles only
                          used for fuzzy typo correction of candidate input
      reference_vocab   — built from all data (for any other vocab lookups)

    Two processing modes:
      process()          — lemma + stem   → for TF-IDF / Jaccard
      process_semantic() — lemma only     → for spaCy (stems like "engin" have no vectors)
    """

    def __init__(self):
        self._canonical_vocab: set = set()  # job-data-only, for typo correction

    # ── vocab building ───────────────────────────────────────

    def build_canonical_vocab(self, *job_sources: List[str]) -> None:
        """
        Build correction vocab from JOB data ONLY.
        This ensures candidate typos get corrected toward canonical job terms.
        e.g. candidate 'Recat' → 'react' because jobs have 'React'
        """
        self._canonical_vocab = set()
        for source in job_sources:
            for text in source:
                for tok in self._tokenize_raw(text):
                    self._canonical_vocab.add(tok)

    # ── internal helpers ─────────────────────────────────────

    def _tokenize_raw(self, text: str) -> List[str]:
        cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        return [t for t in cleaned.split() if t]

    def _fuzzy_correct(self, token: str) -> str:
        """
        Correct typos in candidate input against the canonical job vocab.
        'Recat' → 'react'  (job has 'React' → normalized to 'react')
        'Pyhton' → 'python'
        cutoff=0.82 prevents over-aggressive corrections on short tokens.
        """
        if token in self._canonical_vocab or len(token) <= 2:
            return token
        if not self._canonical_vocab:
            return token
        matches = difflib.get_close_matches(token, self._canonical_vocab, n=1, cutoff=0.79)
        return matches[0] if matches else token

    def _lemmatize(self, token: str) -> str:
        noun = _lem.lemmatize(token, pos="n")
        if noun != token:
            return noun
        return _lem.lemmatize(token, pos="v")

    def _clean_tokens(self, text: str) -> List[str]:
        """Tokenize, fuzzy-correct, remove common stop words."""
        tokens = self._tokenize_raw(text)
        result = []
        for tok in tokens:
            if tok in _stops and len(tok) <= 3:
                continue
            result.append(self._fuzzy_correct(tok))
        return result

    # ── public: two processing modes ─────────────────────────

    def process(self, text: str) -> str:
        """
        Lemmatize + stem.
        Best for TF-IDF and Jaccard (normalized exact matching).
        'engineering' == 'engineer' == 'engin' after this.
        """
        if text in _proc_cache:
            return _proc_cache[text]
        tokens   = self._clean_tokens(text)
        stemmed  = [_stem.stem(self._lemmatize(t)) for t in tokens if t]
        result   = " ".join(stemmed)
        _proc_cache[text] = result
        return result

    def process_semantic(self, text: str) -> str:
        """
        Lemmatize ONLY (no stemming).
        Preserves real English words so spaCy can find word embeddings.
        'engineer' has a vector; 'engin' (stem) has none.
        """
        if text in _sem_cache:
            return _sem_cache[text]
        tokens     = self._clean_tokens(text)
        lemmatized = [self._lemmatize(t) for t in tokens if t]
        result     = " ".join(lemmatized)
        _sem_cache[text] = result
        return result

    def process_list(self, items: List[str]) -> str:
        """Stemmed text blob from a list of skills — for TF-IDF."""
        return " ".join(self.process(s) for s in items if s.strip())

    def process_list_semantic(self, items: List[str]) -> str:
        """Lemmatized text blob from a list of skills — for spaCy."""
        return " ".join(self.process_semantic(s) for s in items if s.strip())

    def token_set(self, items: List[str]) -> set:
        """Stemmed token set from a list — for Jaccard similarity."""
        tokens: set = set()
        for item in items:
            tokens.update(self.process(item).split())
        return tokens


_processor = DynamicTextProcessor()

# ── APP ──────────────────────────────────────────────────────
app = FastAPI(title="Job Feed Recommender — Dynamic Semantic", version="4.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── DATA MODELS ──────────────────────────────────────────────

class CandidateProfile(BaseModel):
    skills: List[str] = []
    years_experience: Optional[float] = 0
    education_level: Optional[str] = ""
    preferred_job_titles: List[str] = []
    preferred_locations: List[str] = []

class ViewedJob(BaseModel):
    job_id: str
    title: str
    skills: List[str] = []
    category: Optional[str] = ""

# SavedJob carries the same fields — saved = stronger signal than viewed
SavedJob = ViewedJob

class CandidateActivity(BaseModel):
    search_queries: List[str] = []
    viewed_jobs: List[ViewedJob] = []
    saved_jobs: List[SavedJob] = []      # full job details of saved jobs
    saved_job_ids: List[str] = []        # IDs only — for save_bonus
    applied_job_ids: List[str] = []
    ignored_job_ids: List[str] = []

class JobListing(BaseModel):
    id: str
    title: str
    skills_required: List[str] = []
    experience_level: Optional[str] = ""
    education_required: Optional[str] = ""
    location: Optional[str] = ""
    job_type: Optional[str] = ""
    category: Optional[str] = ""
    posted_at: Optional[str] = None
    application_count: Optional[int] = 0

class FeedRequest(BaseModel):
    candidate: CandidateProfile
    activity: CandidateActivity
    jobs: List[JobListing]
    top_n: Optional[int] = 20

class ScoredJob(BaseModel):
    job_id: str
    total_score: float
    breakdown: Dict[str, float]

class FeedResponse(BaseModel):
    scored_jobs: List[ScoredJob]
    total_jobs: int
    cold_start: bool
    computed_at: str
    engine: str

# ── EXPERIENCE RANGES ────────────────────────────────────────

EXPERIENCE_RANGES = {
    "entry": (0, 2), "junior": (1, 3), "mid": (3, 6),
    "senior": (5, 10), "lead": (8, 20), "manager": (5, 20),
}

# ── SIMILARITY LAYER A — JACCARD (stemmed token sets) ────────

def _jaccard(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)

# ── SIMILARITY LAYER B — TF-IDF (stemmed text) ───────────────

def _tfidf_sim(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    try:
        v = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
        m = v.fit_transform([a, b])
        return float(sk_cosine(m[0:1], m[1:2])[0][0])
    except Exception:
        return 0.0

# ── SIMILARITY LAYER C — spaCy SEMANTIC (lemmatized, no stem) ─

def _semantic_sim(a: str, b: str) -> float:
    """
    Uses lemmatized text (real English words) so spaCy can find GloVe vectors.
    'engineer' ≈ 'developer', 'analyst' ≈ 'scientist', 'software' ≈ 'developer'.
    Stems like 'engin' have NO vectors and score 0 — that's why we use lemma here.
    """
    if not a.strip() or not b.strip():
        return 0.0
    try:
        da = _spacy_doc(a)
        db = _spacy_doc(b)
        if not da.has_vector or not db.has_vector:
            return 0.0
        return max(0.0, float(da.similarity(db)))
    except Exception:
        return 0.0

# ── PER-SKILL BEST MATCH ─────────────────────────────────────

def _smart_skill_match(
    candidate_skills: List[str],
    job_skills: List[str],
) -> float:
    """
    For each candidate skill, find the best-matching job skill.
    Uses both TF-IDF (stemmed) and spaCy semantic (lemmatized).
    Average the best score per candidate skill.
    """
    if not candidate_skills or not job_skills:
        return 0.0

    # TF-IDF/Jaccard path: stemmed
    c_proc = [_processor.process(s) for s in candidate_skills if s.strip()]
    j_proc = [_processor.process(s) for s in job_skills if s.strip()]

    # Semantic path: lemmatized (real words for vectors)
    c_sem  = [_processor.process_semantic(s) for s in candidate_skills if s.strip()]
    j_sem  = [_processor.process_semantic(s) for s in job_skills if s.strip()]

    scores = []
    for cp, cs in zip(c_proc, c_sem):
        if not cp.strip() and not cs.strip():
            continue
        best = 0.0
        for jp, js in zip(j_proc, j_sem):
            # TF-IDF on stemmed
            t = _tfidf_sim(cp, jp) if cp and jp else 0.0
            # spaCy on lemmatized (where real word vectors exist)
            s = _semantic_sim(cs, js) if cs and js else 0.0
            best = max(best, t * 0.45 + s * 0.55)
        scores.append(best)

    return float(np.mean(scores)) if scores else 0.0

# ── BLENDED FULL-TEXT SIMILARITY ─────────────────────────────

def _hybrid_text_sim(raw_a: str, raw_b: str) -> float:
    """
    For full-text comparisons (query vs job title, titles vs titles).
    TF-IDF on stemmed + spaCy on lemmatized.
    """
    # Stemmed for TF-IDF
    pa_s = _processor.process(raw_a)
    pb_s = _processor.process(raw_b)
    # Lemmatized for spaCy
    pa_l = _processor.process_semantic(raw_a)
    pb_l = _processor.process_semantic(raw_b)

    t = _tfidf_sim(pa_s, pb_s)
    s = _semantic_sim(pa_l, pb_l)
    return t * 0.35 + s * 0.65

# ── RECENCY ──────────────────────────────────────────────────

def _days_since(posted_at: Optional[str]) -> float:
    if not posted_at:
        return 30.0
    try:
        dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400)
    except Exception:
        return 30.0

# ── SCORING COMPONENTS ───────────────────────────────────────

def profile_match(candidate: CandidateProfile, job: JobListing) -> float:
    """40% of total."""
    # Skills — Jaccard (stemmed) + smart match (TF-IDF + semantic) + TF-IDF
    c_set = _processor.token_set(candidate.skills)
    j_set = _processor.token_set(job.skills_required)
    jac   = _jaccard(c_set, j_set)
    smart = _smart_skill_match(candidate.skills, job.skills_required)
    tfidf = _tfidf_sim(
        _processor.process_list(candidate.skills),
        _processor.process_list(job.skills_required)
    )
    skills = (jac * 0.25 + smart * 0.55 + tfidf * 0.20) * 0.50

    # Experience
    exp_range = EXPERIENCE_RANGES.get((job.experience_level or "").lower())
    years = candidate.years_experience or 0
    if exp_range:
        lo, hi = exp_range
        if lo <= years <= hi:       exp = 1.0
        elif years < lo:            exp = max(0.0, 1.0 - (lo - years) * 0.15)
        else:                       exp = max(0.3,  1.0 - (years - hi) * 0.1)
    else:
        exp = 0.5
    exp_score = exp * 0.25

    # Location
    job_loc = (job.location or "").lower()
    pref    = [l.lower() for l in candidate.preferred_locations]
    if not job_loc or not pref:                                          loc = 0.5
    elif any(p in job_loc or job_loc in p for p in pref):               loc = 1.0
    elif "remote" in job_loc or any("remote" in p for p in pref):       loc = 0.8
    else:                                                                loc = 0.1
    loc_score = loc * 0.15

    # Title — hybrid semantic
    title_score = _hybrid_text_sim(
        " ".join(candidate.preferred_job_titles),
        job.title
    ) * 0.10

    return skills + exp_score + loc_score + title_score


def search_history_match(activity: CandidateActivity, job: JobListing) -> float:
    """20% of total."""
    if not activity.search_queries:
        return 0.0
    combined = " ".join(activity.search_queries)
    job_text = f"{job.title} {' '.join(job.skills_required)} {job.category or ''}"
    return _hybrid_text_sim(combined, job_text)


def view_history_match(activity: CandidateActivity, job: JobListing) -> float:
    """10% of total."""
    if not activity.viewed_jobs:
        return 0.0
    scores = []
    for v in activity.viewed_jobs:
        cat  = 1.0 if (v.category or "").lower() == (job.category or "").lower() and v.category else 0.0
        skil = _smart_skill_match(v.skills, job.skills_required)
        titl = _hybrid_text_sim(v.title, job.title)
        scores.append(cat * 0.40 + skil * 0.40 + titl * 0.20)
    return float(np.mean(scores)) if scores else 0.0


def save_history_match(activity: CandidateActivity, job: JobListing) -> float:
    """
    10% of total.
    A save is a stronger intent signal than a view — you actively chose to keep it.
    Semantically compare each saved job to the current job being scored.
    If you saved 10 Frontend React jobs, new Frontend React jobs rank much higher.
    """
    if not activity.saved_jobs:
        return 0.0
    scores = []
    for s in activity.saved_jobs:
        cat  = 1.0 if (s.category or "").lower() == (job.category or "").lower() and s.category else 0.0
        skil = _smart_skill_match(s.skills, job.skills_required)
        titl = _hybrid_text_sim(s.title, job.title)
        # Saves get more weight on skill overlap than views do
        scores.append(cat * 0.35 + skil * 0.50 + titl * 0.15)
    return float(np.mean(scores)) if scores else 0.0


def recency_score(job: JobListing) -> float:
    """5%. Exponential decay: 1.0 today → 0.37 at 30 days → 0.05 at 90 days."""
    return max(0.0, math.exp(-_days_since(job.posted_at) / 30))


def popularity_score(job: JobListing, all_jobs: List[JobListing]) -> float:
    """10%. Normalized within the same category."""
    cat_jobs = [j.application_count or 0 for j in all_jobs
                if (j.category or "") == (job.category or "") and j.category]
    pool = cat_jobs if len(cat_jobs) >= 3 else [j.application_count or 0 for j in all_jobs]
    if not pool:
        return 0.5
    return (job.application_count or 0) / (max(pool) or 1)

# ── COMBINED SCORE ───────────────────────────────────────────

def score_job(job, candidate, activity, all_jobs) -> ScoredJob:
    if job.id in activity.ignored_job_ids:
        return ScoredJob(job_id=job.id, total_score=0.0, breakdown={"ignored": -100.0})

    pm    = profile_match(candidate, job)
    sh    = search_history_match(activity, job)
    vh    = view_history_match(activity, job)
    saveh = save_history_match(activity, job)
    saveb = 1.0 if job.id in activity.saved_job_ids else 0.0  # saved THIS exact job
    rec   = recency_score(job)
    pop   = popularity_score(job, all_jobs)
    pen   = -0.10 if job.id in activity.applied_job_ids else 0.0

    # Weights: pm(35) + sh(20) + vh(10) + saveh(10) + saveb(10) + rec(5) + pop(10) = 100%
    raw   = pm*0.35 + sh*0.20 + vh*0.10 + saveh*0.10 + saveb*0.10 + rec*0.05 + pop*0.10 + pen
    total = round(max(0.0, min(1.0, raw)) * 100, 2)

    return ScoredJob(
        job_id=job.id,
        total_score=total,
        breakdown={
            "profile_match":   round(pm    * 35,  2),
            "search_history":  round(sh    * 20,  2),
            "view_history":    round(vh    * 10,  2),
            "save_history":    round(saveh * 10,  2),
            "save_bonus":      round(saveb * 10,  2),
            "recency":         round(rec   * 5,   2),
            "popularity":      round(pop   * 10,  2),
            "applied_penalty": round(pen   * 100, 2),
        },
    )

# ── ENDPOINTS ────────────────────────────────────────────────

@app.post("/score", response_model=FeedResponse)
async def score_feed(req: FeedRequest):
    # Canonical vocab from JOB data only — candidate typos get corrected toward these terms
    canonical_job_sources = (
        [j.skills_required for j in req.jobs] +
        [[j.title] for j in req.jobs] +
        [[j.category or ""] for j in req.jobs if j.category]
    )
    _processor.build_canonical_vocab(*canonical_job_sources)

    # Flush per-request caches so stale processed strings don't carry over
    _proc_cache.clear()
    _sem_cache.clear()

    cold = not (req.activity.search_queries or req.activity.viewed_jobs
                or req.activity.applied_job_ids or req.activity.saved_job_ids)

    scored = [score_job(j, req.candidate, req.activity, req.jobs) for j in req.jobs]
    scored = [s for s in scored if s.total_score > 0]
    scored.sort(key=lambda x: x.total_score, reverse=True)
    top = scored[: req.top_n] if req.top_n else scored

    return FeedResponse(
        scored_jobs=top,
        total_jobs=len(scored),
        cold_start=cold,
        computed_at=datetime.now(timezone.utc).isoformat(),
        engine="NLTK-lemma+stem+fuzzy(canonical) | TF-IDF(stemmed) | spaCy-semantic(lemmatized)",
    )


@app.get("/health")
async def health():
    # Health demo: canonical vocab from CORRECT words only
    # Simulates a job having React/Python/JavaScript — candidate typos get corrected toward these
    correct_terms = [["React", "Python", "JavaScript", "engineer", "developer",
                      "data scientist", "analyst", "software"]]
    _processor.build_canonical_vocab(*correct_terms)

    typo_tests = {}
    for raw, expected in [
        ("Recat",      "react"),
        ("Pyhton",     "python"),
        ("JavaScrpit", "javascript"),
        ("engeneer",   "engineer"),
        ("developper", "developer"),
    ]:
        corrected = _processor._fuzzy_correct(raw.lower())
        typo_tests[raw] = {"corrected_to": corrected, "expected": expected, "ok": corrected == expected}

    # Semantic tests use process_semantic() (lemmatized, real words → good vectors)
    sem_pairs = [
        ("engineer",     "developer"),
        ("data analyst", "data scientist"),
        ("software",     "developer"),
        ("React",        "Vue"),
        ("python",       "programming"),
    ]
    sem_tests = {}
    for a, b in sem_pairs:
        pa = _processor.process_semantic(a)
        pb = _processor.process_semantic(b)
        score = _semantic_sim(pa, pb)
        sem_tests[f"{a} vs {b}"] = {"score": round(score, 3), "pa": pa, "pb": pb}

    # Stem/lemma demo
    stem_tests = {}
    for w in ["engineers", "developing", "databases", "running", "analysis"]:
        stem_tests[w] = {
            "process (lemma+stem)":     _processor.process(w),
            "process_semantic (lemma)": _processor.process_semantic(w),
        }

    return {
        "status": "up",
        "service": "Job Feed Recommender",
        "version": "4.1.0",
        "engine": "NLTK lemma+stem+fuzzy(canonical) | TF-IDF(stemmed) | spaCy-semantic(lemmatized)",
        "no_hardcoded_words": True,
        "vocab_is_dynamic": True,
        "typo_correction_demo": typo_tests,
        "semantic_tests": sem_tests,
        "normalization_demo": stem_tests,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
