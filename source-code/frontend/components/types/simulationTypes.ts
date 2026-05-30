// ─── Shared Types ────────────────────────────────────────────────────────────

export interface Resource {
  id: string;
  type: 'document' | 'video' | 'code' | 'image' | 'link';
  name: string;
  url?: string;
  content?: string;
  required: boolean;
}

export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string;
  type: 'scale' | 'boolean' | 'text' | 'multiple_choice';
  options?: string[];
  required: boolean;
  weight: number;
}

export interface TaskEvaluation {
  criteria: EvaluationCriterion[];
  automatedScoring: boolean;
  weight: number;
  timeBonus: boolean;
  qualityThreshold: number;
}

export interface SimulationTask {
  id: string;
  title: string;
  description: string;
  type:
    | 'technical'
    | 'behavioral'
    | 'situational'
    | 'collaborative'
    | 'creative'
    | 'communication'
    | 'prioritization';
  duration: number;
  instructions: string;
  resources: Resource[];
  evaluation: TaskEvaluation;
  order: number;
  data?: any;
}

export interface ScoringConfig {
  totalPoints: number;
  passingScore: number;
  timeBonus: boolean;
  qualityWeight: number;
  speedWeight: number;
  behavioralWeight: number;
  autoFailConditions: string[];
}

export interface SimulationSettings {
  allowPause: boolean;
  showTimer: boolean;
  randomizeTasks: boolean;
  allowHints: boolean;
  recordScreen: boolean;
  recordAudio: boolean;
  maxAttempts: number;
  timeLimit: number;
  environment: 'office' | 'remote' | 'field' | 'custom' | string;
  tools: string[];
  constraints: string[];
}

export interface ComplianceCheck {
  category: 'bias' | 'accessibility' | 'legal' | 'ethics' | 'technical';
  status: 'passed' | 'warning' | 'failed';
  issues: string[];
  recommendations: string[];
}

export interface SectionScore {
  id: string;
  name: string;
  minimumScore: number;
  weight: number;
}

export interface BehavioralMetric {
  id: string;
  name: string;
  minimumScore: number;
  type: 'communication' | 'collaboration' | 'adaptability' | 'leadership';
}

export interface QualityStandard {
  id: string;
  name: string;
  threshold: number;
  type: 'code_quality' | 'writing_quality' | 'presentation_quality';
}

export interface AutomatedRule {
  id: string;
  condition: string;
  action: 'pass' | 'fail' | 'review_required';
  priority: 'low' | 'medium' | 'high';
}

export interface PassFailCriteria {
  overallScore: { minimum: number; maximum: number };
  sectionScores: SectionScore[];
  criticalTasks: string[];
  behavioralMetrics: BehavioralMetric[];
  timeManagement: { completionRequired: boolean; timeBonus: boolean };
  qualityStandards: QualityStandard[];
  automatedRules: AutomatedRule[];
}

export interface DailyWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface AvailabilityConfig {
  startDate: string;
  endDate: string;
  dailyWindows: DailyWindow[];
  timezone: string;
  blackoutDates: string[];
  maxConcurrentCandidates: number;
  bufferTime: number;
  allowRescheduling: boolean;
  maxReschedules: number;
  noticePeriod: number;
}

export interface PracticeSimulation {
  enabled: boolean;
  type: 'full' | 'section' | 'timed' | 'untimed' | 'tutorial';
  difficulty: 'easier' | 'same' | 'adaptive';
  includeFeedback: boolean;
  maxAttempts: number;
  timeLimit?: number;
  instructions: string;
  resources: Resource[];
}

export interface Simulation {
  id: string;
  title: string;
  jobRole: string;
  jobId?: string;
  description: string;
  duration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  objectives: string[];
  tasks: SimulationTask[];
  scoring: ScoringConfig;
  settings: SimulationSettings;
  status: 'draft' | 'testing' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
  compliance: ComplianceCheck[];
  passFailCriteria?: PassFailCriteria;
  availability?: AvailabilityConfig;
  practiceEnabled?: boolean;
  practiceSimulation?: PracticeSimulation;
  metadata?: any;
}

export const defaultAvailability: AvailabilityConfig = {
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  dailyWindows: [
    { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', enabled: false },
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', enabled: true },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', enabled: true },
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', enabled: true },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', enabled: true },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', enabled: true },
    { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', enabled: false },
  ],
  timezone: 'UTC',
  blackoutDates: [],
  maxConcurrentCandidates: 10,
  bufferTime: 15,
  allowRescheduling: true,
  maxReschedules: 2,
  noticePeriod: 24,
};

export const STEPS = [
  { id: 1, title: 'Basics',        description: 'Define simulation fundamentals' },
  { id: 2, title: 'Objectives',    description: 'Set learning and assessment goals' },
  { id: 3, title: 'Tasks',         description: 'Design individual tasks and scenarios' },
  { id: 4, title: 'Scoring',       description: 'Configure evaluation criteria' },
  { id: 5, title: 'Pass/Fail',     description: 'Set passing standards and criteria' },
  { id: 6, title: 'Settings',      description: 'Environment and technical settings' },
  { id: 7, title: 'Availability',  description: 'Configure scheduling and access' },
  { id: 8, title: 'Practice',      description: 'Set up practice simulation options' },
  { id: 9, title: 'Publish',       description: 'Review and publish simulation' },
] as const;
