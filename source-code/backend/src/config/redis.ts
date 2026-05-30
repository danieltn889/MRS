import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || '',
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (error: Error) => {
  logger.error('Redis connection error:', error);
});

redis.on('ready', () => {
  logger.info('Redis is ready to receive commands');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export default redis;