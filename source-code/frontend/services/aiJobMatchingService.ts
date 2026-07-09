// services/aiJobMatchingService.ts
//
// Points at the combined feed (ai_job_matcher_og.py 70% + hybrid_job_recommender.py
// 30%, see source-code/ml/hybrid_job_recommender.py::combined_score_candidate),
// not ai_job_matcher_og.py directly. Every result carries its own "job" object
// (full details) plus a human-readable "reasons" list — the UI should show
// those reasons, not just a bare percentage.

const HYBRID_GATEWAY_URL = import.meta.env.VITE_HYBRID_GATEWAY_URL || 'http://localhost:8080/hybrid';
// Kept only for getJobMatchForCandidate (single-job match, used by
// ApplicationScreen/JobDetails) which the combined feed has no equivalent
// for yet — see aiJobMatchingService.ts's getJobMatchForCandidate.
const MATCHER_GATEWAY_URL = import.meta.env.VITE_ML_GATEWAY_URL || 'http://localhost:8080/matcher';
const AI_MATCH_TIMEOUT_MS = 300000;
// High enough to cover every currently-active, published job rather than
// just a top slice — the dashboard should show all active jobs with their
// score, not a truncated "top N". combined_score_candidate() still only
// returns however many active jobs actually exist, so this is a ceiling,
// not a target count.
const DEFAULT_FEED_TOP_N = 2000;

interface JobDetails {
  id: string;
  title: string;
  slug?: string | null;
  company_name: string;
  company_logo?: string | null;
  department?: string | null;
  job_type?: string | null;
  work_arrangement?: string | null;
  experience_level?: string | null;
  experience_min?: number | null;
  experience_max?: number | null;
  locations: Array<{ city?: string; country?: string; remote?: boolean }>;
  skills_required: Array<{ name: string; is_required?: boolean } | string>;
  skills_preferred: Array<{ name: string; is_required?: boolean } | string>;
  education_required?: Record<string, any>;
  qualifications?: string | null;
  description: string;
  language_requirements: Array<{ name: string; required?: boolean } | string>;
  screening_questions?: any[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
}

interface MatcherBreakdown {
  match_level?: string;
  criteria_scores?: {
    skills_match?: number;
    qualifications_match?: number;
    experience_match?: number;
    preferences_match?: number;
  };
  skills_breakdown?: {
    matched_skills?: string[];
    missing_skills?: string[];
    total_required?: number;
    total_matched?: number;
    individual_scores?: number[];
  };
  qualifications_breakdown?: Record<string, any>;
  experience_breakdown?: Record<string, any>;
  preferences_breakdown?: Record<string, any>;
  explanation?: string;
  improvement_suggestions?: string[];
}

interface ScoredJob {
  job_id: string;
  title: string;
  company: string;
  job?: JobDetails;
  total_score: number;
  matcher_score: number | null;
  hybrid_score: number | null;
  score_source: 'matcher+hybrid' | 'matcher-only' | 'hybrid-only';
  reasons: string[];
  // Full matcher 4-factor breakdown (null when score_source is "hybrid-only" —
  // the matcher had no data for this job, not a real zero).
  matcher_breakdown: MatcherBreakdown | null;
  // Full hybrid breakdown (null when score_source is "matcher-only" — hybrid
  // had no data for this job).
  hybrid_detail: HybridDetail | null;
}

// Full behavior/collaborative/freshness/popularity/business-rule breakdown
// from hybrid_job_recommender.py's score_candidate() — see its "detail" dict.
// null when the combined result came from the matcher alone (score_source
// "matcher-only") since hybrid had no data for that job.
interface HybridDetail {
  content: {
    matched_skills: string[];
    matched_education: string[];
    matched_languages: string[];
    candidate_experience_years: number | null;
    required_experience_years: number | null;
    semantic_encoder_available: boolean;
    candidate_age: number | null;
    job_age_requirement: string | null;
    age_fit_score: number;
    matched_terms_by_pair: Record<string, string[]>;
    tfidf_score_by_pair: Record<string, number>;
    semantic_score: number | null;
    final_score: number;
  };
  behavior: {
    matched_skills?: string[];
    matched_languages?: string[];
    matched_location?: string[];
    matched_title?: string[];
    content_similarity_score: number | null;
    content_similarity_tfidf: number | null;
    content_similarity_semantic: number | null;
    top_interacted_jobs: Array<{ title: string; company: string; weight: number }>;
    has_search_history: boolean;
    final_score: number;
  };
  collaborative: {
    trained: boolean;
    has_learned_embedding: boolean;
    raw_score: number;
    similar_candidates: Array<{ candidate_id: string; similarity: number }>;
    similar_candidates_engaged: boolean;
  };
  freshness: { score: number; days_old: number | null };
  popularity: { score: number; application_count: number; view_count: number };
  business_rules: { modifier: number; reasons: string[] };
}

interface CandidateInfo {
  name: string;
  level: string;
  total_experience_years: number;
  skills?: string[];
  [key: string]: any;
}

// /hybrid/score/combined has no "success" field — it returns the payload
// directly and signals failure via HTTP status (see hybrid_job_recommender.py's
// score_combined, which raises HTTPException rather than returning
// {success: false}). It also has no "candidate" field; candidate info comes
// from fetchFullCandidateProfile in DashboardHome.tsx instead.
interface CombinedFeedResponse {
  scored_jobs: ScoredJob[];
  total_jobs: number;
  cold_start: boolean;
  matcher_available: boolean;
  weights_used: { matcher: number; hybrid: number };
  interest_profile: Record<string, string[]>;
}

// Kept as an alias so any code still checking `.matches`/`.total_jobs_matched`
// (the old ai_job_matcher_og.py shape) doesn't need to change to compile —
// new code should read `.scored_jobs` directly. `success`/`error` are
// synthesized here since the combined feed itself has neither field.
type AIMatchResponse = CombinedFeedResponse & {
  success: boolean;
  error?: string;
  matches: ScoredJob[];
  total_jobs_matched: number;
};

function toAIMatchResponse(data: CombinedFeedResponse): AIMatchResponse {
  return { ...data, success: true, matches: data.scored_jobs, total_jobs_matched: data.total_jobs };
}

function emptyResponse(error: string): AIMatchResponse {
  return {
    success: false, error, scored_jobs: [], total_jobs: 0, cold_start: false,
    matcher_available: false, weights_used: { matcher: 0, hybrid: 0 }, interest_profile: {},
    matches: [], total_jobs_matched: 0,
  };
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
      match_quality?: string;
      explanation?: string;
    };
    experience_breakdown: {
      match_type: string;
      total_requirements: number;
      matched_requirements: number;
      specific_matches: any[];
      unmatched_requirements: string[];
      total_years: number;
      relevant_years?: number;
      experience_analysis?: Array<{
        title: string;
        company?: string;
        years: number;
        is_current?: boolean;
        similarity: number;
        matched_with?: string;
        contributes: boolean;
        technologies?: string[];
        reason?: string;
      }>;
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
    explanation?: string;
    improvement_suggestions?: string[];
    job: any;
    // Present only when this match came from getCombinedJobMatch (the
    // matcher 70% + hybrid 30% blend) rather than the matcher-only
    // getJobMatchForCandidate — undefined otherwise.
    matcher_score?: number | null;
    hybrid_score?: number | null;
    score_source?: 'matcher+hybrid' | 'matcher-only' | 'hybrid-only';
    reasons?: string[];
    // Full behavior/collaborative/freshness/popularity/business-rule breakdown
    // from the hybrid recommender — null when score_source is "matcher-only".
    hybrid_detail?: HybridDetail | null;
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
  console.log('🔍 Combined feed request started for:', candidateId);

  if (!candidateId) {
    console.error('❌ Candidate ID is required');
    return emptyResponse('Candidate ID is required');
  }

  try {
    const response = await fetch(`${HYBRID_GATEWAY_URL}/score/combined`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId, top_n: DEFAULT_FEED_TOP_N }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: CombinedFeedResponse = await response.json();

    if (data.scored_jobs && data.scored_jobs.length > 0) {
      console.log(`✅ Found ${data.scored_jobs.length} recommended jobs for candidate ${candidateId} (weights: matcher=${data.weights_used?.matcher}, hybrid=${data.weights_used?.hybrid})`);
    } else {
      console.log(`⚠️ No job matches found for candidate ${candidateId}`);
    }

    return toAIMatchResponse(data);

  } catch (error: any) {
    console.error('❌ Combined feed request failed:', error.message);
    return emptyResponse(error.message);
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
    const response = await fetch(`${MATCHER_GATEWAY_URL}/match/job/${jobId}`, {
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
 * Get the SAME combined score shown in the job feed (matcher 70% + hybrid
 * 30%, see hybrid_job_recommender.py::combined_score_candidate) for a single
 * job — used by job-detail pages so a candidate sees one consistent score
 * everywhere instead of a matcher-only number on "View Details" and a
 * blended number on the dashboard feed.
 */
export const getCombinedJobMatch = async (
  candidateId: string,
  jobId: string
): Promise<SingleJobMatchResponse> => {
  if (!candidateId) {
    return { success: false, error: 'Candidate ID is required' };
  }
  if (!jobId) {
    return { success: false, error: 'Job ID is required' };
  }

  try {
    const response = await fetch(`${HYBRID_GATEWAY_URL}/score/combined/job/${jobId}`, {
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

    const data = await response.json();
    const jm = data.job_match || {};
    // matcher_breakdown is null when score_source is "hybrid-only" — the
    // matcher never scored this job, so there is no 4-factor breakdown to show,
    // only the blended total + reasons (same graceful-degradation rule as the feed).
    const bd = jm.matcher_breakdown || null;

    console.log(`✅ Combined match score for job ${jobId}: ${jm.total_score}% (source: ${jm.score_source})`);

    return {
      success: true,
      match: {
        match_score: jm.total_score ?? 0,
        match_level: bd?.match_level || '',
        // null (not 0) when bd is null — lets callers tell "matcher never
        // scored this job" apart from "matcher scored it at 0%".
        criteria_scores: bd?.criteria_scores || {
          skills_match: null as any, qualifications_match: null as any,
          experience_match: null as any, preferences_match: null as any
        },
        skills_breakdown: bd?.skills_breakdown || {
          matched_skills: [], missing_skills: [], total_required: 0, total_matched: 0, individual_scores: []
        },
        qualifications_breakdown: bd?.qualifications_breakdown || {
          candidate_degrees: [], candidate_fields: [], candidate_combined: [], job_degree_required: '',
          job_allowed_fields: [], best_similarity: 0, best_matched_field: null, match_type: 'none'
        },
        experience_breakdown: bd?.experience_breakdown || {
          match_type: 'unknown', total_requirements: 0, matched_requirements: 0, specific_matches: [],
          unmatched_requirements: [], total_years: 0, required_years: 0, gap_years: 0
        },
        preferences_breakdown: bd?.preferences_breakdown || {
          missing_job_data: [], type_match: 0, type_match_details: [], remote_match: 0, location_match: 0,
          location_match_details: null, industry_match: 0, industry_match_details: [], salary_match: 0,
          salary_match_details: {}, language_match: 0, language_match_details: [], candidate_job_types: [],
          candidate_locations: [], candidate_industries: [], candidate_languages: [], candidate_salary_min: 0,
          candidate_salary_max: 0, candidate_remote_preference: 'flexible'
        },
        explanation: bd?.explanation,
        improvement_suggestions: bd?.improvement_suggestions,
        job: jm.job,
        matcher_score: jm.matcher_score,
        hybrid_score: jm.hybrid_score,
        score_source: jm.score_source,
        reasons: jm.reasons || [],
        hybrid_detail: jm.hybrid_detail || null,
      },
    };

  } catch (error: any) {
    console.error('❌ Combined job match failed:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get AI job matches with timeout protection
 * @param candidateId - The candidate's UUID
 * @param timeoutMs - Timeout in milliseconds (default 300000 - 5 minutes)
 * @returns Promise with job matches
 */
export const getJobMatchesFromAIWithTimeout = async (
  candidateId: string,
  timeoutMs: number = AI_MATCH_TIMEOUT_MS
): Promise<AIMatchResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${HYBRID_GATEWAY_URL}/score/combined`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId, top_n: DEFAULT_FEED_TOP_N }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: CombinedFeedResponse = await response.json();
    return toAIMatchResponse(data);

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('❌ Combined feed request failed:', error.message);

    if (error.name === 'AbortError') {
      return emptyResponse('AI matching is still loading. Please try again in a moment.');
    }

    return emptyResponse(error.message);
  }
};

/**
 * Get match score for a specific job with timeout
 * @param candidateId - The candidate's UUID
 * @param jobId - The job's UUID
 * @param timeoutMs - Timeout in milliseconds (default 300000 - 5 minutes)
 * @returns Promise with match details
 */
export const getJobMatchForCandidateWithTimeout = async (
  candidateId: string,
  jobId: string,
  timeoutMs: number = AI_MATCH_TIMEOUT_MS
): Promise<SingleJobMatchResponse> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`${MATCHER_GATEWAY_URL}/match/job/${jobId}`, {
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
        error: 'AI matching is still loading. Please try again in a moment.'
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

/**
 * Transform a scored job from the combined feed (/hybrid/score/combined) for
 * frontend display. Unlike transformMatchData, there is no fixed 4-factor
 * breakdown here — matcher_score/hybrid_score may each be null (one signal
 * unavailable) and reasons is the primary explanation surface.
 */
export const transformScoredJob = (scored: ScoredJob) => {
  if (!scored) return null;
  const job = scored.job;

  return {
    jobId: scored.job_id || job?.id,
    jobTitle: scored.title || job?.title,
    companyName: scored.company || job?.company_name,
    job,

    matchScore: Math.round(scored.total_score ?? 0),
    matcherScore: scored.matcher_score !== null && scored.matcher_score !== undefined ? Math.round(scored.matcher_score) : null,
    hybridScore: scored.hybrid_score !== null && scored.hybrid_score !== undefined ? Math.round(scored.hybrid_score) : null,
    scoreSource: scored.score_source,
    reasons: scored.reasons || [],
    matcherBreakdown: scored.matcher_breakdown,
  };
};
