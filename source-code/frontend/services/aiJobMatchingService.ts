// services/aiJobMatchingService.ts

const API_GATEWAY_URL = 'http://localhost:8080/matcher';  // ← FIXED: Use gateway port 8080

interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type?: string;
  workArrangement?: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  screeningQuestions?: any[];
  expiresAt?: string;
  matchScore?: number;
  [key: string]: any;
}

interface CandidateInfo {
  name: string;
  level: string;
  total_experience_years: number;
  skills?: string[];
  [key: string]: any;
}

interface AIMatchResponse {
  success: boolean;
  error?: string;
  matches: JobMatch[];
  total_jobs_matched: number;
  candidate?: CandidateInfo;
}

interface SingleJobMatchResponse {
  success: boolean;
  error?: string;
  candidate?: CandidateInfo & { complete_profile?: any };
  match?: {
    match_score: number;
    match_level: string;
    criteria_scores: {
      skills_match: number;
      qualifications_match: number;
      experience_match: number;
      preferences_match: number;
    };
    skills_breakdown: {
      matched_skills: string[];
      missing_skills: string[];
      total_required: number;
      total_matched: number;
      individual_scores: number[];
    };
    qualifications_breakdown: {
      candidate_degrees: string[];
      candidate_fields: string[];
      candidate_combined: string[];
      job_degree_required: string;
      job_allowed_fields: string[];
      best_similarity: number;
      best_matched_field: string | null;
      match_type: string;
    };
    experience_breakdown: {
      match_type: string;
      total_requirements: number;
      matched_requirements: number;
      specific_matches: any[];
      unmatched_requirements: string[];
      total_years: number;
      required_years: number;
      gap_years: number;
    };
    preferences_breakdown: {
      missing_job_data: string[];
      type_match: number;
      type_match_details: any[];
      type_match_note?: string;
      remote_match: number;
      remote_match_note?: string;
      location_match: number;
      location_match_details: any;
      location_match_note?: string;
      industry_match: number;
      industry_match_details: any[];
      industry_match_note?: string;
      salary_match: number;
      salary_match_details: any;
      salary_match_note?: string;
      language_match: number;
      language_match_details: any[];
      language_match_note?: string;
      candidate_job_types: string[];
      candidate_locations: string[];
      candidate_industries: string[];
      candidate_languages: string[];
      candidate_salary_min: number;
      candidate_salary_max: number;
      candidate_remote_preference: string;
    };
    job: any;
  };
  timestamp?: string;
  performance?: {
    total_ms: number;
    cache_hits: number;
    cache_misses: number;
  };
}

/**
 * Get AI job matches for a candidate (matches against ALL jobs)
 * @param candidateId - The candidate's UUID
 * @returns Promise with all job matches
 */
export const getJobMatchesFromAI = async (candidateId: string): Promise<AIMatchResponse> => {
  console.log('🔍 AI Job Match Request Started for:', candidateId);
  
  if (!candidateId) {
    console.error('❌ Candidate ID is required');
    return {
      success: false,
      error: 'Candidate ID is required',
      matches: [],
      total_jobs_matched: 0
    };
  }
  
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: AIMatchResponse = await response.json();
    
    if (data.success && data.matches && data.matches.length > 0) {
      console.log(`✅ Found ${data.matches.length} job matches for candidate ${candidateId}`);
    } else {
      console.log(`⚠️ No job matches found for candidate ${candidateId}`);
    }
    
    return data;
    
  } catch (error: any) {
    console.error('❌ AI Job Match Failed:', error.message);
    
    return {
      success: false,
      error: error.message,
      matches: [],
      total_jobs_matched: 0
    };
  }
};

/**
 * Get AI match score for a specific candidate and job (matches against a SINGLE job)
 * @param candidateId - The candidate's UUID
 * @param jobId - The job's UUID
 * @returns Promise with match details for the specific job
 */
export const getJobMatchForCandidate = async (
  candidateId: string, 
  jobId: string
): Promise<SingleJobMatchResponse> => {
  console.log('🔍 AI Job Match Request Started for:', { candidateId, jobId });
  
  if (!candidateId) {
    console.error('❌ Candidate ID is required');
    return {
      success: false,
      error: 'Candidate ID is required'
    };
  }
  
  if (!jobId) {
    console.error('❌ Job ID is required');
    return {
      success: false,
      error: 'Job ID is required'
    };
  }
  
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match/job/${jobId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: SingleJobMatchResponse = await response.json();
    
    if (data.success && data.match) {
      console.log(`✅ Match score for job ${jobId}: ${data.match.match_score}%`);
    } else {
      console.log(`⚠️ No match found for candidate ${candidateId} and job ${jobId}`);
    }
    
    return data;
    
  } catch (error: any) {
    console.error('❌ AI Job Match Failed:', error.message);
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get AI job matches with timeout protection
 * @param candidateId - The candidate's UUID
 * @param timeoutMs - Timeout in milliseconds (default 60000 - increased to 60 seconds)
 * @returns Promise with job matches
 */
export const getJobMatchesFromAIWithTimeout = async (
  candidateId: string, 
  timeoutMs: number = 60000  // Increased from 30000 to 60000
): Promise<AIMatchResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: AIMatchResponse = await response.json();
    return data;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('❌ AI Job Match Failed:', error.message);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout - please try again',
        matches: [],
        total_jobs_matched: 0
      };
    }
    
    return {
      success: false,
      error: error.message,
      matches: [],
      total_jobs_matched: 0
    };
  }
};

/**
 * Get match score for a specific job with timeout
 * @param candidateId - The candidate's UUID
 * @param jobId - The job's UUID
 * @param timeoutMs - Timeout in milliseconds (default 60000 - increased to 60 seconds)
 * @returns Promise with match details
 */
export const getJobMatchForCandidateWithTimeout = async (
  candidateId: string,
  jobId: string,
  timeoutMs: number = 60000  // Increased from 30000 to 60000
): Promise<SingleJobMatchResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match/job/${jobId}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: SingleJobMatchResponse = await response.json();
    return data;
    
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('❌ AI Job Match Failed:', error.message);
    
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timeout - please try again'
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Transform match data for frontend display
 * @param match - The raw match object from AI service
 * @returns Transformed match data with readable format
 */
export const transformMatchData = (match: any) => {
  if (!match) return null;
  
  return {
    jobId: match.job?.id,
    jobTitle: match.job?.title,
    companyName: match.job?.company?.name || match.job?.company_name,
    matchScore: match.match_score || 0,
    matchLevel: match.match_level || 'Unknown',
    
    // Criteria scores
    skillsScore: match.criteria_scores?.skills_match || 0,
    qualificationsScore: match.criteria_scores?.qualifications_match || 0,
    experienceScore: match.criteria_scores?.experience_match || 0,
    preferencesScore: match.criteria_scores?.preferences_match || 0,
    
    // Skills breakdown
    matchedSkills: match.skills_breakdown?.matched_skills || [],
    missingSkills: match.skills_breakdown?.missing_skills || [],
    totalRequiredSkills: match.skills_breakdown?.total_required || 0,
    totalMatchedSkills: match.skills_breakdown?.total_matched || 0,
    
    // Qualifications breakdown
    candidateDegrees: match.qualifications_breakdown?.candidate_degrees || [],
    jobDegreeRequired: match.qualifications_breakdown?.job_degree_required || 'Not specified',
    qualificationMatchType: match.qualifications_breakdown?.match_type || 'none',
    
    // Experience breakdown
    totalExperienceYears: match.experience_breakdown?.total_years || 0,
    requiredExperienceYears: match.experience_breakdown?.required_years || 0,
    experienceGap: match.experience_breakdown?.gap_years || 0,
    
    // Preferences breakdown
    jobTypeMatch: match.preferences_breakdown?.type_match || 0,
    remoteMatch: match.preferences_breakdown?.remote_match || 0,
    locationMatch: match.preferences_breakdown?.location_match || 0,
    industryMatch: match.preferences_breakdown?.industry_match || 0,
    salaryMatch: match.preferences_breakdown?.salary_match || 0,
    languageMatch: match.preferences_breakdown?.language_match || 0,
    
    // Candidate preferences
    candidateJobTypes: match.preferences_breakdown?.candidate_job_types || [],
    candidateLocations: match.preferences_breakdown?.candidate_locations || [],
    candidateIndustries: match.preferences_breakdown?.candidate_industries || [],
    candidateLanguages: match.preferences_breakdown?.candidate_languages || [],
    candidateSalaryMin: match.preferences_breakdown?.candidate_salary_min || 0,
    candidateSalaryMax: match.preferences_breakdown?.candidate_salary_max || 0,
    candidateRemotePreference: match.preferences_breakdown?.candidate_remote_preference || 'flexible'
  };
};