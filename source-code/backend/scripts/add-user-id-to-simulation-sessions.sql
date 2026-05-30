-- Migration to add user_id column to simulation_sessions table
-- This fixes the issue where task completion fails due to missing user_id column

ALTER TABLE simulation_sessions
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_user_id ON simulation_sessions(user_id);

-- Update existing records if any (though there shouldn't be any in a fresh DB)
-- This is just a safety measure
UPDATE simulation_sessions
SET user_id = (
  SELECT created_by
  FROM simulations
  WHERE simulations.id = simulation_sessions.simulation_id
  LIMIT 1
)
WHERE user_id IS NULL;