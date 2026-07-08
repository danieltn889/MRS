"""
applications.py
================
Builds the `applications` table from real Cleaned_Combined_Applications.csv
rows (candidate/job pair + real status + real date), mapped onto the
database's applications_status_check enum and date-shifted into each job's
new active window (see date_shift.py).

Status mapping (source text -> schema enum) is a judgment call documented
inline: "Offer rejected" means the CANDIDATE declined an offer, which is
closer to `withdrawn` than `rejected` (which reads as the employer's call);
"Employed" is the final onboarded state (`hired`), distinct from "Offer
accepted" (`offer` — accepted but not yet started).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Dict

import pandas as pd

from . import mapping
from .date_shift import apply_shift, to_date

STATUS_MAP = {
    "Application received": "submitted",
    "Shortlisted": "shortlisted",
    "Not Shortlisted": "rejected",
    "Failed psychometric test": "rejected",
    "Offer accepted": "offer",
    "Employed": "hired",
    "Offer rejected": "withdrawn",
    "Offer revoked": "rejected",
    "Pending offer": "offer",
    "Candidate Skipped": "withdrawn",
}
STAGE_MAP = {
    "submitted": "screening", "shortlisted": "shortlist", "rejected": "closed",
    "offer": "offer", "hired": "closed", "withdrawn": "closed",
}


def build_applications_table(applications_raw: pd.DataFrame, jobs_flat_df: pd.DataFrame,
                              job_shifts: Dict[str, timedelta]) -> pd.DataFrame:
    if applications_raw.empty:
        return pd.DataFrame()

    job_windows = jobs_flat_df.set_index("original_job_id")[["published_at", "expires_at"]]

    # Guard the unique (job_id, user_id) constraint even though the source
    # data had none in our sample — keep the latest real record per pair.
    deduped = (applications_raw.sort_values("Application_Date")
               .drop_duplicates(subset=["Candidate_ID", "Job_ID"], keep="last"))

    rows = []
    for i, r in enumerate(deduped.itertuples(index=False)):
        original_job_id = r.Job_ID
        if original_job_id not in job_windows.index:
            continue
        floor = to_date(job_windows.loc[original_job_id, "published_at"])
        ceiling = to_date(job_windows.loc[original_job_id, "expires_at"])
        shift = job_shifts.get(original_job_id, timedelta(0))
        applied_at = apply_shift(r.Application_Date, shift, floor, ceiling)

        status = STATUS_MAP.get(r.Application_Status, "submitted")
        user_id = mapping.candidate_uuid(r.Candidate_ID)
        job_id = mapping.job_uuid(original_job_id)

        rows.append({
            "id": mapping.deterministic_uuid("application", r.Candidate_ID, original_job_id),
            "job_id": job_id, "user_id": user_id,
            "application_number": f"APP-{applied_at.year}-{i:06d}",
            "status": status, "current_stage": STAGE_MAP.get(status, "screening"),
            "applied_at": applied_at, "updated_at": applied_at,
            "submitted_data": None, "screening_answers": "[]", "documents": "[]",
            "notes": "[]", "internal_notes": "[]", "tags": None, "rating": None,
            "ai_score": None, "match_score": None, "match_details": None,
            "withdrawn_at": applied_at if status == "withdrawn" else None,
            "withdrawn_reason": "Candidate declined" if status == "withdrawn" else None,
            "withdrawn_by": None,
            "rejection_reason": r.Application_Status if status == "rejected" else None,
            "rejection_details": None, "source": "job_board_import", "source_details": None,
            "referrer_id": None, "metadata": "{}", "interview_date": None,
            "assigned_to": None, "profile_data": None, "feedback": None, "deleted_at": None,
            "_original_candidate_id": r.Candidate_ID, "_original_job_id": original_job_id,
        })

    return pd.DataFrame(rows)
