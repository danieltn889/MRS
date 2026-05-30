import path from 'path';
import fs from 'fs';

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// Simple console logger for now
const logger = {
  info: (message: string, ...args: any[]) => console.log(`INFO: ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`ERROR: ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`WARN: ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.debug(`DEBUG: ${message}`, ...args),
  stream: {
    write: (message: string) => console.log(message.trim())
  }
};

export { logger };