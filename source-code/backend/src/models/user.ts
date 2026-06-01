import { BaseEntity, SoftDeleteEntity, UserType, UserStatus, UUID, TIMESTAMP, JSONB } from './types.ts';
import { CandidateProfile, Education, WorkExperience, UserSkill, Resume, PortfolioLink } from './candidate.ts';
import { Application } from './application.ts';
import { SavedJob } from './job.ts';
import { Simulation } from './simulation.ts';
import { AIAnalysis, SkillGap, PerformanceTrend } from './ai.ts';
import { BlockchainCredential } from './blockchain.ts';
import { Notification, NotificationPreferences } from './notification.ts';

export interface User extends SoftDeleteEntity {
  email: string;
  password_hash: string;
  user_type: UserType;
  status: UserStatus;
  verification_token?: string;
  token_expiry?: TIMESTAMP;
  two_factor_enabled: boolean;
  two_factor_secret?: string;
  last_login_at?: TIMESTAMP;
  login_attempts: number;
  locked_until?: TIMESTAMP;
  terms_accepted_at?: TIMESTAMP;
  terms_version?: string;
  metadata: JSONB;

  // Relationships
  candidateProfile?: CandidateProfile;
  education?: Education[];
  workExperience?: WorkExperience[];
  userSkills?: UserSkill[];
  resumes?: Resume[];
  portfolioLinks?: PortfolioLink[];
  applications?: Application[];
  savedJobs?: SavedJob[];
  simulations?: Simulation[];
  aiAnalyses?: AIAnalysis[];
  skillGaps?: SkillGap[];
  performanceTrends?: PerformanceTrend[];
  blockchainCredentials?: BlockchainCredential[];
  notifications?: Notification[];
  notificationPreferences?: NotificationPreferences;
  loginHistory?: LoginHistory[];
  sessions?: Session[];
  passwordResets?: PasswordReset[];
  recoveryCodes?: RecoveryCode[];
  securityAlerts?: SecurityAlert[];
}

export interface LoginHistory extends BaseEntity {
  user_id: UUID;
  login_at: TIMESTAMP;
  ip_address: string;
  user_agent?: string;
  device_type?: string;
  device_model?: string;
  os?: string;
  browser?: string;
  location?: JSONB;
  status: 'success' | 'failed';
  failure_reason?: string;
  session_id?: UUID;
}

export interface Session extends BaseEntity {
  user_id: UUID;
  token: string;
  refresh_token?: string;
  device_info?: JSONB;
  ip_address?: string;
  location?: JSONB;
  expires_at: TIMESTAMP;
  last_activity_at: TIMESTAMP;
  is_current: boolean;
  is_remember_me: boolean;
}

export interface PasswordReset extends BaseEntity {
  user_id: UUID;
  token: string;
  expires_at: TIMESTAMP;
  used_at?: TIMESTAMP;
  created_ip?: string;
}

export interface RecoveryCode extends BaseEntity {
  user_id: UUID;
  code: string;
  used: boolean;
  used_at?: TIMESTAMP;
  used_ip?: string;
  expires_at: TIMESTAMP;
}

export interface SecurityAlert extends BaseEntity {
  user_id: UUID;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description?: string;
  metadata?: JSONB;
  acknowledged: boolean;
  acknowledged_at?: TIMESTAMP;
}