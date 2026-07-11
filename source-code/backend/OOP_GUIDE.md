# OOP Architecture Guide for Recruitment Platform Backend

This guide demonstrates how to use Object-Oriented Programming (OOP) principles to create reusable, maintainable, and scalable backend code.

## 🏗️ Architecture Overview

### Core Components

1. **BaseController** - Abstract base class for all controllers
2. **DatabaseService** - Reusable database operations
3. **PaginationService** - Pagination utilities
4. **ValidationService** - Input validation utilities
5. **ResponseService** - Consistent API response formatting

### Directory Structure
```
src/
├── controllers/
│   ├── base.controller.js          # Base controller class
│   ├── job.controller.js           # Job-specific controller
│   ├── simulation.controller.js    # Simulation controller
│   └── ...
├── services/
│   ├── database.service.js         # Database operations
│   ├── pagination.service.js       # Pagination utilities
│   ├── validation.service.js       # Validation utilities
│   └── response.service.js         # Response formatting
├── routes/
│   └── v1/
│       ├── job.routes.js           # Job routes
│       └── ...
└── middleware/
    ├── auth.middleware.js
    └── validation.middleware.js
```

##  How to Use OOP Pattern

### 1. Creating a New Controller

```javascript
const BaseController = require('./base.controller');
const DatabaseService = require('../services/database.service');
const ValidationService = require('../services/validation.service');
const ResponseService = require('../services/response.service');

class MyController extends BaseController {
  constructor() {
    super('MyController'); // Pass model name for logging
  }

  // Example method
  async getItems(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      const result = await DatabaseService.getPaginatedResults('items', {
        page: validPage,
        limit: validLimit,
        where: { user_id: req.user.id },
        orderBy: 'created_at DESC'
      });

      result.pagination = PaginationService.getPaginationMeta(
        result.pagination.total,
        validPage,
        validLimit
      );

      ResponseService.paginated(res, result.data, result.pagination);
    } catch (error) {
      ResponseService.error(res, 'Failed to fetch items', 500, null, this.formatErrorDetails(error));
    }
  }
}

module.exports = new MyController();
```

### 2. Using DatabaseService

```javascript
// Simple query
const result = await DatabaseService.execute('SELECT * FROM users WHERE id = $1', [userId]);

// Paginated results
const result = await DatabaseService.getPaginatedResults('jobs', {
  page: 1,
  limit: 20,
  where: { status: 'active'},
  orderBy: 'created_at DESC',
  select: 'id, title, description',
  joins: [{
    type: 'LEFT JOIN',
    table: 'companies c',
    on: 'jobs.company_id = c.id'
  }]
});

// Aggregation
const stats = await DatabaseService.aggregate('applications', [
  { field: 'id', function: 'COUNT', alias: 'total_applications'},
  { field: 'created_at', function: 'MAX', alias: 'latest_application'}
], { job_id: jobId });
```

### 3. Using ValidationService

```javascript
// Validate required fields
const validation = ValidationService.validateRequired(data, ['title', 'description']);
if (!validation.isValid) {
  return ResponseService.error(res, 'Missing required fields', 400);
}

// Validate object structure
const schema = {
  email: { required: true, validator: ValidationService.isValidEmail },
  age: { required: false, type: 'number', min: 18, max: 100 }
};
const validation = ValidationService.validateObjectStructure(data, schema);

// Check permissions
if (!ValidationService.canUserPerformAction(req.user, 'create_jobs')) {
  return ResponseService.forbidden(res);
}
```

### 4. Using ResponseService

```javascript
// Success responses
ResponseService.success(res, data, 'Operation successful');
ResponseService.created(res, newItem, 'Item created');
ResponseService.noContent(res, 'Item deleted');

// Error responses
ResponseService.error(res, 'Something went wrong', 500);
ResponseService.notFound(res, 'User');
ResponseService.forbidden(res, 'Access denied');
ResponseService.validationError(res, validationErrors);

// Paginated responses
ResponseService.paginated(res, items, pagination);

// Special responses
ResponseService.analytics(res, analyticsData, '30d');
ResponseService.exportReady(res, downloadUrl, 'csv', 'export.csv');
```

### 5. Creating Routes

```javascript
const express = require('express');
const { body, param, query } = require('express-validator');
const { protect, authorize } = require('../middleware/auth.middleware');
const { validateRequest } = require('../middleware/validation.middleware');
const myController = require('../controllers/my.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/v1/items
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], myController.getItems);

// POST /api/v1/items
router.post('/', [
  authorize('admin', 'user'),
  body('name').isString().trim().notEmpty(),
  body('description').optional().isString().trim(),
  validateRequest
], myController.createItem);

// PUT /api/v1/items/:id
router.put('/:id', [
  param('id').isUUID(),
  body('name').optional().isString().trim().notEmpty(),
  validateRequest
], myController.updateItem);

// DELETE /api/v1/items/:id
router.delete('/:id', [
  param('id').isUUID(),
  validateRequest
], myController.deleteItem);

module.exports = router;
```

## 🔧 Available Services

### BaseController Methods

- `sendSuccess(res, data, message, statusCode)` - Success response
- `sendError(res, message, statusCode, error)` - Error response
- `withTransaction(callback)` - Database transactions
- `create(tableName, data, returnFields)` - Create record
- `findById(tableName, id, conditions, returnFields)` - Find by ID
- `findAll(tableName, options)` - Find with pagination/filtering
- `update(tableName, id, data, conditions, returnFields)` - Update record
- `delete(tableName, id, conditions)` - Delete record
- `exists(tableName, conditions)` - Check existence
- `validateOwnership(resource, userId, ownerField)` - Ownership validation

### DatabaseService Methods

- `execute(query, params)` - Raw query execution
- `getPaginatedResults(tableName, options)` - Paginated queries
- `aggregate(tableName, aggregations, where, groupBy, joins)` - Aggregations
- `bulkInsert(tableName, records, returnFields)` - Bulk insert
- `bulkUpdate(tableName, updates, whereField)` - Bulk update
- `getWithRelations(tableName, relations, where, orderBy)` - Eager loading
- `buildWhereClause(conditions, startParamIndex)` - Dynamic WHERE clauses

### PaginationService Methods

- `validatePaginationParams(page, limit, maxLimit)` - Validate params
- `getPaginationMeta(total, page, limit)` - Get metadata
- `generatePaginationLinks(baseUrl, currentPage, totalPages, queryParams)` - Generate links
- `getInfiniteScrollMeta(data, hasMore, nextOffset)` - Infinite scroll
- `getSearchPaginatedResults(searchFunction, query, options)` - Search pagination

### ValidationService Methods

- `isValidEmail(email)` - Email validation
- `isValidPassword(password, options)` - Password strength
- `isValidPhone(phone)` - Phone validation
- `isValidUUID(uuid)` - UUID validation
- `validateRequired(data, requiredFields)` - Required fields
- `validateObjectStructure(obj, schema)` - Schema validation
- `canUserPerformAction(user, action, resource)` - Permission check
- `isOwner(user, resource, ownerField)` - Ownership check

### ResponseService Methods

- `success(res, data, message, statusCode, meta)` - Success response
- `error(res, message, statusCode, errorCode, details)` - Error response
- `paginated(res, data, pagination, message)` - Paginated response
- `created(res, data, message)` - Created response
- `notFound(res, resource)` - Not found response
- `forbidden(res, message)` - Forbidden response
- `validationError(res, errors, message)` - Validation error

## 📋 Best Practices

### 1. Controller Structure
- Always extend BaseController
- Use meaningful method names
- Include JSDoc comments for all methods
- Handle errors consistently using ResponseService
- Validate input using ValidationService

### 2. Service Usage
- Use DatabaseService for all database operations
- Use PaginationService for consistent pagination
- Use ValidationService for all validation logic
- Use ResponseService for all API responses

### 3. Error Handling
- Use try-catch in all controller methods
- Log errors using the logger
- Return appropriate HTTP status codes
- Include error details only in development mode

### 4. Validation
- Validate input at route level using express-validator
- Use ValidationService for business logic validation
- Return detailed validation errors
- Sanitize input data before processing

### 5. Database Operations
- Use transactions for multi-step operations
- Use parameterized queries to prevent SQL injection
- Include proper indexes for performance
- Use DatabaseService methods for consistency

## 🔄 Migration from Functional to OOP

### Before (Functional)
```javascript
// routes/job.routes.js
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await dbQuery(`
      SELECT * FROM jobs LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error'});
  }
});
```

### After (OOP)
```javascript
// controllers/job.controller.js
class JobController extends BaseController {
  async getJobs(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const { page: validPage, limit: validLimit } = PaginationService.validatePaginationParams(page, limit);

      const result = await DatabaseService.getPaginatedResults('jobs', {
        page: validPage,
        limit: validLimit,
        orderBy: 'created_at DESC'
      });

      result.pagination = PaginationService.getPaginationMeta(
        result.pagination.total,
        validPage,
        validLimit
      );

      ResponseService.paginated(res, result.data, result.pagination);
    } catch (error) {
      ResponseService.error(res, 'Failed to fetch jobs', 500, null, this.formatErrorDetails(error));
    }
  }
}

// routes/job.routes.js
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], jobController.getJobs);
```

## ''Benefits of OOP Approach

1. **Reusability** - Common functionality in base classes and services
2. **Maintainability** - Consistent patterns across all controllers
3. **Scalability** - Easy to add new features without code duplication
4. **Testability** - Services can be easily mocked and tested
5. **Consistency** - Standardized error handling, validation, and responses
6. **Readability** - Clear separation of concerns and self-documenting code

##  Next Steps

1. Refactor existing controllers to use the OOP pattern
2. Create additional services for specific business logic
3. Implement comprehensive error handling and logging
4. Add unit tests for all services and controllers
5. Create API documentation using the consistent response format

This OOP architecture provides a solid foundation for building scalable, maintainable backend applications.</content>
<parameter name="filePath">t:\My Server\CapstonProject\SVWR-CFE\backend\OOP_GUIDE.md