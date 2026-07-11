import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import { query as dbQuery, getClient } from '../config/database.js';
import { logger } from '../utils/logger.js';

interface PaginationOptions {
  page?: number;
  limit?: number;
  where?: Record<string, any>;
  orderBy?: string;
  returnFields?: string;
  joins?: string[];
}

interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface User {
  id: number;
  user_type: string;
  [key: string]: any;
}

/**
 * Base Controller class providing common CRUD operations and utilities
 * All controllers should extend this class for consistent behavior
 */
class BaseController {
  protected modelName: string;
  protected logger: any;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.logger = logger;
  }

  /**
   * Generic response wrapper
   */
  protected sendResponse(
    res: Response,
    success: boolean,
    data: any = null,
    message: string | null = null,
    statusCode: number = 200
  ): Response {
    const response: any = { success };

    if (data !== null) response.data = data;
    if (message !== null) response.message = message;

    return res.status(statusCode).json(response);
  }

  /**
   * Generic error response wrapper
   */
  protected sendError(
    res: Response,
    message: string,
    statusCode: number = 500,
    error: Error | null = null
  ): Response {
    this.logger.error(`${this.modelName} Controller Error:`, error || message);
    return this.sendResponse(res, false, null, message, statusCode);
  }

  /**
   * Generic success response wrapper
   */
  protected sendSuccess(
    res: Response,
    data: any = null,
    message: string | null = null,
    statusCode: number = 200
  ): Response {
    return this.sendResponse(res, true, data, message, statusCode);
  }

  /**
   * Handle database transactions
   */
  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generic create operation
   */
  protected async create<T = any>(
    tableName: string,
    data: Record<string, any>,
    returnFields: string = '*'
  ): Promise<T> {
    try {
      const fields = Object.keys(data);
      const values = Object.values(data);
      const placeholders = fields.map((_, i) => `$${i + 1}`);

      const query = `
        INSERT INTO ${tableName} (${fields.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING ${returnFields}
      `;

      const result = await dbQuery(query, values);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Create ${tableName} error:`, error);
      throw error;
    }
  }

  /**
   * Generic find by ID operation
   */
  protected async findById<T = any>(
    tableName: string,
    id: number | string,
    conditions: Record<string, any> = {},
    returnFields: string = '*'
  ): Promise<T | null> {
    try {
      let query = `SELECT ${returnFields} FROM ${tableName} WHERE id = $1`;
      const params: any[] = [id];
      let paramIndex = 2;

      // Add additional conditions
      for (const [key, value] of Object.entries(conditions)) {
        query += ` AND ${key} = $${paramIndex}`;
        params.push(value);
        paramIndex++;
      }

      const result = await dbQuery(query, params);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Find ${tableName} by ID error:`, error);
      throw error;
    }
  }

  /**
   * Generic find all with pagination and filtering
   */
  protected async findAll<T = any>(
    tableName: string,
    options: PaginationOptions = {}
  ): Promise<PaginationResult<T>> {
    try {
      const {
        page = 1,
        limit = 20,
        where = {},
        orderBy = 'created_at DESC',
        returnFields = '*',
        joins = []
      } = options;

      const offset = (page - 1) * limit;
      let params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      let whereClause = '';
      if (Object.keys(where).length > 0) {
        const conditions: string[] = [];
        for (const [key, value] of Object.entries(where)) {
          if (Array.isArray(value)) {
            conditions.push(`${key} = ANY($${paramIndex})`);
            params.push(value);
          } else if (typeof value === 'string'&& value.includes('%')) {
            conditions.push(`${key} ILIKE $${paramIndex}`);
            params.push(value);
          } else {
            conditions.push(`${key} = $${paramIndex}`);
            params.push(value);
          }
          paramIndex++;
        }
        whereClause = `WHERE ${conditions.join('AND ')}`;
      }

      // Build JOIN clause
      let joinClause = '';
      if (joins.length > 0) {
        joinClause = joins.join('');
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM ${tableName} ${joinClause} ${whereClause}`;
      const countResult = await dbQuery(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Get data with pagination
      const dataQuery = `
        SELECT ${returnFields} FROM ${tableName}
        ${joinClause}
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      params.push(limit, offset);

      const result = await dbQuery(dataQuery, params);

      return {
        data: result.rows,
        pagination: {
          page: parseInt(page.toString()),
          limit: parseInt(limit.toString()),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      this.logger.error(`Find all ${tableName} error:`, error);
      throw error;
    }
  }

  /**
   * Generic update operation
   */
  protected async update<T = any>(
    tableName: string,
    id: number | string,
    data: Record<string, any>,
    conditions: Record<string, any> = {},
    returnFields: string = '*'
  ): Promise<T | null> {
    try {
      const fields = Object.keys(data);
      const values = Object.values(data);
      const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

      let query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${fields.length + 1}`;
      const params = [...values, id];
      let paramIndex = fields.length + 2;

      // Add additional conditions
      for (const [key, value] of Object.entries(conditions)) {
        query += ` AND ${key} = $${paramIndex}`;
        params.push(value);
        paramIndex++;
      }

      query += ` RETURNING ${returnFields}`;

      const result = await dbQuery(query, params);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Update ${tableName} error:`, error);
      throw error;
    }
  }

  /**
   * Generic delete operation
   */
  protected async delete<T = any>(
    tableName: string,
    id: number | string,
    conditions: Record<string, any> = {}
  ): Promise<T | null> {
    try {
      let query = `DELETE FROM ${tableName} WHERE id = $1`;
      const params: any[] = [id];
      let paramIndex = 2;

      // Add additional conditions
      for (const [key, value] of Object.entries(conditions)) {
        query += ` AND ${key} = $${paramIndex}`;
        params.push(value);
        paramIndex++;
      }

      query += 'RETURNING *';

      const result = await dbQuery(query, params);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Delete ${tableName} error:`, error);
      throw error;
    }
  }

  /**
   * Check if record exists
   */
  protected async exists(tableName: string, conditions: Record<string, any>): Promise<boolean> {
    try {
      const whereConditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(conditions)) {
        whereConditions.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      const query = `SELECT 1 FROM ${tableName} WHERE ${whereConditions.join('AND ')} LIMIT 1`;
      const result = await dbQuery(query, params);

      return result.rows.length > 0;
    } catch (error) {
      this.logger.error(`Exists check ${tableName} error:`, error);
      throw error;
    }
  }

  /**
   * Execute custom query with parameters
   */
  protected async executeQuery(query: string, params: any[] = []): Promise<any> {
    try {
      return await dbQuery(query, params);
    } catch (error) {
      this.logger.error('Custom query error:', error);
      throw error;
    }
  }

  /**
   * Validate ownership (user owns the resource)
   */
  protected validateOwnership(resource: any, userId: number, ownerField: string = 'user_id'): boolean {
    if (resource[ownerField] !== userId) {
      throw new Error('Access denied: You do not own this resource');
    }
    return true;
  }

  /**
   * Check user permissions
   */
  protected hasPermission(user: User | null, requiredRoles: string[] = []): boolean {
    if (!user || !user.user_type) return false;
    return requiredRoles.includes(user.user_type);
  }

  /**
   * Generate slug from string
   */
  protected generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Format date for database
   */
  protected formatDate(date: Date): string {
    return date.toISOString().split('T')[0]!;
  }

  /**
   * Get current timestamp
   */
  protected getCurrentTimestamp(): string {
    return new Date().toISOString();
  }
}

export default BaseController;