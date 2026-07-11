import { BaseEntity, UUID, TIMESTAMP, JSONB, SimulationType, SimulationStatus, SimulationDifficulty } from './types.ts';
import { User } from './user.ts';
import { Application } from './application.ts';
import { Job } from './job.ts';
import { Company } from './company.ts';

export interface SimulationTemplate extends BaseEntity {
  company_id?: UUID;
  name: string;
  slug?: string;
  description?: string;
  type: SimulationType;
  category?: string;
  difficulty: SimulationDifficulty;
  duration_minutes: number;
  total_tasks: number;
  tasks: JSONB;
  tasks_structure?: JSONB;
  scoring_rubric?: JSONB;
  pass_fail_criteria?: JSONB;
  evaluation_criteria?: JSONB;
  technologies?: string[];
  skills_assessed?: UUID[];
  languages_supported?: string[];
  instructions?: string;
  preparation_materials?: JSONB;
  sample_simulation_id?: UUID;
  is_public: boolean;
  is_active: boolean;
  usage_count: number;
  avg_completion_time?: number;
  avg_score?: number;
  created_by?: UUID;
  metadata: JSONB;
  job_id?: UUID; // Added missing field from schema

  // Relationships
  company?: Company;
  createdBy?: User;
  simulations?: Simulation[];
  job?: Job;
}

export interface Simulation extends BaseEntity {
  template_id?: UUID;
  application_id?: UUID;
  job_id?: UUID;
  user_id: UUID;
  external_id?: string;
  status: SimulationStatus;
  scheduled_at?: TIMESTAMP;
  started_at?: TIMESTAMP;
  completed_at?: TIMESTAMP;
  paused_at?: TIMESTAMP;
  resumed_at?: TIMESTAMP;
  time_limit?: number;
  time_remaining?: number;
  time_spent?: number;
  tasks?: JSONB;
  progress?: JSONB;
  current_task: number;
  answers?: JSONB;
  results?: JSONB;
  ai_analysis?: JSONB;
  ai_analysis_version?: string;
  punctuality_score?: number;
  communication_score?: number;
  problem_solving_score?: number;
  adaptability_score?: number;
  collaboration_score?: number;
  attention_score?: number;
  initiative_score?: number;
  overall_score?: number;
  feedback?: JSONB;
  strengths?: string[];
  improvements?: string[];
  evaluator_notes?: string;
  evaluated_by?: UUID;
  evaluated_at?: TIMESTAMP;
  blockchain_tx_id?: string;
  blockchain_hash?: string;
  blockchain_timestamp?: TIMESTAMP;
  metadata: JSONB;

  // Relationships
  template?: SimulationTemplate;
  application?: Application;
  job?: Job;
  user?: User;
  evaluatedBy?: User;
  simulationTasks?: SimulationTask[];
  codeSubmissions?: CodeSubmission[];
  whiteboardSubmissions?: WhiteboardSubmission[];
  chatTranscripts?: ChatTranscript[];
  simulationSessions?: SimulationSession[];
  simulationResults?: SimulationResult[];
}

export interface SimulationTask extends BaseEntity {
  simulation_id: UUID;
  task_index: number;
  task_name: string;
  task_type?: string;
  task_data?: JSONB;
  started_at?: TIMESTAMP;
  completed_at?: TIMESTAMP;
  time_spent?: number;
  result?: JSONB;
  answer?: string;
  score?: number;
  feedback?: string;
  ai_analysis?: JSONB; // Fixed: should be ai_analysis, not ai_feedback

  // Relationships
  simulation?: Simulation;
}

export interface CodeSubmission extends BaseEntity {
  simulation_id: UUID;
  task_id?: UUID;
  language: string;
  code: string;
  code_version: number; // Added missing field
  submitted_at: TIMESTAMP;
  test_results?: JSONB;
  test_passed?: number; // Added from schema
  test_total?: number; // Added from schema
  execution_time?: number;
  memory_used?: number;
  compiler_output?: string; // Added from schema
  error_message?: string; // Added from schema

  // Relationships
  simulation?: Simulation;
  task?: SimulationTask;
}

export interface WhiteboardSubmission extends BaseEntity {
  simulation_id: UUID;
  task_id?: UUID;
  whiteboard_data: JSONB; // Fixed: should be whiteboard_data, not content
  elements?: JSONB; // Added from schema
  annotations?: JSONB; // Added from schema
  version: number; // Added from schema
  submitted_at: TIMESTAMP;

  // Relationships
  simulation?: Simulation;
  task?: SimulationTask;
}

export interface ChatTranscript extends BaseEntity {
  simulation_id: UUID;
  participant_role?: string; // Added from schema
  messages: JSONB;
  message_count?: number; // Added from schema
  ai_analysis?: JSONB; // Added from schema
  created_at: TIMESTAMP;

  // Relationships
  simulation?: Simulation;
}

// Additional interfaces needed for your schema
export interface SimulationSession extends BaseEntity {
  simulation_id: UUID;
  user_id: UUID;
  session_type: 'candidate'| 'preview'| 'practice'| 'test';
  application_id?: UUID;
  started_at?: TIMESTAMP;
  completed_at?: TIMESTAMP;
  paused_at?: TIMESTAMP;
  resumed_at?: TIMESTAMP;
  status: 'scheduled'| 'in_progress'| 'paused'| 'completed'| 'expired'| 'cancelled'| 'failed';
  time_limit?: number;
  time_remaining?: number;
  time_spent: number;
  current_task: number;
  answers: JSONB;
  progress: JSONB;
  score?: number;
  feedback?: JSONB;
  notes?: string;

  // Relationships
  simulation?: Simulation;
  user?: User;
  application?: Application;
  results?: SimulationResult[];
}

export interface SimulationResult extends BaseEntity {
  session_id: UUID;
  simulation_id: UUID;
  user_id: UUID;
  score?: number;
  max_score: number;
  passed?: boolean;
  time_spent?: number;
  answers?: JSONB;
  evaluation_details?: JSONB;
  strengths?: string[];
  improvements?: string[];
  feedback?: string;
  ai_analysis?: JSONB;
  completed_at: TIMESTAMP;

  // Relationships
  session?: SimulationSession;
  simulation?: Simulation;
  user?: User;
}

export interface ScheduledSimulation extends BaseEntity {
  application_id: UUID;
  simulation_id: UUID;
  user_id: UUID;
  scheduled_at: TIMESTAMP;
  status: 'scheduled'| 'completed'| 'cancelled'| 'missed';
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  application?: Application;
  simulation?: Simulation;
  user?: User;
}