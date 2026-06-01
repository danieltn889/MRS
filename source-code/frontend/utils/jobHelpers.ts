// utils/jobHelpers.ts

interface CriteriaScores {
  skills_match?: number;
  experience_years_match?: number;
  location_match?: number;
  salary_match?: number;
  experience_level_match?: number;
  [key: string]: number | undefined;
}

interface MatchReason {
  type: 'positive' | 'warning' | 'improvement';
  text: string;
}

interface JobLocation {
  city?: string;
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
  title?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  locations?: JobLocation[];
  skills_required?: string[];
  published_at?: string;
  expires_at?: string;
  application_count?: number;
  job_type?: string;
  work_arrangement?: string;
  department?: string;
  experience_level?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  tags?: string[];
  screening_questions?: any[];
  status?: string;
  [key: string]: any;
}

interface CompanyData {
  name?: string;
  logo_url?: string;
  verification_badge?: boolean;
  industry?: string;
  size?: string;
  description?: string;
  [key: string]: any;
}

interface TransformedMatch {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  salary: string;
  matchScore: number;
  recommendation: string;
  // match level from AI (e.g. "Excellent Match 🌟", "Strong Match ✅")
  matchLevel: string;
  matchStars: string;
  matchRecommendation: string;
  skills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  // breakdowns from AI 4-factor engine
  skillsBreakdown: { matched_skills: string[]; missing_skills: string[]; total_required: number; total_matched: number } | null;
  experienceBreakdown: { candidate_years: number; job_min_years: number; gap_years: number } | null;
  qualificationsBreakdown: { candidate_degrees: string[]; candidate_fields: string[]; job_degree_required: string; degree_similarity: number; field_similarity: number } | null;
  description: string;
  publishedAt?: string;
  expiresAt?: string;
  postedDate: string;
  daysRemaining: string | null;
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiryStatusColor: string;
  applications: number;
  type?: string;
  workArrangement?: string;
  department?: string;
  experienceLevel?: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  tags: string[];
  criteriaScores: CriteriaScores;
  matchReasons: MatchReason[];
  screeningQuestions: any[];
  status?: string;
  companyVerificationBadge?: boolean;
  companyIndustry?: string;
  companySize?: string;
  companyDescription?: string;
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
  if (score >= 90) return 'text-green-600 bg-green-100';
  if (score >= 75) return 'text-blue-600 bg-blue-100';
  if (score >= 60) return 'text-yellow-600 bg-yellow-100';
  return 'text-gray-600 bg-gray-100';
};

export const getScoreColor = (score: number): string => {
  if (score >= 90) return 'bg-gradient-to-r from-green-400 to-green-600';
  if (score >= 75) return 'bg-gradient-to-r from-blue-400 to-blue-600';
  if (score >= 60) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
  return 'bg-gradient-to-r from-gray-400 to-gray-600';
};

export const transformMatchData = (
  match: any,
  formatNumberFn: (value: string | number | undefined | null) => string,
  formatDateFn: (dateString: string | undefined | null) => string,
  getDaysRemainingFn: (expiresAt: string | undefined | null) => string | null,
  getExpiryStatusColorFn: (expiresAt: string | undefined | null) => string
): TransformedMatch => {
  const jobData: JobData = match.job || {};
  const companyData: CompanyData = match.company || {};
  
  const salaryDisplay = match.salary_details?.min && match.salary_details?.max
    ? `${match.salary_details.currency} ${formatNumberFn(match.salary_details.min)} - ${formatNumberFn(match.salary_details.max)}/${match.salary_details.period}`
    : (jobData.salary_min && jobData.salary_max 
      ? `${jobData.salary_currency || 'USD'} ${formatNumberFn(jobData.salary_min)} - ${formatNumberFn(jobData.salary_max)}/${jobData.salary_period || 'year'}`
      : 'Salary not specified');
  
  let locationDisplay = 'Location not specified';
  const locations: JobLocation[] = jobData.locations || [];
  if (locations.length > 0) {
    const cities = locations.filter(l => l.city).map(l => l.city);
    if (cities.length > 0) locationDisplay = cities.join(', ');
    else if (locations.some(l => l.is_remote)) locationDisplay = 'Remote';
  }
  
  // ── AI 4-factor breakdowns (keyed exactly as ai_job_matcher.py returns them) ──
  const skillsBD       = match.skills_breakdown        || {};
  const expBD          = match.experience_breakdown    || null;
  const qualsBD        = match.qualifications_breakdown || null;

  const matchedSkillsList: string[] = skillsBD.matched_skills || match.skills?.matched_skills || [];
  const missingSkillsList: string[] = skillsBD.missing_skills || match.skills?.missing_skills || [];
  // all skills required by the job = matched + missing
  const allRequiredSkills: string[] = matchedSkillsList.length || missingSkillsList.length
    ? [...matchedSkillsList, ...missingSkillsList]
    : (match.skills?.required_skills || jobData.skills_required || []);

  // ── criteria_scores use the exact keys the AI returns ───────────────────────
  const criteria: CriteriaScores = match.criteria_scores || {};
  const skillsMatch        = criteria.skills_match        ?? 0;
  const qualsMatch         = criteria.qualifications_match ?? 0;
  const expMatch           = criteria.experience_match    ?? 0;
  const prefsMatch         = criteria.preferences_match   ?? 0;

  // ── Build matchReasons from the real AI criteria keys ───────────────────────
  const matchReasons: MatchReason[] = [];
  if (skillsMatch >= 70)
    matchReasons.push({ type: 'positive', text: `${skillsMatch.toFixed(0)}% of required skills matched` });
  if (matchedSkillsList.length > 0)
    matchReasons.push({ type: 'positive', text: `Matched: ${matchedSkillsList.slice(0, 4).join(', ')}` });
  if (missingSkillsList.length > 0)
    matchReasons.push({ type: 'improvement', text: `Gap skills: ${missingSkillsList.slice(0, 3).join(', ')}` });
  if (expMatch >= 90)
    matchReasons.push({ type: 'positive', text: 'Your experience meets the requirement' });
  else if (expBD && expBD.gap_years > 0)
    matchReasons.push({ type: 'warning', text: `${expBD.gap_years.toFixed(1)} yrs short of experience requirement` });
  if (qualsMatch >= 80)
    matchReasons.push({ type: 'positive', text: 'Your qualifications align with the role' });
  if (prefsMatch < 60)
    matchReasons.push({ type: 'warning', text: 'Job type or location may not match your preferences' });

  const publishedAt = jobData.published_at;
  const expiresAt   = jobData.expires_at;
  const daysRemaining = getDaysRemainingFn(expiresAt);
  const isExpired     = daysRemaining === 'Expired';
  const daysNum       = daysRemaining ? parseInt(daysRemaining) : NaN;
  const isExpiringSoon = !isExpired && !isNaN(daysNum) && daysNum <= 7;

  return {
    id:          jobData.id    || match.id,
    title:       jobData.title || match.title,
    company:     companyData.name || match.company,
    companyLogo: companyData.logo_url || match.companyLogo,
    location:    locationDisplay,
    salary:      salaryDisplay,
    matchScore:  match.match_score || 0,
    recommendation:     match.match_recommendation || 'Match found',
    // AI match level/stars (e.g. "Excellent Match 🌟", "⭐⭐⭐⭐⭐")
    matchLevel:         match.match_level          || '',
    matchStars:         match.match_stars          || '',
    matchRecommendation: match.match_recommendation || '',
    skills:        allRequiredSkills,
    matchedSkills: matchedSkillsList,
    missingSkills: missingSkillsList,
    skillsBreakdown:       skillsBD.total_required != null ? {
      matched_skills:  matchedSkillsList,
      missing_skills:  missingSkillsList,
      total_required:  skillsBD.total_required  || 0,
      total_matched:   skillsBD.total_matched   || 0,
    } : null,
    experienceBreakdown:   expBD,
    qualificationsBreakdown: qualsBD,
    description:     jobData.description || match.description || '',
    publishedAt,
    expiresAt,
    postedDate:      formatDateFn(publishedAt),
    daysRemaining,
    isExpired,
    isExpiringSoon,
    expiryStatusColor: getExpiryStatusColorFn(expiresAt),
    applications:    jobData.application_count || match.applications || 0,
    type:            jobData.job_type          || match.type,
    workArrangement: jobData.work_arrangement  || match.workArrangement,
    department:      jobData.department,
    experienceLevel: jobData.experience_level,
    responsibilities: jobData.responsibilities || match.responsibilities || [],
    requirements:     jobData.requirements     || match.requirements    || [],
    benefits:         jobData.benefits         || match.benefits        || [],
    tags:             jobData.tags             || [],
    criteriaScores:   match.criteria_scores    || {},
    matchReasons,
    screeningQuestions: jobData.screening_questions || match.screeningQuestions || [],
    status:                jobData.status,
    companyVerificationBadge: companyData.verification_badge,
    companyIndustry:   companyData.industry,
    companySize:       companyData.size,
    companyDescription: companyData.description,
    rawJob:  jobData,
    rawMatch: match,
  };
};