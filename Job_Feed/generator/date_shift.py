"""
date_shift.py
=============
Step 7 forces every job's posting date into Jun-Dec 2026, but the real
application/engagement dates in the source CSVs are historical (2022-2026,
whatever the job's real posting time was — which isn't in the CSV at all).

Rather than discard that real chronology, each job gets a constant-offset
shift: delta = (new_published_at + buffer) - (earliest real event date for
that job). Adding the same delta to every real event for that job preserves
the *relative* order and spacing (view before apply before shortlist, N
days apart) while landing the whole timeline inside the job's new active
window. This is why applications.py/engagement.py take a shared shift map
instead of each picking dates independently — a candidate's view-then-apply
sequence for a given job must shift together or the order breaks.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict

import pandas as pd


def to_date(x) -> date:
    if isinstance(x, pd.Timestamp):
        return x.date()
    if isinstance(x, datetime):
        return x.date()
    if isinstance(x, str):
        return datetime.fromisoformat(x.split("T")[0]).date()
    return x


def compute_job_date_shifts(jobs_flat_df: pd.DataFrame, applications_raw: pd.DataFrame,
                             engagement_raw: pd.DataFrame) -> Dict[str, timedelta]:
    shifts: Dict[str, timedelta] = {}

    apps_min = (applications_raw.groupby("Job_ID")["Application_Date"]
                .min() if not applications_raw.empty else pd.Series(dtype="object"))
    eng_min = (engagement_raw.groupby("Job_ID")["View_Date"]
               .min() if not engagement_raw.empty else pd.Series(dtype="object"))

    for _, job in jobs_flat_df.iterrows():
        original_id = job["original_job_id"]
        candidates_min = []
        if original_id in apps_min.index:
            candidates_min.append(to_date(apps_min.loc[original_id]))
        if original_id in eng_min.index:
            candidates_min.append(to_date(eng_min.loc[original_id]))
        if not candidates_min:
            shifts[original_id] = timedelta(0)
            continue
        earliest_real = min(candidates_min)
        new_published = to_date(job["published_at"])
        shifts[original_id] = (new_published + timedelta(days=3)) - earliest_real

    return shifts


def apply_shift(raw_date, shift: timedelta, floor: date, ceiling: date) -> date:
    shifted = to_date(raw_date) + shift
    if shifted < floor:
        shifted = floor
    if shifted > ceiling:
        shifted = ceiling
    return shifted
