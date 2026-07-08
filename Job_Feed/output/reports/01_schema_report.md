# Database Schema Inspection Report

## Table: `users`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| email | public.citext | NO |  |  |
| password_hash | character varying(255) | NO |  |  |
| user_type | character varying(50) | NO |  |  |
| status | character varying(50) | YES | `'unverified'::character varying` |  |
| verification_token | character varying(255) | YES |  |  |
| verification_code | character varying(10) | YES |  |  |
| token_expiry | timestamp with time zone | YES |  |  |
| two_factor_enabled | boolean | YES | `false` |  |
| two_factor_secret | character varying(255) | YES |  |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |
| last_login_at | timestamp with time zone | YES |  |  |
| login_attempts | integer | YES | `0` |  |
| locked_until | timestamp with time zone | YES |  |  |
| deleted_at | timestamp with time zone | YES |  |  |
| terms_accepted_at | timestamp with time zone | YES |  |  |
| terms_version | character varying(50) | YES |  |  |
| metadata | jsonb | YES | `'{}'::jsonb` |  |

- **Primary key**: id
- **Unique**: (email)
- **Required (NOT NULL, no default)**: email, password_hash, user_type

## Table: `candidate_profiles`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| user_id | uuid | NO |  |  |
| first_name | character varying(100) | NO |  |  |
| last_name | character varying(100) | NO |  |  |
| phone | character varying(50) | YES |  |  |
| country | character varying(100) | YES |  |  |
| city | character varying(100) | YES |  |  |
| timezone | character varying(100) | YES |  |  |
| date_of_birth | date | YES |  |  |
| gender | character varying(50) | YES |  |  |
| profile_photo_url | text | YES |  |  |
| profile_photo_key | character varying(255) | YES |  |  |
| linkedin_url | text | YES |  |  |
| github_url | text | YES |  |  |
| portfolio_url | text | YES |  |  |
| website_url | text | YES |  |  |
| willing_to_relocate | boolean | YES | `false` |  |
| willing_to_travel | boolean | YES | `false` |  |
| notice_period_days | integer | YES |  |  |
| current_salary | jsonb | YES |  |  |
| expected_salary | jsonb | YES |  |  |
| currency | character varying(3) | YES | `'USD'::character varying` |  |
| profile_completion | integer | YES | `0` |  |
| headline | character varying(255) | YES |  |  |
| summary | text | YES |  |  |
| languages | jsonb | YES | `'[]'::jsonb` |  |
| privacy_settings | jsonb | YES | `'{"show_contact_info": false, "profile_visibility": "public", "data_sharing_consent": false, "show_current_employer": false}'::jsonb` |  |
| job_preferences | jsonb | YES | `'{"job_types": [], "locations": [], "industries": [], "company_sizes": [], "employment_types": [], "remote_preference": "any"}'::jsonb` |  |
| availability | jsonb | YES | `'{"status": "not_looking", "notice_period": null, "available_from": null, "open_to_opportunities": false}'::jsonb` |  |
| metadata | jsonb | YES | `'{}'::jsonb` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: user_id
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, first_name, last_name

## Table: `education`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| user_id | uuid | NO |  |  |
| institution | character varying(255) | NO |  |  |
| institution_id | character varying(100) | YES |  |  |
| degree | character varying(255) | NO |  |  |
| field_of_study | character varying(255) | NO |  |  |
| start_date | date | NO |  |  |
| end_date | date | YES |  |  |
| is_current | boolean | YES | `false` |  |
| grade | character varying(50) | YES |  |  |
| grade_scale | character varying(20) | YES |  |  |
| description | text | YES |  |  |
| activities | text | YES |  |  |
| skills | text[] | YES |  |  |
| attachments | jsonb | YES | `'[]'::jsonb` |  |
| verified | boolean | YES | `false` |  |
| verification_method | character varying(100) | YES |  |  |
| verification_date | timestamp with time zone | YES |  |  |
| display_order | integer | YES | `0` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: id
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, institution, degree, field_of_study, start_date

## Table: `work_experience`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| user_id | uuid | NO |  |  |
| company | character varying(255) | NO |  |  |
| company_id | character varying(100) | YES |  |  |
| title | character varying(255) | NO |  |  |
| employment_type | character varying(100) | YES |  |  |
| location | character varying(255) | YES |  |  |
| location_type | character varying(50) | YES |  |  |
| start_date | date | NO |  |  |
| end_date | date | YES |  |  |
| is_current | boolean | YES | `false` |  |
| description | text | YES |  |  |
| achievements | text[] | YES |  |  |
| skills | text[] | YES |  |  |
| industry | character varying(255) | YES |  |  |
| team_size | integer | YES |  |  |
| reports_to | character varying(255) | YES |  |  |
| reason_for_leaving | character varying(255) | YES |  |  |
| attachments | jsonb | YES | `'[]'::jsonb` |  |
| verified | boolean | YES | `false` |  |
| verification_method | character varying(100) | YES |  |  |
| verification_date | timestamp with time zone | YES |  |  |
| display_order | integer | YES | `0` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: id
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, company, title, start_date

## Table: `certifications`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| user_id | uuid | NO |  |  |
| name | character varying(255) | NO |  |  |
| issuer | character varying(255) | NO |  |  |
| credential_id | character varying(255) | YES |  |  |
| credential_url | text | YES |  |  |
| issue_date | date | NO |  |  |
| expiry_date | date | YES |  |  |
| is_expired | boolean | YES | `false` |  |
| description | text | YES |  |  |
| skills | text[] | YES |  |  |
| attachments | jsonb | YES | `'[]'::jsonb` |  |
| verified | boolean | YES | `false` |  |
| verification_method | character varying(100) | YES |  |  |
| verification_date | timestamp with time zone | YES |  |  |
| display_order | integer | YES | `0` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: id
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, name, issuer, issue_date

## Table: `skills`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| name | character varying(255) | NO |  |  |
| category | character varying(100) | YES |  |  |
| subcategory | character varying(100) | YES |  |  |
| skill_type | character varying(50) | YES |  |  |
| is_verified | boolean | YES | `false` |  |
| verification_source | character varying(255) | YES |  |  |
| metadata | jsonb | YES | `'{}'::jsonb` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: id
- **Unique**: (name)
- **Required (NOT NULL, no default)**: name

## Table: `user_skills`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| user_id | uuid | NO |  |  |
| skill_id | uuid | NO |  |  |
| proficiency_level | integer | YES |  |  |
| proficiency_label | character varying(50) GENERATED ALWAYS AS (
CASE proficiency_level
    WHEN 1 THEN 'Beginner'::text
    WHEN 2 THEN 'Intermediate'::text
    WHEN 3 THEN 'Advanced'::text
    WHEN 4 THEN 'Expert'::text
    WHEN 5 THEN 'Master'::text
    ELSE NULL::text
END) STORED | YES |  |  |
| years_experience | numeric(3,1) | YES |  |  |
| months_experience | integer GENERATED ALWAYS AS ((floor((years_experience * (12)::numeric)))::integer) STORED | YES |  |  |
| is_primary | boolean | YES | `false` |  |
| last_used | date | YES |  |  |
| skill_context | text | YES |  |  |
| verified | boolean | YES | `false` |  |
| verification_evidence | jsonb | YES |  |  |
| endorsement_count | integer | YES | `0` |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: user_id, skill_id
- **Foreign key**: (skill_id) -> `skills`(id) ON DELETE CASCADE
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, skill_id

## Table: `companies`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| name | character varying(255) | NO |  |  |
| legal_name | character varying(255) | YES |  |  |
| slug | character varying(255) | YES |  |  |
| industry | character varying(255) | YES |  |  |
| industries | text[] | YES |  |  |
| size | character varying(50) | YES |  |  |
| founded_year | integer | YES |  |  |
| headquarters_location | jsonb | YES |  |  |
| website | character varying(255) | YES |  |  |
| description | text | YES |  |  |
| short_description | character varying(300) | YES |  |  |
| mission | text | YES |  |  |
| vision | text | YES |  |  |
| values | text[] | YES |  |  |
| culture | jsonb | YES |  |  |
| logo_url | text | YES |  |  |
| logo_key | character varying(255) | YES |  |  |
| banner_url | text | YES |  |  |
| banner_key | character varying(255) | YES |  |  |
| social_links | jsonb | YES |  |  |
| verification_status | character varying(50) | YES | `'pending'::character varying` |  |
| verification_badge | boolean | YES | `false` |  |
| verification_level | character varying(50) | YES |  |  |
| verified_at | timestamp with time zone | YES |  |  |
| verified_by | uuid | YES |  |  |
| domain | character varying(255) | YES |  |  |
| tax_id | character varying(100) | YES |  |  |
| registration_number | character varying(100) | YES |  |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |
| created_by | uuid | YES |  |  |
| deleted_at | timestamp with time zone | YES |  |  |

- **Primary key**: id
- **Unique**: (slug)
- **Foreign key**: (created_by) -> `users`(id)
- **Foreign key**: (verified_by) -> `users`(id)
- **Required (NOT NULL, no default)**: name

## Table: `jobs`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| company_id | uuid | NO |  |  |
| external_id | character varying(255) | YES |  |  |
| title | character varying(255) | NO |  |  |
| slug | character varying(255) | YES |  |  |
| department | character varying(255) | YES |  |  |
| team | character varying(255) | YES |  |  |
| job_type | character varying(100) | YES |  |  |
| work_arrangement | character varying(50) | YES |  |  |
| locations | jsonb | YES |  |  |
| description | text | NO |  |  |
| summary | text | YES |  |  |
| responsibilities | jsonb | YES | `'[]'::jsonb` |  |
| qualifications | text | YES |  |  |
| preferred_qualifications | text | YES |  |  |
| requirements | jsonb | YES |  |  |
| salary_min | numeric(10,2) | YES |  |  |
| salary_max | numeric(10,2) | YES |  |  |
| salary_currency | character varying(3) | YES | `'USD'::character varying` |  |
| salary_period | character varying(20) | YES |  |  |
| salary_visible | boolean | YES | `true` |  |
| benefits | jsonb | YES | `'[]'::jsonb` |  |
| skills_required | jsonb | YES |  |  |
| skills_preferred | jsonb | YES |  |  |
| experience_min | integer | YES |  |  |
| experience_max | integer | YES |  |  |
| experience_level | character varying(50) | YES |  |  |
| education_required | jsonb | YES |  |  |
| screening_questions | jsonb | YES | `'[]'::jsonb` |  |
| application_instructions | text | YES |  |  |
| documents | jsonb | YES | `'[]'::jsonb` |  |
| department_info | character varying(255) | YES |  |  |
| tags | text[] | YES |  |  |
| application_limit | integer | YES |  |  |
| language_requirements | jsonb | YES | `'[]'::jsonb` |  |
| experience_requirements | jsonb | YES | `'{"field": null, "level": null, "max_years": null, "min_years": null, "specific_technologies": []}'::jsonb` |  |
| education_requirements | jsonb | YES | `'{"required": false, "allowed_fields": [], "certifications": [], "minimum_degree": null, "allowed_degrees": []}'::jsonb` |  |
| skill_experience_requirements | jsonb | YES | `'{}'::jsonb` |  |
| ai_match_required_score | integer | YES | `70` |  |
| status | character varying(50) | YES | `'draft'::character varying` |  |
| visibility | character varying(50) | YES | `'public'::character varying` |  |
| published_at | timestamp with time zone | YES |  |  |
| expires_at | timestamp with time zone | YES |  |  |
| paused_at | timestamp with time zone | YES |  |  |
| closed_at | timestamp with time zone | YES |  |  |
| created_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |
| created_by | uuid | YES |  |  |
| approved_by | uuid | YES |  |  |
| approved_at | timestamp with time zone | YES |  |  |
| view_count | integer | YES | `0` |  |
| application_count | integer | YES | `0` |  |
| metadata | jsonb | YES | `'{}'::jsonb` |  |
| deleted_at | timestamp with time zone | YES |  |  |

- **Primary key**: id
- **Foreign key**: (approved_by) -> `users`(id)
- **Foreign key**: (company_id) -> `companies`(id) ON DELETE CASCADE
- **Foreign key**: (created_by) -> `users`(id)
- **Required (NOT NULL, no default)**: company_id, title, description

## Table: `job_skills`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| job_id | uuid | NO |  |  |
| skill_id | uuid | NO |  |  |
| proficiency_level | integer | YES |  |  |
| is_required | boolean | YES | `true` |  |
| importance | character varying(50) | YES |  |  |
| created_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: job_id, skill_id
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Foreign key**: (skill_id) -> `skills`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: job_id, skill_id

## Table: `job_status_history`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| job_id | uuid | NO |  |  |
| previous_status | character varying(50) | YES |  |  |
| new_status | character varying(50) | NO |  |  |
| changed_by | uuid | YES |  |  |
| reason | text | YES |  |  |
| created_at | timestamp with time zone | YES | `now()` |  |

- **Primary key**: id
- **Foreign key**: (changed_by) -> `users`(id)
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: job_id, new_status

## Table: `applications`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `public.uuid_generate_v4()` |  |
| job_id | uuid | NO |  |  |
| user_id | uuid | NO |  |  |
| application_number | character varying(50) | YES |  |  |
| status | character varying(50) | YES | `'submitted'::character varying` |  |
| current_stage | character varying(100) | YES |  |  |
| applied_at | timestamp with time zone | YES | `now()` |  |
| updated_at | timestamp with time zone | YES | `now()` |  |
| submitted_data | jsonb | YES |  |  |
| screening_answers | jsonb | YES | `'[]'::jsonb` |  |
| documents | jsonb | YES | `'[]'::jsonb` |  |
| notes | jsonb | YES | `'[]'::jsonb` |  |
| internal_notes | jsonb | YES | `'[]'::jsonb` |  |
| tags | text[] | YES |  |  |
| rating | integer | YES |  |  |
| ai_score | jsonb | YES |  |  |
| match_score | integer | YES |  |  |
| match_details | jsonb | YES |  |  |
| withdrawn_at | timestamp with time zone | YES |  |  |
| withdrawn_reason | text | YES |  |  |
| withdrawn_by | uuid | YES |  |  |
| rejection_reason | text | YES |  |  |
| rejection_details | jsonb | YES |  |  |
| source | character varying(255) | YES |  |  |
| source_details | jsonb | YES |  |  |
| referrer_id | uuid | YES |  |  |
| metadata | jsonb | YES | `'{}'::jsonb` |  |
| interview_date | timestamp with time zone | YES |  |  |
| assigned_to | uuid | YES |  |  |
| profile_data | jsonb | YES |  |  |
| feedback | text | YES |  |  |
| deleted_at | timestamp with time zone | YES |  |  |

- **Primary key**: id
- **Unique**: (application_number)
- **Unique**: (job_id, user_id)
- **Foreign key**: (assigned_to) -> `users`(id)
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Foreign key**: (referrer_id) -> `users`(id)
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Foreign key**: (withdrawn_by) -> `users`(id)
- **Required (NOT NULL, no default)**: job_id, user_id

## Table: `job_views`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |  |
| user_id | uuid | NO |  |  |
| job_id | uuid | NO |  |  |
| seconds_spent | integer | NO | `0` |  |
| viewed_at | timestamp with time zone | NO | `now()` |  |

- **Primary key**: id
- **Unique**: (user_id, job_id)
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, job_id

## Table: `saved_jobs`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| user_id | uuid | NO |  |  |
| job_id | uuid | NO |  |  |
| saved_at | timestamp with time zone | YES | `now()` |  |
| notes | text | YES |  |  |
| tags | text[] | YES |  |  |
| priority | character varying(20) | YES |  |  |
| folder | character varying(255) | YES |  |  |
| notified | boolean | YES | `false` |  |
| match_score | numeric(5,2) | YES |  |  |

- **Primary key**: user_id, job_id
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, job_id

## Table: `ignored_jobs`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |  |
| user_id | uuid | NO |  |  |
| job_id | uuid | NO |  |  |
| ignored_at | timestamp with time zone | NO | `now()` |  |

- **Primary key**: id
- **Unique**: (user_id, job_id)
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, job_id

## Table: `job_searches`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |  |
| user_id | uuid | NO |  |  |
| query | text | NO |  |  |
| searched_at | timestamp with time zone | NO | `now()` |  |

- **Primary key**: id
- **Foreign key**: (user_id) -> `users`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: user_id, query

## Table: `feed_scores`

| Column | Type | Nullable | Default | Enum values |
|---|---|---|---|---|
| candidate_id | uuid | NO |  |  |
| job_id | uuid | NO |  |  |
| score | numeric(6,2) | NO | `0` |  |
| computed_at | timestamp with time zone | NO | `now()` |  |

- **Primary key**: candidate_id, job_id
- **Foreign key**: (candidate_id) -> `users`(id) ON DELETE CASCADE
- **Foreign key**: (job_id) -> `jobs`(id) ON DELETE CASCADE
- **Required (NOT NULL, no default)**: candidate_id, job_id
