// User types
export const USER_TYPES = {
  CANDIDATE: 'candidate',
  RECRUITER: 'recruiter',
  COMPANY_ADMIN: 'company_admin',
  SYSTEM_ADMIN: 'system_admin'
} as const;

export type UserType = typeof USER_TYPES[keyof typeof USER_TYPES];

// Application statuses
export const APPLICATION_STATUSES = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  SHORTLISTED: 'shortlisted',
  INTERVIEW: 'interview',
  OFFER: 'offer',
  HIRED: 'hired',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[keyof typeof APPLICATION_STATUSES];

// Job statuses
export const JOB_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  EXPIRED: 'expired'
} as const;

export type JobStatus = typeof JOB_STATUSES[keyof typeof JOB_STATUSES];

// Notification types
export const NOTIFICATION_TYPES = {
  APPLICATION_UPDATE: 'application_update',
  JOB_MATCH: 'job_match',
  MESSAGE: 'message',
  SECURITY: 'security',
  BILLING: 'billing',
  SYSTEM: 'system'
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

// File upload limits
export const UPLOAD_LIMITS = {
  RESUME: 5 * 1024 * 1024, // 5MB
  PROFILE_IMAGE: 2 * 1024 * 1024, // 2MB
  COMPANY_LOGO: 1 * 1024 * 1024 // 1MB
} as const;

// Rate limiting
export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export const RATE_LIMITS = {
  GENERAL: { windowMs: 15 * 60 * 1000, max: 100 }, // 100 requests per 15 minutes
  AUTH: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 auth attempts per 15 minutes
  API: { windowMs: 60 * 1000, max: 60 } // 60 API calls per minute
} as const;

// JWT settings
export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  ISSUER: 'recruitment-platform',
  AUDIENCE: 'recruitment-users'
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
} as const;

// Search settings
export const SEARCH_CONFIG = {
  MIN_QUERY_LENGTH: 3,
  MAX_RESULTS: 50,
  FUZZY_THRESHOLD: 0.3
} as const;