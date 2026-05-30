import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const createDatabaseIfNotExists = async (): Promise<void> => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
    database: 'postgres', // Connect to default postgres database first
  });

  try {
    await client.connect();
    logger.info('Connected to PostgreSQL server');

    // Check if database exists
    const dbName = process.env.DB_NAME || 'recruitment_db';
    const result = await client.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (result.rows.length === 0) {
      logger.info(`Database '${dbName}' does not exist. Creating...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      logger.info(`Database '${dbName}' created successfully`);
    } else {
      logger.info(`Database '${dbName}' already exists`);
    }

    await client.end();
  } catch (error) {
    logger.error('Error creating database:', error);
    throw error;
  }
};

const parseSQLStatements = (sql: string): string[] => {
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
      const prevChar = line[j - 1] || '';

      // Handle comments
      if (!inDollarQuote && !inMultiLineComment) {
        if (char === '-' && nextChar === '-') {
          inSingleLineComment = true;
          // Don't add comment chars to processedLine
          continue;
        }
        if (inSingleLineComment) {
          // Skip comment chars
          continue;
        }
      }

      if (!inDollarQuote && !inSingleLineComment) {
        if (char === '/' && nextChar === '*') {
          inMultiLineComment = true;
          // Don't add comment chars
          continue;
        }
        if (char === '*' && nextChar === '/') {
          inMultiLineComment = false;
          // Don't add comment chars
          continue;
        }
        if (inMultiLineComment) {
          // Skip comment chars
          continue;
        }
      }

      // Handle dollar quotes
      if (!inSingleLineComment && !inMultiLineComment) {
        if (char === '$' && !inDollarQuote) {
          // Start of dollar quote
          let tag = '$';
          j++; // Move past first $
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
            // Invalid dollar quote, treat as regular $
            j -= tag.length - 1; // Back up
            processedLine += char;
            continue;
          }
        } else if (char === '$' && inDollarQuote) {
          // Check if this matches the end tag
          let potentialEndTag = '$';
          const startJ = j;
          j++; // Move past first $
          while (j < line.length && line[j] !== '$') {
            potentialEndTag += line[j];
            j++;
          }
          if (j < line.length) {
            potentialEndTag += '$';
            if (potentialEndTag === dollarQuoteTag) {
              // End of dollar quote
              inDollarQuote = false;
              dollarQuoteTag = '';
              processedLine += potentialEndTag;
              continue;
            } else {
              // Not the end tag, back up
              j = startJ;
              processedLine += char;
              continue;
            }
          } else {
            // Not complete, back up
            j = startJ;
            processedLine += char;
            continue;
          }
        }
      }

      // Handle semicolons (statement terminators)
      if (char === ';' && !inDollarQuote && !inSingleLineComment && !inMultiLineComment) {
        currentStatement += processedLine + char;
        if (currentStatement.trim()) {
          statements.push(currentStatement.trim());
        }
        currentStatement = '';
        processedLine = '';
        inSingleLineComment = false; // Reset for next statement
        continue;
      }

      processedLine += char;
    }

    // Add the processed line to current statement
    currentStatement += processedLine + '\n';

    // Reset single-line comment at end of line
    inSingleLineComment = false;
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(stmt => stmt.trim().length > 0 && !stmt.trim().match(/^--/));
};

const executeSchemaWithErrorHandling = async (client: Client, schemaSQL: string): Promise<void> => {
  // Parse schema into individual SQL statements with proper handling of dollar quotes
  const statements = parseSQLStatements(schemaSQL) || [];

  console.log(`Parsed ${statements.length} SQL statements`);
  // Debug: show all statements to see what we have
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!.trim();
    if (stmt.startsWith('CREATE TABLE')) {
      console.log(`TABLE Statement ${i}: ${stmt.substring(0, 50)}...`);
    } else if (stmt.startsWith('CREATE INDEX')) {
      console.log(`INDEX Statement ${i}: ${stmt.substring(0, 50)}...`);
    } else {
      console.log(`Other Statement ${i}: ${stmt.substring(0, 50)}...`);
    }
  }
  // Debug: show all statements to see what we have
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]!.trim();
    if (stmt.startsWith('CREATE TABLE')) {
      console.log(`TABLE Statement ${i}: ${stmt.substring(0, 50)}...`);
    } else if (stmt.startsWith('CREATE INDEX')) {
      console.log(`INDEX Statement ${i}: ${stmt.substring(0, 50)}...`);
    } else {
      console.log(`Other Statement ${i}: ${stmt.substring(0, 50)}...`);
    }
  }
  // Debug: show first few statements
  for (let i = 0; i < Math.min(10, statements.length); i++) {
    console.log(`Statement ${i}: ${statements[i]!.substring(0, 100)}...`);
  }

  // Separate CREATE statements by type
  const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(/i;
  const createExtensionStatements: string[] = [];
  const createTableStatements: string[] = [];
  const otherStatements: string[] = [];

  for (const statement of statements) {
    const trimmedStatement = statement.trim();
    if (!trimmedStatement) continue;

    // Check if this is a CREATE EXTENSION statement
    if (trimmedStatement.toUpperCase().startsWith('CREATE EXTENSION')) {
      createExtensionStatements.push(trimmedStatement);
    } else if (createTableRegex.test(trimmedStatement)) {
      createTableStatements.push(trimmedStatement);
    } else {
      otherStatements.push(trimmedStatement);
    }
  }

  console.log(`Found ${createExtensionStatements.length} CREATE EXTENSION statements, ${createTableStatements.length} CREATE TABLE statements and ${otherStatements.length} other statements`);

  let createdTables = 0;
  let skippedTables = 0;

  // Execute CREATE EXTENSION statements first
  for (const statement of createExtensionStatements) {
    try {
      await client.query(statement);
      logger.info(`Created extension: ${statement.split('"')[1] || statement.split("'")[1]}`);
    } catch (error: any) {
      // Skip if extension already exists
      if (error.code === '42710') { // duplicate_object
        logger.info(`Extension already exists, skipping: ${statement}`);
      } else {
        logger.warn(`Error creating extension: ${statement}`, error);
      }
    }
  }

  // Execute CREATE TABLE statements next
  for (const statement of createTableStatements) {
    const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(/i;
    const match = createTableRegex.exec(statement);
    const tableName = match![1];

    try {
      await client.query(statement);
      logger.info(`Created table: ${tableName}`);
      createdTables++;
    } catch (error: any) {
      // Check if error is because table already exists
      if (error.code === '42P07') { // duplicate_table error code
        logger.info(`Table ${tableName} already exists, skipping`);
        skippedTables++;
      } else {
        logger.warn(`Error creating table ${tableName}:`, error);
      }
    }
  }

  // Execute other statements (indexes, functions, etc.)
  for (const statement of otherStatements) {
    try {
      await client.query(statement);
    } catch (error: any) {
      // Skip errors for already existing objects
      if (error.code === '42P07' || error.code === '42710' || error.code === '42704' || error.code === '23505') {
        // duplicate_table, duplicate_object, duplicate_function, unique_violation
        logger.info(`Object already exists, skipping: ${statement.substring(0, 50)}...`);
      } else {
        logger.warn(`Error executing statement: ${statement.substring(0, 50)}...`, error);
      }
    }
  }

  logger.info(`Migration completed: ${createdTables} tables created, ${skippedTables} tables skipped`);
};

const runMigrations = async (): Promise<void> => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    database: process.env.DB_NAME || 'recruitment_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
  });

  try {
    await client.connect();
    logger.info('Connected to recruitment_db database');

    // Read and execute schema.sql
    const schemaPath = path.resolve(__dirname, 'queries', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    // Filter out vector extension line completely (both commented and uncommented)
    const filteredSchemaSQL = schemaSQL
      .split('\n')
      .filter(line => !line.includes('vector'))
      .join('\n');
    logger.info('Executing schema.sql...');

    // Execute schema with error handling - creates missing tables, skips existing ones
    await executeSchemaWithErrorHandling(client, filteredSchemaSQL);

    logger.info('Schema migration completed');

    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    logger.info(`Created ${tablesResult.rows.length} tables:`, tablesResult.rows.map(r => r.table_name));

    await client.end();
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
};

const migrate = async (): Promise<void> => {
  try {
    logger.info('Starting database migration...');

    // Step 1: Create database if it doesn't exist
    await createDatabaseIfNotExists();

    // Step 2: Run schema migrations
    await runMigrations();

    logger.info('Database migration completed successfully!');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

export { migrate };