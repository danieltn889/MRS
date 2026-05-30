-- Migration: Add job_id column to simulation_templates table
-- Date: 2026-05-04
-- Description: Adds job_id column to link simulation templates to specific jobs

-- Add job_id column to simulation_templates table
ALTER TABLE simulation_templates
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_simulation_templates_job ON simulation_templates(job_id);

-- Add comment to document the column
COMMENT ON COLUMN simulation_templates.job_id IS 'Optional reference to a specific job that this simulation template is designed for';