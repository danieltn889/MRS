// components/DashboardHome/index.tsx
import React, { useState, useEffect } from 'react';
import {
  User, Briefcase, Search, Users, AlertCircle, Building2, Filter, Calendar, BarChart3, Target,
  CheckCircle, XCircle, Info, X as XIcon, Shield
} from 'lucide-react';
import { getPlatformStats, PlatformStats } from '../services/adminAPI';
import ProfileProgressRing from './ProfileProgressRing';
import JobCard from './DashboardHome/JobCard';
import AIMatchBanner from './DashboardHome/AIMatchBanner';
import StatsCards from './DashboardHome/StatsCards';
import { getJobs } from '../services/jobAPI';
import { submitApplication, getApplications, getApplication, withdrawApplication } from '../services/applicationAPI';
import { getProfileCompletionStatus } from '../services/candidateAPI';
import JobViewModal from './jobs/JobViewModal';
import JobApplicationModal from './jobs/JobApplicationModal';
import appliedJobsManager from '../src/utils/AppliedJobsManager';
import { getJobMatchesFromAI } from '../services/aiJobMatchingService';
import { saveJob, unsaveJob, loadSavedJobsFromAPI } from '../services/jobStorageService';
import { useFeedTracker } from '../hooks/useFeedTracker';
import {
  formatNumber, formatDate, formatFullDate, getDaysRemaining,
  getExpiryStatusColor, getMatchColor, getScoreColor, transformMatchData
} from '../utils/jobHelpers';



const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

interface DashboardHomeProps {
  user?: any;
  onApplyJob?: (job: any) => void;
  onViewChange?: (view: string) => void;
}

interface AIMatch {
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
  matcherScore?: number | null;
  hybridScore?: number | null;
  scoreSource?: 'matcher+hybrid'| 'matcher-only'| 'hybrid-only';
  reasons?: string[];
  // Full profile-matcher 4-factor breakdown   null/absent fields when
  // scoreSource is "hybrid-only" (the matcher never scored this job).
  matchLevel?: string;
  criteriaScores?: {
    skills_match?: number | null;
    qualifications_match?: number | null;
    experience_match?: number | null;
    preferences_match?: number | null;
  };
  // Actual per-factor weights used AFTER redistribution (a factor the job
  // doesn't require is excluded, weight 0, its share redistributed across
  // the applicable factors) -- the real math behind criteriaScores' points.
  factorWeightsUsed?: { skills?: number; qualifications?: number; experience?: number; preferences?: number };
  excludedFactors?: string[];
  skillsBreakdown?: {
    matched_skills?: string[];
    missing_skills?: string[];
    total_required?: number;
    total_matched?: number;
    applicable?: boolean;
    note?: string | null;
  };
  qualificationsBreakdown?: any;
  experienceBreakdown?: any;
  preferencesBreakdown?: any;
  // Behavior/Collaborative/Freshness/Popularity/Business-rules breakdown from
  // the hybrid recommender   null/absent when scoreSource is "matcher-only".
  hybridDetail?: any;
  // False only for scoreSource "matcher+hybrid" (Content excluded from
  // hybridScore there, to avoid double-counting against the matcher's own
  // profile-vs-job fit). True for "hybrid-only", meaningless for "matcher-only".
  hybridContentIncluded?: boolean;
  // Outer matcher/hybrid split actually used for THIS candidate's whole feed
  // (shifts from the 70/30 default based on how much of hybrid's score is
  // genuinely personalized -- see combined_score_candidate()'s
  // personalization_ratio logic). Same for every job in one feed response.
  outerWeightsUsed?: { matcher: number; hybrid: number };
  rawJob?: any;
  benefits?: string[];
  tags?: string[];
  publishedAt?: string;
  experienceLevel?: string;
  department?: string;
  status?: string;
  responsibilities?: string[];
  applications?: number;
}

interface CandidateInfo {
  name: string;
  level: string;
  total_experience_years: number;
  skills?: string[];
}

interface AdditionalStats {
  draft_jobs: number;
  paused_jobs: number;
  closed_jobs: number;
  expired_jobs: number;
  pending_applications: number;
  under_review: number;
  shortlisted: number;
  offers: number;
  hired: number;
  rejected: number;
}

interface CompanyDashboardStats {
  active_jobs: number;
  total_applications: number;
  qualified_candidates: number;
  interviews_scheduled: number;
  additional: AdditionalStats;
}

const DEFAULT_ADDITIONAL_STATS: AdditionalStats = {
  draft_jobs: 0,
  paused_jobs: 0,
  closed_jobs: 0,
  expired_jobs: 0,
  pending_applications: 0,
  under_review: 0,
  shortlisted: 0,
  offers: 0,
  hired: 0,
  rejected: 0
};

const DashboardHome: React.FC<DashboardHomeProps> = ({ user, onApplyJob, onViewChange }) => {
  const { trackSave, trackUnsave } = useFeedTracker();
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [aiMatches, setAiMatches] = useState<AIMatch[]>([]);

  // ''Three distinct loading phases so we never show stale UI
  // pageLoading  = true while we don't know ANYTHING yet (first paint)
  // profileLoading = true while fetching profile/completion data
  // matchesLoading  = true while AI matching is in-flight
  const [pageLoading, setPageLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [jobError, setJobError] = useState<string | null>(null);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedMatchForApply, setSelectedMatchForApply] = useState<AIMatch | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<string[]>(() => appliedJobsManager.getAllAppliedJobs());
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo | null>(null);
  const [matchFilter, setMatchFilter] = useState('all');
  const [savedJobs, setSavedJobs] = useState(new Set<string>());
  const [showDetails, setShowDetails] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<AIMatch | null>(null);
  const [fullCandidateProfile, setFullCandidateProfile] = useState<any>(null);
  const [completionStatus, setCompletionStatus] = useState<any>(null);

  // Company dashboard stats state
  const [companyStats, setCompanyStats] = useState<CompanyDashboardStats>({
    active_jobs: 0,
    total_applications: 0,
    qualified_candidates: 0,
    interviews_scheduled: 0,
    additional: DEFAULT_ADDITIONAL_STATS
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [withdrawalNotif, setWithdrawalNotif] = useState<{ type: 'success'| 'error'| 'info'; message: string } | null>(null);

  // Check user type
  const userTypeValue = user?.userType || user?.user_type || '';
  const isCompanyUser = userTypeValue === 'recruiter'||
    userTypeValue === 'company_admin'||
    userTypeValue === 'company'||
    userTypeValue === 'Company Admin'||
    userTypeValue === 'Recruiter';
  const isSystemAdmin = userTypeValue === 'system_admin';
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null);

  // ''Derive completion percentage from state (used for display only)
  const completionPercentage = completionStatus?.completionPercentage ||
    fullCandidateProfile?.profile?.profile_completion ||
    0;

  const isProfileReady = completionPercentage >= 80;

  // Fetch company dashboard statistics
  const fetchCompanyDashboardStats = async () => {
    if (!isCompanyUser) return;
    setStatsLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) { setStatsLoading(false); return; }

      const response = await fetch(`${API_BASE_URL}/jobs/company/stats`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });

      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setStatsLoading(false);
        return;
      }

      const result = await response.json();
      if (result.success && result.data) {
        setCompanyStats({
          active_jobs: result.data.active_jobs || 0,
          total_applications: result.data.total_applications || 0,
          qualified_candidates: result.data.qualified_candidates || 0,
          interviews_scheduled: result.data.interviews_scheduled || 0,
          additional: result.data.additional ? {
            draft_jobs: result.data.additional.draft_jobs || 0,
            paused_jobs: result.data.additional.paused_jobs || 0,
            closed_jobs: result.data.additional.closed_jobs || 0,
            expired_jobs: result.data.additional.expired_jobs || 0,
            pending_applications: result.data.additional.pending_applications || 0,
            under_review: result.data.additional.under_review || 0,
            shortlisted: result.data.additional.shortlisted || 0,
            offers: result.data.additional.offers || 0,
            hired: result.data.additional.hired || 0,
            rejected: result.data.additional.rejected || 0
          } : DEFAULT_ADDITIONAL_STATS
        });
      }
    } catch (error) {
      console.error(' Error fetching company dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch platform-wide statistics (System Admin dashboard)
  const fetchPlatformStats = async () => {
    if (!isSystemAdmin) return;
    setStatsLoading(true);
    try {
      const res = await getPlatformStats();
      if (res.success) setPlatformStats(res.data);
    } catch (error) {
      console.error(' Error fetching platform stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // DashboardHome/index.tsx

  // DashboardHome/index.tsx - Replace the handleWithdrawApplication function

  const showNotif = (type: 'success'| 'error'| 'info', message: string) => {
    setWithdrawalNotif({ type, message });
    setTimeout(() => setWithdrawalNotif(null), 6000);
  };

  const handleWithdrawApplication = async (job: any) => {
    console.log('🔄 Withdrawing application for job:', job.id);

    try {
      if (!window.confirm(`Are you sure you want to withdraw your application for "${job.title}" at ${job.company}?`)) {
        return;
      }

      let applicationId = job.applicationId || job.application_id;

      if (!applicationId) {
        const token = localStorage.getItem('authToken');
        if (!token) {
          showNotif('error', 'Please log in again.');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/applications`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'}
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.applications) {
            const app = data.data.applications.find((a: any) => a.job_id === job.id);
            if (app) applicationId = app.id;
          }
        }
      }

      if (!applicationId) {
        showNotif('error', 'Application not found. Please try again.');
        return;
      }

      const response = await withdrawApplication(applicationId);

      if (response.success) {
        appliedJobsManager.removeAppliedJob(job.id);
        setAppliedJobs(prevApplied => prevApplied.filter(id => id !== job.id));
        showNotif('success', `Application for "${job.title}" has been withdrawn.`);
      } else {
        showNotif('error', response.message || 'Failed to withdraw application.');
      }
    } catch (error: any) {
      console.error('Error withdrawing application:', error);
      const msg = error?.response?.data?.message || error?.message || 'Unknown error';
      if (/offer has already been accepted|already withdrawn|already rejected/i.test(String(msg))) {
        appliedJobsManager.removeAppliedJob(job.id);
        setAppliedJobs(prevApplied => prevApplied.filter(id => id !== job.id));
      }
      showNotif('error', msg);
    }
  };

  // ''Fetch AI job matches   accepts percentage directly to avoid stale state reads
  const fetchWithTimeout = async (promise: Promise<any>, timeoutMs: number = 300000) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('AI matching is still loading. Please try again in a moment.')), timeoutMs);
    });
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
      return result;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  };

  // ''KEY FIX: accept resolvedPercentage as param so we don't rely on stale state
  const fetchAiJobMatches = async (resolvedPercentage: number) => {
    if (isCompanyUser) return;

    // Jobs are always shown regardless of profile completion   an incomplete
    // profile just means matches are less personalized. The completion
    // reminder is a banner above the list (see isProfileReady), not a gate.
    if (resolvedPercentage < 80) {
      console.log(` Profile ${resolvedPercentage}% complete   fetching jobs anyway, matches may be less personalized`);
    }

    const candidateId = user?.id;
    if (!candidateId) {
      setJobError('User ID not found. Please log in again.');
      return;
    }

    setMatchesLoading(true);
    setJobError(null);

    try {
      console.log('📊 Fetching combined feed (matcher+hybrid) for candidate:', candidateId);
      const data = await fetchWithTimeout(getJobMatchesFromAI(candidateId));

      // candidateInfo (name/level/skills) already comes from fetchFullCandidateProfile  
      // the combined feed has no "candidate" field, only scored jobs.
      if (data && data.success && data.matches) {
        const transformedMatches = data.matches.map((match: any) => {
          const jobData = match.job || {};
          const companyData = jobData.company || {};
          // Real 4-factor breakdown from the matcher (skills/quals/experience/
          // preferences)   null when score_source is "hybrid-only", i.e. the
          // matcher had no data for this job at all, not a real 0.
          const matcherBD = match.matcher_breakdown || null;
          const criteriaScores = matcherBD?.criteria_scores || {};
          const skillsBD = matcherBD?.skills_breakdown || {};

          return {
            id: jobData.id || match.job_id,
            title: jobData.title || match.title,
            company: companyData.name || jobData.company_name || match.company || 'Unknown Company',
            location: jobData.locations?.[0]?.city || 'Location not specified',
            salary: jobData.salary_min && jobData.salary_max
              ? `${jobData.salary_currency || ''} ${jobData.salary_min}-${jobData.salary_max} ${jobData.salary_period || ''}`.trim()
              : undefined,
            type: jobData.job_type || 'Full-time',
            workArrangement: jobData.work_arrangement || 'Onsite',
            description: jobData.description,
            requirements: jobData.qualifications ? [jobData.qualifications] : [],
            skills: jobData.skills_required?.map((s: any) => typeof s === 'string'? s : s.name) || [],
            screeningQuestions: jobData.screening_questions || [],
            expiresAt: jobData.expires_at,
            publishedAt: jobData.published_at,

            // New combined-feed scoring: total_score blends matcher (70%) and
            // hybrid (30%); either half may be null if that service had no
            // data for this job (score_source tells you which happened).
            matchScore: Math.round(match.total_score || 0),
            matcherScore: match.matcher_score !== null && match.matcher_score !== undefined ? Math.round(match.matcher_score) : null,
            hybridScore: match.hybrid_score !== null && match.hybrid_score !== undefined ? Math.round(match.hybrid_score) : null,
            scoreSource: match.score_source,
            reasons: match.reasons || [],
            matchLevel: matcherBD?.match_level || '',
            criteriaScores: {
              skills_match: criteriaScores.skills_match ?? null,
              qualifications_match: criteriaScores.qualifications_match ?? null,
              experience_match: criteriaScores.experience_match ?? null,
              preferences_match: criteriaScores.preferences_match ?? null
            },
            factorWeightsUsed: matcherBD?.factor_weights_used || null,
            excludedFactors: matcherBD?.excluded_factors || [],
            skillsBreakdown: {
              matched_skills: skillsBD.matched_skills || [],
              missing_skills: skillsBD.missing_skills || [],
              total_required: skillsBD.total_required || 0,
              total_matched: skillsBD.total_matched || 0,
              applicable: skillsBD.applicable ?? true,
              note: skillsBD.note ?? null
            },
            qualificationsBreakdown: matcherBD?.qualifications_breakdown || null,
            experienceBreakdown: matcherBD?.experience_breakdown || null,
            preferencesBreakdown: matcherBD?.preferences_breakdown || null,
            // Behavior/Collaborative/Freshness/Popularity/Business-rules
            // breakdown from the hybrid recommender   null when score_source
            // is "matcher-only" (hybrid had no data for this job).
            hybridDetail: match.hybrid_detail || null,
            hybridContentIncluded: match.hybrid_content_included ?? null,
            outerWeightsUsed: data.weights_used || null,

            rawJob: jobData,
            benefits: jobData.benefits || [],
            tags: jobData.tags || [],
            experienceLevel: jobData.experience_level || '',
            department: jobData.department || '',
            status: jobData.status || 'active',
            responsibilities: jobData.responsibilities || [],
            applications: jobData.application_count || 0,
            viewCount: jobData.view_count || 0,
            companyLogo: jobData.company_logo || companyData.logo_url || '',
            companyVerified: companyData.verified || false,
            companyIndustry: companyData.industry || '',
            companySize: companyData.size || '',
            companyWebsite: companyData.website || '',
            companyDescription: companyData.description || ''
          };
        });

        console.log('Transformed matches:', transformedMatches.length, `(cold_start=${data.cold_start}, matcher_available=${data.matcher_available})`);
        setAiMatches(transformedMatches);
        setJobError(null);
      } else {
        setAiMatches([]);
        setJobError(data?.message || 'No job matches found. Complete your profile for better recommendations.');
      }
    } catch (error: any) {
      console.error('Error fetching AI matches:', error);
      setJobError(error.message || 'Failed to load job matches. Please try again later.');
      setAiMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  // ''Returns the resolved percentage so loadData can pass it to fetchAiJobMatches directly
  const fetchFullCandidateProfile = async (): Promise<number> => {
    if (isCompanyUser) return 0;

    const token = localStorage.getItem('authToken');
    if (!token || !user?.id) return 0;

    try {
      const response = await fetch(`${API_BASE_URL}/candidates/full-profile/${user.id}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        return 0;
      }

      const data = await response.json();
      if (data.success) {
        setFullCandidateProfile(data.data);

        const stats = data.data.statistics || {};
        const profileInfo = data.data.profile?.personal_info || {};
        const skills = data.data.skills || [];
        const skillNames = skills.map((s: any) => s.skill_name);

        const workSkills: string[] = [];
        if (data.data.work_experience) {
          data.data.work_experience.forEach((exp: any) => {
            if (exp.skills && Array.isArray(exp.skills)) {
              exp.skills.forEach((skill: string) => {
                if (!workSkills.includes(skill)) workSkills.push(skill);
              });
            }
          });
        }

        const allSkills = [...new Set([...skillNames, ...workSkills])];
        setCandidateInfo({
          name: profileInfo.full_name || 'Candidate',
          level: profileInfo.headline || 'Professional',
          total_experience_years: stats.total_years_experience || 0,
          skills: allSkills.slice(0, 5)
        });

        // ''Also fetch completion status and return the resolved percentage
        const statusResponse = await getProfileCompletionStatus();
        if (statusResponse.success && statusResponse.data) {
          setCompletionStatus(statusResponse.data);
          return statusResponse.data.completionPercentage || 0;
        }

        // Fallback: use profile_completion from profile response
        return data.data.profile?.profile_completion || 0;
      }
    } catch (error) {
      console.error('Error fetching full profile:', error);
    }

    return 0;
  };

  // ''MAIN DATA LOADER   sequential, passes resolved percentage directly
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) {
        setPageLoading(false);
        setProfileLoading(false);
        return;
      }

      // Load saved jobs in background (non-blocking)
      loadSavedJobsFromAPI()
        .then(ids => setSavedJobs(new Set(ids)))
        .catch(err => console.error('Error loading saved jobs:', err));

      if (isCompanyUser) {
        await fetchCompanyDashboardStats();
        setProfileLoading(false);
        setPageLoading(false);
        return;
      }

      if (isSystemAdmin) {
        await fetchPlatformStats();
        setProfileLoading(false);
        setPageLoading(false);
        return;
      }

      // ── CANDIDATE FLOW ──
      // Step 1: profile + completion (profileLoading stays true)
      setProfileLoading(true);
      const [resolvedPercentage] = await Promise.all([
        fetchFullCandidateProfile(),
      ]);
      setProfileLoading(false);

      // Step 2: now we know the real percentage   decide what to do
      // pageLoading ends here so the profile sidebar already renders
      setPageLoading(false);

      // Step 3: if eligible, start AI matching (matchesLoading goes true)
      await fetchAiJobMatches(resolvedPercentage);
    };

    const loadApplications = async () => {
      await appliedJobsManager.loadFromAPI();
      setAppliedJobs(appliedJobsManager.getAllAppliedJobs());
    };

    const handleAppliedJobsChange = (appliedJobIds: string[]) => setAppliedJobs(appliedJobIds);
    appliedJobsManager.addListener(handleAppliedJobsChange);
    loadApplications();

    if (user?.id) {
      loadData();
    } else {
      setPageLoading(false);
      setProfileLoading(false);
    }

    return () => appliedJobsManager.removeListener(handleAppliedJobsChange);
  }, [user?.id, isCompanyUser, isSystemAdmin]);

  const handleSaveJob = async (jobId: string, isCurrentlySaved: boolean) => {
    try {
      if (isCurrentlySaved) {
        await unsaveJob(jobId);
        trackUnsave(jobId);
        setSavedJobs(prev => { const newSet = new Set(prev); newSet.delete(jobId); return newSet; });
        alert('Job removed from saved!');
      } else {
        // Persist the AI match score this candidate saw for the job.
        const matchScore = aiMatches.find(m => m.id === jobId)?.matchScore ?? null;
        await saveJob(jobId, matchScore);
        trackSave(jobId);
        setSavedJobs(prev => new Set([...prev, jobId]));
        alert('Job saved successfully!');
      }
    } catch (error: any) {
      console.error('Error toggling job save:', error);
      alert(error.message || 'Failed to update saved status');
    }
  };

  const handleApplyNow = (match: AIMatch) => {
    setSelectedMatchForApply(match);
    setShowApplicationModal(true);
  };

  const handleViewDetails = (match: AIMatch) => {
    // JobViewModal itself tracks the view now (on mount, keyed on job id) so
    // every caller gets it for free   calling trackView here too would
    // double-count this specific open.
    setSelectedMatch(match);
    setShowDetails(true);
  };

  const handleViewApplication = (job: AIMatch) => {
    alert(`You have applied for "${job.title}" at ${job.company}.\n\nApplication Status: Submitted\n\nYou can check back later for updates on your application status.`);
  };

  const getFilteredMatches = () => {
    let filtered = [...aiMatches];
    switch (matchFilter) {
      case 'applied':
        filtered = filtered.filter(match => appliedJobs.includes(match.id));
        break;
      case 'high':
        filtered = filtered.filter(match => (match.matchScore || 0) >= 90);
        break;
      case 'medium':
        filtered = filtered.filter(match => (match.matchScore || 0) >= 75 && (match.matchScore || 0) < 90);
        break;
      case 'low':
        filtered = filtered.filter(match => (match.matchScore || 0) < 75);
        break;
      default:
        break;
    }
    return filtered;
  };

  const displayJobs = getFilteredMatches();

  const formatStatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // ── COMPANY VIEW ──────────────────────────────────────────────────────────
  if (isSystemAdmin) {
    const s = platformStats;
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-purple-700 to-indigo-700 rounded-2xl shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">System Dashboard</h1>
          <p className="text-purple-100 mb-6">Platform-wide overview across every company</p>
          <div className="flex flex-wrap gap-4">
            <button onClick={() => onViewChange?.('companies')} className="px-6 py-2 bg-white text-purple-700 rounded-lg font-semibold hover:bg-gray-100 transition-colors">Manage Companies</button>
            <button onClick={() => onViewChange?.('users')} className="px-6 py-2 bg-purple-500 text-white rounded-lg font-semibold hover:bg-purple-400 transition-colors">Manage Users</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Companies</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(s?.companies.total || 0)}</p>}
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center"><Building2 className="w-6 h-6 text-purple-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('companies')} className="mt-4 text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">Manage companies →</button>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Users</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(s?.users.total || 0)}</p>}
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-blue-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('users')} className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">Manage users →</button>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Active Jobs</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(s?.jobs.active || 0)}</p>}
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><Briefcase className="w-6 h-6 text-green-600" /></div>
            </div>
            <p className="mt-4 text-xs text-gray-400">{formatStatNumber(s?.jobs.total || 0)} total jobs posted</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Applications</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(s?.applications.total || 0)}</p>}
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center"><Target className="w-6 h-6 text-yellow-600" /></div>
            </div>
            <p className="mt-4 text-xs text-gray-400">{formatStatNumber(s?.candidatesWhoApplied || 0)} candidates applied</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">In Review</p><p className="text-xl font-semibold text-gray-700">{s?.applications.in_review || 0}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Shortlisted</p><p className="text-xl font-semibold text-gray-700">{s?.applications.shortlisted || 0}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Interview</p><p className="text-xl font-semibold text-gray-700">{s?.applications.interview || 0}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Offer</p><p className="text-xl font-semibold text-gray-700">{s?.applications.offer || 0}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Hired</p><p className="text-xl font-semibold text-gray-700">{s?.applications.hired || 0}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Rejected</p><p className="text-xl font-semibold text-gray-700">{s?.applications.rejected || 0}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button onClick={() => onViewChange?.('companies')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors"><Building2 className="w-6 h-6 text-purple-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Company Management</h3>
            <p className="text-gray-500 text-sm">Create, verify, and manage companies on the platform</p>
          </button>
          <button onClick={() => onViewChange?.('users')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors"><Users className="w-6 h-6 text-blue-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">User Management</h3>
            <p className="text-gray-500 text-sm">Add, edit, or remove users for any company</p>
          </button>
          <button onClick={() => onViewChange?.('analytics')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-yellow-200 transition-colors"><BarChart3 className="w-6 h-6 text-yellow-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">System Analytics</h3>
            <p className="text-gray-500 text-sm">Deeper platform usage and performance trends</p>
          </button>
          <button onClick={() => onViewChange?.('platform')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors"><Shield className="w-6 h-6 text-indigo-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Platform Settings</h3>
            <p className="text-gray-500 text-sm">Configure platform-wide settings</p>
          </button>
        </div>
      </div>
    );
  }

  if (isCompanyUser) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Company Dashboard</h1>
          <p className="text-blue-100 mb-6">
            {user?.companyName
              ? <>Welcome to <span className="font-semibold text-white">{user.companyName}</span>'s recruitment management dashboard</>
              : 'Welcome to your recruitment management dashboard'}
          </p>
          <div className="flex flex-wrap gap-4">
            <button onClick={() => onViewChange?.('jobs')} className="px-6 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors">Post New Job</button>
            <button onClick={() => onViewChange?.('candidates')} className="px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-400 transition-colors">Find Candidates</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Active Jobs</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.active_jobs)}</p>}
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center"><Briefcase className="w-6 h-6 text-blue-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('jobs')} className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">View all jobs →</button>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Applications</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.total_applications)}</p>}
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><Users className="w-6 h-6 text-green-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('applications')} className="mt-4 text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1">View applications →</button>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Qualified Candidates</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.qualified_candidates)}</p>}
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center"><User className="w-6 h-6 text-purple-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('candidates')} className="mt-4 text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">Find candidates →</button>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Interviews Scheduled</p>
                {statsLoading ? <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div> : <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.interviews_scheduled)}</p>}
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center"><Calendar className="w-6 h-6 text-yellow-600" /></div>
            </div>
            <button onClick={() => onViewChange?.('interviews')} className="mt-4 text-xs text-yellow-600 hover:text-yellow-800 font-medium flex items-center gap-1">Schedule interview →</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Draft Jobs</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.draft_jobs}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Under Review</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.under_review}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Shortlisted</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.shortlisted}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Offers</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.offers}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Hired</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.hired}</p></div>
          <div className="bg-gray-50 rounded-lg p-3 text-center"><p className="text-xs text-gray-500">Rejected</p><p className="text-xl font-semibold text-gray-700">{companyStats.additional.rejected}</p></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button onClick={() => onViewChange?.('jobs')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors"><Briefcase className="w-6 h-6 text-blue-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Post New Job</h3>
            <p className="text-gray-500 text-sm">Create and publish job openings to attract top talent</p>
          </button>
          <button onClick={() => onViewChange?.('candidates')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors"><Search className="w-6 h-6 text-purple-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Find Candidates</h3>
            <p className="text-gray-500 text-sm">Search and discover qualified candidates for your roles</p>
          </button>
          <button onClick={() => onViewChange?.('team')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors"><Users className="w-6 h-6 text-green-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Manage Team</h3>
            <p className="text-gray-500 text-sm">Invite team members and manage permissions</p>
          </button>
          <button onClick={() => onViewChange?.('recruiter-analytics')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-yellow-200 transition-colors"><BarChart3 className="w-6 h-6 text-yellow-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">View Analytics</h3>
            <p className="text-gray-500 text-sm">Track your recruitment metrics and performance</p>
          </button>
          <button onClick={() => onViewChange?.('company-profile')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors"><Building2 className="w-6 h-6 text-indigo-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Company Profile</h3>
            <p className="text-gray-500 text-sm">Update your company information and branding</p>
          </button>
        </div>
      </div>
    );
  }

  // ── CANDIDATE VIEW ────────────────────────────────────────────────────────

  // ''While we don't know profile yet, show a single full-page skeleton
  // This prevents ANY flash of wrong content
  if (pageLoading || profileLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 w-full">
          {/* Banner skeleton */}
          <div className="bg-gray-100 animate-pulse rounded-xl h-24 mb-6" />
          {/* Stats skeleton */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 animate-pulse rounded-xl h-20" />
            ))}
          </div>
          {/* Loading indicator with message */}
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 flex-shrink-0" />
            <p className="text-gray-500 text-sm">Loading your profile...</p>
          </div>
        </div>
        {/* Sidebar skeleton */}
        <div className="lg:col-span-1 w-full space-y-4">
          <div className="bg-gray-100 animate-pulse rounded-xl h-80" />
          <div className="bg-gray-100 animate-pulse rounded-xl h-48" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Withdrawal / action notification toast */}
      {withdrawalNotif && (
        <div className={`fixed top-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm border text-sm font-medium transition-all
          ${withdrawalNotif.type === 'success'? 'bg-green-50 border-green-200 text-green-800':
            withdrawalNotif.type === 'info'   ? 'bg-blue-50 border-blue-200 text-blue-800':
                                                 'bg-red-50 border-red-200 text-red-800'}`}>
          {withdrawalNotif.type === 'success'? <CheckCircle size={18} className="shrink-0 mt-0.5 text-green-600" /> :
           withdrawalNotif.type === 'info'   ? <Info size={18} className="shrink-0 mt-0.5 text-blue-600" /> :
                                                <XCircle size={18} className="shrink-0 mt-0.5 text-red-600" />}
          <span className="flex-1">{withdrawalNotif.message}</span>
          <button onClick={() => setWithdrawalNotif(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <XIcon size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 w-full">
          <div className="mb-8">

            {/* ── Banner area: soft profile-completion reminder (never blocks the job list) + AI match banner ── */}
            {!isProfileReady && (
              <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg p-6 mb-6 text-white">
                <div className="flex items-start gap-4">
                  <div className="bg-white/20 p-3 rounded-full flex-shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">Complete Your Profile for Better Job Matches</h3>
                    <p className="text-sm text-yellow-100 mt-1">
                      Your profile is {completionPercentage}% complete. Complete it to get a job feed fitted to your profile and interests.
                    </p>
                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex-1 max-w-xs">
                        <div className="w-full bg-white/30 rounded-full h-2">
                          <div className="bg-white h-2 rounded-full transition-all duration-500" style={{ width: `${completionPercentage}%` }} />
                        </div>
                      </div>
                      <span className="text-sm font-semibold">{completionPercentage}%</span>
                    </div>
                    <button
                      onClick={() => onViewChange?.('profile')}
                      className="mt-3 px-4 py-2 bg-white text-orange-600 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors"
                    >
                      Complete Profile Now →
                    </button>
                  </div>
                </div>
              </div>
            )}

            <AIMatchBanner
              matchFilter={matchFilter}
              onSetMatchFilter={setMatchFilter}
              aiMatchesCount={aiMatches.filter(m => (m.matchScore || 0) >= 90).length}
              appliedJobsCount={appliedJobs.length}
              filteredMatchesLength={displayJobs.length}
            />

            {/* Candidate info strip   only when matches are loaded */}
            {candidateInfo && aiMatches.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-gray-700">
                <span className="font-medium"> {candidateInfo.name}</span> •
                <span className="ml-2">📊 {candidateInfo.level}</span> •
                <span className="ml-2"> {candidateInfo.total_experience_years} years exp</span> •
                <span className="ml-2">''Skills: {candidateInfo.skills?.slice(0, 5).join(', ')}</span>
              </div>
            )}

            <StatsCards aiMatches={aiMatches} />

            {/* ── Main content area ── */}
            {matchesLoading ? (
              // AI matching in progress   show spinner ONLY here, not the "no matches" empty state
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-gray-700 font-medium">Finding your best job matches...</p>
                  <p className="text-gray-400 text-sm mt-1">AI is analysing your profile against all open roles</p>
                </div>
              </div>
            ) : jobError ? (
              <div className="text-center py-12 rounded-lg bg-red-50">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-500" />
                <p className="text-red-600">{jobError}</p>
                <button
                  onClick={() => fetchAiJobMatches(completionPercentage)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : displayJobs.length === 0 && aiMatches.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No AI job matches found</h3>
                <p className="text-gray-600">Complete your profile to get personalized job recommendations.</p>
                <button onClick={() => onViewChange?.('profile')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Complete Profile</button>
              </div>
            ) : displayJobs.length === 0 && aiMatches.length > 0 ? (
              <div className="text-center py-12 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-3" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No matches for this filter</h3>
                <p className="text-gray-600">Try changing the filter to see more job matches.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayJobs.map((job, index) => (
                  <JobCard
                    key={job.id || index}
                    job={job}
                    isAiMatch={job.matchScore}
                    isApplied={appliedJobs.includes(job.id)}
                    isSaved={savedJobs.has(job.id)}
                    getMatchColor={getMatchColor}
                    getScoreColor={getScoreColor}
                    onViewDetails={handleViewDetails}
                    onSaveJob={handleSaveJob}
                    onViewApplication={handleViewApplication}
                    onWithdrawApplication={handleWithdrawApplication}
                    onApplyNow={handleApplyNow}
                    formatFullDate={formatFullDate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-1 w-full space-y-4 sm:space-y-6">
          {fullCandidateProfile === null ? (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Complete Your Profile</h3>
              <div className="text-center">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-4">Set up your candidate profile to unlock job applications</p>
                <button onClick={() => onViewChange?.('profile')} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Create Profile</button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Profile Progress</h3>
              
              <ProfileProgressRing
                percentage={completionPercentage}
                sections={completionStatus?.sections}
                showWarning={completionPercentage < 80}
              />
              <button
                onClick={() => onViewChange?.('profile')}
                className={`w-full mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${completionPercentage < 80
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
              >
                {completionPercentage < 80
                  ? ` Complete Profile (${completionPercentage}%)`
                  : completionPercentage === 100 ? 'Update Profile': 'Complete Profile'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showApplicationModal && selectedMatchForApply && fullCandidateProfile && (
        <JobApplicationModal
          isOpen={showApplicationModal}
          onClose={() => { setShowApplicationModal(false); setSelectedMatchForApply(null); }}
          // In DashboardHome.tsx - update the onSuccess callback for JobApplicationModal
          onSuccess={(data?: any) => {
            // Always mark the job as applied
            if (selectedMatchForApply) {
              appliedJobsManager.addAppliedJob(selectedMatchForApply.id);
              setAppliedJobs(prev => [...prev, selectedMatchForApply.id]);
            }

            // Leave the modal open   it closes itself when the candidate dismisses it
            // (onClose).
          }}
          job={{
            id: selectedMatchForApply.id,
            title: selectedMatchForApply.title,
            company_name: selectedMatchForApply.company,
            location: selectedMatchForApply.location,
            salary_range: selectedMatchForApply.salary,
            job_type: selectedMatchForApply.type,
            work_arrangement: selectedMatchForApply.workArrangement,
            description: selectedMatchForApply.description,
            requirements: selectedMatchForApply.requirements,
            skills_required: selectedMatchForApply.skills,
            screeningQuestions: selectedMatchForApply.screeningQuestions,
            expires_at: selectedMatchForApply.expiresAt
          }}
          candidateProfile={{
            profile: fullCandidateProfile.profile?.personal_info || {},
            skills: fullCandidateProfile.skills || [],
            education: fullCandidateProfile.education || [],
            workExperience: fullCandidateProfile.work_experience || [],
            portfolioLinks: fullCandidateProfile.portfolio_links || [],
            resumes: fullCandidateProfile.resumes || [],
          }}
          matchScore={selectedMatchForApply.matchScore || 78.7}
          matchDetails={{
            matcher_score: selectedMatchForApply.matcherScore,
            hybrid_score: selectedMatchForApply.hybridScore,
            score_source: selectedMatchForApply.scoreSource,
            reasons: selectedMatchForApply.reasons,
            criteria_scores: selectedMatchForApply.criteriaScores,
            factor_weights_used: selectedMatchForApply.factorWeightsUsed,
            excluded_factors: selectedMatchForApply.excludedFactors,
            skills_breakdown: selectedMatchForApply.skillsBreakdown,
            qualifications_breakdown: selectedMatchForApply.qualificationsBreakdown,
            experience_breakdown: selectedMatchForApply.experienceBreakdown,
            preferences_breakdown: selectedMatchForApply.preferencesBreakdown,
            hybrid_detail: selectedMatchForApply.hybridDetail,
            hybrid_content_included: selectedMatchForApply.hybridContentIncluded,
            outer_weights_used: selectedMatchForApply.outerWeightsUsed
          }}
          requiredDocuments={[{ name: 'Resume', is_required: true }, { name: 'Cover Letter', is_required: false }]}
        />
      )}

      {showDetails && selectedMatch && (
        <JobViewModal
          isOpen={showDetails}
          onClose={() => { setShowDetails(false); setSelectedMatch(null); }}
          matchScore={selectedMatch.matchScore}
          matchData={selectedMatch}
          candidateInfo={candidateInfo}
          job={{
            id: selectedMatch.id,
            title: selectedMatch.title,
            company_name: selectedMatch.company,
            location: selectedMatch.location,
            salary_range: selectedMatch.salary,
            salary_min: selectedMatch.rawJob?.salary_min,
            salary_max: selectedMatch.rawJob?.salary_max,
            salary_currency: selectedMatch.rawJob?.salary_currency,
            salary_period: selectedMatch.rawJob?.salary_period,
            job_type: selectedMatch.type,
            work_arrangement: selectedMatch.workArrangement,
            description: selectedMatch.description,
            responsibilities: selectedMatch.responsibilities,
            requirements: selectedMatch.requirements,
            skills_required: selectedMatch.rawJob?.skills_required || selectedMatch.skills,
            benefits: selectedMatch.benefits,
            tags: selectedMatch.tags,
            screeningQuestions: selectedMatch.screeningQuestions,
            expires_at: selectedMatch.expiresAt,
            published_at: selectedMatch.publishedAt,
            application_count: selectedMatch.applications,
            experience_min: selectedMatch.rawJob?.experience_min,
            experience_max: selectedMatch.rawJob?.experience_max,
            experience_level: selectedMatch.experienceLevel,
            department: selectedMatch.department,
            education_required: selectedMatch.rawJob?.education_required,
            status: selectedMatch.status,
          }}
        />
      )}
    </>
  );
};

export default DashboardHome;