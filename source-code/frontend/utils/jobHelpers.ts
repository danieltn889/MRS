// utils/jobHelpers.ts

interface CriteriaScores {
  skills_match?: number;
  qualifications_match?: number;
  experience_match?: number;
  preferences_match?: number;
  [key: string]: number | undefined;
}

interface MatchReason {
  type: 'positive' | 'warning' | 'improvement';
  text: string;
}

interface JobLocation {
  city?: string;
  country?: string;
  state?: string;
  postal_code?: string;
  is_remote?: boolean;
  [key: string]: any;
}

interface SalaryDetails {
  min?: number;
  max?: number;
  currency?: string;
  period?: string;
}

interface SkillsInfo {
  required_skills?: string[];
  matched_skills?: string[];
  missing_skills?: string[];
}

interface JobData {
  id?: string;
  external_id?: string;
  title?: string;
  slug?: string;
  description?: string;
  summary?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  salary_visible?: boolean;
  locations?: JobLocation[];
  skills_required?: any[];
  skills_preferred?: any[];
  published_at?: string;
  expires_at?: string;
  created_at?: string;
  updated_at?: string;
  application_count?: number;
  view_count?: number;
  job_type?: string;
  work_arrangement?: string;
  department?: string;
  team?: string;
  experience_level?: string;
  experience_min?: number;
  experience_max?: number;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  tags?: string[];
  screening_questions?: any[];
  status?: string;
  visibility?: string;
  education_required?: any;
  education_requirements?: any;
  language_requirements?: any[];
  experience_requirements?: any[];
  application_instructions?: string;
  documents?: any[];
  department_info?: string;
  application_limit?: number;
  ai_match_required_score?: number;
  metadata?: any;
  [key: string]: any;
}

interface CompanyData {
  id?: string;
  name?: string;
  legal_name?: string;
  slug?: string;
  logo_url?: string;
  banner_url?: string;
  verification_badge?: boolean;
  verification_status?: string;
  verification_level?: string;
  industry?: string;
  industries?: string[];
  size?: string;
  founded_year?: number;
  headquarters?: any;
  website?: string;
  description?: string;
  short_description?: string;
  mission?: string;
  vision?: string;
  values?: any[];
  culture?: any;
  social_links?: any;
  domain?: string;
  [key: string]: any;
}

interface SkillsBreakdown {
  matched_skills?: string[];
  missing_skills?: string[];
  total_required?: number;
  total_matched?: number;
  individual_scores?: number[];
}

interface ExperienceBreakdown {
  match_type?: string;
  total_years?: number;
  required_years?: number;
  required_min_years?: number;
  required_max_years?: number;
  gap_years?: number;
  total_requirements?: number;
  matched_requirements?: number;
  specific_matches?: any[];
  unmatched_requirements?: string[];
}

interface QualificationsBreakdown {
  candidate_degrees?: string[];
  candidate_fields?: string[];
  candidate_combined?: string[];
  job_degree_required?: string;
  job_allowed_fields?: string[];
  best_similarity?: number;
  best_matched_field?: string;
  match_type?: string;
}

interface PreferencesBreakdown {
  missing_job_data?: string[];
  type_match?: number;
  remote_match?: number;
  location_match?: number;
  industry_match?: number;
  salary_match?: number;
  language_match?: number;
  type_match_details?: any[];
  location_match_details?: any;
  industry_match_details?: any[];
  salary_match_details?: any;
  language_match_details?: any[];
}

interface TransformedMatch {
  id: string;
  external_id?: string;
  slug?: string;
  title: string;
  company: string;
  companyLogo?: string;
  companyBanner?: string;
  companyVerified?: boolean;
  companyVerificationStatus?: string;
  companyIndustry?: string;
  companyIndustries?: string[];
  companySize?: string;
  companyFoundedYear?: number;
  companyHeadquarters?: any;
  companyWebsite?: string;
  companyDescription?: string;
  companyShortDescription?: string;
  companyMission?: string;
  companyVision?: string;
  companyValues?: any[];
  companyCulture?: any;
  location: string;
  locations?: JobLocation[];
  salary: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
  salaryVisible?: boolean;
  matchScore: number;
  recommendation: string;
  matchLevel: string;
  matchStars: string;
  matchRecommendation: string;
  skills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  skillsRequired?: any[];
  skillsPreferred?: any[];
  skillsBreakdown: SkillsBreakdown | null;
  experienceBreakdown: ExperienceBreakdown | null;
  qualificationsBreakdown: QualificationsBreakdown | null;
  preferencesBreakdown: PreferencesBreakdown | null;
  description: string;
  summary?: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  tags: string[];
  department?: string;
  team?: string;
  jobType?: string;
  workArrangement?: string;
  experienceLevel?: string;
  experienceMin?: number;
  experienceMax?: number;
  educationRequired?: any;
  educationRequirements?: any;
  languageRequirements?: any[];
  experienceRequirements?: any[];
  screeningQuestions: any[];
  applicationInstructions?: string;
  requiredDocuments?: any[];
  departmentInfo?: string;
  applicationLimit?: number;
  aiMatchRequiredScore?: number;
  publishedAt?: string;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
  postedDate: string;
  daysRemaining: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiryStatusColor: string;
  applications: number;
  viewCount?: number;
  status?: string;
  visibility?: string;
  metadata?: any;
  criteriaScores: CriteriaScores;
  matchReasons: MatchReason[];
  companyVerificationBadge?: boolean;
  rawJob: JobData;
  rawMatch: any;
}

export const formatNumber = (value: string | number | undefined | null): string => {
  if (!value) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString();
};

export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not specified';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString();
};

export const formatFullDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'Not specified';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getDaysRemaining = (expiresAt: string | undefined | null): string | null => {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expired';
  if (diffDays === 0) return 'Last day today!';
  if (diffDays === 1) return '1 day left';
  return `${diffDays} days left`;
};

export const getExpiryStatusColor = (expiresAt: string | undefined | null): string => {
  if (!expiresAt) return 'text-gray-500 bg-gray-100';
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-600 bg-red-100';
  if (diffDays <= 3) return 'text-orange-600 bg-orange-100';
  if (diffDays <= 7) return 'text-yellow-600 bg-yellow-100';
  return 'text-green-600 bg-green-100';
};

export const getMatchColor = (score: number): string => {
  if (score >= 90) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 75) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export const getScoreColor = (score: number): string => {
  if (score >= 90) return 'bg-gradient-to-r from-green-400 to-green-600';
  if (score >= 75) return 'bg-gradient-to-r from-blue-400 to-blue-600';
  if (score >= 60) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
  if (score >= 40) return 'bg-gradient-to-r from-orange-400 to-orange-600';
  return 'bg-gradient-to-r from-gray-400 to-gray-600';
};

// Helper to extract skill name from skill object
const getSkillName = (skill: any): string => {
  if (typeof skill === 'string') return skill;
  if (skill && typeof skill === 'object') {
    return skill.name || skill.skill_name || skill.title || '';
  }
  return '';
};

// Helper to parse JSON fields that might be strings
const parseJsonField = (field: any): any => {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object') return field;
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch {
      return field;
    }
  }
  return field;
};

export const transformMatchData = (
  match: any,
  formatNumberFn: (value: string | number | undefined | null) => string,
  formatDateFn: (dateString: string | undefined | null) => string,
  getDaysRemainingFn: (expiresAt: string | undefined | null) => string | null,
  getExpiryStatusColorFn: (expiresAt: string | undefined | null) => string
): TransformedMatch => {
  // Extract job data (could be at match.job or match directly)
  const jobData: JobData = match.job || match;
  const companyData: CompanyData = jobData.company || {};
  
  // Parse JSON fields that might be strings
  const locations = parseJsonField(jobData.locations) || [];
  const skillsRequired = parseJsonField(jobData.skills_required) || [];
  const skillsPreferred = parseJsonField(jobData.skills_preferred) || [];
  const responsibilities = parseJsonField(jobData.responsibilities) || [];
  const requirements = parseJsonField(jobData.requirements) || [];
  const benefits = parseJsonField(jobData.benefits) || [];
  const tags = parseJsonField(jobData.tags) || [];
  const screeningQuestions = parseJsonField(jobData.screening_questions) || [];
  const educationRequired = parseJsonField(jobData.education_required) || {};
  const languageRequirements = parseJsonField(jobData.language_requirements) || [];
  const experienceRequirements = parseJsonField(jobData.experience_requirements) || [];
  const metadata = parseJsonField(jobData.metadata) || {};
  
  // Company JSON fields
  const companyIndustries = parseJsonField(companyData.industries) || [];
  const companyHeadquarters = parseJsonField(companyData.headquarters) || {};
  const companyValues = parseJsonField(companyData.values) || [];
  const companyCulture = parseJsonField(companyData.culture) || {};
  
  // Build salary display
  const salaryMin = jobData.salary_min;
  const salaryMax = jobData.salary_max;
  const salaryCurrency = jobData.salary_currency || 'Rwf';
  const salaryPeriod = jobData.salary_period || 'month';
  
  let salaryDisplay = 'Salary not specified';
  if (salaryMin && salaryMax) {
    salaryDisplay = `${salaryCurrency} ${formatNumberFn(salaryMin)} - ${formatNumberFn(salaryMax)} ${salaryPeriod === 'year' ? '/year' : salaryPeriod === 'month' ? '/month' : ''}`;
  } else if (salaryMin) {
    salaryDisplay = `${salaryCurrency} ${formatNumberFn(salaryMin)}+ ${salaryPeriod === 'year' ? '/year' : '/month'}`;
  } else if (salaryMax) {
    salaryDisplay = `${salaryCurrency} Up to ${formatNumberFn(salaryMax)} ${salaryPeriod === 'year' ? '/year' : '/month'}`;
  }
  
  // Build location display
  let locationDisplay = 'Location not specified';
  if (locations && locations.length > 0) {
    const locationStrings = locations.map((loc: JobLocation) => {
      if (loc.city && loc.country) return `${loc.city}, ${loc.country}`;
      if (loc.city) return loc.city;
      if (loc.country) return loc.country;
      return null;
    }).filter(Boolean);
    if (locationStrings.length > 0) {
      locationDisplay = locationStrings.join(', ');
    } else if (locations.some((loc: JobLocation) => loc.is_remote)) {
      locationDisplay = 'Remote';
    }
  }
  
  // Extract skills
  const allRequiredSkills: string[] = skillsRequired.map(getSkillName).filter(Boolean);
  const allPreferredSkills: string[] = skillsPreferred.map(getSkillName).filter(Boolean);
  const allSkills = [...allRequiredSkills, ...allPreferredSkills];
  
  // AI breakdowns
  const skillsBD = match.skills_breakdown || {};
  const expBD = match.experience_breakdown || null;
  const qualsBD = match.qualifications_breakdown || null;
  const prefsBD = match.preferences_breakdown || null;
  
  const matchedSkillsList: string[] = skillsBD.matched_skills || match.matchedSkills || [];
  const missingSkillsList: string[] = skillsBD.missing_skills || match.missingSkills || [];
  
  // Criteria scores
  const criteria: CriteriaScores = match.criteria_scores || {};
  const skillsMatch = criteria.skills_match ?? 0;
  const qualsMatch = criteria.qualifications_match ?? 0;
  const expMatch = criteria.experience_match ?? 0;
  const prefsMatch = criteria.preferences_match ?? 0;
  
  // Build match reasons
  const matchReasons: MatchReason[] = [];
  
  if (skillsMatch >= 70) {
    matchReasons.push({ type: 'positive', text: `${skillsMatch.toFixed(0)}% of required skills matched` });
  }
  if (matchedSkillsList.length > 0) {
    matchReasons.push({ type: 'positive', text: `Matched: ${matchedSkillsList.slice(0, 4).join(', ')}` });
  }
  if (missingSkillsList.length > 0) {
    matchReasons.push({ type: 'improvement', text: `Gap skills: ${missingSkillsList.slice(0, 3).join(', ')}` });
  }
  if (expMatch >= 90) {
    matchReasons.push({ type: 'positive', text: 'Your experience meets the requirement' });
  } else if (expBD && expBD.gap_years && expBD.gap_years > 0) {
    matchReasons.push({ type: 'warning', text: `${expBD.gap_years.toFixed(1)} yrs short of experience requirement` });
  }
  if (qualsMatch >= 80) {
    matchReasons.push({ type: 'positive', text: 'Your qualifications align with the role' });
  }
  if (qualsBD && qualsBD.best_matched_field) {
    matchReasons.push({ type: 'positive', text: `Qualification match: ${qualsBD.best_matched_field}` });
  }
  if (prefsMatch < 60 && prefsMatch > 0) {
    matchReasons.push({ type: 'warning', text: 'Job type or location may not match your preferences' });
  }
  
  // Date handling
  const publishedAt = jobData.published_at;
  const expiresAt = jobData.expires_at;
  const createdAt = jobData.created_at;
  const updatedAt = jobData.updated_at;
  
  const daysRemaining = getDaysRemainingFn(expiresAt);
  const isExpired = daysRemaining === 'Expired';
  const daysNum = daysRemaining ? parseInt(daysRemaining) : NaN;
  const isExpiringSoon = !isExpired && !isNaN(daysNum) && daysNum <= 7;
  
  // Match level stars
  const matchLevel = match.match_level || '';
  let matchStars = '⭐⭐⭐';
  if (matchLevel.includes('Excellent')) matchStars = '🌟🌟🌟🌟🌟';
  else if (matchLevel.includes('Strong')) matchStars = '🌟🌟🌟🌟';
  else if (matchLevel.includes('Good')) matchStars = '🌟🌟🌟';
  else if (matchLevel.includes('Partial')) matchStars = '🌟🌟';
  else matchStars = '⭐';
  
  return {
    // Basic job info
    id: jobData.id || match.id,
    external_id: jobData.external_id,
    slug: jobData.slug,
    title: jobData.title || match.title || 'Unknown Position',
    company: companyData.name || jobData.company_name || match.company || 'Unknown Company',
    companyLogo: companyData.logo_url || jobData.company_logo_url,
    companyBanner: companyData.banner_url || jobData.company_banner_url,
    companyVerified: companyData.verification_badge || jobData.company_verified || false,
    companyVerificationStatus: companyData.verification_status || jobData.company_verification_status,
    companyIndustry: companyData.industry || jobData.company_industry,
    companyIndustries: companyIndustries,
    companySize: companyData.size || jobData.company_size,
    companyFoundedYear: companyData.founded_year || jobData.company_founded_year,
    companyHeadquarters: companyHeadquarters,
    companyWebsite: companyData.website || jobData.company_website,
    companyDescription: companyData.description || jobData.company_description,
    companyShortDescription: companyData.short_description || jobData.company_short_description,
    companyMission: companyData.mission || jobData.company_mission,
    companyVision: companyData.vision || jobData.company_vision,
    companyValues: companyValues,
    companyCulture: companyCulture,
    
    // Location
    location: locationDisplay,
    locations: locations,
    
    // Salary
    salary: salaryDisplay,
    salaryMin: salaryMin,
    salaryMax: salaryMax,
    salaryCurrency: salaryCurrency,
    salaryPeriod: salaryPeriod,
    salaryVisible: jobData.salary_visible,
    
    // AI Match
    matchScore: match.match_score || 0,
    recommendation: match.match_recommendation || 'Match found',
    matchLevel: matchLevel,
    matchStars: matchStars,
    matchRecommendation: match.match_recommendation || '',
    
    // Skills
    skills: allSkills,
    matchedSkills: matchedSkillsList,
    missingSkills: missingSkillsList,
    skillsRequired: skillsRequired,
    skillsPreferred: skillsPreferred,
    skillsBreakdown: skillsBD.total_required != null ? {
      matched_skills: matchedSkillsList,
      missing_skills: missingSkillsList,
      total_required: skillsBD.total_required || 0,
      total_matched: skillsBD.total_matched || 0,
      individual_scores: skillsBD.individual_scores || []
    } : null,
    
    // Experience
    experienceBreakdown: expBD,
    experienceMin: jobData.experience_min,
    experienceMax: jobData.experience_max,
    experienceLevel: jobData.experience_level,
    experienceRequirements: experienceRequirements,
    
    // Qualifications
    qualificationsBreakdown: qualsBD,
    educationRequired: educationRequired,
    educationRequirements: parseJsonField(jobData.education_requirements),
    languageRequirements: languageRequirements,
    
    // Preferences
    preferencesBreakdown: prefsBD,
    
    // Content
    description: jobData.description || match.description || '',
    summary: jobData.summary,
    responsibilities: responsibilities,
    requirements: requirements,
    benefits: benefits,
    tags: tags,
    
    // Job metadata
    department: jobData.department,
    team: jobData.team,
    jobType: jobData.job_type,
    workArrangement: jobData.work_arrangement,
    
    // Application
    screeningQuestions: screeningQuestions,
    applicationInstructions: jobData.application_instructions,
    requiredDocuments: parseJsonField(jobData.documents),
    departmentInfo: jobData.department_info,
    applicationLimit: jobData.application_limit,
    aiMatchRequiredScore: jobData.ai_match_required_score,
    
    // Dates
    publishedAt: publishedAt,
    expiresAt: expiresAt,
    createdAt: createdAt,
    updatedAt: updatedAt,
    postedDate: formatDateFn(publishedAt),
    daysRemaining: daysRemaining,
    isExpired: isExpired,
    isExpiringSoon: isExpiringSoon,
    expiryStatusColor: getExpiryStatusColorFn(expiresAt),
    
    // Counts
    applications: jobData.application_count || match.applications || 0,
    viewCount: jobData.view_count || 0,
    
    // Status
    status: jobData.status,
    visibility: jobData.visibility,
    metadata: metadata,
    
    // Criteria scores
    criteriaScores: criteria,
    matchReasons: matchReasons,
    companyVerificationBadge: companyData.verification_badge || jobData.company_verified,
    
    // Raw data
    rawJob: jobData,
    rawMatch: match,
  };
};