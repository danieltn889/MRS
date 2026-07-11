// Initializes a database (schema + real data) directly from the newest dump
// in db_backups/, using `psql` (required   the dump uses COPY FROM stdin
// blocks, which migrate.ts's hand-rolled statement parser can't execute).
// Usage: npm run db:restore-backup
import { Client } from 'pg';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '8090', 10);
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME || 'SVWR-CFE_DB';

if (!DB_PASSWORD) {
  console.error(' DB_PASSWORD is not set. Add it to your .env file.');
  process.exit(1);
}

const BACKUPS_DIR = path.join(__dirname, '..', '..', '..', '..', 'db_backups');

const findLatestBackup = (): string => {
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('db_backup_') && f.endsWith('.sql'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    throw new Error(`No db_backup_*.sql files found in ${BACKUPS_DIR}`);
  }
  return path.join(BACKUPS_DIR, files[0].name);
};

const createDatabaseIfNotExists = async (): Promise<void> => {
  const client = new Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: 'postgres'});
  await client.connect();
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (result.rows.length === 0) {
    console.log(`Database '${DB_NAME}'does not exist   creating...`);
    await client.query(`CREATE DATABASE "${DB_NAME}"`);
  } else {
    console.log(`Database '${DB_NAME}'already exists.`);
  }
  await client.end();
};

const findPsql = (): string => {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  const candidates = process.platform === 'win32'
    ? ['psql', 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe', 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe', 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe']
    : ['psql'];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { stdio: 'ignore', shell: false });
    if (!probe.error) return candidate;
  }
  throw new Error("Could not find psql. Set PSQL_PATH env var to its full path.");
};

const restore = async (): Promise<void> => {
  const backupFile = findLatestBackup();
  console.log(`Restoring from: ${backupFile}`);

  await createDatabaseIfNotExists();

  const psql = findPsql();
  const result = spawnSync(psql, [
    '-h', DB_HOST,
    '-p', String(DB_PORT),
    '-U', DB_USER,
    '-d', DB_NAME,
    '-v', 'ON_ERROR_STOP=0',
    '-f', backupFile,
  ], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`psql restore exited with status ${result.status}`);
  }
  console.log('Database restored from backup successfully.');
};

restore().catch((error) => {
  console.error(' Restore failed:', error);
  process.exit(1);
});
