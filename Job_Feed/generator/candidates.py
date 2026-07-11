"
candidates.py
=============
Builds every candidate-side table from real Complete_Candidate_Profile.csv
rows plus only the fields the database needs that the CSV doesn't have
(names, contact info, bio, skills catalog membership, etc   see
faker_utils.py for how those are generated).

Produces one DataFrame per output table:
    users, candidate_profiles, education, work_experience,
    user_skills, certifications
plus the flattened candidates.csv / candidate_skills.csv /
candidate_certificates.csv the project spec asks for as deliverables.
"

from __future__ import annotations

import json
import random
from datetime import date, timedelta
from typing import Dict, List, Tuple

import bcrypt
import pandas as pd

from . import faker_utils as fu
from . import mapping
from . import taxonomy

DEMO_PASSWORD = "Passw0rd!Demo"
_DEMO_PASSWORD_HASH = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()

CERT_POOL = {
    "Business, Administration and Law": [("Project Management Professional (PMP)", "PMI"),
                                          ("Certified Public Accountant (CPA)", "ICPAR")],
    "Information and Communication Technologies (ICTs)": [("AWS Certified Cloud Practitioner", "Amazon Web Services"),
                                                           ("CompTIA IT Fundamentals", "CompTIA")],
    "Health and Welfare (Health and Medical Sciences)": [("Basic Life Support (BLS)", "Rwanda Red Cross")],
    "Education": [("Teaching Methodology Certificate", "Rwanda Education Board")],
    "Engineering, Manufacturing and Construction": [("AutoCAD Certified User", "Autodesk")],
}


def _s(x, default: str = ) -> str:
    "Safe string coercion: pandas represents a missing value as float NaN
    even in an object/string column, and `nan or default` still evaluates to
    `nan` (NaN is truthy) rather than falling back   route every nullable
    CSV field read through this instead of `row.get(x) or default`."
    if x is None or (isinstance(x, float) and x != x):
        return default
    return str(x)


def _parse_pipe_list(cell: str) -> List[str]:
    if not isinstance(cell, str) or not cell.strip():
        return []
    return [x.strip() for x in cell.split(",") if x.strip()]


def _languages_json(row) -> list:
    names = _parse_pipe_list(row.get("Language"))
    reading = _parse_pipe_list(row.get("Reading_Level"))
    writing = _parse_pipe_list(row.get("Writing_Level"))
    speaking = _parse_pipe_list(row.get("Speaking_Level"))
    out = []
    for i, name in enumerate(names):
        out.append({
            "name": name,
            "reading": reading[i] if i < len(reading) else reading[-1] if reading else "Good",
            "writing": writing[i] if i < len(writing) else writing[-1] if writing else "Good",
            "speaking": speaking[i] if i < len(speaking) else speaking[-1] if speaking else "Good",
        })
    return out


def _education_dates(row) -> Tuple[date, date, bool]:
    grad_year = row.get("Graduation_Year")
    if grad_year and grad_year == grad_year:  # not NaN
        end = date(int(grad_year), 12, 1)
    else:
        end = date(2022, 12, 1)
    program_len = {"PhD": 4, "Master's": 2, "Bachelor's(A0)": 4}.get(row.get("Education_Level"), 3)
    start = date(end.year - program_len, random.randint(1, 9), 1)
    return start, end, False


def build_candidate_tables(candidate_profile_df: pd.DataFrame, seed: int,
                            existing_skills: Dict[str, str] = None) -> Dict[str, pd.DataFrame]:
    fu.seed_all(seed)

    users_rows, profiles_rows = [], []
    education_rows, work_rows, skill_rows, cert_rows = [], [], [], []
    skills_catalog: Dict[str, str] = {}   # name -> uuid, deduped across candidates+jobs
    flat_candidates_rows = []
    flat_skills_rows, flat_certs_rows = [], []

    def get_or_create_skill(name: str) -> str:
        if name not in skills_catalog:
            skills_catalog[name] = mapping.skill_uuid(name, existing_skills)
        return skills_catalog[name]

    now = pd.Timestamp.now(tz="UTC")

    for _, row in candidate_profile_df.iterrows():
        original_id = row["Candidate_ID"]
        user_id = mapping.candidate_uuid(original_id)

        first, last, gender = fu.person_name()
        degree = _s(row.get("Degree_Title")) or _s(row.get("Education_Level")) or "General Primary"
        field_of_study = _s(row.get("Field_Of_Study"))
        district = _s(row.get("District"), "Kigali")
        province = _s(row.get("Province"), "Umujyi wa Kigali")
        _raw_exp = row.get("Total_Experiences")
        total_experience_years = float(_raw_exp) if pd.notna(_raw_exp) else 0.0
        dob = fu.date_of_birth(row.get("Graduation_Year"), row.get("Education_Level"))

        email = fu.email_for(first, last, original_id)
        created_at = now - pd.Timedelta(days=random.randint(30, 720))

        users_rows.append({
            "id": user_id, "email": email, "password_hash": _DEMO_PASSWORD_HASH,
            "user_type": "candidate", "status": "active",
            "created_at": created_at, "updated_at": created_at,
        })

        salary_lo, salary_hi = fu.expected_salary(row.get("Education_Level"), total_experience_years)
        job_preferences = {
            "job_types": [random.choice(["full-time", "contract"])],
            "locations": [district, "Remote"] if random.random() < 0.3 else [district],
            "industries": [field_of_study] if field_of_study else [],
            "company_sizes": [],
            "employment_types": ["full-time"],
            "remote_preference": random.choice(["remote", "onsite", "hybrid", "any"]),
        }
        languages = _languages_json(row)

        profiles_rows.append({
            "user_id": user_id, "first_name": first, "last_name": last,
            "phone": fu.phone_number(), "country": "Rwanda", "city": district,
            "timezone": "Africa/Kigali", "date_of_birth": dob, "gender": gender,
            "profile_photo_url": None, "linkedin_url": fu.linkedin_url(first, last),
            "github_url": fu.github_url(first, last), "portfolio_url": None, "website_url": None,
            "willing_to_relocate": random.random() < 0.4, "willing_to_travel": random.random() < 0.5,
            "notice_period_days": random.choice([0, 14, 30, 60]),
            "current_salary": json.dumps({"amount": salary_lo, "currency": "RWF"}),
            "expected_salary": json.dumps({"min": salary_lo, "max": salary_hi, "currency": "RWF"}),
            "currency": "RWF", "profile_completion": random.randint(60, 100),
            "headline": fu.headline_for(degree, field_of_study),
            "summary": fu.bio_for(first, field_of_study, district, total_experience_years),
            "languages": json.dumps(languages),
            "job_preferences": json.dumps(job_preferences),
            "availability": json.dumps({
                "status": random.choice(["actively_looking", "open_to_opportunities", "not_looking"]),
                "notice_period": random.choice([None, "2 weeks", "1 month"]),
                "available_from": None, "open_to_opportunities": True,
            }),
            "metadata": json.dumps({"source_candidate_id": original_id, "generated": True}),
            "created_at": created_at, "updated_at": created_at,
        })

        # ── education (real: degree/field/district/province/graduation year) ──
        start, end, is_current = _education_dates(row)
        edu_id = mapping.deterministic_uuid("education", original_id)
        education_rows.append({
            "id": edu_id, "user_id": user_id, "institution": f"{province} Institute of Learning"
            if random.random() < 0.5 else "University of Rwanda",
            "institution_id": None, "degree": degree, "field_of_study": field_of_study or "General Studies",
            "start_date": start, "end_date": end, "is_current": is_current,
            "grade": None, "grade_scale": None, "description": None, "activities": None,
            "skills": None, "attachments": json.dumps([]), "verified": False,
            "verification_method": None, "verification_date": None, "display_order": 0,
            "created_at": created_at, "updated_at": created_at,
        })

        # ── work experience (count is real: Total_Experiences; content generated) ──
        n_exp = max(0, min(int(round(total_experience_years)), 6))
        cursor_end = date.today() - timedelta(days=random.randint(0, 60))
        candidate_skill_names = list(taxonomy.skills_for_field(field_of_study))[:6]
        for i in range(n_exp):
            duration_days = random.randint(180, 900)
            exp_start = cursor_end - timedelta(days=duration_days)
            is_current_job = (i == 0 and random.random() < 0.4)
            work_id = mapping.deterministic_uuid("work_experience", original_id, str(i))
            title = f"{field_of_study.split(',')[0].strip() if field_of_study else 'Officer'} " \
                    f"{'Assistant'if i == n_exp - 1 else 'Officer'}"
            work_rows.append({
                "id": work_id, "user_id": user_id,
                "company": f"{random.choice(['Ministry of', 'Rwanda', 'District of'])} "
                           f"{province if random.random() < 0.5 else district}",
                "company_id": None, "title": title, "employment_type": "full-time",
                "location": district, "location_type": random.choice(["onsite", "hybrid"]),
                "start_date": exp_start, "end_date": None if is_current_job else cursor_end,
                "is_current": is_current_job, "description": f"Worked as {title}, contributing to "
                              f"{field_of_study or 'departmental'} operations.",
                "achievements": None,
                "skills": candidate_skill_names or None, "industry": field_of_study or None,
                "team_size": None, "reports_to": None, "reason_for_leaving": None,
                "attachments": json.dumps([]), "verified": False, "verification_method": None,
                "verification_date": None, "display_order": i,
                "created_at": created_at, "updated_at": created_at,
            })
            cursor_end = exp_start - timedelta(days=random.randint(1, 30))

        # ── skills (derived from real Field_Of_Study, not invented categories) ──
        field_skills = taxonomy.skills_for_field(field_of_study)
        chosen_skills = random.sample(field_skills, k=min(len(field_skills), random.randint(3, 6))) if field_skills else []
        chosen_skills += random.sample(taxonomy.SOFT_SKILLS, k=2)
        for j, skill_name in enumerate(dict.fromkeys(chosen_skills)):  # dedupe, keep order
            skill_id = get_or_create_skill(skill_name)
            skill_rows.append({
                "user_id": user_id, "skill_id": skill_id, "_skill_name": skill_name,
                "proficiency_level": random.randint(2, 5),
                "years_experience": round(min(total_experience_years, random.uniform(0.5, 5)), 1),
                "is_primary": j == 0, "last_used": date.today() - timedelta(days=random.randint(0, 200)),
                "skill_context": None, "verified": False, "verification_evidence": None,
                "endorsement_count": random.randint(0, 15),
                "created_at": created_at, "updated_at": created_at,
            })
            flat_skills_rows.append({"candidate_id": original_id, "candidate_db_id": user_id, "skill_name": skill_name})

        # ── certifications (0-2, field-relevant, from a curated real-sounding pool) ──
        pool = CERT_POOL.get(field_of_study, [])
        for name, issuer in random.sample(pool, k=min(len(pool), random.randint(0, 2))) if pool else []:
            issue_date = date.today() - timedelta(days=random.randint(60, 1500))
            cert_rows.append({
                "id": mapping.deterministic_uuid("certification", original_id, name),
                "user_id": user_id, "name": name, "issuer": issuer, "credential_id": None,
                "credential_url": None, "issue_date": issue_date, "expiry_date": None,
                "is_expired": False, "description": None, "skills": None,
                "attachments": json.dumps([]), "verified": False, "verification_method": None,
                "verification_date": None, "display_order": 0,
                "created_at": created_at, "updated_at": created_at,
            })
            flat_certs_rows.append({"candidate_id": original_id, "candidate_db_id": user_id,
                                     "certificate_name": name, "issuer": issuer})

        flat_candidates_rows.append({
            "original_candidate_id": original_id, "candidate_id": user_id,
            "first_name": first, "last_name": last, "email": email, "gender": gender,
            "date_of_birth": dob, "district": district, "province": province,
            "education_level": row.get("Education_Level"), "degree": degree,
            "field_of_study": field_of_study, "graduation_year": row.get("Graduation_Year"),
            "total_experience_years": total_experience_years,
            "expected_salary_min": salary_lo, "expected_salary_max": salary_hi,
            "n_languages": len(languages), "profile_completion": profiles_rows[-1]["profile_completion"],
        })

    skills_catalog_rows = [{"id": sid, "name": name} for name, sid in skills_catalog.items()]

    return {
        "users": pd.DataFrame(users_rows),
        "candidate_profiles": pd.DataFrame(profiles_rows),
        "education": pd.DataFrame(education_rows),
        "work_experience": pd.DataFrame(work_rows),
        "user_skills": pd.DataFrame(skill_rows),
        "certifications": pd.DataFrame(cert_rows),
        "skills_catalog": pd.DataFrame(skills_catalog_rows),
        "candidates_flat": pd.DataFrame(flat_candidates_rows),
        "candidate_skills_flat": pd.DataFrame(flat_skills_rows),
        "candidate_certificates_flat": pd.DataFrame(flat_certs_rows),
    }
