"""
behaviour.py
============
Tables with zero real source data: `job_searches` (search_history.csv),
`feed_scores` (recommendation_history.csv), and `ignored_jobs`. All three
are generated FROM each candidate's already-real profile (field of study,
degree, district) and already-real engagement (view/apply history), so
they read as behaviourally consistent with the rest of that candidate's
record rather than arbitrary filler.
"""

from __future__ import annotations

import random
from datetime import timedelta
from typing import Dict, List

import pandas as pd

from . import mapping

SEARCH_TEMPLATES = [
    "{field} jobs in {district}",
    "{degree} vacancies",
    "{field} positions Rwanda",
    "jobs in {district}",
    "government jobs {field}",
    "{degree} {field}",
]


def build_behaviour_tables(candidates_flat: pd.DataFrame, jobs_flat: pd.DataFrame,
                            job_views_df: pd.DataFrame, applications_df: pd.DataFrame,
                            seed: int) -> Dict[str, pd.DataFrame]:
    rng = random.Random(seed)

    jobs_by_field: Dict[str, List[dict]] = {}
    for j in jobs_flat.itertuples(index=False):
        jobs_by_field.setdefault(j.field_of_study, []).append(j._asdict())
    all_jobs = jobs_flat.to_dict("records")

    views_by_candidate = (job_views_df.groupby("_original_candidate_id")
                           if not job_views_df.empty else None)
    apps_by_candidate = (applications_df.groupby("_original_candidate_id")
                          if not applications_df.empty else None)

    search_rows, feed_score_rows, ignored_rows = [], [], []

    for c in candidates_flat.itertuples(index=False):
        original_id = c.original_candidate_id
        user_id = c.candidate_id
        field = c.field_of_study
        degree = c.degree

        touched_job_ids = set()
        candidate_views = views_by_candidate.get_group(original_id) if (
            views_by_candidate is not None and original_id in views_by_candidate.groups) else pd.DataFrame()
        if not candidate_views.empty:
            touched_job_ids.update(candidate_views["_original_job_id"].tolist())
        candidate_apps = apps_by_candidate.get_group(original_id) if (
            apps_by_candidate is not None and original_id in apps_by_candidate.groups) else pd.DataFrame()
        if not candidate_apps.empty:
            touched_job_ids.update(candidate_apps["_original_job_id"].tolist())

        activity_dates = []
        if not candidate_views.empty:
            activity_dates += pd.to_datetime(candidate_views["viewed_at"]).tolist()
        if not activity_dates:
            activity_dates = [pd.Timestamp("2026-08-01")]
        base_date = min(activity_dates)

        # ── search_history: generated from the candidate's own real field/degree ──
        for search_idx in range(rng.randint(0, 5)):
            template = rng.choice(SEARCH_TEMPLATES)
            query = template.format(field=(field or "government").split(",")[0].strip(),
                                     district=c.district, degree=degree)
            searched_at = base_date - timedelta(days=rng.randint(0, 14), hours=rng.randint(0, 23))
            search_rows.append({
                # Index included because two searches can legitimately generate
                # the same (query, timestamp) by chance from a small template
                # pool — content alone isn't a reliable unique key here.
                "id": mapping.deterministic_uuid("search", original_id, str(search_idx)),
                "user_id": user_id, "query": query, "searched_at": searched_at,
            })

        # ── feed_scores / recommendation_history ──
        candidate_pool = jobs_by_field.get(field, []) or all_jobs
        sample_size = min(len(candidate_pool), rng.randint(3, 8))
        recommended = rng.sample(candidate_pool, k=sample_size) if sample_size else []
        for job in recommended:
            touched = job["original_job_id"] in touched_job_ids
            score = rng.uniform(60, 95) if touched else rng.uniform(30, 80)
            feed_score_rows.append({
                "candidate_id": user_id, "job_id": job["job_id"],
                "score": round(score, 2),
                "computed_at": base_date - timedelta(days=rng.randint(0, 10)),
                "_original_candidate_id": original_id, "_original_job_id": job["original_job_id"],
            })

        # ── ignored_jobs: real jobs never touched by this candidate ──
        untouched = [j for j in all_jobs if j["original_job_id"] not in touched_job_ids]
        for job in rng.sample(untouched, k=min(len(untouched), rng.randint(0, 3))):
            ignored_at = base_date + timedelta(days=rng.randint(0, 20))
            ignored_rows.append({
                "id": mapping.deterministic_uuid("ignored", original_id, job["original_job_id"]),
                "user_id": user_id, "job_id": job["job_id"], "ignored_at": ignored_at,
                "_original_candidate_id": original_id, "_original_job_id": job["original_job_id"],
            })

    feed_scores_df = pd.DataFrame(feed_score_rows)
    if not feed_scores_df.empty:
        feed_scores_df = feed_scores_df.drop_duplicates(subset=["candidate_id", "job_id"], keep="last")
    ignored_df = pd.DataFrame(ignored_rows)
    if not ignored_df.empty:
        ignored_df = ignored_df.drop_duplicates(subset=["user_id", "job_id"], keep="last")

    return {
        "job_searches": pd.DataFrame(search_rows),
        "feed_scores": feed_scores_df,
        "ignored_jobs": ignored_df,
    }
