import { Response } from 'express';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  has_next?: boolean;
  has_prev?: boolean;
  next_page?: number | null;
  prev_page?: number | null;
}

interface ValidationError {
  param: string;
  msg: string;
  value: any;
  location?: string;
}

interface BulkOperationResult {
  success: boolean;
  [key: string]: any;
}

interface SearchMeta {
  query: string;
  total_results: number;
  search?: {
    query: string;
    total_results: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Response Service class providing reusable response formatting utilities
 * Handles consistent API responses, error formatting, and pagination
 */
class ResponseService {
  /**
   * Success response wrapper
   */
  static success(
    res: Response,
    data: any = null,
    message: string | null = null,
    statusCode: number = 200,
    meta: any = null
  ): Response {
    const response: any = {
      success: true,
      timestamp: new Date().toISOString()
    };

    if (data !== null && data !== undefined) response.data = data;
    if (message) response.message = message;
    if (meta) response.meta = meta;

    return res.status(statusCode).json(response);
  }

  /**
   * Error response wrapper
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    errorCode: string | null = null,
    details: any = null
  ): Response {
    const response: any = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (errorCode) response.error_code = errorCode;
    if (details && process.env.NODE_ENV === 'development') response.details = details;

    return res.status(statusCode).json(response);
  }

  /**
   * Validation error response
   */
  static validationError(
    res: Response,
    errors: ValidationError[],
    message: string = 'Validation failed'
  ): Response {
    const formattedErrors = errors.map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location
    }));

    return this.error(res, message, 400, 'VALIDATION_ERROR', { errors: formattedErrors });
  }

  /**
   * Not found response
   */
  static notFound(res: Response, resource: string = 'Resource'): Response {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  /**
   * Unauthorized response
   */
  static unauthorized(res: Response, message: string = 'Unauthorized access'): Response {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  /**
   * Forbidden response
   */
  static forbidden(res: Response, message: string = 'Access forbidden'): Response {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  /**
   * Paginated response
   */
  static paginated(
    res: Response,
    data: any[],
    pagination: PaginationInfo,
    message: string | null = null
  ): Response {
    const meta = {
      pagination: {
        current_page: pagination.page,
        per_page: pagination.limit,
        total: pagination.total,
        total_pages: pagination.pages,
        has_next: pagination.has_next,
        has_prev: pagination.has_prev,
        next_page: pagination.next_page,
        prev_page: pagination.prev_page
      }
    };

    return this.success(res, data, message, 200, meta);
  }

  /**
   * Created response
   */
  static created(res: Response, data: any, message: string = 'Resource created successfully'): Response {
    return this.success(res, data, message, 201);
  }

  /**
   * No content response
   */
  static noContent(res: Response, message: string = 'Operation completed successfully'): Response {
    return res.status(204).json({
      success: true,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * File upload response
   */
  static fileUploaded(
    res: Response,
    fileData: any,
    message: string = 'File uploaded successfully'
  ): Response {
    return this.success(res, fileData, message, 201);
  }

  /**
   * Bulk operation response
   */
  static bulkOperation(
    res: Response,
    results: BulkOperationResult[],
    message: string = 'Bulk operation completed'
  ): Response {
    const meta = {
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };

    return this.success(res, results, message, 200, meta);
  }

  /**
   * Search response with highlighting
   */
  static searchResults(
    res: Response,
    results: any[],
    query: string,
    total: number,
    meta: Record<string, any> = {}
  ): Response {
    const responseMeta = {
      query,
      total_results: total,
      search: {
        query,
        total_results: total,
        ...meta
      }
    };

    return this.success(res, results, 'Search completed', 200, responseMeta);
  }

  /**
   * Analytics response
   */
  static analytics(
    res: Response,
    data: any,
    period: string | null = null,
    message: string = 'Analytics retrieved successfully'
  ): Response {
    const meta = period ? { period } : null;
    return this.success(res, data, message, 200, meta);
  }

  /**
   * Export response
   */
  static exportReady(
    res: Response,
    downloadUrl: string,
    format: string,
    filename: string
  ): Response {
    return this.success(res, {
      download_url: downloadUrl,
      format,
      filename,
      expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
    }, 'Export ready for download', 200);
  }

  /**
   * Rate limit exceeded response
   */
  static rateLimitExceeded(res: Response, retryAfter: number = 60): Response {
    res.set('Retry-After', retryAfter.toString());
    return this.error(res, 'Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', {
      retry_after_seconds: retryAfter
    });
  }

  /**
   * Maintenance mode response
   */
  static maintenanceMode(res: Response, estimatedTime: string | null = null): Response {
    const details = estimatedTime ? { estimated_completion: estimatedTime } : null;
    return this.error(res, 'Service temporarily unavailable for maintenance', 503, 'MAINTENANCE_MODE', details);
  }

  /**
   * Format error details for development
   */
  static formatErrorDetails(error: Error): any {
    if (process.env.NODE_ENV !== 'development') return null;

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    };
  }

  /**
   * Handle async route wrapper
   */
  static asyncHandler(fn: (req: any, res: Response, next: (error?: any) => void) => Promise<any> | any): (req: any, res: Response, next: (error?: any) => void) => void {
    return (req: any, res: Response, next: (error?: any) => void) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

export default ResponseService;