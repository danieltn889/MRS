import { BaseEntity, UUID, TIMESTAMP, JSONB, NotificationStatus, NotificationCategory } from './types.ts';

export interface Notification extends BaseEntity {
  user_id: UUID;
  type: string;
  category: NotificationCategory;
  title: string;
  content?: string;
  data?: JSONB;
  priority: 'low'| 'normal'| 'high'| 'urgent';
  channels: string[];
  status: NotificationStatus;
  sent_at?: TIMESTAMP;
  delivered_at?: TIMESTAMP;
  read_at?: TIMESTAMP;
  failed_at?: TIMESTAMP;
  failure_reason?: string;
  metadata: JSONB;
}

export interface NotificationPreferences {
  user_id: UUID;
  email: JSONB;
  sms: JSONB;
  push: JSONB;
  in_app: JSONB;
  frequency: JSONB;
  quiet_hours: JSONB;
  updated_at: TIMESTAMP;
}

export interface EmailTracking extends BaseEntity {
  recipient: string;
  notification_id?: UUID;
  subject: string;
  sent_at: TIMESTAMP;
  delivered_at?: TIMESTAMP;
  opened_at?: TIMESTAMP;
  clicked_at?: TIMESTAMP;
  bounced_at?: TIMESTAMP;
  bounce_reason?: string;
  unsubscribed_at?: TIMESTAMP;
  spam_reported_at?: TIMESTAMP;
  metadata: JSONB;
}

export interface NotificationDeliveryMonitoring extends BaseEntity {
  notification_id: UUID;
  channel: string;
  status: string;
  attempt_count: number;
  last_attempt_at: TIMESTAMP;
  next_attempt_at?: TIMESTAMP;
  error_message?: string;
  provider_response?: JSONB;
}

export interface SystemAnnouncement extends BaseEntity {
  title: string;
  content: string;
  type: 'info'| 'warning'| 'error'| 'success';
  target_audience: string;
  is_active: boolean;
  published_at?: TIMESTAMP;
  expires_at?: TIMESTAMP;
  created_by?: UUID;
}