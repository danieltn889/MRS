"
engagement.py
=============
Builds `job_views` from real Cleaned_Combined_Engagement.csv rows (real
candidate/job/view-date + real funnel flags used only to bias generated
`seconds_spent`). `job_views` has a UNIQUE(user_id, job_id) constraint  
same semantics as the app's own upsert (see feed.controller.ts
logJobView: GREATEST(seconds_spent), latest viewed_at)   so multiple real
view rows for the same pair are collapsed to one, keeping the latest date
and the max engagement signal.

`saved_jobs` has NO real source data at all (Job_Save is empty across all
4.85M rows   verified, not assumed)   it's entirely generated, biased
towards views that also show real Applied/Shortlisted engagement, which is
a realistic proxy for "candidates are more likely to save jobs they're
seriously considering."
"

from __future__ import annotations

import random
from datetime import timedelta
from typing import Dict

import pandas as pd

from . import mapping
from .date_shift import apply_shift, to_date


def build_engagement_tables(engagement_raw: pd.DataFrame, jobs_flat_df: pd.DataFrame,
                             job_shifts: Dict[str, timedelta], seed: int) -> Dict[str, pd.DataFrame]:
    rng = random.Random(seed)
    if engagement_raw.empty:
        return {"job_views": pd.DataFrame(), "saved_jobs": pd.DataFrame()}

    job_windows = jobs_flat_df.set_index("original_job_id")[["published_at", "expires_at"]]

    e = engagement_raw.copy()
    for col in ("Clicked_Apply", "Applied", "Shortlisted", "Interviewed", "Hired"):
        e[col] = (e[col] == "Yes").astype(int)
    e["_engagement_strength"] = e[["Clicked_Apply", "Applied", "Shortlisted", "Interviewed", "Hired"]].sum(axis=1)

    # Collapse to one row per (candidate, job): latest view, strongest engagement seen.
    agg = (e.sort_values("View_Date")
           .groupby(["Candidate_ID", "Job_ID"], as_index=False)
           .agg(View_Date=("View_Date", "last"), strength=("_engagement_strength", "max")))

    view_rows, save_rows = [], []
    for r in agg.itertuples(index=False):
        original_job_id = r.Job_ID
        if original_job_id not in job_windows.index:
            continue
        floor = to_date(job_windows.loc[original_job_id, "published_at"])
        ceiling = to_date(job_windows.loc[original_job_id, "expires_at"])
        shift = job_shifts.get(original_job_id, timedelta(0))
        viewed_at = apply_shift(r.View_Date, shift, floor, ceiling)

        user_id = mapping.candidate_uuid(r.Candidate_ID)
        job_id = mapping.job_uuid(original_job_id)
        seconds_spent = int(rng.uniform(15, 60) + r.strength * rng.uniform(20, 90))

        view_rows.append({
            "id": mapping.deterministic_uuid("job_view", r.Candidate_ID, original_job_id),
            "user_id": user_id, "job_id": job_id,
            "seconds_spent": seconds_spent, "viewed_at": viewed_at,
            "_original_candidate_id": r.Candidate_ID, "_original_job_id": original_job_id,
        })

        # More heavily engaged views are more likely to have been saved, but
        # saving is still a deliberate minority action even among applicants
        # (most of these rows already have Applied=1, i.e. strength >= 2).
        save_probability = 0.08 + 0.09 * r.strength
        if rng.random() < min(save_probability, 0.6):
            saved_at = viewed_at + timedelta(days=rng.randint(0, 2))
            if saved_at > ceiling:
                saved_at = ceiling
            save_rows.append({
                "user_id": user_id, "job_id": job_id, "saved_at": saved_at,
                "notes": None, "tags": None,
                "priority": rng.choice(["high", "medium", "low"]),
                "folder": None, "notified": False, "match_score": None,
                "_original_candidate_id": r.Candidate_ID, "_original_job_id": original_job_id,
            })

    return {"job_views": pd.DataFrame(view_rows), "saved_jobs": pd.DataFrame(save_rows)}
