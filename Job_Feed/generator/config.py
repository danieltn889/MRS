"""Paths, constants, and RNG seed shared by every generator module."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent   # Job_Feed/
DATA_DIR = PROJECT_ROOT / "data"
OUTPUT_DIR = PROJECT_ROOT / "output"
CSV_OUT_DIR = OUTPUT_DIR / "csv"
SQL_OUT_DIR = OUTPUT_DIR / "sql"
REPORT_OUT_DIR = OUTPUT_DIR / "reports"

SQL_SCHEMA_PATH = PROJECT_ROOT.parent / "db_backups" / "db_backup_20260709.sql"

CANDIDATE_PROFILE_CSV = DATA_DIR / "Complete_Candidate_Profile.csv"
JOB_PROFILE_CSV = DATA_DIR / "Complete_Job_Profile.csv"
APPLICATIONS_CSV = DATA_DIR / "Cleaned_Combined_Applications.csv"
ENGAGEMENT_CSV = DATA_DIR / "Cleaned_Combined_Engagement.csv"

# Tables this project actually populates (the full schema has 118 tables;
# most — billing, simulations, blockchain, etc. — are out of scope here).
RELEVANT_TABLES = [
    "users", "candidate_profiles", "education", "work_experience",
    "certifications", "skills", "user_skills", "companies", "jobs",
    "job_skills", "job_status_history", "applications", "job_views",
    "saved_jobs", "ignored_jobs", "job_searches", "feed_scores",
]

SEED = 42
N_CANDIDATES = 1000
N_JOBS = 1000

# Step 7: every generated job must be posted in this window and active.
JOB_POSTING_WINDOW_START = "2026-06-01"
JOB_POSTING_WINDOW_END = "2026-12-31"

# UUID namespace for deterministic id-mapping (original CSV id -> stable UUIDv5).
# Fixed, arbitrary constant — NOT a secret, just needs to never change once data
# has been generated, so re-running the pipeline reproduces the same UUIDs.
UUID_NAMESPACE = "6f6d6a6e-3f0a-4a8b-9c1d-3a2b7e5f9d10"

for d in (OUTPUT_DIR, CSV_OUT_DIR, SQL_OUT_DIR, REPORT_OUT_DIR):
    d.mkdir(parents=True, exist_ok=True)
