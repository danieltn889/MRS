# CSV → Database Column Mapping Report (Step 2)

This documents exactly how each real CSV column was used, and which
database columns had no real source data and were generated instead. It
reflects what `generator/candidates.py`, `generator/jobs.py`,
`generator/applications.py`, and `generator/engagement.py` actually do  
not a plan, the implementation.

## Complete_Candidate_Profile.csv → `users` / `candidate_profiles` / `education` / `work_experience`

| CSV Column | DB Table.Column | Transformation | Generated? |
|---|---|---|---|
| Candidate_ID | (all tables) via `candidate_id_mapping.csv` | uuid5(namespace, "candidate:"+id)   deterministic | No (real id, remapped) |
| Education_Level | education.degree (fallback) | direct / fallback when Degree_Title empty | No |
| Degree_Title | education.degree | direct (truncated to varchar(255) if needed) | No |
| Field_Of_Study | education.field_of_study, candidate_profiles.job_preferences.industries | direct | No |
| Graduation_Year | education.end_date | `date(year, 12, 1)` | No (real year, synthesized day) |
| District | candidate_profiles.city | direct | No |
| Province | education.institution (referenced), job_preferences | direct | No |
| StartDate / EndDate | *(not directly used   mostly null in source; see Total_Experiences)* |   |   |
| Total_Experiences | work_experience (row COUNT) | generates that many work_experience rows | count real, content generated |
| Language / Reading_Level / Writing_Level / Speaking_Level / Total_Languages | candidate_profiles.languages (jsonb) | zipped into `[{name, reading, writing, speaking}]` | No |
| Applied_Jobs / Engaged_Jobs | *(used only for candidate/job selection   see csv_loader.py)* |   |   |
| Total_Applications, Clicked_Apply_Count, Applied_Count, Shortlisted_Count, Interviewed_Count, Hired_Count, Total_Engagements | *(informational only   actual counts come from generated applications/job_views tables, not copied)* |   |   |
|   | users.id, email, password_hash, user_type, status | generated (email derived from generated name) | **Yes** |
|   | candidate_profiles.first_name/last_name/phone/gender/date_of_birth/linkedin_url/github_url/willing_to_relocate/willing_to_travel/notice_period_days/current_salary/expected_salary/currency/profile_completion/headline/summary/availability | generated | **Yes** |
|   | user_skills, certifications | generated from a real Field_Of_Study → skills/certifications taxonomy (10 real categories, verified) | **Yes** (grounded in real field) |

## Complete_Job_Profile.csv → `companies` / `jobs` / `job_skills`

| CSV Column | DB Table.Column | Transformation | Generated? |
|---|---|---|---|
| Job_Id | jobs.external_id, all tables via `job_id_mapping.csv` | uuid5(namespace, "job:"+id) | No (real id, remapped) |
| Job_Title | jobs.title | direct | No |
| Institution | companies.name, companies.legal_name | direct (deduped   120 unique institutions → companies) | No |
| Job_Category /Level | jobs.metadata.raw_job_grade | preserved verbatim, NOT used to infer seniority (ambiguous grading scheme   see documentation) | No |
| Job_Location | jobs.locations (jsonb) | **100% NULL in source (verified)**   generated from Institution name / random Rwandan district | **Yes** |
| Required_Experience_Years | jobs.experience_min, experience_max, experience_level | direct min; max/band derived | No (real min) |
| Required_Languages | jobs.language_requirements | **100% NULL in source (verified)**   generated (English/Kinyarwanda/French mix) | **Yes** |
| Required_Education | jobs.qualifications (direct text), jobs.education_required (jsonb, parsed into degree/field entries + detected certifications) | real text, parsed | No (parsed, not invented) |
| Required_Field_Of_Study | jobs.education_required.fields_of_study, jobs.skills_required | real text (can list multiple of the 10 categories   parsed via substring match, not naive comma-split, since category names contain internal commas) | No |
| Total_Education_Options | *(informational only)* |   |   |
| Total_Applicants | jobs.application_count | **overwritten post-generation** with the actual count of generated `applications` rows for that job (keeps the column consistent with the down-sampled dataset rather than the full historical population) | No (real, then reconciled) |
| Total_Engagements | jobs.view_count | same reconciliation as above, against generated `job_views` | No (real, then reconciled) |
| Clicked/Applied/Shortlisted/Interviewed/Hired_Count | *(informational only)* |   |   |
|   | jobs.description, summary, responsibilities, benefits, salary_min/max, screening_questions, application_instructions | generated, templated FROM the real title/institution/field/experience (not generic filler) | **Yes** |
|   | jobs.published_at, expires_at, status | generated per Step 7 (forced active, 2026-06-01..2026-12-31) | **Yes** |

## Cleaned_Combined_Applications.csv → `applications`

| CSV Column | DB Column | Transformation |
|---|---|---|
| Candidate_ID, Job_ID | user_id, job_id | remapped via id mappings |
| Application_Date | applied_at | date-shifted by a per-job constant offset into the job's new active window (see `date_shift.py`)   preserves real relative timing |
| Application_Status | status | mapped to the `applications_status_check` enum   see `applications.py::STATUS_MAP` |

## Cleaned_Combined_Engagement.csv → `job_views` / `saved_jobs`

| CSV Column | DB Column | Transformation |
|---|---|---|
| Candidate_ID, Job_ID | user_id, job_id | remapped |
| View_Date | viewed_at | date-shifted (same offset as that job's applications), deduplicated to the latest per (user, job)   `job_views` has a UNIQUE(user_id, job_id) constraint |
| Clicked_Apply / Applied / Shortlisted / Interviewed / Hired | *(used only to bias generated `seconds_spent` and save probability   not written to any status column, since `applications` is the authoritative source for status)* | |
| Job_Save | saved_jobs | **column is empty for all ~4.85M rows (verified with a full-file scan)   saved_jobs is 100% generated**, biased toward more heavily engaged views |

## Tables with no CSV source at all (100% generated)

`job_searches` (search_history.csv), `feed_scores` (recommendation_history.csv),
`ignored_jobs`   see `generator/behaviour.py`. Generated FROM each candidate's
already-real field of study / degree / district and already-real
view/application history, not arbitrary filler.

## Tables pre-populated in the target database (reused, not duplicated)

`skills` (22 existing names, e.g. "SQL", "Python", "JavaScript") and
`companies` (3 existing seed rows) already had real rows in the target
database at generation time. `generator/existing_data.py` reads these
directly from the schema dump's own `COPY` data blocks and reuses their
real ids for any matching name   a fresh id is only minted for genuinely
new names   so the generated data merges cleanly instead of creating
duplicate/colliding rows.
