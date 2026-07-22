import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Briefcase, MapPin, Clock, DollarSign, Building2, Calendar,
  CheckCircle, XCircle, AlertCircle, Bookmark, Share2,
  ChevronLeft, ExternalLink, GraduationCap, Award, Users,
  Sparkles, Target, Shield, Brain, Zap, Loader2,
  TrendingUp, TrendingDown, AlertTriangle, Info,
  Code, Heart, Globe, Star, User, List, FileText, Layers,
  ChevronUp, ChevronDown  // ← Add these
} from 'lucide-react';
import { getJob } from '../../services/jobAPI';
import { saveJob, unsaveJob, isJobSaved } from '../../services/jobStorageService';
import appliedJobsManager from '../../src/utils/AppliedJobsManager';
import JobApplicationModal from './JobApplicationModal';
import { getCombinedJobMatch } from '../../services/aiJobMatchingService';
import { useFeedTracker } from '../../hooks/useFeedTracker';

interface JobDetails {
  id: string;
  title: string;
  company_name: string;
  company_logo?: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skills_required: Array<{ name: string; proficiency_level?: number; is_required?: boolean }> | string[];
  skills_preferred?: Array<{ name: string; proficiency_level?: number }> | string[];
  benefits: string[];
  job_type: string;
  work_arrangement: string;
  location: string | { city: string; country: string; is_remote: boolean };
  locations?: Array<{ city: string; country: string; is_remote: boolean }>;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  salary_period: string;
  experience_min: number;
  experience_max: number;
  experience_level: string;
  education_required: {
    minimum_degree: string;
    fields_of_study: string[];
    certifications: string[];
    languages?: Array<{ name: string; proficiency: string; is_required: boolean }>;
    experience_requirements?: Array<{ title: string; years: string; description: string }>;
    age_requirement?: string;
    is_degree_required: boolean;
    no_experience_needed?: boolean;
    no_languages_needed?: boolean;
    no_certifications_needed?: boolean;
  };
  department: string;
  published_at: string;
  expires_at: string;
  application_count: number;
  status: string;
  screening_questions?: Array<{ question: string; required: boolean; type?: string }>;
  tags?: string[];
  company_industry?: string;
  company_size?: string;
  company_website?: string;
}

interface MatchDetails {
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
    match_quality?: string;   // ← add this
    explanation?: string;     // ← add this
  };
  experience_breakdown: {
    match_type: string;
    total_requirements: number;
    matched_requirements: number;
    specific_matches: any[];
    unmatched_requirements: Array<{ title: string; years_required: number }>;
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
    type_match: number;
    remote_match: number;
    location_match: number;
    industry_match: number;
    salary_match: number;
    language_match: number;
    candidate_job_types: string[];
    candidate_locations: string[];
    candidate_industries: string[];
    candidate_languages: string[];
    candidate_salary_min: number;
    candidate_salary_max: number;
    candidate_remote_preference: string;
    missing_job_data: string[];
    type_match_details?: any[];
    type_match_note?: string | null;
    remote_match_note?: string | null;
    location_match_details?: any;
    location_match_note?: string | null;
    industry_match_details?: any[];
    industry_match_note?: string | null;
    salary_match_details?: any;
    salary_match_note?: string | null;
    language_match_details?: any[];
    language_match_note?: string | null;
  };
  explanation?: string;
  improvement_suggestions?: string[];
  // Combined feed fields (matcher 70% + hybrid 30%, see
  // hybrid_job_recommender.py::combined_score_candidate)   match_score above
  // is now this blended total, not the matcher's raw score. The 4-factor
  // criteria_scores/skills_breakdown/etc. above are only real when
  // hasBreakdown is true (score_source is "matcher+hybrid" or "matcher-only");
  // for "hybrid-only" jobs they're zeroed placeholders and should be hidden.
  matcher_score?: number | null;
  hybrid_score?: number | null;
  score_source?: 'matcher+hybrid'| 'matcher-only'| 'hybrid-only';
  reasons?: string[];
  hasBreakdown?: boolean;
  // Full behavior/collaborative/freshness/popularity/business-rule breakdown
  // from hybrid_job_recommender.py's score_candidate()   null when
  // score_source is "matcher-only" (hybrid had no data for this job).
  hybrid_detail?: {
    content: {
      matched_skills: string[];
      matched_education: string[];
      matched_languages: string[];
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
  } | null;
}

const JobDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { trackView } = useFeedTracker();
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [fullCandidateProfile, setFullCandidateProfile] = useState<any>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  // Employer's minimum AI match score to be allowed to apply (reuses the existing
  // jobs.ai_match_required_score field   no new schema).
  const [requiredScore, setRequiredScore] = useState<number | null>(null);
  const [isLoadingMatch, setIsLoadingMatch] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    skills: true,
    qualifications: true,
    experience: true,
    preferences: true
  });

  useEffect(() => {
    if (id) {
      initJobAndMatch();
      checkIfSaved();
      checkIfApplied();
      // Landing here counts as viewing the job regardless of entry point
      // (Job Feed, Header search, Saved Jobs "View Details")   the Job Feed
      // card already tracks its own view on click (see DashboardHome.tsx's
      // handleViewDetails), but those other entry points navigate straight
      // here without ever recording one, so it's tracked once per job id here.
      trackView(id, 0);
    }
  }, [id]);

  // The combined-match response already carries the full job record
  // (job_details_dict() in hybrid_job_recommender.py bundles it with the
  // score specifically so job-detail pages don't need a second round trip),
  // so job details are sourced from THAT call for a logged-in candidate
  // instead of a separate GET /jobs/:id. loadJobDetails() below is only a
  // fallback for anonymous viewers or when the match call fails/returns
  // nothing.
  const initJobAndMatch = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;

      if (!token || !user?.id) {
        await loadJobDetails();
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'}/candidates/full-profile/${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let gotJobFromMatch = false;
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setFullCandidateProfile(data.data);
          gotJobFromMatch = await loadMatchScore(user.id);
        }
      }
      if (!gotJobFromMatch) {
        await loadJobDetails();
      }
    } catch (error) {
      console.error('Error loading candidate profile:', error);
      await loadJobDetails();
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetails = async () => {
    try {
      const response = await getJob(id!);
      let jobData = response?.data?.data || response?.data || response;
      setJob(jobData);
    } catch (err: any) {
      console.error('Error loading job details:', err);
      setError(err.message || 'Failed to load job details');
    }
  };

  const checkIfSaved = async () => {
    try {
      const saved = await isJobSaved(id!);
      setIsSaved(saved);
    } catch (error) {
      console.error('Error checking saved status:', error);
    }
  };

  const checkIfApplied = () => {
    const applied = appliedJobsManager.getAllAppliedJobs().includes(id!);
    setHasApplied(applied);
  };

  // Returns whether it successfully sourced the job record from the match
  // response, so the caller knows whether it still needs the getJob()
  // fallback.
  const loadMatchScore = async (candidateId: string): Promise<boolean> => {
    if (!candidateId || !id) {
      console.log('Cannot load match score - missing candidate or job ID');
      return false;
    }

    setIsLoadingMatch(true);
    setMatchError(null);

    try {
      const result = await getCombinedJobMatch(candidateId, id);

      if (result.success && result.match) {
        const jobFromMatch = (result.match as any).job;
        if (jobFromMatch) setJob(jobFromMatch);
        setMatchScore(result.match.match_score);
        setRequiredScore(
          (result.match as any).job?.ai_match_required_score ??
          (job as any)?.ai_match_required_score ??
          null
        );
        setMatchDetails({
          match_score: result.match.match_score,
          match_level: result.match.match_level,
          criteria_scores: result.match.criteria_scores,
          skills_breakdown: {
            matched_skills: result.match.skills_breakdown?.matched_skills || [],
            missing_skills: result.match.skills_breakdown?.missing_skills || [],
            total_required: result.match.skills_breakdown?.total_required || 0,
            total_matched: result.match.skills_breakdown?.total_matched || 0,
            individual_scores: result.match.skills_breakdown?.individual_scores || []
          },
          qualifications_breakdown: {
            candidate_degrees: result.match.qualifications_breakdown?.candidate_degrees || [],
            candidate_fields: result.match.qualifications_breakdown?.candidate_fields || [],
            candidate_combined: result.match.qualifications_breakdown?.candidate_combined || [],
            job_degree_required: result.match.qualifications_breakdown?.job_degree_required || '',
            job_allowed_fields: result.match.qualifications_breakdown?.job_allowed_fields || [],
            best_similarity: result.match.qualifications_breakdown?.best_similarity || 0,
            best_matched_field: result.match.qualifications_breakdown?.best_matched_field || '',
            match_type: result.match.qualifications_breakdown?.match_type || 'none',
            match_quality: result.match.qualifications_breakdown?.match_quality,  //  Good
            explanation: result.match.qualifications_breakdown?.explanation         //  Good
          },
          experience_breakdown: {
            match_type: result.match.experience_breakdown?.match_type || 'unknown',
            total_requirements: result.match.experience_breakdown?.total_requirements || 0,
            matched_requirements: result.match.experience_breakdown?.matched_requirements || 0,
            specific_matches: result.match.experience_breakdown?.specific_matches || [],
            unmatched_requirements: result.match.experience_breakdown?.unmatched_requirements || [],
            total_years: result.match.experience_breakdown?.total_years || 0,
            relevant_years: result.match.experience_breakdown?.relevant_years ?? 0,
            experience_analysis: result.match.experience_breakdown?.experience_analysis || [],
            required_years: result.match.experience_breakdown?.required_years || 0,
            gap_years: result.match.experience_breakdown?.gap_years || 0
          },
          preferences_breakdown: {
            type_match: result.match.preferences_breakdown?.type_match || 0,
            remote_match: result.match.preferences_breakdown?.remote_match || 0,
            location_match: result.match.preferences_breakdown?.location_match || 0,
            industry_match: result.match.preferences_breakdown?.industry_match || 0,
            salary_match: result.match.preferences_breakdown?.salary_match || 0,
            language_match: result.match.preferences_breakdown?.language_match || 0,
            candidate_job_types: result.match.preferences_breakdown?.candidate_job_types || [],
            candidate_locations: result.match.preferences_breakdown?.candidate_locations || [],
            candidate_industries: result.match.preferences_breakdown?.candidate_industries || [],
            candidate_languages: result.match.preferences_breakdown?.candidate_languages || [],
            candidate_salary_min: result.match.preferences_breakdown?.candidate_salary_min || 0,
            candidate_salary_max: result.match.preferences_breakdown?.candidate_salary_max || 0,
            candidate_remote_preference: result.match.preferences_breakdown?.candidate_remote_preference || 'flexible',
            missing_job_data: result.match.preferences_breakdown?.missing_job_data || [],
            // "What the candidate has vs what the job requires" detail for
            // every dimension, plus a human-readable note when a dimension
            // was excluded (job didn't state a requirement) or the candidate
            // has no data for it -- previously only type/location were
            // passed through, so Industry/Salary/Language showed a bare
            // percentage with no explanation of what produced it.
            type_match_details: result.match.preferences_breakdown?.type_match_details,
            type_match_note: (result.match.preferences_breakdown as any)?.type_match_note,
            remote_match_note: (result.match.preferences_breakdown as any)?.remote_match_note,
            location_match_details: result.match.preferences_breakdown?.location_match_details,
            location_match_note: (result.match.preferences_breakdown as any)?.location_match_note,
            industry_match_details: (result.match.preferences_breakdown as any)?.industry_match_details,
            industry_match_note: (result.match.preferences_breakdown as any)?.industry_match_note,
            salary_match_details: (result.match.preferences_breakdown as any)?.salary_match_details,
            salary_match_note: (result.match.preferences_breakdown as any)?.salary_match_note,
            language_match_details: (result.match.preferences_breakdown as any)?.language_match_details,
            language_match_note: (result.match.preferences_breakdown as any)?.language_match_note,
          },
          explanation: (result.match as any).explanation || '',
          improvement_suggestions: (result.match as any).improvement_suggestions || [],
          matcher_score: result.match.matcher_score,
          hybrid_score: result.match.hybrid_score,
          score_source: result.match.score_source,
          reasons: result.match.reasons || [],
          hasBreakdown: result.match.criteria_scores?.skills_match != null || result.match.criteria_scores?.qualifications_match != null,
          // Behavior/Collaborative/Freshness/Popularity/Business-rules
          // breakdown   null when score_source is "matcher-only".
          hybrid_detail: (result.match as any).hybrid_detail || null
        });

        console.log('AI Match score loaded:', result.match.match_score);
        return !!jobFromMatch;
      } else {
        console.log('No match score available:', result.error);
        setMatchError(result.error || 'AI match score unavailable for this job right now.');
        return false;
      }
    } catch (error: any) {
      console.error('Error loading match score:', error);
      setMatchError(error?.message || 'AI match score unavailable for this job right now.');
      return false;
    } finally {
      setIsLoadingMatch(false);
    }
  };

  const handleSaveJob = async () => {
    try {
      if (isSaved) {
        await unsaveJob(id!);
        setIsSaved(false);
        alert('Job removed from saved!');
      } else {
        await saveJob(id!);
        setIsSaved(true);
        alert('Job saved successfully!');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to update saved status');
    }
  };

  const handleApplyNow = () => {
    if (!fullCandidateProfile) {
      alert('Please complete your profile before applying.');
      navigate('/dashboard?view=profile');
      return;
    }
    setShowApplicationModal(true);
  };

  // Auto-open the application when arriving with ?apply=1 (e.g. from Saved Jobs),
  // once the candidate profile has loaded.
  const autoApplyDone = useRef(false);
  useEffect(() => {
    if (autoApplyDone.current) return;
    const wantsApply = new URLSearchParams(window.location.search).get('apply') === '1';
    if (wantsApply && fullCandidateProfile) {
      autoApplyDone.current = true;
      setShowApplicationModal(true);
    }
  }, [fullCandidateProfile]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  };

  const formatSalary = () => {
    if (!job) return 'Not specified';
    const currency = job.salary_currency || 'Rwf';
    const period = job.salary_period === 'year'? '/year': '/month';

    if (job.salary_min && job.salary_max) {
      return `${currency} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}${period}`;
    }
    if (job.salary_min) return `From ${currency} ${job.salary_min.toLocaleString()}${period}`;
    if (job.salary_max) return `Up to ${currency} ${job.salary_max.toLocaleString()}${period}`;
    return 'Not specified';
  };

  const formatLocation = () => {
    if (!job) return 'Not specified';

    if (job.locations && job.locations.length > 0) {
      const loc = job.locations[0];
      if (loc.is_remote) return 'Remote';
      return [loc.city, loc.country].filter(Boolean).join(', ');
    }

    if (typeof job.location === 'object'&& job.location !== null) {
      if (job.location.is_remote) return 'Remote';
      return [job.location.city, job.location.country].filter(Boolean).join(', ');
    }

    return typeof job.location === 'string'? job.location : 'Not specified';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysRemaining = () => {
    if (!job?.expires_at) return null;
    const days = Math.ceil((new Date(job.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const getMatchLevelColor = () => {
    if (!matchScore) return 'bg-gray-100 text-gray-600';
    if (matchScore >= 80) return 'bg-green-100 text-green-800';
    if (matchScore >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getFactorColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md mx-auto p-8 bg-white rounded-2xl shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'The job you are looking for does not exist.'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const daysRemaining = getDaysRemaining();
  const isExpired = daysRemaining === 0;
  const isActive = job.status === 'active'&& !isExpired;

  // Show loading spinner while AI match is being calculated
  if (isLoadingMatch) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-blue-200 rounded-full animate-spin border-t-blue-600 mx-auto mb-4"></div>
                <Brain className="w-10 h-10 text-blue-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Analyzing Your Match</h3>
              <p className="text-gray-500 max-w-md">
                Our AI is comparing your skills, qualifications, experience, and preferences against this job...
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse delay-150"></div>
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse delay-300"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header with back button */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Back</span>
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveJob}
                  className={`p-2 rounded-lg transition-colors ${isSaved ? 'bg-blue-50 text-blue-600': 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  <Bookmark className="w-5 h-5" fill={isSaved ? 'currentColor': 'none'} />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Job Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Job Header */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    {job.company_logo ? (
                      <img src={job.company_logo} alt={job.company_name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <Building2 className="w-8 h-8 text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{job.title}</h1>
                    <p className="text-lg text-gray-600 mb-3">{job.company_name}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{formatLocation()}</span>
                      <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{job.job_type || 'Full-time'}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{job.work_arrangement || 'Onsite'}</span>
                      <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" />{formatSalary()}</span>
                    </div>
                  </div>
                </div>

                {/* AI Match Score Badge */}
                {matchScore != null && matchDetails && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${getMatchLevelColor()}`}>
                      <Brain className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        AI Match Score: {matchScore}% - {matchDetails.match_level}
                      </span>
                    </div>
                  </div>
                )}

                {/* Was previously silent on failure   surface it so "no score shown"
                    is never unexplained (e.g. candidate profile not yet trained by
                    the hybrid recommender, or the ML services being unreachable) */}
                {isLoadingMatch && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading AI match score...
                  </div>
                )}
                {!isLoadingMatch && matchScore == null && matchError && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-sm text-amber-600">
                    <AlertCircle className="w-4 h-4" /> {matchError}
                  </div>
                )}

                {/* Status Badge */}
                <div className="mt-2">
                  {isActive ? (
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded-lg inline-flex">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Active</span>
                      {daysRemaining && <span className="text-xs">({daysRemaining} days left)</span>}
                    </div>
                  ) : isExpired ? (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg inline-flex">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Expired</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg inline-flex">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Draft</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Description</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{job.description}</p>
              </div>

              {/* Responsibilities */}
              {job.responsibilities && job.responsibilities.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Key Responsibilities</h2>
                  <ul className="space-y-2">
                    {job.responsibilities.map((resp, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-600">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Requirements */}
              {job.requirements && job.requirements.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Requirements</h2>
                  <ul className="space-y-2">
                    {job.requirements.map((req, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-600">
                        <Target className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Skills Required - WITH MATCH INDICATORS */}
              {job.skills_required && job.skills_required.length > 0 && matchDetails && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <button
                    onClick={() => toggleSection('skills')}
                    className="w-full flex items-center justify-between text-xl font-semibold text-gray-900 mb-4"
                  >
                    <span>Required Skills</span>
                    {expandedSections.skills ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>

                  {expandedSections.skills && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {job.skills_required.map((skill, index) => {
                          const skillName = typeof skill === 'string'? skill : skill.name;
                          const matchedSkills = matchDetails.skills_breakdown.matched_skills || [];
                          const isMatched = matchedSkills.some(m => m.toLowerCase() === skillName.toLowerCase() || skillName.toLowerCase().includes(m.toLowerCase()));
                          const skillScore = matchDetails.skills_breakdown.individual_scores?.[index];
                          return (
                            <div key={index} className="relative group">
                              <span
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium inline-flex items-center gap-1 cursor-help ${isMatched
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}
                              >
                                {skillName}
                                {isMatched && <CheckCircle className="w-3 h-3 text-green-600" />}
                                {!isMatched && <XCircle className="w-3 h-3 text-red-500" />}
                              </span>
                              {skillScore !== undefined && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                  Match: {Math.round(skillScore * 100)}%
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Skills Match Score   only real when the profile matcher scored this job */}
                      {matchDetails.hasBreakdown ? (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-700">Skills Match Score</span>
                            <span className={`text-sm font-bold ${getFactorColor(matchDetails.criteria_scores.skills_match)}`}>
                              {matchDetails.criteria_scores.skills_match}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${matchDetails.criteria_scores.skills_match}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {matchDetails.skills_breakdown.total_matched} of {matchDetails.skills_breakdown.total_required} skills matched
                          </p>
                        </div>
                      ) : (
                        <p className="mt-4 text-xs text-gray-500">Scored by the AI hybrid recommender only   the profile matcher hasn't evaluated this job yet.</p>
                      )}

                      {/* Missing Skills Warning */}
                      {matchDetails.skills_breakdown.missing_skills.length > 0 && (
                        <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
                          <p className="text-sm text-yellow-800 font-medium mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" />
                            Skills to develop:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {matchDetails.skills_breakdown.missing_skills.map((skill, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Education Requirements with Match Info */}
              {job.education_required && matchDetails && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <button
                    onClick={() => toggleSection('qualifications')}
                    className="w-full flex items-center justify-between text-xl font-semibold text-gray-900 mb-4"
                  >
                    <span>Education & Qualifications</span>
                    {expandedSections.qualifications ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>

                  {expandedSections.qualifications && (
                    <div className="space-y-4">
                      {/* Your Education vs Job Requirements */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-blue-700 mb-2">🎓 Your Education</p>
                          {matchDetails.qualifications_breakdown.candidate_degrees.length > 0 ? (
                            <div className="space-y-1">
                              {matchDetails.qualifications_breakdown.candidate_degrees.map((deg, idx) => (
                                <p key={idx} className="text-sm text-blue-900"> {deg}</p>
                              ))}
                              {matchDetails.qualifications_breakdown.candidate_fields.map((field, idx) => (
                                <p key={idx} className="text-xs text-blue-700"> {field}</p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-blue-700">No education information provided</p>
                          )}
                        </div>

                        <div className="bg-purple-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-purple-700 mb-2">📋 Job Requirements</p>
                          {matchDetails.qualifications_breakdown.job_degree_required && (
                            <p className="text-sm text-purple-900">🎓 {matchDetails.qualifications_breakdown.job_degree_required}</p>
                          )}
                          {matchDetails.qualifications_breakdown.job_allowed_fields.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-purple-600">Allowed Fields:</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {matchDetails.qualifications_breakdown.job_allowed_fields.slice(0, 5).map((field, idx) => (
                                  <span key={idx} className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                    {field}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Best Match Info */}
                      {matchDetails.qualifications_breakdown.best_matched_field && (
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-sm text-green-800 font-medium">
                            ''Best match: {matchDetails.qualifications_breakdown.best_matched_field}
                          </p>
                          <p className="text-xs text-green-600 mt-1">
                            Similarity: {(matchDetails.qualifications_breakdown.best_similarity * 100).toFixed(0)}% -
                            Match type: {matchDetails.qualifications_breakdown.match_type}
                          </p>
                          {matchDetails.qualifications_breakdown.explanation && (
                            <p className="text-xs text-green-600 mt-1">{matchDetails.qualifications_breakdown.explanation}</p>
                          )}
                        </div>
                      )}

                      {/* Qualifications Score   only real when the profile matcher scored this job */}
                      {matchDetails.hasBreakdown && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-700">Qualifications Match</span>
                            <span className={`text-sm font-bold ${getFactorColor(matchDetails.criteria_scores.qualifications_match)}`}>
                              {matchDetails.criteria_scores.qualifications_match}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${matchDetails.criteria_scores.qualifications_match}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Benefits */}
              {job.benefits && job.benefits.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Benefits & Perks</h2>
                  <ul className="space-y-2">
                    {job.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2 text-gray-600">
                        <Sparkles className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right Column - Sidebar with FULL Match Analysis */}
            <div className="space-y-6">
              {/* Match Score Card */}
              {matchScore != null && matchDetails && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
                  <div className="text-center">
                    <div className="relative inline-flex items-center justify-center mb-4">
                      <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center">
                        <div className="text-center">
                          <span className="text-4xl font-bold">{matchScore}%</span>
                          <p className="text-xs opacity-80">Match Score</p>
                        </div>
                      </div>
                    </div>

                    <span className={`inline-block px-3 py-1 mb-3 rounded-full text-sm font-bold ${
                      matchScore >= 90 ? 'bg-green-400 text-green-900'
                        : matchScore >= 75 ? 'bg-blue-300 text-blue-900'
                          : matchScore >= 60 ? 'bg-orange-300 text-orange-900'
                            : 'bg-red-300 text-red-900'
                    }`}>
                      {matchScore >= 90 ? 'Excellent Match'
                        : matchScore >= 75 ? 'Strong Match'
                          : matchScore >= 60 ? 'Good Match'
                            : 'Needs Improvement'}
                    </span>
                    <p className="text-white/90 mb-4 text-sm">
                      {matchScore >= 80
                        ? 'You are highly qualified for this role.'
                        : matchScore >= 60
                          ? 'Your profile aligns well with this position.'
                          : 'Consider updating your profile to better match this role.'}
                    </p>

                    {/* Matcher (70%) + Hybrid (30%) split   same blend shown in the job feed */}
                    {(matchDetails.matcher_score != null || matchDetails.hybrid_score != null) && (
                      <div className="flex justify-center gap-4 mb-3 text-xs text-white/80">
                        {matchDetails.matcher_score != null && <span>''Profile Match: {Math.round(matchDetails.matcher_score)}%</span>}
                        {matchDetails.hybrid_score != null && <span>🧠 Hybrid Recommender: {Math.round(matchDetails.hybrid_score)}%</span>}
                      </div>
                    )}

                    {/* Factor Breakdown   only real when the profile matcher scored this job */}
                    {matchDetails.hasBreakdown ? (
                      <div className="space-y-3 text-left mb-4">
                        <p className="text-xs font-semibold text-white/80">Match Breakdown:</p>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Skills</span>
                            <span>{matchDetails.criteria_scores.skills_match}%</span>
                          </div>
                          <div className="w-full bg-white/20 rounded-full h-1.5">
                            <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${matchDetails.criteria_scores.skills_match}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3" /> Qualifications</span>
                            <span>{matchDetails.criteria_scores.qualifications_match}%</span>
                          </div>
                          <div className="w-full bg-white/20 rounded-full h-1.5">
                            <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${matchDetails.criteria_scores.qualifications_match}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> Experience</span>
                            <span>{matchDetails.criteria_scores.experience_match}%</span>
                          </div>
                          <div className="w-full bg-white/20 rounded-full h-1.5">
                            <div className="bg-yellow-400 h-1.5 rounded-full" style={{ width: `${matchDetails.criteria_scores.experience_match}%` }} />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Preferences</span>
                            <span>{matchDetails.criteria_scores.preferences_match}%</span>
                          </div>
                          <div className="w-full bg-white/20 rounded-full h-1.5">
                            <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${matchDetails.criteria_scores.preferences_match}%` }} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-white/70 mb-4">Scored by the AI hybrid recommender only   the profile matcher hasn't evaluated this job yet.</p>
                    )}

                    {/* Why this job matched (explainable AI) */}
                    {(matchDetails.reasons?.length ?? 0) > 0 && (
                      <div className="text-left mb-4 space-y-1">
                        <p className="text-xs font-semibold text-white/80">Why we recommended this:</p>
                        {matchDetails.reasons!.map((r, i) => (
                          <p key={i} className="text-xs text-white/90 flex items-start gap-1">
                            <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> {r}
                          </p>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => navigate('/dashboard?view=profile')}
                      className="w-full py-2 bg-white text-blue-600 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
                    >
                      Improve Your Match
                    </button>
                  </div>
                </div>
              )}

              {/* AI Insight: Why this score + how to improve */}
              {matchDetails && (matchDetails.explanation || (matchDetails.improvement_suggestions?.length ?? 0) > 0) && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  {matchDetails.explanation && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-indigo-500" /> Why this score?
                      </h3>
                      <p className="text-sm text-gray-600 leading-relaxed">{matchDetails.explanation}</p>
                    </div>
                  )}
                  {(matchDetails.improvement_suggestions?.length ?? 0) > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-500" /> Improve your match
                      </h3>
                      <p className="text-xs text-gray-500 mb-2">Learning these skills would raise your match for similar roles:</p>
                      <div className="flex flex-wrap gap-2">
                        {matchDetails.improvement_suggestions!.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                            <span className="text-green-500 font-bold">+</span> {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Experience Match Details Card   hidden when the profile matcher
                  never scored this job, since every field below would just be
                  a zeroed placeholder rather than a real "0" */}
              {matchDetails && matchDetails.hasBreakdown && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <button
                    onClick={() => toggleSection('experience')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 mb-3"
                  >
                    <span className="flex items-center gap-2"><Briefcase className="w-4 h-4 text-purple-500" />Experience Match</span>
                    {expandedSections.experience ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {expandedSections.experience && (
                    <div className="space-y-3">
                      {/* Total vs Relevant   relevant is computed by semantic matching, not raw years */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-gray-900">{(matchDetails.experience_breakdown.total_years || 0).toFixed(1)}</p>
                          <p className="text-xs text-gray-500">Total Experience (yrs)</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-purple-700">{(matchDetails.experience_breakdown.relevant_years || 0).toFixed(1)}</p>
                          <p className="text-xs text-purple-600">Relevant Experience (yrs)</p>
                        </div>
                      </div>

                      {matchDetails.experience_breakdown.required_years > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Required:</span>
                          <span className="font-medium text-gray-900">{matchDetails.experience_breakdown.required_years}+ years</span>
                        </div>
                      )}

                      {/* Per-experience analysis: which roles were used vs excluded, and why */}
                      {(matchDetails.experience_breakdown.experience_analysis?.length ?? 0) > 0 && (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs font-semibold text-gray-600">How each role was used:</p>
                          {matchDetails.experience_breakdown.experience_analysis!.map((exp, idx) => (
                            <div key={idx} className={`rounded-lg p-3 border ${exp.contributes ? 'bg-green-50 border-green-100': 'bg-gray-50 border-gray-100'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                                    {exp.contributes
                                      ? <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                                      : <XCircle className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                                    <span className="truncate">{exp.title}</span>
                                  </p>
                                  {exp.company && <p className="text-xs text-gray-500 ml-5">{exp.company}</p>}
                                </div>
                                <span className={`text-xs font-bold whitespace-nowrap ${exp.contributes ? 'text-green-700': 'text-gray-400'}`}>
                                  {Math.round((exp.similarity || 0) * 100)}%
                                </span>
                              </div>
                              {exp.technologies && exp.technologies.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2 ml-5">
                                  {exp.technologies.slice(0, 6).map((t, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-white text-gray-600 text-[10px] rounded border border-gray-200">{t}</span>
                                  ))}
                                </div>
                              )}
                              {exp.reason && <p className="text-[11px] text-gray-500 mt-1.5 ml-5">{exp.reason}</p>}
                            </div>
                          ))}
                        </div>
                      )}

                      {matchDetails.experience_breakdown.gap_years > 0 && (
                        <div className="mt-1 p-2 bg-yellow-50 rounded-lg">
                          <p className="text-xs text-yellow-800">
                            Experience gap of {matchDetails.experience_breakdown.gap_years} years. Consider highlighting transferable skills or relevant projects.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Preferences Match Details   same reasoning as Experience above */}
              {matchDetails && matchDetails.hasBreakdown && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <button
                    onClick={() => toggleSection('preferences')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 mb-3"
                  >
                    <span className="flex items-center gap-2"><Heart className="w-4 h-4 text-purple-500" />Preferences Match</span>
                    {expandedSections.preferences ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {expandedSections.preferences && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Job Type:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.type_match * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Remote Work:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.remote_match * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Location:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.location_match * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Industry:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.industry_match * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Salary:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.salary_match * 100)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Languages:</span>
                          <span className="font-medium text-gray-900">{Math.round(matchDetails.preferences_breakdown.language_match * 100)}%</span>
                        </div>
                      </div>

                      {/* Your Preferences */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Your Preferences:</p>
                        <div className="flex flex-wrap gap-1">
                          {matchDetails.preferences_breakdown.candidate_job_types.map((type, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{type}</span>
                          ))}
                          {matchDetails.preferences_breakdown.candidate_locations.map((loc, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full">{loc}</span>
                          ))}
                          {matchDetails.preferences_breakdown.candidate_industries.map((ind, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{ind}</span>
                          ))}
                        </div>
                      </div>

                      {matchDetails.preferences_breakdown.missing_job_data.length > 0 && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">
                            ℹ️ Missing job data: {matchDetails.preferences_breakdown.missing_job_data.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Application Card */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Summary</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Posted</span>
                    <span className="text-gray-900">{formatDate(job.published_at)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Applications</span>
                    <span className="text-gray-900">{job.application_count || 0}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Required Experience</span>
                    <span className="text-gray-900">
                      {job.experience_min && job.experience_max
                        ? `${job.experience_min} - ${job.experience_max} years`
                        : job.experience_level || 'Not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">Deadline</span>
                    <span className={daysRemaining && daysRemaining <= 7 ? 'text-red-600 font-medium': 'text-gray-900'}>
                      {formatDate(job.expires_at)}
                      {daysRemaining && daysRemaining > 0 && (
                        <span className="text-xs ml-1">({daysRemaining} days left)</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {!hasApplied && isActive && requiredScore != null && matchScore != null && matchScore < requiredScore ? (
                    // Not eligible: AI match score below the employer's minimum.
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <button
                        type="button"
                        disabled
                        className="w-full py-3 bg-gray-200 text-gray-500 font-semibold rounded-xl cursor-not-allowed mb-3"
                      >
                        Apply Now
                      </button>
                      <p className="text-sm text-amber-800 font-medium mb-2">
                        You are currently not eligible to apply because your AI Job Match Score is below the employer's minimum requirement.
                      </p>
                      <div className="flex items-center justify-center gap-6 my-3">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-amber-700">{Math.round(matchScore)}%</p>
                          <p className="text-xs text-gray-500">Your Match Score</p>
                        </div>
                        <div className="text-gray-300 text-2xl">/</div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-gray-800">{requiredScore}%</p>
                          <p className="text-xs text-gray-500">Required</p>
                        </div>
                      </div>
                      {(matchDetails?.improvement_suggestions?.length ?? 0) > 0 && (
                        <div className="pt-2 border-t border-amber-200">
                          <p className="text-xs font-semibold text-amber-800 mb-1">Improve your score by adding:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {matchDetails!.improvement_suggestions!.map((s, i) => (
                              <span key={i} className="px-2 py-0.5 bg-white text-amber-700 text-xs rounded-full border border-amber-200">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : !hasApplied && isActive ? (
                    <button
                      onClick={handleApplyNow}
                      disabled={isApplying}
                      className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
                    >
                      {isApplying ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Apply Now'}
                    </button>
                  ) : hasApplied ? (
                    <div className="text-center py-3 bg-green-50 text-green-600 rounded-xl">
                      <CheckCircle className="w-5 h-5 inline mr-2" />
                      You have applied for this position
                    </div>
                  ) : !isActive ? (
                    <div className="text-center py-3 bg-gray-100 text-gray-500 rounded-xl">
                      This position is no longer accepting applications
                    </div>
                  ) : null}

                  <button
                    onClick={handleSaveJob}
                    className="w-full py-3 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor': 'none'} />
                    {isSaved ? 'Saved': 'Save Job'}
                  </button>
                </div>
              </div>

              {/* Tags */}
              {job.tags && job.tags.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {job.tags.map((tag, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Company Info */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">About {job.company_name}</h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                    {job.company_logo ? (
                      <img src={job.company_logo} alt={job.company_name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <Building2 className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{job.company_name}</p>
                    {job.company_industry && <p className="text-xs text-gray-500">{job.company_industry}</p>}
                    {job.company_size && <p className="text-xs text-gray-400">{job.company_size} employees</p>}
                  </div>
                </div>
                {job.company_website && (
                  <a
                    href={job.company_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Visit Website
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Modal */}
{showApplicationModal && fullCandidateProfile && (
  <JobApplicationModal
    isOpen={showApplicationModal}
    onClose={() => {
      setShowApplicationModal(false);
      setIsApplying(false);
    }}
    onSuccess={() => {
      // Mark as applied, but DON'T close the modal or alert here   the modal shows its
      // own confirmation screen and closes itself when the user dismisses it.
      setHasApplied(true);
    }}
    job={{
      id: job.id,
      title: job.title,
      company_name: job.company_name,
      location: formatLocation(),
      salary_range: formatSalary(),
      job_type: job.job_type,
      work_arrangement: job.work_arrangement,
      description: job.description,
      requirements: job.requirements,
      skills_required: job.skills_required,
      screeningQuestions: job.screening_questions,
      expires_at: job.expires_at
    }}
    candidateProfile={{
      profile: fullCandidateProfile.profile?.personal_info || {},
      skills: fullCandidateProfile.skills || [],
      education: fullCandidateProfile.education || [],
      workExperience: fullCandidateProfile.work_experience || [],
      portfolioLinks: fullCandidateProfile.portfolio_links || [],
      resumes: fullCandidateProfile.resumes || [],
    }}
    matchScore={matchScore || 75}
    matchDetails={{  // ''ADD THIS - pass the match details
      criteria_scores: matchDetails?.criteria_scores,
      skills_breakdown: matchDetails?.skills_breakdown,
      qualifications_breakdown: matchDetails?.qualifications_breakdown,
      experience_breakdown: matchDetails?.experience_breakdown,
      preferences_breakdown: matchDetails?.preferences_breakdown,
      hybrid_detail: matchDetails?.hybrid_detail
    }}
    requiredDocuments={
      Array.isArray((job as any)?.requiredDocuments) && (job as any).requiredDocuments.length > 0
        ? (job as any).requiredDocuments
        : Array.isArray((job as any)?.required_documents) && (job as any).required_documents.length > 0
          ? (job as any).required_documents
          // No job-level "required documents" field exists in the database  
          // Resume is universal; Cover Letter defaults to optional rather
          // than being hardcoded as required for every job.
          : [{ name: 'Resume', is_required: true }, { name: 'Cover Letter', is_required: false }]
    }
  />
)}
    </>
  );
};

export default JobDetails;