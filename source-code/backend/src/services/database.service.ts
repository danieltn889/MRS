import { PoolClient } from 'pg';
import { query as dbQuery, getClient } from '../config/database.js';
import { logger } from '../utils/logger.js';

interface WhereCondition {
  operator?: string;
  value: any;
}

interface JoinClause {
  type?: string;
  table: string;
  on: string;
}

interface Aggregation {
  field: string;
  function: string;
  alias?: string;
}

interface OrderBy {
  field: string;
  direction?: 'ASC'| 'DESC';
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  where?: Record<string, any>;
  orderBy?: string | OrderBy | OrderBy[];
  select?: string;
  joins?: JoinClause[];
  groupBy?: string;
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

interface Relation {
  table: string;
  foreignKey: string;
  localKey?: string;
  as?: string;
  select?: string[];
}

/**
 * Database Service class providing reusable database operations
 * Handles complex queries, aggregations, and data transformations
 */
class DatabaseService {
  private logger: any;

  constructor() {
    this.logger = logger;
  }

  /**
   * Execute query with error handling
   */
  async execute(query: string, params: any[] = []): Promise<any> {
    try {
      return await dbQuery(query, params);
    } catch (error) {
      this.logger.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Alias for execute method for backward compatibility
   */
  async query(query: string, params: any[] = []): Promise<any> {
    return this.execute(query, params);
  }

  /**
   * Get client for transactions
   */
  async getClient(): Promise<PoolClient> {
    return await getClient();
  }

  /**
   * Build dynamic WHERE clause from conditions object
   */
  buildWhereClause(
    conditions: Record<string, any>,
    startParamIndex: number = 1
  ): { clause: string; params: any[]; nextParamIndex: number } {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = startParamIndex;

    for (const [key, condition] of Object.entries(conditions)) {
      if (condition === null || condition === undefined) continue;

      if (typeof condition === 'object'&& condition.operator) {
        // Advanced condition with operator
        const { operator, value } = condition as WhereCondition;
        switch (operator) {
          case 'IN':
            whereConditions.push(`${key} = ANY($${paramIndex})`);
            params.push(Array.isArray(value) ? value : [value]);
            break;
          case 'NOT_IN':
            whereConditions.push(`${key} != ANY($${paramIndex})`);
            params.push(Array.isArray(value) ? value : [value]);
            break;
          case 'LIKE':
            whereConditions.push(`${key} ILIKE $${paramIndex}`);
            params.push(`%${value}%`);
            break;
          case 'NOT_LIKE':
            whereConditions.push(`${key} NOT ILIKE $${paramIndex}`);
            params.push(`%${value}%`);
            break;
          case 'GT':
            whereConditions.push(`${key} > $${paramIndex}`);
            params.push(value);
            break;
          case 'LT':
            whereConditions.push(`${key} < $${paramIndex}`);
            params.push(value);
            break;
          case 'GTE':
            whereConditions.push(`${key} >= $${paramIndex}`);
            params.push(value);
            break;
          case 'LTE':
            whereConditions.push(`${key} <= $${paramIndex}`);
            params.push(value);
            break;
          case 'BETWEEN':
            whereConditions.push(`${key} BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
            params.push(value[0], value[1]);
            paramIndex++;
            break;
          default:
            whereConditions.push(`${key} ${operator} $${paramIndex}`);
            params.push(value);
        }
      } else if (Array.isArray(condition)) {
        // IN clause
        whereConditions.push(`${key} = ANY($${paramIndex})`);
        params.push(condition);
      } else if (typeof condition === 'string'&& condition.includes('%')) {
        // LIKE clause
        whereConditions.push(`${key} ILIKE $${paramIndex}`);
        params.push(condition);
      } else {
        // Simple equality
        whereConditions.push(`${key} = $${paramIndex}`);
        params.push(condition);
      }

      paramIndex++;
    }

    return {
      clause: whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '',
      params,
      nextParamIndex: paramIndex
    };
  }

  /**
   * Build ORDER BY clause
   */
  buildOrderByClause(orderBy: string | OrderBy | OrderBy[] | null): string {
    if (!orderBy) return '';

    if (typeof orderBy === 'string') {
      return `ORDER BY ${orderBy}`;
    }

    if (Array.isArray(orderBy)) {
      const orderClauses = orderBy.map(order => {
        if (typeof order === 'string') return order;
        return `${order.field} ${order.direction || 'ASC'}`;
      });
      return `ORDER BY ${orderClauses.join(', ')}`;
    }

    return `ORDER BY ${(orderBy as OrderBy).field} ${(orderBy as OrderBy).direction || 'ASC'}`;
  }

  /**
   * Build JOIN clauses
   */
  buildJoinClause(joins: JoinClause[]): string {
    if (!joins || joins.length === 0) return '';

    return joins.map(join => {
      const { type = 'LEFT JOIN', table, on } = join;
      return `${type} ${table} ON ${on}`;
    }).join('');
  }

  /**
   * Get paginated results with total count
   */
  async getPaginatedResults<T = any>(
    tableName: string,
    options: PaginationOptions = {}
  ): Promise<PaginationResult<T>> {
    const {
      page = 1,
      limit = 20,
      where = {},
      orderBy = 'created_at DESC',
      select = '*',
      joins = [],
      groupBy = null
    } = options;

    const offset = (page - 1) * limit;

    // Build query components
    const joinClause = this.buildJoinClause(joins);
    const { clause: whereClause, params: whereParams, nextParamIndex } = this.buildWhereClause(where);
    const orderByClause = this.buildOrderByClause(orderBy);
    const groupByClause = groupBy ? `GROUP BY ${groupBy}` : '';

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM ${tableName} ${joinClause} ${whereClause} ${groupByClause}`;
    if (groupBy) {
      countQuery = `SELECT COUNT(*) as total FROM (${countQuery}) as subquery`;
    }

    const countResult = await this.execute(countQuery, whereParams);
    const total = parseInt(countResult.rows[0].total);

    // Get data with pagination
    const dataQuery = `
      SELECT ${select} FROM ${tableName}
      ${joinClause}
      ${whereClause}
      ${groupByClause}
      ${orderByClause}
      LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
    `;

    const dataParams = [...whereParams, limit, offset];
    const result = await this.execute(dataQuery, dataParams);

    return {
      data: result.rows,
      pagination: {
        page: parseInt(page.toString()),
        limit: parseInt(limit.toString()),
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Perform aggregation queries
   */
  async aggregate(
    tableName: string,
    aggregations: Aggregation[],
    where: Record<string, any> = {},
    groupBy: string | null = null,
    joins: JoinClause[] = []
  ): Promise<any[]> {
    const joinClause = this.buildJoinClause(joins);
    const { clause: whereClause, params: whereParams } = this.buildWhereClause(where);
    const groupByClause = groupBy ? `GROUP BY ${groupBy}` : '';

    const aggFields = aggregations.map(agg => {
      const { field, function: func, alias } = agg;
      return `${func}(${field}) as ${alias || field}`;
    }).join(', ');

    const query = `
      SELECT ${aggFields}
      FROM ${tableName}
      ${joinClause}
      ${whereClause}
      ${groupByClause}
    `;

    const result = await this.execute(query, whereParams);
    return result.rows;
  }

  /**
   * Bulk insert records
   */
  async bulkInsert<T = any>(
    tableName: string,
    records: Record<string, any>[],
    returnFields: string = '*'
  ): Promise<T[]> {
    if (records.length === 0) return [];

    const fields = Object.keys(records[0] || {});
    const values: any[] = [];
    const placeholders: string[] = [];

    let paramIndex = 1;
    records.forEach(record => {
      const recordValues = fields.map(field => record[field]);
      values.push(...recordValues);
      const recordPlaceholders = fields.map(() => `$${paramIndex++}`);
      placeholders.push(`(${recordPlaceholders.join(', ')})`);
    });

    const query = `
      INSERT INTO ${tableName} (${fields.join(', ')})
      VALUES ${placeholders.join(', ')}
      RETURNING ${returnFields}
    `;

    const result = await this.execute(query, values);
    return result.rows;
  }

  /**
   * Bulk update records
   */
  async bulkUpdate<T = any>(
    tableName: string,
    updates: Record<string, any>[],
    whereField: string = 'id'
  ): Promise<T[]> {
    const client = await this.getClient();

    try {
      await client.query('BEGIN');

      const results: T[] = [];
      for (const update of updates) {
        const { [whereField]: id, ...data } = update;
        const fields = Object.keys(data);
        const values = Object.values(data);
        const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');

        const query = `
          UPDATE ${tableName}
          SET ${setClause}
          WHERE ${whereField} = $${fields.length + 1}
          RETURNING *
        `;

        const result = await client.query(query, [...values, id]);
        results.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Soft delete records
   */
  async softDelete<T = any>(
    tableName: string,
    ids: (number | string)[],
    deletedField: string = 'deleted_at'
  ): Promise<T[]> {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
      UPDATE ${tableName}
      SET ${deletedField} = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
      RETURNING *
    `;

    const result = await this.execute(query, ids);
    return result.rows;
  }

  /**
   * Get records with relations (eager loading)
   */
  async getWithRelations<T = any>(
    tableName: string,
    relations: Relation[],
    where: Record<string, any> = {},
    orderBy: string = 'created_at DESC'
  ): Promise<PaginationResult<T>> {
    const joins: JoinClause[] = [];
    const selectFields: string[] = [`${tableName}.*`];

    relations.forEach(relation => {
      const { table, foreignKey, localKey = 'id', as, select = '*'} = relation;
      joins.push({
        type: 'LEFT JOIN',
        table,
        on: `${tableName}.${localKey} = ${table}.${foreignKey}`
      });

      if (select !== '*') {
        selectFields.push(...select.map(field => `${table}.${field} as ${as}_${field}`));
      } else {
        selectFields.push(`${table}.*`);
      }
    });

    return this.getPaginatedResults(tableName, {
      where,
      orderBy,
      select: selectFields.join(', '),
      joins
    });
  }

  /**
   * Search across multiple fields
   */
  buildSearchCondition(searchTerm: string, searchFields: string[]): Record<string, any> {
    if (!searchTerm || !searchFields.length) return {};

    const conditions = searchFields.map(field => ({
      [field]: { operator: 'LIKE', value: searchTerm }
    }));

    return { $or: conditions };
  }

  /**
   * Get distinct values from a column
   */
  async getDistinct(tableName: string, column: string, where: Record<string, any> = {}): Promise<any[]> {
    const { clause: whereClause, params } = this.buildWhereClause(where);
    const query = `SELECT DISTINCT ${column} FROM ${tableName} ${whereClause} ORDER BY ${column}`;

    const result = await this.execute(query, params);
    return result.rows.map((row: any) => row[column]);
  }

  /**
   * Check if records exist
   */
  async exists(tableName: string, where: Record<string, any> = {}): Promise<boolean> {
    const { clause: whereClause, params } = this.buildWhereClause(where);
    const query = `SELECT 1 FROM ${tableName} ${whereClause} LIMIT 1`;

    const result = await this.execute(query, params);
    return result.rows.length > 0;
  }

  /**
   * Count records
   */
  async count(tableName: string, where: Record<string, any> = {}): Promise<number> {
    const { clause: whereClause, params } = this.buildWhereClause(where);
    const query = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;

    const result = await this.execute(query, params);
    return parseInt(result.rows[0].count);
  }

  /**
   * Find record by ID
   */
  async findById(tableName: string, id: string | number | undefined): Promise<any> {
    if (!id) return null;
    const query = `SELECT * FROM ${tableName} WHERE id = $1`;
    const result = await this.execute(query, [id]);
    return result.rows[0] || null;
  }

  /**
   * Create a new record
   */
  async create(tableName: string, data: Record<string, any>): Promise<any> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, index) => `$${index + 1}`);

    const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await this.execute(query, values);
    return result.rows[0];
  }

  /**
   * Update a record
   */
  async update(tableName: string, id: string | number | undefined, data: Record<string, any>): Promise<any> {
    if (!id) throw new Error('ID is required for update');
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

    const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`;
    const result = await this.execute(query, [...values, id]);
    return result.rows[0];
  }

  /**
   * Delete a record
   */
  async delete(tableName: string, id: string | number | undefined): Promise<boolean> {
    if (!id) return false;
    const query = `DELETE FROM ${tableName} WHERE id = $1`;
    const result = await this.execute(query, [id]);
    return result.rowCount > 0;
  }
}




export default new DatabaseService();