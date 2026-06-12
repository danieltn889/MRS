import 'dotenv/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger.js';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '8090'),
  database: process.env.DB_NAME || 'SVWR-CFE_DB',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'TN12',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Check if database needs initialization
const checkDatabaseInitialized = async (): Promise<boolean> => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);
    const tableCount = parseInt(result.rows[0].table_count);
    return tableCount > 0;
  } catch (error) {
    logger.warn('Error checking database initialization:', error);
    return false;
  }
};

// Initialize database with migrations and seed data
const initializeDatabase = async (): Promise<void> => {
  try {
    logger.info('Database not initialized. Running migrations and seeding...');

    // Import migration and seed functions
    const { migrate } = await import('../db/migrate.js');
    const { seed } = await import('../db/seed.js');

    // Run migrations
    await migrate();

    // Run seeding
    await seed();

    logger.info('Database initialization completed successfully!');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

// Test database connection and initialize if needed
const connectDB = async (): Promise<void> => {
  try {
    // First, test basic connection
    const client = await pool.connect();
    logger.info('PostgreSQL connected successfully');
    client.release();

    // Check if database is initialized
    const isInitialized = await checkDatabaseInitialized();

    if (!isInitialized) {
      logger.info('Database appears to be empty. Initializing...');
      await initializeDatabase();
    } else {
      logger.info('Database already initialized with tables');
    }

  } catch (error) {
    console.error('Database connection/initialization error:', error);
    console.warn('Server will continue without database connection. Please ensure PostgreSQL is running.');
  }
};

// Query helper
const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug(`Executed query: ${text} - ${duration}ms`);
    return res;
  } catch (error) {
    logger.error('Query error:', error);
    throw error;
  }
};

// Transaction helper
const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;

  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    logger.error('A client has been checked out for more than 5 seconds!');
    logger.error(`The last executed query on this client was: ${(client as any).lastQuery}`);
  }, 5000);

  // Monkey patch the query method to keep track of the last query executed
  (client as any).query = (...args: any[]) => {
    (client as any).lastQuery = args;
    return (query as any).apply(client, args);
  };

  client.release = () => {
    clearTimeout(timeout);
    // Set the methods back to their old un-monkey-patched version
    client.query = query;
    client.release = release;
    return release.apply(client);
  };

  return client;
};

export {
  pool,
  connectDB,
  query,
  getClient
};
