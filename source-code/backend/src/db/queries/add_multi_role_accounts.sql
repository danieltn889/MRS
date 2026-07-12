-- Allows the same email to have a separate account per role (e.g. one person
-- who is both a candidate and a recruiter). Folded into schema.sql for fresh
-- installs; this file brings existing databases up to date.
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_type_unique ON users(email, user_type);

COMMIT;
