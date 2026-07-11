"
jobs.py
=======
Builds companies + jobs + job_skills from real Complete_Job_Profile.csv
rows. Every field that exists in the CSV (title, institution, required
education text, required field of study, experience years, applicant/
engagement counts) is reused as-is; only fields entirely absent from the
source (location, language requirements, description prose, salary,
structured education_required JSON, ...) are generated   and generated
FROM the record's own real fields wherever possible (see faker_utils.py).

Step 7 requirement: every job is forced active, posted in
[JOB_POSTING_WINDOW_START, JOB_POSTING_WINDOW_END].
"

from __future__ import annotations

import json
import random
import re
from datetime import date, datetime, timedelta
from typing import Dict, List

import pandas as pd

from . import config
from . import faker_utils as fu
from . import mapping
from . import taxonomy

DEGREE_LEVELS = {
    "phd": 6, "doctorate": 6, "master": 5, "masters": 5, "postgraduate": 5,
    "bachelor": 3, "bachelors": 3, "advanced diploma": 2, "diploma": 1,
    "certificate": 1, "a2": 1, "a1": 2,
}

CERT_KEYWORDS = ["CPA", "ACCA", "CIA", "CPFA", "CPFM", "PMP", "CAT"]


def _degree_level(phrase: str) -> int:
    p = phrase.lower()
    for kw, lvl in DEGREE_LEVELS.items():
        if kw in p:
            return lvl
    return -1


def _parse_education_required(raw_text: str, fallback_field: str, experience_years: int) -> dict:
    entries = []
    if isinstance(raw_text, str) and raw_text.strip():
        for chunk in raw_text.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            level = _degree_level(chunk)
            field_m = re.search(r"\bin\s+(.+)$", chunk, re.IGNORECASE)
            field_text = field_m.group(1).strip() if field_m else None
            entries.append({"degree": chunk, "degree_level": level,
                             "fields_of_study": [field_text] if field_text else []})

    certifications = [kw for kw in CERT_KEYWORDS if isinstance(raw_text, str) and kw in raw_text]
    levels = [e["degree_level"] for e in entries if e["degree_level"] > 0]
    min_level = min(levels) if levels else -1
    min_degree = next((e["degree"] for e in entries if e["degree_level"] == min_level), None) if levels else None

    return {
        "minimum_degree": min_degree,
        "is_degree_required": bool(entries),
        "qualification_entries": entries,
        "fields_of_study": [fallback_field] if fallback_field else [],
        "certifications": certifications,
        "additional_requirements": [],
        "languages": random.sample(["English", "Kinyarwanda", "French"], k=random.choice([2, 3])),
        "experience_requirements": [{"title": "relevant experience", "years": str(experience_years)}]
                                    if experience_years else [],
        "age_requirement": "21-65",
    }


def _experience_band(years: int) -> str:
    if years <= 1:
        return "entry"
    if years <= 3:
        return "mid"
    if years <= 6:
        return "senior"
    if years <= 9:
        return "lead"
    return "executive"


def _guess_location(institution: str) -> str:
    upper = institution.upper()
    for d in fu.RWANDA_DISTRICTS:
        if d.upper() in upper:
            return d
    return random.choice(fu.RWANDA_DISTRICTS)


def build_job_tables(job_profile_df: pd.DataFrame, seed: int,
                      existing_skills: Dict[str, str] = None,
                      existing_companies: Dict[str, str] = None) -> Dict[str, pd.DataFrame]:
    fu.seed_all(seed)

    companies: Dict[str, dict] = {}
    job_rows, job_skill_rows, flat_tag_rows, flat_job_rows = [], [], [], []
    status_history_rows = []
    skills_catalog: Dict[str, str] = {}

    window_start = datetime.strptime(config.JOB_POSTING_WINDOW_START, "%Y-%m-%d").date()
    window_end = datetime.strptime(config.JOB_POSTING_WINDOW_END, "%Y-%m-%d").date()

    for _, row in job_profile_df.iterrows():
        original_id = str(row["Job_ID"])
        institution = str(row.get("Institution") or "Unknown Institution").strip()
        title = str(row.get("Job_Title") or "Officer").strip()
        field_of_study = row.get("Required_Field_Of_Study")
        fields = taxonomy.extract_known_fields(field_of_study) if isinstance(field_of_study, str) else []
        primary_field = fields[0] if fields else 

        exp_years_raw = row.get("Required_Experience_Years")
        experience_years = int(exp_years_raw) if pd.notna(exp_years_raw) else 0

        # ── company (dedup by institution) ──
        if institution not in companies:
            slug = re.sub(r"[^a-z0-9]+", "-", institution.lower()).strip("-")
            companies[institution] = {
                "id": mapping.company_uuid(institution, existing_companies), "name": institution,
                "legal_name": institution, "slug": f"{slug}-{abs(hash(institution)) % 10000}",
                "industry": "Government / Public Service", "industries": ["Public Service"],
                "size": random.choice(["201-500", "501-1000", "1001-5000", "10000+"]),
                "founded_year": random.randint(1962, 2015),
                "headquarters_location": json.dumps({"city": _guess_location(institution), "country": "Rwanda"}),
                "website": f"https://{slug}.gov.rw", "description":
                    f"{institution} is a public institution of the Government of Rwanda.",
                "short_description": f"Government institution: {institution}",
                "verification_status": "verified", "verification_badge": True,
                "verification_level": "government", "domain": f"{slug}.gov.rw",
                "created_at": pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=random.randint(200, 1000)),
            }
        company = companies[institution]
        job_id = mapping.job_uuid(original_id)

        # ── Step 7: force active, posted within the requested 2026 window ──
        published_at = fu.random_datetime_between(window_start, window_end - timedelta(days=60))
        expires_at = published_at + timedelta(days=random.randint(90, 240))

        location_city = _guess_location(institution)
        job_skill_names = list(dict.fromkeys(
            skill for f in fields for skill in taxonomy.skills_for_field(f)
        ))[:8] or taxonomy.skills_for_field(primary_field)
        preferred_skill_names = random.sample(taxonomy.SOFT_SKILLS, k=2)

        for name in job_skill_names + preferred_skill_names:
            if name not in skills_catalog:
                skills_catalog[name] = mapping.skill_uuid(name, existing_skills)

        salary_lo, salary_hi = fu.expected_salary(
            "Bachelor's(A0)" if experience_years else "Diploma(A2)", experience_years)

        education_required = _parse_education_required(row.get("Required_Education"), primary_field, experience_years)
        experience_level = _experience_band(experience_years)

        applicants_raw = row.get("Total_Applicants")
        views_raw = row.get("Total_Engagements")

        job_rows.append({
            "id": job_id, "company_id": company["id"], "external_id": original_id,
            "title": title, "slug": f"{re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')}-{original_id[-6:]}",
            "department": None, "team": None,
            "job_type": random.choices(["full-time", "contract"], weights=[85, 15])[0],
            "work_arrangement": random.choices(["onsite", "hybrid"], weights=[80, 20])[0],
            "locations": json.dumps([{"city": location_city, "country": "Rwanda", "remote": False}]),
            "description": fu.job_description(title, institution, primary_field, experience_years),
            "summary": fu.job_summary(title, institution),
            "responsibilities": json.dumps(fu.job_responsibilities(title, primary_field)),
            "qualifications": row.get("Required_Education") if isinstance(row.get("Required_Education"), str) else None,
            "preferred_qualifications": None,
            "requirements": json.dumps({"fields_of_study": fields}),
            "salary_min": salary_lo, "salary_max": salary_hi, "salary_currency": "RWF",
            "salary_period": "month", "salary_visible": True,
            "benefits": json.dumps(fu.job_benefits()),
            "skills_required": json.dumps([{"name": n, "is_required": True, "proficiency_level": random.randint(2, 4)}
                                            for n in job_skill_names]),
            "skills_preferred": json.dumps([{"name": n, "is_required": False, "proficiency_level": 2}
                                             for n in preferred_skill_names]),
            "experience_min": experience_years, "experience_max": experience_years + random.randint(2, 5),
            "experience_level": experience_level,
            "education_required": json.dumps(education_required),
            "screening_questions": json.dumps([]),
            "application_instructions": "Submit your application through the SimuHire Rwanda portal.",
            "documents": json.dumps([]), "department_info": None, "tags": None,  # set below
            "application_limit": None,
            "language_requirements": json.dumps([{"name": lang, "required": True}
                                                  for lang in education_required["languages"]]),
            "experience_requirements": json.dumps({
                "field": primary_field or None, "level": experience_level,
                "max_years": None, "min_years": experience_years, "specific_technologies": [],
            }),
            "education_requirements": json.dumps({
                "required": bool(education_required["qualification_entries"]),
                "allowed_fields": fields, "certifications": education_required["certifications"],
                "minimum_degree": education_required["minimum_degree"], "allowed_degrees": [],
            }),
            "skill_experience_requirements": json.dumps({}),
            "status": "active", "visibility": "public",
            "published_at": published_at, "expires_at": expires_at,
            "paused_at": None, "closed_at": None,
            "created_at": published_at, "updated_at": published_at,
            "created_by": None, "approved_by": None, "approved_at": published_at,
            "view_count": int(views_raw) if pd.notna(views_raw) else 0,
            "application_count": int(applicants_raw) if pd.notna(applicants_raw) else 0,
            "metadata": json.dumps({"source_job_id": original_id, "generated": True,
                                     "raw_job_grade": str(row.get("Job_Category /Level"))}),
            "deleted_at": None,
        })

        # First real event for this job in job_status_history: draft -> active
        # at the moment it was posted. Nothing generates further transitions
        # (paused/closed/filled) since every generated job stays active for
        # its whole lifetime per Step 7   this is the one transition that
        # genuinely happened for every job, not an invented audit trail.
        status_history_rows.append({
            "id": mapping.deterministic_uuid("job_status_history", original_id),
            "job_id": job_id, "previous_status": "draft", "new_status": "active",
            "changed_by": None, "reason": "Job posted",
            "created_at": published_at,
        })

        tags = list(dict.fromkeys(taxonomy.GENERIC_JOB_TAGS + [f.split(",")[0].strip() for f in fields]))
        job_rows[-1]["tags"] = tags
        for t in tags:
            flat_tag_rows.append({"original_job_id": original_id, "job_db_id": job_id, "tag": t})

        for i, name in enumerate(job_skill_names):
            job_skill_rows.append({
                "job_id": job_id, "skill_id": skills_catalog[name], "_skill_name": name,
                "proficiency_level": random.randint(2, 4), "is_required": True,
                "importance": "required", "created_at": published_at,
            })
        for name in preferred_skill_names:
            job_skill_rows.append({
                "job_id": job_id, "skill_id": skills_catalog[name], "_skill_name": name,
                "proficiency_level": 2, "is_required": False,
                "importance": "nice-to-have", "created_at": published_at,
            })

        flat_job_rows.append({
            "original_job_id": original_id, "job_id": job_id, "title": title,
            "institution": institution, "company_id": company["id"],
            "location": location_city, "experience_years_required": experience_years,
            "experience_level": experience_level, "field_of_study": primary_field,
            "salary_min": salary_lo, "salary_max": salary_hi,
            "published_at": published_at, "expires_at": expires_at,
            "status": "active", "real_total_applicants": row.get("Total_Applicants"),
            "real_total_engagements": row.get("Total_Engagements"),
        })

    # tags column needs to be a Postgres text[] literal at export time; keep as python list for now
    companies_df = pd.DataFrame(list(companies.values()))
    jobs_df = pd.DataFrame(job_rows)

    return {
        "companies": companies_df,
        "jobs": jobs_df,
        "job_skills": pd.DataFrame(job_skill_rows),
        "job_skills_catalog": pd.DataFrame([{"id": sid, "name": name} for name, sid in skills_catalog.items()]),
        "job_status_history": pd.DataFrame(status_history_rows),
        "jobs_flat": pd.DataFrame(flat_job_rows),
        "job_tags_flat": pd.DataFrame(flat_tag_rows),
    }
