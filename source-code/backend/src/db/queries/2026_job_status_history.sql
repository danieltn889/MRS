-- Migration: Job status history + expanded status set
-- Safe to run on an existing database. Idempotent.

-- 1) Expand the allowed job statuses to the full set the product supports.
--    Discovers and replaces the existing CHECK constraint on jobs.status by name,
--    so it works regardless of how that constraint was originally named.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'jobs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', c);
  END IF;
  ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
      'draft', 'pending', 'active', 'open', 'inactive',
      'paused', 'closed', 'filled', 'archived', 'expired'
    ));
END $$;

-- 2) Audit trail for every status change.
CREATE TABLE IF NOT EXISTS job_status_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  previous_status VARCHAR(50),
  new_status      VARCHAR(50) NOT NULL,
  changed_by      UUID REFERENCES users(id),
  reason          TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_status_history_job ON job_status_history(job_id);
CREATE INDEX IF NOT EXISTS idx_job_status_history_created ON job_status_history(created_at DESC);
