#!/usr/bin/env python3
"""
Hybrid recommender system- Recommendation Service  (Matcher + Hybrid Recommender, merged)  Test
====================================================================================
One FastAPI process/port serving BOTH ML scorers that used to run as two
separate services (ai_job_matcher_og.py on 8000 + hybrid_job_recommender.py
on 8003)- merged so each signal is computed exactly once, the same-machine
HTTP round trip between them is a direct function call instead, and the two
independent loads of the shared sentence-transformer model become one.

    MATCHER   (mounted at /matcher, ported from ai_job_matcher_og.py):
      deterministic 4-factor scorer- Skills 40% / Qualifications 25% /
      Experience 20% / Preferences 15%- candidate/job data fetched from the
      Node backend's REST API via BackendClient (unchanged from before).

    HYBRID    (mounted at the app root, this file's original logic):
      5-signal statistical/ML scorer- Content 35% / Behavior 30% /
      Collaborative 20% / Freshness 10% / Popularity 5%- reading Postgres
      directly. Same three-signal design as before:
        1. ContentBasedModel   - candidate/job similarity (shared TF-IDF space)
        2. CollaborativeModel  - implicit-feedback matrix factorization (PyTorch)
        3. BehaviorModel       - recency-weighted preference over job attributes

    combined_score_candidate() blends the two (matcher 70% / hybrid 30% by
    default) for /score/combined- now an in-process call to the matcher's
    score_candidate_against_jobs() instead of requests.post() over loopback.

Proxied through gateway.py at /matcher and /hybrid- both prefixes now
route to this SAME process/port; see gateway.py's SERVICES registry.

Endpoints
---------
    POST /score               {candidate_id, top_n?}  -> hybrid-only ranked jobs
    POST /score/combined      {candidate_id, top_n?}  -> matcher+hybrid blended feed
    POST /matcher/match       {candidate_id}          -> matcher-only, all jobs
    POST /refresh              retrain hybrid models from current DB state
    GET  /health               hybrid model status
    GET  /matcher/health       matcher status

Why the Matcher keeps calling the backend's REST API instead of also
switching to direct Postgres access (unlike Hybrid): its BackendClient/
per-request data shape is unrelated to Hybrid's DataFrame-based fetch, and
unifying the two data-access layers is a separate, much larger change not
implied by "compute each signal once"- the actual duplication eliminated
here was in scoring/model-loading/the network hop, not in how each
subsystem sources its rows.
"""

import os
import re
import sys
import copy
import time
import math
import pickle
import threading
import argparse
import json
import queue
from dataclasses import dataclass, field
from datetime import datetime, date
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# NOTE: deliberately NOT forcing TRANSFORMERS_OFFLINE here. Tried it first
# (same as ai_job_matcher_og.py) expecting it to avoid a slow/hung HuggingFace
# Hub version-check on startup- instead it made model loading fail
# deterministically ("does not appear to have a file named pytorch_model.bin
# or model.safetensors") against this exact cache + transformers version,
# confirmed by isolated testing: offline=fails every time, online=loads in
# under a second since the model IS cached. SemanticEncoder's own retry loop
# (below) is the actual defense against a slow/flaky connection.

import subprocess
for pkg in ["fastapi", "uvicorn", "numpy", "pandas", "scipy", "scikit-learn", "torch", "psycopg2-binary", "python-dotenv", "requests", "nltk"]:
    mod = {"scikit-learn": "sklearn", "psycopg2-binary": "psycopg2", "python-dotenv": "dotenv"}.get(pkg, pkg.replace("-", "_"))
    try:
        __import__(mod)
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "--quiet"])

import logging
import requests
import numpy as np
import pandas as pd
import scipy.sparse as sp
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MinMaxScaler
from sklearn.preprocessing import normalize as sk_normalize
from sklearn.metrics.pairwise import cosine_similarity

# NLTK (ported from ai_job_matcher_og.py, needed by LocalTextProcessor.lemmatize
# for the Matcher subsystem)- tokenizer/lemmatizer data downloaded once if
# missing, mirroring the self-install loop above.
import nltk
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)
try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('wordnet', quiet=True)

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader as TorchDataLoader

from fastapi import FastAPI, HTTPException, Header, Request, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# ==========================================================================
# 1. CONFIGURATION
# ==========================================================================

# Reuse the backend's DB credentials rather than duplicating a secret file.
load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")


@dataclass
class DBConfig:
    host: str = os.getenv("DB_HOST", "localhost")
    port: int = int(os.getenv("DB_PORT", "8090"))
    name: str = os.getenv("DB_NAME", "SVWR-CFE_DB")
    user: str = os.getenv("DB_USER", "postgres")
    password: str = os.getenv("DB_PASSWORD", "TN12")


@dataclass
class HybridWeights:
    """Content 35% + Behavior 30% + Collaborative 20% + Freshness 10% +
    Popularity 5% = 100%. Business-rule (salary fit, verified employer, etc.)
    is deliberately NOT a 6th weighted component here- it's a policy
    adjustment (does this job clear a minimum bar?), not a continuous
    similarity signal, so it's applied as a bonus/gate multiplier on top of
    the weighted sum instead of diluting the other five weights."""
    content: float = 0.35
    behavior: float = 0.30
    collaborative: float = 0.20
    freshness: float = 0.10
    popularity: float = 0.05

    def normalized(self, has_collab: bool, has_behavior: bool, exclude_content: bool = False,
                   has_freshness: bool = True) -> "HybridWeights":
        """Cold-start-safe renormalization: a fresh/dev DB may have zero
        interaction history, so collaborative/behavior signals may be
        untrained. Redistribute their weight onto whatever signals exist
        rather than silently scoring everyone 0 on a missing component.
        Popularity is always computable (a pure job attribute, no candidate
        history needed), so it's never zeroed out here. Freshness is
        normally always computable too, but has_freshness=False covers the
        rare edge case where literally every job in the batch has no usable
        created_at- freshness_scores() would otherwise fake a uniform
        "30 days old" for all of them rather than a real signal, so that
        case is excluded and redistributed like any other missing signal.

        exclude_content: used ONLY when this hybrid score is being blended
        with ai_job_matcher_og.py's score (see combined_score_candidate)-
        that matcher score IS a profile-vs-job fit, computed a different way
        (structured factors) from Content's TF-IDF/semantic cosine, but
        measuring the same underlying thing. Including both would silently
        double-count profile-fit and understate how much of the blended
        score is genuinely new signal (Behavior/Collaborative/Freshness/
        Popularity). Standalone /score calls never pass this- there's no
        matcher score to be redundant with there."""
        c = 0.0 if exclude_content else self.content
        b = self.behavior if has_behavior else 0.0
        k = self.collaborative if has_collab else 0.0
        f = self.freshness if has_freshness else 0.0
        p = self.popularity
        total = c + b + k + f + p
        if total <= 0:
            return HybridWeights(content=1.0, behavior=0.0, collaborative=0.0, freshness=0.0, popularity=0.0)
        return HybridWeights(content=c / total, behavior=b / total, collaborative=k / total,
                              freshness=f / total, popularity=p / total)


@dataclass
class MFConfig:
    embedding_dim: int = 32
    epochs: int = 8
    batch_size: int = 2048
    learning_rate: float = 5e-3
    weight_decay: float = 1e-6
    negative_sampling_ratio: int = 4
    device: str = "auto"
    random_state: int = 42
    val_fraction: float = 0.1
    early_stopping_patience: int = 3
    min_interactions_to_train: int = 20  # below this, collaborative signal is unreliable noise


@dataclass
class ContentConfig:
    text_max_features: int = 2000
    ngram_range: Tuple[int, int] = (1, 1)
    min_df: int = 1


@dataclass
class BehaviorConfig:
    recency_half_life_days: int = 60
    max_events_per_candidate: int = 300


@dataclass
class InteractionWeights:
    view: float = 1.0
    save: float = 3.0
    incomplete_application: float = 2.5  # opened the Apply form but didn't submit- stronger than a view, weaker than a save
    application_status: Dict[str, float] = field(default_factory=lambda: {
        "submitted": 5.0, "under_review": 5.0, "shortlisted": 7.0,
        "interview": 8.0, "assessment": 8.0, "reference_check": 8.5,
        "offer": 9.5, "hired": 10.0, "rejected": 2.0,
        "withdrawn": 2.0, "on_hold": 6.0,
    })

    @property
    def max_weight(self) -> float:
        return max([self.view, self.save, self.incomplete_application] + list(self.application_status.values()))


@dataclass
class RecommenderConfig:
    db: DBConfig = field(default_factory=DBConfig)
    hybrid_weights: HybridWeights = field(default_factory=HybridWeights)
    mf: MFConfig = field(default_factory=MFConfig)
    content: ContentConfig = field(default_factory=ContentConfig)
    behavior: BehaviorConfig = field(default_factory=BehaviorConfig)
    interaction_weights: InteractionWeights = field(default_factory=InteractionWeights)
    top_k_default: int = 20
    log_dir: Path = Path(__file__).parent / "logs"
    port: int = 8003
    realtime_batch_size: int = 100
    realtime_flush_seconds: float = 1.5
    realtime_collaborative_retrain_delay_seconds: float = 8.0
    realtime_notification_channel: str = "recommender_events"
    webhook_secret: str = os.getenv("RECOMMENDER_WEBHOOK_SECRET", "")


@dataclass
class RealtimeEvent:
    event_type: str
    entity_type: str
    operation: str
    entity_id: Optional[str] = None
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    source: str = "webhook"
    created_at: Optional[str] = None


def get_logger(name: str, log_dir: Path) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")

    console = logging.StreamHandler()
    console.setFormatter(fmt)
    logger.addHandler(console)

    log_dir.mkdir(parents=True, exist_ok=True)
    fh = RotatingFileHandler(log_dir / "hybrid_recommender.log", maxBytes=10_000_000, backupCount=3)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    logger.propagate = False
    return logger


CFG = RecommenderConfig()
log = get_logger("hybrid_recommender", CFG.log_dir)


# ==========================================================================
# 2. DATABASE ACCESS
# ==========================================================================

class Database:
    """Read-only access to the real schema. Every query below matches the
    actual column names in db/migrations- not the CSV headers from the
    offline prototype."""

    def __init__(self, cfg: DBConfig):
        self.cfg = cfg

    def _connect(self):
        return psycopg2.connect(
            host=self.cfg.host, port=self.cfg.port, dbname=self.cfg.name,
            user=self.cfg.user, password=self.cfg.password,
        )

    def _query_df(self, sql: str) -> pd.DataFrame:
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                rows = cur.fetchall()
        return pd.DataFrame([dict(r) for r in rows])

    def fetch_fingerprints(self) -> Dict[str, Tuple[int, Optional[str]]]:
        """Cheap (COUNT, MAX(timestamp)) aggregates- NOT the full rows- used
        by ModelStore to decide whether a persisted model is still valid
        without re-fetching/re-fitting anything. A single row inserted,
        updated, or deleted changes the count and/or the max timestamp, so
        this is a reliable enough change signal without hashing full table
        contents."""
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*), MAX(updated_at) FROM jobs WHERE deleted_at IS NULL")
                jobs_count, jobs_max = cur.fetchone()
                cur.execute("""
                    SELECT COUNT(*), MAX(GREATEST(u.updated_at, cp.updated_at)) FROM users u
                    JOIN candidate_profiles cp ON cp.user_id = u.id
                    WHERE u.user_type = 'candidate' AND u.deleted_at IS NULL
                """)
                cand_count, cand_max = cur.fetchone()
                cur.execute("""
                    SELECT
                        (SELECT COUNT(*) FROM applications) + (SELECT COUNT(*) FROM job_views)
                      + (SELECT COUNT(*) FROM saved_jobs) + (SELECT COUNT(*) FROM job_searches)
                      + (SELECT COUNT(*) FROM application_starts WHERE submitted = FALSE),
                        GREATEST(
                            (SELECT MAX(applied_at) FROM applications),
                            (SELECT MAX(viewed_at) FROM job_views),
                            (SELECT MAX(saved_at) FROM saved_jobs),
                            (SELECT MAX(searched_at) FROM job_searches),
                            (SELECT MAX(started_at) FROM application_starts WHERE submitted = FALSE)
                        )
                """)
                inter_count, inter_max = cur.fetchone()
        return {
            "jobs": (int(jobs_count), jobs_max.isoformat() if jobs_max else None),
            "candidates": (int(cand_count), cand_max.isoformat() if cand_max else None),
            "interactions": (int(inter_count), inter_max.isoformat() if inter_max else None),
        }

    def fetch_active_jobs(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT j.id, j.title, j.slug, j.department, j.job_type, j.work_arrangement,
                   j.locations, j.skills_required, j.skills_preferred,
                   j.experience_level, j.experience_min, j.experience_max,
                   j.education_required, j.qualifications, j.preferred_qualifications,
                   j.responsibilities, j.requirements, j.benefits, j.description,
                   j.language_requirements, j.salary_min, j.salary_max,
                   j.salary_currency, j.salary_period, j.screening_questions,
                   j.ai_match_required_score, j.published_at, j.expires_at,
                   j.created_at, j.view_count, j.application_count,
                   j.status, j.tags,
                   c.id AS company_id, c.name AS company_name, c.verification_badge, c.logo_url,
                   c.industry AS company_industry, c.size AS company_size, c.website AS company_website
            FROM jobs j
            JOIN companies c ON c.id = j.company_id
            WHERE j.status = 'active'
              AND (j.expires_at IS NULL OR j.expires_at > now())
              AND (j.published_at IS NULL OR j.published_at <= now())
              AND j.deleted_at IS NULL
        """)

    def fetch_job_by_id(self, job_id: str) -> Optional[dict]:
        df = self._query_df(f"""
            SELECT j.id, j.title, j.slug, j.department, j.job_type, j.work_arrangement,
                   j.locations, j.skills_required, j.skills_preferred,
                   j.experience_level, j.experience_min, j.experience_max,
                   j.education_required, j.qualifications, j.preferred_qualifications,
                   j.responsibilities, j.requirements, j.benefits, j.description,
                   j.language_requirements, j.salary_min, j.salary_max,
                   j.salary_currency, j.salary_period, j.screening_questions,
                   j.ai_match_required_score, j.published_at, j.expires_at,
                   j.created_at, j.view_count, j.application_count,
                   j.status, j.tags,
                   c.id AS company_id, c.name AS company_name, c.verification_badge, c.logo_url,
                   c.industry AS company_industry, c.size AS company_size, c.website AS company_website
            FROM jobs j
            JOIN companies c ON c.id = j.company_id
            WHERE j.id = '{job_id}'::uuid
        """)
        return df.iloc[0].to_dict() if not df.empty else None

    def fetch_candidates(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT u.id AS user_id, cp.city, cp.country, cp.headline,
                   cp.summary, cp.job_preferences, cp.languages, cp.expected_salary,
                   cp.date_of_birth, cp.is_rwandan, cp.province, cp.district,
                   cp.sector, cp.cell, cp.village
            FROM users u
            JOIN candidate_profiles cp ON cp.user_id = u.id
            WHERE u.user_type = 'candidate' AND u.deleted_at IS NULL
        """)

    def fetch_candidate_by_id(self, user_id: str) -> Optional[dict]:
        df = self._query_df(f"""
            SELECT u.id AS user_id, cp.city, cp.country, cp.headline,
                   cp.summary, cp.job_preferences, cp.languages, cp.expected_salary,
                   cp.date_of_birth, cp.is_rwandan, cp.province, cp.district,
                   cp.sector, cp.cell, cp.village
            FROM users u
            JOIN candidate_profiles cp ON cp.user_id = u.id
            WHERE u.id = '{user_id}'::uuid AND u.deleted_at IS NULL
        """)
        return df.iloc[0].to_dict() if not df.empty else None

    def fetch_candidate_skills(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT us.user_id, s.name AS skill_name, us.years_experience
            FROM user_skills us
            JOIN skills s ON s.id = us.skill_id
        """)

    def fetch_candidate_education(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, degree, field_of_study FROM education
        """)

    def fetch_candidate_certifications(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, name AS certification_name FROM certifications
        """)

    def fetch_candidate_work_experience(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, title, description, skills, industry, start_date, end_date, is_current
            FROM work_experience
        """)

    def fetch_view_events(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, job_id, viewed_at AS event_date FROM job_views
        """)

    def fetch_application_events(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, job_id, applied_at AS event_date, status
            FROM applications WHERE deleted_at IS NULL
        """)

    def fetch_save_events(self) -> pd.DataFrame:
        return self._query_df("""
            SELECT user_id, job_id, saved_at AS event_date FROM saved_jobs
        """)

    def fetch_ignored_pairs(self) -> pd.DataFrame:
        return self._query_df("SELECT user_id, job_id FROM ignored_jobs")

    def fetch_incomplete_application_events(self) -> pd.DataFrame:
        """Candidates who opened the Apply form but never submitted   a
        weaker-than-apply, stronger-than-view signal of interest."""
        return self._query_df("""
            SELECT user_id, job_id, started_at AS event_date
            FROM application_starts WHERE submitted = FALSE
        """)

    def fetch_search_events(self) -> pd.DataFrame:
        return self._query_df("SELECT user_id, query, searched_at FROM job_searches")

    def upsert_feed_scores(self, rows: List[Tuple[str, str, float]]) -> None:
        if not rows:
            return
        with self._connect() as conn:
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(cur, """
                    INSERT INTO feed_scores (candidate_id, job_id, score, computed_at)
                    VALUES %s
                    ON CONFLICT (candidate_id, job_id)
                    DO UPDATE SET score = EXCLUDED.score, computed_at = EXCLUDED.computed_at
                """, [(cid, jid, score, datetime.now()) for cid, jid, score in rows],
                    template="(%s, %s, %s, %s)")
            conn.commit()


# ==========================================================================
# 3. TEXT EXTRACTION HELPERS (real jsonb/array shapes, not CSV columns)
# ==========================================================================

def _s(x) -> str:
    """Safe string coercion for nullable DB text fields. A DataFrame column
    that is NULL for every row (common on a small dev dataset) gets coerced
    by pandas to float64 NaN rather than None/""- and `nan or ""` still
    evaluates to `nan` (NaN is truthy), which breaks `" ".join(...)` with a
    'expected str instance, float found' error. Route every nullable field
    through this instead of `x or ""`."""
    if x is None:
        return ""
    if isinstance(x, float) and math.isnan(x):
        return ""
    return str(x)


def _skill_list_text(raw) -> str:
    if not raw:
        return ""
    items = raw if isinstance(raw, list) else []
    names = [x.get("name", "") if isinstance(x, dict) else str(x) for x in items]
    return " ".join(n for n in names if n)


def job_skills_text(row) -> str:
    return " ".join(filter(None, [_skill_list_text(row.get("skills_required")),
                                   _skill_list_text(row.get("skills_preferred"))]))


def job_fields_text(row) -> str:
    edu = row.get("education_required") or {}
    if not isinstance(edu, dict):
        edu = {}
    parts = [_s(edu.get("minimum_degree"))]
    parts += [str(f) for f in (edu.get("allowed_fields") or [])]
    if not any(parts):
        parts = [_s(row.get("qualifications"))]
    return " ".join(p for p in parts if p)


def job_location_text(row) -> str:
    locs = row.get("locations") or []
    parts = [_s(row.get("work_arrangement"))]
    if isinstance(locs, list):
        for loc in locs:
            if isinstance(loc, dict):
                parts.append(_s(loc.get("city")))
                parts.append(_s(loc.get("country")))
    return " ".join(p for p in parts if p)


def job_title_text(row) -> str:
    # job_type included so it lines up with the candidate side, which already
    # folds job_preferences.job_types into title_text- without this, a
    # candidate's declared job-type preference had nothing on the job side to
    # match against via Content (it only ever surfaced through Behavior's
    # categorical ATTRS, which needs prior interaction history to exist).
    return " ".join(p for p in [_s(row.get("title")), _s(row.get("department")),
                                 _s(row.get("company_industry")), _s(row.get("job_type"))] if p)


def job_experience_text(row) -> str:
    """Mirrors ai_job_matcher_og.py's Factor3 richer-than-title-alone text
    (title + description + skills + industry) on the JOB side, so the
    'experience_text' pair can compare a candidate's past-role text against
    what this role actually involves, not just its title."""
    return " ".join(p for p in [job_title_text(row), _s(row.get("description")), job_skills_text(row)] if p)


def _jsonable(value):
    """psycopg2 already parses jsonb columns into Python list/dict, but NaN
    (from a column that's NULL for a row with mixed non-null siblings) isn't
    valid JSON- normalize to None/[] so FastAPI's response encoder doesn't choke."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return value


def _safe_int(value, default: int = 0) -> int:
    """Coerce count-like DB values without crashing on NaN or strings."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default


def job_details_dict(job_row: pd.Series) -> dict:
    """Full job payload for the frontend- one call gets both the ranking
    score AND everything needed to render the job card, instead of a second
    round-trip per job. Field names mirror what ai_job_matcher_og.py already
    returned (job.locations, job.skills_required, etc.) so existing frontend
    parsing logic for those needs minimal changes.

    Also carries responsibilities/requirements/benefits/tags/status/
    application_count/company_size/company_website/ai_match_required_score-
    added so JobDetails.tsx's "View Details" page can rely on this single
    call (see /score/combined/job/{job_id}) instead of a second, separate
    GET /jobs/:id round trip to the backend for the same job."""
    return {
        "id": str(job_row.get("id", "")),
        "title": _s(job_row.get("title")),
        "slug": _s(job_row.get("slug")) or None,
        "company_name": _s(job_row.get("company_name")),
        "company_logo": _s(job_row.get("logo_url")) or None,
        "company_industry": _s(job_row.get("company_industry")) or None,
        "company_size": _s(job_row.get("company_size")) or None,
        "company_website": _s(job_row.get("company_website")) or None,
        "department": _s(job_row.get("department")) or None,
        "job_type": _s(job_row.get("job_type")) or None,
        "work_arrangement": _s(job_row.get("work_arrangement")) or None,
        "status": _s(job_row.get("status")) or None,
        "experience_level": _s(job_row.get("experience_level")) or None,
        "experience_min": None if pd.isna(job_row.get("experience_min")) else int(job_row.get("experience_min")),
        "experience_max": None if pd.isna(job_row.get("experience_max")) else int(job_row.get("experience_max")),
        "locations": _jsonable(job_row.get("locations")) or [],
        "skills_required": _jsonable(job_row.get("skills_required")) or [],
        "skills_preferred": _jsonable(job_row.get("skills_preferred")) or [],
        "education_required": _jsonable(job_row.get("education_required")) or {},
        "qualifications": _s(job_row.get("qualifications")) or None,
        "description": _s(job_row.get("description")),
        "responsibilities": _jsonable(job_row.get("responsibilities")) or [],
        "requirements": _jsonable(job_row.get("requirements")) or [],
        "benefits": _jsonable(job_row.get("benefits")) or [],
        "tags": _jsonable(job_row.get("tags")) or [],
        "language_requirements": _jsonable(job_row.get("language_requirements")) or [],
        "screening_questions": _jsonable(job_row.get("screening_questions")) or [],
        "salary_min": None if pd.isna(job_row.get("salary_min")) else float(job_row.get("salary_min")),
        "salary_max": None if pd.isna(job_row.get("salary_max")) else float(job_row.get("salary_max")),
        "salary_currency": _s(job_row.get("salary_currency")) or None,
        "salary_period": _s(job_row.get("salary_period")) or None,
        "ai_match_required_score": None if pd.isna(job_row.get("ai_match_required_score")) else float(job_row.get("ai_match_required_score")),
        "application_count": _safe_int(job_row.get("application_count")),
        "view_count": _safe_int(job_row.get("view_count")),
        "published_at": _s(job_row.get("published_at")) or None,
        "expires_at": _s(job_row.get("expires_at")) or None,
    }


def job_experience_years(row) -> float:
    lo, hi = row.get("experience_min"), row.get("experience_max")
    lo = None if pd.isna(lo) else lo
    hi = None if pd.isna(hi) else hi
    if lo is not None and hi is not None:
        return (float(lo) + float(hi)) / 2
    return float(lo or hi or 0)


def _years_between(start, end, is_current: bool) -> float:
    if start is None or pd.isna(start):
        return 0.0
    end_is_missing = end is None or pd.isna(end)
    end_d = date.today() if is_current or end_is_missing else end
    if isinstance(start, str):
        start = datetime.fromisoformat(start).date()
    if isinstance(end_d, str):
        end_d = datetime.fromisoformat(end_d).date()
    if isinstance(start, datetime):
        start = start.date()
    if isinstance(end_d, datetime):
        end_d = end_d.date()
    days = (end_d - start).days
    return max(0.0, days / 365.25)


def _str_list_text(raw) -> str:
    """responsibilities/requirements/benefits are jsonb arrays of plain
    strings (unlike skills, which are {"name": ...} objects)- tolerate a
    JSON-string-encoded list too, same defensive pattern ai_job_matcher_og.py
    uses for these same three columns."""
    if not raw:
        return ""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return raw
    if not isinstance(raw, list):
        return ""
    return " ".join(str(x) for x in raw if x)


# Single-purpose job-field extractors for BehaviorModel's 17-pair system.
# Deliberately NOT reusing job_title_text()/job_fields_text() above- those
# intentionally blend several raw fields together for Content's 7-pair space,
# which would double-count the same information once it's also broken out
# into its own independent pair here.
def job_title_only_text(row) -> str:
    return _s(row.get("title"))


def job_department_text(row) -> str:
    return _s(row.get("department"))


def job_industry_text(row) -> str:
    return _s(row.get("company_industry"))


def job_employment_type_text(row) -> str:
    return _s(row.get("job_type"))


def job_work_arrangement_text(row) -> str:
    return _s(row.get("work_arrangement"))


def job_company_name_text(row) -> str:
    return _s(row.get("company_name"))


def job_education_text(row) -> str:
    edu = row.get("education_required") or {}
    if not isinstance(edu, dict):
        edu = {}
    parts = [_s(edu.get("minimum_degree"))]
    parts += [str(f) for f in (edu.get("allowed_degrees") or [])]
    parts += [str(f) for f in (edu.get("allowed_fields") or [])]
    return " ".join(p for p in parts if p)


def job_responsibilities_text(row) -> str:
    return _str_list_text(row.get("responsibilities"))


def job_requirements_text(row) -> str:
    return _str_list_text(row.get("requirements"))


def job_benefits_text(row) -> str:
    return _str_list_text(row.get("benefits"))


def job_qualifications_text(row) -> str:
    return " ".join(p for p in [_s(row.get("qualifications")), _s(row.get("preferred_qualifications"))] if p)


def _parse_language_list(raw) -> List[str]:
    """candidate_profiles.languages / jobs.language_requirements are both
    jsonb lists of {"name": ...} objects (see candidates.py/jobs.py in the
    Job_Feed generator)- normalize both shapes (also tolerate a plain list
    of strings) to a flat list of language names."""
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw:
        if isinstance(item, dict):
            name = item.get("name")
            if name:
                out.append(str(name))
        elif isinstance(item, str):
            out.append(item)
    return out


# ==========================================================================
# 3.5 SEMANTIC ENCODER- Model 1's "understand relationships, not just exact
# keyword overlap" requirement (e.g. candidate skill "Python" should pull in
# "Backend Developer" / "Machine Learning Engineer", not just literal
# "Python Developer" postings). Pure TF-IDF only overlaps on shared tokens;
# sentence embeddings place semantically related phrases near each other in
# vector space even with zero shared words. Falls back to TF-IDF-only
# similarity (still functional, just less semantic) if the model can't load
#- this service must keep working on a machine with no internet access to
# download the model.
# ==========================================================================

# ==========================================================================
# 1.5 MATCHER SUBSYSTEM (ported from ai_job_matcher_og.py) -- deterministic
# 4-factor scorer: Skills 40% / Qualifications 25% / Experience 20% /
# Preferences 15%. Own logging (writes to ml/logs/*.log, same filenames as
# before), own candidate/job data access (BackendClient -> Node backend REST
# API), mounted at /matcher below. LocalTextProcessor shares this file's
# SemanticEncoder instance instead of loading a second copy of the model.
# ==========================================================================

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

MAIN_LOG = LOG_DIR / "ai_service.log"
ERROR_LOG = LOG_DIR / "ai_service_errors.log"
PERFORMANCE_LOG = LOG_DIR / "performance.log"
REQUEST_LOG = LOG_DIR / "requests.log"
CANDIDATE_LOG = LOG_DIR / "candidate_data.log"
JOB_LOG = LOG_DIR / "job_data.log"
MATCH_LOG = LOG_DIR / "match_results.log"

def write_log(log_file, message, log_type="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{log_type}] {message}\n")
    except:
        pass

def log_info(message):
    print(message)
    write_log(MAIN_LOG, message, "INFO")

def log_error(message):
    print(f"❌ {message}")
    write_log(ERROR_LOG, message, "ERROR")

def log_performance(operation, duration_ms, details=""):
    message = f"⏱️ {operation}: {duration_ms:.2f}ms {details}"
    print(message)
    write_log(PERFORMANCE_LOG, f"{operation}|{duration_ms:.2f}ms|{details}", "PERF")

def log_candidate(message):
    print(f"👤 {message}")
    write_log(CANDIDATE_LOG, message, "CANDIDATE")

def log_job(message):
    print(f"💼 {message}")
    write_log(JOB_LOG, message, "JOB")

def log_match(message):
    print(f"🎯 {message}")
    write_log(MATCH_LOG, message, "MATCH")

log_info("="*70)
log_info("🚀 AI JOB MATCHING API - PURE SEMANTIC MATCHING")
log_info(" EVERYTHING COMES FROM DATABASE - NO HARDCODED VALUES")
log_info(f"📁 Log directory: {LOG_DIR}")
log_info("="*70)

# API Configuration (Matcher subsystem -- candidate/job data fetched from the
# Node backend's REST API, unlike Hybrid's direct-Postgres access below).
BASE_URL = "http://localhost:3001/api/v1"
BACKEND_REQUEST_TIMEOUT = 120

class LocalTextProcessor:
    def __init__(self, semantic_encoder=None):
        self.lemmatizer = WordNetLemmatizer()
        # Shared SemanticEncoder instance (engine.semantic_encoder) instead of
        # loading a second independent copy of the same sentence-transformer
        # model -- this used to be the one clearly duplicated resource load
        # between the Matcher and Hybrid services when they ran separately.
        self.semantic_encoder = semantic_encoder

        self.embeddings_cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
        # Correction vocabulary built dynamically from the candidate's and job's
        # OWN skills at match time- no hardcoded/static skill list.
        self.dynamic_vocab = set()

    def add_to_vocab(self, terms):
        """Populate the fuzzy-correction vocabulary from real data (skill names)."""
        if not terms:
            return
        for term in terms:
            if not term or not isinstance(term, str):
                continue
            cleaned = re.sub(r'[^\w\s+#.]', ' ', term.lower())
            for tok in cleaned.split():
                if len(tok) > 3:
                    self.dynamic_vocab.add(tok)

    def normalize_terms(self, text: str) -> str:
        """Correct typos against the vocabulary built from the candidate's and job's
        own skills (e.g. a misspelled job skill 'javascrit' aligns to the candidate's
        'javascript'). Purely data-driven- a no-op when no vocabulary is set."""
        if not text or not self.dynamic_vocab:
            return text
        try:
            import difflib
            out = []
            for tok in text.split():
                if len(tok) <= 3 or tok in self.dynamic_vocab:
                    out.append(tok)
                    continue
                match = difflib.get_close_matches(tok, self.dynamic_vocab, n=1, cutoff=0.86)
                out.append(match[0] if match else tok)
            return ' '.join(out)
        except Exception:
            return text

    def lemmatize(self, text: str) -> str:
        if not text:
            return text
        try:
            tokens = word_tokenize(text.lower())
            lemmatized = [self.lemmatizer.lemmatize(token) for token in tokens]
            return ' '.join(lemmatized)
        except:
            return text

    def clean(self, text: str) -> str:
        if not text:
            return ""
        if not isinstance(text, str):
            text = str(text)
        text = text.lower()
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        text = self.normalize_terms(text)   # typo / abbreviation correction
        text = self.lemmatize(text)
        return text.strip()
    
    def get_embedding(self, text: str) -> np.ndarray:
        if not text:
            return np.zeros(384)
        if text in self.embeddings_cache:
            self.cache_hits += 1
            return self.embeddings_cache[text]
        self.cache_misses += 1
        if self.semantic_encoder:
            emb = self.semantic_encoder.encode(text)
            if emb is not None:
                self.embeddings_cache[text] = emb
                return emb
        return np.zeros(384)

    def semantic_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0

        if self.semantic_encoder and self.semantic_encoder.available:
            sim = self.semantic_encoder.similarity(text1, text2)
            if sim > 0:
                return sim

        try:
            vec = TfidfVectorizer(max_features=300)
            tfidf = vec.fit_transform([text1, text2])
            return float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])
        except:
            return 0.0

    def get_cache_stats(self):
        return {"hits": self.cache_hits, "misses": self.cache_misses}


def redistribute_weights(components: dict) -> dict:
    """components: {name: (applicable: bool, base_weight: float)}.

    Returns {name: effective_weight}: inapplicable dimensions (nothing to
    evaluate -- the job simply didn't state a requirement for them) get 0,
    and every applicable dimension's weight is renormalized so the survivors
    still sum to 1.0. Mirrors HybridWeights.normalized() below, which
    already does this correctly for the Hybrid engine's Content/Behavior/
    Collaborative signals -- this is the same pattern applied to the
    Matcher's factors/sub-dimensions, where "no requirement stated" was
    previously scored as a flat 100% (free credit) instead of being
    excluded and its weight handed to the dimensions that ARE applicable.

    If every dimension is inapplicable, all weights are 0 -- the caller
    is responsible for deciding what an empty parent factor means (usually:
    exclude that whole factor too, one level up)."""
    total = sum(w for applicable, w in components.values() if applicable)
    if total <= 0:
        return {name: 0.0 for name in components}
    return {name: (w / total if applicable else 0.0) for name, (applicable, w) in components.items()}


class Factor1_SkillsMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_skills(self, profile_data):
        skills = set()
        for skill in profile_data.get('skills', []):
            name = skill.get('skill_name', '') or skill.get('name', '')
            if name:
                cleaned = self.tp.clean(name)
                if cleaned:
                    skills.add(cleaned)
                    log_candidate(f"   Skill from DB: {name}")
        
        for work in profile_data.get('work_experience', []):
            for skill in work.get('skills', []):
                if skill and isinstance(skill, str):
                    cleaned = self.tp.clean(skill)
                    if cleaned:
                        skills.add(cleaned)
                        log_candidate(f"   Skill from work DB: {skill}")
        
        return list(skills)
    
    def extract_job_skills(self, job):
        skills = set()
        for skill in job.get('skills_required', []):
            if isinstance(skill, dict):
                name = skill.get('name', '')
            elif isinstance(skill, str):
                name = skill
            else:
                continue
            if name:
                name = name.replace('•', '').strip()
                cleaned = self.tp.clean(name)
                if cleaned:
                    skills.add(cleaned)
                    log_job(f"   Required skill from DB: {name}")
        return list(skills)
    
    def match(self, candidate_skills, job_skills):
        if not job_skills:
            # Job lists no required skills at all -- nothing to evaluate, so
            # this factor is EXCLUDED (weight 0) rather than given free 100%
            # credit; its 40% base weight is redistributed across the other
            # 3 factors by the caller (see the top-level combine step).
            return {"score": 0.0, "match_percentage": 0.0, "matched_count": 0, "total": 0,
                    "applicable": False, "note": "Job doesn't list any required skills",
                    "weight": 0.0, "weighted_score": 0.0}
        if not candidate_skills:
            return {"score": 0.0, "match_percentage": 0.0, "matched_count": 0, "total": len(job_skills),
                    "applicable": True, "weight": 0.40, "weighted_score": 0.0}
        
        matched = []
        match_scores = []
        
        for js in job_skills:
            best = 0.0
            for cs in candidate_skills:
                sim = self.tp.semantic_similarity(cs, js)
                if sim > best:
                    best = sim
            match_scores.append(best)
            if best >= 0.3:
                matched.append(js)
                log_match(f"      Skill matched: '{js}' (similarity: {best:.2f})")
            else:
                log_match(f"      Skill NOT matched: '{js}' (best similarity: {best:.2f})")
        
        score = sum(match_scores) / len(job_skills) if job_skills else 1.0
        
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "matched_count": len(matched),
            "total_job_skills": len(job_skills),
            "matched_skills": matched,
            "missing_skills": [js for js in job_skills if js not in matched],
            "individual_scores": match_scores,
            "applicable": True,
            "weight": 0.40,
            "weighted_score": round(score * 0.40, 4)
        }

class Factor2_QualificationsMatcher:
    def __init__(self, tp):
        self.tp = tp
        
        # Degree level hierarchy (Lower number = lower degree)
        self.degree_levels = {
            # Level 0 - No degree
            "no formal education": 0,
            "high school": 0,
            "secondary school": 0,
            "ged": 0,

            # Rwanda's TVET/NQF levels (A2/A1/A0), extremely common in this
            # dataset's government job postings ("A1 Electricity Sciences",
            # "A2 certificate in accounting", etc.) and NOT expressible via
            # the Western degree names below- checked before "advanced
            # diploma"/"diploma"/"bachelor" so e.g. "A1 ..." doesn't fall
            # through to a substring match on an unrelated word. Trailing
            # space avoids matching "a1"/"a2"/"a0" inside an unrelated word.
            "a2 ": 1,   # secondary-level TVET certificate ~ Certificate/Diploma
            "a1 ": 2,   # advanced diploma (TVET)
            "a0 ": 3,   # bachelor's degree

            # Level 1 - Certificate/Diploma
            "certificate": 1,
            "diploma": 1,
            "certification": 1,

            # Level 2 - Advanced Diploma/Associate
            "advanced diploma": 2,
            "associate degree": 2,
            "hnd": 2,
            "foundation degree": 2,
            
            # Level 3 - Bachelor's
            "bachelor": 3, 
            "bachelor's": 3, 
            "bachelor's degree": 3,
            "bsc": 3, 
            "ba": 3, 
            "beng": 3,
            "bachelor degree": 3,
            "undergraduate": 3,
            
            # Level 4 - Postgraduate Diploma/Certificate
            "postgraduate diploma": 4, 
            "postgraduate certificate": 4,
            "pgdip": 4,
            "pgcert": 4,
            
            # Level 5 - Master's
            "master": 5, 
            "master's": 5, 
            "master's degree": 5,
            "msc": 5, 
            "ma": 5, 
            "mba": 5,
            "masters": 5,
            "postgraduate": 5,
            
            # Level 6 - Doctorate
            "phd": 6, 
            "doctorate": 6, 
            "doctoral": 6,
            "doctor": 6,
            "dphil": 6,
        }
        
        # Qualification entry weights
        self.qualification_weights = {
            "degree": 0.6,
            "field": 0.4
        }
    
    def get_degree_level(self, degree_text: str) -> int:
        """Get hierarchical level. Returns -1 only when degree_text is empty
        (genuinely no degree/no requirement stated) and 0 when degree_text is
        present but doesn't match any known level- these are NOT the same
        thing to check_degree_hierarchy() below: -1 means "nothing to
        compare" (free pass for a job with no requirement), 0 means "there IS
        a requirement/degree here, we just can't place it on the hierarchy"
        and must not be treated as if no requirement existed."""
        if not degree_text:
            return -1

        degree_lower = degree_text.lower().strip()

        # Direct match first
        for degree_name, level in self.degree_levels.items():
            if degree_name in degree_lower:
                return level

        # Try semantic similarity with known levels
        highest_score = 0.0
        best_level = -1

        for degree_name, level in self.degree_levels.items():
            sim = self.tp.semantic_similarity(degree_lower, degree_name)
            if sim > highest_score and sim > 0.4:
                highest_score = sim
                best_level = level

        return best_level if best_level >= 0 else 0
    
    def check_degree_hierarchy(self, candidate_level: int, required_level: int, exact_match_only: bool = False) -> float:
        """
        Calculate degree hierarchy score.
        """
        # Genuinely no requirement stated (get_degree_level's -1, empty text
        # only) - always 100%. required_level == 0 means the job DID state a
        # degree but it wasn't recognized (e.g. Rwanda's A0/A1/A2 TVET naming
        # slipping past the dictionary)- that must NOT be treated the same as
        # "no requirement," or an unqualified candidate gets a free pass on a
        # real requirement just because the matcher couldn't parse it.
        if required_level == -1:
            return 1.0

        # Candidate has no degree (or their degree text was itself
        # unrecognized) - 0%. Applies whether the job's requirement was
        # recognized or not: with no known candidate level there is nothing
        # to compare, so this must not fall through to a hierarchy/free-pass
        # branch below.
        if candidate_level <= 0:
            return 0.0

        # EXACT MATCH MODE (strict)
        if exact_match_only:
            return 1.0 if candidate_level == required_level else 0.0

        # Job's requirement text is present but unrecognized, and the
        # candidate DOES have a real, recognized degree- we can't place the
        # job's requirement on the hierarchy to compare properly, so give
        # partial (not full, not zero) credit rather than guessing either
        # extreme.
        if required_level == 0:
            return 0.5

        # HIERARCHY MODE
        if candidate_level >= required_level:
            # Candidate meets or exceeds requirement - ALWAYS 100%
            return 1.0  # Any degree at or above requirement = 100%
        else:
            # Candidate below requirement
            level_diff = required_level - candidate_level
            
            if level_diff == 1:
                return 0.50  # One level below = 50%
            elif level_diff == 2:
                return 0.25  # Two levels below = 25%
            else:
                return 0.10  # Three+ levels below = 10%
    def extract_candidate_qualifications(self, profile_data):
        result = {
            "degrees": [], 
            "fields": [], 
            "combined": [], 
            "certifications": [],
            "highest_degree_level": -1,
            "highest_degree_raw": None
        }
        
        # Extract from education records
        for edu in profile_data.get('education', []):
            degree = edu.get('degree', '')
            field = edu.get('field_of_study', '')
            
            if degree:
                degree_level = self.get_degree_level(degree)
                result["degrees"].append({
                    "raw": degree, 
                    "cleaned": self.tp.clean(degree),
                    "level": degree_level
                })
                
                # Track highest degree
                if degree_level > result["highest_degree_level"]:
                    result["highest_degree_level"] = degree_level
                    result["highest_degree_raw"] = degree
                
                log_candidate(f"   Degree from DB: {degree} (Level: {degree_level})")
            
            if field:
                result["fields"].append({
                    "raw": field, 
                    "cleaned": self.tp.clean(field)
                })
                log_candidate(f"   Field from DB: {field}")
            
            if degree and field:
                combined = f"{degree} in {field}"
                result["combined"].append({
                    "raw": combined,
                    "cleaned": self.tp.clean(combined),
                    "degree_level": degree_level if degree else -1
                })
            elif degree:
                result["combined"].append({
                    "raw": degree,
                    "cleaned": self.tp.clean(degree),
                    "degree_level": degree_level if degree else -1
                })
        
        # Extract from certifications
        for cert in profile_data.get('certifications', []):
            cert_name = cert.get('name', '')
            if cert_name:
                result["certifications"].append({
                    "raw": cert_name,
                    "cleaned": self.tp.clean(cert_name)
                })
                log_candidate(f"   Certification from DB: {cert_name}")
        
        return result
    
    def extract_job_qualifications(self, job):
        edu_required = job.get('education_required', {})
        
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        
        # Get minimum degree requirement
        min_degree = edu_required.get('minimum_degree', '')
        min_degree_level = self.get_degree_level(min_degree)
        
        # Parse qualification entries (MULTIPLE qualifications allowed)
        qualification_entries = edu_required.get('qualification_entries', [])
        processed_entries = []
        
        #  COLLECT ALL FIELDS FROM QUALIFICATION ENTRIES
        all_fields_from_entries = []
        
        for entry in qualification_entries:
            entry_degree = entry.get('degree', '')
            entry_fields = entry.get('fields_of_study', [])
            
            # Handle fields as array or string
            if isinstance(entry_fields, str):
                try:
                    entry_fields = json.loads(entry_fields)
                except:
                    entry_fields = [entry_fields] if entry_fields else []
            elif not isinstance(entry_fields, list):
                entry_fields = []
            
            #  ADD ALL FIELDS TO THE COLLECTION
            for field in entry_fields:
                if field and field not in all_fields_from_entries:
                    all_fields_from_entries.append(field)
            
            processed_entries.append({
                "degree": entry_degree,
                "degree_level": self.get_degree_level(entry_degree),
                "fields_of_study": entry_fields,
                "fields_cleaned": [self.tp.clean(f) for f in entry_fields if f]
            })
        
        #  MERGE root fields_of_study with fields from qualification_entries
        root_fields = edu_required.get('fields_of_study', [])
        if isinstance(root_fields, str):
            try:
                root_fields = json.loads(root_fields)
            except:
                root_fields = []
        elif not isinstance(root_fields, list):
            root_fields = []
        
        # Combine all fields (root + from entries)
        all_fields = list(set(root_fields + all_fields_from_entries))
        
        # Parse certifications
        certifications = edu_required.get('certifications', [])
        if isinstance(certifications, str):
            try:
                certifications = json.loads(certifications)
            except:
                certifications = []
        elif not isinstance(certifications, list):
            certifications = []
        
        # Parse age requirement
        age_requirement = edu_required.get('age_requirement', '')
        
        # Parse languages
        languages = edu_required.get('languages', [])
        if isinstance(languages, str):
            try:
                languages = json.loads(languages)
            except:
                languages = []
        
        processed_languages = []
        for lang in languages:
            if isinstance(lang, dict):
                lang_name = lang.get('name', '')
                if lang_name:
                    processed_languages.append(lang_name)
            elif isinstance(lang, str):
                if lang:
                    processed_languages.append(lang)
        
        # Parse experience requirements
        experience_requirements = edu_required.get('experience_requirements', [])
        if isinstance(experience_requirements, str):
            try:
                experience_requirements = json.loads(experience_requirements)
            except:
                experience_requirements = []
        
        processed_experience = []
        for exp in experience_requirements:
            if isinstance(exp, dict):
                title = exp.get('title', '')
                years_str = exp.get('years', '')
                if title and years_str:
                    years_num = 0
                    match = re.search(r'(\d+(?:\.\d+)?)', str(years_str))
                    if match:
                        years_num = float(match.group(1))
                    processed_experience.append({
                        "title": title,
                        "years_required": years_num,
                        "raw_years": years_str
                    })
            elif isinstance(exp, str):
                processed_experience.append({"title": exp, "years_required": 0})
        
        # ============================================
        #  ENHANCED LOGGING - SHOW COMPLETE EDUCATION REQUIREMENTS
        # ============================================
        log_job(f"   ============================================")
        log_job(f"   📚 COMPLETE EDUCATION REQUIREMENTS FROM DB:")
        log_job(f"   ============================================")
        log_job(f"   🎓 Minimum Degree: {min_degree} (Level: {min_degree_level})")
        log_job(f"   🎓 Is Degree Required: {edu_required.get('is_degree_required', False)}")
        log_job(f"   ")
        
        if processed_entries:
            log_job(f"   📋 QUALIFICATION ENTRIES ({len(processed_entries)}):")
            for idx, entry in enumerate(processed_entries):
                log_job(f"      Entry {idx + 1}:")
                log_job(f"         Degree: {entry['degree']} (Level: {entry['degree_level']})")
                log_job(f"         Fields of Study: {entry['fields_of_study']}")
            log_job(f"   ")
        else:
            log_job(f"   📋 Qualification Entries: None")
            log_job(f"   ")
        
        if all_fields:
            log_job(f"   📚 Combined Fields of Study ({len(all_fields)}):")
            log_job(f"      {all_fields}")
            log_job(f"   ")
        else:
            log_job(f"   📚 Fields of Study: None")
            log_job(f"   ")
        
        if certifications:
            log_job(f"    Certifications Required ({len(certifications)}):")
            for cert in certifications:
                log_job(f"      - {cert}")
            log_job(f"   ")
        else:
            log_job(f"    Certifications: None")
            log_job(f"   ")
        
        if processed_experience:
            log_job(f"   💼 Experience Requirements ({len(processed_experience)}):")
            for exp in processed_experience:
                log_job(f"      - {exp.get('title', 'Unknown')}: {exp.get('years_required', 0)}+ years")
            log_job(f"   ")
        else:
            log_job(f"   💼 Experience Requirements: None")
            log_job(f"   ")
        
        if processed_languages:
            log_job(f"   🌐 Languages Required ({len(processed_languages)}):")
            for lang in processed_languages:
                log_job(f"      - {lang}")
            log_job(f"   ")
        else:
            log_job(f"   🌐 Languages: None")
            log_job(f"   ")
        
        log_job(f"   👤 Age Requirement: {age_requirement if age_requirement else 'Not specified'}")
        log_job(f"   ============================================")
        
        return {
            "minimum_degree": min_degree,
            "minimum_degree_level": min_degree_level,
            "qualification_entries": processed_entries,
            "min_degree_cleaned": self.tp.clean(min_degree),
            "is_degree_required": edu_required.get('is_degree_required', False),
            "fields_of_study": all_fields,
            "fields_cleaned": [self.tp.clean(f) for f in all_fields if f],
            "certifications": certifications,
            "certifications_cleaned": [self.tp.clean(c) for c in certifications if c],
            "additional_requirements": edu_required.get('additional_requirements', []),
            "languages": processed_languages,
            "experience_requirements": processed_experience,
            "age_requirement": age_requirement,
            #  ADD THESE FOR COMPLETE DATA
            "raw_education_required": edu_required,
            "has_qualification_entries": len(processed_entries) > 0,
            "total_qualification_options": len(processed_entries),
            "allowed_degrees": [entry['degree'] for entry in processed_entries if entry['degree']],
            "allowed_fields": all_fields,
        }
   
    def match(self, candidate_quals, job_quals):
        # Get candidate's highest degree
        candidate_highest_level = candidate_quals.get("highest_degree_level", -1)
        candidate_highest_degree = candidate_quals.get("highest_degree_raw", "No degree")
        
        job_required_level = job_quals.get("minimum_degree_level", -1)
        job_required_degree = job_quals.get("minimum_degree", "")
        
        # Check if job has multiple qualification entries
        qualification_entries = job_quals.get("qualification_entries", [])
        has_qualification_entries = len(qualification_entries) > 0

        # =====================================================
        # DEGREE HIERARCHY SCORE
        # =====================================================
        exact_match_only = False

        # job_required_level == -1 from an empty root minimum_degree field is
        # only a genuine "no requirement" when qualification_entries is ALSO
        # empty. When entries exist, the job's real requirement lives there
        # instead (this dataset structures degree requirements either way)-
        # letting the empty root field give an automatic free pass here would
        # let it win over a correctly-computed (and possibly zero) entries
        # score via the max() below, even though the job clearly does have a
        # requirement. Pass 0 (present-but-uncomparable) instead of -1 so
        # check_degree_hierarchy falls through to the real candidate check.
        root_level_for_hierarchy = 0 if (job_required_level == -1 and has_qualification_entries) else job_required_level
        hierarchy_score = self.check_degree_hierarchy(
            candidate_highest_level,
            root_level_for_hierarchy,
            exact_match_only
        )
        
        log_match(f"   Degree Hierarchy: Candidate={candidate_highest_level} ({candidate_highest_degree}), Job={job_required_level} ({job_required_degree}) → Score={hierarchy_score:.2f}")
        
        # =====================================================
        # CHECK QUALIFICATION ENTRIES (if job has multiple options)
        # =====================================================
        qualification_entry_score = 0.0
        best_entry_match = None
        
        if has_qualification_entries and candidate_highest_level > 0:
            for entry in qualification_entries:
                entry_degree = entry.get("degree", "")
                entry_level = entry.get("degree_level", -1)
                entry_fields = entry.get("fields_cleaned", [])
                
                if entry_level > 0:
                    entry_hierarchy_score = self.check_degree_hierarchy(
                        candidate_highest_level, 
                        entry_level,
                        exact_match_only
                    )
                    
                    if entry_hierarchy_score > qualification_entry_score:
                        qualification_entry_score = entry_hierarchy_score
                        best_entry_match = entry
        
        # Use qualification entry score if better than base hierarchy
        final_hierarchy_score = max(hierarchy_score, qualification_entry_score)
        
        # =====================================================
        # FIELD MATCHING
        # =====================================================
        job_fields = job_quals.get("fields_cleaned", [])
        candidate_fields_list = [f["cleaned"] for f in candidate_quals.get("fields", [])]
        candidate_combined_list = [c["cleaned"] for c in candidate_quals.get("combined", [])]
        
        field_match_score = 0.0
        best_field_sim = 0.0
        best_matched_field = None
        has_field_requirement = len(job_fields) > 0
        has_candidate_field_data = bool(candidate_fields_list or candidate_combined_list)

        if has_field_requirement:
            if not has_candidate_field_data:
                # Job states a field-of-study requirement and the candidate
                # has zero education entries on file -- no evidence they meet
                # it, so this scores 0, not a "some credit anyway" floor.
                field_match_score = 0.0
                log_match(f"   ❌ Field match: candidate has no field-of-study data on file → 0.00 (job requires: {job_fields})")
            else:
                log_match(f"   Job requires field(s): {job_fields}")

                # Calculate best similarity
                for job_field in job_fields:
                    for cand_field in candidate_fields_list + candidate_combined_list:
                        sim = self.tp.semantic_similarity(cand_field, job_field)
                        log_match(f"      Comparing '{cand_field}' with '{job_field}': similarity={sim:.4f}")
                        if sim > best_field_sim:
                            best_field_sim = sim
                            best_matched_field = cand_field

                # Calculate field match score with stricter thresholds -- no
                # floor for a weak/poor match: candidate HAS field data, it
                # just doesn't meaningfully resemble what the job requires,
                # so below the PARTIAL threshold this is honestly 0, not a
                # guaranteed 0.2 "something's better than nothing" credit.
                if best_field_sim >= 0.8:
                    field_match_score = 1.0
                    log_match(f"    Field match: EXCELLENT ({best_field_sim:.2f})")
                elif best_field_sim >= 0.6:
                    field_match_score = 0.8
                    log_match(f"    Field match: GOOD ({best_field_sim:.2f})")
                elif best_field_sim >= 0.4:
                    field_match_score = 0.5
                    log_match(f"   ️ Field match: PARTIAL ({best_field_sim:.2f})")
                else:
                    field_match_score = 0.0
                    log_match(f"   ❌ Field match: POOR ({best_field_sim:.2f}) → scored 0, no floor credit")
        
        # =====================================================
        # CERTIFICATION MATCHING
        # =====================================================
        job_certs = job_quals.get("certifications_cleaned", [])
        candidate_certs = [c["cleaned"] for c in candidate_quals.get("certifications", [])]
        
        cert_match_score = 1.0
        matched_certs = []
        has_cert_requirement = len(job_certs) > 0
        
        if has_cert_requirement:
            if candidate_certs:
                cert_matches = 0
                log_match(f"   DEBUG - Job Certifications: {job_certs}")
                log_match(f"   DEBUG - Candidate Certifications: {candidate_certs}")

                for job_cert in job_certs:
                    for cand_cert in candidate_certs:
                        sim = self.tp.semantic_similarity(cand_cert, job_cert)
                        log_match(f"      Comparing cert: '{cand_cert}' vs '{job_cert}' = {sim:.4f}")
                        if sim >= 0.6:
                            cert_matches += 1
                            matched_certs.append({"job": job_cert, "candidate": cand_cert, "similarity": sim})
                            break
                
                cert_match_score = cert_matches / len(job_certs)
                log_match(f"   Certifications: {cert_matches}/{len(job_certs)} matched → Score={cert_match_score:.2f}")
            else:
                # Job requires certification(s) and the candidate has none on
                # file -- no evidence they meet a stated requirement, so this
                # scores 0, not a "benefit of the doubt" default.
                cert_match_score = 0.0
                log_match(f"   Certifications: Job requires certs, candidate has none on file → 0.00")

        # =====================================================
        # CALCULATE FINAL QUALIFICATION SCORE
        # Base weights Degree 15% / Field 70% / Certs 15% apply only to
        # dimensions the job actually stated a requirement for -- an
        # unstated dimension is EXCLUDED (not given free 100% credit) and
        # its weight is redistributed across the dimensions that ARE
        # applicable (same pattern as HybridWeights.normalized() below).
        # =====================================================
        has_degree_requirement = job_required_level > 0 or has_qualification_entries
        degree_component_score = (
            qualification_entry_score if (has_qualification_entries and qualification_entry_score > 0)
            else final_hierarchy_score
        )

        qual_weights = redistribute_weights({
            "degree": (has_degree_requirement, 0.15),
            "field":  (has_field_requirement, 0.70),
            "certs":  (has_cert_requirement, 0.15),
        })
        final_score = (degree_component_score * qual_weights["degree"]
                       + field_match_score * qual_weights["field"]
                       + cert_match_score * qual_weights["certs"])
        excluded_dimensions = [name for name, applicable in
                               (("degree", has_degree_requirement), ("field", has_field_requirement),
                                ("certs", has_cert_requirement)) if not applicable]
        qualifications_applicable = has_degree_requirement or has_field_requirement or has_cert_requirement
        log_match(f"   Qualification weights after redistribution: degree={qual_weights['degree']:.2f}, "
                  f"field={qual_weights['field']:.2f}, certs={qual_weights['certs']:.2f} "
                  f"(excluded: {excluded_dimensions or 'none'})")

        final_score = min(1.0, max(0.0, final_score))
        
        # Determine match quality
        if final_score >= 0.85:
            match_quality = "Excellent"
            explanation = f"Your {candidate_highest_degree} perfectly matches the job requirements"
        elif final_score >= 0.70:
            match_quality = "Good"
            explanation = f"Your {candidate_highest_degree} meets the job requirements"
        elif final_score >= 0.50:
            match_quality = "Fair"
            explanation = f"Your {candidate_highest_degree} partially meets the job requirements"
        elif final_score >= 0.30:
            match_quality = "Partial"
            explanation = f"Your {candidate_highest_degree} is below the required {job_required_degree}"
        else:
            match_quality = "Poor"
            explanation = f"Your qualifications do not match the job requirements"
        
        log_match(f"   ============================================")
        log_match(f"   QUALIFICATIONS MATCH SUMMARY:")
        log_match(f"      Degree Hierarchy Score: {final_hierarchy_score:.2f} ({final_hierarchy_score*100:.0f}%)")
        log_match(f"      Field Match Score: {field_match_score:.2f} ({field_match_score*100:.0f}%)")
        log_match(f"      Certification Score: {cert_match_score:.2f} ({cert_match_score*100:.0f}%)")
        log_match(f"      Has Field Requirement: {has_field_requirement}")
        log_match(f"      Has Qualification Entries: {has_qualification_entries}")
        log_match(f"      Has Certification Requirement: {has_cert_requirement}")
        log_match(f"      Final Score: {final_score:.2f} ({final_score*100:.0f}%)")
        log_match(f"      Match Quality: {match_quality}")
        log_match(f"   ============================================")
        
        return {
            "score": round(final_score, 4),
            "match_percentage": round(final_score * 100, 1),
            "match_quality": match_quality,
            "explanation": explanation,
            "degree_hierarchy_score": round(final_hierarchy_score, 4),
            "field_match_score": round(field_match_score, 4),
            "certification_score": round(cert_match_score, 4),
            "best_field_similarity": round(best_field_sim, 4),
            "best_matched_field": best_matched_field,
            "has_field_requirement": has_field_requirement,
            "has_qualification_entries": has_qualification_entries,
            "has_certification_requirement": has_cert_requirement,
            "candidate_highest_degree": candidate_highest_degree,
            "candidate_degree_level": candidate_highest_level,
            "job_required_degree": job_required_degree,
            "job_degree_level": job_required_level,
            "matched_certifications": matched_certs,
            "qualification_entry_used": best_entry_match,
            "applicable": qualifications_applicable,
            "excluded_dimensions": excluded_dimensions,
            "redistributed_weights": qual_weights,
            "weight": 0.25,
            "weighted_score": round(final_score * 0.25, 4)
        }

class Factor3_ExperienceMatcher:
    def __init__(self, tp):
        self.tp = tp
    
    def extract_candidate_work_experience(self, profile_data):
        experiences = []
        current_date = datetime.now()
        
        for work in profile_data.get('work_experience', []):
            title = work.get('title', '')
            start_str = work.get('start_date')
            end_str = work.get('end_date')
            is_current = work.get('is_current', False)
            
            if not title or not start_str:
                continue
            
            try:
                if isinstance(start_str, str):
                    start_str = start_str.replace('Z', '+00:00')
                start = datetime.fromisoformat(start_str)
                # Normalize to naive so we never mix tz-aware and naive datetimes
                # (current jobs use datetime.now(), which is naive)- this was silently
                # dropping current experiences via a TypeError.
                if start.tzinfo is not None:
                    start = start.replace(tzinfo=None)

                if is_current or not end_str:
                    end = datetime.now()
                else:
                    if isinstance(end_str, str):
                        end_str = end_str.replace('Z', '+00:00')
                    end = datetime.fromisoformat(end_str)
                    if end.tzinfo is not None:
                        end = end.replace(tzinfo=None)

                years = (end - start).days / 365.25

                if years > 0:
                    # Build the text used for semantic matching from the TITLE plus the
                    # responsibilities, technologies, and industry- not the title alone-
                    # so relevant experience is recognised even when the title differs.
                    parts = [title]
                    if work.get('description'):
                        parts.append(str(work.get('description')))
                    exp_skills = work.get('skills') or []
                    if isinstance(exp_skills, list) and exp_skills:
                        parts.append(' '.join(str(s) for s in exp_skills))
                    elif isinstance(exp_skills, str):
                        parts.append(exp_skills)
                    if work.get('industry'):
                        parts.append(str(work.get('industry')))

                    experiences.append({
                        "title": title,
                        "company": work.get('company') or work.get('company_name') or work.get('organization') or '',
                        "skills": exp_skills if isinstance(exp_skills, list) else ([exp_skills] if exp_skills else []),
                        "years": round(years, 2),
                        "is_current": is_current,
                        # Title alone (high-signal for role-to-role matching) AND the full
                        # text (title + responsibilities + skills + industry). Matching
                        # takes the MAX of the two so a clear title match isn't diluted by
                        # the longer text, while skill-based matches still count.
                        "cleaned": self.tp.clean(title),
                        "cleaned_full": self.tp.clean(' '.join(parts)),
                    })
                    log_candidate(f"   Work from DB: {title} - {years:.2f} years")
                    
            except Exception as e:
                log_error(f"Error parsing date for {title}: {e}")
                continue
        
        return experiences
    
    def extract_job_experience_requirements(self, job):
        edu_required = job.get('education_required', {})
        
        if isinstance(edu_required, str):
            try:
                edu_required = json.loads(edu_required)
            except:
                edu_required = {}
        
        exp_requirements = edu_required.get('experience_requirements', [])
        
        if not exp_requirements:
            exp_requirements = job.get('experience_requirements', [])
        
        requirements = []
        for req in exp_requirements:
            if isinstance(req, dict):
                title = req.get('title', '') or req.get('area', '')
                years_str = req.get('years', '') or req.get('years_required', '')
                
                if title and years_str:
                    years_num = 0
                    match = re.search(r'(\d+(?:\.\d+)?)', str(years_str))
                    if match:
                        years_num = float(match.group(1))
                    
                    requirements.append({
                        "title": title,
                        "years_required": years_num,
                        "raw_years": years_str,
                        "cleaned": self.tp.clean(title)
                    })
                    log_job(f"   Specific requirement from DB: {title} - {years_num}+ years")
        
        general_min = job.get('experience_min', 0) or 0
        if general_min > 0 and not requirements:
            log_job(f"   General requirement from DB: {general_min}+ years")
        
        return {
            "specific_requirements": requirements,
            "general_min_years": general_min
        }
    
    def _requirement_keyword_overlap(self, exp_text, req_text):
        """Relevance from the ROLE's responsibilities and SKILLS, not just the title.
        Returns the fraction of the requirement's significant words that appear in the
        candidate's full experience text (title + description + skills + industry), so a
        'Software Engineer' whose role lists 'software development' / 'team leadership'
        satisfies those requirements even when WordNet title similarity is low. Both
        sides are cleaned the same way, so the tokens line up."""
        req_tokens = {t for t in str(req_text).split() if len(t) > 2}
        if not req_tokens:
            return 0.0
        exp_tokens = set(str(exp_text).split())
        hits = sum(1 for t in req_tokens if t in exp_tokens)
        return hits / len(req_tokens)

    def match_specific_requirements(self, candidate_experiences, job_requirements):
        specific_reqs = job_requirements.get("specific_requirements", [])
        
        if not specific_reqs:
            return None
        
        total_score = 0.0
        matches = []
        
        for req in specific_reqs:
            req_title = req["title"]
            req_years = req["years_required"]
            req_cleaned = req["cleaned"]
            
            best_match = None
            best_score = 0.0
            
            for exp in candidate_experiences:
                exp_title = exp["title"]
                exp_years = exp["years"]
                # Compare BOTH the role title and the full experience text, and take the
                # stronger of the two (avoids a long description diluting a clear
                # title-to-role match, e.g. "Software Engineer" ↔ "Software Development").
                similarity = max(
                    self.tp.semantic_similarity(exp["cleaned"], req_cleaned),
                    self.tp.semantic_similarity(exp.get("cleaned_full", exp["cleaned"]), req_cleaned),
                    # Direct keyword/skill overlap with the role's responsibilities + skills,
                    # so relevance isn't gated by fuzzy title-only similarity.
                    self._requirement_keyword_overlap(exp.get("cleaned_full", exp["cleaned"]), req_cleaned),
                )

                # Score by the BEST relevance the experience has to this requirement-
                # never a hard zero. Strong matches (>= 50% similarity) are flagged;
                # weaker ones still earn PARTIAL credit equal to their semantic
                # relevance, so a related-but-not-exact role isn't 0%.
                if exp_years >= req_years:
                    years_score = 1.0
                else:
                    # Honest linear scale from 0 -- no floor. An experience
                    # with near-zero tenure against this requirement should
                    # score near-zero on the years dimension, not a
                    # guaranteed 50%+; capped at 0.85 (not 1.0) so "close to
                    # the requirement" still reads as short of fully meeting it.
                    ratio = exp_years / req_years if req_years > 0 else 1.0
                    years_score = min(0.85, ratio)

                # Relevance drives the score; years is a minor factor.
                combined = (similarity * 0.85) + (years_score * 0.15)

                if combined > best_score:
                    best_score = combined
                    best_match = {
                        "requirement_title": req_title,
                        "requirement_years": req_years,
                        "matched_title": exp_title,
                        "candidate_years": exp_years,
                        "similarity": round(similarity, 4),
                        "years_score": round(years_score, 4),
                        "combined_score": round(combined, 4),
                        "is_strong": similarity >= 0.5
                    }
            
            if best_match:
                matches.append(best_match)
                total_score += best_match["combined_score"]
                log_match(f"      Requirement '{req_title}' ({req_years}+ yrs) matched with '{best_match['matched_title']}' ({best_match['candidate_years']} yrs) → score: {best_match['combined_score']:.2f}")
            else:
                log_match(f"      Requirement '{req_title}' ({req_years}+ yrs) - NO MATCH found")
        
        if specific_reqs:
            final_score = total_score / len(specific_reqs)
            return {
                "score": round(final_score, 4),
                "match_percentage": round(final_score * 100, 1),
                "type": "specific",
                "matches": matches,
                "total_requirements": len(specific_reqs),
                "matched_count": len(matches),
                "unmatched_requirements": [
                    {"title": r["title"], "years_required": r["years_required"]}
                    for r in specific_reqs if not any(m["requirement_title"] == r["title"] for m in matches)
                ]
            }
        
        return None
    
    def match_general_requirement(self, candidate_experiences, job_requirements):
        general_years = job_requirements.get("general_min_years", 0)
        
        if general_years == 0:
            return None
        
        total_years = sum(exp["years"] for exp in candidate_experiences)
        
        log_candidate(f"   Total experience from DB: {total_years:.2f} years")
        log_job(f"   General requirement from DB: {general_years}+ years")
        
        if total_years >= general_years:
            score = 1.0
            log_match(f"   Experience: {total_years:.2f} >= {general_years} → 100%")
        else:
            # Honest linear scale from 0 -- a candidate with 0 years toward a
            # stated requirement scores 0, not a guaranteed 50% floor.
            ratio = total_years / general_years if general_years > 0 else 1.0
            score = min(0.85, ratio)
            log_match(f"   Experience: {total_years:.2f} < {general_years} → {score*100:.1f}%")
        
        return {
            "score": round(score, 4),
            "match_percentage": round(score * 100, 1),
            "type": "general",
            "total_years": round(total_years, 2),
            "required_years": general_years,
            "gap": round(max(0, general_years - total_years), 2)
        }
    
    def build_experience_analysis(self, candidate_experiences, job_requirements, job):
        """For EVERY candidate experience, compute its best semantic similarity to the
        job's requirements (or to the job role itself when there are no explicit
        requirements), whether it CONTRIBUTES (>= 50% similarity), the technologies it
        used, and a human-readable reason. Also returns total vs RELEVANT years so the
        UI can show 'Total Experience' and 'Relevant Experience' separately."""
        specific = job_requirements.get("specific_requirements", []) or []
        ref_texts = [r.get("cleaned", "") for r in specific if r.get("cleaned")]
        ref_titles = [r.get("title", "") for r in specific if r.get("title")]
        if not ref_texts:
            job_text = ' '.join(str(x) for x in [job.get('title', ''), job.get('description', '')] if x)
            ref_texts = [self.tp.clean(job_text)] if job_text.strip() else []
            ref_titles = [job.get('title', '') or 'this role']

        analysis = []
        relevant_years = 0.0
        for exp in candidate_experiences:
            best_sim = 0.0
            best_ref = ref_titles[0] if ref_titles else (job.get('title', '') or 'this role')
            for idx, ref in enumerate(ref_texts):
                if not ref:
                    continue
                sim = max(
                    self.tp.semantic_similarity(exp.get("cleaned", ""), ref),
                    self.tp.semantic_similarity(exp.get("cleaned_full", exp.get("cleaned", "")), ref),
                )
                if sim > best_sim:
                    best_sim = sim
                    best_ref = ref_titles[idx] if idx < len(ref_titles) else best_ref

            contributes = best_sim >= 0.5
            if contributes:
                relevant_years += exp.get("years", 0)

            techs = exp.get("skills") or []
            if not isinstance(techs, list):
                techs = [str(techs)]

            if contributes:
                reason = f"Relevant to \"{best_ref}\"- the role and its skills/responsibilities align with what this position requires."
            else:
                reason = "Not relevant to this role (semantic similarity below 50%); excluded from the Experience score."

            analysis.append({
                "title": exp.get("title", ""),
                "company": exp.get("company", ""),
                "years": exp.get("years", 0),
                "is_current": exp.get("is_current", False),
                "similarity": round(best_sim, 4),
                "matched_with": best_ref,
                "contributes": contributes,
                "technologies": [str(t) for t in techs][:12],
                "reason": reason,
            })

        analysis.sort(key=lambda a: a["similarity"], reverse=True)
        return {
            "experience_analysis": analysis,
            "relevant_years": round(relevant_years, 2),
        }

    def match(self, profile_data, job):
        candidate_experiences = self.extract_candidate_work_experience(profile_data)
        job_requirements = self.extract_job_experience_requirements(job)

        # Candidate's total experience (years)- included in every response so the UI
        # "Your Total Experience" is correct regardless of which matching path is used.
        total_years_all = round(sum(e.get("years", 0) for e in candidate_experiences), 2)

        # Per-experience semantic analysis: which experiences are relevant, why, and
        # how many years are RELEVANT (vs total). Drives the transparent UI.
        exp_breakdown = self.build_experience_analysis(candidate_experiences, job_requirements, job)
        relevant_years_all = exp_breakdown["relevant_years"]
        experience_analysis = exp_breakdown["experience_analysis"]

        log_candidate(f"   Candidate work experiences: {len(candidate_experiences)} positions")
        log_job(f"   Job specific requirements: {len(job_requirements['specific_requirements'])}")
        log_job(f"   Job general requirement: {job_requirements['general_min_years']}+ years")
        
        specific_result = self.match_specific_requirements(candidate_experiences, job_requirements)
        
        if specific_result:
            log_match(f"   Experience match (specific): {specific_result['match_percentage']}%")
            return {
                "score": specific_result["score"],
                "match_percentage": specific_result["match_percentage"],
                "match_type": "specific_requirements",
                "total_years": total_years_all,
                "relevant_years": relevant_years_all,
                "experience_analysis": experience_analysis,
                "specific_matches": specific_result.get("matches", []),
                "total_requirements": specific_result.get("total_requirements", 0),
                "matched_requirements": specific_result.get("matched_count", 0),
                "unmatched_requirements": specific_result.get("unmatched_requirements", []),
                "weight": 0.20,
                "weighted_score": round(specific_result["score"] * 0.20, 4)
            }
        
        general_result = self.match_general_requirement(candidate_experiences, job_requirements)
        
        if general_result:
            log_match(f"   Experience match (general): {general_result['match_percentage']}%")
            return {
                "score": general_result["score"],
                "match_percentage": general_result["match_percentage"],
                "match_type": "general_requirement",
                "total_years": general_result.get("total_years", 0),
                "relevant_years": relevant_years_all,
                "experience_analysis": experience_analysis,
                "required_years": general_result.get("required_years", 0),
                "gap": general_result.get("gap", 0),
                "weight": 0.20,
                "weighted_score": round(general_result["score"] * 0.20, 4)
            }
        
        # No explicit years/title requirement stated by the job- score from
        # RELEVANCE instead of a blanket 100%. build_experience_analysis()
        # already compared every experience against the job's own title +
        # description (its fallback reference text when there's nothing more
        # specific), so that similarity IS a real signal, not "nothing to
        # fail against." A candidate with no work experience, or whose past
        # roles have nothing in common with this one, should score low here
        # just like every other factor scores an empty/irrelevant profile
        # honestly- matches this file's own stated cold-start philosophy.
        best_similarity = max((a["similarity"] for a in experience_analysis), default=0.0)
        log_match(f"   Experience: No explicit requirement from DB- scored on relevance to the role ({best_similarity*100:.1f}%)")
        return {
            "score": best_similarity,
            "match_percentage": round(best_similarity * 100, 1),
            "match_type": "relevance_only",
            "total_years": total_years_all,
            "relevant_years": relevant_years_all,
            "experience_analysis": experience_analysis,
            "weight": 0.20,
            "weighted_score": round(best_similarity * 0.20, 4)
        }

class Factor4_PreferencesMatcher:
    def __init__(self, tp):
        self.tp = tp
    def extract_candidate_age(self, profile_data):
        """Extract candidate age from profile data"""
        dob = profile_data.get('profile', {}).get('personal_info', {}).get('date_of_birth')
        if dob:
            try:
                # Handle various date formats
                if isinstance(dob, str):
                    # Handle ISO format with Z
                    dob = dob.replace('Z', '+00:00')
                birth_date = datetime.fromisoformat(dob)
                today = datetime.now()
                age = today.year - birth_date.year
                # Adjust if birthday hasn't occurred yet this year
                if (today.month, today.day) < (birth_date.month, birth_date.day):
                    age -= 1
                return age
            except Exception as e:
                log_error(f"Error parsing date of birth: {e}")
                return None
        return None
    def extract_candidate_home_location(self, profile_data):
        """Candidate's actual residence (Rwanda province/district/sector/cell/
        village, or country/city for non-Rwandans) -- distinct from
        job_preferences.locations (where they'd LIKE to work). Both are
        folded into the same match pool in extract_candidate_preferences so
        a candidate who never set a location preference still gets scored
        against jobs near where they actually live."""
        personal = profile_data.get('profile', {}).get('personal_info', {})
        if personal.get('is_rwandan'):
            parts = [personal.get('sector'), personal.get('district'), personal.get('province'), 'Rwanda']
        else:
            parts = [personal.get('city'), personal.get('country')]
        return self.tp.clean(' '.join(p for p in parts if p))

    def extract_candidate_preferences(self, profile_data):
        job_prefs = profile_data.get('profile', {}).get('job_preferences', {})

        job_types = job_prefs.get('job_types', []) or job_prefs.get('preferred_job_types', [])
        locations = job_prefs.get('locations', []) or job_prefs.get('preferred_locations', [])
        industries = job_prefs.get('industries', []) or job_prefs.get('preferred_industries', [])
        languages = job_prefs.get('languages', []) or job_prefs.get('preferred_languages', [])
        
        salary_min = job_prefs.get('salary_min', 0) or job_prefs.get('expected_salary_min', 0)
        salary_max = job_prefs.get('salary_max', 0) or job_prefs.get('expected_salary_max', 0)
        
        try:
            salary_min = float(salary_min) if salary_min else 0
        except (ValueError, TypeError):
            salary_min = 0
        
        try:
            salary_max = float(salary_max) if salary_max else 0
        except (ValueError, TypeError):
            salary_max = 0
        
        home_location = self.extract_candidate_home_location(profile_data)
        pref_locations = [self.tp.clean(loc) for loc in locations]

        prefs = {
            "job_types": [self.tp.clean(jt) for jt in job_types],
            # No fallback to 'flexible' -- an unset preference must stay
            # empty so match() correctly falls into its "candidate has no
            # stated remote-work preference -> 0" branch, instead of a
            # fabricated 'flexible' value quietly earning real similarity
            # points against the job's work_arrangement for a preference
            # the candidate never actually set.
            "remote_preference": self.tp.clean(job_prefs.get('remote_work_preference') or ''),
            # Actual residence is appended (not swapped in), so a stated
            # preference still wins the "best pair" comparison when both
            # exist and disagree -- home location only fills the gap when
            # there's no explicit preference, or adds a second shot at a
            # match when there is one.
            "locations": pref_locations + ([home_location] if home_location and home_location not in pref_locations else []),
            "industries": [self.tp.clean(ind) for ind in industries],
            "languages": [self.tp.clean(lang) for lang in languages],
            "salary_min": salary_min,
            "salary_max": salary_max
        }

        log_candidate(f"   Preferred job types from DB: {prefs['job_types']}")
        log_candidate(f"   Remote preference from DB: {prefs['remote_preference']}")
        log_candidate(f"   Home location (actual residence): {home_location or 'not set'}")
        log_candidate(f"   Preferred locations from DB: {prefs['locations']}")
        log_candidate(f"   Preferred industries from DB: {prefs['industries']}")
        log_candidate(f"   Preferred languages from DB: {prefs['languages']}")
        log_candidate(f"   Salary expectation from DB: {prefs['salary_min']} - {prefs['salary_max']}")
        
        return prefs
    
    def parse_age_requirement(self, age_req_str):
        """Parse age requirement string from job posting."""
        if not age_req_str or not isinstance(age_req_str, str):
            return {"min_age": None, "max_age": None, "raw": age_req_str}
        
        age_req_clean = age_req_str.strip().lower()
        
        # No requirement cases
        no_requirement_keywords = ['not required', 'any', 'none', 'no requirement', 'n/a', 'any age']
        if any(keyword in age_req_clean for keyword in no_requirement_keywords):
            log_match(f"      Age requirement: '{age_req_str}' → No restriction")
            return {"min_age": None, "max_age": None, "raw": age_req_str}
        
        # Pattern 1: "XX+" or "Above XX" or "Over XX"
        patterns_above = [
            r'(\d+)\+', r'above\s+(\d+)', r'over\s+(\d+)',
            r'minimum\s+(\d+)', r'at least\s+(\d+)', r'(\d+)\s+or\s+older'
        ]
        
        for pattern in patterns_above:
            match = re.search(pattern, age_req_clean)
            if match:
                min_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Min age: {min_age}")
                return {"min_age": min_age, "max_age": None, "raw": age_req_str}
        
        # Pattern 2: "Under XX" or "Below XX"
        patterns_below = [
            r'under\s+(\d+)', r'below\s+(\d+)', r'less than\s+(\d+)',
            r'maximum\s+(\d+)', r'(\d+)\s+or\s+younger', r'up to\s+(\d+)'
        ]
        
        for pattern in patterns_below:
            match = re.search(pattern, age_req_clean)
            if match:
                max_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Max age: {max_age}")
                return {"min_age": None, "max_age": max_age, "raw": age_req_str}
        
        # Pattern 3: "XX-YY" or "XX to YY" (range)
        patterns_range = [
            r'(\d+)\s*-\s*(\d+)', r'(\d+)\s+to\s+(\d+)',
            r'between\s+(\d+)\s+and\s+(\d+)', r'from\s+(\d+)\s+to\s+(\d+)'
        ]
        
        for pattern in patterns_range:
            match = re.search(pattern, age_req_clean)
            if match:
                min_age = int(match.group(1))
                max_age = int(match.group(2))
                if min_age <= max_age:
                    log_match(f"      Age requirement: '{age_req_str}' → Range: {min_age}-{max_age}")
                    return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
        
        # Pattern 4: Exact age
        patterns_exact = [r'^(\d+)$', r'exactly\s+(\d+)', r'(\d+)\s+years old', r'age\s+(\d+)']
        
        for pattern in patterns_exact:
            match = re.search(pattern, age_req_clean)
            if match:
                exact_age = int(match.group(1))
                log_match(f"      Age requirement: '{age_req_str}' → Exact age: {exact_age}")
                return {"min_age": exact_age, "max_age": exact_age, "raw": age_req_str}
        
        # Fallback
        numbers = re.findall(r'(\d+)', age_req_clean)
        if numbers:
            min_age = int(numbers[0])
            max_age = int(numbers[-1]) if len(numbers) > 1 else None
            log_match(f"      Age requirement: '{age_req_str}' → Parsed as Min: {min_age}, Max: {max_age}")
            return {"min_age": min_age, "max_age": max_age, "raw": age_req_str}
        
        log_match(f"      Age requirement: '{age_req_str}' → Could not parse, treating as no restriction")
        return {"min_age": None, "max_age": None, "raw": age_req_str}
    
    def match_age(self, candidate_age, job_age_requirement):
        """Calculate age match score between candidate and job requirement."""
        if not job_age_requirement or job_age_requirement.lower() in ['not required', 'any', '']:
            log_match(f"   Age: No requirement from DB — excluded from scoring, weight redistributed")
            return {"score": 0.0, "match_percentage": 0.0, "applicable": False, "details": "No age requirement"}

        if candidate_age is None:
            log_match(f"   Age: Job requires an age range, candidate age unknown → 0.00 (no evidence of meeting it)")
            return {"score": 0.0, "match_percentage": 0.0, "applicable": True, "details": "Candidate age not provided"}

        age_rule = self.parse_age_requirement(job_age_requirement)
        
        meets_min = True
        meets_max = True
        min_age = age_rule.get("min_age")
        max_age = age_rule.get("max_age")
        
        if min_age is not None and candidate_age < min_age:
            meets_min = False
            log_match(f"   Age: Candidate {candidate_age} < required min {min_age}")
        
        if max_age is not None and candidate_age > max_age:
            meets_max = False
            log_match(f"   Age: Candidate {candidate_age} > required max {max_age}")
        
        if meets_min and meets_max:
            if min_age is not None and max_age is not None:
                center = (min_age + max_age) / 2
                distance = abs(candidate_age - center)
                range_half = (max_age - min_age) / 2
                if range_half > 0:
                    score = max(0.5, 1.0 - (distance / range_half) * 0.5)
                else:
                    score = 1.0
            else:
                score = 1.0
            log_match(f"   Age: Candidate {candidate_age} meets requirement → {score*100:.0f}%")
            return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "applicable": True, "details": "Age requirement met"}
        else:
            penalty = 0.0
            if min_age is not None and candidate_age < min_age:
                gap = min_age - candidate_age
                penalty = min(0.5, gap / min_age * 0.5)
            elif max_age is not None and candidate_age > max_age:
                gap = candidate_age - max_age
                penalty = min(0.5, gap / max_age * 0.5)
            
            score = max(0.3, 1.0 - penalty)
            log_match(f"   Age: Candidate {candidate_age} does NOT meet requirement → {score*100:.0f}%")
            return {"score": round(score, 4), "match_percentage": round(score * 100, 1), "applicable": True, "details": f"Age {candidate_age} does not meet requirement"}
    
    # ============================================
    # SINGLE MATCH METHOD (NO DUPLICATE)
    # ============================================
    def match(self, candidate_prefs, job, candidate_age=None, job_age_requirement=None):
        missing_job_data = []
        
        # ============================================
        # AGE MATCH
        # ============================================
        age_match = self.match_age(candidate_age, job_age_requirement)
        
        job_type_raw = job.get('job_type', '')
        job_type = self.tp.clean(job_type_raw) if job_type_raw else ''
        if not job_type:
            missing_job_data.append("job_type")
            job_type = 'full-time'
        
        job_remote_raw = job.get('work_arrangement', '')
        job_remote = self.tp.clean(job_remote_raw) if job_remote_raw else ''
        if not job_remote:
            missing_job_data.append("work_arrangement")
        
        job_industry_raw = job.get('company_industry', '')
        job_industry = self.tp.clean(job_industry_raw) if job_industry_raw else ''
        if not job_industry:
            missing_job_data.append("industry")
        
        job_locations = []
        for loc in job.get('locations', []):
            if isinstance(loc, dict):
                city = loc.get('city', '')
                country = loc.get('country', '')
                if city or country:
                    job_locations.append(self.tp.clean(f"{city} {country}"))
        if not job_locations:
            missing_job_data.append("locations")
        
        job_languages = []
        lang_reqs = job.get('language_requirements', [])
        if isinstance(lang_reqs, str):
            try:
                lang_reqs = json.loads(lang_reqs)
            except:
                lang_reqs = []
        for lang in lang_reqs:
            if isinstance(lang, dict):
                lang_name = lang.get('name', '')
                if lang_name:
                    job_languages.append(self.tp.clean(lang_name))
            elif isinstance(lang, str):
                if lang:
                    job_languages.append(self.tp.clean(lang))
        if not job_languages:
            missing_job_data.append("languages")
        
        job_salary_min = 0
        job_salary_max = 0
        try:
            job_salary_min = float(job.get('salary_min', 0)) if job.get('salary_min') else 0
            job_salary_max = float(job.get('salary_max', 0)) if job.get('salary_max') else 0
        except (ValueError, TypeError):
            pass
        
        if job_salary_min == 0 and job_salary_max == 0:
            missing_job_data.append("salary")
        
        log_job(f"   Missing job data: {missing_job_data if missing_job_data else 'None'}")
        
        # Type match
        type_match = 0.0
        type_scores_detail = []
        type_match_note = None
        has_type_requirement = bool(job_type_raw)

        if not has_type_requirement:
            type_match_note = "Job type not specified by employer"
            log_match(f"   Job type: Not specified by employer — excluded from scoring")
        else:
            if candidate_prefs["job_types"]:
                type_scores = []
                for pt in candidate_prefs["job_types"]:
                    sim = self.tp.semantic_similarity(pt, job_type)
                    type_scores.append(sim)
                    type_scores_detail.append({"preference": pt, "job_value": job_type, "similarity": round(sim, 4)})
                    log_match(f"      Job type '{pt}' vs '{job_type}': {sim:.2f}")
                type_match = max(type_scores) if type_scores else 0.0
            else:
                type_match = 0.0
                type_match_note = "Candidate has no stated job-type preference"
            log_match(f"   Job type match: {type_match:.2f}")
        
        # Remote match
        remote_match = 0.0
        remote_match_note = None
        has_remote_requirement = bool(job_remote_raw)

        if not has_remote_requirement:
            remote_match_note = "Remote work not specified by employer"
            log_match(f"   Remote work: Not specified by employer — excluded from scoring")
        else:
            if candidate_prefs["remote_preference"]:
                remote_match = self.tp.semantic_similarity(candidate_prefs["remote_preference"], job_remote)
                log_match(f"      Remote preference '{candidate_prefs['remote_preference']}' vs '{job_remote}': {remote_match:.2f}")
            else:
                remote_match = 0.0
                remote_match_note = "Candidate has no stated remote-work preference"
            log_match(f"   Remote work match: {remote_match:.2f}")
        
        # Location match
        location_match = 0.0
        location_match_detail = None
        location_match_note = None
        has_location_requirement = bool(job_locations)

        if not has_location_requirement:
            location_match_note = "Location not specified by employer"
            log_match(f"   Location: Not specified by employer — excluded from scoring")
        else:
            if candidate_prefs["locations"]:
                best = 0.0
                best_pair = None
                for pl in candidate_prefs["locations"]:
                    for jl in job_locations:
                        sim = self.tp.semantic_similarity(pl, jl)
                        if sim > best:
                            best = sim
                            best_pair = (pl, jl)
                        log_match(f"      Location '{pl}' vs '{jl}': {sim:.2f}")
                location_match = best
                if best_pair:
                    location_match_detail = {"candidate_location": best_pair[0], "job_location": best_pair[1], "similarity": round(location_match, 4)}
                    log_match(f"      Best location match: '{best_pair[0]}' vs '{best_pair[1]}' = {location_match:.2f}")
            else:
                location_match = 0.0
                location_match_note = "Candidate has no stated location preference or home location on file"
            log_match(f"   Location match: {location_match:.2f}")
        
        # Industry match
        industry_match = 0.0
        industry_scores_detail = []
        industry_match_note = None
        has_industry_requirement = bool(job_industry_raw)

        if not has_industry_requirement:
            industry_match_note = "Industry not specified by employer"
            log_match(f"   Industry: Not specified by employer — excluded from scoring")
        else:
            if candidate_prefs["industries"]:
                ind_scores = []
                for ind in candidate_prefs["industries"]:
                    sim = self.tp.semantic_similarity(ind, job_industry)
                    ind_scores.append(sim)
                    industry_scores_detail.append({"preference": ind, "job_value": job_industry, "similarity": round(sim, 4)})
                    log_match(f"      Industry '{ind}' vs '{job_industry}': {sim:.2f}")
                industry_match = max(ind_scores) if ind_scores else 0.0
            else:
                industry_match = 0.0
                industry_match_note = "Candidate has no stated industry preference"
            log_match(f"   Industry match: {industry_match:.2f}")
        
        # Salary match
        salary_match = 0.0
        salary_detail = {}
        salary_match_note = None
        has_salary_requirement = not (job_salary_min == 0 and job_salary_max == 0)

        if not has_salary_requirement:
            salary_match_note = "Salary not specified by employer"
            log_match(f"   Salary: Not specified by employer — excluded from scoring")
        else:
            candidate_salary_max = candidate_prefs.get("salary_max", 0)
            candidate_salary_min = candidate_prefs.get("salary_min", 0)
            
            try:
                candidate_salary_max = float(candidate_salary_max) if candidate_salary_max else 0
                candidate_salary_min = float(candidate_salary_min) if candidate_salary_min else 0
            except (ValueError, TypeError):
                candidate_salary_max = 0
                candidate_salary_min = 0
            
            log_match(f"      Job salary range: {job_salary_min} - {job_salary_max}")
            log_match(f"      Candidate salary expectation: {candidate_salary_min} - {candidate_salary_max}")
            
            if job_salary_min > 0 and candidate_salary_max > 0:
                if job_salary_min <= candidate_salary_max:
                    salary_match = 1.0
                    log_match(f"      Salary match: Job min <= Candidate max → 1.00")
                else:
                    diff = job_salary_min - candidate_salary_max
                    salary_match = max(0.3, 1.0 - (diff / candidate_salary_max))
                    log_match(f"      Salary match: Job min > Candidate max by {diff} → {salary_match:.2f}")
            elif job_salary_max > 0 and candidate_salary_min > 0:
                if candidate_salary_min <= job_salary_max:
                    salary_match = 1.0
                else:
                    diff = candidate_salary_min - job_salary_max
                    salary_match = max(0.3, 1.0 - (diff / candidate_salary_min))
            else:
                salary_match = 0.0
                salary_match_note = "Candidate has no comparable salary expectation on file"
                log_match(f"      Salary match: Job posted a range, candidate has no salary expectation on file → 0.00")

            salary_detail = {
                "job_min": job_salary_min,
                "job_max": job_salary_max,
                "candidate_min": candidate_salary_min,
                "candidate_max": candidate_salary_max,
                "match_score": round(salary_match, 4)
            }
            log_match(f"   Salary match: {salary_match:.2f}")
        
        # Language match
        language_match = 0.0
        language_matches_detail = []
        language_match_note = None
        has_language_requirement = bool(job_languages)

        if not has_language_requirement:
            language_match_note = "Languages not specified by employer"
            log_match(f"   Languages: Not specified by employer — excluded from scoring")
        else:
            if candidate_prefs["languages"]:
                matches = 0
                for jl in job_languages:
                    matched = False
                    for lang in candidate_prefs["languages"]:
                        sim = self.tp.semantic_similarity(lang, jl)
                        log_match(f"      Language '{lang}' vs '{jl}': {sim:.2f}")
                        if sim >= 0.7:
                            matches += 1
                            matched = True
                            language_matches_detail.append({"required": jl, "matched_with": lang, "similarity": round(sim, 4)})
                            break
                    if not matched:
                        language_matches_detail.append({"required": jl, "matched_with": None, "similarity": 0})
                language_match = matches / len(job_languages) if job_languages else 0.0
                log_match(f"      Language match: {matches}/{len(job_languages)} languages matched = {language_match:.2f}")
            else:
                language_match = 0.0
                language_match_note = "Candidate has no stated language preference"
                log_match(f"      No language preferences specified → 0.00")
            log_match(f"   Language match: {language_match:.2f}")
        
        # ============================================
        # WEIGHTS -- base allocation is age 5%, type 19%, remote 19%,
        # location/industry/salary/language 14.25% each (i.e. the old
        # "20/20/15/15/15/15 of the remaining 95%" split, flattened to
        # fractions of 1.0). Any dimension the job didn't actually specify a
        # requirement for is EXCLUDED here (not scored, not given free
        # credit) and its weight is redistributed across the dimensions
        # that ARE applicable -- same pattern as HybridWeights.normalized().
        # ============================================
        has_age_requirement = age_match.get("applicable", False)

        pref_weights = redistribute_weights({
            "age":      (has_age_requirement, 0.05),
            "type":     (has_type_requirement, 0.19),
            "remote":   (has_remote_requirement, 0.19),
            "location": (has_location_requirement, 0.1425),
            "industry": (has_industry_requirement, 0.1425),
            "salary":   (has_salary_requirement, 0.1425),
            "language": (has_language_requirement, 0.1425),
        })

        final_score = (type_match * pref_weights["type"]
                       + remote_match * pref_weights["remote"]
                       + location_match * pref_weights["location"]
                       + industry_match * pref_weights["industry"]
                       + salary_match * pref_weights["salary"]
                       + language_match * pref_weights["language"]
                       + age_match["score"] * pref_weights["age"])

        excluded_dimensions = [name for name, applicable in (
            ("age", has_age_requirement), ("type", has_type_requirement), ("remote", has_remote_requirement),
            ("location", has_location_requirement), ("industry", has_industry_requirement),
            ("salary", has_salary_requirement), ("language", has_language_requirement)
        ) if not applicable]
        preferences_applicable = len(excluded_dimensions) < 7

        log_match(f"   ============================================")
        log_match(f"   PREFERENCE SCORES BREAKDOWN (weights after redistribution):")
        log_match(f"      Type Match:     {type_match:.2f} × {pref_weights['type']:.3f} = {type_match * pref_weights['type']:.3f}")
        log_match(f"      Remote Match:   {remote_match:.2f} × {pref_weights['remote']:.3f} = {remote_match * pref_weights['remote']:.3f}")
        log_match(f"      Location Match: {location_match:.2f} × {pref_weights['location']:.3f} = {location_match * pref_weights['location']:.3f}")
        log_match(f"      Industry Match: {industry_match:.2f} × {pref_weights['industry']:.3f} = {industry_match * pref_weights['industry']:.3f}")
        log_match(f"      Salary Match:   {salary_match:.2f} × {pref_weights['salary']:.3f} = {salary_match * pref_weights['salary']:.3f}")
        log_match(f"      Language Match: {language_match:.2f} × {pref_weights['language']:.3f} = {language_match * pref_weights['language']:.3f}")
        log_match(f"      Age Match:      {age_match['score']:.2f} × {pref_weights['age']:.3f} = {age_match['score'] * pref_weights['age']:.3f}")
        log_match(f"      Excluded (no job requirement): {excluded_dimensions or 'none'}")
        log_match(f"   TOTAL: {final_score:.4f} ({final_score*100:.1f}%)")

        return {
            "score": round(final_score, 4), 
            "match_percentage": round(final_score * 100, 1),
            "missing_job_data": missing_job_data,
            "type_match": round(type_match, 4),
            "type_match_details": type_scores_detail,
            "type_match_note": type_match_note,
            "remote_match": round(remote_match, 4),
            "remote_match_note": remote_match_note,
            "location_match": round(location_match, 4),
            "location_match_details": location_match_detail,
            "location_match_note": location_match_note,
            "industry_match": round(industry_match, 4),
            "industry_match_details": industry_scores_detail,
            "industry_match_note": industry_match_note,
            "salary_match": round(salary_match, 4),
            "salary_match_details": salary_detail,
            "salary_match_note": salary_match_note,
            "language_match": round(language_match, 4),
            "language_match_details": language_matches_detail,
            "language_match_note": language_match_note,
            "age_match": round(age_match["score"], 4),
            "age_match_percentage": round(age_match["score"] * 100, 1),
            "age_match_details": age_match.get("details", ""),
            "applicable": preferences_applicable,
            "excluded_dimensions": excluded_dimensions,
            "redistributed_weights": pref_weights,
            "weight": 0.15,
            "weighted_score": round(final_score * 0.15, 4)
        }

def extract_all_job_fields(job: Dict) -> Dict:
    """Extract ALL job fields from the database response - 70+ fields"""
    
    # Parse locations
    locations = job.get('locations', [])
    if isinstance(locations, str):
        try:
            locations = json.loads(locations)
        except:
            locations = []
    
    location_details = []
    for loc in locations:
        if isinstance(loc, dict):
            location_details.append({
                "city": loc.get('city', ''),
                "country": loc.get('country', ''),
                "state": loc.get('state', ''),
                "postal_code": loc.get('postal_code', ''),
                "is_remote": loc.get('is_remote', False),
            })
        elif isinstance(loc, str):
            location_details.append({"city": loc, "country": "", "is_remote": False})
    
    # Parse skills arrays
    skills_required = job.get('skills_required', [])
    if isinstance(skills_required, str):
        try:
            skills_required = json.loads(skills_required)
        except:
            skills_required = []
    
    skills_preferred = job.get('skills_preferred', [])
    if isinstance(skills_preferred, str):
        try:
            skills_preferred = json.loads(skills_preferred)
        except:
            skills_preferred = []
    
    # Parse education required with proper handling
    education_required = job.get('education_required', {})
    if isinstance(education_required, str):
        try:
            education_required = json.loads(education_required)
        except:
            education_required = {}
    
    # Ensure arrays are properly formatted
    if 'certifications' not in education_required:
        education_required['certifications'] = []
    if 'languages' not in education_required:
        education_required['languages'] = []
    if 'experience_requirements' not in education_required:
        education_required['experience_requirements'] = []
    if 'additional_requirements' not in education_required:
        education_required['additional_requirements'] = []
    if 'fields_of_study' not in education_required:
        education_required['fields_of_study'] = []
    
    # Parse benefits
    benefits = job.get('benefits', [])
    if isinstance(benefits, str):
        try:
            benefits = json.loads(benefits)
        except:
            benefits = []
    
    # Parse responsibilities
    responsibilities = job.get('responsibilities', [])
    if isinstance(responsibilities, str):
        try:
            responsibilities = json.loads(responsibilities)
        except:
            responsibilities = []
    
    # Parse requirements
    requirements = job.get('requirements', [])
    if isinstance(requirements, str):
        try:
            requirements = json.loads(requirements)
        except:
            requirements = []
    
    # Parse screening questions
    screening_questions = job.get('screening_questions', [])
    if isinstance(screening_questions, str):
        try:
            screening_questions = json.loads(screening_questions)
        except:
            screening_questions = []
    
    # Parse language requirements
    language_requirements = job.get('language_requirements', [])
    if isinstance(language_requirements, str):
        try:
            language_requirements = json.loads(language_requirements)
        except:
            language_requirements = []
    
    # Parse tags
    tags = job.get('tags', [])
    if isinstance(tags, str):
        try:
            tags = json.loads(tags)
        except:
            tags = []
    
    # Parse documents
    documents = job.get('documents', [])
    if isinstance(documents, str):
        try:
            documents = json.loads(documents)
        except:
            documents = []
    
    # Parse metadata
    metadata = job.get('metadata', {})
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except:
            metadata = {}
    
    # Parse experience requirements
    experience_requirements = job.get('experience_requirements', [])
    if isinstance(experience_requirements, str):
        try:
            experience_requirements = json.loads(experience_requirements)
        except:
            experience_requirements = []
    
    # Parse education requirements
    education_requirements = job.get('education_requirements', {})
    if isinstance(education_requirements, str):
        try:
            education_requirements = json.loads(education_requirements)
        except:
            education_requirements = {}
    
    # Parse skill experience requirements
    skill_experience_requirements = job.get('skill_experience_requirements', {})
    if isinstance(skill_experience_requirements, str):
        try:
            skill_experience_requirements = json.loads(skill_experience_requirements)
        except:
            skill_experience_requirements = {}
    
    # Parse company industries
    company_industries = job.get('company_industries', [])
    if isinstance(company_industries, str):
        try:
            company_industries = json.loads(company_industries)
        except:
            company_industries = []
    
    # Parse company headquarters
    headquarters = job.get('company_headquarters_location', {})
    if isinstance(headquarters, str):
        try:
            headquarters = json.loads(headquarters)
        except:
            headquarters = {}
    
    # Parse company culture
    company_culture = job.get('company_culture', {})
    if isinstance(company_culture, str):
        try:
            company_culture = json.loads(company_culture)
        except:
            company_culture = {}
    
    # Parse company values
    company_values = job.get('company_values', [])
    if isinstance(company_values, str):
        try:
            company_values = json.loads(company_values)
        except:
            company_values = []
    
    # Parse company social links
    company_social_links = job.get('company_social_links', {})
    if isinstance(company_social_links, str):
        try:
            company_social_links = json.loads(company_social_links)
        except:
            company_social_links = {}
            
    education_required = job.get('education_required', {})
    
    
     #  CRITICAL: Extract age requirement
    age_requirement = education_required.get('age_requirement', '')
    if not age_requirement:
        age_requirement = education_required.get('age_requirement_text', '')
    
    # Return COMPLETE job object
    return {
        "id": job.get('id', ''),
        "external_id": job.get('external_id', ''),
        "title": job.get('title', 'Unknown'),
        "slug": job.get('slug', ''),
        "department": job.get('department', ''),
        "team": job.get('team', ''),
        "job_type": job.get('job_type', 'full-time'),
        "work_arrangement": job.get('work_arrangement', ''),
        "locations": location_details,
        "description": job.get('description', ''),
        "summary": job.get('summary', ''),
        "responsibilities": responsibilities,
        "qualifications": job.get('qualifications', ''),
        "preferred_qualifications": job.get('preferred_qualifications', ''),
        "requirements": requirements,
        "salary_min": float(job.get('salary_min', 0)) if job.get('salary_min') else 0,
        "salary_max": float(job.get('salary_max', 0)) if job.get('salary_max') else 0,
        "salary_currency": job.get('salary_currency', 'Rwf'),
        "salary_period": job.get('salary_period', 'month'),
        "salary_visible": job.get('salary_visible', True),
        "benefits": benefits,
        "skills_required": skills_required,
        "skills_preferred": skills_preferred,
        "experience_min": int(job.get('experience_min', 0)) if job.get('experience_min') else 0,
        "experience_max": int(job.get('experience_max', 0)) if job.get('experience_max') else 0,
        "experience_level": job.get('experience_level', 'entry'),
        "experience_requirements": experience_requirements,
        "education_required": education_required,
        "education_requirements": education_requirements,
        "language_requirements": language_requirements,
        "skill_experience_requirements": skill_experience_requirements,
        "screening_questions": screening_questions,
        "application_instructions": job.get('application_instructions', ''),
        "documents": documents,
        "department_info": job.get('department_info', ''),
        "tags": tags,
        "application_limit": int(job.get('application_limit', 0)) if job.get('application_limit') else 0,
        "ai_match_required_score": int(job.get('ai_match_required_score', 70)) if job.get('ai_match_required_score') else 70,
        "ai_score": job.get('ai_score', {}),
        "status": job.get('status', 'active'),
        "visibility": job.get('visibility', 'public'),
        "published_at": job.get('published_at'),
        "expires_at": job.get('expires_at'),
        "paused_at": job.get('paused_at'),
        "closed_at": job.get('closed_at'),
        "created_at": job.get('created_at'),
        "updated_at": job.get('updated_at'),
        "created_by": job.get('created_by'),
        "approved_by": job.get('approved_by'),
        "approved_at": job.get('approved_at'),
        "view_count": _safe_int(job.get('view_count')),
        "application_count": _safe_int(job.get('application_count')),
        "metadata": metadata,
        "deleted_at": job.get('deleted_at'),
        "education_required": education_required, 
         "age_requirement": age_requirement,  #  ADD THIS
        "company": {
            "id": job.get('company_id', ''),
            "name": job.get('company_name', 'Unknown'),
            "legal_name": job.get('company_legal_name', ''),
            "slug": job.get('company_slug', ''),
            "industry": job.get('company_industry', ''),
            "industries": company_industries,
            "size": job.get('company_size', ''),
            "founded_year": job.get('company_founded_year'),
            "headquarters": headquarters,
            "website": job.get('company_website', ''),
            "description": job.get('company_description', ''),
            "short_description": job.get('company_short_description', ''),
            "mission": job.get('company_mission', ''),
            "vision": job.get('company_vision', ''),
            "values": company_values,
            "culture": company_culture,
            "logo_url": job.get('company_logo_url', ''),
            "logo_key": job.get('company_logo_key', ''),
            "banner_url": job.get('company_banner_url', ''),
            "banner_key": job.get('company_banner_key', ''),
            "social_links": company_social_links,
            "verified": job.get('company_verified', False),
            "verification_status": job.get('company_verification_status', ''),
            "verification_level": job.get('company_verification_level', ''),
            "verified_at": job.get('company_verified_at'),
            "domain": job.get('company_domain', ''),
            "tax_id": job.get('company_tax_id', ''),
            "registration_number": job.get('company_registration_number', '')
        }
    }

def extract_complete_candidate_data(profile_data: Dict) -> Dict:
    """Extract ALL candidate fields for frontend display"""
    
    profile = profile_data.get('profile', {})
    personal_info = profile.get('personal_info', {})
    links = profile.get('links', {})
    work_prefs = profile.get('work_preferences', {})
    statistics = profile_data.get('statistics', {})
    applications_summary = profile_data.get('applications_summary', {})
    simulations_summary = profile_data.get('simulations_summary', {})
    job_prefs = profile.get('job_preferences', {})
    
    return {
        "id": personal_info.get('user_id', ''),
        "email": personal_info.get('email', ''),
        "full_name": personal_info.get('full_name', 'Unknown'),
        "first_name": personal_info.get('first_name', ''),
        "last_name": personal_info.get('last_name', ''),
        "headline": personal_info.get('headline', ''),
        "summary": personal_info.get('summary', ''),
        "phone": personal_info.get('phone', ''),
        "date_of_birth": personal_info.get('date_of_birth'),
        "gender": personal_info.get('gender'),
        "profile_photo_url": personal_info.get('profile_photo_url', ''),
        "joined_date": personal_info.get('joined_date'),
        "last_login": personal_info.get('last_login'),
        "user_status": personal_info.get('user_status'),
        "user_type": personal_info.get('user_type'),
        "two_factor_enabled": personal_info.get('two_factor_enabled'),
        "terms_accepted_at": personal_info.get('terms_accepted_at'),
        "terms_version": personal_info.get('terms_version'),
        "location": {
            "country": personal_info.get('country', ''),
            "city": personal_info.get('city', ''),
            "timezone": personal_info.get('timezone', '')
        },
        "social_links": {
            "linkedin": links.get('linkedin', ''),
            "github": links.get('github', ''),
            "portfolio": links.get('portfolio', ''),
            "website": links.get('website', '')
        },
        "work_preferences": {
            "willing_to_relocate": work_prefs.get('willing_to_relocate', False),
            "willing_to_travel": work_prefs.get('willing_to_travel', False),
            "notice_period_days": work_prefs.get('notice_period_days', 0),
            "expected_salary": work_prefs.get('expected_salary', {}),
            "current_salary": work_prefs.get('current_salary', {}),
            "currency": work_prefs.get('currency', 'USD')
        },
        "languages": profile.get('languages', []),
        "privacy_settings": profile.get('privacy_settings', {}),
        "job_preferences": {
            "job_types": job_prefs.get('job_types', []) or job_prefs.get('preferred_job_types', []),
            "preferred_job_types": job_prefs.get('preferred_job_types', []) or job_prefs.get('job_types', []),
            "locations": job_prefs.get('locations', []) or job_prefs.get('preferred_locations', []),
            "preferred_locations": job_prefs.get('preferred_locations', []) or job_prefs.get('locations', []),
            "industries": job_prefs.get('industries', []) or job_prefs.get('preferred_industries', []),
            "preferred_industries": job_prefs.get('preferred_industries', []) or job_prefs.get('industries', []),
            "languages": job_prefs.get('languages', []) or job_prefs.get('preferred_languages', []),
            "preferred_languages": job_prefs.get('preferred_languages', []) or job_prefs.get('languages', []),
            "remote_work_preference": job_prefs.get('remote_work_preference', 'flexible'),
            "salary_min": job_prefs.get('salary_min', 0) or job_prefs.get('expected_salary_min', 0),
            "salary_max": job_prefs.get('salary_max', 0) or job_prefs.get('expected_salary_max', 0),
            "salary_currency": job_prefs.get('salary_currency', 'Rwf'),
            "availability_status": job_prefs.get('availability_status', 'actively_looking'),
            "availability_date": job_prefs.get('availability_date'),
            "keywords": job_prefs.get('keywords', ''),
            "job_level": job_prefs.get('job_level', 'entry')
        },
        "availability": profile.get('availability', {}),
        "metadata": profile.get('metadata', {}),
        "timestamps": {
            "profile_created": profile.get('created_at'),
            "profile_updated": profile.get('updated_at')
        },
        "statistics": {
            "total_years_experience": statistics.get('total_years_experience', 0),
            "current_job_years": statistics.get('current_job_years', 0),
            "most_recent_job": statistics.get('most_recent_job'),
            "total_skills": statistics.get('total_skills', 0),
            "total_education": statistics.get('total_education_entries', 0),
            "total_work_experience": statistics.get('total_work_experience', 0),
            "total_certifications": statistics.get('total_certifications', 0),
            "total_portfolio_links": statistics.get('total_portfolio_links', 0),
            "total_resumes": statistics.get('total_resumes', 0),
            "top_skills": statistics.get('top_skills', []),
            "skill_distribution": statistics.get('skill_distribution', {}),
            "saved_jobs_count": statistics.get('saved_jobs_count', 0),
            "profile_completion": statistics.get('profile_completion', {})
        },
        "applications_summary": {
            "total": applications_summary.get('total', 0),
            "submitted": applications_summary.get('submitted', 0),
            "under_review": applications_summary.get('under_review', 0),
            "interviewing": applications_summary.get('interviewing', 0),
            "offers": applications_summary.get('offers', 0),
            "hired": applications_summary.get('hired', 0),
            "rejected": applications_summary.get('rejected', 0)
        },
        "simulations_summary": {
            "total": simulations_summary.get('total', 0),
            "completed": simulations_summary.get('completed', 0),
            "in_progress": simulations_summary.get('in_progress', 0),
            "average_score": simulations_summary.get('average_score', 0)
        },
        "education": profile_data.get('education', []),
        "work_experience": profile_data.get('work_experience', []),
        "skills": profile_data.get('skills', []),
        "certifications": profile_data.get('certifications', []),
        "portfolio_links": profile_data.get('portfolio_links', []),
        "resumes": profile_data.get('resumes', [])
    }

class BackendClient:
    def __init__(self):
        self.base_url = BASE_URL
        self.headers = {"Content-Type": "application/json"}
    
    def get_profile(self, candidate_id):
        try:
            log_info(f"🔍 Calling backend API for candidate: {candidate_id}")
            log_info(f"   URL: {self.base_url}/candidates/full-profile/{candidate_id}")
            
            resp = requests.get(
                f"{self.base_url}/candidates/full-profile/{candidate_id}", 
                headers=self.headers, 
                timeout=BACKEND_REQUEST_TIMEOUT
            )
            
            log_info(f"📊 Response status: {resp.status_code}")
            log_info(f"📊 Response body: {resp.text[:500] if resp.text else 'Empty'}")
            
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return data
                else:
                    log_error(f"❌ API returned success=false: {data.get('message')}")
                    return None
            else:
                log_error(f"❌ HTTP {resp.status_code}: {resp.text}")
                return None
                
        except Exception as e:
            log_error(f"❌ Profile error: {e}")
            return None
    
    def get_jobs(self):
        """Fetches every active job, not just the endpoint's default first page.
        /jobs/candidate/list paginates (default limit=20, max=100) since it's built
        for candidates browsing the UI- the matcher needs the full set so it scores
        every job the hybrid recommender sees, not just the 20 most recent."""
        all_jobs = []
        page = 1
        page_size = 100
        try:
            while True:
                resp = requests.get(
                    f"{self.base_url}/jobs/candidate/list",
                    params={"page": page, "limit": page_size},
                    headers=self.headers,
                    timeout=BACKEND_REQUEST_TIMEOUT,
                )
                if resp.status_code != 200:
                    break
                data = resp.json()
                if not (data.get("success") and data.get("data")):
                    break
                jobs_data = data["data"]
                page_jobs = jobs_data.get("data") if isinstance(jobs_data, dict) else jobs_data
                if not page_jobs:
                    break
                all_jobs.extend(page_jobs)

                pagination = jobs_data.get("pagination") if isinstance(jobs_data, dict) else None
                if not pagination or not pagination.get("has_next_page"):
                    break
                page += 1
            return all_jobs
        except Exception as e:
            log_error(f"Jobs error: {e}")
            return all_jobs
    
    def get_job_by_id(self, job_id: str):
        """Get a single job by ID from the database"""
        try:
            resp = requests.get(f"{self.base_url}/jobs/candidate/{job_id}", headers=self.headers, timeout=BACKEND_REQUEST_TIMEOUT)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("success") and data.get("data"):
                    return data["data"]
            return None
        except Exception as e:
            log_error(f"Get job by ID error: {e}")
            return None

def _collect_skill_terms(profile_data, jobs):
    """Gather raw skill names from the candidate and the job(s) to seed the dynamic
    typo-correction vocabulary (no hardcoded skill list)."""
    terms = []
    for s in profile_data.get('skills', []) or []:
        terms.append(s.get('skill_name') or s.get('name') or '')
    for w in profile_data.get('work_experience', []) or []:
        sk = w.get('skills') or []
        if isinstance(sk, list):
            terms.extend([str(x) for x in sk])
    job_list = jobs if isinstance(jobs, list) else [jobs]
    for j in job_list:
        if not isinstance(j, dict):
            continue
        for key in ('skills_required', 'skills_preferred'):
            for sk in j.get(key, []) or []:
                terms.append(sk.get('name') if isinstance(sk, dict) else str(sk))
    return terms


def build_match_narrative(skills, quals, exp, total_score, job):
    """Compose a transparent 'why this score' explanation and concrete improvement
    suggestions from the four factor results- so the UI shows reasoning, not just
    numbers. Returns (explanation_text, improvement_suggestions)."""
    job_title = job.get('title') or 'this role'
    matched = skills.get('matched_skills', []) or []
    missing = skills.get('missing_skills', []) or []
    parts = []

    sp = skills.get('match_percentage', 0) or 0
    if sp >= 80 and matched:
        parts.append(f"The candidate has strong technical alignment, matching {len(matched)} of the required skills ({', '.join(matched[:4])}).")
    elif matched:
        parts.append(f"The candidate matches {len(matched)} required skill(s) ({', '.join(matched[:4])}), with room to grow.")
    else:
        parts.append("Few of the required technical skills were found in the candidate profile.")

    rel = exp.get('relevant_years', 0) or 0
    tot = exp.get('total_years', 0) or 0
    if rel > 0:
        parts.append(f"Of {tot} year(s) of total experience, about {rel} year(s) are directly relevant to {job_title}, based on semantic matching of past roles.")
    elif tot > 0:
        parts.append(f"The candidate has {tot} year(s) of experience, though little of it is directly relevant to {job_title}.")

    if quals.get('explanation'):
        parts.append(str(quals.get('explanation')))
    elif quals.get('match_quality'):
        parts.append(f"Education match is rated {quals.get('match_quality')}.")

    if missing:
        parts.append(f"The candidate is missing {', '.join(missing[:3])}, which reduced the final score.")

    return ' '.join(parts), list(missing[:6])

async def parse_candidate_id_request(request: Request):
    body = await request.body()
    data = json.loads(body.decode('utf-8')) if body else {}
    forbidden_fields = [field for field in ("username", "email", "password") if data.get(field)]

    if forbidden_fields:
        return None, {
            "success": False,
            "error": "Do not send username, email, or password. Send only candidate_id."
        }

    return data.get("candidate_id"), None


# ==========================================================================
# END MATCHER SUBSYSTEM (route handlers + instantiation are further below,
# after `engine` exists, since LocalTextProcessor needs engine.semantic_encoder)
# ==========================================================================

class SemanticEncoder:
    MODEL_NAME = "all-MiniLM-L6-v2"

    def __init__(self, retries: int = 3, retry_delay: float = 3.0):
        self.model = None
        self._cache: Dict[str, np.ndarray] = {}
        # gateway.py starts every microservice in parallel- ai_job_matcher_og.py
        # loads this SAME cached model at roughly the same moment, and on Windows
        # that concurrent access to the HuggingFace cache can transiently fail
        # ("does not appear to have a file named ...") even though the files are
        # genuinely present; a short retry rides out that race instead of
        # permanently degrading to TF-IDF-only for the rest of the process.
        last_error = None
        for attempt in range(1, retries + 1):
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer(self.MODEL_NAME)
                log.info("Semantic encoder loaded (%s) on attempt %d", self.MODEL_NAME, attempt)
                break
            except Exception as e:
                last_error = e
                if attempt < retries:
                    log.warning("Semantic encoder load attempt %d/%d failed (%s)- retrying in %.0fs",
                                attempt, retries, e, retry_delay)
                    time.sleep(retry_delay)
        if self.model is None:
            log.warning("Semantic encoder unavailable after %d attempts (%s)- falling back to "
                        "TF-IDF-only content matching.", retries, last_error)

    @property
    def available(self) -> bool:
        return self.model is not None

    def encode(self, text: str) -> Optional[np.ndarray]:
        if not self.model or not text or not text.strip():
            return None
        if text in self._cache:
            return self._cache[text]
        vec = self.model.encode([text], show_progress_bar=False)[0]
        self._cache[text] = vec
        return vec

    def encode_batch(self, texts: List[str]) -> Optional[np.ndarray]:
        """Returns an (n, dim) matrix, or None if the model isn't available.
        Uncached texts are embedded in one batch call (much faster than
        encoding one at a time for bulk fit-time use)."""
        if not self.model:
            return None
        missing = [t for t in texts if t and t.strip() and t not in self._cache]
        if missing:
            vecs = self.model.encode(missing, show_progress_bar=False, batch_size=64)
            for t, v in zip(missing, vecs):
                self._cache[t] = v
        dim = self.model.get_sentence_embedding_dimension()
        return np.array([self._cache.get(t, np.zeros(dim)) for t in texts])

    def similarity(self, text_a: str, text_b: str) -> float:
        va, vb = self.encode(text_a), self.encode(text_b)
        if va is None or vb is None:
            return 0.0
        na, nb = np.linalg.norm(va), np.linalg.norm(vb)
        if na == 0 or nb == 0:
            return 0.0
        return float(np.dot(va, vb) / (na * nb))


# ==========================================================================
# 4. PREPROCESSING- id maps + weighted interaction matrix
# ==========================================================================

class Preprocessor:
    def __init__(self, cfg: RecommenderConfig):
        self.cfg = cfg
        self.candidate_id_to_idx: Dict[str, int] = {}
        self.job_id_to_idx: Dict[str, int] = {}
        self.idx_to_candidate_id: List[str] = []
        self.idx_to_job_id: List[str] = []

    def fit_id_maps(self, candidates: pd.DataFrame, jobs: pd.DataFrame) -> None:
        self.idx_to_candidate_id = candidates["user_id"].astype(str).tolist()
        self.candidate_id_to_idx = {cid: i for i, cid in enumerate(self.idx_to_candidate_id)}
        self.idx_to_job_id = jobs["id"].astype(str).tolist()
        self.job_id_to_idx = {jid: i for i, jid in enumerate(self.idx_to_job_id)}

    def build_events(self, views: pd.DataFrame, applications: pd.DataFrame,
                      saves: pd.DataFrame,
                      incomplete_applications: Optional[pd.DataFrame] = None) -> pd.DataFrame:
        iw = self.cfg.interaction_weights
        parts = []

        if incomplete_applications is None:
            incomplete_applications = pd.DataFrame(columns=["user_id", "job_id", "event_date"])

        for df, weight in ((views, iw.view), (saves, iw.save), (incomplete_applications, iw.incomplete_application)):
            if df.empty:
                continue
            d = df.copy()
            d = d[d["user_id"].astype(str).isin(self.candidate_id_to_idx) &
                  d["job_id"].astype(str).isin(self.job_id_to_idx)]
            d["candidate_idx"] = d["user_id"].astype(str).map(self.candidate_id_to_idx)
            d["job_idx"] = d["job_id"].astype(str).map(self.job_id_to_idx)
            d["weight"] = weight
            parts.append(d[["candidate_idx", "job_idx", "event_date", "weight"]])

        if not applications.empty:
            d = applications.copy()
            d = d[d["user_id"].astype(str).isin(self.candidate_id_to_idx) &
                  d["job_id"].astype(str).isin(self.job_id_to_idx)]
            d["candidate_idx"] = d["user_id"].astype(str).map(self.candidate_id_to_idx)
            d["job_idx"] = d["job_id"].astype(str).map(self.job_id_to_idx)
            d["weight"] = d["status"].map(iw.application_status).fillna(iw.application_status["submitted"])
            parts.append(d[["candidate_idx", "job_idx", "event_date", "weight"]])

        if not parts:
            return pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight"])

        events = pd.concat(parts, ignore_index=True).dropna(subset=["candidate_idx", "job_idx"])
        events["candidate_idx"] = events["candidate_idx"].astype(np.int32)
        events["job_idx"] = events["job_idx"].astype(np.int32)
        events["event_date"] = pd.to_datetime(events["event_date"], utc=True)
        return events

    def build_interaction_matrix(self, events: pd.DataFrame, n_candidates: int, n_jobs: int) -> sp.csr_matrix:
        if events.empty:
            return sp.csr_matrix((n_candidates, n_jobs), dtype=np.float32)
        agg = events.groupby(["candidate_idx", "job_idx"], as_index=False)["weight"].max()
        return sp.csr_matrix(
            (agg["weight"].values.astype(np.float32),
             (agg["candidate_idx"].values, agg["job_idx"].values)),
            shape=(n_candidates, n_jobs),
        )


# ==========================================================================
# 5. CONTENT-BASED MODEL
# ==========================================================================

class ContentBasedModel:
    """MODEL 1- content-based recommendation.

    Two similarity signals, blended:
      1. TF-IDF cosine over shared vocabularies (skills/fields/location/title/
         languages/certifications/experience_text)- exact-ish lexical overlap.
      2. Sentence embeddings over "skills + title" text (SemanticEncoder)-
         captures relationships TF-IDF can't: a candidate skilled in "Python"
         should surface "Backend Developer" / "Machine Learning Engineer"
         even though neither shares a token with "Python", because those
         phrases sit near each other in embedding space.

    Fitting one TF-IDF vectorizer per pair on BOTH sides' text combined is
    what makes a candidate's skills and a job's requirements comparable via
    cosine similarity at all- separate vocabularies would put them in
    different coordinate spaces.

    Candidate-side text is deliberately built the SAME WAY ai_job_matcher_og.py's
    four factors read a candidate's profile- skills include those tagged on
    past jobs (work_experience.skills), not just the standalone skills table;
    "fields" includes both degree AND field_of_study (job-side already blends
    minimum_degree + allowed_fields, so this fixes what was an asymmetric
    comparison); "experience_text" mirrors Factor3's title+description+skills+
    industry text so work history is compared against what a role actually
    involves, not just its title."""

    PAIRS = ["skills", "fields", "location", "title", "languages", "certifications", "experience_text"]
    SEMANTIC_WEIGHT = 0.5  # blend ratio: semantic vs TF-IDF, when semantic is available

    def __init__(self, cfg: ContentConfig, encoder: Optional[SemanticEncoder] = None):
        self.cfg = cfg
        self.encoder = encoder
        self._tfidf: Dict[str, TfidfVectorizer] = {}
        self._exp_scaler: Optional[MinMaxScaler] = None
        self.job_matrix: Optional[sp.csr_matrix] = None
        self.job_semantic_matrix: Optional[np.ndarray] = None
        self.candidate_semantic_matrix: Optional[np.ndarray] = None
        self._cand_text: Optional[pd.DataFrame] = None
        self._job_text: Optional[pd.DataFrame] = None
        self.candidate_ids: List[str] = []
        self.job_ids: List[str] = []
        self.candidate_id_to_idx: Dict[str, int] = {}
        self.job_id_to_idx: Dict[str, int] = {}

    @staticmethod
    def _as_text_list(value) -> List[str]:
        """work_experience.skills is a Postgres TEXT[] (psycopg2 hands back a
        Python list); tolerate a plain string too since upsert_candidate can
        be fed a hand-built dict from a webhook payload."""
        if isinstance(value, list):
            return [str(v) for v in value if v]
        if isinstance(value, str) and value:
            return [value]
        return []

    def _candidate_text_frame(self, candidates: pd.DataFrame, skills_df: pd.DataFrame,
                               education_df: pd.DataFrame, work_df: pd.DataFrame,
                               certifications_df: pd.DataFrame = None) -> pd.DataFrame:
        skills_by_user = skills_df.groupby("user_id")["skill_name"].apply(list).to_dict() if not skills_df.empty else {}
        fields_by_user = education_df.groupby("user_id")["field_of_study"].apply(list).to_dict() if not education_df.empty else {}
        degrees_by_user = (education_df.groupby("user_id")["degree"].apply(list).to_dict()
                            if not education_df.empty and "degree" in education_df.columns else {})
        certs_by_user = (certifications_df.groupby("user_id")["certification_name"].apply(list).to_dict()
                          if certifications_df is not None and not certifications_df.empty else {})
        work_by_user = work_df.groupby("user_id") if not work_df.empty else None

        rows = []
        for _, cand in candidates.iterrows():
            uid = str(cand["user_id"])
            prefs = cand.get("job_preferences") or {}
            if not isinstance(prefs, dict):
                prefs = {}
            # Skills come from BOTH the standalone skills table AND skills tagged
            # on past jobs- same as ai_job_matcher_og.py's Factor1, which unions
            # profile_data['skills'] with every work_experience[].skills entry.
            skills_list = list(skills_by_user.get(uid, []))
            work_titles: List[str] = []
            experience_text_parts: List[str] = []
            years = 0.0
            if work_by_user is not None and uid in work_by_user.groups:
                for _, w in work_by_user.get_group(uid).iterrows():
                    years += _years_between(w.get("start_date"), w.get("end_date"), bool(w.get("is_current")))
                    skills_list.extend(self._as_text_list(w.get("skills")))
                    title = _s(w.get("title"))
                    if title:
                        work_titles.append(title)
                    experience_text_parts.append(" ".join(p for p in [
                        title, _s(w.get("description")), " ".join(self._as_text_list(w.get("skills"))),
                        _s(w.get("industry")),
                    ] if p))
            skills_text = " ".join(skills_list)
            # "fields" mirrors the JOB side's job_fields_text(), which blends
            # minimum_degree + allowed_fields- without the candidate's own
            # degree here, that comparison was asymmetric (job side had degree
            # text, candidate side didn't).
            fields_text = " ".join(list(fields_by_user.get(uid, [])) + list(degrees_by_user.get(uid, [])))
            certifications_text = " ".join(certs_by_user.get(uid, []))
            languages_text = " ".join(_parse_language_list(cand.get("languages")))
            preferred_locations = prefs.get("locations") or prefs.get("preferred_locations") or []
            # Rwandan candidates store their actual residence in
            # province/district/sector/cell/village (city/country stay NULL
            # for them) -- folded in as bag-of-words tokens alongside city/
            # country so TF-IDF can pick up shared district/sector names
            # against the job side's city/country tokens (job_location_text).
            home_location_parts = [_s(cand.get("sector")), _s(cand.get("district")),
                                    _s(cand.get("province")), 'Rwanda'] if cand.get("is_rwandan") else []
            location_text = " ".join(p for p in [_s(cand.get("city")), _s(cand.get("country")),
                                                  _s(prefs.get("remote_preference"))] +
                                      home_location_parts +
                                      [str(l) for l in preferred_locations] if p)
            title_text = " ".join(p for p in [_s(cand.get("headline"))] + work_titles +
                                   list(prefs.get("job_types") or []) +
                                   list(prefs.get("industries") or []) if p)
            experience_text = " ".join(p for p in experience_text_parts if p)
            rows.append({"user_id": uid, "skills": skills_text, "fields": fields_text,
                         "location": location_text, "title": title_text,
                         "languages": languages_text, "certifications": certifications_text,
                         "experience_text": experience_text,
                         "experience_years": years,
                         "semantic_text": f"{skills_text} {title_text}".strip()})
        return pd.DataFrame(rows)

    def _candidate_text_row(self, cand_row: dict, skills_df: pd.DataFrame,
                            education_df: pd.DataFrame, work_df: pd.DataFrame,
                            certifications_df: pd.DataFrame = None) -> pd.DataFrame:
        return self._candidate_text_frame(pd.DataFrame([cand_row]), skills_df, education_df, work_df, certifications_df)

    def _job_text_frame(self, jobs: pd.DataFrame) -> pd.DataFrame:
        rows = []
        for _, job in jobs.iterrows():
            skills_t = job_skills_text(job)
            title_t = job_title_text(job)
            rows.append({
                "id": str(job["id"]),
                "skills": skills_t,
                "fields": job_fields_text(job),
                "location": job_location_text(job),
                "title": title_t,
                "languages": " ".join(_parse_language_list(job.get("language_requirements"))),
                "certifications": " ".join(job.get("education_required", {}).get("certifications", [])
                                            if isinstance(job.get("education_required"), dict) else []),
                "experience_text": job_experience_text(job),
                "experience_years": job_experience_years(job),
                "semantic_text": f"{skills_t} {title_t}".strip(),
            })
        return pd.DataFrame(rows)

    def _job_text_row(self, job_row: dict) -> pd.DataFrame:
        return self._job_text_frame(pd.DataFrame([job_row]))

    def fit(self, candidates: pd.DataFrame, jobs: pd.DataFrame, skills_df: pd.DataFrame,
            education_df: pd.DataFrame, work_df: pd.DataFrame,
            certifications_df: pd.DataFrame = None) -> None:
        cand_text = self._candidate_text_frame(candidates, skills_df, education_df, work_df, certifications_df)
        job_text = self._job_text_frame(jobs)
        self._cand_text, self._job_text = cand_text, job_text
        self.candidate_ids = cand_text["user_id"].astype(str).tolist()
        self.job_ids = job_text["id"].astype(str).tolist()
        self.candidate_id_to_idx = {cid: i for i, cid in enumerate(self.candidate_ids)}
        self.job_id_to_idx = {jid: i for i, jid in enumerate(self.job_ids)}

        cand_blocks, job_blocks = [], []
        for pair in self.PAIRS:
            cvals = cand_text[pair].fillna("")
            jvals = job_text[pair].fillna("")
            vec = TfidfVectorizer(max_features=self.cfg.text_max_features,
                                   ngram_range=self.cfg.ngram_range, min_df=self.cfg.min_df,
                                   token_pattern=r"[A-Za-z0-9]+")
            combined = pd.concat([cvals, jvals])
            if combined.str.strip().eq("").all():
                # Nothing to vectorize for this pair yet (e.g. no jobs have skills set)-
                # use a 1-dim zero block so matrix shapes still line up.
                cand_blocks.append(sp.csr_matrix((len(cvals), 1)))
                job_blocks.append(sp.csr_matrix((len(jvals), 1)))
                continue
            vec.fit(combined)
            self._tfidf[pair] = vec
            cand_blocks.append(vec.transform(cvals))
            job_blocks.append(vec.transform(jvals))

        cand_exp = cand_text["experience_years"].values.reshape(-1, 1)
        job_exp = job_text["experience_years"].values.reshape(-1, 1)
        self._exp_scaler = MinMaxScaler()
        self._exp_scaler.fit(np.vstack([cand_exp, job_exp]))
        cand_blocks.append(sp.csr_matrix(self._exp_scaler.transform(cand_exp)))
        job_blocks.append(sp.csr_matrix(self._exp_scaler.transform(job_exp)))

        self.candidate_matrix = sk_normalize(sp.hstack(cand_blocks).tocsr())
        self.job_matrix = sk_normalize(sp.hstack(job_blocks).tocsr())

        # Semantic embeddings computed once here (fit time), reused for every
        # score_batch call- encoding is the expensive part, cosine similarity
        # on the resulting dense vectors is cheap.
        if self.encoder and self.encoder.available:
            job_vecs = self.encoder.encode_batch(job_text["semantic_text"].tolist())
            cand_vecs = self.encoder.encode_batch(cand_text["semantic_text"].tolist())
            self.job_semantic_matrix = self._l2_normalize(job_vecs)
            self.candidate_semantic_matrix = self._l2_normalize(cand_vecs)
        else:
            self.job_semantic_matrix = None
            self.candidate_semantic_matrix = None

    def _replace_sparse_row(self, matrix: Optional[sp.csr_matrix], row_idx: int, new_row: sp.csr_matrix) -> sp.csr_matrix:
        if matrix is None:
            return new_row.tocsr()
        if matrix.shape[0] != row_idx + 1 and row_idx < matrix.shape[0]:
            updated = matrix.tolil(copy=True)
            updated[row_idx] = new_row
            return updated.tocsr()
        if row_idx == matrix.shape[0]:
            return sp.vstack([matrix, new_row]).tocsr()
        updated = matrix.tolil(copy=True)
        updated[row_idx] = new_row
        return updated.tocsr()

    def _delete_sparse_row(self, matrix: Optional[sp.csr_matrix], row_idx: int) -> Optional[sp.csr_matrix]:
        if matrix is None:
            return None
        if row_idx < 0 or row_idx >= matrix.shape[0]:
            return matrix
        keep = [i for i in range(matrix.shape[0]) if i != row_idx]
        if not keep:
            return sp.csr_matrix((0, matrix.shape[1]), dtype=matrix.dtype)
        return matrix[keep]

    def _replace_dense_row(self, matrix: Optional[np.ndarray], row_idx: int, new_row: Optional[np.ndarray]) -> Optional[np.ndarray]:
        if new_row is None:
            return matrix
        if matrix is None:
            return np.asarray([new_row], dtype=np.float32)
        if row_idx < 0 or row_idx >= matrix.shape[0]:
            return matrix
        updated = matrix.copy()
        updated[row_idx] = new_row
        return updated

    def upsert_candidate(self, cand_row: dict, skills_df: pd.DataFrame,
                         education_df: pd.DataFrame, work_df: pd.DataFrame,
                         certifications_df: pd.DataFrame = None) -> None:
        cand_id = str(cand_row.get("user_id", ""))
        if not cand_id:
            return
        text = self._candidate_text_row(cand_row, skills_df, education_df, work_df, certifications_df)
        tfidf_blocks = []
        for pair in self.PAIRS:
            vec = self._tfidf.get(pair)
            if vec is None:
                tfidf_blocks.append(sp.csr_matrix((1, 1)))
            else:
                tfidf_blocks.append(vec.transform(text[pair].fillna("")))
        exp = text["experience_years"].values.reshape(-1, 1)
        tfidf_blocks.append(sp.csr_matrix(self._exp_scaler.transform(exp)))
        tfidf_row = sk_normalize(sp.hstack(tfidf_blocks).tocsr())

        if cand_id in self.candidate_id_to_idx:
            row_idx = self.candidate_id_to_idx[cand_id]
        else:
            row_idx = len(self.candidate_ids)
            self.candidate_ids.append(cand_id)
            self.candidate_id_to_idx[cand_id] = row_idx
            self._cand_text = pd.concat([self._cand_text, text], ignore_index=True) if self._cand_text is not None else text

        self.candidate_matrix = self._replace_sparse_row(self.candidate_matrix, row_idx, tfidf_row)
        if self.encoder and self.encoder.available:
            semantic_vec = self.encoder.encode(text["semantic_text"].iloc[0])
            if semantic_vec is not None:
                semantic_vec = semantic_vec / np.linalg.norm(semantic_vec) if np.linalg.norm(semantic_vec) > 0 else semantic_vec
            self.candidate_semantic_matrix = self._replace_dense_row(self.candidate_semantic_matrix, row_idx, semantic_vec)

    def upsert_job(self, job_row: dict) -> None:
        job_id = str(job_row.get("id", ""))
        if not job_id:
            return
        text = self._job_text_row(job_row)
        tfidf_blocks = []
        for pair in self.PAIRS:
            vec = self._tfidf.get(pair)
            if vec is None:
                tfidf_blocks.append(sp.csr_matrix((1, 1)))
            else:
                tfidf_blocks.append(vec.transform(text[pair].fillna("")))
        exp = text["experience_years"].values.reshape(-1, 1)
        tfidf_blocks.append(sp.csr_matrix(self._exp_scaler.transform(exp)))
        tfidf_row = sk_normalize(sp.hstack(tfidf_blocks).tocsr())

        # Compute BOTH vectors before mutating either matrix. self.encoder.encode()
        # is a sentence-transformer forward pass that can release the GIL; if
        # job_matrix were updated first and this ran afterward (the old order),
        # a concurrent reader could see job_matrix already grown to N rows while
        # job_semantic_matrix still has N-1, crashing _blend()'s broadcast.
        semantic_vec = None
        if self.encoder and self.encoder.available:
            semantic_vec = self.encoder.encode(text["semantic_text"].iloc[0])
            if semantic_vec is not None:
                norm = np.linalg.norm(semantic_vec)
                semantic_vec = semantic_vec / norm if norm > 0 else semantic_vec

        if job_id in self.job_id_to_idx:
            row_idx = self.job_id_to_idx[job_id]
        else:
            row_idx = len(self.job_ids)
            self.job_ids.append(job_id)
            self.job_id_to_idx[job_id] = row_idx
            self._job_text = pd.concat([self._job_text, text], ignore_index=True) if self._job_text is not None else text

        self.job_matrix = self._replace_sparse_row(self.job_matrix, row_idx, tfidf_row)
        if self.encoder and self.encoder.available:
            self.job_semantic_matrix = self._replace_dense_row(self.job_semantic_matrix, row_idx, semantic_vec)

    def delete_candidate(self, candidate_id: str) -> None:
        cand_id = str(candidate_id)
        row_idx = self.candidate_id_to_idx.pop(cand_id, None)
        if row_idx is None:
            return
        self.candidate_ids.pop(row_idx)
        self.candidate_id_to_idx = {cid: i for i, cid in enumerate(self.candidate_ids)}
        self.candidate_matrix = self._delete_sparse_row(self.candidate_matrix, row_idx)
        self.candidate_semantic_matrix = None if self.candidate_semantic_matrix is None else np.delete(self.candidate_semantic_matrix, row_idx, axis=0)
        if self._cand_text is not None and not self._cand_text.empty:
            self._cand_text = self._cand_text[self._cand_text["user_id"].astype(str) != cand_id].reset_index(drop=True)

    def delete_job(self, job_id: str) -> None:
        jid = str(job_id)
        row_idx = self.job_id_to_idx.pop(jid, None)
        if row_idx is None:
            return
        self.job_ids.pop(row_idx)
        self.job_id_to_idx = {j: i for i, j in enumerate(self.job_ids)}
        self.job_matrix = self._delete_sparse_row(self.job_matrix, row_idx)
        self.job_semantic_matrix = None if self.job_semantic_matrix is None else np.delete(self.job_semantic_matrix, row_idx, axis=0)
        if self._job_text is not None and not self._job_text.empty:
            self._job_text = self._job_text[self._job_text["id"].astype(str) != jid].reset_index(drop=True)

    @staticmethod
    def _l2_normalize(mat: Optional[np.ndarray]) -> Optional[np.ndarray]:
        if mat is None:
            return None
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms

    def transform_candidate_row(self, cand_row: dict, skills_df: pd.DataFrame,
                                 education_df: pd.DataFrame, work_df: pd.DataFrame,
                                 certifications_df: pd.DataFrame = None) -> Tuple[sp.csr_matrix, Optional[np.ndarray]]:
        """Encode a single candidate (e.g. cold-start, not present at last
        training run) through the already-fitted vectorizers/scaler. Returns
        (tfidf_row, semantic_vec)."""
        one = pd.DataFrame([cand_row])
        text = self._candidate_text_frame(one, skills_df, education_df, work_df, certifications_df)
        blocks = []
        for pair in self.PAIRS:
            vec = self._tfidf.get(pair)
            val = text[pair].fillna("")
            blocks.append(vec.transform(val) if vec is not None else sp.csr_matrix((1, 1)))
        exp = text["experience_years"].values.reshape(-1, 1)
        blocks.append(sp.csr_matrix(self._exp_scaler.transform(exp)))
        tfidf_row = sk_normalize(sp.hstack(blocks).tocsr())

        semantic_vec = None
        if self.encoder and self.encoder.available:
            semantic_vec = self.encoder.encode(text["semantic_text"].iloc[0])
            if semantic_vec is not None:
                n = np.linalg.norm(semantic_vec)
                semantic_vec = semantic_vec / n if n > 0 else semantic_vec
        return tfidf_row, semantic_vec

    def _blend(self, tfidf_scores: np.ndarray, semantic_scores: Optional[np.ndarray]) -> np.ndarray:
        if semantic_scores is None:
            return tfidf_scores
        return (1 - self.SEMANTIC_WEIGHT) * tfidf_scores + self.SEMANTIC_WEIGHT * np.clip(semantic_scores, 0.0, 1.0)

    def score_batch(self, candidate_indices: np.ndarray) -> np.ndarray:
        batch = self.candidate_matrix[candidate_indices]
        tfidf_scores = np.clip(batch.dot(self.job_matrix.T).toarray(), 0.0, 1.0).astype(np.float32)

        semantic_scores = None
        if self.candidate_semantic_matrix is not None and self.job_semantic_matrix is not None:
            semantic_scores = self.candidate_semantic_matrix[candidate_indices].dot(self.job_semantic_matrix.T)

        return self._blend(tfidf_scores, semantic_scores).astype(np.float32)

    def score_row(self, candidate_row_matrix: sp.csr_matrix, semantic_vec: Optional[np.ndarray] = None) -> np.ndarray:
        tfidf_scores = np.clip(candidate_row_matrix.dot(self.job_matrix.T).toarray(), 0.0, 1.0).astype(np.float32)

        semantic_scores = None
        if semantic_vec is not None and self.job_semantic_matrix is not None:
            semantic_scores = (self.job_semantic_matrix @ semantic_vec).reshape(1, -1)

        return self._blend(tfidf_scores, semantic_scores).astype(np.float32)

    def explain_match(self, candidate_idx: int, job_col: int) -> dict:
        """Detailed, per-pair breakdown for ONE candidate/job pair- deliberately
        NOT called during bulk score_batch (would be O(candidates x jobs) at
        real per-skill granularity); only run for the top-N shortlist actually
        shown to a user, where that cost is bounded and worth paying.

        Returns matched terms for EVERY pair, plus a genuine standalone TF-IDF
        cosine score PER PAIR and the standalone semantic score- recomputed
        independently here because score_batch()'s single concatenated
        candidate/job vector is L2-normalized as ONE whole, so it can't be
        sliced back into a per-pair score after the fact. This makes every
        number the TF-IDF/Semantic/Final pipeline uses individually visible."""
        if self._cand_text is None or self._job_text is None:
            return {}
        cand = self._cand_text.iloc[candidate_idx]
        job = self._job_text.iloc[job_col]

        def best_matches(cand_field: str, job_field: str, min_sim: float = 0.35) -> List[str]:
            cand_items = [t for t in cand[cand_field].split() if t]
            job_items = [t for t in job[job_field].split() if t]
            if not cand_items or not job_items:
                return []
            matched = []
            for ji in dict.fromkeys(job_items):
                best = max((self.encoder.similarity(ci, ji) if self.encoder and self.encoder.available
                            else 1.0 if ci == ji else 0.0) for ci in cand_items)
                if best >= min_sim:
                    matched.append(ji)
            return matched

        matched_terms: Dict[str, List[str]] = {}
        tfidf_score_by_pair: Dict[str, float] = {}
        for pair in self.PAIRS:
            matched_terms[pair] = best_matches(pair, pair)
            vec = self._tfidf.get(pair)
            cand_val, job_val = cand.get(pair, ""), job.get(pair, "")
            if vec is None or not cand_val or not job_val:
                tfidf_score_by_pair[pair] = 0.0
                continue
            cand_vec = sk_normalize(vec.transform([cand_val]))
            job_vec = sk_normalize(vec.transform([job_val]))
            tfidf_score_by_pair[pair] = round(float(cand_vec.dot(job_vec.T)[0, 0]), 4)

        semantic_score = None
        if self.candidate_semantic_matrix is not None and self.job_semantic_matrix is not None:
            semantic_score = round(float(
                self.candidate_semantic_matrix[candidate_idx] @ self.job_semantic_matrix[job_col]
            ), 4)

        return {
            "matched_skills": matched_terms["skills"],
            "matched_education": matched_terms["fields"],
            "matched_languages": matched_terms["languages"],
            "matched_experience_years": round(float(cand["experience_years"]), 1),
            "required_experience_years": round(float(job["experience_years"]), 1),
            # Full breakdown: every pair's matched terms + standalone TF-IDF
            # cosine, plus the standalone semantic score- independent of how
            # score_batch() blends them for ranking.
            "matched_terms_by_pair": matched_terms,
            "tfidf_score_by_pair": tfidf_score_by_pair,
            "semantic_score": semantic_score,
        }


# ==========================================================================
# 6. COLLABORATIVE FILTERING (PyTorch matrix factorization)
# ==========================================================================

class MatrixFactorizationNet(nn.Module):
    def __init__(self, n_users: int, n_items: int, embedding_dim: int):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, embedding_dim)
        self.item_emb = nn.Embedding(n_items, embedding_dim)
        self.user_bias = nn.Embedding(n_users, 1)
        self.item_bias = nn.Embedding(n_items, 1)
        self.global_bias = nn.Parameter(torch.zeros(1))
        nn.init.normal_(self.user_emb.weight, std=0.05)
        nn.init.normal_(self.item_emb.weight, std=0.05)
        nn.init.zeros_(self.user_bias.weight)
        nn.init.zeros_(self.item_bias.weight)

    def forward(self, user_idx, item_idx):
        dot = (self.user_emb(user_idx) * self.item_emb(item_idx)).sum(dim=1)
        bias = self.user_bias(user_idx).squeeze(1) + self.item_bias(item_idx).squeeze(1)
        return dot + bias + self.global_bias

    @torch.no_grad()
    def score_users_batch(self, user_idx):
        u_vec = self.user_emb(user_idx)
        u_bias = self.user_bias(user_idx)
        logits = u_vec @ self.item_emb.weight.T
        logits = logits + u_bias + self.item_bias.weight.T + self.global_bias
        return torch.sigmoid(logits)


class InteractionDataset(Dataset):
    def __init__(self, interaction_matrix: sp.csr_matrix, neg_ratio: int, max_weight: float, seed: int = 42,
                 hard_negatives: Dict[int, List[int]] = None):
        coo = interaction_matrix.tocoo()
        self.users = coo.row.astype(np.int64)
        self.items = coo.col.astype(np.int64)
        self.weights = coo.data.astype(np.float32) / max_weight
        self.n_items = interaction_matrix.shape[1]
        self.neg_ratio = neg_ratio
        self.rng = np.random.default_rng(seed)
        # A candidate explicitly ignoring a job is a much stronger "not interested"
        # signal than an unseen job picked at random- without this, ignored_jobs
        # was only ever used to filter results at SCORE time, never to actually
        # train the model that this candidate/job pair is a negative example.
        self.hard_negatives = hard_negatives or {}
        self._interacted = {}
        for u, i in zip(self.users, self.items):
            self._interacted.setdefault(u, set()).add(i)

    def __len__(self):
        return len(self.users)

    def __getitem__(self, idx):
        u = self.users[idx]
        pos_i = self.items[idx]
        w = self.weights[idx]
        seen = self._interacted.get(u, set())
        neg_items = []
        # Prioritize the candidate's own ignored jobs as negatives before falling
        # back to random sampling, so every ignore actually gets trained on.
        for cand in self.hard_negatives.get(int(u), []):
            if len(neg_items) >= self.neg_ratio:
                break
            if cand not in seen and cand not in neg_items:
                neg_items.append(cand)
        while len(neg_items) < self.neg_ratio:
            cand = int(self.rng.integers(0, self.n_items))
            if cand not in seen and cand not in neg_items:
                neg_items.append(cand)
        return u, pos_i, w, np.array(neg_items, dtype=np.int64)

    @staticmethod
    def collate(batch):
        users, pos_items, weights, neg_items = zip(*batch)
        return (torch.as_tensor(users, dtype=torch.long),
                torch.as_tensor(pos_items, dtype=torch.long),
                torch.as_tensor(weights, dtype=torch.float32),
                torch.as_tensor(np.stack(neg_items), dtype=torch.long))


class CollaborativeModel:
    def __init__(self, cfg: MFConfig):
        self.cfg = cfg
        self.model: Optional[MatrixFactorizationNet] = None
        self.device = torch.device("cuda" if (cfg.device == "auto" and torch.cuda.is_available())
                                    else ("cpu" if cfg.device == "auto" else cfg.device))
        self.trained = False

    def fit(self, interaction_matrix: sp.csr_matrix, n_users: int, n_items: int, max_weight: float,
            hard_negatives: Dict[int, List[int]] = None) -> None:
        if interaction_matrix.nnz < self.cfg.min_interactions_to_train:
            log.info("Only %d interactions (< %d)- skipping collaborative training, "
                      "weight will be redistributed to content/behavior.",
                      interaction_matrix.nnz, self.cfg.min_interactions_to_train)
            self.trained = False
            return

        torch.manual_seed(self.cfg.random_state)
        dataset = InteractionDataset(interaction_matrix, self.cfg.negative_sampling_ratio, max_weight,
                                      self.cfg.random_state, hard_negatives=hard_negatives)
        n_val = max(1, int(len(dataset) * self.cfg.val_fraction))
        n_train = len(dataset) - n_val
        train_ds, val_ds = torch.utils.data.random_split(
            dataset, [n_train, n_val], generator=torch.Generator().manual_seed(self.cfg.random_state))
        train_loader = TorchDataLoader(train_ds, batch_size=self.cfg.batch_size, shuffle=True, collate_fn=InteractionDataset.collate)
        val_loader = TorchDataLoader(val_ds, batch_size=self.cfg.batch_size, shuffle=False, collate_fn=InteractionDataset.collate)

        self.model = MatrixFactorizationNet(n_users, n_items, self.cfg.embedding_dim).to(self.device)
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.cfg.learning_rate, weight_decay=self.cfg.weight_decay)
        loss_fn = nn.BCEWithLogitsLoss(reduction="none")

        best_val, no_improve = float("inf"), 0
        for epoch in range(1, self.cfg.epochs + 1):
            self.model.train()
            for users, pos_items, weights, neg_items in train_loader:
                users, pos_items, weights, neg_items = (t.to(self.device) for t in (users, pos_items, weights, neg_items))
                b, k = neg_items.shape
                pos_logits = self.model(users, pos_items)
                pos_loss = (loss_fn(pos_logits, torch.ones_like(pos_logits)) * weights).mean()
                users_rep = users.unsqueeze(1).expand(-1, k).reshape(-1)
                neg_logits = self.model(users_rep, neg_items.reshape(-1))
                neg_loss = loss_fn(neg_logits, torch.zeros_like(neg_logits)).mean()
                loss = pos_loss + neg_loss
                optimizer.zero_grad(); loss.backward(); optimizer.step()

            val_loss = self._evaluate(val_loader, loss_fn)
            log.info("Epoch %d/%d - val_loss=%.4f", epoch, self.cfg.epochs, val_loss)
            if val_loss < best_val - 1e-5:
                best_val, no_improve = val_loss, 0
            else:
                no_improve += 1
                if no_improve >= self.cfg.early_stopping_patience:
                    break

        self.model.eval()
        self.trained = True

    def _evaluate(self, loader, loss_fn) -> float:
        self.model.eval()
        total, count = 0.0, 0
        with torch.no_grad():
            for users, pos_items, weights, neg_items in loader:
                users, pos_items, weights, neg_items = (t.to(self.device) for t in (users, pos_items, weights, neg_items))
                b, k = neg_items.shape
                pos_loss = (loss_fn(self.model(users, pos_items), torch.ones(b, device=self.device)) * weights).mean()
                users_rep = users.unsqueeze(1).expand(-1, k).reshape(-1)
                neg_loss = loss_fn(self.model(users_rep, neg_items.reshape(-1)), torch.zeros(b * k, device=self.device)).mean()
                total += (pos_loss + neg_loss).item() * b
                count += b
        return total / max(count, 1)

    def score_batch(self, candidate_indices: np.ndarray) -> np.ndarray:
        if not self.trained:
            return np.zeros((len(candidate_indices), self.model.item_emb.weight.shape[0] if self.model else 0), dtype=np.float32)
        idx = torch.as_tensor(candidate_indices, dtype=torch.long, device=self.device)
        return self.model.score_users_batch(idx).detach().cpu().numpy().astype(np.float32)

    @torch.no_grad()
    def most_similar_candidates(self, candidate_idx: int, k: int = 5) -> List[Tuple[int, float]]:
        """MODEL 3's explicit output: which OTHER candidates does the learned
        embedding space consider closest to this one- cosine similarity of
        their learned user-embedding vectors, which the model fit from
        shared interaction PATTERNS across the whole candidate population
        (not from any single candidate's profile text). Returns
        [(candidate_idx, similarity), ...] excluding the candidate itself."""
        if not self.trained:
            return []
        emb = self.model.user_emb.weight  # (n_users, dim)
        target = emb[candidate_idx].unsqueeze(0)
        sims = torch.nn.functional.cosine_similarity(target, emb)
        sims[candidate_idx] = -1.0  # exclude self
        top = torch.topk(sims, k=min(k, sims.shape[0] - 1))
        return [(int(i), float(s)) for i, s in zip(top.indices.tolist(), top.values.tolist()) if s > -1.0]


# ==========================================================================
# 7. BEHAVIOR MODEL
# ==========================================================================

class BehaviorModel:
    """MODEL 2- behavior-based recommendation: an evolving interest profile
    learned from the COMPLETE textual content of every job a candidate has
    interacted with (viewed/searched/saved/applied/interviewed/offered/
    hired), not just a handful of categorical attributes.

    Architecture mirrors ContentBasedModel- one TfidfVectorizer fitted per
    pair on the job corpus, all pairs horizontally stacked into one
    normalized job_matrix, plus a semantic embedding matrix, blended 50/50-
    but over a much richer 17-pair space (skills/fields/title/location/
    languages/certifications/experience_text/education/responsibilities/
    requirements/qualifications/benefits/employment_type/work_arrangement/
    department/industry/company_name) with two deliberate differences:
      - "skills" uses character 3-4-gram TF-IDF instead of whole-word
        tokens, so "Phyton"/"Reatc"/"Djanggo" still overlap "Python"/
        "React"/"Django" on shared character shingles without needing
        exact spelling- semantic embeddings add a second, independent
        layer of typo/synonym tolerance on top.
      - "company_name" is scaled down before the final normalize so it
        contributes a small share of the match instead of an equal ~1/17
        share- candidates search skills/title/location, not a specific
        employer, though repeatedly interacting with the same company's
        jobs still nudges this pair's own similarity up naturally.

    A candidate's behavior profile is a weighted average of the job_matrix
    rows (and semantic vectors) of every job they interacted with, weighted
    by interaction type (TYPE_WEIGHTS) and a 60-day recency half-life. This
    is the ONLY sub-signal now- no separate categorical-attribute or
    parallel search-TF-IDF systems to blend against, since department/
    job_type/work_arrangement/company_name are themselves pairs in the same
    17-field space, and search queries feed the same weighted profile
    (job_searches has no clicked-job column, so query text is approximated
    as a job-shaped row with content only in the skills/title slices)."""

    PAIRS = [
        "skills", "fields", "title", "location", "languages", "certifications",
        "experience_text", "education", "responsibilities", "requirements",
        "qualifications", "benefits", "employment_type", "work_arrangement",
        "department", "industry", "company_name",
    ]
    CHAR_NGRAM_PAIRS = {"skills"}
    COMPANY_NAME_SCALE = 0.5  # keeps company_name's share of the blended vector small (~1-2%) instead of an equal ~1/17 (~6%) share
    SEMANTIC_WEIGHT = 0.5     # matches ContentBasedModel's TF-IDF/semantic blend ratio
    WORD_MAX_FEATURES = 2000
    CHAR_MAX_FEATURES = 3000

    # Single-argument job-text extractors- "languages"/"certifications" need
    # extra lookups (language_requirements / education_required.certifications)
    # and are built directly in _job_text_frame instead of living here.
    _EXTRACTORS = {
        "skills": job_skills_text,
        "fields": job_fields_text,
        "title": job_title_only_text,
        "location": job_location_text,
        "experience_text": job_experience_text,
        "education": job_education_text,
        "responsibilities": job_responsibilities_text,
        "requirements": job_requirements_text,
        "qualifications": job_qualifications_text,
        "benefits": job_benefits_text,
        "employment_type": job_employment_type_text,
        "work_arrangement": job_work_arrangement_text,
        "department": job_department_text,
        "industry": job_industry_text,
        "company_name": job_company_name_text,
    }

    # Interaction weights specific to Behavior- deliberately kept separate
    # from the shared InteractionWeights dataclass (which collaborative
    # filtering also reads) so this refactor doesn't change Collaborative's
    # training signal. Rejected/withdrawn contribute nothing: they are not a
    # positive interest signal.
    TYPE_WEIGHTS = {
        "view": 1.0, "search_click": 2.0, "incomplete_application": 2.5, "save": 3.0,
        "submitted": 5.0, "under_review": 5.0, "apply": 5.0,
        "shortlisted": 6.0, "on_hold": 4.0,
        "interview": 7.0, "assessment": 7.0, "reference_check": 7.5,
        "offer": 9.0, "hired": 10.0, "accepted": 10.0,
        "rejected": 0.0, "withdrawn": 0.0,
    }

    def __init__(self, cfg: BehaviorConfig, encoder: Optional[SemanticEncoder] = None):
        self.cfg = cfg
        self.encoder = encoder
        self._tfidf: Dict[str, TfidfVectorizer] = {}
        self._pair_col_ranges: Dict[str, Tuple[int, int]] = {}
        self.job_matrix: Optional[sp.csr_matrix] = None
        self.job_semantic_matrix: Optional[np.ndarray] = None
        self._job_text: Optional[pd.DataFrame] = None
        self._job_ids: List[str] = []
        self._job_id_to_row: Dict[str, int] = {}
        self.behavior_profile: Dict[int, dict] = {}                # candidate_idx -> {"tfidf": csr row, "semantic": vec|None}
        self.behavior_profile_sources: Dict[int, List[dict]] = {}  # candidate_idx -> top interacted jobs that built the profile
        self._event_log: pd.DataFrame = pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight"])
        self._jobs_ref: Optional[pd.DataFrame] = None
        self._idx_to_job_id_ref: List[str] = []
        # Informational only ("has_search_history" in explainability output)-
        # searches feed the SAME weighted profile as any other interaction
        # (see _search_query_row), they don't score as a separate sub-signal.
        self._search_candidate_indices: Set[int] = set()
        self._search_text_by_candidate: Dict[int, List[Tuple[str, float]]] = {}

    # ---- Job corpus -------------------------------------------------------

    def _job_text_frame(self, jobs: pd.DataFrame) -> pd.DataFrame:
        if jobs is None or jobs.empty:
            return pd.DataFrame(columns=["id"] + self.PAIRS)
        rows = []
        for _, job in jobs.iterrows():
            row = {"id": str(job["id"])}
            for pair, fn in self._EXTRACTORS.items():
                row[pair] = fn(job)
            row["languages"] = " ".join(_parse_language_list(job.get("language_requirements")))
            edu = job.get("education_required") or {}
            certs = edu.get("certifications", []) if isinstance(edu, dict) else []
            row["certifications"] = " ".join(str(c) for c in certs) if isinstance(certs, list) else ""
            rows.append(row)
        return pd.DataFrame(rows)

    def fit_job_corpus(self, jobs: pd.DataFrame) -> None:
        """Fit the 17-pair TF-IDF space + semantic embeddings over the active
        job corpus. Call whenever the job set changes (same cadence as
        ContentBasedModel.fit)- fit_profiles() below builds every
        candidate's profile as a weighted average of THESE job vectors, so
        this must run first."""
        job_text = self._job_text_frame(jobs)
        self._job_text = job_text
        self._job_ids = job_text["id"].astype(str).tolist()
        self._job_id_to_row = {jid: i for i, jid in enumerate(self._job_ids)}

        self._tfidf = {}
        self._pair_col_ranges = {}
        blocks = []
        col = 0
        for pair in self.PAIRS:
            vals = job_text[pair].fillna("") if pair in job_text.columns else pd.Series([""] * len(job_text))
            if vals.empty or vals.str.strip().eq("").all():
                # Nothing to vectorize for this pair in this job corpus (e.g.
                # no job has benefits filled in yet)- a 1-dim zero block
                # keeps matrix shapes aligned without hardcoding that the
                # field must exist, per "if some fields do not exist,
                # automatically ignore them without breaking the code."
                blocks.append(sp.csr_matrix((len(vals), 1)))
                self._pair_col_ranges[pair] = (col, col + 1)
                col += 1
                continue
            if pair in self.CHAR_NGRAM_PAIRS:
                vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 4),
                                       lowercase=True, max_features=self.CHAR_MAX_FEATURES)
            else:
                vec = TfidfVectorizer(max_features=self.WORD_MAX_FEATURES, token_pattern=r"[A-Za-z0-9]+")
            vec.fit(vals)
            self._tfidf[pair] = vec
            block = vec.transform(vals)
            if pair == "company_name":
                block = block * self.COMPANY_NAME_SCALE
            blocks.append(block)
            self._pair_col_ranges[pair] = (col, col + block.shape[1])
            col += block.shape[1]

        self.job_matrix = sk_normalize(sp.hstack(blocks).tocsr()) if blocks else None

        if self.encoder and self.encoder.available and not job_text.empty:
            semantic_text = job_text[self.PAIRS].fillna("").agg(" ".join, axis=1)
            vecs = self.encoder.encode_batch(semantic_text.tolist())
            self.job_semantic_matrix = self._l2_normalize(vecs)
        else:
            self.job_semantic_matrix = None

    @staticmethod
    def _l2_normalize(mat: Optional[np.ndarray]) -> Optional[np.ndarray]:
        if mat is None:
            return None
        norms = np.linalg.norm(mat, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return mat / norms

    @staticmethod
    def _replace_sparse_row(matrix: Optional[sp.csr_matrix], row_idx: int, new_row: sp.csr_matrix) -> sp.csr_matrix:
        if matrix is None:
            return new_row.tocsr()
        if row_idx == matrix.shape[0]:
            return sp.vstack([matrix, new_row]).tocsr()
        updated = matrix.tolil(copy=True)
        updated[row_idx] = new_row
        return updated.tocsr()

    @staticmethod
    def _delete_sparse_row(matrix: Optional[sp.csr_matrix], row_idx: int) -> Optional[sp.csr_matrix]:
        if matrix is None:
            return None
        if row_idx < 0 or row_idx >= matrix.shape[0]:
            return matrix
        keep = [i for i in range(matrix.shape[0]) if i != row_idx]
        if not keep:
            return sp.csr_matrix((0, matrix.shape[1]), dtype=matrix.dtype)
        return matrix[keep]

    @staticmethod
    def _replace_dense_row(matrix: Optional[np.ndarray], row_idx: int, new_row: Optional[np.ndarray]) -> Optional[np.ndarray]:
        if new_row is None:
            return matrix
        if matrix is None:
            return np.asarray([new_row], dtype=np.float32)
        if row_idx < 0 or row_idx >= matrix.shape[0]:
            return matrix
        updated = matrix.copy()
        updated[row_idx] = new_row
        return updated

    def _job_row_vector(self, job_row: dict) -> Tuple[sp.csr_matrix, Optional[np.ndarray], Dict[str, str]]:
        """Transform ONE job through the ALREADY-FITTED per-pair vectorizers
        (never re-fits- a realtime job add/update must not shift the
        vocabulary/dimensions every other candidate's stored profile was
        built against)."""
        doc_frame = self._job_text_frame(pd.DataFrame([job_row]))
        blocks = []
        for pair in self.PAIRS:
            vec = self._tfidf.get(pair)
            val = doc_frame[pair].iloc[0] if pair in doc_frame.columns else ""
            if vec is None:
                start, end = self._pair_col_ranges.get(pair, (0, 1))
                blocks.append(sp.csr_matrix((1, end - start)))
                continue
            block = vec.transform([val])
            if pair == "company_name":
                block = block * self.COMPANY_NAME_SCALE
            blocks.append(block)
        tfidf_row = sk_normalize(sp.hstack(blocks).tocsr()) if blocks else sp.csr_matrix((1, 0))

        semantic_vec = None
        if self.encoder and self.encoder.available:
            semantic_text = " ".join(doc_frame[self.PAIRS].fillna("").iloc[0].tolist())
            semantic_vec = self.encoder.encode(semantic_text)
            if semantic_vec is not None:
                n = np.linalg.norm(semantic_vec)
                semantic_vec = semantic_vec / n if n > 0 else semantic_vec
        return tfidf_row, semantic_vec, doc_frame.iloc[0].to_dict()

    def upsert_job(self, job_row: dict) -> None:
        """Incremental counterpart to fit_job_corpus, used after a realtime
        job insert/update so a single change doesn't require rebuilding the
        whole 17-pair TF-IDF space (which would also invalidate every
        candidate's stored behavior_profile, since it's a weighted average
        of THESE job vectors). Without this, self.job_matrix silently falls
        behind self.jobs/content_model's job count after any realtime job
        change, causing a numpy shape mismatch the next time a candidate is
        scored."""
        if self._tfidf is None or not self._pair_col_ranges:
            return  # not fitted yet- fit_job_corpus will pick this job up
        job_id = str(job_row.get("id", ""))
        if not job_id:
            return
        tfidf_row, semantic_vec, doc = self._job_row_vector(job_row)

        if job_id in self._job_id_to_row:
            row_idx = self._job_id_to_row[job_id]
        else:
            row_idx = len(self._job_ids)
            self._job_ids.append(job_id)
            self._job_id_to_row[job_id] = row_idx
            doc["id"] = job_id
            self._job_text = pd.concat([self._job_text, pd.DataFrame([doc])], ignore_index=True) \
                if self._job_text is not None and not self._job_text.empty else pd.DataFrame([doc])

        self.job_matrix = self._replace_sparse_row(self.job_matrix, row_idx, tfidf_row)
        if semantic_vec is not None:
            self.job_semantic_matrix = self._replace_dense_row(self.job_semantic_matrix, row_idx, semantic_vec)

    def delete_job(self, job_id: str) -> None:
        jid = str(job_id)
        row_idx = self._job_id_to_row.pop(jid, None)
        if row_idx is None:
            return
        self._job_ids.pop(row_idx)
        self._job_id_to_row = {j: i for i, j in enumerate(self._job_ids)}
        self.job_matrix = self._delete_sparse_row(self.job_matrix, row_idx)
        self.job_semantic_matrix = None if self.job_semantic_matrix is None else np.delete(self.job_semantic_matrix, row_idx, axis=0)
        if self._job_text is not None and not self._job_text.empty:
            self._job_text = self._job_text[self._job_text["id"].astype(str) != jid].reset_index(drop=True)
        # Any candidate profile built partly from this job's row_pos is now
        # stale (row indices shift after a delete)- drop profiles rather
        # than risk scoring against the wrong job's vector. They rebuild on
        # next full fit_profiles() or the next interaction for that candidate.
        self.behavior_profile = {}
        self.behavior_profile_sources = {}

    def _search_query_row(self, text: str) -> Optional[sp.csr_matrix]:
        """A search query has no associated job (job_searches has no
        clicked-job column)- approximate it as a job-shaped row with
        content only in the skills/title column slices, zero elsewhere, so
        it can still be folded into the same weighted-average accumulation
        as real interacted jobs."""
        if not text or self.job_matrix is None:
            return None
        blocks = []
        for pair in self.PAIRS:
            start, end = self._pair_col_ranges.get(pair, (0, 0))
            width = end - start
            if pair in ("skills", "title") and pair in self._tfidf:
                blocks.append(self._tfidf[pair].transform([text]))
            else:
                blocks.append(sp.csr_matrix((1, width)))
        return sp.hstack(blocks).tocsr()

    # ---- Candidate behavior profiles --------------------------------------

    def _with_effective_weight(self, events: pd.DataFrame) -> pd.DataFrame:
        if events is None or events.empty:
            return pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight", "effective_weight"])
        reference_date = events["event_date"].max()
        age_days = (reference_date - events["event_date"]).dt.days.clip(lower=0).fillna(0)
        out = events.copy()
        out["effective_weight"] = out["weight"] * np.power(0.5, age_days / max(self.cfg.recency_half_life_days, 1))
        return out

    def _build_profile_for_group(self, cand_idx: int, grp: pd.DataFrame, jobs_by_id: Optional[pd.DataFrame]) -> None:
        """Weighted average of the 17-pair job_matrix rows (+ semantic
        vectors) of every job in `grp`, plus any search-query rows for this
        candidate, weighted by effective_weight- the candidate's implicit
        profile lives in the exact same feature space as job_matrix, so it
        can be compared to every job via the same cosine similarity."""
        search_rows = self._search_text_by_candidate.get(int(cand_idx), [])
        total_w = float(grp["effective_weight"].sum() if not grp.empty else 0.0) + sum(w for _, w in search_rows)
        if total_w <= 0:
            self.behavior_profile.pop(int(cand_idx), None)
            self.behavior_profile_sources.pop(int(cand_idx), None)
            return
        tfidf_accum = None
        semantic_accum = None
        sources: List[dict] = []
        for _, ev in grp.iterrows():
            job_pos = int(ev["job_idx"])
            if job_pos < 0 or job_pos >= len(self._idx_to_job_id_ref):
                continue
            job_id = self._idx_to_job_id_ref[job_pos]
            row_pos = self._job_id_to_row.get(job_id)
            if row_pos is None:
                continue
            w = float(ev["effective_weight"]) / total_w
            job_row_vec = self.job_matrix[row_pos] * w
            tfidf_accum = job_row_vec if tfidf_accum is None else tfidf_accum + job_row_vec
            if self.job_semantic_matrix is not None:
                sem_row = self.job_semantic_matrix[row_pos] * w
                semantic_accum = sem_row if semantic_accum is None else semantic_accum + sem_row
            if jobs_by_id is not None and job_id in jobs_by_id.index:
                jr = jobs_by_id.loc[job_id]
                if isinstance(jr, pd.DataFrame):
                    jr = jr.iloc[0]
                sources.append({"title": jr.get("title", ""), "weight": round(w, 4), "job_row_pos": row_pos})

        for query_text, sw in search_rows:
            w = sw / total_w
            row = self._search_query_row(query_text)
            if row is None:
                continue
            row = row * w
            tfidf_accum = row if tfidf_accum is None else tfidf_accum + row

        if tfidf_accum is None:
            self.behavior_profile.pop(int(cand_idx), None)
            self.behavior_profile_sources.pop(int(cand_idx), None)
            return
        norm = float(np.sqrt(tfidf_accum.multiply(tfidf_accum).sum()))
        tfidf_vec = (tfidf_accum / norm).tocsr() if norm > 0 else tfidf_accum.tocsr()
        semantic_vec = None
        if semantic_accum is not None:
            sn = float(np.linalg.norm(semantic_accum))
            semantic_vec = semantic_accum / sn if sn > 0 else None
        self.behavior_profile[int(cand_idx)] = {"tfidf": tfidf_vec, "semantic": semantic_vec}
        sources.sort(key=lambda s: s["weight"], reverse=True)
        self.behavior_profile_sources[int(cand_idx)] = sources[:5]

    def _collect_search_text(self, events: pd.DataFrame) -> None:
        """Search rows arrive in the SAME `events` frame as job interactions
        (entity_type == 'search'), tagged with candidate_idx + query text but
        no job_idx- pull them into their own weighted map instead of trying
        to merge them against a job that doesn't exist in the data model."""
        self._search_text_by_candidate = {}
        self._search_candidate_indices = set()
        if events is None or events.empty or "entity_type" not in events.columns:
            return
        search = events[events["entity_type"].astype(str).str.lower() == "search"]
        if search.empty:
            return
        weighted = self._with_effective_weight(search)
        for cand_idx, grp in weighted.groupby("candidate_idx"):
            texts = [(str(q), float(w)) for q, w in zip(grp.get("query", ""), grp["effective_weight"]) if q]
            if texts:
                self._search_text_by_candidate[int(cand_idx)] = texts
                self._search_candidate_indices.add(int(cand_idx))

    def _collect_search_text_from_queries(self, search_events: pd.DataFrame, candidate_id_to_idx: Dict[str, int]) -> None:
        """Populates the same _search_text_by_candidate map as
        _collect_search_text, but from the raw job_searches query
        (user_id/query/searched_at) used at full-fit time- job_searches has
        no job_idx, so this can't be merged into the main `events` frame the
        way view/save/apply events are; it's fetched and passed separately,
        same as the old fit_search()."""
        if search_events is None or search_events.empty:
            return
        s = search_events.copy()
        s["candidate_idx"] = s["user_id"].astype(str).map(candidate_id_to_idx)
        s = s.dropna(subset=["candidate_idx"])
        if s.empty:
            return
        s["candidate_idx"] = s["candidate_idx"].astype(int)
        s["event_date"] = pd.to_datetime(s["searched_at"], utc=True, errors="coerce")
        s["weight"] = self.TYPE_WEIGHTS.get("search_click", 2.0)
        weighted = self._with_effective_weight(s)
        for cand_idx, grp in weighted.groupby("candidate_idx"):
            texts = [(str(q), float(w)) for q, w in zip(grp["query"], grp["effective_weight"]) if q]
            if texts:
                self._search_text_by_candidate.setdefault(int(cand_idx), []).extend(texts)
                self._search_candidate_indices.add(int(cand_idx))

    def fit_profiles(self, events: pd.DataFrame, jobs: pd.DataFrame, idx_to_job_id: List[str],
                      search_events: Optional[pd.DataFrame] = None,
                      candidate_id_to_idx: Optional[Dict[str, int]] = None) -> None:
        """Full (re)fit of every candidate's behavior profile from their
        complete interaction history- job views/saves/applications (via
        `events`) plus search queries (via `search_events`, fetched
        separately since job_searches has no job_idx to merge on). Call
        fit_job_corpus(jobs) first."""
        self._idx_to_job_id_ref = list(idx_to_job_id) if idx_to_job_id else []
        self._jobs_ref = jobs.copy() if jobs is not None else None
        self.behavior_profile = {}
        self.behavior_profile_sources = {}
        self._search_text_by_candidate = {}
        self._search_candidate_indices = set()

        if search_events is not None and candidate_id_to_idx is not None:
            self._collect_search_text_from_queries(search_events, candidate_id_to_idx)

        if events is None or events.empty or self.job_matrix is None or not self._idx_to_job_id_ref:
            self._event_log = pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight"])
            if not self._search_text_by_candidate:
                return
            weighted = pd.DataFrame(columns=["candidate_idx", "effective_weight"])
        else:
            self._event_log = events.copy()
            self._collect_search_text(events)
            job_events = (events[events["entity_type"].astype(str).str.lower() != "search"]
                          if "entity_type" in events.columns else events)
            weighted = self._with_effective_weight(job_events)
            weighted = weighted.sort_values("effective_weight", ascending=False)
            weighted = weighted.groupby("candidate_idx").head(self.cfg.max_events_per_candidate)

        jobs_by_id = jobs.set_index(jobs["id"].astype(str)) if jobs is not None and not jobs.empty else None
        all_candidates = (set(int(c) for c in weighted["candidate_idx"].unique()) if not weighted.empty else set()) \
            | set(self._search_text_by_candidate.keys())
        for cand_idx in all_candidates:
            grp = weighted[weighted["candidate_idx"].astype(int) == cand_idx] if not weighted.empty else weighted
            self._build_profile_for_group(cand_idx, grp, jobs_by_id)

    def _rebuild_profiles_for(self, candidate_indices: Set[int]) -> None:
        """Incremental counterpart to fit_profiles, used after a realtime
        view/save/apply/search event so a single interaction doesn't require
        refitting every candidate's profile."""
        if self._event_log is None:
            return
        job_events = (self._event_log[self._event_log["entity_type"].astype(str).str.lower() != "search"]
                      if "entity_type" in self._event_log.columns else self._event_log)
        weighted = self._with_effective_weight(job_events) if job_events is not None and not job_events.empty else pd.DataFrame(columns=["candidate_idx"])
        jobs_by_id = (self._jobs_ref.set_index(self._jobs_ref["id"].astype(str))
                      if self._jobs_ref is not None and not self._jobs_ref.empty else None)
        for cand_idx in candidate_indices:
            grp = weighted[weighted["candidate_idx"].astype(int) == int(cand_idx)] if not weighted.empty else weighted
            has_search = int(cand_idx) in self._search_text_by_candidate
            if grp.empty and not has_search:
                self.behavior_profile.pop(int(cand_idx), None)
                self.behavior_profile_sources.pop(int(cand_idx), None)
                continue
            if not grp.empty:
                grp = grp.sort_values("effective_weight", ascending=False).head(self.cfg.max_events_per_candidate)
            self._build_profile_for_group(int(cand_idx), grp, jobs_by_id)

    # ---- Scoring -----------------------------------------------------------

    def score_batch(self, candidate_indices: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Cosine similarity between each candidate's behavior profile and
        every job's own 17-pair vector, blended 50% TF-IDF / 50% semantic.
        Returns (blended, tfidf_only, semantic_only)."""
        n_jobs = self.job_matrix.shape[0] if self.job_matrix is not None else 0
        out = np.zeros((len(candidate_indices), n_jobs), dtype=np.float32)
        tfidf_out = np.zeros((len(candidate_indices), n_jobs), dtype=np.float32)
        semantic_out = np.zeros((len(candidate_indices), n_jobs), dtype=np.float32)
        if n_jobs == 0:
            return out, tfidf_out, semantic_out
        for row, cand_idx in enumerate(candidate_indices):
            profile = self.behavior_profile.get(int(cand_idx))
            if not profile:
                continue
            tfidf_sim = np.clip(profile["tfidf"].dot(self.job_matrix.T).toarray()[0], 0.0, 1.0)
            tfidf_out[row] = tfidf_sim
            if profile.get("semantic") is not None and self.job_semantic_matrix is not None:
                sem_sim = np.clip(self.job_semantic_matrix @ profile["semantic"], 0.0, 1.0)
                semantic_out[row] = sem_sim
                out[row] = (1 - self.SEMANTIC_WEIGHT) * tfidf_sim + self.SEMANTIC_WEIGHT * sem_sim
            else:
                out[row] = tfidf_sim
        return out, tfidf_out, semantic_out

    def get_profile_sources(self, candidate_idx: Optional[int]) -> List[dict]:
        if candidate_idx is None:
            return []
        return self.behavior_profile_sources.get(int(candidate_idx), [])

    def get_interest_profile(self, candidate_idx: int, top_k: int = 3) -> Dict[str, List[str]]:
        """The evolving 'Interest Profile'- top skill/title terms drawn from
        the jobs that most strongly built this candidate's profile (weighted
        aggregate, not a single job); replaces the old categorical-attribute
        top-K (department/job_type/...) now that the profile is text-based."""
        sources = self.behavior_profile_sources.get(int(candidate_idx), [])
        if not sources or self._job_text is None:
            return {}
        titles, skills = [], []
        for src in sources[:top_k]:
            row_pos = src.get("job_row_pos")
            if row_pos is None:
                continue
            jr = self._job_text.iloc[row_pos]
            if jr.get("title"):
                titles.append(jr["title"])
            if jr.get("skills"):
                skills.extend(jr["skills"].split()[:5])
        profile: Dict[str, List[str]] = {}
        if titles:
            profile["title"] = titles[:top_k]
        if skills:
            profile["skills"] = list(dict.fromkeys(skills))[:top_k * 3]
        return profile

    @staticmethod
    def _correct_typo(term: str, vocabulary: Set[str], min_score: int = 82) -> Optional[str]:
        """Optional RapidFuzz-based typo correction for the explainability
        output's corrected_terms- silently a no-op if rapidfuzz isn't
        installed. Scoring itself is already typo-tolerant via character
        n-grams + semantic embeddings; this is purely cosmetic/explanatory."""
        try:
            from rapidfuzz import process, fuzz
        except ImportError:
            return None
        if not vocabulary:
            return None
        match = process.extractOne(term, list(vocabulary), scorer=fuzz.ratio, score_cutoff=min_score)
        return match[0] if match and match[0].lower() != term.lower() else None

    def explain_detail(self, candidate_idx: Optional[int], job_col: int) -> dict:
        """Full per-pair breakdown of the behavior score for ONE candidate/
        job pair- matched terms + a genuine standalone TF-IDF cosine per
        pair, the standalone semantic score, and the final blended
        behavior_score. Deliberately not called during bulk score_batch
        (would be O(candidates x jobs) at per-term granularity)- only for
        the top-N shortlist actually shown to a user."""
        empty = {
            "matched_terms_by_pair": {}, "tfidf_score_by_pair": {},
            "matched_skills": [], "matched_languages": [], "matched_location": [],
            "matched_title": [], "corrected_terms": {}, "semantic_score": None,
            "behavior_score": 0.0,
        }
        if candidate_idx is None or self._job_text is None or job_col >= len(self._job_text):
            return empty
        sources = self.behavior_profile_sources.get(int(candidate_idx))
        profile = self.behavior_profile.get(int(candidate_idx))
        if not sources or not profile:
            return empty

        job_row = self._job_text.iloc[job_col]
        matched_terms: Dict[str, List[str]] = {}
        tfidf_score_by_pair: Dict[str, float] = {}
        corrected_terms: Dict[str, str] = {}

        for pair in self.PAIRS:
            vec = self._tfidf.get(pair)
            job_val = job_row.get(pair, "")
            if vec is None or not job_val:
                matched_terms[pair] = []
                tfidf_score_by_pair[pair] = 0.0
                continue

            job_vec = sk_normalize(vec.transform([job_val]))
            accum = None
            total_w = 0.0
            source_terms: Set[str] = set()
            for src in sources:
                row_pos = src.get("job_row_pos")
                if row_pos is None:
                    continue
                src_val = self._job_text.iloc[row_pos].get(pair, "")
                if not src_val:
                    continue
                w = float(src.get("weight", 0.0))
                src_vec = sk_normalize(vec.transform([src_val])) * w
                accum = src_vec if accum is None else accum + src_vec
                total_w += w
                source_terms.update(src_val.split())

            if accum is None or total_w <= 0:
                matched_terms[pair] = []
                tfidf_score_by_pair[pair] = 0.0
                continue

            cand_vec = sk_normalize(accum)
            tfidf_score_by_pair[pair] = round(float(cand_vec.dot(job_vec.T)[0, 0]), 4)
            job_items = [t for t in job_val.split() if t]
            direct_matches = [t for t in dict.fromkeys(job_items) if t in source_terms]
            matched_terms[pair] = direct_matches

            if pair in self.CHAR_NGRAM_PAIRS and source_terms:
                for t in job_items:
                    if t in source_terms or t in direct_matches:
                        continue
                    fix = self._correct_typo(t, source_terms)
                    if fix:
                        corrected_terms[t] = fix

        semantic_score = None
        if profile.get("semantic") is not None and self.job_semantic_matrix is not None:
            semantic_score = round(float(self.job_semantic_matrix[job_col] @ profile["semantic"]), 4)

        tfidf_full = float(profile["tfidf"].dot(self.job_matrix[job_col].T).toarray()[0, 0]) if self.job_matrix is not None else 0.0
        behavior_score = ((1 - self.SEMANTIC_WEIGHT) * tfidf_full + self.SEMANTIC_WEIGHT * semantic_score) \
            if semantic_score is not None else tfidf_full

        return {
            "matched_terms_by_pair": matched_terms,
            "tfidf_score_by_pair": tfidf_score_by_pair,
            "matched_skills": matched_terms.get("skills", []),
            "matched_languages": matched_terms.get("languages", []),
            "matched_location": matched_terms.get("location", []),
            "matched_title": matched_terms.get("title", []),
            "corrected_terms": corrected_terms,
            "semantic_score": semantic_score,
            "behavior_score": round(float(np.clip(behavior_score, 0.0, 1.0)), 4),
        }

    def explain(self, candidate_idx: int, job_row: pd.Series, has_search_history: bool = None) -> List[str]:
        """Human-readable one-line reasons this job matches this candidate's
        learned behavior- a short summary, not the full per-pair breakdown
        (see explain_detail for that)."""
        reasons: List[str] = []
        sources = self.behavior_profile_sources.get(int(candidate_idx), [])
        if sources:
            top_titles = ", ".join(s["title"] for s in sources[:2] if s.get("title"))
            if top_titles:
                reasons.append(f"Similar to jobs you engaged with (e.g. {top_titles})- skills, title, location, and more.")
        if has_search_history is None:
            has_search_history = int(candidate_idx) in self._search_candidate_indices
        if has_search_history:
            reasons.append("Matches terms you've searched for.")
        return reasons

    def apply_incremental_updates(self, events: List[dict], jobs: pd.DataFrame,
                                  job_id_to_idx: Dict[str, int], candidate_id_to_idx: Dict[str, int]) -> None:
        if not events:
            return

        behavior_rows: List[dict] = []
        search_rows: List[dict] = []
        affected_candidates: Set[int] = set()

        for event in events:
            entity_type = str(event.get("entity_type", "")).lower()
            operation = str(event.get("operation", "")).lower()
            payload = event.get("payload") or {}
            candidate_id = event.get("candidate_id") or payload.get("candidate_id") or payload.get("user_id")
            job_id = event.get("job_id") or payload.get("job_id")
            candidate_idx = candidate_id_to_idx.get(str(candidate_id)) if candidate_id is not None else None
            job_idx = job_id_to_idx.get(str(job_id)) if job_id is not None else None

            if entity_type == "search" and candidate_id is not None:
                if candidate_idx is not None:
                    search_rows.append({
                        "candidate_idx": int(candidate_idx),
                        "query": str(payload.get("query", event.get("query", ""))),
                        "weight": self.TYPE_WEIGHTS.get("search_click", 2.0),
                    })
                    affected_candidates.add(int(candidate_idx))
                continue

            if candidate_idx is None or job_idx is None:
                continue

            if operation in {"delete", "removed"}:
                continue

            behavior_rows.append({
                "candidate_idx": int(candidate_idx),
                "job_idx": int(job_idx),
                "entity_type": entity_type,
                "event_date": pd.to_datetime(payload.get("event_date") or event.get("created_at") or datetime.utcnow(), utc=True),
                "weight": float(payload.get("weight") or payload.get("score") or self.TYPE_WEIGHTS.get(entity_type, 1.0)),
            })
            affected_candidates.add(int(candidate_idx))

        if behavior_rows:
            incoming = pd.DataFrame(behavior_rows)
            incoming["event_date"] = pd.to_datetime(incoming["event_date"], utc=True)
            self._event_log = pd.concat([self._event_log, incoming], ignore_index=True) if not self._event_log.empty else incoming
            self._event_log["event_date"] = pd.to_datetime(self._event_log["event_date"], utc=True)

        if search_rows:
            for row in search_rows:
                cand_idx = row["candidate_idx"]
                existing = self._search_text_by_candidate.setdefault(cand_idx, [])
                existing.append((row["query"], float(row["weight"])))
                self._search_candidate_indices.add(cand_idx)

        if affected_candidates:
            self._rebuild_profiles_for(affected_candidates)


def freshness_scores(jobs: pd.DataFrame) -> Tuple[np.ndarray, bool]:
    """Exponential recency decay: a job posted today scores 1.0, ~0.37 at 30
    days old, ~0.05 at 90 days- freshly posted jobs get a real but modest
    boost rather than dominating the ranking.

    Returns (scores, has_freshness). has_freshness is False only when EVERY
    job in the batch has no usable created_at- there's no real recency
    signal to compute, so the caller excludes and redistributes this
    signal's weight (via HybridWeights.normalized(has_freshness=...))
    instead of scoring every job as a fabricated uniform "30 days old"."""
    now = pd.Timestamp.now(tz="UTC")
    created = pd.to_datetime(jobs["created_at"], utc=True, errors="coerce")
    days_old = (now - created).dt.total_seconds() / 86400
    has_freshness = bool(days_old.notna().any())
    days_old = days_old.fillna(days_old.max() if has_freshness else 30.0)
    scores = np.exp(-np.clip(days_old.values, 0, None) / 30.0).astype(np.float32)
    return scores, has_freshness


def popularity_scores(jobs: pd.DataFrame) -> np.ndarray:
    """application_count normalized within the job's own department where
    possible (a "popular" education job and a "popular" engineering job have
    very different absolute application counts) falling back to a global
    normalization when a department has too few postings to compare within."""
    counts = pd.to_numeric(jobs.get("application_count", 0), errors="coerce").fillna(0).values.astype(np.float32)
    out = np.zeros_like(counts)
    departments = jobs.get("department")
    if departments is not None:
        dept_vals = departments.fillna("__none__").values
        for dept in pd.unique(dept_vals):
            mask = dept_vals == dept
            if mask.sum() >= 3:
                m = counts[mask].max()
                out[mask] = counts[mask] / m if m > 0 else 0.0
    unset = out == 0
    if unset.any():
        m = counts.max()
        out[unset] = counts[unset] / m if m > 0 else 0.0
    return out


def business_rule_modifier(candidate_row: dict, job_row: pd.Series) -> Tuple[float, List[str]]:
    """Policy adjustment applied AFTER the weighted sum, not a similarity
    score: does this job clear concrete business bars for this candidate?
    Currently checks salary fit (candidate's stated expected_salary vs the
    job's posted range) and employer verification. Returns (multiplier,
    reason_strings)- multiplier stays close to 1.0 (0.85-1.15) so it nudges
    rather than overrides the other five signals."""
    modifier = 1.0
    reasons: List[str] = []

    expected = candidate_row.get("expected_salary") if candidate_row else None
    if isinstance(expected, dict) and expected.get("min") is not None:
        job_min = job_row.get("salary_min")
        job_max = job_row.get("salary_max")
        try:
            cand_min = float(expected["min"])
            if job_max is not None and pd.notna(job_max) and float(job_max) >= cand_min:
                modifier += 0.10
                reasons.append("This job's salary range meets your expected salary.")
            elif job_min is not None and pd.notna(job_min) and job_max is not None and pd.notna(job_max) \
                    and float(job_max) < cand_min:
                modifier -= 0.10
        except (TypeError, ValueError):
            pass

    if bool(job_row.get("verification_badge")):
        modifier += 0.03
        reasons.append("Posted by a verified employer.")

    return max(0.85, min(1.15, modifier)), reasons


def _parse_age_requirement(age_req_str: Optional[str]) -> Tuple[Optional[int], Optional[int]]:
    """Compact port of ai_job_matcher_og.py's Factor4 age-requirement parser
    (X+, under X, X-Y, exact X)- enough pattern coverage to compute an
    age-fit score without duplicating its full regex suite."""
    if not age_req_str or not isinstance(age_req_str, str):
        return None, None
    s = age_req_str.strip().lower()
    if any(k in s for k in ["not required", "any", "none", "n/a"]):
        return None, None
    m = re.search(r'(\d+)\s*\+', s) or re.search(r'(?:above|over|minimum|at least)\s+(\d+)', s)
    if m:
        return int(m.group(1)), None
    m = re.search(r'(?:under|below|less than|maximum|up to)\s+(\d+)', s)
    if m:
        return None, int(m.group(1))
    m = re.search(r'(\d+)\s*(?:-|to)\s*(\d+)', s)
    if m:
        lo, hi = int(m.group(1)), int(m.group(2))
        return (lo, hi) if lo <= hi else (hi, lo)
    m = re.fullmatch(r'(\d+)', s)
    if m:
        age = int(m.group(1))
        return age, age
    return None, None


def age_fit(candidate_row: Optional[dict], job_row: pd.Series) -> Tuple[float, Optional[str], Optional[int], Optional[str]]:
    """Age-requirement fit- same underlying data ai_job_matcher_og.py's
    Factor4 uses (candidate date_of_birth vs job.education_required.
    age_requirement). A light nudge (0.85-1.0), not a hard filter, since it's
    a minor factor there too (5% of the 15% Preferences weight). Returns
    (modifier, reason, candidate_age, job_age_requirement) so callers can
    surface the raw values, not just the multiplier."""
    edu = job_row.get("education_required") or {}
    age_req = edu.get("age_requirement") if isinstance(edu, dict) else None
    dob = candidate_row.get("date_of_birth") if candidate_row else None
    candidate_age = None
    if dob is not None and pd.notna(dob):
        try:
            dob_d = dob if isinstance(dob, date) else pd.to_datetime(dob).date()
            today = date.today()
            candidate_age = today.year - dob_d.year - ((today.month, today.day) < (dob_d.month, dob_d.day))
        except Exception:
            candidate_age = None
    if not age_req:
        return 1.0, None, candidate_age, age_req
    if candidate_age is None:
        # Job states an age requirement but we have no DOB to check it
        # against -- neutral (no adjustment), same as "no requirement".
        # A guessed penalty here would itself be an unjustified default;
        # we genuinely can't tell whether the candidate qualifies or not.
        return 1.0, "Age requirement specified but candidate age unknown -- not scored either way.", None, age_req
    min_age, max_age = _parse_age_requirement(age_req)
    if min_age is None and max_age is None:
        return 1.0, None, candidate_age, age_req
    if (min_age is None or candidate_age >= min_age) and (max_age is None or candidate_age <= max_age):
        return 1.0, None, candidate_age, age_req
    return 0.85, f"Candidate age ({candidate_age}) is outside this job's stated age requirement ({age_req}).", candidate_age, age_req


# ==========================================================================
# 8. HYBRID RANKING
# ==========================================================================

class HybridRanker:
    def __init__(self, weights: HybridWeights):
        self.weights = weights

    def combine(self, content: np.ndarray, behavior: np.ndarray, collaborative: np.ndarray,
                freshness: np.ndarray, popularity: np.ndarray) -> np.ndarray:
        w = self.weights
        return (w.content * content + w.behavior * behavior + w.collaborative * collaborative
                + w.freshness * freshness + w.popularity * popularity)

    @staticmethod
    def top_k_indices(scores: np.ndarray, k: int) -> Tuple[np.ndarray, np.ndarray]:
        k = min(k, scores.shape[1]) if scores.shape[1] else 0
        if k == 0:
            return np.empty((scores.shape[0], 0), dtype=int), np.empty((scores.shape[0], 0))
        part = np.argpartition(-scores, kth=k - 1, axis=1)[:, :k]
        row_idx = np.arange(scores.shape[0])[:, None]
        part_scores = scores[row_idx, part]
        order = np.argsort(-part_scores, axis=1)
        return part[row_idx, order], part_scores[row_idx, order]


# ==========================================================================
# 8.5 MODEL PERSISTENCE- save the expensive-to-fit pieces (ContentBasedModel/
# BehaviorModel's vectorizers + matrices, the DataFrames they were fit from)
# so a restart doesn't have to redo ~25-45s of TF-IDF/semantic-embedding
# fitting when nothing that would change them actually changed.
# ==========================================================================

class ModelStore:
    """Persist/restore the trained engine state across a process restart.

    Uses plain pickle for everything (sklearn vectorizers, scipy sparse
    matrices, numpy arrays, pandas DataFrames, the PyTorch nn.Module all
    round-trip through it fine)- this is deliberately NOT meant to be
    portable across Python/library versions or machines, only across a
    restart of the SAME deployed service, so pickle's simplicity outweighs
    its portability limitations here.

    metadata.json (human-readable, checked separately from the pickle so it
    can be inspected/compared without unpickling anything) records: version
    (auto-incrementing), created_at, training_duration_seconds, dataset
    counts, vocabulary sizes per pair, the fingerprints used to decide
    whether this snapshot is still valid, and training_reason (why this
    particular save happened- full retrain vs. interactions-only refresh)."""

    DIR = Path(__file__).parent / "models"
    STATE_FILE = DIR / "state.pkl"
    METADATA_FILE = DIR / "metadata.json"

    @classmethod
    def load(cls) -> Optional[dict]:
        """Returns {"metadata": {...}, "state": {...}} or None if nothing
        persisted yet, or the persisted snapshot is unreadable/corrupt (in
        which case the caller should fall back to a full fit- never let a
        bad cache file block startup)."""
        if not cls.STATE_FILE.exists() or not cls.METADATA_FILE.exists():
            return None
        try:
            with open(cls.METADATA_FILE, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            with open(cls.STATE_FILE, "rb") as f:
                state = pickle.load(f)
            return {"metadata": metadata, "state": state}
        except Exception as e:
            log.warning("ModelStore.load failed (%s)- falling back to full training.", e)
            return None

    @classmethod
    def save(cls, state: dict, metadata: dict) -> None:
        """Writes to temp files then atomically renames into place, so a
        crash mid-write never leaves a half-written, corrupt snapshot that
        the next startup would try (and fail) to load."""
        cls.DIR.mkdir(parents=True, exist_ok=True)
        try:
            tmp_state = cls.STATE_FILE.with_suffix(".pkl.tmp")
            with open(tmp_state, "wb") as f:
                pickle.dump(state, f, protocol=pickle.HIGHEST_PROTOCOL)
            tmp_state.replace(cls.STATE_FILE)

            tmp_meta = cls.METADATA_FILE.with_suffix(".json.tmp")
            with open(tmp_meta, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2, default=str)
            tmp_meta.replace(cls.METADATA_FILE)
            log.info("ModelStore: saved model v%s (%s)", metadata.get("version"), metadata.get("training_reason"))
        except Exception as e:
            log.warning("ModelStore.save failed (%s)- next restart will retrain from scratch.", e)

    @staticmethod
    def next_version(prev_metadata: Optional[dict]) -> str:
        """Simple semantic-ish counter: a structural change (full retrain)
        bumps the minor version; an interactions-only refresh bumps the
        patch version. Not full semver- just enough to see at a glance
        whether the last save was a full retrain or a light refresh."""
        if not prev_metadata or "version" not in prev_metadata:
            return "1.0.0"
        try:
            major, minor, patch = (int(x) for x in prev_metadata["version"].split("."))
        except Exception:
            return "1.0.0"
        return f"{major}.{minor}.{patch}"


# ==========================================================================
# 9. RECOMMENDATION ENGINE (orchestrator)
# ==========================================================================

class RecommendationEngine:
    def __init__(self, cfg: RecommenderConfig):
        self.cfg = cfg
        self.db = Database(cfg.db)
        self.preprocessor = Preprocessor(cfg)
        # Loaded ONCE (model load is the expensive part) and shared by every
        # ContentBasedModel refit- encoding itself still only happens per
        # fit()/cold-start call, cached inside the encoder.
        self.semantic_encoder = SemanticEncoder()
        self.content_model = ContentBasedModel(cfg.content, encoder=self.semantic_encoder)
        self.collaborative_model = CollaborativeModel(cfg.mf)
        self.behavior_model = BehaviorModel(cfg.behavior, encoder=self.semantic_encoder)
        self.ranker = HybridRanker(cfg.hybrid_weights)

        self.candidates: Optional[pd.DataFrame] = None
        self.jobs: Optional[pd.DataFrame] = None
        self.skills_df: Optional[pd.DataFrame] = None
        self.education_df: Optional[pd.DataFrame] = None
        self.work_df: Optional[pd.DataFrame] = None
        self.certifications_df: Optional[pd.DataFrame] = None
        self.ignored: Optional[pd.DataFrame] = None
        self.events: Optional[pd.DataFrame] = None  # candidate_idx/job_idx interaction log, for collaborative explanations
        self.views: Optional[pd.DataFrame] = None
        self.applications: Optional[pd.DataFrame] = None
        self.saves: Optional[pd.DataFrame] = None
        self.incomplete_applications: Optional[pd.DataFrame] = None
        self.search_events: Optional[pd.DataFrame] = None
        self._realtime_queue: "queue.Queue[dict]" = queue.Queue(maxsize=5000)
        self._realtime_stop = threading.Event()
        self._realtime_worker: Optional[threading.Thread] = None
        self._realtime_listener: Optional[threading.Thread] = None
        self._collab_retrain_pending = threading.Event()
        self._collab_retrain_lock = threading.Lock()
        self._collab_retrain_running = False
        self._realtime_started = False
        self.last_trained_at: Optional[datetime] = None
        self._lock = threading.RLock()

    def prepare(self) -> dict:
        """Decides, via cheap (COUNT, MAX(timestamp)) fingerprints, whether a
        persisted model can be reused as-is, partially refreshed (only
        interactions changed- the expensive TF-IDF/semantic fitting is
        still valid), or must be fully retrained (jobs/candidates changed,
        or nothing usable is persisted yet). See ModelStore's docstring for
        why pickle, and _persist() for what gets stripped before saving."""
        t0 = time.time()
        fingerprints = self.db.fetch_fingerprints()
        persisted = ModelStore.load()
        prev_fp = ((persisted or {}).get("metadata") or {}).get("fingerprints") or {}

        jobs_same = persisted is not None and list(fingerprints["jobs"]) == list(prev_fp.get("jobs") or [])
        cands_same = persisted is not None and list(fingerprints["candidates"]) == list(prev_fp.get("candidates") or [])
        inter_same = persisted is not None and list(fingerprints["interactions"]) == list(prev_fp.get("interactions") or [])

        if jobs_same and cands_same and inter_same:
            return self._restore_cache_hit(persisted, t0)
        if jobs_same and cands_same:
            return self._refresh_interactions_only(persisted, fingerprints, t0)
        return self._full_fit(fingerprints, t0)

    def _restore_cache_hit(self, persisted: dict, t0: float) -> dict:
        """Nothing changed since the last save at all- skip fetching AND
        fitting entirely."""
        state = persisted["state"]
        with self._lock:
            self.candidates, self.jobs = state["candidates"], state["jobs"]
            self.skills_df, self.education_df = state["skills_df"], state["education_df"]
            self.work_df, self.certifications_df = state["work_df"], state["certifications_df"]
            self.ignored = state["ignored"]
            self.views, self.applications, self.saves = state["views"], state["applications"], state["saves"]
            self.incomplete_applications = state.get("incomplete_applications", pd.DataFrame(columns=["user_id", "job_id", "event_date"]))
            self.search_events = state["search_events"]
            self.events = state["events"]
            self.preprocessor = state["preprocessor"]
            self.content_model = state["content_model"]
            self.content_model.encoder = self.semantic_encoder
            self.behavior_model = state["behavior_model"]
            self.behavior_model.encoder = self.semantic_encoder
            self.collaborative_model = state["collaborative_model"]
            self.last_trained_at = datetime.now()

        meta = persisted["metadata"]
        stats = {
            "n_candidates": len(self.candidates), "n_jobs": len(self.jobs),
            "n_interactions": int(meta.get("n_interactions") or 0),
            "collaborative_trained": self.collaborative_model.trained,
            "seconds": round(time.time() - t0, 1),
            "training_reason": "cache-hit (no changes detected)",
            "model_version": meta.get("version"),
        }
        log.info("Loaded persisted model v%s, no changes detected: %s", meta.get("version"), stats)
        return stats

    def _refresh_interactions_only(self, persisted: dict, fingerprints: dict, t0: float) -> dict:
        """Jobs/candidates are unchanged, so the expensive per-pair
        vectorizer fitting (ContentBasedModel.fit / BehaviorModel.
        fit_job_corpus) is still valid- reused as-is. Only what genuinely
        depends on interaction data is rebuilt: collaborative filtering
        (cheap, a few epochs) and behavior_model's candidate PROFILES
        (fit_profiles- a weighted average of already-fitted vectors, no
        new TF-IDF/semantic computation)."""
        state = persisted["state"]
        candidates, jobs = state["candidates"], state["jobs"]
        skills_df, education_df = state["skills_df"], state["education_df"]
        work_df, certifications_df = state["work_df"], state["certifications_df"]
        preprocessor = state["preprocessor"]
        content_model = state["content_model"]
        content_model.encoder = self.semantic_encoder

        views = self.db.fetch_view_events()
        applications = self.db.fetch_application_events()
        saves = self.db.fetch_save_events()
        incomplete_applications = self.db.fetch_incomplete_application_events()
        ignored = self.db.fetch_ignored_pairs()
        search_events = self.db.fetch_search_events()

        events = preprocessor.build_events(views, applications, saves, incomplete_applications)
        matrix = preprocessor.build_interaction_matrix(events, len(candidates), len(jobs))

        hard_negatives: Dict[int, List[int]] = {}
        if not ignored.empty:
            ig = ignored.copy()
            ig["candidate_idx"] = ig["user_id"].astype(str).map(preprocessor.candidate_id_to_idx)
            ig["job_idx"] = ig["job_id"].astype(str).map(preprocessor.job_id_to_idx)
            ig = ig.dropna(subset=["candidate_idx", "job_idx"])
            for cand_idx, sub in ig.groupby(ig["candidate_idx"].astype(int)):
                hard_negatives[int(cand_idx)] = sub["job_idx"].astype(int).tolist()

        collaborative_model = CollaborativeModel(self.cfg.mf)
        collaborative_model.fit(matrix, len(candidates), len(jobs), self.cfg.interaction_weights.max_weight,
                                 hard_negatives=hard_negatives)

        behavior_model = state["behavior_model"]
        behavior_model.encoder = self.semantic_encoder
        behavior_model.fit_profiles(events, jobs, preprocessor.idx_to_job_id,
                                     search_events=search_events, candidate_id_to_idx=preprocessor.candidate_id_to_idx)

        with self._lock:
            self.candidates, self.jobs = candidates, jobs
            self.skills_df, self.education_df, self.work_df = skills_df, education_df, work_df
            self.certifications_df = certifications_df
            self.ignored = ignored
            self.views, self.applications, self.saves = views, applications, saves
            self.incomplete_applications = incomplete_applications
            self.search_events = search_events
            self.events = events
            self.preprocessor = preprocessor
            self.content_model = content_model
            self.collaborative_model = collaborative_model
            self.behavior_model = behavior_model
            self.last_trained_at = datetime.now()

        stats = {
            "n_candidates": len(candidates), "n_jobs": len(jobs),
            "n_interactions": int(matrix.nnz), "collaborative_trained": collaborative_model.trained,
            "seconds": round(time.time() - t0, 1),
            "training_reason": "interactions-only refresh (jobs/candidates unchanged)",
        }
        log.info("Interactions-only refresh complete: %s", stats)
        self._persist(content_model, behavior_model, collaborative_model, jobs, candidates,
                      skills_df, education_df, work_df, certifications_df, ignored,
                      views, applications, saves, search_events, events, preprocessor,
                      fingerprints, stats, bump="patch", incomplete_applications=incomplete_applications)
        return stats

    def _full_fit(self, fingerprints: dict, t0: float) -> dict:
        """Structural change (jobs and/or candidates added/updated/removed)
        or nothing valid persisted yet- the full fit, unchanged from
        before this feature existed. Always ends by persisting the result,
        so the NEXT restart can potentially skip straight to a cache hit or
        an interactions-only refresh."""
        candidates = self.db.fetch_candidates()
        jobs = self.db.fetch_active_jobs()
        skills_df = self.db.fetch_candidate_skills()
        education_df = self.db.fetch_candidate_education()
        work_df = self.db.fetch_candidate_work_experience()
        certifications_df = self.db.fetch_candidate_certifications()
        views = self.db.fetch_view_events()
        applications = self.db.fetch_application_events()
        saves = self.db.fetch_save_events()
        incomplete_applications = self.db.fetch_incomplete_application_events()
        ignored = self.db.fetch_ignored_pairs()
        search_events = self.db.fetch_search_events()

        if candidates.empty or jobs.empty:
            log.warning("No candidates or no active jobs- engine left untrained.")
            with self._lock:
                self.candidates, self.jobs = candidates, jobs
            return {"n_candidates": len(candidates), "n_jobs": len(jobs), "n_interactions": 0, "collaborative_trained": False,
                    "training_reason": "full retrain (empty dataset)"}

        preprocessor = Preprocessor(self.cfg)
        preprocessor.fit_id_maps(candidates, jobs)
        events = preprocessor.build_events(views, applications, saves, incomplete_applications)
        matrix = preprocessor.build_interaction_matrix(events, len(candidates), len(jobs))

        content_model = ContentBasedModel(self.cfg.content, encoder=self.semantic_encoder)
        content_model.fit(candidates, jobs, skills_df, education_df, work_df, certifications_df)

        hard_negatives: Dict[int, List[int]] = {}
        if not ignored.empty:
            ig = ignored.copy()
            ig["candidate_idx"] = ig["user_id"].astype(str).map(preprocessor.candidate_id_to_idx)
            ig["job_idx"] = ig["job_id"].astype(str).map(preprocessor.job_id_to_idx)
            ig = ig.dropna(subset=["candidate_idx", "job_idx"])
            for cand_idx, sub in ig.groupby(ig["candidate_idx"].astype(int)):
                hard_negatives[int(cand_idx)] = sub["job_idx"].astype(int).tolist()

        collaborative_model = CollaborativeModel(self.cfg.mf)
        collaborative_model.fit(matrix, len(candidates), len(jobs), self.cfg.interaction_weights.max_weight,
                                 hard_negatives=hard_negatives)

        behavior_model = BehaviorModel(self.cfg.behavior, encoder=self.semantic_encoder)
        behavior_model.fit_job_corpus(jobs)
        behavior_model.fit_profiles(events, jobs, preprocessor.idx_to_job_id,
                                     search_events=search_events, candidate_id_to_idx=preprocessor.candidate_id_to_idx)

        with self._lock:
            self.candidates, self.jobs = candidates, jobs
            self.skills_df, self.education_df, self.work_df = skills_df, education_df, work_df
            self.certifications_df = certifications_df
            self.ignored = ignored
            self.views, self.applications, self.saves = views, applications, saves
            self.incomplete_applications = incomplete_applications
            self.search_events = search_events
            self.events = events
            self.preprocessor = preprocessor
            self.content_model = content_model
            self.collaborative_model = collaborative_model
            self.behavior_model = behavior_model
            self.last_trained_at = datetime.now()

        stats = {
            "n_candidates": len(candidates), "n_jobs": len(jobs),
            "n_interactions": int(matrix.nnz), "collaborative_trained": collaborative_model.trained,
            "seconds": round(time.time() - t0, 1),
            "training_reason": "full retrain (jobs/candidates changed, or no valid cache)",
        }
        log.info("Training complete: %s", stats)
        self._persist(content_model, behavior_model, collaborative_model, jobs, candidates,
                      skills_df, education_df, work_df, certifications_df, ignored,
                      views, applications, saves, search_events, events, preprocessor,
                      fingerprints, stats, bump="minor", incomplete_applications=incomplete_applications)
        return stats

    def _persist(self, content_model, behavior_model, collaborative_model, jobs, candidates,
                 skills_df, education_df, work_df, certifications_df, ignored,
                 views, applications, saves, search_events, events, preprocessor,
                 fingerprints: dict, stats: dict, bump: str,
                 incomplete_applications: Optional[pd.DataFrame] = None) -> None:
        """Shallow-copies content_model/behavior_model with .encoder
        stripped (the SentenceTransformer is loaded once per process and
        reused- pickling it too would bloat the snapshot for no benefit,
        and re-attaching self.semantic_encoder on load is trivial) so saving
        never touches the live in-memory objects still serving concurrent
        requests. Never raises- a failed save just means the next restart
        does a full retrain, same as today's behavior with no persistence."""
        try:
            cm = copy.copy(content_model)
            cm.encoder = None
            bm = copy.copy(behavior_model)
            bm.encoder = None

            state = {
                "content_model": cm, "behavior_model": bm, "collaborative_model": collaborative_model,
                "jobs": jobs, "candidates": candidates,
                "skills_df": skills_df, "education_df": education_df,
                "work_df": work_df, "certifications_df": certifications_df,
                "ignored": ignored, "views": views, "applications": applications, "saves": saves,
                "incomplete_applications": incomplete_applications,
                "search_events": search_events, "events": events, "preprocessor": preprocessor,
            }

            prev_meta = (ModelStore.load() or {}).get("metadata") or {}
            if "version" not in prev_meta:
                version = "1.0.0"
            else:
                try:
                    major, minor, patch = (int(x) for x in str(prev_meta["version"]).split("."))
                except Exception:
                    major, minor, patch = 1, 0, 0
                if bump == "minor":
                    minor, patch = minor + 1, 0
                else:
                    patch += 1
                version = f"{major}.{minor}.{patch}"

            vocab_sizes = {pair: len(vec.vocabulary_) for pair, vec in (behavior_model._tfidf or {}).items()}

            metadata = {
                "version": version,
                "created_at": datetime.now().isoformat(),
                "training_duration_seconds": stats.get("seconds"),
                "training_reason": stats.get("training_reason"),
                "n_jobs": stats.get("n_jobs"), "n_candidates": stats.get("n_candidates"),
                "n_interactions": stats.get("n_interactions"),
                "vocabulary_sizes": vocab_sizes,
                "fingerprints": fingerprints,
            }
            ModelStore.save(state, metadata)
        except Exception as e:
            log.warning("Persisting trained model failed (%s)- next restart will retrain from scratch.", e)

    def start_realtime_updates(self) -> None:
        if self._realtime_started:
            return
        self._realtime_started = True
        self._realtime_stop.clear()
        self._realtime_worker = threading.Thread(target=self._realtime_worker_loop, daemon=True)
        self._realtime_listener = threading.Thread(target=self._pg_listener_loop, daemon=True)
        self._realtime_worker.start()
        self._realtime_listener.start()
        log.info("Realtime update subsystem started on channel %s", self.cfg.realtime_notification_channel)

    def stop_realtime_updates(self) -> None:
        self._realtime_stop.set()

    def _normalize_event(self, event: Any) -> Optional[dict]:
        if event is None:
            return None
        if isinstance(event, RealtimeEvent):
            event = event.__dict__
        if not isinstance(event, dict):
            return None
        payload = event.get("payload") or {}
        if not isinstance(payload, dict):
            payload = {"value": payload}
        normalized = {
            "event_type": str(event.get("event_type") or payload.get("event_type") or "recommendation_update"),
            "entity_type": str(event.get("entity_type") or payload.get("entity_type") or payload.get("table") or "unknown"),
            "operation": str(event.get("operation") or payload.get("operation") or "upsert").lower(),
            "entity_id": event.get("entity_id") or payload.get("entity_id"),
            "candidate_id": event.get("candidate_id") or payload.get("candidate_id") or payload.get("user_id"),
            "job_id": event.get("job_id") or payload.get("job_id"),
            "payload": payload,
            "source": event.get("source") or "webhook",
            "created_at": event.get("created_at") or payload.get("created_at") or datetime.utcnow().isoformat(),
        }
        return normalized

    def enqueue_realtime_events(self, events: Any) -> int:
        if events is None:
            return 0
        if isinstance(events, dict):
            events = [events]
        accepted = 0
        for raw in events:
            event = self._normalize_event(raw)
            if event is None:
                continue
            try:
                self._realtime_queue.put_nowait(event)
                accepted += 1
            except queue.Full:
                try:
                    _ = self._realtime_queue.get_nowait()
                    self._realtime_queue.put_nowait(event)
                    accepted += 1
                    log.warning("Realtime queue full; dropped oldest event to keep processing fresh updates.")
                except Exception:
                    log.exception("Failed to enqueue realtime event: %s", event.get("event_type"))
        return accepted

    def _realtime_worker_loop(self) -> None:
        batch: List[dict] = []
        last_flush = time.monotonic()
        while not self._realtime_stop.is_set():
            timeout = max(0.1, self.cfg.realtime_flush_seconds)
            try:
                event = self._realtime_queue.get(timeout=timeout)
                batch.append(event)
            except queue.Empty:
                pass

            should_flush = bool(batch) and (
                len(batch) >= self.cfg.realtime_batch_size or
                (time.monotonic() - last_flush) >= self.cfg.realtime_flush_seconds
            )
            if should_flush:
                self._apply_realtime_batch(batch)
                batch = []
                last_flush = time.monotonic()

        if batch:
            self._apply_realtime_batch(batch)

    def _pg_listener_loop(self) -> None:
        channel = self.cfg.realtime_notification_channel
        while not self._realtime_stop.is_set():
            conn = None
            try:
                conn = self.db._connect()
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(f'LISTEN {channel};')
                log.info("Listening for Postgres recommendation notifications on %s", channel)

                while not self._realtime_stop.is_set():
                    conn.poll()
                    while conn.notifies:
                        notify = conn.notifies.pop(0)
                        try:
                            payload = json.loads(notify.payload)
                        except Exception:
                            payload = {"raw": notify.payload}
                        self.enqueue_realtime_events([payload])
                    time.sleep(0.5)
            except Exception as exc:
                log.warning("Realtime listener reconnecting after error: %s", exc)
                time.sleep(2.0)
            finally:
                try:
                    if conn is not None:
                        conn.close()
                except Exception:
                    pass

    def _append_frame_row(self, frame: Optional[pd.DataFrame], row: dict) -> pd.DataFrame:
        row_df = pd.DataFrame([row])
        if frame is None or frame.empty:
            return row_df
        return pd.concat([frame, row_df], ignore_index=True)

    def _upsert_frame_row(self, frame: Optional[pd.DataFrame], column: str, value: str, row: dict) -> pd.DataFrame:
        row_df = pd.DataFrame([row])
        if frame is None or frame.empty or column not in frame.columns:
            return row_df
        mask = frame[column].astype(str) == str(value)
        if mask.any():
            updated = frame.copy()
            row_index = updated.index[mask][0]
            for key, val in row.items():
                if key not in updated.columns:
                    updated[key] = None
                updated.at[row_index, key] = val
            return updated
        return pd.concat([frame, row_df], ignore_index=True)

    def _remove_frame_row(self, frame: Optional[pd.DataFrame], column: str, value: str) -> Optional[pd.DataFrame]:
        if frame is None or frame.empty or column not in frame.columns:
            return frame
        return frame[frame[column].astype(str) != str(value)].reset_index(drop=True)

    def _remove_interaction_row(self, frame: Optional[pd.DataFrame], user_id: str, job_id: str) -> Optional[pd.DataFrame]:
        """Un-save / un-view / un-ignore a specific job- a DELETE on
        saved_jobs/job_views/ignored_jobs means the candidate's interest
        signal for that exact pair should disappear from the cache, not
        just get a duplicate row appended alongside the one already there."""
        if frame is None or frame.empty or "user_id" not in frame.columns or "job_id" not in frame.columns:
            return frame
        mask = (frame["user_id"].astype(str) == str(user_id)) & (frame["job_id"].astype(str) == str(job_id))
        return frame[~mask].reset_index(drop=True)

    def _upsert_interaction_row(self, frame: Optional[pd.DataFrame], user_id: str, job_id: str, row: dict) -> pd.DataFrame:
        """Views/saves/ignores are UNIQUE (user_id, job_id) relationships in
        the DB- job_views/saved_jobs/ignored_jobs all upsert (ON CONFLICT DO
        UPDATE/DO NOTHING) rather than accumulating a new row per repeat
        view/save, since a candidate opening the same job's details five
        times is one relationship with a refreshed timestamp, not five
        separate interactions. Blindly appending here would make the
        incrementally-updated cache accumulate duplicate rows a fresh full
        fetch from the DB would never have, inflating that pair's
        behavioral weight the more times it's re-viewed."""
        if frame is None or frame.empty or "user_id" not in frame.columns or "job_id" not in frame.columns:
            return self._append_frame_row(frame, row)
        mask = (frame["user_id"].astype(str) == str(user_id)) & (frame["job_id"].astype(str) == str(job_id))
        if mask.any():
            updated = frame.copy()
            row_index = updated.index[mask][0]
            for key, val in row.items():
                if key not in updated.columns:
                    updated[key] = None
                updated.at[row_index, key] = val
            return updated
        return self._append_frame_row(frame, row)

    def _refresh_candidate_related_data(self, candidate_id: str) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        cid = str(candidate_id)
        skills = self.skills_df[self.skills_df["user_id"].astype(str) == cid].copy() if self.skills_df is not None and not self.skills_df.empty else pd.DataFrame(columns=["user_id", "skill_name", "years_experience"])
        education = self.education_df[self.education_df["user_id"].astype(str) == cid].copy() if self.education_df is not None and not self.education_df.empty else pd.DataFrame(columns=["user_id", "degree", "field_of_study"])
        work = self.work_df[self.work_df["user_id"].astype(str) == cid].copy() if self.work_df is not None and not self.work_df.empty else pd.DataFrame(columns=["user_id", "title", "description", "skills", "industry", "start_date", "end_date", "is_current"])
        certs = self.certifications_df[self.certifications_df["user_id"].astype(str) == cid].copy() if self.certifications_df is not None and not self.certifications_df.empty else pd.DataFrame(columns=["user_id", "certification_name"])
        return skills, education, work, certs

    def _upsert_candidate_snapshot(self, candidate_id: str) -> bool:
        cand_row = self.db.fetch_candidate_by_id(candidate_id)
        if cand_row is None:
            return False
        skills, education, work, certs = self._refresh_candidate_related_data(candidate_id)
        self.content_model.upsert_candidate(cand_row, skills, education, work, certs)
        self.candidates = self._upsert_frame_row(self.candidates, "user_id", candidate_id, cand_row)
        # The Matcher's cached result is now stale- it's a profile-vs-job
        # fit, so a profile change invalidates only THIS candidate's entry.
        _invalidate_matcher_cache(candidate_id)
        _invalidate_hybrid_score_cache(candidate_id)
        return True

    def _upsert_job_snapshot(self, job_id: str) -> bool:
        job_row = self.db.fetch_job_by_id(job_id)
        if job_row is None:
            return False
        self.content_model.upsert_job(job_row)
        # Keeps behavior_model.job_matrix in lockstep with content_model's-
        # without this it silently falls behind self.jobs' row count after
        # any realtime job add/update, causing a numpy shape mismatch the
        # next time a candidate is scored (score_batch/freshness_scores/
        # popularity_scores all size their output off len(self.jobs)).
        self.behavior_model.upsert_job(job_row)
        self.jobs = self._upsert_frame_row(self.jobs, "id", job_id, job_row)
        # A job changing affects EVERY candidate's matcher results (it scores
        # the whole job set per call), so the whole cache is invalidated
        # rather than trying to track which candidates might be affected.
        _invalidate_matcher_cache()
        _invalidate_hybrid_score_cache()
        return True

    def _remove_candidate_snapshot(self, candidate_id: str) -> None:
        self.content_model.delete_candidate(candidate_id)
        self.candidates = self._remove_frame_row(self.candidates, "user_id", candidate_id)
        self.skills_df = self._remove_frame_row(self.skills_df, "user_id", candidate_id)
        self.education_df = self._remove_frame_row(self.education_df, "user_id", candidate_id)
        self.work_df = self._remove_frame_row(self.work_df, "user_id", candidate_id)
        self.certifications_df = self._remove_frame_row(self.certifications_df, "user_id", candidate_id)
        _invalidate_matcher_cache(candidate_id)
        _invalidate_hybrid_score_cache(candidate_id)

    def _remove_job_snapshot(self, job_id: str) -> None:
        self.content_model.delete_job(job_id)
        self.behavior_model.delete_job(job_id)
        self.jobs = self._remove_frame_row(self.jobs, "id", job_id)
        if self.events is not None and not self.events.empty:
            self.events = self.events[self.events["job_idx"].astype(str) != str(self.preprocessor.job_id_to_idx.get(str(job_id), job_id))].reset_index(drop=True)
        _invalidate_matcher_cache()
        _invalidate_hybrid_score_cache()

    def _rebuild_cached_interactions(self) -> None:
        if self.preprocessor is None:
            self.preprocessor = Preprocessor(self.cfg)
        if self.candidates is None or self.jobs is None:
            self.events = pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight"])
            return
        self.preprocessor.fit_id_maps(self.candidates, self.jobs)
        views = self.views if self.views is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date"])
        applications = self.applications if self.applications is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date", "status"])
        saves = self.saves if self.saves is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date"])
        self.events = self.preprocessor.build_events(views, applications, saves)

    def _refresh_behavior_from_cache(self) -> None:
        if self.jobs is None:
            return
        self.behavior_model.fit_job_corpus(self.jobs)
        self.behavior_model.fit_profiles(
            self.events if self.events is not None else pd.DataFrame(columns=["candidate_idx", "job_idx", "event_date", "weight"]),
            self.jobs,
            self.preprocessor.idx_to_job_id,
            search_events=self.search_events if self.search_events is not None else pd.DataFrame(columns=["user_id", "query", "searched_at"]),
            candidate_id_to_idx=self.preprocessor.candidate_id_to_idx,
        )

    def _schedule_collaborative_refresh(self) -> None:
        if not self._collab_retrain_lock.acquire(blocking=False):
            self._collab_retrain_pending.set()
            return

        def _runner() -> None:
            try:
                time.sleep(self.cfg.realtime_collaborative_retrain_delay_seconds)
                while True:
                    self._retrain_collaborative_from_cache()
                    if not self._collab_retrain_pending.is_set():
                        break
                    self._collab_retrain_pending.clear()
                    time.sleep(self.cfg.realtime_collaborative_retrain_delay_seconds)
            finally:
                self._collab_retrain_running = False
                self._collab_retrain_lock.release()

        self._collab_retrain_running = True
        self._collab_retrain_pending.clear()
        threading.Thread(target=_runner, daemon=True).start()

    def _retrain_collaborative_from_cache(self) -> None:
        # Snapshot once: self.jobs/self.candidates can be reassigned by the
        # realtime worker thread (job/candidate upsert or removal) at any
        # point, unlocked. Re-reading self.jobs/self.candidates separately
        # for fit_id_maps(), build_interaction_matrix() and
        # collaborative_model.fit() let those three calls see different
        # snapshots of the same attribute mid-retrain- the preprocessor's
        # job_id_to_idx could then hand out an index one past the end of the
        # item embedding matrix the model actually ended up trained with
        # ("index N out of bounds for axis 0 with size N"). A single
        # snapshot makes the whole retrain pass internally consistent.
        candidates_snapshot = self.candidates
        jobs_snapshot = self.jobs
        if candidates_snapshot is None or jobs_snapshot is None:
            return
        try:
            preprocessor = Preprocessor(self.cfg)
            preprocessor.fit_id_maps(candidates_snapshot, jobs_snapshot)
            events = preprocessor.build_events(
                self.views if self.views is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date"]),
                self.applications if self.applications is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date", "status"]),
                self.saves if self.saves is not None else pd.DataFrame(columns=["user_id", "job_id", "event_date"]),
            )
            matrix = preprocessor.build_interaction_matrix(events, len(candidates_snapshot), len(jobs_snapshot))

            hard_negatives: Dict[int, List[int]] = {}
            if self.ignored is not None and not self.ignored.empty:
                ig = self.ignored.copy()
                ig["candidate_idx"] = ig["user_id"].astype(str).map(preprocessor.candidate_id_to_idx)
                ig["job_idx"] = ig["job_id"].astype(str).map(preprocessor.job_id_to_idx)
                ig = ig.dropna(subset=["candidate_idx", "job_idx"])
                for cand_idx, sub in ig.groupby(ig["candidate_idx"].astype(int)):
                    hard_negatives[int(cand_idx)] = sub["job_idx"].astype(int).tolist()

            collaborative_model = CollaborativeModel(self.cfg.mf)
            collaborative_model.fit(matrix, len(candidates_snapshot), len(jobs_snapshot), self.cfg.interaction_weights.max_weight,
                                     hard_negatives=hard_negatives)
            with self._lock:
                self.preprocessor = preprocessor
                self.events = events
                self.collaborative_model = collaborative_model
                self.last_trained_at = datetime.now()
            log.info("Collaborative model refreshed from cached realtime updates (%d interactions).", int(matrix.nnz))
        except Exception as exc:
            log.exception("Incremental collaborative refresh failed: %s", exc)

    def _apply_realtime_batch(self, events: List[dict]) -> dict:
        if not events:
            return {"accepted": 0, "applied": 0}

        applied = 0
        structural_change = False
        behavior_change = False
        search_change = False
        with self._lock:
            for raw in events:
                event = self._normalize_event(raw)
                if event is None:
                    continue
                entity_type = event["entity_type"].lower()
                operation = event["operation"].lower()
                payload = event["payload"]
                candidate_id = str(event.get("candidate_id") or payload.get("candidate_id") or payload.get("user_id") or "")
                job_id = str(event.get("job_id") or payload.get("job_id") or "")

                if entity_type in {"candidate", "candidate_profile", "candidate_profiles", "profile"}:
                    structural_change = True
                    if operation in {"delete", "removed"}:
                        self._remove_candidate_snapshot(candidate_id)
                    else:
                        if self._upsert_candidate_snapshot(candidate_id):
                            applied += 1
                    continue

                if entity_type in {"job", "jobs"}:
                    structural_change = True
                    if operation in {"delete", "removed"}:
                        self._remove_job_snapshot(job_id)
                    else:
                        if self._upsert_job_snapshot(job_id):
                            applied += 1
                    continue

                if entity_type in {"view", "job_views", "saved_job", "saved_jobs", "save", "application", "applications", "ignored_job", "ignored_jobs", "ignore", "search", "job_searches", "application_started", "application_starts"}:
                    behavior_change = True
                    if entity_type in {"search", "job_searches"}:
                        search_change = True
                        self.search_events = self._append_frame_row(self.search_events, {
                            "user_id": candidate_id,
                            "query": str(payload.get("query") or event.get("query") or ""),
                            "searched_at": payload.get("searched_at") or event.get("created_at") or datetime.utcnow().isoformat(),
                        })
                    elif entity_type in {"view", "job_views"}:
                        if operation in {"delete", "removed"}:
                            self.views = self._remove_interaction_row(self.views, candidate_id, job_id)
                        else:
                            # job_views is UNIQUE(user_id, job_id) with an
                            # ON CONFLICT DO UPDATE upsert- re-viewing the
                            # same job refreshes one row's timestamp in the
                            # DB, not a new row, so mirror that here instead
                            # of appending a duplicate on every repeat view.
                            self.views = self._upsert_interaction_row(self.views, candidate_id, job_id, {
                                "user_id": candidate_id,
                                "job_id": job_id,
                                "event_date": payload.get("event_date") or event.get("created_at") or datetime.utcnow().isoformat(),
                            })
                    elif entity_type in {"saved_job", "saved_jobs", "save"}:
                        if operation in {"delete", "removed"}:
                            self.saves = self._remove_interaction_row(self.saves, candidate_id, job_id)
                        else:
                            # saved_jobs is also UNIQUE(user_id, job_id)
                            # (ON CONFLICT DO NOTHING)- upsert defensively
                            # in case a duplicate insert notification ever
                            # arrives for an already-saved pair.
                            self.saves = self._upsert_interaction_row(self.saves, candidate_id, job_id, {
                                "user_id": candidate_id,
                                "job_id": job_id,
                                "event_date": payload.get("event_date") or event.get("created_at") or datetime.utcnow().isoformat(),
                            })
                    elif entity_type in {"application", "applications"}:
                        if operation in {"delete", "removed"}:
                            self.applications = self._remove_interaction_row(self.applications, candidate_id, job_id)
                        else:
                            self.applications = self._append_frame_row(self.applications, {
                                "user_id": candidate_id,
                                "job_id": job_id,
                                "event_date": payload.get("event_date") or event.get("created_at") or datetime.utcnow().isoformat(),
                                "status": payload.get("status") or operation or "submitted",
                            })
                    elif entity_type in {"application_started", "application_starts"}:
                        # application_starts is also UNIQUE(user_id, job_id)- same
                        # defensive upsert as views/saves (re-opening the Apply form
                        # for the same job refreshes one row, not a duplicate).
                        self.incomplete_applications = self._upsert_interaction_row(self.incomplete_applications, candidate_id, job_id, {
                            "user_id": candidate_id,
                            "job_id": job_id,
                            "event_date": payload.get("event_date") or event.get("created_at") or datetime.utcnow().isoformat(),
                        })
                    elif entity_type in {"ignored_job", "ignored_jobs", "ignore"}:
                        if operation in {"delete", "removed"}:
                            self.ignored = self._remove_interaction_row(self.ignored, candidate_id, job_id)
                        else:
                            # ignored_jobs is also UNIQUE(user_id, job_id)
                            # (ON CONFLICT DO NOTHING)- same defensive upsert.
                            self.ignored = self._upsert_interaction_row(self.ignored, candidate_id, job_id, {
                                "user_id": candidate_id,
                                "job_id": job_id,
                            })
                    applied += 1
                    continue

            if structural_change:
                self._rebuild_cached_interactions()
                self._refresh_behavior_from_cache()
                self._schedule_collaborative_refresh()
            elif behavior_change:
                self._rebuild_cached_interactions()
                self._refresh_behavior_from_cache()
                self._schedule_collaborative_refresh()

            if applied:
                self.last_trained_at = datetime.now()

        return {"accepted": len(events), "applied": applied, "structural_change": structural_change, "behavior_change": behavior_change, "search_change": search_change}

    def _active_weights(self, has_collab: bool = None, has_behavior: bool = None,
                         exclude_content: bool = False, has_freshness: bool = True) -> HybridWeights:
        if has_collab is None:
            has_collab = self.collaborative_model.trained
        if has_behavior is None:
            has_behavior = bool(self.behavior_model.behavior_profile)
        return self.cfg.hybrid_weights.normalized(has_collab, has_behavior, exclude_content=exclude_content,
                                                    has_freshness=has_freshness)

    def _similar_candidates_reason(self, candidate_idx: int, job_idx: int) -> Optional[str]:
        """MODEL 3's explainability: did any of this candidate's most-similar
        peers (by learned embedding, i.e. by interaction PATTERN, not
        profile text) actually engage with this specific job?"""
        if self.events is None or self.events.empty:
            return None
        similar = self.collaborative_model.most_similar_candidates(candidate_idx, k=5)
        if not similar:
            return None
        similar_idxs = {i for i, _ in similar}
        hit = self.events[(self.events["candidate_idx"].isin(similar_idxs)) & (self.events["job_idx"] == job_idx)]
        if hit.empty:
            return None
        return "Candidates with similar interests and activity engaged with this job."

    def _explain(self, candidate_idx: Optional[int], job_col: int, job_row: pd.Series,
                 fresh: float, pop: float, biz_reasons: List[str]) -> List[str]:
        reasons: List[str] = list(biz_reasons)
        if candidate_idx is not None:
            reasons.extend(self.behavior_model.explain(candidate_idx, job_row))
            match = self.content_model.explain_match(candidate_idx, job_col)
            if match.get("matched_skills"):
                reasons.append(f"Matches your skills: {', '.join(match['matched_skills'][:5])}.")
            if match.get("matched_education"):
                reasons.append(f"Matches your field of study: {', '.join(match['matched_education'][:3])}.")
            if match.get("matched_languages"):
                reasons.append(f"Matches your languages: {', '.join(match['matched_languages'])}.")
            similar_reason = self._similar_candidates_reason(candidate_idx, job_col)
            if similar_reason:
                reasons.append(similar_reason)
        if fresh > 0.7:
            reasons.append("Newly posted job.")
        if pop > 0.6:
            reasons.append("Popular with other candidates.")
        if not reasons:
            reasons.append("Matches your overall profile.")
        return reasons

    def score_candidate(self, candidate_id: str, top_n: int, exclude_content: bool = False) -> dict:
        with self._lock:
            if self.jobs is None or self.jobs.empty:
                return {"scored_jobs": [], "cold_start": True, "total_jobs": 0}

            ignored_ids = set()
            if self.ignored is not None and not self.ignored.empty:
                ignored_ids = set(self.ignored[self.ignored["user_id"].astype(str) == candidate_id]["job_id"].astype(str))

            fresh, has_freshness = freshness_scores(self.jobs)
            pop = popularity_scores(self.jobs)
            candidate_idx: Optional[int] = None
            cand_row: Optional[dict] = None

            if candidate_id in self.preprocessor.candidate_id_to_idx:
                candidate_idx = self.preprocessor.candidate_id_to_idx[candidate_id]
                idx = np.array([candidate_idx])
                content = self.content_model.score_batch(idx)
                # PER-CANDIDATE check- matrix factorization only updates a user's
                # embedding when they appear in at least one training interaction
                # (see InteractionDataset: it's built ONLY from the interaction
                # matrix's non-zero entries). A candidate with zero personal
                # views/saves/applies never appears in any training batch, so
                # their embedding sits at its random nn.init.normal_(std=0.05)
                # initialization forever- score_batch() still runs the dot-product
                # math for them and returns a number, but it's untrained noise, not
                # a real "candidates like you" signal. `self.collaborative_model.
                # trained` alone only tells us the MODEL trained on SOMEONE's data,
                # not that THIS candidate's embedding is meaningful- same class of
                # bug as the Behavior fix above.
                # A job add/remove via realtime updates content_model/behavior_model
                # SYNCHRONOUSLY (see _upsert_job_snapshot), but collaborative_model
                # only catches up via a DELAYED retrain (realtime_collaborative_
                # retrain_delay_seconds, debounced)- so there's a real window where
                # its fixed-size item embedding table (still the OLD job count) would
                # broadcast-crash against content/behavior/freshness/popularity's
                # already-updated (NEW job count) arrays. Treat it the same as
                # "not trained yet" until the scheduled retrain resizes it.
                collab_stale = (
                    self.collaborative_model.trained and self.collaborative_model.model is not None and
                    self.collaborative_model.model.item_emb.weight.shape[0] != len(self.jobs)
                )
                has_collab_for_candidate = False
                if self.collaborative_model.trained and not collab_stale and self.events is not None and not self.events.empty:
                    has_collab_for_candidate = not self.events[self.events["candidate_idx"] == candidate_idx].empty
                collab = self.collaborative_model.score_batch(idx) if has_collab_for_candidate else np.zeros_like(content)
                behavior, behavior_tfidf, behavior_semantic = self.behavior_model.score_batch(idx)
                # Same staleness class as collaborative above, but for
                # BehaviorModel.job_matrix specifically- normally kept in
                # lockstep with content_model/self.jobs by _upsert_job_snapshot
                # calling behavior_model.upsert_job() synchronously, but a full
                # fit_job_corpus() refit (_refresh_behavior_from_cache, run once
                # per realtime batch rather than per event) can still leave a
                # brief window where it hasn't caught up to the very latest
                # self.jobs size. Never let a stale array reach ranker.combine()
                # uncaught- fall back to zeros (same as "no behavior profile
                # yet") rather than crashing the whole request.
                behavior_stale = behavior.shape[1] != len(self.jobs)
                if behavior_stale:
                    log.warning("BehaviorModel.job_matrix shape (%d) != current job count (%d)- "
                                "treating behavior as unavailable for this request.",
                                behavior.shape[1], len(self.jobs))
                    behavior = np.zeros_like(content)
                    behavior_tfidf = np.zeros_like(content)
                    behavior_semantic = np.zeros_like(content)
                # PER-CANDIDATE check- not "does ANY candidate in the system have
                # behavior data" (that's what _active_weights()'s own default did,
                # since it only tested the dict for global non-emptiness). A
                # candidate with zero personal views/saves/applies/searches must
                # have their Behavior weight redistributed to Content/
                # Collaborative/Freshness/Popularity, not silently deflate their
                # score because SOME OTHER candidate elsewhere has history.
                has_behavior_for_candidate = not behavior_stale and candidate_idx in self.behavior_model.behavior_profile
                weights = self._active_weights(has_collab=has_collab_for_candidate, has_behavior=has_behavior_for_candidate,
                                                exclude_content=exclude_content, has_freshness=has_freshness)
                cand_row = self.candidates.iloc[candidate_idx].to_dict()
                # Computed ONCE per candidate (not per job in the shortlist loop below)-
                # the previous per-job _similar_candidates_reason() call recomputed this
                # identical top-5 every time, which was wasted work since candidate_idx
                # doesn't change across jobs.
                # Gated on has_collab_for_candidate: cosine similarity against an
                # untrained (random-init) embedding still returns a ranked list-
                # it just ranks by coincidental proximity in random space, not real
                # interaction-pattern similarity. Same "don't report it if it isn't
                # genuinely calculated" rule as raw_score above.
                similar_candidates = (self.collaborative_model.most_similar_candidates(candidate_idx, k=5)
                                      if has_collab_for_candidate else [])
                similar_candidates_detail = [
                    {"candidate_id": self.preprocessor.idx_to_candidate_id[i], "similarity": round(float(s), 4)}
                    for i, s in similar_candidates if i < len(self.preprocessor.idx_to_candidate_id)
                ]
                similar_idxs = {i for i, _ in similar_candidates}
                cold_start = False
            else:
                cand_row = self.db.fetch_candidate_by_id(candidate_id)
                if cand_row is None:
                    raise KeyError(f"Unknown candidate_id: {candidate_id}")
                row_matrix, semantic_vec = self.content_model.transform_candidate_row(
                    cand_row, self.skills_df, self.education_df, self.work_df, self.certifications_df)
                content = self.content_model.score_row(row_matrix, semantic_vec)
                collab = np.zeros_like(content)
                behavior = np.zeros_like(content)
                behavior_tfidf = np.zeros_like(content)
                behavior_semantic = np.zeros_like(content)
                similar_candidates_detail = []
                similar_idxs = set()
                has_collab_for_candidate = False
                has_behavior_for_candidate = False
                weights = self._active_weights(has_collab=False, has_behavior=False, exclude_content=exclude_content,
                                                has_freshness=has_freshness)
                cold_start = True

            # Last-resort net: content_model.upsert_job() and self.jobs are always
            # updated together in the SAME call (_upsert_job_snapshot), so content
            # should never itself drift from len(self.jobs)- but every array here
            # gets checked against it regardless, so any future staleness in any
            # sub-model degrades to "signal unavailable" instead of a 500.
            n_jobs = len(self.jobs)
            content, behavior, collab = (
                arr if arr.shape[1] == n_jobs else np.zeros((arr.shape[0], n_jobs), dtype=np.float32)
                for arr in (content, behavior, collab)
            )

            ranker = HybridRanker(weights)
            final = ranker.combine(content, behavior, collab, fresh.reshape(1, -1), pop.reshape(1, -1))

            job_ids = self.jobs["id"].astype(str).values
            keep_mask = ~np.isin(job_ids, list(ignored_ids))
            final_masked = np.where(keep_mask, final[0], -1.0)

            k = min(top_n, keep_mask.sum())
            top_idx, top_scores = ranker.top_k_indices(final_masked.reshape(1, -1), k)

            scored = []
            for job_col, score in zip(top_idx[0], top_scores[0]):
                if score < 0:
                    continue
                job_col = int(job_col)
                job_row = self.jobs.iloc[job_col]
                biz_modifier, biz_reasons = business_rule_modifier(cand_row, job_row)
                age_modifier, age_reason, candidate_age, job_age_requirement = age_fit(cand_row, job_row)
                all_reasons = biz_reasons + ([age_reason] if age_reason else [])
                final_score = float(score) * biz_modifier * age_modifier

                content_match = self.content_model.explain_match(candidate_idx, job_col) if candidate_idx is not None else {}
                behavior_detail = self.behavior_model.explain_detail(candidate_idx, job_col) if candidate_idx is not None else {}

                created_at = pd.to_datetime(job_row.get("created_at"), utc=True, errors="coerce")
                days_old = round((pd.Timestamp.now(tz="UTC") - created_at).total_seconds() / 86400, 1) if pd.notna(created_at) else None

                engaged_similar = bool(similar_idxs and self.events is not None and not self.events.empty and
                                        not self.events[(self.events["candidate_idx"].isin(similar_idxs)) &
                                                         (self.events["job_idx"] == job_col)].empty)

                detail = {
                    "content": {
                        "matched_skills": content_match.get("matched_skills", []),
                        "matched_education": content_match.get("matched_education", []),
                        "matched_languages": content_match.get("matched_languages", []),
                        "candidate_experience_years": content_match.get("matched_experience_years"),
                        "required_experience_years": content_match.get("required_experience_years"),
                        "semantic_encoder_available": self.semantic_encoder.available,
                        "candidate_age": candidate_age,
                        "job_age_requirement": job_age_requirement,
                        "age_fit_score": round(age_modifier, 3),
                        # Every pair's matched terms + standalone TF-IDF cosine, the
                        # standalone semantic score, and the final blended score
                        # actually used for ranking- see ContentBasedModel.explain_match.
                        "matched_terms_by_pair": content_match.get("matched_terms_by_pair", {}),
                        "tfidf_score_by_pair": content_match.get("tfidf_score_by_pair", {}),
                        "semantic_score": content_match.get("semantic_score"),
                        "final_score": round(float(content[0, job_col]), 4),
                    },
                    "behavior": {
                        # TF-IDF/semantic split of the SAME unified 17-pair signal
                        # (skills/fields/title/location/languages/certifications/
                        # experience_text/education/responsibilities/requirements/
                        # qualifications/benefits/employment_type/work_arrangement/
                        # department/industry/company_name)- see BehaviorModel.
                        "content_similarity_score": round(float(behavior[0, job_col]), 4) if candidate_idx is not None else None,
                        "content_similarity_tfidf": round(float(behavior_tfidf[0, job_col]), 4) if candidate_idx is not None else None,
                        "content_similarity_semantic": round(float(behavior_semantic[0, job_col]), 4) if candidate_idx is not None else None,
                        "matched_terms_by_pair": behavior_detail.get("matched_terms_by_pair", {}),
                        "tfidf_score_by_pair": behavior_detail.get("tfidf_score_by_pair", {}),
                        "matched_skills": behavior_detail.get("matched_skills", []),
                        "matched_languages": behavior_detail.get("matched_languages", []),
                        "matched_location": behavior_detail.get("matched_location", []),
                        "matched_title": behavior_detail.get("matched_title", []),
                        "corrected_terms": behavior_detail.get("corrected_terms", {}),
                        "top_interacted_jobs": self.behavior_model.get_profile_sources(candidate_idx),
                        "has_search_history": bool(candidate_idx is not None and candidate_idx in self.behavior_model._search_candidate_indices),
                        "final_score": round(float(behavior[0, job_col]), 4),
                    },
                    "collaborative": {
                        "trained": self.collaborative_model.trained,
                        "has_learned_embedding": has_collab_for_candidate,
                        "raw_score": round(float(collab[0, job_col]), 4),
                        "similar_candidates": similar_candidates_detail,
                        "similar_candidates_engaged": engaged_similar,
                    },
                    "freshness": {"score": round(float(fresh[job_col]), 4), "days_old": days_old},
                    "popularity": {
                        "score": round(float(pop[job_col]), 4),
                        "application_count": _safe_int(job_row.get("application_count")),
                        "view_count": _safe_int(job_row.get("view_count")),
                    },
                    "business_rules": {"modifier": round(biz_modifier, 3), "reasons": biz_reasons},
                }

                scored.append({
                    "job_id": str(job_row["id"]),
                    "title": job_row.get("title", ""),
                    "company": job_row.get("company_name", ""),
                    "total_score": round(final_score * 100, 2),
                    "breakdown": {
                        "content": round(float(content[0, job_col]) * weights.content * 100, 2),
                        "behavior": round(float(behavior[0, job_col]) * weights.behavior * 100, 2),
                        "collaborative": round(float(collab[0, job_col]) * weights.collaborative * 100, 2),
                        "freshness": round(float(fresh[job_col]) * weights.freshness * 100, 2),
                        "popularity": round(float(pop[job_col]) * weights.popularity * 100, 2),
                        "business_rule_modifier": round(biz_modifier, 3),
                        "age_fit_modifier": round(age_modifier, 3),
                    },
                    "detail": detail,
                    "reasons": self._explain(candidate_idx, job_col, job_row,
                                              float(fresh[job_col]), float(pop[job_col]), all_reasons),
                    "job": job_details_dict(job_row),
                })

            scored.sort(key=lambda s: s["total_score"], reverse=True)

            return {
                "scored_jobs": scored,
                "total_jobs": int(keep_mask.sum()),
                "cold_start": cold_start,
                "interest_profile": (self.behavior_model.get_interest_profile(candidate_idx)
                                      if candidate_idx is not None else {}),
                "weights_used": {"content": weights.content, "behavior": weights.behavior,
                                  "collaborative": weights.collaborative, "freshness": weights.freshness,
                                  "popularity": weights.popularity},
                # Exposed so combined_score_candidate() can tell how much of hybrid's
                # score is genuinely PERSONALIZED (Behavior/Collaborative) vs generic
                # job attributes (Freshness/Popularity)- used to shift the outer
                # matcher/hybrid split itself when personalization is absent.
                "has_behavior": has_behavior_for_candidate,
                "has_collaborative": has_collab_for_candidate,
            }


engine = RecommendationEngine(CFG)

# Matcher subsystem singletons -- created here (not up in the "MATCHER
# SUBSYSTEM" section above) because LocalTextProcessor needs
# engine.semantic_encoder, which only exists once `engine` is constructed.
backend = BackendClient()
tp = LocalTextProcessor(semantic_encoder=engine.semantic_encoder)
factor1 = Factor1_SkillsMatcher(tp)
factor2 = Factor2_QualificationsMatcher(tp)
factor3 = Factor3_ExperienceMatcher(tp)
factor4 = Factor4_PreferencesMatcher(tp)


# ==========================================================================
# 9.5 COMBINED FEED- ai_job_matcher_og.py (4-factor profile match: skills/
# qualifications/experience/preferences) blended with THIS service's own
# hybrid score (content+behavior+collaborative+freshness+popularity).
#
# Default split: matcher 70% / hybrid 30% (configurable per-request- see
# ScoreRequest below). Graceful by design: if the matcher service can't
# return a score for a job (service down, candidate has no jobs matched,
# etc.), that job falls back to 100% hybrid- never a fabricated 0 for the
# missing signal, and vice versa.
# ==========================================================================

def score_candidate_against_jobs(candidate_id: str) -> dict:
    """Scores one candidate against every active job using the Matcher's 4
    factors. Used both by POST /matcher/match and directly, in-process, by
    fetch_matcher_scores() below (no HTTP hop) for combined_score_candidate()'s
    matcher-side contribution to the blended /score/combined feed."""
    request_start = time.time()

    try:
        if not candidate_id:
            return {"success": False, "error": "Missing candidate_id"}
        
        profile_resp = backend.get_profile(candidate_id)
        if not profile_resp or not profile_resp.get('data'):
            return {"success": False, "error": "Candidate not found"}
        
        profile_data = profile_resp.get('data', {})

        # Build a DYNAMIC correction vocabulary from the candidate's + all jobs' OWN
        # skills (replaces the previous hardcoded skill list) so typo correction is
        # data-driven, e.g. a misspelled job skill aligns to the candidate's real skill.
        jobs = backend.get_jobs()
        tp.dynamic_vocab = set()
        tp.add_to_vocab(_collect_skill_terms(profile_data, jobs))

        log_candidate("="*60)
        log_candidate("CANDIDATE DATA FROM DATABASE")
        log_candidate("="*60)

        candidate_skills = factor1.extract_candidate_skills(profile_data)
        candidate_quals = factor2.extract_candidate_qualifications(profile_data)
        candidate_prefs = factor4.extract_candidate_preferences(profile_data)
        
        personal = profile_data.get('profile', {}).get('personal_info', {})
        candidate_name = personal.get('full_name', 'Unknown')
        
        log_candidate(f"Name: {candidate_name}")
        log_candidate(f"Skills from DB ({len(candidate_skills)}): {', '.join(candidate_skills[:10])}")
        log_candidate(f"Education entries: {len(profile_data.get('education', []))}")
        log_candidate(f"Work experience: {len(profile_data.get('work_experience', []))}")
        log_candidate(f"Certifications: {len(profile_data.get('certifications', []))}")
        
        log_candidate(f"Job types from DB: {candidate_prefs.get('job_types', [])}")
        log_candidate(f"Locations from DB: {candidate_prefs.get('locations', [])}")
        log_candidate(f"Industries from DB: {candidate_prefs.get('industries', [])}")
        log_candidate(f"Languages from DB: {candidate_prefs.get('languages', [])}")
        
        log_info(f"📊 Jobs from database: {len(jobs)}")

        results = []
        
        for idx, job in enumerate(jobs):
            job_title = job.get('title', 'Unknown')
            
            log_job("="*60)
            log_job(f"JOB {idx+1}: {job_title}")
            log_job("="*60)
            
            job_details = extract_all_job_fields(job)
            job_skills = factor1.extract_job_skills(job)
            job_quals = factor2.extract_job_qualifications(job)
            
            log_job(f"Company from DB: {job.get('company_name', 'Unknown')}")
            log_job(f"Required Skills from DB ({len(job_skills)}): {', '.join(job_skills[:10])}")
            log_job(f"Required Degree from DB: {job_quals.get('minimum_degree', 'None')}")
            
            log_match("="*60)
            log_match(f"MATCHING: {candidate_name} vs {job_title}")
            log_match("="*60)
            
            log_match("FACTOR 1: SKILLS (40%) - FROM DATABASE")
            s = factor1.match(candidate_skills, job_skills)
            
            log_match("FACTOR 2: QUALIFICATIONS (25%) - FROM DATABASE")
            q = factor2.match(candidate_quals, job_quals)
            
            log_match("FACTOR 3: EXPERIENCE (20%) - FROM DATABASE")
            e = factor3.match(profile_data, job)
            
            log_match("FACTOR 4: PREFERENCES (15%) - FROM DATABASE")
            p = factor4.match(candidate_prefs, job)

            # Top-level redistribution: a factor with nothing to evaluate
            # (e.g. the job lists no required skills at all, or no
            # degree/field/cert requirement of any kind) is excluded rather
            # than defaulted to 100%, and its base weight (Skills 40% /
            # Qualifications 25% / Experience 20% / Preferences 15%) is
            # redistributed across whichever factors ARE applicable.
            # Experience is always applicable -- it's relevance-scored
            # against the job's own title/description even with no explicit
            # requirement, so there's always a real comparison happening.
            factor_weights = redistribute_weights({
                "skills": (s.get("applicable", True), 0.40),
                "qualifications": (q.get("applicable", True), 0.25),
                "experience": (True, 0.20),
                "preferences": (p.get("applicable", True), 0.15),
            })
            total_raw = (s["score"] * factor_weights["skills"] + q["score"] * factor_weights["qualifications"]
                        + e["score"] * factor_weights["experience"] + p["score"] * factor_weights["preferences"])
            total_score = round(total_raw * 100, 1)
            excluded_factors = [name for name, w in factor_weights.items() if w == 0.0]

            log_match("="*60)
            log_match(f"TOTAL MATCH SCORE: {total_score}% (factor weights: {factor_weights}, excluded: {excluded_factors or 'none'})")
            log_match("="*60)

            if total_raw >= 0.80:
                match_level = "Excellent Match"
            elif total_raw >= 0.65:
                match_level = "Strong Match"
            elif total_raw >= 0.50:
                match_level = "Good Match"
            elif total_raw >= 0.35:
                match_level = "Partial Match ️"
            else:
                match_level = "Poor Match"
            
            candidate_job_types = candidate_prefs.get("job_types", [])
            candidate_locations = candidate_prefs.get("locations", [])
            candidate_industries = candidate_prefs.get("industries", [])
            candidate_languages = candidate_prefs.get("languages", [])
            candidate_salary_min = candidate_prefs.get("salary_min", 0)
            candidate_salary_max = candidate_prefs.get("salary_max", 0)

            _match_explanation, _match_suggestions = build_match_narrative(s, q, e, total_score, job)

            results.append({
                "match_score": total_score,
                "match_level": match_level,
                "criteria_scores": {
                    "skills_match": s["match_percentage"],
                    "qualifications_match": q["match_percentage"],
                    "experience_match": e["match_percentage"],
                    "preferences_match": p["match_percentage"]
                },
                "factor_weights_used": factor_weights,
                "excluded_factors": excluded_factors,
                "skills_breakdown": {
                    "matched_skills": s.get("matched_skills", []),
                    "missing_skills": s.get("missing_skills", []),
                    "total_required": len(job_skills),
                    "total_matched": s.get("matched_count", 0),
                    "individual_scores": s.get("individual_scores", []),
                    "applicable": s.get("applicable", True),
                    "note": s.get("note")
                },
                "qualifications_breakdown": {
                    "candidate_degrees": [d["raw"] for d in candidate_quals["degrees"]],
                    "candidate_fields": [f["raw"] for f in candidate_quals["fields"]],
                    "candidate_combined": [c["raw"] for c in candidate_quals["combined"]],
                    "job_degree_required": job_quals.get("minimum_degree", ""),
                    "job_allowed_fields": job_quals.get("fields_of_study", []),
                    "qualification_entries": job_quals.get("qualification_entries", []),  #  ADD THIS
                    "best_similarity": q.get("best_similarity", 0),
                    "best_matched_field": q.get("best_matched_field", None),
                    "match_type": q.get("match_type", "none"),
                    "match_quality": q.get("match_quality", ""),  #  ADD THIS
                    "explanation": q.get("explanation", ""),      #  ADD THIS
                    "applicable": q.get("applicable", True),
                    "excluded_dimensions": q.get("excluded_dimensions", []),
                    "redistributed_weights": q.get("redistributed_weights", {})
                },
                "experience_breakdown": {
                    "match_type": e.get("match_type", "unknown"),
                    "total_requirements": e.get("total_requirements", 0),
                    "matched_requirements": e.get("matched_requirements", 0),
                    "specific_matches": e.get("specific_matches", []),
                    "unmatched_requirements": e.get("unmatched_requirements", []),
                    "total_years": e.get("total_years", 0),
                    "relevant_years": e.get("relevant_years", 0),
                    "experience_analysis": e.get("experience_analysis", []),
                    "required_years": e.get("required_years", 0),
                    "gap_years": e.get("gap", 0)
                },
                "preferences_breakdown": {
                    "applicable": p.get("applicable", True),
                    "excluded_dimensions": p.get("excluded_dimensions", []),
                    "redistributed_weights": p.get("redistributed_weights", {}),
                    "missing_job_data": p.get("missing_job_data", []),
                    "type_match": p.get("type_match", 0),
                    "type_match_details": p.get("type_match_details", []),
                    "type_match_note": p.get("type_match_note"),
                    "remote_match": p.get("remote_match", 0),
                    "remote_match_note": p.get("remote_match_note"),
                    "location_match": p.get("location_match", 0),
                    "location_match_details": p.get("location_match_details"),
                    "location_match_note": p.get("location_match_note"),
                    "industry_match": p.get("industry_match", 0),
                    "industry_match_details": p.get("industry_match_details", []),
                    "industry_match_note": p.get("industry_match_note"),
                    "salary_match": p.get("salary_match", 0),
                    "salary_match_details": p.get("salary_match_details", {}),
                    "salary_match_note": p.get("salary_match_note"),
                    "language_match": p.get("language_match", 0),
                    "language_match_details": p.get("language_match_details", []),
                    "language_match_note": p.get("language_match_note"),
                    "candidate_job_types": candidate_job_types,
                    "candidate_locations": candidate_locations,
                    "candidate_industries": candidate_industries,
                    "candidate_languages": candidate_languages,
                    "candidate_salary_min": candidate_salary_min,
                    "candidate_salary_max": candidate_salary_max,
                    "candidate_remote_preference": candidate_prefs.get("remote_preference", "flexible")
                },
                "explanation": _match_explanation,
                "improvement_suggestions": _match_suggestions,
                "job": job_details
            })

            log_info(f"    Score: {total_score}% - {match_level}")
        
        results.sort(key=lambda x: x['match_score'], reverse=True)
        
        total_duration = (time.time() - request_start) * 1000
        log_info(f"⏱️ Total time: {total_duration:.2f}ms")
        
        cache_stats = tp.get_cache_stats()
        complete_candidate_data = extract_complete_candidate_data(profile_data)
        
        return {
            "success": True,
            "candidate": {
                "id": candidate_id,
                "name": candidate_name,
                "email": complete_candidate_data.get('email'),
                "skills_count": len(candidate_skills),
                "skills": candidate_skills[:20],
                "degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "fields": [f["raw"] for f in candidate_quals["fields"]],
                "combined_qualifications": [c["raw"] for c in candidate_quals["combined"]],
                "complete_profile": complete_candidate_data
            },
            "total_jobs_matched": len(results),
            "matches": results,
            "timestamp": datetime.now().isoformat(),
            "performance": {
                "total_ms": round(total_duration, 2),
                "jobs_processed": len(results),
                "cache_hits": cache_stats['hits'],
                "cache_misses": cache_stats['misses']
            }
        }
        
    except Exception as e:
        import traceback
        log_error(f"ERROR: {e}")
        log_error(traceback.format_exc())
        return {"success": False, "error": str(e)}


DEFAULT_MATCHER_WEIGHT = 0.70
DEFAULT_HYBRID_WEIGHT = 0.30


# ai_job_matcher_og.py is a per-job rule-based scorer with no caching of its
# own (see RECOMMENDATION_ENGINE.md §1)- it re-scores every active job from
# scratch on every /match call, ~40-45s for a full job set. Since its
# inputs (candidate profile, job list) rarely change between two requests a
# few seconds/minutes apart- e.g. a user changing top_n and resubmitting,
# or reloading the page- a short-lived cache here avoids paying that cost
# again for the SAME candidate against the SAME job set, without touching
# the matcher's own scoring logic at all ("don't rewrite the recommender").
# Invalidated explicitly (not just left to expire) whenever this candidate's
# profile changes or ANY job changes, via the realtime handlers below.
_MATCHER_CACHE_TTL_SECONDS = 180.0
_matcher_cache: Dict[str, Tuple[float, Optional[Dict[str, dict]]]] = {}
_matcher_cache_lock = threading.Lock()


def _invalidate_matcher_cache(candidate_id: Optional[str] = None) -> None:
    with _matcher_cache_lock:
        if candidate_id is None:
            _matcher_cache.clear()
        else:
            _matcher_cache.pop(str(candidate_id), None)


def fetch_matcher_scores(candidate_id: str, timeout: float = 60.0) -> Optional[Dict[str, dict]]:
    """Runs the Matcher's score_candidate_against_jobs() in-process (used to
    be a same-machine HTTP call to a separate ai_job_matcher_og.py service on
    port 8000 -- now one merged process, so this is a direct function call
    instead) and returns {job_id: full_match_object}- the *entire* per-job
    result (match_score, criteria_scores, skills_breakdown,
    qualifications_breakdown, experience_breakdown, preferences_breakdown,
    match_level, explanation), not just the final percentage, so the
    frontend's 4-factor breakdown UI has real data instead of the total
    score sitting next to all-zero factors.
    Returns None (not {}) on any failure- callers must be able to tell
    "matcher unavailable" apart from "matcher ran and found zero jobs," since
    only the former should fall back to 100% hybrid weight.

    Cached for _MATCHER_CACHE_TTL_SECONDS per candidate (see module comment
    above)- a cache hit returns in microseconds instead of ~40-45s. The
    `timeout` parameter is now vestigial (no network call to bound) but kept
    for call-site compatibility."""
    now = time.time()
    with _matcher_cache_lock:
        cached = _matcher_cache.get(candidate_id)
        if cached is not None and (now - cached[0]) < _MATCHER_CACHE_TTL_SECONDS:
            return cached[1]

    try:
        data = score_candidate_against_jobs(candidate_id)
        if not data.get("success"):
            log.warning("Matcher returned success=false for %s: %s", candidate_id, data.get("error"))
            result = None
        else:
            result = {m["job"]["id"]: m for m in data.get("matches", []) if m.get("job", {}).get("id")}
    except Exception as e:
        log.warning("Matcher unavailable (%s)- combined feed falls back to 100%% hybrid.", e)
        result = None

    # Never cache a failure- a transient matcher hiccup shouldn't force
    # every candidate to fall back to 100% hybrid for the next 3 minutes.
    if result is not None:
        with _matcher_cache_lock:
            _matcher_cache[candidate_id] = (now, result)
    return result


# combined_score_candidate() always asks engine.score_candidate() for
# max(n_jobs, top_n)- i.e. every active job, every time (see call site)- so
# the job-feed call (/score/combined) and the job-detail call
# (/score/combined/job/{id}) were each independently recomputing the SAME
# full-catalog hybrid pass for the same candidate. A candidate opening a job
# detail page right after loading the feed (or several job details back to
# back) re-ran it from scratch every single time. Same pattern as
# _matcher_cache above: cache the full per-candidate result for a short TTL,
# invalidated whenever this candidate's profile or ANY job changes.
_HYBRID_SCORE_CACHE_TTL_SECONDS = 60.0
_hybrid_score_cache: Dict[str, Tuple[float, dict]] = {}
_hybrid_score_cache_lock = threading.Lock()


def _invalidate_hybrid_score_cache(candidate_id: Optional[str] = None) -> None:
    with _hybrid_score_cache_lock:
        if candidate_id is None:
            _hybrid_score_cache.clear()
        else:
            _hybrid_score_cache.pop(str(candidate_id), None)


def _cached_score_candidate(candidate_id: str, top_n: int, exclude_content: bool) -> dict:
    """Cache wrapper around engine.score_candidate() for the all-jobs case
    used by combined_score_candidate(). Only caches the exclude_content=False,
    "give me every job" shape (top_n already >= n_jobs at every call site)-
    anything narrower just calls straight through uncached."""
    n_jobs = len(engine.jobs) if engine.jobs is not None else 0
    if exclude_content or top_n < n_jobs:
        return engine.score_candidate(candidate_id, top_n=top_n, exclude_content=exclude_content)

    now = time.time()
    with _hybrid_score_cache_lock:
        cached = _hybrid_score_cache.get(candidate_id)
        if cached is not None and (now - cached[0]) < _HYBRID_SCORE_CACHE_TTL_SECONDS:
            return cached[1]

    result = engine.score_candidate(candidate_id, top_n=top_n, exclude_content=exclude_content)
    with _hybrid_score_cache_lock:
        _hybrid_score_cache[candidate_id] = (now, result)
    return result


def combined_score_candidate(candidate_id: str, top_n: int,
                              matcher_weight: float = DEFAULT_MATCHER_WEIGHT,
                              hybrid_weight: float = DEFAULT_HYBRID_WEIGHT,
                              job_id: Optional[str] = None) -> dict:
    total_w = matcher_weight + hybrid_weight
    if total_w <= 0:
        matcher_weight, hybrid_weight = DEFAULT_MATCHER_WEIGHT, DEFAULT_HYBRID_WEIGHT
        total_w = 1.0
    matcher_weight, hybrid_weight = matcher_weight / total_w, hybrid_weight / total_w

    # Pull the FULL ranked hybrid list (every active job), not just a shortlist,
    # so every job has a hybrid score to blend against a matcher score. This
    # is a SINGLE pass (exclude_content=False, Content included)- it already
    # computes per-job explain-detail for every job (expensive: O(all jobs),
    # deliberately not the O(candidates x jobs) shortlist-only cost, see
    # ContentBasedModel.explain_match's docstring), so a second full
    # engine.score_candidate() call here would double that cost and roughly
    # double how long score_candidate()'s internal lock is held- exactly
    # what caused a real request-pileup regression when this was first
    # tried as two full passes. Instead, the content-EXCLUDED total_score
    # (needed for jobs the matcher also scored- see below) is reconstructed
    # algebraically from this one pass's own per-job "detail" breakdown,
    # which already exposes every raw signal (content/behavior/
    # collaborative/freshness/popularity) before weighting.
    n_jobs = len(engine.jobs) if engine.jobs is not None else top_n
    hybrid_result = _cached_score_candidate(candidate_id, top_n=max(n_jobs, top_n), exclude_content=False)
    hybrid_by_job_full = {j["job_id"]: j for j in hybrid_result["scored_jobs"]}

    has_behavior = hybrid_result.get("has_behavior", False)
    has_collaborative = hybrid_result.get("has_collaborative", False)
    # freshness_scores() only ever returns has_freshness=False when literally
    # every active job is missing created_at- doesn't happen in practice with
    # real seeded data, and score_candidate() doesn't expose the batch-level
    # flag at the top level to recompute this without a second DB round trip.
    weights_excl_content = CFG.hybrid_weights.normalized(
        has_collab=has_collaborative, has_behavior=has_behavior, exclude_content=True, has_freshness=True)

    def _content_excluded_score(entry: dict) -> float:
        """Re-derive total_score as if exclude_content=True had been passed-
        same math score_candidate() itself does (weighted sum * business-rule
        modifier * age-fit modifier), using this entry's own already-computed
        raw per-signal values instead of a second scoring pass."""
        d = entry.get("detail") or {}
        raw = (weights_excl_content.behavior * d.get("behavior", {}).get("final_score", 0.0)
               + weights_excl_content.collaborative * d.get("collaborative", {}).get("raw_score", 0.0)
               + weights_excl_content.freshness * d.get("freshness", {}).get("score", 0.0)
               + weights_excl_content.popularity * d.get("popularity", {}).get("score", 0.0))
        biz_modifier = d.get("business_rules", {}).get("modifier", 1.0)
        age_modifier = d.get("content", {}).get("age_fit_score", 1.0)
        return round(raw * biz_modifier * age_modifier * 100, 2)

    # Single-job callers (job-detail pages, via score_combined_job) only need
    # ONE job's matcher result, not fetch_matcher_scores()'s full ~40-45s
    # all-jobs pass (see its docstring) just to throw every job but one away.
    # _match_candidate_against_job() runs the same factor1-4 logic
    # /matcher/match/job/{job_id} uses, scoped to this one pair. Falls
    # through to hybrid-only (matcher_matches=None) on ANY failure- job/
    # candidate not found, matcher error- score_combined_job's existing
    # "no score at all -> 404" check still applies further down.
    if job_id is not None:
        matcher_matches = None
        try:
            single_result, *_ = _match_candidate_against_job(candidate_id, job_id)
            matcher_matches = {job_id: single_result}
        except KeyError:
            pass
        except Exception as e:
            log.warning("Single-job matcher scoring failed for %s/%s: %s", candidate_id, job_id, e)
    else:
        matcher_matches = fetch_matcher_scores(candidate_id)  # None => matcher unavailable
    matcher_used = matcher_matches is not None

    # Shift the OUTER matcher/hybrid split itself (not just weight redistribution
    # inside hybrid's own bucket) based on how much of hybrid's composition is
    # genuinely PERSONALIZED (Behavior/Collaborative) for THIS candidate, vs
    # generic job attributes (Freshness/Popularity). A candidate with neither
    # Behavior nor Collaborative data has a hybrid score built almost entirely
    # from Freshness/Popularity- real, calculated numbers, but not "does this
    # job fit YOU"- so keeping hybrid's full fixed share would dilute the
    # matcher's always-genuine profile-fit score with mostly-generic signal.
    # Content is already excluded above, so the budget here is
    # Behavior+Collaborative+Freshness+Popularity. Only applies when the matcher
    # actually responded- if it didn't, hybrid already covers scoring alone via
    # the hybrid-only fallback below, so there's nothing to shift weight toward.
    if matcher_used:
        hw = CFG.hybrid_weights
        base_total = hw.behavior + hw.collaborative + hw.freshness + hw.popularity
        present_total = hw.freshness + hw.popularity
        if has_behavior:
            present_total += hw.behavior
        if has_collaborative:
            present_total += hw.collaborative
        personalization_ratio = present_total / base_total if base_total > 0 else 1.0
        adjusted_hybrid_weight = hybrid_weight * personalization_ratio
        matcher_weight = matcher_weight + (hybrid_weight - adjusted_hybrid_weight)
        hybrid_weight = adjusted_hybrid_weight

    # In single-job mode there's nothing to gain from iterating every job
    # hybrid_by_job_full has- only the requested one is ever looked at.
    all_job_ids = {job_id} if job_id is not None else (set(hybrid_by_job_full) | set(matcher_matches or {}))
    combined = []
    for jid in all_job_ids:
        matcher_entry = matcher_matches.get(jid) if matcher_matches else None
        matcher_pct = float(matcher_entry["match_score"]) if matcher_entry else None

        hybrid_entry = hybrid_by_job_full.get(jid)
        # Content-excluded score ONLY when the matcher actually scored THIS
        # job too (a real blend is about to happen, and Content would
        # otherwise double-count the matcher's own profile-vs-job fit);
        # otherwise the content-INCLUDED score, since hybrid is carrying
        # this job alone and needs its full weight.
        content_included_for_job = matcher_pct is None
        hybrid_pct = (hybrid_entry["total_score"] if content_included_for_job
                      else _content_excluded_score(hybrid_entry)) if hybrid_entry else 0.0

        if matcher_pct is not None and hybrid_entry is not None:
            final = matcher_weight * matcher_pct + hybrid_weight * hybrid_pct
            source = "matcher+hybrid"
        elif matcher_pct is not None:
            final = matcher_pct  # hybrid had nothing for this job- don't invent a 0
            source = "matcher-only"
        elif hybrid_entry is not None:
            final = hybrid_pct  # matcher unavailable/had nothing- use hybrid alone
            source = "hybrid-only"
        else:
            continue

        job_details = hybrid_entry["job"] if hybrid_entry else None
        if job_details is None and engine.jobs is not None:
            match_rows = engine.jobs[engine.jobs["id"].astype(str) == jid]
            if not match_rows.empty:
                job_details = job_details_dict(match_rows.iloc[0])

        combined.append({
            "job_id": jid,
            "title": hybrid_entry["title"] if hybrid_entry else (job_details or {}).get("title"),
            "company": hybrid_entry["company"] if hybrid_entry else (job_details or {}).get("company_name"),
            "job": job_details,
            "total_score": round(final, 2),
            "matcher_score": round(matcher_pct, 2) if matcher_pct is not None else None,
            "hybrid_score": round(hybrid_pct, 2) if hybrid_entry else None,
            "score_source": source,
            # True when this job's hybrid_score includes Content (source is
            # "hybrid-only", so Content isn't double-counted with anything);
            # False when the matcher also scored this job and Content was
            # excluded from hybrid_score to avoid double-counting it against
            # the matcher's own profile-vs-job fit (source "matcher+hybrid").
            "hybrid_content_included": bool(hybrid_entry is not None and content_included_for_job),
            "reasons": hybrid_entry["reasons"] if hybrid_entry else [],
            # Full 4-factor breakdown from the matcher- None when the matcher
            # had no data for this job (hybrid-only), so the UI can tell
            # "no data" apart from "scored 0".
            "matcher_breakdown": {
                "match_level": matcher_entry.get("match_level"),
                "criteria_scores": matcher_entry.get("criteria_scores"),
                "skills_breakdown": matcher_entry.get("skills_breakdown"),
                "qualifications_breakdown": matcher_entry.get("qualifications_breakdown"),
                "experience_breakdown": matcher_entry.get("experience_breakdown"),
                "preferences_breakdown": matcher_entry.get("preferences_breakdown"),
                "explanation": matcher_entry.get("explanation"),
                "improvement_suggestions": matcher_entry.get("improvement_suggestions"),
            } if matcher_entry else None,
            # Full behavior/collaborative/freshness/popularity/business-rule
            # breakdown from THIS service- None when hybrid had nothing for
            # this job (matcher-only), same "no data" vs "scored 0" contract
            # as matcher_breakdown above.
            "hybrid_detail": hybrid_entry.get("detail") if hybrid_entry else None,
        })

    combined.sort(key=lambda c: c["total_score"], reverse=True)
    return {
        "scored_jobs": combined[:top_n],
        "total_jobs": len(combined),
        "cold_start": hybrid_result.get("cold_start", False),
        "matcher_available": matcher_used,
        "weights_used": {"matcher": round(matcher_weight, 3), "hybrid": round(hybrid_weight, 3)},
        "interest_profile": hybrid_result.get("interest_profile", {}),
    }


# ==========================================================================
# 10. FASTAPI APP
# ==========================================================================

app = FastAPI(title="SimuHire Hybrid Job Recommender", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ScoreRequest(BaseModel):
    candidate_id: str
    top_n: int = CFG.top_k_default
    cache_result: bool = True


@app.post("/score")
async def score(req: ScoreRequest):
    try:
        result = engine.score_candidate(req.candidate_id, req.top_n)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error("Scoring failed for %s: %s", req.candidate_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    if req.cache_result and result["scored_jobs"]:
        rows = [(req.candidate_id, j["job_id"], j["total_score"]) for j in result["scored_jobs"]]
        try:
            engine.db.upsert_feed_scores(rows)
        except Exception as e:
            log.warning("feed_scores cache write failed: %s", e)

    return {**result, "computed_at": datetime.now().isoformat(),
            "engine": "hybrid-content(semantic+tfidf)+behavior(interests+search+content-similarity)"
                      "+collaborative(similar-candidates)+freshness+popularity+business-rule"}


class CombinedScoreRequest(BaseModel):
    candidate_id: str
    top_n: int = CFG.top_k_default
    cache_result: bool = True
    matcher_weight: float = DEFAULT_MATCHER_WEIGHT
    hybrid_weight: float = DEFAULT_HYBRID_WEIGHT


@app.post("/score/combined")
async def score_combined(req: CombinedScoreRequest):
    """The actual job feed: ai_job_matcher_og.py's profile-fit score (default
    70%) blended with this service's own hybrid score (default 30%).
    matcher_weight/hybrid_weight are per-request so the split is tunable
    without a redeploy."""
    try:
        result = combined_score_candidate(req.candidate_id, req.top_n, req.matcher_weight, req.hybrid_weight)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error("Combined scoring failed for %s: %s", req.candidate_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    if req.cache_result and result["scored_jobs"]:
        rows = [(req.candidate_id, j["job_id"], j["total_score"]) for j in result["scored_jobs"]]
        try:
            engine.db.upsert_feed_scores(rows)
        except Exception as e:
            log.warning("feed_scores cache write failed: %s", e)

    return {**result, "computed_at": datetime.now().isoformat(), "engine": "matcher+hybrid-combined-feed"}


class CombinedJobScoreRequest(BaseModel):
    candidate_id: str
    matcher_weight: float = DEFAULT_MATCHER_WEIGHT
    hybrid_weight: float = DEFAULT_HYBRID_WEIGHT


class RealtimeEventRequest(BaseModel):
    event_type: str = "recommendation_update"
    entity_type: str
    operation: str = "upsert"
    entity_id: Optional[str] = None
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "webhook"


class RealtimeBatchRequest(BaseModel):
    events: List[RealtimeEventRequest]


def _validate_realtime_webhook_secret(x_recommendation_secret: Optional[str]) -> None:
    if CFG.webhook_secret and x_recommendation_secret != CFG.webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


@app.post("/webhooks/recommendation-events")
async def webhook_recommendation_event(
    req: RealtimeEventRequest,
    x_recommendation_secret: Optional[str] = Header(default=None, alias="X-Recommendation-Secret"),
):
    _validate_realtime_webhook_secret(x_recommendation_secret)
    accepted = engine.enqueue_realtime_events([req.dict()])
    return {"accepted": accepted, "queue_size": engine._realtime_queue.qsize(), "received_at": datetime.now().isoformat()}


@app.post("/webhooks/recommendation-events/batch")
async def webhook_recommendation_events_batch(
    req: RealtimeBatchRequest,
    x_recommendation_secret: Optional[str] = Header(default=None, alias="X-Recommendation-Secret"),
):
    _validate_realtime_webhook_secret(x_recommendation_secret)
    accepted = engine.enqueue_realtime_events([event.dict() for event in req.events])
    return {"accepted": accepted, "queue_size": engine._realtime_queue.qsize(), "received_at": datetime.now().isoformat()}


@app.get("/realtime/status")
async def realtime_status():
    return {
        "queue_size": engine._realtime_queue.qsize(),
        "listener_started": engine._realtime_started,
        "collaborative_refresh_pending": engine._collab_retrain_pending.is_set(),
        "collaborative_refresh_running": engine._collab_retrain_running,
        "last_trained_at": engine.last_trained_at.isoformat() if engine.last_trained_at else None,
    }


@app.post("/score/combined/job/{job_id}")
async def score_combined_job(job_id: str, req: CombinedJobScoreRequest):
    """Single-job variant of /score/combined, for job-detail pages (View
    Details)- same 70% matcher + 30% hybrid blend as the feed, so a
    candidate sees one consistent score everywhere instead of the feed
    showing the blended score while the detail page shows matcher-only."""
    try:
        result = combined_score_candidate(req.candidate_id, top_n=len(engine.jobs) + 1,
                                           matcher_weight=req.matcher_weight, hybrid_weight=req.hybrid_weight,
                                           job_id=job_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error("Combined single-job scoring failed for %s/%s: %s", req.candidate_id, job_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    match = next((j for j in result["scored_jobs"] if j["job_id"] == job_id), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"No score available for job {job_id} (not active/published, or excluded from both scorers)")

    return {
        "job_match": match,
        "matcher_available": result["matcher_available"],
        "weights_used": result["weights_used"],
        "computed_at": datetime.now().isoformat(),
    }


@app.post("/refresh")
async def refresh():
    try:
        stats = engine.prepare()
        engine.start_realtime_updates()
        return {"status": "trained", **stats}
    except Exception as e:
        log.error("Refresh failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {
        "status": "up" if engine.last_trained_at else "untrained",
        "last_trained_at": engine.last_trained_at.isoformat() if engine.last_trained_at else None,
        "n_candidates": len(engine.candidates) if engine.candidates is not None else 0,
        "n_jobs": len(engine.jobs) if engine.jobs is not None else 0,
        "collaborative_trained": engine.collaborative_model.trained,
        "semantic_encoder_available": engine.semantic_encoder.available,
        "device": str(engine.collaborative_model.device),
    }


@app.get("/behavior/stats")
async def behavior_stats():
    """Raw interaction counts currently held by the engine- lets a candidate-
    facing 'My Activity' page confirm interactions (including incomplete/
    abandoned applications) have actually reached the ML model, not just
    the database."""
    def _n(df: Optional[pd.DataFrame]) -> int:
        return int(len(df)) if df is not None else 0

    return {
        "views": _n(engine.views),
        "saves": _n(engine.saves),
        "applications": _n(engine.applications),
        "incomplete_applications": _n(engine.incomplete_applications),
        "search_events": _n(engine.search_events),
        "last_trained_at": engine.last_trained_at.isoformat() if engine.last_trained_at else None,
    }


# ==========================================================================
# MATCHER ROUTES -- mounted at /matcher (was its own service on port 8000;
# gateway.py now proxies /matcher/* to this same merged process/port
# without stripping the prefix, so these paths match exactly).
# ==========================================================================
matcher_router = APIRouter(prefix="/matcher")

@matcher_router.post("/match")
async def match_candidate(request: Request):
    candidate_id, request_error = await parse_candidate_id_request(request)
    if request_error:
        return request_error
    log_info(f"\n{'='*70}")
    log_info(f"👤 Candidate ID: {candidate_id}")
    log_info(f"{'='*70}")
    return score_candidate_against_jobs(candidate_id)


def _match_candidate_against_job(candidate_id: str, job_id: str):
    """Core single (candidate, job) 4-factor match- the actual scoring logic
    behind /matcher/match/job/{job_id}, extracted so combined_score_candidate()
    can call it directly for its single-job path (score_combined_job) instead
    of fetch_matcher_scores(), which computes and caches ALL jobs (~40-45s
    uncached- see its docstring) just to throw away every job but one.

    Raises KeyError('candidate') / KeyError('job') when either isn't found-
    the two "not found" cases the route below used to return directly.
    Returns (result, candidate_name, candidate_skills, candidate_quals,
    complete_candidate_data)- result is the same shape as one entry from
    score_candidate_against_jobs()'s batch (match_score, criteria_scores,
    skills/qualifications/experience/preferences_breakdown, etc.)."""
    profile_resp = backend.get_profile(candidate_id)
    if not profile_resp or not profile_resp.get('data'):
        raise KeyError('candidate')

    profile_data = profile_resp.get('data', {})

    candidate_age = factor4.extract_candidate_age(profile_data)

    job = backend.get_job_by_id(job_id)
    if not job:
        raise KeyError('job')
    job_age_requirement = job.get('education_required', {}).get('age_requirement', '')

    # Dynamic correction vocabulary from the candidate's + this job's own skills.
    tp.dynamic_vocab = set()
    tp.add_to_vocab(_collect_skill_terms(profile_data, job))

    candidate_skills = factor1.extract_candidate_skills(profile_data)
    candidate_quals = factor2.extract_candidate_qualifications(profile_data)
    candidate_prefs = factor4.extract_candidate_preferences(profile_data)

    personal = profile_data.get('profile', {}).get('personal_info', {})
    candidate_name = personal.get('full_name', 'Unknown')

    log_candidate(f"Name: {candidate_name}")
    log_candidate(f"Skills from DB ({len(candidate_skills)}): {', '.join(candidate_skills[:10])}")

    job_title = job.get('title', 'Unknown')
    job_details = extract_all_job_fields(job)
    job_skills = factor1.extract_job_skills(job)
    job_quals = factor2.extract_job_qualifications(job)

    log_job(f"Job: {job_title}")
    log_job(f"Required Skills from DB ({len(job_skills)}): {', '.join(job_skills[:10])}")

    log_match("="*60)
    log_match(f"MATCHING: {candidate_name} vs {job_title}")
    log_match("="*60)

    log_match("FACTOR 1: SKILLS (40%)")
    s = factor1.match(candidate_skills, job_skills)

    log_match("FACTOR 2: QUALIFICATIONS (25%)")
    q = factor2.match(candidate_quals, job_quals)

    log_match("FACTOR 3: EXPERIENCE (20%)")
    e = factor3.match(profile_data, job)

    log_match("FACTOR 4: PREFERENCES (15%)")
    p = factor4.match(candidate_prefs, job, candidate_age, job_age_requirement)

    # Same top-level redistribution as the batch path in
    # score_candidate_against_jobs -- see the comment there.
    factor_weights = redistribute_weights({
        "skills": (s.get("applicable", True), 0.40),
        "qualifications": (q.get("applicable", True), 0.25),
        "experience": (True, 0.20),
        "preferences": (p.get("applicable", True), 0.15),
    })
    total_raw = (s["score"] * factor_weights["skills"] + q["score"] * factor_weights["qualifications"]
                + e["score"] * factor_weights["experience"] + p["score"] * factor_weights["preferences"])
    total_score = round(total_raw * 100, 1)
    excluded_factors = [name for name, w in factor_weights.items() if w == 0.0]

    log_match("="*60)
    log_match(f"TOTAL MATCH SCORE: {total_score}% (factor weights: {factor_weights}, excluded: {excluded_factors or 'none'})")
    log_match("="*60)

    if total_raw >= 0.80:
        match_level = "Excellent Match 🌟"
    elif total_raw >= 0.65:
        match_level = "Strong Match "
    elif total_raw >= 0.50:
        match_level = "Good Match 👍"
    elif total_raw >= 0.35:
        match_level = "Partial Match ️"
    else:
        match_level = "Poor Match ❌"

    candidate_job_types = candidate_prefs.get("job_types", [])
    candidate_locations = candidate_prefs.get("locations", [])
    candidate_industries = candidate_prefs.get("industries", [])
    candidate_languages = candidate_prefs.get("languages", [])
    candidate_salary_min = candidate_prefs.get("salary_min", 0)
    candidate_salary_max = candidate_prefs.get("salary_max", 0)

    result = {
        "match_score": total_score,
        "match_level": match_level,
        "criteria_scores": {
            "skills_match": s["match_percentage"],
            "qualifications_match": q["match_percentage"],
            "experience_match": e["match_percentage"],
            "preferences_match": p["match_percentage"]
        },
        "factor_weights_used": factor_weights,
        "excluded_factors": excluded_factors,
        "skills_breakdown": {
            "matched_skills": s.get("matched_skills", []),
            "missing_skills": s.get("missing_skills", []),
            "total_required": len(job_skills),
            "total_matched": s.get("matched_count", 0),
            "individual_scores": s.get("individual_scores", []),
            "applicable": s.get("applicable", True),
            "note": s.get("note")
        },
        "qualifications_breakdown": {
            "candidate_degrees": [d["raw"] for d in candidate_quals["degrees"]],
            "candidate_fields": [f["raw"] for f in candidate_quals["fields"]],
            "candidate_combined": [c["raw"] for c in candidate_quals["combined"]],
            "job_degree_required": job_quals.get("minimum_degree", ""),
            "job_allowed_fields": job_quals.get("fields_of_study", []),
            "qualification_entries": job_quals.get("qualification_entries", []),  #  ADD THIS
            "best_similarity": q.get("best_similarity", 0),
            "best_matched_field": q.get("best_matched_field", None),
            "match_type": q.get("match_type", "none"),
            "match_quality": q.get("match_quality", ""),  #  ADD THIS
            "explanation": q.get("explanation", ""),      #  ADD THIS
            "applicable": q.get("applicable", True),
            "excluded_dimensions": q.get("excluded_dimensions", []),
            "redistributed_weights": q.get("redistributed_weights", {})
        },
        "experience_breakdown": {
            "match_type": e.get("match_type", "unknown"),
            "total_requirements": e.get("total_requirements", 0),
            "matched_requirements": e.get("matched_requirements", 0),
            "specific_matches": e.get("specific_matches", []),
            "unmatched_requirements": e.get("unmatched_requirements", []),
            "total_years": e.get("total_years", 0),
            "relevant_years": e.get("relevant_years", 0),
            "experience_analysis": e.get("experience_analysis", []),
            "required_years": e.get("required_years", 0),
            "gap_years": e.get("gap", 0)
        },
        "preferences_breakdown": {
            "applicable": p.get("applicable", True),
            "excluded_dimensions": p.get("excluded_dimensions", []),
            "redistributed_weights": p.get("redistributed_weights", {}),
            "missing_job_data": p.get("missing_job_data", []),
            "type_match": p.get("type_match", 0),
            "type_match_details": p.get("type_match_details", []),
            "type_match_note": p.get("type_match_note"),
            "remote_match": p.get("remote_match", 0),
            "remote_match_note": p.get("remote_match_note"),
            "location_match": p.get("location_match", 0),
            "location_match_details": p.get("location_match_details"),
            "location_match_note": p.get("location_match_note"),
            "industry_match": p.get("industry_match", 0),
            "industry_match_details": p.get("industry_match_details", []),
            "industry_match_note": p.get("industry_match_note"),
            "salary_match": p.get("salary_match", 0),
            "salary_match_details": p.get("salary_match_details", {}),
            "salary_match_note": p.get("salary_match_note"),
            "language_match": p.get("language_match", 0),
            "language_match_details": p.get("language_match_details", []),
            "language_match_note": p.get("language_match_note"),
            "candidate_job_types": candidate_job_types,
            "candidate_locations": candidate_locations,
            "candidate_industries": candidate_industries,
            "candidate_languages": candidate_languages,
            "candidate_salary_min": candidate_salary_min,
            "candidate_salary_max": candidate_salary_max,
            "candidate_remote_preference": candidate_prefs.get("remote_preference", "flexible")
        },
        "explanation": build_match_narrative(s, q, e, total_score, job)[0],
        "improvement_suggestions": build_match_narrative(s, q, e, total_score, job)[1],
        "job": job_details
    }

    complete_candidate_data = extract_complete_candidate_data(profile_data)
    return result, candidate_name, candidate_skills, candidate_quals, complete_candidate_data


@matcher_router.post("/match/job/{job_id}")
async def match_candidate_for_job(job_id: str, request: Request):
    """
    Match a specific candidate against a specific job
    POST /match/job/{job_id}
    Body: {"candidate_id": "..."}
    """
    request_start = time.time()

    try:
        candidate_id, request_error = await parse_candidate_id_request(request)
        if request_error:
            return request_error

        log_info(f"\n{'='*70}")
        log_info(f"👤 Candidate ID: {candidate_id}")
        log_info(f"💼 Job ID: {job_id}")
        log_info(f"{'='*70}")

        if not candidate_id:
            return {"success": False, "error": "Missing candidate_id"}

        try:
            result, candidate_name, candidate_skills, candidate_quals, complete_candidate_data = \
                _match_candidate_against_job(candidate_id, job_id)
        except KeyError as e:
            if str(e).strip("'") == 'candidate':
                return {"success": False, "error": "Candidate not found"}
            return {"success": False, "error": f"Job not found: {job_id}"}

        total_duration = (time.time() - request_start) * 1000
        log_info(f"⏱️ Total time: {total_duration:.2f}ms")

        cache_stats = tp.get_cache_stats()

        return {
            "success": True,
            "candidate": {
                "id": candidate_id,
                "name": candidate_name,
                "email": complete_candidate_data.get('email'),
                "skills_count": len(candidate_skills),
                "skills": candidate_skills[:20],
                "degrees": [d["raw"] for d in candidate_quals["degrees"]],
                "fields": [f["raw"] for f in candidate_quals["fields"]],
                "combined_qualifications": [c["raw"] for c in candidate_quals["combined"]],
                "complete_profile": complete_candidate_data
            },
            "match": result,
            "timestamp": datetime.now().isoformat(),
            "performance": {
                "total_ms": round(total_duration, 2),
                "cache_hits": cache_stats['hits'],
                "cache_misses": cache_stats['misses']
            }
        }

    except Exception as e:
        import traceback
        log_error(f"ERROR: {e}")
        log_error(traceback.format_exc())
        return {"success": False, "error": str(e)}


@matcher_router.get("/")
async def matcher_root():
    return {
        "api": "Complete Database-Driven Job Matching API",
        "version": "19.0.0",
        "status": "running",
        "matching_type": "100% database-driven - NO hardcoded values",
        "fixed_issues": [
            "Languages field now properly handles dictionary objects",
            "Experience requirements correctly parsed from JSONB",
            "Certifications properly extracted from education_required",
            "Added proper type checking for all fields"
        ],
        "factors": {
            "skills": {"weight": "40%", "source": "skills table + user_skills table"},
            "qualifications": {"weight": "25%", "source": "education table + job education_required"},
            "experience": {"weight": "20%", "source": "work_experience table + job education_required.experience_requirements"},
            "preferences": {"weight": "15%", "source": "job_preferences JSONB"}
        },
        "endpoints": {
            "POST /matcher/match": "Match candidate against ALL jobs",
            "POST /matcher/match/job/{job_id}": "Match candidate against specific job",
            "GET /matcher/health": "Health check",
            "GET /matcher/stats": "Cache statistics",
            "GET /matcher/logs/{log_type}": "View logs"
        }
    }


@matcher_router.get("/health")
async def matcher_health():
    return {"status": "healthy", "ml_ready": True}


@matcher_router.get("/stats")
async def matcher_stats():
    cache_stats = tp.get_cache_stats()
    return {
        "success": True,
        "cache_stats": cache_stats,
        "log_directory": str(LOG_DIR),
        "note": "100% database-driven - ALL fields extracted from database"
    }


@matcher_router.get("/logs/{log_type}")
async def matcher_view_log(log_type: str, lines: int = 100):
    log_map = {
        "main": MAIN_LOG,
        "error": ERROR_LOG,
        "performance": PERFORMANCE_LOG,
        "candidate": CANDIDATE_LOG,
        "job": JOB_LOG,
        "match": MATCH_LOG
    }
    log_file = log_map.get(log_type)
    if not log_file or not log_file.exists():
        return {"success": False, "error": f"Log {log_type} not found"}
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
            last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"success": True, "log_type": log_type, "lines": len(last_lines), "content": "".join(last_lines)}
    except Exception as e:
        return {"success": False, "error": str(e)}


app.include_router(matcher_router)


def _background_refresh_loop(interval_minutes: int):
    while True:
        time.sleep(interval_minutes * 60)
        try:
            engine.prepare()
        except Exception as e:
            log.error("Background refresh failed: %s", e)


@app.on_event("startup")
async def on_startup():
    try:
        engine.prepare()
    except Exception as e:
        log.error("Initial training failed (service will still serve cold-start content scoring once DB is reachable): %s", e)
    finally:
        engine.start_realtime_updates()


@app.on_event("shutdown")
async def on_shutdown():
    engine.stop_realtime_updates()


# ==========================================================================
# 11. ENTRY POINT
# ==========================================================================

def main():
    # write_log() opens these in append mode with no cap, so across dev
    # restarts they grow unbounded- match_results.log and job_data.log each
    # reached 35-50MB in one session. Clear them here so each run starts
    # fresh. hybrid_recommender.log is exempt- it's a RotatingFileHandler
    # (maxBytes=10MB, backupCount=3) and already caps/rotates itself.
    for _log_file in [MAIN_LOG, ERROR_LOG, PERFORMANCE_LOG, REQUEST_LOG,
                       CANDIDATE_LOG, JOB_LOG, MATCH_LOG]:
        try:
            open(_log_file, "w", encoding="utf-8").close()
        except OSError:
            pass

    parser = argparse.ArgumentParser(description="Hybrid Job Recommender (live DB-backed service)")
    parser.add_argument("--check-db", action="store_true", help="Verify DB connectivity and print row counts, then exit.")
    parser.add_argument("--port", type=int, default=CFG.port)
    args = parser.parse_args()

    if args.check_db:
        db = Database(CFG.db)
        print("Candidates:", len(db.fetch_candidates()))
        print("Active jobs:", len(db.fetch_active_jobs()))
        print("Job views:", len(db.fetch_view_events()))
        print("Applications:", len(db.fetch_application_events()))
        print("Saved jobs:", len(db.fetch_save_events()))
        print("Incomplete applications:", len(db.fetch_incomplete_application_events()))
        print("Ignored jobs:", len(db.fetch_ignored_pairs()))
        print("Search events:", len(db.fetch_search_events()))
        return

    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
