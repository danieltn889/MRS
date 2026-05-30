const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 8090,
  database: 'recruitment_db',
  user: 'postgres',
  password: 'TN12',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function addJobIdToSimulationTemplates() {
  try {
    console.log('Adding job_id column to simulation_templates table...');

    // Add job_id column to simulation_templates table
    await pool.query(`
      ALTER TABLE simulation_templates
      ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL
    `);

    // Create index for the new column
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_simulation_templates_job ON simulation_templates(job_id);
    `);

    console.log('Migration completed successfully! job_id column added to simulation_templates.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addJobIdToSimulationTemplates();