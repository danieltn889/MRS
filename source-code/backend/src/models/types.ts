// Common types and enums for the recruitment platform models

export type UUID = string;
export type JSONB = Record<string, any>;
export type TIMESTAMP = Date;
export type DATE = Date;
export type INET = string;

// User types
export enum UserType {
  CANDIDATE = 'candidate',
  RECRUITER = 'recruiter',
  COMPANY_ADMIN = 'company_admin',
  SYSTEM_ADMIN = 'system_admin'
}

export enum UserStatus {
  UNVERIFIED = 'unverified',
  VERIFIED = 'verified',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  DELETED = 'deleted'
}

// Login history status
export enum LoginStatus {
  SUCCESS = 'success',
  FAILED = 'failed'
}

// Security alert severity
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Employment types
export enum EmploymentType {
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
  SELF_EMPLOYED = 'self-employed'
}

export enum LocationType {
  ONSITE = 'onsite',
  HYBRID = 'hybrid',
  REMOTE = 'remote'
}

// Skill types
export enum SkillType {
  TECHNICAL = 'technical',
  SOFT = 'soft',
  LANGUAGE = 'language',
  CERTIFICATION = 'certification',
  TOOL = 'tool'
}

// Company verification status
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

// Job status and types
export enum JobStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  PAUSED = 'paused',
  CLOSED = 'closed',
  FILLED = 'filled',
  CANCELLED = 'cancelled'
}

export enum JobType {
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  CONTRACT = 'contract',
  INTERNSHIP = 'internship',
  FREELANCE = 'freelance',
  TEMPORARY = 'temporary'
}

export enum JobVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  UNLISTED = 'unlisted'
}

// Application status
export enum ApplicationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  SHORTLISTED = 'shortlisted',
  INTERVIEWING = 'interviewing',
  OFFERED = 'offered',
  HIRED = 'hired',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

// Simulation types and status
export enum SimulationType {
  CODING_CHALLENGE = 'coding_challenge',
  SYSTEM_DESIGN = 'system_design',
  CASE_STUDY = 'case_study',
  BEHAVIORAL = 'behavioral',
  TECHNICAL_INTERVIEW = 'technical_interview'
}

export enum SimulationStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export enum SimulationDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXPERT = 'expert'
}

// AI analysis types
export enum AnalysisType {
  RESUME_PARSING = 'resume_parsing',
  SKILL_EXTRACTION = 'skill_extraction',
  CANDIDATE_MATCHING = 'candidate_matching',
  INTERVIEW_TRANSCRIPT = 'interview_transcript',
  CODE_REVIEW = 'code_review',
  PERFORMANCE_ANALYSIS = 'performance_analysis'
}

// Blockchain credential status
export enum CredentialStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REVOKED = 'revoked',
  EXPIRED = 'expired'
}

// Payment and subscription enums
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PAST_DUE = 'past_due'
}

export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

// Support ticket status
export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  ESCALATED = 'escalated'
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Integration status
export enum IntegrationStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  PENDING = 'pending'
}

// Webhook status
export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FAILED = 'failed'
}

// Notification status and categories
export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived'
}

export enum NotificationCategory {
  APPLICATION = 'application',
  JOB = 'job',
  SIMULATION = 'simulation',
  SECURITY = 'security',
  SYSTEM = 'system',
  MARKETING = 'marketing'
}

// Common interfaces
export interface BaseEntity {
  id: UUID;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;
}

export interface SoftDeleteEntity extends BaseEntity {
  deleted_at?: TIMESTAMP;
}

export interface MetadataEntity {
  metadata: JSONB;
}

export interface Location {
  country?: string;
  city?: string;
  state?: string;
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface Salary {
  amount: number;
  currency: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  range?: {
    min: number;
    max: number;
  };
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
}