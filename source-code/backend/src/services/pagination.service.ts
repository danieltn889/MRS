interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  next_page: number | null;
  prev_page: number | null;
}

interface PaginationLinks {
  first?: string;
  prev?: string;
  next?: string;
  last?: string;
}

interface CursorPaginationResult<T> {
  data: T[];
  pagination: {
    has_next: boolean;
    has_prev: boolean;
    next_cursor: string | null;
    prev_cursor: string | null;
    limit: number;
  };
}

interface InfiniteScrollMeta<T> {
  data: T[];
  has_more: boolean;
  next_offset: number;
  count: number;
}

interface SearchResultItem {
  title?: string;
  content?: string;
  description?: string;
  _search?: {
    highlighted_title: string;
    snippet: string;
  };
  [key: string]: any;
}

interface FrontendPaginationInfo {
  current_page: number;
  total_pages: number;
  pages: Array<{
    number: number;
    is_current: boolean;
  }>;
  show_first: boolean;
  show_last: boolean;
  show_prev_ellipsis: boolean;
  show_next_ellipsis: boolean;
}

/**
 * Pagination Service class providing reusable pagination utilities
 * Handles pagination metadata, links, and cursor-based pagination
 */
class PaginationService {
  /**
   * Calculate pagination metadata
   */
  static getPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
    const totalPages = Math.ceil(total / limit);

    return {
      current_page: parseInt(page.toString()),
      per_page: parseInt(limit.toString()),
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
      next_page: page < totalPages ? page + 1 : null,
      prev_page: page > 1 ? page - 1 : null
    };
  }

  /**
   * Generate pagination links for API responses
   */
  static generatePaginationLinks(
    baseUrl: string,
    currentPage: number,
    totalPages: number,
    queryParams: Record<string, any> = {}
  ): PaginationLinks {
    const links: PaginationLinks = {};

    // Remove page from query params to avoid duplication
    const cleanParams = { ...queryParams };
    delete cleanParams.page;

    const buildUrl = (page: number): string => {
      const params = new URLSearchParams({ ...cleanParams, page: page.toString() });
      return `${baseUrl}?${params.toString()}`;
    };

    if (currentPage > 1) {
      links.first = buildUrl(1);
      links.prev = buildUrl(currentPage - 1);
    }

    if (currentPage < totalPages) {
      links.next = buildUrl(currentPage + 1);
      links.last = buildUrl(totalPages);
    }

    return links;
  }

  /**
   * Validate pagination parameters
   */
  static validatePaginationParams(
    page: number | string,
    limit: number | string,
    maxLimit: number = 100
  ): { page: number; limit: number } {
    const validPage = Math.max(1, parseInt(page.toString()) || 1);
    const validLimit = Math.min(maxLimit, Math.max(1, parseInt(limit.toString()) || 20));

    return {
      page: validPage,
      limit: validLimit
    };
  }

  /**
   * Calculate offset for database queries
   */
  static getOffset(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Get page range for display (e.g., "1-20 of 100")
   */
  static getPageRange(page: number, limit: number, total: number): {
    start: number;
    end: number;
    range: string;
  } {
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return {
      start,
      end,
      range: `${start}-${end} of ${total}`
    };
  }

  /**
   * Cursor-based pagination for large datasets
   */
  static async getCursorPaginatedResults<T = any>(
    queryFunction: (
      whereClause: string,
      params: any[],
      orderClause: string,
      limitClause: string
    ) => Promise<T[]>,
    options: {
      cursor?: string;
      limit?: number;
      direction?: 'next' | 'prev';
      sortField?: string;
      sortOrder?: 'ASC' | 'DESC';
    } = {}
  ): Promise<CursorPaginationResult<T>> {
    const {
      cursor,
      limit = 20,
      direction = 'next', // 'next' or 'prev'
      sortField = 'created_at',
      sortOrder = 'DESC'
    } = options;

    let whereClause = '';
    let params: any[] = [limit];

    if (cursor) {
      const operator = direction === 'next' ? '>' : '<';
      whereClause = `WHERE ${sortField} ${operator} $2`;
      params.push(cursor);
    }

    const orderClause = `ORDER BY ${sortField} ${sortOrder}`;
    const limitClause = `LIMIT $1`;

    const results = await queryFunction(whereClause, params, orderClause, limitClause);

    // Get next cursor
    const hasNext = results.length === limit;
    const nextCursor = hasNext ? (results[results.length - 1] as any)[sortField] : null;

    // Get previous cursor (for bidirectional pagination)
    const hasPrev = !!cursor;
    const prevCursor = cursor || null;

    return {
      data: results,
      pagination: {
        has_next: hasNext,
        has_prev: hasPrev,
        next_cursor: nextCursor,
        prev_cursor: prevCursor,
        limit
      }
    };
  }

  /**
   * Infinite scroll pagination
   */
  static getInfiniteScrollMeta<T>(
    data: T[],
    hasMore: boolean,
    nextOffset: number
  ): InfiniteScrollMeta<T> {
    return {
      data,
      has_more: hasMore,
      next_offset: nextOffset,
      count: data.length
    };
  }

  /**
   * Search pagination with highlighting
   */
  static async getSearchPaginatedResults(
    searchFunction: (query: string, limit: number, offset: number) => Promise<{ data: SearchResultItem[] }>,
    query: string,
    options: {
      page?: number;
      limit?: number;
      highlight?: boolean;
      snippetLength?: number;
    } = {}
  ): Promise<{ data: SearchResultItem[] }> {
    const {
      page = 1,
      limit = 20,
      highlight = true,
      snippetLength = 150
    } = options;

    const offset = (page - 1) * limit;
    const results = await searchFunction(query, limit, offset);

    // Add search highlighting and snippets
    if (highlight && results.data) {
      results.data = results.data.map(item => ({
        ...item,
        _search: {
          highlighted_title: this.highlightText(item.title || '', query),
          snippet: this.generateSnippet(item.content || item.description || '', query, snippetLength)
        }
      }));
    }

    return results;
  }

  /**
   * Highlight search terms in text
   */
  static highlightText(text: string, query: string): string {
    if (!text || !query) return text;

    const terms = query.split(' ').filter(term => term.length > 0);
    let highlighted = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark>$1</mark>');
    });

    return highlighted;
  }

  /**
   * Generate text snippet around search terms
   */
  static generateSnippet(text: string, query: string, maxLength: number = 150): string {
    if (!text || !query) return '';

    const terms = query.split(' ').filter(term => term.length > 0);
    const textLower = text.toLowerCase();

    // Find first occurrence of any search term
    let bestIndex = -1;
    let bestTerm = '';

    terms.forEach(term => {
      const index = textLower.indexOf(term.toLowerCase());
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
        bestTerm = term;
      }
    });

    if (bestIndex === -1) return text.substring(0, maxLength) + '...';

    // Extract snippet around the found term
    const start = Math.max(0, bestIndex - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);

    let snippet = text.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Escape regex special characters
   */
  static escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get pagination info for frontend components
   */
  static getFrontendPaginationInfo(
    total: number,
    currentPage: number,
    limit: number,
    adjacentPages: number = 2
  ): FrontendPaginationInfo {
    const totalPages = Math.ceil(total / limit);
    const startPage = Math.max(1, currentPage - adjacentPages);
    const endPage = Math.min(totalPages, currentPage + adjacentPages);

    const pages = [];
    for (let i = startPage; i <= endPage; i++) {
      pages.push({
        number: i,
        is_current: i === currentPage
      });
    }

    return {
      current_page: currentPage,
      total_pages: totalPages,
      pages,
      show_first: startPage > 1,
      show_last: endPage < totalPages,
      show_prev_ellipsis: startPage > 2,
      show_next_ellipsis: endPage < totalPages - 1
    };
  }
}

export default PaginationService;