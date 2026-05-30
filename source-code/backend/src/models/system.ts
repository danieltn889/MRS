import { BaseEntity, UUID, TIMESTAMP, JSONB, PaymentStatus, SubscriptionStatus, TicketStatus, TicketPriority, IntegrationStatus, WebhookStatus } from './types';

// API Keys and Access Control
export interface APIKey extends BaseEntity {
  user_id: UUID;
  company_id?: UUID;
  name: string;
  key_hash: string;
  permissions: JSONB;
  rate_limit?: number;
  expires_at?: TIMESTAMP;
  last_used_at?: TIMESTAMP;
  is_active: boolean;
}

// Payment and Subscription Management
export interface PaymentMethod extends BaseEntity {
  user_id: UUID;
  company_id?: UUID;
  type: 'card' | 'bank_account' | 'paypal' | 'crypto';
  provider: string;
  external_id: string;
  last_four?: string;
  expiry_month?: number;
  expiry_year?: number;
  is_default: boolean;
  is_active: boolean;
  metadata: JSONB;
}

export interface SubscriptionPlanDetails extends BaseEntity {
  name: string;
  plan_type: string;
  price: number;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  features: JSONB;
  limits: JSONB;
  is_active: boolean;
  trial_days?: number;
}

export interface Subscription extends BaseEntity {
  user_id?: UUID;
  company_id?: UUID;
  plan_id: UUID;
  status: SubscriptionStatus;
  current_period_start: TIMESTAMP;
  current_period_end: TIMESTAMP;
  trial_end?: TIMESTAMP;
  cancel_at_period_end: boolean;
  cancelled_at?: TIMESTAMP;
  payment_method_id?: UUID;
  metadata: JSONB;
}

export interface Invoice extends BaseEntity {
  subscription_id?: UUID;
  user_id?: UUID;
  company_id?: UUID;
  amount: number;
  currency: string;
  status: PaymentStatus;
  due_date: TIMESTAMP;
  paid_at?: TIMESTAMP;
  payment_method_id?: UUID;
  invoice_number: string;
  line_items: JSONB;
  tax_amount?: number;
  discount_amount?: number;
  metadata: JSONB;
}

// Support System
export interface SupportTicket extends BaseEntity {
  user_id: UUID;
  company_id?: UUID;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assigned_to?: UUID;
  tags?: string[];
  metadata: JSONB;
}

export interface TicketMessage extends BaseEntity {
  ticket_id: UUID;
  user_id: UUID;
  message: string;
  is_internal: boolean;
  attachments?: JSONB;
  metadata: JSONB;
}

// Integrations
export interface LinkedInIntegration extends BaseEntity {
  user_id?: UUID;
  company_id?: UUID;
  access_token: string;
  refresh_token?: string;
  expires_at: TIMESTAMP;
  scope: string[];
  status: IntegrationStatus;
  last_sync_at?: TIMESTAMP;
  metadata: JSONB;
}

export interface CalendarIntegration extends BaseEntity {
  user_id: UUID;
  provider: 'google' | 'outlook' | 'apple';
  access_token: string;
  refresh_token?: string;
  expires_at: TIMESTAMP;
  calendar_id: string;
  status: IntegrationStatus;
  last_sync_at?: TIMESTAMP;
  settings: JSONB;
}

// Webhooks and Notifications
export interface Webhook extends BaseEntity {
  user_id?: UUID;
  company_id?: UUID;
  url: string;
  secret: string;
  events: string[];
  status: WebhookStatus;
  last_triggered_at?: TIMESTAMP;
  failure_count: number;
  metadata: JSONB;
}

export interface WebhookDeliveryLog extends BaseEntity {
  webhook_id: UUID;
  event_type: string;
  payload: JSONB;
  response_status?: number;
  response_body?: string;
  success: boolean;
  retry_count: number;
  delivered_at?: TIMESTAMP;
  error_message?: string;
}

// Analytics and Reporting
export interface PlatformUsage extends BaseEntity {
  user_id?: UUID;
  company_id?: UUID;
  feature: string;
  action: string;
  count: number;
  period: string;
  metadata: JSONB;
}

export interface HiringFunnel extends BaseEntity {
  company_id: UUID;
  job_id?: UUID;
  stage: string;
  candidates_count: number;
  conversion_rate?: number;
  average_time?: number;
  period_start: TIMESTAMP;
  period_end: TIMESTAMP;
}

export interface CostPerHire extends BaseEntity {
  company_id: UUID;
  job_id?: UUID;
  total_cost: number;
  currency: string;
  breakdown: JSONB;
  period_start: TIMESTAMP;
  period_end: TIMESTAMP;
}

export interface TimeToHire extends BaseEntity {
  company_id: UUID;
  job_id?: UUID;
  average_days: number;
  median_days: number;
  period_start: TIMESTAMP;
  period_end: TIMESTAMP;
  data_points: JSONB;
}

export interface QualityOfHire extends BaseEntity {
  company_id: UUID;
  user_id: UUID;
  hire_date: TIMESTAMP;
  performance_rating?: number;
  retention_status: 'active' | 'left' | 'terminated';
  time_to_productivity?: number;
  cost_to_company?: number;
  metadata: JSONB;
}

export interface SourceEffectiveness extends BaseEntity {
  company_id: UUID;
  source: string;
  hires_count: number;
  applications_count: number;
  conversion_rate: number;
  cost_per_hire?: number;
  quality_score?: number;
  period_start: TIMESTAMP;
  period_end: TIMESTAMP;
}

// Content and Features
export interface FAQ extends BaseEntity {
  question: string;
  answer: string;
  category: string;
  tags?: string[];
  is_published: boolean;
  view_count: number;
  helpful_count: number;
  created_by: UUID;
}

export interface FeatureSuggestion extends BaseEntity {
  user_id: UUID;
  title: string;
  description: string;
  category: string;
  status: 'open' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
  votes_count: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  metadata: JSONB;
}

export interface FeatureVote extends BaseEntity {
  suggestion_id: UUID;
  user_id: UUID;
  vote_type: 'up' | 'down';
  comment?: string;
}

// Bug Reports and Feedback
export interface BugReport extends BaseEntity {
  user_id: UUID;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'in_progress' | 'resolved' | 'closed';
  browser_info?: JSONB;
  device_info?: JSONB;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  attachments?: JSONB;
  assigned_to?: UUID;
  resolved_at?: TIMESTAMP;
  resolution_notes?: string;
}

// Coupons and Discounts
export interface Coupon extends BaseEntity {
  code: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  currency?: string;
  max_uses?: number;
  used_count: number;
  valid_from: TIMESTAMP;
  valid_until: TIMESTAMP;
  applicable_plans?: string[];
  minimum_amount?: number;
  is_active: boolean;
  created_by: UUID;
}

// Background Checks
export interface BackgroundCheckIntegration extends BaseEntity {
  user_id: UUID;
  provider: string;
  external_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  results?: JSONB;
  requested_at: TIMESTAMP;
  completed_at?: TIMESTAMP;
  cost?: number;
  metadata: JSONB;
}

// Custom Reports
export interface CustomReport extends BaseEntity {
  user_id: UUID;
  company_id?: UUID;
  name: string;
  description?: string;
  query_config: JSONB;
  schedule?: 'daily' | 'weekly' | 'monthly';
  last_run_at?: TIMESTAMP;
  is_active: boolean;
  recipients?: string[];
}

// Diversity Metrics
export interface DiversityMetric extends BaseEntity {
  company_id: UUID;
  category: string;
  metric_type: string;
  value: number;
  period_start: TIMESTAMP;
  period_end: TIMESTAMP;
  breakdown?: JSONB;
  targets?: JSONB;
}

// Job Application Tracking
export interface JobApplicationTracking extends BaseEntity {
  job_id: UUID;
  user_id: UUID;
  event_type: string;
  event_data: JSONB;
  timestamp: TIMESTAMP;
  source?: string;
  metadata: JSONB;
}

// System Performance
export interface SystemPerformance extends BaseEntity {
  metric_name: string;
  value: number;
  unit: string;
  timestamp: TIMESTAMP;
  server_id?: string;
  metadata: JSONB;
}

// Integration Logs
export interface IntegrationLog extends BaseEntity {
  integration_type: string;
  user_id?: UUID;
  company_id?: UUID;
  action: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  request_data?: JSONB;
  response_data?: JSONB;
  execution_time?: number;
  metadata: JSONB;
}