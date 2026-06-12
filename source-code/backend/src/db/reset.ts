import { Client } from 'pg';
import { logger } from '../utils/logger.js';

const resetDatabase = async (): Promise<void> => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '8090'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TN12',
    database: 'postgres', // Connect to default postgres database first
  });

  try {
    await client.connect();
    logger.info('Connected to PostgreSQL server for database reset');

    const dbName = process.env.DB_NAME || 'SVWR-CFE_DB';

    // Terminate active connections to the database
    logger.info('Terminating active connections...');
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop database if it exists
    const dbExists = await client.query(
      'SELECT datname FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (dbExists.rows.length > 0) {
      logger.info(`Dropping existing database '${dbName}'...`);
      await client.query(`DROP DATABASE "${dbName}"`);
      logger.info(`Database '${dbName}' dropped successfully`);
    }

    // Create fresh database
    logger.info(`Creating new database '${dbName}'...`);
    await client.query(`CREATE DATABASE "${dbName}"`);
    logger.info(`Database '${dbName}' created successfully`);

    await client.end();
  } catch (error) {
    logger.error('Error resetting database:', error);
    throw error;
  }
};

const reset = async (): Promise<void> => {
  try {
    logger.info('Starting database reset...');
    await resetDatabase();
    logger.info('Database reset completed successfully!');
  } catch (error) {
    logger.error('Database reset failed:', error);
    process.exit(1);
  }
};

// Run reset if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  reset();
}

export { reset };
