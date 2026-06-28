# Database Documentation

The platform uses **PostgreSQL** accessed directly via the `pg` driver (no ORM). The schema
is defined in a single file and applied idempotently by a migration script.

| Item | Value |
|------|-------|
| Engine | PostgreSQL 14+ |
| Driver | `pg` (raw SQL, parameterized) |
| Schema file | `backend/src/db/queries/schema.sql` |
| Migration runner | `backend/src/db/migrate.ts` (`npm run migrate`) |
| Seed | `backend/src/db/seed.ts` (`npm run seed`) |
| Reset | `backend/src/db/reset.ts` (`npm run db:reset`) |
| Setup (migrate + seed) | `npm run db:setup` |
| Default connection | `localhost:8090`, db `SVWR-CFE_DB`, user `postgres` |

Migrations run the whole `schema.sql` and ignore duplicate-object errors, so adding
`CREATE TABLE IF NOT EXISTS …` / `CREATE INDEX IF NOT EXISTS …` statements is safe on existing
databases.

---

## Core tables (by domain)

### Identity & auth
- **users** — accounts (id, email, password hash, `user_type`, status, timestamps).
- **companies** — company tenants (created_by, name, slug, …).
- **company_team** — recruiter/admin membership of a company.
- **jobs**, **applications** — postings and candidate applications (link candidates ↔ jobs).

### Candidate profile (1 user → many)
- **candidate_profiles** (PK `user_id`) — names, contact, photo, headline, summary,
  `languages`, `privacy_settings`, `job_preferences`, `availability`, `profile_completion`.
- **education** — institution, degree, field, dates, grade, `skills TEXT[]`, `attachments` JSONB.
- **work_experience** — company, title, employment/location type, dates, `attachments` JSONB.
- **skills** (global catalog) + **user_skills** (junction: proficiency, primary, verified).
- **resumes** — file metadata, `parsed_data` JSONB, `skills_extracted`.
- **portfolio_links** — platform, url, title, `metadata` JSONB (stores uploaded project files).

### Simulations
- **simulation_templates** — reusable definitions (tasks JSONB, duration, scoring rubric).
- **simulations** — instances; `overall_score`, per-dimension scores, `blockchain_*` columns.
- **simulation_sessions** — a candidate run: status, `started_at`/`completed_at`, `time_limit`,
  `time_spent`, `answers`, `progress`, `submission_results` JSONB.
- **simulation_tasks**, **session_task_progress** — per-task definition and progress
  (status, answer, score, feedback, `github_commit_url`).
- **chat_messages** — in-simulation chat (threaded via `reply_to`/`thread_id`, `is_read`).

### Evaluation & results
- **evaluations**, **evaluation_sections**, **evaluation_behavioral_metrics**,
  **evaluation_ai_feedback** — normalized evaluation output.
- **simulation_results** — score, passed, evaluation details, strengths/improvements, feedback.

### Notifications & email
- **notifications** — `user_id`, type, category, title, content, `data` JSONB, status/read.
- **notification_preferences** — per-channel JSONB prefs (email/sms/push/in_app/quiet_hours).
- **email_tracking** — every email send attempt (recipient, subject, delivered, `metadata`).

### Blockchain / audit
- **audit_chain** — hash-linked audit chain (see [BLOCKCHAIN.md](BLOCKCHAIN.md)).
- **blockchain_records** — Ethereum tx per session (`tx_id`, `block_hash`, `data_hash`, `data`).
- **verifiable_credentials**, **blockchain_credentials** — verifiable credentials + hashes.
- **wallet_addresses** — per-candidate-per-simulation Ethereum wallet.
- **access_audit**, **credential_access** — credential access log & sharing grants.

---

## Relationships (high level)

```
users 1───1 candidate_profiles
users 1───* education / work_experience / resumes / portfolio_links / user_skills
skills *───* users           (via user_skills)
users 1───* simulation_sessions ───* session_task_progress
simulation_sessions 1───* chat_messages
simulation_sessions 1───1 simulation_results / blockchain_records / verifiable_credentials
users 1───* notifications / email_tracking
companies 1───* jobs ───* applications ───* simulation_sessions
```

Most child tables use `ON DELETE CASCADE` from `users(id)`, so deleting a user removes their
profile, simulations, notifications, etc.

---

## Constraints & indexes

- UUID primary keys (`uuid_generate_v4()`); `CHECK` constraints on enums (status, category,
  proficiency 1–5, score ranges).
- Unique constraints where appropriate (e.g. `audit_chain.current_hash`,
  `blockchain_records.session_id`, `skills.name`).
- Indexes on foreign keys and common filters (user_id, created_at, status, event_type, hashes).

---

## Migrations, seeds, backup

```bash
cd backend
npm run migrate      # apply schema.sql (idempotent)
npm run seed         # insert seed/sample data
npm run db:setup     # migrate + seed
npm run db:reset     # drop & recreate (destructive)
```

Backup / restore (standard PostgreSQL tooling):

```bash
pg_dump -h localhost -p 8090 -U postgres SVWR-CFE_DB > backup.sql
psql   -h localhost -p 8090 -U postgres SVWR-CFE_DB < backup.sql
```

Schema changes: edit `schema.sql` using `CREATE … IF NOT EXISTS` / `ALTER TABLE … IF NOT
EXISTS` patterns so re-running `migrate` is safe on existing databases.
