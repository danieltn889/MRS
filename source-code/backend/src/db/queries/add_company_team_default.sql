-- Adds company_team.is_default (folded into schema.sql for fresh installs; this
-- file brings existing databases up to date). Backfills exactly one default
-- company per user: their only company if they have just one, otherwise their
-- earliest-joined company as a starting point (changeable at login going forward).
BEGIN;

ALTER TABLE company_team ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

UPDATE company_team ct SET is_default = TRUE
WHERE ct.id IN (
  SELECT DISTINCT ON (user_id) id
  FROM company_team
  WHERE user_id IS NOT NULL
  ORDER BY user_id, created_at ASC
)
AND NOT EXISTS (
  SELECT 1 FROM company_team ct2 WHERE ct2.user_id = ct.user_id AND ct2.is_default
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_team_one_default_per_user
  ON company_team(user_id) WHERE is_default;

COMMIT;
