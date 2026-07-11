#!/usr/bin/env python3
"
main.py
=======
End-to-end orchestrator. Run as:

    python -m generator.main [--n-candidates 1000] [--n-jobs 1000] [--seed 42] [--use-cache]

Pipeline: parse schema -> sample real candidates/jobs (connected where
possible) -> generate every table -> reconcile derived counters -> validate
against the real schema -> export CSVs, SQL, and reports.

--use-cache pickles each expensive step to output/.cache/ and reuses it on
a re-run with the same --n-candidates/--n-jobs/--seed   a development
convenience (streaming the 656MB/680MB source CSVs is the slow part), not
part of the semantics of a "correct" run.
"

from __future__ import annotations

import argparse
import pickle
import time
from pathlib import Path
from typing import Callable, Dict

import pandas as pd

from . import applications as applications_mod
from . import behaviour as behaviour_mod
from . import candidates as candidates_mod
from . import config
from . import csv_loader
from . import date_shift
from . import engagement as engagement_mod
from . import existing_data
from . import jobs as jobs_mod
from . import mapping
from . import sql_export
from . import validators
from .schema_parser import parse_schema, render_schema_report

CACHE_DIR = config.OUTPUT_DIR / ".cache"


def _cached(key: str, use_cache: bool, builder: Callable):
    path = CACHE_DIR / f"{key}.pkl"
    if use_cache and path.exists():
        print(f"  (cache hit) {key}")
        with open(path, "rb") as f:
            return pickle.load(f)
    result = builder()
    if use_cache:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(result, f)
    return result


def run(n_candidates: int, n_jobs: int, seed: int, use_cache: bool) -> None:
    t_start = time.time()

    print("=" * 70)
    print("STEP 1   Parsing real database schema")
    print("=" * 70)
    schemas = parse_schema(config.SQL_SCHEMA_PATH)
    (config.REPORT_OUT_DIR / "01_schema_report.md").write_text(
        render_schema_report(schemas, only=config.RELEVANT_TABLES), encoding="utf-8")
    print(f"  parsed {len(schemas)} tables from schema; report written")

    print("=" * 70)
    print("STEP 2/3/4   Selecting real candidates + jobs, building id mappings")
    print("=" * 70)
    selection = _cached(f"selection_{n_jobs}_{n_candidates}_{seed}", use_cache,
                         lambda: csv_loader.select_candidates_and_jobs(n_jobs, n_candidates, seed))
    print(f"  selected {len(selection.job_ids)} jobs, {len(selection.candidate_ids)} candidates")

    candidate_id_map = mapping.build_mapping_table(selection.candidate_ids, mapping.candidate_uuid)
    job_id_map = mapping.build_mapping_table(selection.job_ids, mapping.job_uuid)
    pd.DataFrame(list(candidate_id_map.items()), columns=["original_candidate_id", "candidate_id"]) \
        .to_csv(config.CSV_OUT_DIR / "candidate_id_mapping.csv", index=False)
    pd.DataFrame(list(job_id_map.items()), columns=["original_job_id", "job_id"]) \
        .to_csv(config.CSV_OUT_DIR / "job_id_mapping.csv", index=False)

    print("  looking up pre-existing skills/companies in the target schema dump "
          "(reuse real ids instead of minting colliding duplicates)")
    existing_skills = existing_data.load_existing_names(config.SQL_SCHEMA_PATH, "skills", "name")
    existing_companies = existing_data.load_existing_names(config.SQL_SCHEMA_PATH, "companies", "name")
    print(f"  found {len(existing_skills)} existing skill name(s), {len(existing_companies)} existing company name(s)")

    print("=" * 70)
    print("STEP 5/10   Building candidate tables (users, profiles, education, "
          "work experience, skills, certifications)")
    print("=" * 70)
    cand_tables = _cached(f"cand_tables_{n_candidates}_{seed}", use_cache,
                           lambda: candidates_mod.build_candidate_tables(
                               selection.candidate_profile_df, seed, existing_skills))
    for k, v in cand_tables.items():
        print(f"  {k}: {len(v)} rows")

    print("=" * 70)
    print("STEP 6/7   Building job tables (companies, jobs, job_skills)   "
          "forced active, posted Jun-Dec 2026")
    print("=" * 70)
    job_tables = _cached(f"job_tables_{n_jobs}_{seed}", use_cache,
                         lambda: jobs_mod.build_job_tables(
                             selection.job_profile_df, seed, existing_skills, existing_companies))
    for k, v in job_tables.items():
        print(f"  {k}: {len(v)} rows")

    print("=" * 70)
    print("STEP 8   Streaming real applications + engagement CSVs (filtered to selection)")
    print("=" * 70)
    cand_ids_set, job_ids_set = set(selection.candidate_ids), set(selection.job_ids)
    apps_raw = _cached(f"apps_raw_{n_jobs}_{n_candidates}_{seed}", use_cache,
                       lambda: csv_loader.load_applications_for(cand_ids_set, job_ids_set))
    eng_raw = _cached(f"eng_raw_{n_jobs}_{n_candidates}_{seed}", use_cache,
                      lambda: csv_loader.load_engagement_for(cand_ids_set, job_ids_set))
    print(f"  real applications matched: {len(apps_raw)}, real engagement matched: {len(eng_raw)}")

    print("=" * 70)
    print("STEP 8/9   Date-shifting real events into each job's new active window, "
          "building applications + job_views + saved_jobs")
    print("=" * 70)
    job_shifts = date_shift.compute_job_date_shifts(job_tables["jobs_flat"], apps_raw, eng_raw)
    applications_df = applications_mod.build_applications_table(apps_raw, job_tables["jobs_flat"], job_shifts)
    engagement_tables = engagement_mod.build_engagement_tables(eng_raw, job_tables["jobs_flat"], job_shifts, seed)
    print(f"  applications: {len(applications_df)}, job_views: {len(engagement_tables['job_views'])}, "
          f"saved_jobs: {len(engagement_tables['saved_jobs'])}")

    print("=" * 70)
    print("STEP 11   Building behaviour tables (search history, recommendation "
          "history / feed_scores, ignored jobs)")
    print("=" * 70)
    behaviour_tables = behaviour_mod.build_behaviour_tables(
        cand_tables["candidates_flat"], job_tables["jobs_flat"],
        engagement_tables["job_views"], applications_df, seed)
    for k, v in behaviour_tables.items():
        print(f"  {k}: {len(v)} rows")

    # ── reconcile derived counters so jobs.application_count/view_count match
    # the applications/job_views rows actually generated for THIS sample,
    # rather than the full historical population's totals ──
    jobs_df = job_tables["jobs"].copy()
    if not applications_df.empty:
        real_app_counts = applications_df.groupby("job_id").size()
        jobs_df["application_count"] = jobs_df["id"].map(real_app_counts).fillna(0).astype(int)
    if not engagement_tables["job_views"].empty:
        real_view_counts = engagement_tables["job_views"].groupby("job_id").size()
        jobs_df["view_count"] = jobs_df["id"].map(real_view_counts).fillna(0).astype(int)

    # ── merge candidate-side + job-side skill catalogs (same deterministic
    # uuid5 per name, so a name in both is already the same id   just union) ──
    skills_df = pd.concat([cand_tables["skills_catalog"], job_tables["job_skills_catalog"]],
                          ignore_index=True).drop_duplicates(subset=["id"])

    db_tables = {
        "users": cand_tables["users"],
        "candidate_profiles": cand_tables["candidate_profiles"],
        "education": cand_tables["education"],
        "work_experience": cand_tables["work_experience"],
        "certifications": cand_tables["certifications"],
        "skills": skills_df,
        "user_skills": cand_tables["user_skills"],
        "companies": job_tables["companies"],
        "jobs": jobs_df,
        "job_skills": job_tables["job_skills"],
        "job_status_history": job_tables["job_status_history"],
        "applications": applications_df,
        "job_views": engagement_tables["job_views"],
        "saved_jobs": engagement_tables["saved_jobs"],
        "ignored_jobs": behaviour_tables["ignored_jobs"],
        "job_searches": behaviour_tables["job_searches"],
        "feed_scores": behaviour_tables["feed_scores"],
    }

    print("=" * 70)
    print("STEP 12   Validating dataset against the real schema")
    print("=" * 70)
    issues = validators.validate_dataset(db_tables, schemas)
    report = validators.render_validation_report(issues, db_tables)
    (config.REPORT_OUT_DIR / "03_validation_report.md").write_text(report, encoding="utf-8")
    print(f"  {len(issues)} issue(s) found   see output/reports/03_validation_report.md")
    for issue in issues:
        print(f"  ! {issue}")

    print("=" * 70)
    print("STEP 13/OUTPUT   Exporting CSVs, SQL, and documentation")
    print("=" * 70)
    _export_csvs(db_tables, cand_tables, job_tables, behaviour_tables, engagement_tables)
    sql_text = sql_export.render_full_sql(db_tables, schemas)
    (config.SQL_OUT_DIR / "import.sql").write_text(sql_text, encoding="utf-8")
    print(f"  SQL written to {config.SQL_OUT_DIR / 'import.sql'} "
          f"({sql_text.count('INSERT INTO')} INSERT statement(s))")

    _write_documentation(db_tables, selection, len(apps_raw), len(eng_raw))

    print("=" * 70)
    print(f"DONE in {time.time() - t_start:.1f}s. Output in {config.OUTPUT_DIR}")
    print("=" * 70)


def _write_combined_csv(deliverables: Dict[str, pd.DataFrame], path: Path) -> None:
    "A single .csv holding every deliverable table, one after another, each
    preceded by a '### TABLE: <name>'marker line and its own header row.
    Plain CSV has no concept of sheets/tabs (that's an Excel-only feature)  
    this is the closest single-file equivalent: still one file, each table's
    block clearly delimited so it's easy to find/copy out in any editor or
    spreadsheet app, without adding an Excel-library dependency."
    with open(path, "w", encoding="utf-8", newline=) as f:
        for name, df in deliverables.items():
            f.write(f"### TABLE: {name}\n")
            df.to_csv(f, index=False)
            f.write("\n")


def _write_excel_workbook(deliverables: Dict[str, pd.DataFrame], path: Path) -> None:
    "One .xlsx with a real separate sheet/tab per table   opens directly in
    Excel/LibreOffice/Google Sheets with normal tab navigation."
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, df in deliverables.items():
            sheet_name = name[:31]  # Excel's hard sheet-name length limit
            df.to_excel(writer, sheet_name=sheet_name, index=False)


def _export_csvs(db_tables, cand_tables, job_tables, behaviour_tables, engagement_tables) -> None:
    out = config.CSV_OUT_DIR
    deliverables: Dict[str, pd.DataFrame] = {}

    # Deliverables named in the project spec's OUTPUT section:
    deliverables["candidates"] = cand_tables["candidates_flat"]
    deliverables["candidates"].to_csv(out / "candidates.csv", index=False)
    deliverables["jobs"] = job_tables["jobs_flat"]
    deliverables["jobs"].to_csv(out / "jobs.csv", index=False)

    apps_export = db_tables["applications"].drop(
        columns=[c for c in db_tables["applications"].columns if c.startswith("_")], errors="ignore")
    deliverables["applications"] = apps_export
    apps_export.to_csv(out / "applications.csv", index=False)

    jv = engagement_tables["job_views"].drop(
        columns=[c for c in engagement_tables["job_views"].columns if c.startswith("_")], errors="ignore")
    deliverables["engagement"] = jv
    jv.to_csv(out / "engagement.csv", index=False)

    sj = engagement_tables["saved_jobs"].drop(
        columns=[c for c in engagement_tables["saved_jobs"].columns if c.startswith("_")], errors="ignore")
    deliverables["saved_jobs"] = sj
    sj.to_csv(out / "saved_jobs.csv", index=False)

    deliverables["search_history"] = behaviour_tables["job_searches"]
    behaviour_tables["job_searches"].to_csv(out / "search_history.csv", index=False)

    rec_history = behaviour_tables["feed_scores"].drop(
        columns=[c for c in behaviour_tables["feed_scores"].columns if c.startswith("_")], errors="ignore")
    deliverables["recommendation_history"] = rec_history
    rec_history.to_csv(out / "recommendation_history.csv", index=False)

    deliverables["candidate_skills"] = cand_tables["candidate_skills_flat"]
    deliverables["candidate_skills"].to_csv(out / "candidate_skills.csv", index=False)
    deliverables["candidate_certificates"] = cand_tables["candidate_certificates_flat"]
    deliverables["candidate_certificates"].to_csv(out / "candidate_certificates.csv", index=False)
    deliverables["job_skills"] = job_tables["job_skills"]
    deliverables["job_skills"].to_csv(out / "job_skills.csv", index=False)
    deliverables["job_tags"] = job_tables["job_tags_flat"]
    deliverables["job_tags"].to_csv(out / "job_tags.csv", index=False)
    deliverables["job_status_history"] = job_tables["job_status_history"]
    deliverables["job_status_history"].to_csv(out / "job_status_history.csv", index=False)

    # candidate_behaviour.csv: one row per candidate summarizing all generated
    # behavioural signal counts (distinct from search_history/recommendation_history,
    # which are event-level).
    views_per = engagement_tables["job_views"].groupby("_original_candidate_id").size() \
        if not engagement_tables["job_views"].empty else pd.Series(dtype=int)
    saves_per = engagement_tables["saved_jobs"].groupby("_original_candidate_id").size() \
        if not engagement_tables["saved_jobs"].empty else pd.Series(dtype=int)
    apps_per = db_tables["applications"].groupby("_original_candidate_id").size() \
        if not db_tables["applications"].empty else pd.Series(dtype=int)
    searches_per = behaviour_tables["job_searches"].merge(
        cand_tables["candidates_flat"][["candidate_id", "original_candidate_id"]],
        left_on="user_id", right_on="candidate_id", how="left"
    ).groupby("original_candidate_id").size() if not behaviour_tables["job_searches"].empty else pd.Series(dtype=int)
    ignored_per = behaviour_tables["ignored_jobs"].groupby("_original_candidate_id").size() \
        if not behaviour_tables["ignored_jobs"].empty else pd.Series(dtype=int)

    behaviour_summary = cand_tables["candidates_flat"][["original_candidate_id", "candidate_id"]].copy()
    behaviour_summary["jobs_viewed"] = behaviour_summary["original_candidate_id"].map(views_per).fillna(0).astype(int)
    behaviour_summary["jobs_saved"] = behaviour_summary["original_candidate_id"].map(saves_per).fillna(0).astype(int)
    behaviour_summary["applications_submitted"] = behaviour_summary["original_candidate_id"].map(apps_per).fillna(0).astype(int)
    behaviour_summary["searches_performed"] = behaviour_summary["original_candidate_id"].map(searches_per).fillna(0).astype(int)
    behaviour_summary["jobs_ignored"] = behaviour_summary["original_candidate_id"].map(ignored_per).fillna(0).astype(int)
    deliverables["candidate_behaviour"] = behaviour_summary
    behaviour_summary.to_csv(out / "candidate_behaviour.csv", index=False)

    deliverables["candidate_id_mapping"] = pd.read_csv(out / "candidate_id_mapping.csv")
    deliverables["job_id_mapping"] = pd.read_csv(out / "job_id_mapping.csv")
    # A combined-output file left open in an editor/Excel can hold an OS-level
    # lock on Windows   don't let that abort the rest of the export (SQL,
    # docs) that hasn't run yet.
    for label, fn, filename in (
        ("combined CSV", _write_combined_csv, "combined_dataset.csv"),
        ("Excel workbook", _write_excel_workbook, "combined_dataset.xlsx"),
    ):
        try:
            fn(deliverables, out / filename)
        except PermissionError as e:
            print(f"  ! Skipped {label} ({filename}): {e}. "
                  f"Likely open in another program   close it and re-run to regenerate just this file.")

    # DB-import-ready shape of every table (extra "_original_*" bookkeeping
    # columns stripped) also written out, one CSV per table, for anyone who
    # wants to `\copy` them directly instead of using import.sql.
    db_dir = out / "db"
    db_dir.mkdir(exist_ok=True)
    for name, df in db_tables.items():
        df.drop(columns=[c for c in df.columns if c.startswith("_")], errors="ignore") \
          .to_csv(db_dir / f"{name}.csv", index=False)


def _write_documentation(db_tables, selection, n_real_apps, n_real_eng) -> None:
    lines = [
        "# Job_Feed Demo Dataset   Documentation", ,
        "Generated by `Job_Feed/generator/main.py` from:", ,
        f"- Real schema: `db_backups/db_backup_20260705_182104.sql` (parsed programmatically, "
        f"see `output/reports/01_schema_report.md`)",
        f"- Real CSVs: `Complete_Candidate_Profile.csv`, `Complete_Job_Profile.csv`, "
        f"`Cleaned_Combined_Applications.csv`, `Cleaned_Combined_Engagement.csv`", ,
        "## Selection strategy", ,
        f"- {len(selection.job_ids)} jobs sampled uniformly at random from the real "
        f"Complete_Job_Profile.csv (6,882 total).",
        "- Candidates were NOT sampled independently: Complete_Candidate_Profile.csv already "
        "lists each candidate's own real Applied_Jobs/Engaged_Jobs, so candidates connected to "
        "the selected jobs were preferred (topped up with independent random candidates only if "
        "the connected pool ran short), to maximize how much real application/engagement data "
        "survives the down-sample.",
        f"- Result: {n_real_apps} real application rows and {n_real_eng} real engagement rows "
        f"matched the final selection and were reused as-is (status/dates), not invented.", ,
        "## What's real vs. generated", ,
        "| Data | Source |",
        "|---|---|",
        "| Candidate education, field of study, district/province, languages, experience count | REAL (CSV) |",
        "| Candidate name, email, phone, DOB, bio, salary expectations, LinkedIn/GitHub | GENERATED (derived from real education/experience for consistency) |",
        "| Candidate skills, certifications | GENERATED from a real Field_Of_Study -> skills taxonomy (10 real categories) |",
        "| Job title, institution, required education text, required field, experience years | REAL (CSV) |",
        "| Job location, language requirements, description prose, salary, structured education_required JSON | GENERATED (Job_Location/Required_Languages were 100% empty in the source   verified) |",
        "| Applications (candidate, job, status, date) | REAL (CSV), status mapped to the DB enum, dates shifted into the job's new active window |",
        "| Job views (job_views) | REAL (CSV) 'engagement'rows, deduplicated to satisfy the UNIQUE(user_id,job_id) constraint |",
        "| Saved jobs | 100% GENERATED   the source Job_Save column is empty for all ~4.85M rows (verified with a full-file scan) |",
        "| Search history, recommendation history (feed_scores), ignored jobs | 100% GENERATED   no equivalent exists in the source CSVs |",
        , "## Known modeling decisions", ,
        "- Every job is forced `status='active'`, `published_at` in "
        f"[{config.JOB_POSTING_WINDOW_START}, {config.JOB_POSTING_WINDOW_END}] per the project spec. "
        "Real application/engagement dates are historical, so each job's real events are shifted by "
        "a constant per-job offset (not re-randomized) to preserve their relative order/spacing while "
        "landing inside the new window   see `generator/date_shift.py`.",
        "- Application_Status source strings are mapped to the DB's applications_status_check enum; "
        "see `applications.py::STATUS_MAP` for the exact mapping and rationale (e.g. 'Offer rejected'"
        "-> withdrawn, since it's the candidate's decision, not the employer's).",
        "- IDs are deterministic (uuid5 of a fixed namespace + the original CSV id), not random   "
        "re-running the pipeline reproduces the same database UUIDs without needing persisted state.",
        "- Generated `password_hash` values are a single shared bcrypt hash for the placeholder "
        f"password `{candidates_mod.DEMO_PASSWORD}`   these are demo accounts, not real credentials.",
        , "## Table row counts (final, DB-import shape)", ,
    ]
    for name, df in db_tables.items():
        lines.append(f"- `{name}`: {len(df)}")
    lines.append()
    lines.append("## Files")
    lines.append()
    lines.append("- `output/csv/*.csv`   the human-readable deliverables named in the project spec")
    lines.append("- `output/csv/combined_dataset.csv`   all of the above stacked into one file, "
                  "each table's block preceded by a `### TABLE: <name>` marker line")
    lines.append("- `output/csv/combined_dataset.xlsx`   the same tables, but as a real Excel "
                  "workbook with one sheet/tab per table")
    lines.append("- `output/csv/db/*.csv`   one CSV per table, DB-import shape (matches column names exactly)")
    lines.append("- `output/sql/import.sql`   PostgreSQL INSERT script (idempotent: ON CONFLICT DO NOTHING)")
    lines.append("- `output/reports/01_schema_report.md`   Step 1 schema inspection")
    lines.append("- `output/reports/02_mapping_report.md`   Step 2 CSV -> DB column mapping")
    lines.append("- `output/reports/03_validation_report.md`   Step 12 validation results")
    (config.REPORT_OUT_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Build the Job_Feed demo dataset from real data + real schema.")
    parser.add_argument("--n-candidates", type=int, default=config.N_CANDIDATES)
    parser.add_argument("--n-jobs", type=int, default=config.N_JOBS)
    parser.add_argument("--seed", type=int, default=config.SEED)
    parser.add_argument("--use-cache", action="store_true",
                         help="Cache expensive steps to output/.cache/ for faster iteration.")
    args = parser.parse_args()
    run(args.n_candidates, args.n_jobs, args.seed, args.use_cache)


if __name__ == "__main__":
    main()
