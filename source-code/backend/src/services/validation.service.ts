interface PasswordOptions {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
}

interface DateValidationOptions {
  minDate?: string;
  maxDate?: string;
  format?: string;
}

interface FileValidationOptions {
  allowedTypes?: string[];
  maxSize?: number;
  allowedExtensions?: string[];
}

interface User {
  id: string;
  user_type: string;
  [key: string]: any;
}

interface ValidationRule {
  required?: boolean;
  type?: string;
  validator?: (value: any) => boolean;
  error?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

interface RequiredValidationResult {
  isValid: boolean;
  missingFields: string[];
}

interface ArrayValidationOptions {
  minLength?: number;
  maxLength?: number;
}

/**
 * Validation Service class providing reusable validation utilities
 * Handles common validation patterns and business rules
 */
class ValidationService {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static isValidPassword(password: string, options: PasswordOptions = {}): boolean {
    const {
      minLength = 8,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecialChars = false
    } = options;

    if (password.length < minLength) return false;

    if (requireUppercase && !/[A-Z]/.test(password)) return false;
    if (requireLowercase && !/[a-z]/.test(password)) return false;
    if (requireNumbers && !/\d/.test(password)) return false;
    if (requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return false;

    return true;
  }

  /**
   * Validate phone number format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate UUID format
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate date format and range
   */
  static isValidDate(dateString: string, options: DateValidationOptions = {}): boolean {
    const { minDate, maxDate, format = 'YYYY-MM-DD'} = options;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    if (minDate && date < new Date(minDate)) return false;
    if (maxDate && date > new Date(maxDate)) return false;

    return true;
  }

  /**
   * Validate file type and size
   */
  static isValidFile(file: any, options: FileValidationOptions = {}): boolean {
    const {
      allowedTypes = [],
      maxSize = 5 * 1024 * 1024, // 5MB default
      allowedExtensions = []
    } = options;

    if (!file) return false;

    // Check file size
    if (file.size > maxSize) return false;

    // Check MIME type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) return false;

    // Check file extension
    if (allowedExtensions.length > 0) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) return false;
    }

    return true;
  }

  /**
   * Check if user can create jobs
   */
  static canCreateJob(user: User | null): boolean {
    return !!(user && (user.user_type === 'recruiter'|| user.user_type === 'company_admin'));
  }

  /**
   * Check user permissions
   */
  static hasPermission(user: User | null, action: string): boolean {
    if (!user || !user.user_type) return false;

    const permissions: Record<string, string[]> = {
      candidate: ['view_jobs', 'apply_jobs', 'view_profile', 'update_profile'],
      recruiter: ['view_jobs', 'create_jobs', 'update_jobs', 'view_candidates', 'view_applications'],
      company_admin: ['view_jobs', 'create_jobs', 'update_jobs', 'manage_team', 'view_candidates', 'view_applications', 'manage_company'],
      system_admin: ['*'] // All permissions
    };

    const userPermissions = permissions[user.user_type] || [];
    return userPermissions.includes('*') || userPermissions.includes(action);
  }

  /**
   * Check if user can perform a specific action (alias for hasPermission)
   */
  static canUserPerformAction(user: User | null, action: string): boolean {
    return this.hasPermission(user, action);
  }

  /**
   * Validate resource ownership
   */
  static isOwner(user: User | null, resource: any, ownerField: string = 'user_id'): boolean {
    return user && resource && resource[ownerField] === user.id;
  }

  /**
   * Validate required fields
   */
  static validateRequired(data: Record<string, any>, requiredFields: string[]): RequiredValidationResult {
    const missing = requiredFields.filter(field => {
      const value = data[field];
      return value === null || value === undefined || value === '';
    });

    return {
      isValid: missing.length === 0,
      missingFields: missing
    };
  }

  /**
   * Sanitize input data
   */
  static sanitizeInput(data: Record<string, any>, fieldsToSanitize: string[]): Record<string, any> {
    const sanitized = { ...data };

    fieldsToSanitize.forEach(field => {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        // Remove HTML tags and trim whitespace
        sanitized[field] = sanitized[field]
          .replace(/<[^>]*>/g, '')
          .trim()
          .substring(0, 1000); // Limit length
      }
    });

    return sanitized;
  }

  /**
   * Validate array contains only allowed values
   */
  static isValidEnum(value: any, allowedValues: any[]): boolean {
    return allowedValues.includes(value);
  }

  /**
   * Validate array elements
   */
  static validateArray(
    array: any[],
    validator: (item: any) => boolean,
    options: ArrayValidationOptions = {}
  ): boolean {
    if (!Array.isArray(array)) return false;

    const { minLength = 0, maxLength = Infinity } = options;

    if (array.length < minLength || array.length > maxLength) return false;

    return array.every(validator);
  }

  /**
   * Validate object structure
   */
  static validateObjectStructure(
    obj: Record<string, any>,
    schema: Record<string, ValidationRule>
  ): ValidationResult {
    for (const [field, rules] of Object.entries(schema)) {
      const value = obj[field];

      // Check required fields
      if (rules.required && (value === null || value === undefined || value === '')) {
        return { isValid: false, error: `${field} is required` };
      }

      // Skip validation if field is not required and empty
      if (!rules.required && (value === null || value === undefined || value === '')) {
        continue;
      }

      // Type validation
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array': typeof value;
        if (actualType !== rules.type) {
          return { isValid: false, error: `${field} must be of type ${rules.type}` };
        }
      }

      // Custom validation
      if (rules.validator && !rules.validator(value)) {
        return { isValid: false, error: rules.error || `${field} is invalid` };
      }

      // Length validation for strings
      if (rules.type === 'string'&& rules.minLength && value.length < rules.minLength) {
        return { isValid: false, error: `${field} must be at least ${rules.minLength} characters` };
      }

      if (rules.type === 'string'&& rules.maxLength && value.length > rules.maxLength) {
        return { isValid: false, error: `${field} must be at most ${rules.maxLength} characters` };
      }

      // Range validation for numbers
      if (rules.type === 'number'&& rules.min !== undefined && value < rules.min) {
        return { isValid: false, error: `${field} must be at least ${rules.min}` };
      }

      if (rules.type === 'number'&& rules.max !== undefined && value > rules.max) {
        return { isValid: false, error: `${field} must be at most ${rules.max}` };
      }
    }

    return { isValid: true };
  }

  /**
   * Business rule validation for job applications
   */
  static canApplyForJob(user: User | null, job: any): boolean {
    if (!user || user.user_type !== 'candidate') return false;
    if (!job || job.status !== 'active') return false;
    if (new Date(job.expires_at) < new Date()) return false;

    return true;
  }

  /**
   * Validate skill format
   */
  static isValidSkill(skill: string): boolean {
    return !!(skill &&
           typeof skill === 'string'&&
           skill.length >= 2 &&
           skill.length <= 50 &&
           /^[a-zA-Z\s\-\+\#\.\(\)]+$/.test(skill));
  }

  /**
   * Validate experience years
   */
  static isValidExperienceYears(years: number): boolean {
    return Number.isInteger(years) && years >= 0 && years <= 50;
  }

  /**
   * Validate salary range
   */
  static isValidSalaryRange(min?: number, max?: number): boolean {
    if (min && max && min >= max) return false;
    if (min && min < 0) return false;
    if (max && max < 0) return false;

    return true;
  }

  /**
   * Generate validation error messages
   */
  static getValidationErrors(errors: any[]): Array<{
    field: string;
    message: string;
    value: any;
  }> {
    return errors.map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));
  }

  /**
   * Check if user has reached limits
   */
  static async checkUserLimits(
    userId: number,
    limitType: string,
    currentCount: number,
    maxLimit: number
  ): Promise<boolean> {
    if (currentCount >= maxLimit) {
      throw new Error(`You have reached the maximum limit of ${maxLimit} ${limitType}`);
    }
    return true;
  }
}

export default ValidationService;