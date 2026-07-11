import { BaseEntity, UUID, TIMESTAMP, JSONB, DATE, AnalysisType } from './types.ts';

export interface AIAnalysis extends BaseEntity {
  simulation_id?: UUID;
  application_id?: UUID;
  user_id: UUID;
  analysis_type: AnalysisType;
  scores: JSONB;
  confidence_intervals?: JSONB;
  insights?: string[];
  recommendations?: JSONB;
  raw_data?: JSONB;
  model_version?: string;
  processing_time?: number;
}

export interface SkillGap extends BaseEntity {
  user_id: UUID;
  job_id?: UUID;
  skill_id?: UUID;
  current_level?: number;
  required_level?: number;
  gap?: number;
  priority: 'critical'| 'high'| 'medium'| 'low';
  learning_resources?: JSONB;
  development_plan?: JSONB;
  status: string;
}

export interface PerformanceTrend extends BaseEntity {
  user_id: UUID;
  period: string;
  period_start: DATE;
  period_end: DATE;
  metric_name: string;
  metric_value?: number;
  percentile?: number;
  comparison_data?: JSONB;
  improvement_rate?: number;
}

export interface AIModelMonitoring extends BaseEntity {
  model_name: string;
  model_version?: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  confidence_mean?: number;
  drift_detected: boolean;
  drift_score?: number;
  sample_size?: number;
  evaluation_date: TIMESTAMP;
  metrics?: JSONB;
}