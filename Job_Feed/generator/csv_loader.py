"""
csv_loader.py
=============
Streaming/chunked readers for the real source CSVs. Applications (656MB,
~4.85M rows) and Engagement (680MB, ~4.85M rows) are too large to load
whole, so they're always read with `chunksize` and filtered down to the
selected candidate/job ID sets as they stream past.

Sampling strategy (see select_candidates_and_jobs): candidates and jobs are
NOT sampled independently. Complete_Candidate_Profile.csv already lists each
candidate's own Applied_Jobs/Engaged_Jobs (real job IDs they interacted
with) — sampling jobs first, then preferring candidates connected to those
jobs, maximizes how much *real* application/engagement data survives the
1000x1000 down-sample, per the project's "reuse real data" priority. A
handful of independent candidates are still mixed in so the dataset also
reflects candidates with no engagement on the selected jobs (a realistic,
common case).
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterator, List, Set, Tuple

import pandas as pd

from . import config

CHUNK_SIZE = 200_000


def load_job_profile_full() -> pd.DataFrame:
    df = pd.read_csv(config.JOB_PROFILE_CSV)
    df = df.rename(columns={"Job_Id": "Job_ID"})  # header typo in the source file
    df = df.drop_duplicates(subset=["Job_ID"]).reset_index(drop=True)
    return df


def _parse_id_list(cell) -> List[str]:
    if not isinstance(cell, str) or not cell.strip():
        return []
    return [x.strip() for x in cell.split(",") if x.strip()]


@dataclass
class Selection:
    job_ids: List[str]
    candidate_ids: List[str]
    candidate_profile_df: pd.DataFrame   # full CSV rows for the selected candidates
    job_profile_df: pd.DataFrame         # full CSV rows for the selected jobs


def select_candidates_and_jobs(n_jobs: int, n_candidates: int, seed: int) -> Selection:
    rng = random.Random(seed)

    jobs_full = load_job_profile_full()
    job_sample = jobs_full.sample(n=min(n_jobs, len(jobs_full)), random_state=seed)
    job_ids: List[str] = job_sample["Job_ID"].astype(str).tolist()
    job_ids_set: Set[str] = set(job_ids)

    connected_ids: Set[str] = set()
    usecols = ["Candidate_ID", "Applied_Jobs", "Engaged_Jobs"]

    def _touches_selected_jobs(row) -> bool:
        touched = set(_parse_id_list(row["Applied_Jobs"])) | set(_parse_id_list(row["Engaged_Jobs"]))
        return bool(touched & job_ids_set)

    for chunk in pd.read_csv(config.CANDIDATE_PROFILE_CSV, usecols=usecols, chunksize=CHUNK_SIZE):
        mask = chunk.apply(_touches_selected_jobs, axis=1)
        connected_ids.update(chunk.loc[mask, "Candidate_ID"].tolist())
        if len(connected_ids) >= n_candidates * 3:
            # Enough of a pool to sample from without scanning the whole 306MB file.
            break

    connected_list = list(connected_ids)
    rng.shuffle(connected_list)
    chosen = connected_list[:n_candidates]

    if len(chosen) < n_candidates:
        # Not enough connected candidates found — top up with independent random
        # candidates so the final set is still exactly n_candidates.
        chosen_set = set(chosen)
        needed = n_candidates - len(chosen)
        extra_pool: List[str] = []
        for chunk in pd.read_csv(config.CANDIDATE_PROFILE_CSV, usecols=["Candidate_ID"], chunksize=CHUNK_SIZE):
            for cid in chunk["Candidate_ID"]:
                if cid not in chosen_set and cid not in extra_pool:
                    extra_pool.append(cid)
            if len(extra_pool) >= needed * 3:
                break
        rng.shuffle(extra_pool)
        chosen += extra_pool[:needed]

    candidate_ids_set = set(chosen)

    # Second pass: pull the FULL profile rows for exactly the chosen candidates.
    matched_rows = []
    for chunk in pd.read_csv(config.CANDIDATE_PROFILE_CSV, chunksize=CHUNK_SIZE):
        hit = chunk[chunk["Candidate_ID"].isin(candidate_ids_set)]
        if not hit.empty:
            matched_rows.append(hit)
        if sum(len(h) for h in matched_rows) >= len(candidate_ids_set):
            break
    candidate_df = pd.concat(matched_rows, ignore_index=True) if matched_rows else pd.DataFrame()
    candidate_df = candidate_df.drop_duplicates(subset=["Candidate_ID"]).reset_index(drop=True)

    return Selection(
        job_ids=job_ids,
        candidate_ids=list(candidate_ids_set),
        candidate_profile_df=candidate_df,
        job_profile_df=job_sample.reset_index(drop=True),
    )


def stream_filtered(csv_path, candidate_ids: Set[str], job_ids: Set[str],
                     candidate_col: str, job_col: str,
                     usecols: List[str] = None, chunksize: int = CHUNK_SIZE) -> pd.DataFrame:
    """Stream a large CSV and keep only rows whose candidate/job id is in the
    given sets. Returns the concatenated matches (small, by construction)."""
    matches = []
    for chunk in pd.read_csv(csv_path, usecols=usecols, chunksize=chunksize):
        hit = chunk[chunk[candidate_col].isin(candidate_ids) & chunk[job_col].isin(job_ids)]
        if not hit.empty:
            matches.append(hit)
    if not matches:
        return pd.DataFrame(columns=usecols or [])
    return pd.concat(matches, ignore_index=True)


def load_applications_for(candidate_ids: Set[str], job_ids: Set[str]) -> pd.DataFrame:
    return stream_filtered(
        config.APPLICATIONS_CSV, candidate_ids, job_ids,
        candidate_col="Candidate_ID", job_col="Job_ID",
        usecols=["Candidate_ID", "Job_ID", "Application_Date", "Application_Status"],
    )


def load_engagement_for(candidate_ids: Set[str], job_ids: Set[str]) -> pd.DataFrame:
    return stream_filtered(
        config.ENGAGEMENT_CSV, candidate_ids, job_ids,
        candidate_col="Candidate_ID", job_col="Job_ID",
        usecols=["Candidate_ID", "Job_ID", "View_Date", "Clicked_Apply", "Applied",
                 "Shortlisted", "Interviewed", "Hired"],
    )
