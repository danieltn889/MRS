import { BaseEntity, UUID, TIMESTAMP, JSONB, ApplicationStatus } from './types.ts';
import { Job } from './job.ts';
import { User } from './user.ts';
import { Simulation } from './simulation.ts';
import { Company } from './company.ts';

export interface Application extends BaseEntity {
  job_id: UUID;
  user_id: UUID;
  application_number?: string;
  status: ApplicationStatus;
  current_stage?: string;
  applied_at: TIMESTAMP;
  submitted_data?: JSONB;
  screening_answers: JSONB;
  documents: JSONB;
  notes: JSONB;
  internal_notes: JSONB;
  tags?: string[];
  rating?: number; // 1-5
  ai_score?: JSONB;
  match_score?: number; // 0-100
  match_details?: JSONB;
  withdrawn_at?: TIMESTAMP;
  withdrawn_reason?: string;
  withdrawn_by?: UUID;
  rejection_reason?: string;
  rejection_details?: JSONB;
  rejection_feedback?: JSONB;
  source?: string;
  source_details?: JSONB;
  referrer_id?: UUID;
  metadata: JSONB;

  // Relationships
  job?: Job;
  user?: User;
  withdrawnBy?: User;
  referrer?: User;
  timeline?: ApplicationTimeline[];
  assignments?: ApplicationAssignment[];
  reminders?: ApplicationReminder[];
  simulations?: Simulation[];
}

export interface ApplicationTimeline extends BaseEntity {
  application_id: UUID;
  event_type: string;
  event_data?: JSONB;
  created_by?: UUID;
  ip_address?: string;
  metadata: JSONB;

  // Relationships
  application?: Application;
  createdBy?: User;
}

export interface ApplicationAssignment extends BaseEntity {
  application_id: UUID;
  assignee_id: UUID;
  assigned_by?: UUID;
  assigned_at: TIMESTAMP;
  role?: string;
  status: 'active' | 'completed' | 'removed';
  notes?: string;

  // Relationships
  application?: Application;
  assignee?: User;
  assignedBy?: User;
}

export interface ApplicationReminder extends BaseEntity {
  application_id: UUID;
  user_id: UUID;
  reminder_type: 'follow_up' | 'review' | 'interview' | 'assessment' | 'offer' | 'deadline';
  title: string;
  description?: string;
  reminder_time: TIMESTAMP;
  recurrence?: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'cancelled' | 'failed';
  sent_at?: TIMESTAMP;
  acknowledged_at?: TIMESTAMP;
  created_by?: UUID;

  // Relationships
  application?: Application;
  user?: User;
  createdBy?: User;
}

export interface BlacklistedCandidate extends BaseEntity {
  company_id: UUID;
  user_id: UUID;
  reason: string;
  reason_category: 'unprofessional' | 'fraud' | 'no_show' | 'policy_violation' | 'security' | 'other';
  description?: string;
  evidence: JSONB;
  blacklisted_by?: UUID;
  blacklisted_at: TIMESTAMP;
  expires_at?: TIMESTAMP;
  level: 'temporary' | 'permanent' | 'role_specific' | 'company_wide';

  // Relationships
  company?: Company;
  user?: User;
  blacklistedBy?: User;
}