import { BaseEntity, UUID, TIMESTAMP, JSONB, JobStatus, JobType, JobVisibility } from './types.ts';
import { Company } from './company.ts';
import { Application } from './application.ts';
import { Simulation } from './simulation.ts';
import { User } from './user.ts';

// =====================================================
// JOB INTERFACES (FULLY CORRECTED)
// =====================================================

export interface Job extends BaseEntity {
  id: UUID;
  company_id: UUID;
  external_id?: string;
  title: string;
  slug?: string;
  department?: string;
  team?: string;
  job_type: JobType;
  work_arrangement: 'remote' | 'hybrid' | 'onsite' | 'flexible';
  locations?: JobLocation[];
  description: string;
  summary?: string;
  
  // CORRECTED: responsibilities should be array, not string (matches DB JSONB[])
  responsibilities?: string[];
  
  qualifications?: string;
  preferred_qualifications?: string;
  
  // CORRECTED: requirements should have specific type
  requirements?: JobRequirements;
  
  salary_min?: number;
  salary_max?: number;
  salary_currency: string;
  salary_period: 'hour' | 'month' | 'year';
  salary_visible: boolean;
  
  // CORRECTED: benefits should have specific type
  benefits: JobBenefit[];
  
  // CORRECTED: skills fields should have specific types
  skills_required?: JobSkill[];
  skills_preferred?: JobSkill[];
  
  experience_min?: number;
  experience_max?: number;
  experience_level: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  
  // CORRECTED: education_required should have specific type
  education_required?: EducationRequirement;
  
  // CORRECTED: screening_questions should have specific type
  screening_questions: ScreeningQuestion[];
  
  application_instructions?: string;
  
  // CORRECTED: documents should have specific type
  documents: JobDocument[];
  
  department_info?: string;
  tags?: string[];
  application_limit?: number;
  status: JobStatus;
  visibility: JobVisibility;
  published_at?: TIMESTAMP;
  expires_at?: TIMESTAMP;
  paused_at?: TIMESTAMP;
  closed_at?: TIMESTAMP;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;
  created_by?: UUID;
  approved_by?: UUID;
  approved_at?: TIMESTAMP;
  view_count: number;
  application_count: number;
  metadata: JobMetadata;

  // Relationships
  company?: Company;
  createdBy?: User;
  approvedBy?: User;
  applications?: Application[];
  simulations?: Simulation[];
  savedJobs?: SavedJob[];
  applicationsTracking?: JobApplicationsTracking;
}

// =====================================================
// JOB SUPPORTING TYPES
// =====================================================

export interface JobLocation {
  city: string;
  country: string;
  state?: string;
  postal_code?: string;
  address?: string;
  is_remote?: boolean;
  remote_type?: 'fully_remote' | 'hybrid' | 'onsite_required';
  latitude?: number;
  longitude?: number;
}

export interface JobRequirements {
  minimum_education?: string;
  minimum_experience_years?: number;
  required_certifications?: string[];
  required_languages?: Array<{
    language: string;
    proficiency: 'basic' | 'conversational' | 'professional' | 'native';
  }>;
  specific_requirements?: string[];
  nice_to_have?: string[];
}

export interface JobBenefit {
  type: 'health' | 'dental' | 'vision' | 'retirement' | 'pto' | 'remote' | 'equity' | 'bonus' | 'education' | 'wellness' | 'other';
  name: string;
  description?: string;
  is_mandatory?: boolean;
  value?: string | number;
}

export interface JobSkill {
  skill_id?: UUID;
  name: string;
  proficiency_level: 1 | 2 | 3 | 4 | 5;
  is_required: boolean;
  importance: 'nice-to-have' | 'preferred' | 'required';
  years_experience_required?: number;
}

// =====================================================
// EDUCATION REQUIREMENT - FULLY CORRECTED FOR FRONTEND
// =====================================================

export interface EducationRequirement {
  // Basic education fields
  minimum_degree?: string;
  preferred_degree?: string;
  fields_of_study?: string[];
  is_degree_required?: boolean;
  certifications?: string[];
  additional_requirements?: string[];
  
  // ===== FRONTEND CUSTOM FIELDS (from JobPostingScreen) =====
  languages?: LanguageRequirement[];
  experience_requirements?: ExperienceRequirementItem[];
  age_requirement?: string;
  no_experience_needed?: boolean;
  no_languages_needed?: boolean;
  no_certifications_needed?: boolean;
  no_documents_needed?: boolean;
}

export interface LanguageRequirement {
  id?: string;
  name: string;
  proficiency: 'basic' | 'conversational' | 'professional' | 'native';
  is_required: boolean;
}

export interface ExperienceRequirementItem {
  id?: string;
  title: string;
  years: string;
  description?: string;
}

export interface ScreeningQuestion {
  id?: string;
  question: string;
  type: 'text' | 'multiple_choice' | 'yes_no' | 'number' | 'date' | 'file';
  required: boolean;
  options?: string[];
  max_length?: number;
  min_value?: number;
  max_value?: number;
  help_text?: string;
  scoring_weight?: number;
  correct_answer?: string | string[] | boolean | number;
}

export interface JobDocument {
  type: 'job_description' | 'requirements' | 'benefits' | 'company_info' | 'other';
  name: string;
  url: string;
  key: string;
  size?: number;
  mime_type?: string;
}

export interface JobMetadata {
  is_urgent?: boolean;
  is_remote_worldwide?: boolean;
  visa_sponsorship_available?: boolean;
  relocation_assistance?: boolean;
  hiring_budget?: {
    min: number;
    max: number;
    currency: string;
  };
  target_start_date?: string;
  team_size?: number;
  reporting_to?: string;
  internal_notes?: string;
  approval_workflow_id?: UUID;
  source?: string;
  campaign_id?: string;
}

// =====================================================
// SAVED JOB INTERFACE
// =====================================================

export interface SavedJob {
  user_id: UUID;
  job_id: UUID;
  saved_at: TIMESTAMP;
  notes?: string;
  tags?: string[];
  priority: 'high' | 'medium' | 'low';
  folder?: string;
  notified: boolean;
  user?: User;
  job?: Job;
}

// =====================================================
// JOB APPLICATIONS TRACKING
// =====================================================

export interface JobApplicationsTracking {
  job_id: UUID;
  application_count: number;
  last_application_at?: TIMESTAMP;
  daily_application_count: DailyApplicationCount[];
  source_breakdown: SourceBreakdown;
  updated_at: TIMESTAMP;
  job?: Job;
}

export interface DailyApplicationCount {
  date: string;
  count: number;
  qualified?: number;
  disqualified?: number;
}

export interface SourceBreakdown {
  [source: string]: {
    count: number;
    percentage: number;
    conversion_rate?: number;
  };
}

// =====================================================
// ADDITIONAL JOB-RELATED TYPES
// =====================================================

export interface JobFilters {
  company_id?: UUID[];
  status?: JobStatus[];
  job_type?: JobType[];
  work_arrangement?: ('remote' | 'hybrid' | 'onsite' | 'flexible')[];
  location?: string[];
  department?: string[];
  experience_level?: ('entry' | 'mid' | 'senior' | 'lead' | 'executive')[];
  salary_min?: number;
  salary_max?: number;
  tags?: string[];
  date_posted?: 'today' | 'week' | 'month' | 'any';
  remote_only?: boolean;
  skills?: string[];
  hide_expired?: boolean;
}

export interface JobSortOptions {
  field: 'relevance' | 'date' | 'salary' | 'applications' | 'title';
  direction: 'asc' | 'desc';
}

export interface JobStats {
  total_views: number;
  total_applications: number;
  unique_viewers: number;
  average_time_to_fill_days?: number;
  application_conversion_rate: number;
  top_sources: SourceBreakdown;
  applications_over_time: DailyApplicationCount[];
  demographic_breakdown?: {
    experience_levels: Record<string, number>;
    locations: Record<string, number>;
  };
}

export interface JobWithCompany extends Job {
  company: Company;
  company_logo_url?: string;
  company_name: string;
}

// =====================================================
// JOB CREATION/UPDATE DTOs
// =====================================================

export interface CreateJobDTO {
  company_id: UUID;
  title: string;
  description: string;
  job_type: JobType;
  work_arrangement: Job['work_arrangement'];
  locations?: JobLocation[];
  department?: string;
  team?: string;
  summary?: string;
  responsibilities?: string[];
  qualifications?: string;
  preferred_qualifications?: string;
  requirements?: JobRequirements;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: Job['salary_period'];
  salary_visible?: boolean;
  benefits?: JobBenefit[];
  skills_required?: JobSkill[];
  skills_preferred?: JobSkill[];
  experience_min?: number;
  experience_max?: number;
  experience_level?: Job['experience_level'];
  education_required?: EducationRequirement;
  screening_questions?: ScreeningQuestion[];
  application_instructions?: string;
  tags?: string[];
  application_limit?: number;
  visibility?: JobVisibility;
  expires_at?: TIMESTAMP;
  metadata?: JobMetadata;
}

export interface UpdateJobDTO extends Partial<CreateJobDTO> {
  status?: JobStatus;
  paused_at?: TIMESTAMP;
  closed_at?: TIMESTAMP;
}

// =====================================================
// TYPE GUARDS AND UTILITIES - FIXED
// =====================================================

export function isJobActive(job: Job): boolean {
  // Use type assertion to compare with string literal
  return (job.status as string) === 'active' && 
         (!job.expires_at || new Date(job.expires_at) > new Date());
}

export function isJobRemote(job: Job): boolean {
  return job.work_arrangement === 'remote' || 
         (job.locations?.some(loc => loc.is_remote === true) ?? false);
}

export function getJobSalary(job: Job): string {
  if (!job.salary_min && !job.salary_max) return 'Salary not specified';
  
  const currency = job.salary_currency || 'USD';
  const period = job.salary_period === 'year' ? '/year' : 
                 job.salary_period === 'month' ? '/month' : '/hour';
  
  if (job.salary_min && job.salary_max) {
    return `${currency} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}${period}`;
  } else if (job.salary_min) {
    return `${currency} ${job.salary_min.toLocaleString()}+${period}`;
  } else if (job.salary_max) {
    return `${currency} Up to ${job.salary_max.toLocaleString()}${period}`;
  }
  
  return 'Salary not specified';
}

export function getRequiredSkills(job: Job): JobSkill[] {
  return job.skills_required?.filter(skill => skill.is_required === true) ?? [];
}

export function getMatchingScore(job: Job, userSkills: { skill_id: UUID; proficiency_level: number }[]): number {
  if (!job.skills_required || job.skills_required.length === 0) return 100;
  
  let totalScore = 0;
  let maxScore = 0;
  
  job.skills_required.forEach(requiredSkill => {
    const weight = requiredSkill.importance === 'required' ? 3 :
                   requiredSkill.importance === 'preferred' ? 2 : 1;
    maxScore += weight;
    
    const userSkill = userSkills.find(s => s.skill_id === requiredSkill.skill_id);
    if (userSkill && userSkill.proficiency_level >= requiredSkill.proficiency_level) {
      totalScore += weight;
    } else if (userSkill) {
      totalScore += (userSkill.proficiency_level / requiredSkill.proficiency_level) * weight;
    }
  });
  
  return Math.round((totalScore / maxScore) * 100);
}

// =====================================================
// EDUCATION REQUIREMENT HELPER FUNCTIONS
// =====================================================

export function getJobLanguages(job: Job): LanguageRequirement[] {
  return job.education_required?.languages ?? [];
}

export function getJobExperienceRequirements(job: Job): ExperienceRequirementItem[] {
  return job.education_required?.experience_requirements ?? [];
}

export function getJobAgeRequirement(job: Job): string | undefined {
  return job.education_required?.age_requirement;
}

export function isNoExperienceNeeded(job: Job): boolean {
  return job.education_required?.no_experience_needed ?? false;
}

export function isNoLanguagesNeeded(job: Job): boolean {
  return job.education_required?.no_languages_needed ?? false;
}

export function isNoCertificationsNeeded(job: Job): boolean {
  return job.education_required?.no_certifications_needed ?? false;
}

export function isNoDocumentsNeeded(job: Job): boolean {
  return job.education_required?.no_documents_needed ?? false;
}

export function getEducationMinimumDegree(job: Job): string | undefined {
  return job.education_required?.minimum_degree;
}

export function getCertifications(job: Job): string[] {
  return job.education_required?.certifications ?? [];
}

// =====================================================
// DATABASE TO TYPESCRIPT MAPPING VALIDATION
// =====================================================

export const JobDBMapping = {
  id: 'id',
  company_id: 'company_id',
  external_id: 'external_id',
  title: 'title',
  slug: 'slug',
  department: 'department',
  team: 'team',
  job_type: 'job_type',
  work_arrangement: 'work_arrangement',
  locations: 'locations',
  description: 'description',
  summary: 'summary',
  responsibilities: 'responsibilities',
  qualifications: 'qualifications',
  preferred_qualifications: 'preferred_qualifications',
  requirements: 'requirements',
  salary_min: 'salary_min',
  salary_max: 'salary_max',
  salary_currency: 'salary_currency',
  salary_period: 'salary_period',
  salary_visible: 'salary_visible',
  benefits: 'benefits',
  skills_required: 'skills_required',
  skills_preferred: 'skills_preferred',
  experience_min: 'experience_min',
  experience_max: 'experience_max',
  experience_level: 'experience_level',
  education_required: 'education_required',
  screening_questions: 'screening_questions',
  application_instructions: 'application_instructions',
  documents: 'documents',
  department_info: 'department_info',
  tags: 'tags',
  application_limit: 'application_limit',
  status: 'status',
  visibility: 'visibility',
  published_at: 'published_at',
  expires_at: 'expires_at',
  paused_at: 'paused_at',
  closed_at: 'closed_at',
  created_at: 'created_at',
  updated_at: 'updated_at',
  created_by: 'created_by',
  approved_by: 'approved_by',
  approved_at: 'approved_at',
  view_count: 'view_count',
  application_count: 'application_count',
  metadata: 'metadata'
} as const;

export const JobApplicationsTrackingDBMapping = {
  job_id: 'job_id',
  application_count: 'application_count',
  last_application_at: 'last_application_at',
  daily_application_count: 'daily_application_count',
  source_breakdown: 'source_breakdown',
  updated_at: 'updated_at'
} as const;