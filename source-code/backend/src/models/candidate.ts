import { BaseEntity, UUID, TIMESTAMP, DATE, JSONB, EmploymentType } from './types.ts';
import { User } from './user.ts';
import { JobType } from './types.ts'; // Import JobType for job preferences

// =====================================================
// CANDIDATE PROFILE INTERFACES (FULLY CORRECTED)
// =====================================================

export interface CandidateProfile extends BaseEntity {
  user_id: UUID;
  first_name: string;
  last_name: string;
  phone?: string;
  country?: string;
  city?: string;
  timezone?: string;
  date_of_birth?: DATE;
  gender?: string;
  profile_photo_url?: string;
  profile_photo_key?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  website_url?: string;
  willing_to_relocate: boolean;
  willing_to_travel: boolean;
  notice_period_days?: number;
  current_salary?: CandidateSalary;
  expected_salary?: CandidateSalary;
  currency: string;
  profile_completion: number; // 0-100
  headline?: string;
  summary?: string;
  
  // CORRECTED: Specific types instead of generic JSONB
  languages: Language[];
  privacy_settings: PrivacySettings;
  job_preferences: JobPreferences;
  availability: Availability;
  metadata: Record<string, any>;

  // Relationships
  user?: User;
  education?: Education[];
  workExperience?: WorkExperience[];
  skills?: UserSkill[];
  resumes?: Resume[];
  portfolioLinks?: PortfolioLink[];
}

// =====================================================
// SUPPORTING TYPES FOR CANDIDATE PROFILE
// =====================================================

interface CandidateSalary {
  amount: number;
  currency?: string;
  period?: 'hour'| 'month'| 'year';
  is_negotiable?: boolean;
}

export interface Language {
  language: string;
  proficiency: 'basic'| 'conversational'| 'professional'| 'native'| 'fluent';
  is_primary?: boolean;
  certification?: string;
}

export interface PrivacySettings {
  profile_visibility: 'public'| 'private'| 'connections_only'| 'recruiters_only';
  show_contact_info: boolean;
  show_current_employer: boolean;
  data_sharing_consent: boolean;
  show_salary_expectations?: boolean;
  allow_messages?: boolean;
}

export interface JobPreferences {
  job_types: JobType[];
  locations: string[];
  remote_preference: 'any'| 'remote'| 'hybrid'| 'onsite';
  industries: string[];
  company_sizes: string[];
  employment_types: EmploymentType[];
  desired_salary?: CandidateSalary;
  preferred_countries?: string[];
  open_to_remote_worldwide?: boolean;
}

type CandidateEmploymentType = 'full-time'| 'part-time'| 'contract'| 'internship'| 'freelance'| 'temporary';

export interface Availability {
  status: 'not_looking'| 'actively_looking'| 'open_to_offers'| 'passive'| 'interviewing';
  available_from?: DATE;
  notice_period?: number; // in days
  open_to_opportunities: boolean;
  preferred_start_date?: DATE;
  is_immediately_available?: boolean;
}

// =====================================================
// EDUCATION INTERFACE (CORRECTED)
// =====================================================

export interface Education extends BaseEntity {
  user_id: UUID;
  institution: string;
  institution_id?: string;
  degree: string;
  field_of_study: string;
  start_date: DATE;
  end_date?: DATE;
  is_current: boolean;
  grade?: string;
  grade_scale?: string;
  description?: string;
  activities?: string;
  skills?: string[];
  attachments: EducationAttachment[];
  
  // CORRECTED: verification_date should be TIMESTAMP, not DATE
  verified: boolean;
  verification_method?: string;
  verification_date?: TIMESTAMP; // Changed from DATE to TIMESTAMP
  
  display_order: number;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  user?: User;
}

export interface EducationAttachment {
  url: string;
  name: string;
  type: string;
  verified?: boolean;
}

// =====================================================
// WORK EXPERIENCE INTERFACE (CORRECTED)
// =====================================================

export interface WorkExperience extends BaseEntity {
  user_id: UUID;
  company: string;
  company_id?: string;
  title: string;
  employment_type: CandidateEmploymentType;
  location?: string;
  location_type?: 'onsite'| 'hybrid'| 'remote';
  start_date: DATE;
  end_date?: DATE;
  is_current: boolean;
  description?: string;
  achievements?: string[];
  skills?: string[];
  industry?: string;
  team_size?: number;
  reports_to?: string;
  reason_for_leaving?: string;
  
  // CORRECTED: verification_date should be TIMESTAMP, not DATE
  verified: boolean;
  verification_method?: string;
  verification_date?: TIMESTAMP; // Changed from DATE to TIMESTAMP
  
  display_order: number;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  user?: User;
}

// =====================================================
// SKILLS INTERFACES (CORRECTED)
// =====================================================

export interface Skill extends BaseEntity {
  id: UUID;
  name: string;
  category?: string;
  subcategory?: string;
  skill_type: 'technical'| 'soft'| 'language'| 'certification'| 'tool';
  is_verified: boolean;
  verification_source?: string;
  metadata: Record<string, any>;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  userSkills?: UserSkill[];
}

export interface UserSkill {
  user_id: UUID;
  skill_id: UUID;
  proficiency_level: ProficiencyLevel; // 1-5
  proficiency_label: ProficiencyLabel; // Generated from proficiency_level
  years_experience?: number;
  months_experience?: number; // Generated from years_experience
  is_primary: boolean;
  last_used?: DATE;
  skill_context?: string;
  verified: boolean;
  verification_evidence?: VerificationEvidence;
  endorsement_count: number;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  user?: User;
  skill?: Skill;
}

export type ProficiencyLevel = 1 | 2 | 3 | 4 | 5;

export type ProficiencyLabel = 'Beginner'| 'Intermediate'| 'Advanced'| 'Expert'| 'Master';

export interface VerificationEvidence {
  certificate_url?: string;
  issuer?: string;
  issue_date?: DATE;
  expiry_date?: DATE;
  verification_id?: string;
  blockchain_tx_id?: string;
}

// =====================================================
// RESUME INTERFACE (CORRECTED)
// =====================================================

export interface Resume extends BaseEntity {
  id: UUID;
  user_id: UUID;
  file_name: string;
  file_key: string;
  file_url?: string;
  file_size?: number;
  mime_type?: string;
  is_primary: boolean;
  version: number;
  parsed_data?: ParsedResumeData;
  parsing_confidence?: number; // DECIMAL(3,2) in DB - number is fine
  skills_extracted?: string[];
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  user?: User;
}

export interface ParsedResumeData {
  personal_info?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
  };
  skills?: string[];
  experience?: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date?: string;
    description: string;
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field: string;
    graduation_date: string;
  }>;
  certifications?: string[];
  languages?: string[];
  parsing_errors?: string[];
}

// =====================================================
// PORTFOLIO LINK INTERFACE (CORRECTED)
// =====================================================

export interface PortfolioLink extends BaseEntity {
  id: UUID;
  user_id: UUID;
  platform: string;
  url: string;
  title?: string;
  description?: string;
  thumbnail_url?: string;
  metadata?: PortfolioMetadata;
  is_verified: boolean;
  verification_date?: TIMESTAMP; // TIMESTAMP, not DATE
  display_order: number;
  created_at: TIMESTAMP;
  updated_at: TIMESTAMP;

  // Relationships
  user?: User;
}

export interface PortfolioMetadata {
  embed_code?: string;
  view_count?: number;
  like_count?: number;
  tags?: string[];
  project_type?: string;
  technologies?: string[];
  github_repo?: string;
  live_demo_url?: string;
}

// =====================================================
// ADDITIONAL HELPER TYPES
// =====================================================

export interface ProfileCompletionBreakdown {
  personal_info: number;
  education: number;
  work_experience: number;
  skills: number;
  resume: number;
  portfolio: number;
  total: number;
  missing_required_fields: string[];
}

export interface CandidateSearchFilters {
  skills?: string[];
  experience_min?: number;
  experience_max?: number;
  location?: string;
  remote_only?: boolean;
  job_types?: JobType[];
  availability?: Availability['status'][];
  min_profile_completion?: number;
  salary_expectation_max?: number;
  industries?: string[];
  languages?: string[];
}

export interface CandidateSortOptions {
  field: 'relevance'| 'experience'| 'profile_completion'| 'recent_activity';
  direction: 'asc'| 'desc';
}

// =====================================================
// TYPE GUARDS AND UTILITIES
// =====================================================

export function isProfileComplete(profile: CandidateProfile): boolean {
  return profile.profile_completion >= 80;
}

export function isActivelyLooking(profile: CandidateProfile): boolean {
  return profile.availability.status === 'actively_looking'|| 
         profile.availability.open_to_opportunities === true;
}

export function getPrimarySkill(userSkills: UserSkill[]): UserSkill | undefined {
  return userSkills.find(skill => skill.is_primary === true);
}

export function getTopSkills(userSkills: UserSkill[], limit: number = 5): UserSkill[] {
  return [...userSkills]
    .sort((a, b) => b.proficiency_level - a.proficiency_level)
    .slice(0, limit);
}

export function getYearsOfExperience(workExperience: WorkExperience[]): number {
  let totalYears = 0;
  
  workExperience.forEach(exp => {
    const start = new Date(exp.start_date);
    const end = exp.end_date && !exp.is_current ? new Date(exp.end_date) : new Date();
    const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    totalYears += years;
  });
  
  return Math.round(totalYears * 10) / 10;
}

export function calculateProfileCompletion(profile: Partial<CandidateProfile>): number {
  let score = 0;
  let totalFields = 0;
  
  // Required fields check
  const requiredFields = ['first_name', 'last_name', 'headline'];
  const optionalFields = ['summary', 'phone', 'linkedin_url', 'github_url', 'portfolio_url'];
  
  requiredFields.forEach(field => {
    totalFields++;
    if (profile[field as keyof CandidateProfile]) score++;
  });
  
  optionalFields.forEach(field => {
    totalFields++;
    if (profile[field as keyof CandidateProfile]) score++;
  });
  
  // Skills check
  totalFields++;
  if (profile.skills && (profile.skills as UserSkill[]).length > 0) score++;
  
  // Education check
  totalFields++;
  if (profile.education && (profile.education as Education[]).length > 0) score++;
  
  // Work experience check
  totalFields++;
  if (profile.workExperience && (profile.workExperience as WorkExperience[]).length > 0) score++;
  
  // Resume check
  totalFields++;
  if (profile.resumes && (profile.resumes as Resume[]).length > 0) score++;
  
  return Math.round((score / totalFields) * 100);
}

// =====================================================
// DATABASE TO TYPESCRIPT MAPPING VALIDATION
// =====================================================

// This ensures TypeScript interfaces match PostgreSQL columns
export const CandidateProfileDBMapping = {
  user_id: 'user_id',
  first_name: 'first_name',
  last_name: 'last_name',
  phone: 'phone',
  country: 'country',
  city: 'city',
  timezone: 'timezone',
  date_of_birth: 'date_of_birth',
  gender: 'gender',
  profile_photo_url: 'profile_photo_url',
  profile_photo_key: 'profile_photo_key',
  linkedin_url: 'linkedin_url',
  github_url: 'github_url',
  portfolio_url: 'portfolio_url',
  website_url: 'website_url',
  willing_to_relocate: 'willing_to_relocate',
  willing_to_travel: 'willing_to_travel',
  notice_period_days: 'notice_period_days',
  current_salary: 'current_salary',
  expected_salary: 'expected_salary',
  currency: 'currency',
  profile_completion: 'profile_completion',
  headline: 'headline',
  summary: 'summary',
  languages: 'languages',
  privacy_settings: 'privacy_settings',
  job_preferences: 'job_preferences',
  availability: 'availability',
  metadata: 'metadata',
  created_at: 'created_at',
  updated_at: 'updated_at'
} as const;