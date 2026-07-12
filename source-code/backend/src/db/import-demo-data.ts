import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Job_Feed/generator produces this ~1000-candidate/1000-job demo dataset
// (users, jobs, applications, engagement, behaviour) from real CSV data +
// the production schema. It's a standalone SQL dump, not something
// seed.ts builds itself, so it's imported here as its own step.
const IMPORT_SQL_PATH = path.join(__dirname, 'queries', 'initial_db.sql');

const importDemoData = async (): Promise<void> => {
  if (!fs.existsSync(IMPORT_SQL_PATH)) {
    logger.warn(`Job_Feed demo dataset not found at ${IMPORT_SQL_PATH} - skipping`);
    return;
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'SVWR-CFE_DB',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    await client.connect();
    logger.info('Connected to database for demo data import');

    let sql = fs.readFileSync(IMPORT_SQL_PATH, 'utf8');
    logger.info(`Importing Job_Feed demo dataset (${(sql.length / 1024 / 1024).toFixed(1)} MB)...`);

    // The skill catalog was regenerated with different capitalization than an
    // earlier import already sitting in some databases (e.g. 'leadership' vs
    // 'Leadership', same deterministic id). skill_id is NOT NULL, so an exact
    // '=' lookup that misses on casing crashes the whole import. Match
    // case-insensitively instead - names are still unique, just not
    // guaranteed to be identically-cased across generator runs.
    sql = sql.replace(/SELECT id FROM skills WHERE name = /g, 'SELECT id FROM skills WHERE name ILIKE ');

    await client.query(sql);

    logger.info('Job_Feed demo dataset imported successfully!');
  } catch (error) {
    logger.error('Demo data import failed:', error);
    throw error;
  } finally {
    await client.end();
  }
};

const run = async (): Promise<void> => {
  try {
    await importDemoData();
    process.exit(0);
  } catch (error) {
    logger.error('Demo data import process failed:', error);
    process.exit(1);
  }
};

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
const isTsxRun = process.argv[1]?.includes('import-demo-data.ts');

if (isMainModule || isTsxRun) {
  run();
}

export { importDemoData };
