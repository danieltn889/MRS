// backend/src/utils/logger.js

/**
 * Simple console logger for the application
 * Uses ES module syntax (import/export)
 */

export const logger = {
  /**
   * Log info level message
   * @param {...any} args - Message and optional arguments
   */
  info: (...args) => {
    console.log(`[INFO] ${new Date().toISOString()} -`, ...args);
  },

  /**
   * Log error level message
   * @param {...any} args - Message and optional arguments
   */
  error: (...args) => {
    console.error(`[ERROR] ${new Date().toISOString()} -`, ...args);
  },

  /**
   * Log warning level message
   * @param {...any} args - Message and optional arguments
   */
  warn: (...args) => {
    console.warn(`[WARN] ${new Date().toISOString()} -`, ...args);
  },

  /**
   * Log debug level message (only in development)
   * @param {...any} args - Message and optional arguments
   */
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} -`, ...args);
    }
  },

  /**
   * Log HTTP request messages
   * @param {...any} args - Message and optional arguments
   */
  http: (...args) => {
    console.log(`[HTTP] ${new Date().toISOString()} -`, ...args);
  },

  /**
   * Stream interface for Morgan HTTP logger
   */
  stream: {
    write: (message) => {
      console.log(message.trim());
    }
  }
};

// Default export for convenience
export default logger;