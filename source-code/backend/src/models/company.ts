import { BaseEntity, UUID, TIMESTAMP, JSONB, VerificationStatus } from './types.ts';
import { User } from './user.ts';
import { Job } from './job.ts';
import { Application, BlacklistedCandidate } from './application.ts';

export interface Company extends BaseEntity {
  name: string;
  legal_name?: string;
  slug?: string;
  industry?: string;
  industries?: string[];
  size?: string;
  founded_year?: number;
  headquarters_location?: JSONB;
  website?: string;
  description?: string;
  short_description?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  culture?: JSONB;
  logo_url?: string;
  logo_key?: string;
  banner_url?: string;
  banner_key?: string;
  social_links?: JSONB;
  verification_status: VerificationStatus;
  verification_badge: boolean;
  verification_level?: string;
  verified_at?: TIMESTAMP;
  verified_by?: UUID;
  domain?: string;
  tax_id?: string;
  registration_number?: string;
  created_by?: UUID;

  // Relationships
  createdBy?: User;
  verifiedBy?: User;
  locations?: CompanyLocation[];
  companyCulture?: CompanyCulture;
  team?: CompanyTeam[];
  projects?: CompanyProject[];
  policies?: CompanyPolicy;
  contacts?: CompanyContact[];
  verification?: CompanyVerification[];
  jobs?: Job[];
  blacklistedCandidates?: BlacklistedCandidate[];
}

export interface CompanyLocation extends BaseEntity {
  company_id: UUID;
  name?: string;
  type: 'headquarters'| 'branch'| 'remote_hub'| 'coworking'| 'office';
  address_line1?: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  hours?: JSONB;
  amenities?: string[];
  photos?: string[];
  is_hiring: boolean;
  employee_count?: number;

  // Relationships
  company?: Company;
}

export interface CompanyCulture {
  company_id: UUID;
  attributes: JSONB;
  values: JSONB;
  description?: string;
  work_environment?: string;
  team_dynamics?: string;
  communication_style?: string;
  decision_making?: string;
  work_life_balance?: string;
  diversity_info?: string;
  inclusion_info?: string;
  employee_testimonials: JSONB;
  awards: JSONB;
  updated_at: TIMESTAMP;

  // Relationships
  company?: Company;
}

export interface CompanyTeam extends BaseEntity {
  company_id: UUID;
  user_id?: UUID;
  name: string;
  title: string;
  department?: string;
  email?: string;
  phone?: string;
  bio?: string;
  expertise?: string[];
  photo_url?: string;
  photo_key?: string;
  social_links?: JSONB;
  linkedin_url?: string;
  display_on_profile: boolean;
  is_leadership: boolean;
  display_order: number;

  // Relationships
  company?: Company;
  user?: User;
}

export interface CompanyProject extends BaseEntity {
  company_id: UUID;
  name: string;
  client?: string;
  client_industry?: string;
  timeframe?: JSONB;
  project_type?: string;
  description?: string;
  challenge?: string;
  solution?: string;
  results?: JSONB;
  technologies?: string[];
  skills?: string[];
  media: JSONB;
  featured: boolean;
  team_members?: UUID[];

  // Relationships
  company?: Company;
}

export interface CompanyPolicy {
  company_id: UUID;
  work_hours: JSONB;
  remote_policy: JSONB;
  time_off: JSONB;
  benefits: JSONB;
  performance_review: JSONB;
  dress_code?: string;
  equipment: JSONB;
  updated_at: TIMESTAMP;

  // Relationships
  company?: Company;
}

export interface CompanyContact extends BaseEntity {
  company_id: UUID;
  contact_type: 'general'| 'hr'| 'support'| 'press'| 'legal'| 'billing';
  contact_method: 'email'| 'phone'| 'form'| 'chat';
  contact_value: string;
  is_primary: boolean;
  department?: string;
  hours?: JSONB;
  verified: boolean;
  notes?: string;

  // Relationships
  company?: Company;
}

export interface CompanyVerification extends BaseEntity {
  company_id: UUID;
  verification_level: 'basic'| 'standard'| 'enhanced'| 'premium';
  documents: JSONB;
  submitted_at: TIMESTAMP;
  reviewed_at?: TIMESTAMP;
  reviewed_by?: UUID;
  status: 'pending'| 'approved'| 'rejected'| 'info_needed';
  rejection_reason?: string;
  reviewer_notes?: string;
  expires_at?: TIMESTAMP;

  // Relationships
  company?: Company;
  reviewedBy?: User;
}

export interface ApprovalWorkflow extends BaseEntity {
  company_id: UUID;
  workflow_type: string;
  name: string;
  description?: string;
  steps: JSONB;
  approvers: JSONB;
  conditions: JSONB;
  is_active: boolean;
  created_by: UUID;

  // Relationships
  company?: Company;
  createdBy?: User;
}