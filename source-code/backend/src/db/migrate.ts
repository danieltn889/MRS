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

    const dbName = process.env.DB_NAME || 'recruitment_db';
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
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim());
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

  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  console.log(`🔴 [parseSQLStatements] Found ${statements.length} statements`);
  return statements.filter(stmt => stmt.trim().length > 0 && !stmt.trim().match(/^--/));
};

const executeSchemaWithErrorHandling = async (client: Client, schemaSQL: string): Promise<void> => {
  console.log('🔴 [executeSchema] Starting...');
  const statements = parseSQLStatements(schemaSQL) || [];

  console.log(`Parsed ${statements.length} SQL statements`);

  const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(/i;
  const createExtensionStatements: string[] = [];
  const createTableStatements: string[] = [];
  const otherStatements: string[] = [];

  for (const statement of statements) {
    const trimmedStatement = statement.trim();
    if (!trimmedStatement) continue;

    if (trimmedStatement.toUpperCase().startsWith('CREATE EXTENSION')) {
      createExtensionStatements.push(trimmedStatement);
    } else if (createTableRegex.test(trimmedStatement)) {
      createTableStatements.push(trimmedStatement);
    } else {
      otherStatements.push(trimmedStatement);
    }
  }

  console.log(`Found ${createExtensionStatements.length} CREATE EXTENSION, ${createTableStatements.length} CREATE TABLE, ${otherStatements.length} other`);

  let createdTables = 0;
  let skippedTables = 0;

  for (const statement of createExtensionStatements) {
    try {
      await client.query(statement);
      logger.info(`Created extension`);
    } catch (error: any) {
      if (error.code === '42710') {
        logger.info(`Extension already exists`);
      } else {
        logger.warn(`Error creating extension:`, error.message);
      }
    }
  }

  for (const statement of createTableStatements) {
    const match = createTableRegex.exec(statement);
    const tableName = match?.[1] || 'unknown';

    try {
      //console.log(`Creating table: ${tableName}...`);
      await client.query(statement);
      logger.info(`Created table: ${tableName}`);
      createdTables++;
    } catch (error: any) {
      if (error.code === '42P07') {
        // logger.info(`Table ${tableName} already exists, skipping`);
        skippedTables++;
      } else {
        logger.warn(`Error creating table ${tableName}:`, error.message);
      }
    }
  }

  for (const statement of otherStatements) {
    try {
      await client.query(statement);
    } catch (error: any) {
      if (error.code === '42P07' || error.code === '42710' || error.code === '42704' || error.code === '23505') {
        // logger.info(`Object already exists, skipping`);
      
      } else {
        logger.warn(`Error executing statement:`, error.message);
      }
    }
  }

  logger.info(`Migration completed: ${createdTables} tables created, ${skippedTables} skipped`);
};

const runMigrations = async (): Promise<void> => {
  console.log('🔴 [runMigrations] Starting...');
  
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'recruitment_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    console.log('🔴 [runMigrations] Connecting to database...');
    await client.connect();
    logger.info('Connected to recruitment_db database');

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

    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    logger.info(`Found ${tablesResult.rows.length} tables`);
    console.log('Tables created:', tablesResult.rows.map(r => r.table_name).join(', '));

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