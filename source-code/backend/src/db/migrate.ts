// src/db/migrate.ts
console.log('🔴 [1] Script started - loading modules...');

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

console.log('🔴 [2] Modules loaded, checking env...');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);

// Simplified logger to avoid import issues
const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args)
};

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔴 [3] __dirname:', __dirname);

const createDatabaseIfNotExists = async (): Promise<void> => {
  console.log('🔴 [4] createDatabaseIfNotExists - starting...');
  
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
    database: 'postgres',
  });

  try {
    console.log('🔴 [5] Connecting to PostgreSQL server...');
    await client.connect();
    console.log('✅ Connected to PostgreSQL server');

    const dbName = process.env.DB_NAME || 'SVWR-CFE_DB';
    console.log(`🔴 [6] Checking if database '${dbName}' exists...`);
    
    const result = await client.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (result.rows.length === 0) {
      console.log(`🔴 [7] Database '${dbName}' does not exist. Creating...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✅ Database '${dbName}' created successfully`);
    } else {
      console.log(`✅ Database '${dbName}' already exists`);
    }

    await client.end();
    console.log('🔴 [8] createDatabaseIfNotExists - completed');
  } catch (error) {
    console.error('❌ Error creating database:', error);
    throw error;
  }
};

const parseSQLStatements = (sql: string): string[] => {
  console.log('🔴 [parseSQLStatements] Starting to parse SQL...');
  const statements: string[] = [];
  let currentStatement = '';
  let inDollarQuote = false;
  let dollarQuoteTag = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;

  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    let processedLine = '';

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1] || '';
      
      if (!inDollarQuote && !inMultiLineComment) {
        if (char === '-' && nextChar === '-') {
          inSingleLineComment = true;
          continue;
        }
        if (inSingleLineComment) {
          continue;
        }
      }

      if (!inDollarQuote && !inSingleLineComment) {
        if (char === '/' && nextChar === '*') {
          inMultiLineComment = true;
          continue;
        }
        if (char === '*' && nextChar === '/') {
          inMultiLineComment = false;
          continue;
        }
        if (inMultiLineComment) {
          continue;
        }
      }

      if (!inSingleLineComment && !inMultiLineComment) {
        if (char === '$' && !inDollarQuote) {
          let tag = '$';
          j++;
          while (j < line.length && line[j] !== '$') {
            tag += line[j];
            j++;
          }
          if (j < line.length) {
            tag += '$';
            dollarQuoteTag = tag;
            inDollarQuote = true;
            processedLine += tag;
            continue;
          } else {
            j -= tag.length - 1;
            processedLine += char;
            continue;
          }
        } else if (char === '$' && inDollarQuote) {
          let potentialEndTag = '$';
          const startJ = j;
          j++;
          while (j < line.length && line[j] !== '$') {
            potentialEndTag += line[j];
            j++;
          }
          if (j < line.length) {
            potentialEndTag += '$';
            if (potentialEndTag === dollarQuoteTag) {
              inDollarQuote = false;
              dollarQuoteTag = '';
              processedLine += potentialEndTag;
              continue;
            } else {
              j = startJ;
              processedLine += char;
              continue;
            }
          } else {
            j = startJ;
            processedLine += char;
            continue;
          }
        }
      }

      if (char === ';' && !inDollarQuote && !inSingleLineComment && !inMultiLineComment) {
        currentStatement += processedLine + char;
        const trimmedStatement = currentStatement.trim();
        if (trimmedStatement && !trimmedStatement.match(/^--/)) {
          statements.push(trimmedStatement);
        }
        currentStatement = '';
        processedLine = '';
        inSingleLineComment = false;
        continue;
      }

      processedLine += char;
    }

    currentStatement += processedLine + '\n';
    inSingleLineComment = false;
  }

  // Handle the last statement if it exists
  const finalStatement = currentStatement.trim();
  if (finalStatement && !finalStatement.match(/^--/)) {
    statements.push(finalStatement);
  }

  // Filter out any potential undefined or empty statements
  const validStatements = statements.filter(stmt => stmt && stmt.trim().length > 0);
  
  console.log(`🔴 [parseSQLStatements] Found ${validStatements.length} valid statements`);
  return validStatements;
};

const executeSchemaWithErrorHandling = async (client: Client, schemaSQL: string): Promise<void> => {
  const statements = parseSQLStatements(schemaSQL);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // Skip if statement is undefined or empty
    if (!statement || statement.trim().length === 0) {
      console.log(`⚠️ Skipping empty statement at index ${i}`);
      continue;
    }
    
    try {
      await client.query(statement);
      console.log(`✅ Statement ${i + 1}/${statements.length} executed`);
    } catch (error: any) {
      // console.error(`❌ Error at statement ${i + 1}:`);
      // console.error(`SQL: ${statement.substring(0, 200)}...`);
      // console.error(`Error: ${error.message}`);
      
      // Don't fail on duplicate objects
      if (error.code !== '42P07' && error.code !== '42710') {
        throw error;
      }
    }
  }
};

const runMigrations = async (): Promise<void> => {
  console.log('🔴 [runMigrations] Starting...');
  
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'SVWR-CFE_DB',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    console.log('🔴 [runMigrations] Connecting to database...');
    await client.connect();
    logger.info(`Connected to ${process.env.DB_NAME || 'SVWR-CFE_DB'} database`);

    const schemaPath = path.join(__dirname, 'queries', 'schema.sql');
    console.log(`🔴 [runMigrations] Looking for schema at: ${schemaPath}`);
    
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    console.log('🔴 [runMigrations] Reading schema.sql...');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    console.log(`🔴 [runMigrations] Schema file size: ${schemaSQL.length} bytes`);
    
    const filteredSchemaSQL = schemaSQL
      .split('\n')
      .filter(line => !line.includes('vector'))
      .join('\n');
    
    console.log('🔴 [runMigrations] Executing schema...');
    await executeSchemaWithErrorHandling(client, filteredSchemaSQL);

    logger.info('Schema migration completed');

    // schema.sql's CHECK constraint on jobs.status only takes effect via a
    // fresh CREATE TABLE — on a database where `jobs` already existed (any
    // install predating this constraint's expansion), the CREATE TABLE
    // statement above just hits "already exists" and is skipped, silently
    // leaving the OLD constraint in place. Re-discovering and replacing it
    // by name every run makes this self-healing regardless of whether the
    // database is fresh or pre-existing, so it doesn't rely on anyone
    // remembering to run a separate one-off migration file.
    console.log('🔴 [runMigrations] Ensuring jobs.status constraint is up to date...');
    await client.query(`
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
    `);
    logger.info('jobs.status constraint verified');

    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    logger.info(`Found ${tablesResult.rows.length} tables`);
    //console.log('Tables created:', tablesResult.rows.map(r => r.table_name).join(', '));

    await client.end();
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
};

const migrate = async (): Promise<void> => {
  console.log('🔴 [migrate] Starting database migration...');
  try {
    console.log('🔴 [migrate] Step 1: Creating database...');
    await createDatabaseIfNotExists();
    console.log('✅ Database creation step completed');
    
    console.log('🔴 [migrate] Step 2: Running schema migrations...');
    await runMigrations();
    console.log('✅ Schema migration completed');
    
    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Simply call migrate directly - no conditional check needed
console.log('🔴 [10] Calling migrate() directly...');
migrate();

export { migrate };
