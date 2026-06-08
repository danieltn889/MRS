// components/DashboardHome/index.tsx
import React, { useState, useEffect } from 'react';
import {
  User, Briefcase, Search, Users, AlertCircle, Building2, Filter, Calendar, BarChart3, Target
} from 'lucide-react';
import ProfileProgressRing from './ProfileProgressRing';
import SimulationScheduler from './Simulation/SimulationScheduler';
import JobCard from './DashboardHome/JobCard';
import AIMatchBanner from './DashboardHome/AIMatchBanner';
import StatsCards from './DashboardHome/StatsCards';
import { getJobs } from '../services/jobAPI';
import { submitApplication, getApplications, getApplication, withdrawApplication } from '../services/applicationAPI';
import { getProfileCompletionStatus } from '../services/candidateAPI';
import { getMySimulations } from '../services/simulationAPI';
import JobViewModal from './jobs/JobViewModal';
import JobApplicationModal from './jobs/JobApplicationModal';
import appliedJobsManager from '../src/utils/AppliedJobsManager';
import { getJobMatchesFromAI } from '../services/aiJobMatchingService';
import { saveJob, unsaveJob, loadSavedJobsFromAPI } from '../services/jobStorageService';
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

// Update the AIMatch interface to include all missing properties
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
  matchLevel?: string;
  criteriaScores?: any;
  skillsBreakdown?: any;
  experienceBreakdown?: any;
  qualificationsBreakdown?: any;
  preferencesBreakdown?: any;
  rawJob?: any;
  // Add missing properties
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

interface Simulation {
  id: string;
  simulationName: string;
  title: string;
  description: string;
  duration: number;
  status: 'completed' | 'in_progress' | 'not_started';
  score?: number;
  companyName: string;
  jobTitle: string;
  progress: number;
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
  additional: AdditionalStats;  // Made required, not optional
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
  const [allJobs, setAllJobs] = useState<any[]>([]);
  const [aiMatches, setAiMatches] = useState<AIMatch[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [profileLoading, setProfileLoading] = useState(true);
  const [realSimulations, setRealSimulations] = useState<Simulation[]>([]);
  
  // Company dashboard stats state - Fixed with proper default
  const [companyStats, setCompanyStats] = useState<CompanyDashboardStats>({
    active_jobs: 0,
    total_applications: 0,
    qualified_candidates: 0,
    interviews_scheduled: 0,
    additional: DEFAULT_ADDITIONAL_STATS
  });
  const [statsLoading, setStatsLoading] = useState(true);

  // Check user type
  const userTypeValue = user?.userType || user?.user_type || '';
  const isCompanyUser = userTypeValue === 'recruiter' || 
                        userTypeValue === 'company_admin' || 
                        userTypeValue === 'company' ||
                        userTypeValue === 'Company Admin' ||
                        userTypeValue === 'Recruiter';

  // Debug logging
  useEffect(() => {
    console.log('🔍 DashboardHome Debug:', {
      user: user,
      userTypeValue: userTypeValue,
      isCompanyUser: isCompanyUser,
      userId: user?.id
    });
  }, [user, userTypeValue, isCompanyUser]);

  // Fetch company dashboard statistics - FIXED with proper additional object
  const fetchCompanyDashboardStats = async () => {
    if (!isCompanyUser) {
      console.log('⚠️ Not a company user, skipping stats fetch');
      return;
    }
    
    setStatsLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      console.log('🔑 Auth token present:', !!token);
      console.log('🔑 Auth token value (first 20 chars):', token?.substring(0, 20));
      
      if (!token) {
        console.error('❌ No auth token found');
        setStatsLoading(false);
        return;
      }

      const url = `${API_BASE_URL}/jobs/company/stats`;
      console.log('📡 Fetching company stats from:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('📊 Response status:', response.status);
      
      if (response.status === 401) {
        console.error('❌ Unauthorized - token may be expired');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setStatsLoading(false);
        return;
      }

      const result = await response.json();
      console.log('📦 Full API Response:', JSON.stringify(result, null, 2));
      
      if (result.success && result.data) {
        console.log('✅ Stats received:', result.data);
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
      } else {
        console.error('❌ Failed to fetch company stats:', result.message || 'Unknown error');
        setCompanyStats({
          active_jobs: 0,
          total_applications: 0,
          qualified_candidates: 0,
          interviews_scheduled: 0,
          additional: DEFAULT_ADDITIONAL_STATS
        });
      }
    } catch (error) {
      console.error('❌ Error fetching company dashboard stats:', error);
      setCompanyStats({
        active_jobs: 0,
        total_applications: 0,
        qualified_candidates: 0,
        interviews_scheduled: 0,
        additional: DEFAULT_ADDITIONAL_STATS
      });
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch AI job matches with timeout
  const fetchWithTimeout = async (promise: Promise<any>, timeoutMs: number = 30000) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Request timeout - please try again')), timeoutMs);
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

  const fetchAiJobMatches = async () => {
    if (isCompanyUser) {
      console.log('Company user - skipping AI matches');
      setLoading(false);
      return;
    }
    
    try {
      const candidateId = user?.id;
      if (!candidateId) {
        console.log('❌ No candidate ID found');
        setJobError('User ID not found. Please log in again.');
        setLoading(false);
        return;
      }
      
      console.log('📊 Fetching AI matches for candidate:', candidateId);
      
      const data = await fetchWithTimeout(getJobMatchesFromAI(candidateId), 30000);
      
      console.log('📊 API Response:', data);
      
      if (data && data.success && data.matches) {
        // Set candidate info
        if (data.candidate) {
          setCandidateInfo({
            name: data.candidate.name || data.candidate.full_name || 'Candidate',
            level: data.candidate.level || 'Professional',
            total_experience_years: data.candidate.total_experience_years || 0,
            skills: data.candidate.skills || []
          });
        }
        
        // Transform matches
        const transformedMatches = data.matches.map((match: any) => {
          const jobData = match.job || {};
          const companyData = jobData.company || {};
          
          return {
            id: jobData.id || match.id,
            title: jobData.title || match.title,
            company: companyData.name || jobData.company_name || match.company || 'Unknown Company',
            location: jobData.locations?.[0]?.city || jobData.location || match.location || 'Location not specified',
            salary: match.salary,
            type: jobData.job_type || match.type || 'Full-time',
            workArrangement: jobData.work_arrangement || match.workArrangement || 'Onsite',
            description: jobData.description || match.description,
            requirements: jobData.requirements || match.requirements,
            skills: jobData.skills_required?.map((s: any) => typeof s === 'string' ? s : s.name) || match.skills,
            screeningQuestions: jobData.screening_questions || match.screeningQuestions,
            expiresAt: jobData.expires_at || match.expiresAt,
            matchScore: match.match_score || match.matchScore || 0,
            matchLevel: match.match_level || match.matchLevel,
            criteriaScores: match.criteria_scores || match.criteriaScores,
            skillsBreakdown: match.skills_breakdown || match.skillsBreakdown,
            experienceBreakdown: match.experience_breakdown || match.experienceBreakdown,
            qualificationsBreakdown: match.qualifications_breakdown || match.qualificationsBreakdown,
            preferencesBreakdown: match.preferences_breakdown || match.preferencesBreakdown,
            rawJob: jobData
          };
        });
        
        console.log('✅ Transformed matches:', transformedMatches.length);
        setAiMatches(transformedMatches);
        setJobError(null);
      } else {
        console.log('No matches found');
        setAiMatches([]);
        setJobError(data?.message || 'No job matches found. Complete your profile for better recommendations.');
      }
    } catch (error: any) {
      console.error('Error fetching AI matches:', error);
      setJobError(error.message || 'Failed to load job matches. Please try again later.');
      setAiMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFullCandidateProfile = async () => {
    try {
      setProfileLoading(true);
      if (isCompanyUser) {
        setProfileLoading(false);
        return;
      }
      const token = localStorage.getItem('authToken');
      if (!token || !user?.id) {
        setProfileLoading(false);
        return;
      }
      const response = await fetch(`${API_BASE_URL}/candidates/full-profile/${user.id}`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setProfileLoading(false);
        return;
      }
      const data = await response.json();
      if (data.success) {
        setFullCandidateProfile(data.data);
        const statusResponse = await getProfileCompletionStatus();
        if (statusResponse.success && statusResponse.data) {
          setCompletionStatus(statusResponse.data);
        }
      }
    } catch (error) {
      console.error('Error fetching full profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchRealSimulations = async () => {
    if (isCompanyUser) {
      setRealSimulations([]);
      return;
    }
    
    try {
      const response = await getMySimulations({ page: 1, limit: 10 });
      if (response.success && response.data) {
        const rawData = response.data.data || response.data;
        const mappedSimulations = rawData.map((sim: any) => ({
          id: sim.id,
          simulationName: sim.simulationName,
          title: sim.simulationName,
          description: sim.description,
          duration: sim.duration,
          status: sim.completedAt ? 'completed' : (sim.startedAt ? 'in_progress' : 'not_started'),
          score: sim.score,
          companyName: sim.companyName,
          jobTitle: sim.jobTitle,
          progress: sim.completedAt ? 100 : (sim.startedAt ? 50 : 0)
        }));
        setRealSimulations(mappedSimulations);
      }
    } catch (error) {
      console.error('Error fetching simulations:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      console.log('Loading data for user:', user.id);
      
      try {
        const savedJobIds = await loadSavedJobsFromAPI();
        setSavedJobs(new Set(savedJobIds));
      } catch (error) {
        console.error('Error loading saved jobs:', error);
      }
      
      if (!isCompanyUser) {
        await Promise.all([
          fetchFullCandidateProfile(),
          fetchRealSimulations(),
          fetchAiJobMatches()
        ]);
      } else {
        // Fetch company dashboard stats for company users
        await fetchCompanyDashboardStats();
        setLoading(false);
      }
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
      setLoading(false);
    }
    
    return () => appliedJobsManager.removeListener(handleAppliedJobsChange);
  }, [user?.id, isCompanyUser]);

  const handleSaveJob = async (jobId: string, isCurrentlySaved: boolean) => {
    try {
      if (isCurrentlySaved) {
        await unsaveJob(jobId);
        setSavedJobs(prev => { const newSet = new Set(prev); newSet.delete(jobId); return newSet; });
        alert('Job removed from saved!');
      } else {
        await saveJob(jobId);
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
  const completionPercentage = completionStatus?.completionPercentage || fullCandidateProfile?.profile?.profile_completion || 0;

  // Helper function to format numbers with K/M suffixes
  const formatStatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // COMPANY USER VIEW with real data
  if (isCompanyUser) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white">
          <h1 className="text-3xl font-bold mb-2">Company Dashboard</h1>
          <p className="text-blue-100 mb-6">Welcome to your recruitment management dashboard</p>
          <div className="flex flex-wrap gap-4">
            <button onClick={() => onViewChange?.('jobs')} className="px-6 py-2 bg-white text-blue-600 rounded-lg font-semibold hover:bg-gray-100 transition-colors">Post New Job</button>
            <button onClick={() => onViewChange?.('candidates')} className="px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-400 transition-colors">Find Candidates</button>
          </div>
        </div>

        {/* Stats Cards with Real Data */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Active Jobs Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Active Jobs</p>
                {statsLoading ? (
                  <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.active_jobs)}</p>
                )}
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <button 
              onClick={() => onViewChange?.('jobs')}
              className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              View all jobs →
            </button>
          </div>

          {/* Total Applications Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Applications</p>
                {statsLoading ? (
                  <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.total_applications)}</p>
                )}
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <button 
              onClick={() => onViewChange?.('applications')}
              className="mt-4 text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1"
            >
              View applications →
            </button>
          </div>

          {/* Qualified Candidates Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Qualified Candidates</p>
                {statsLoading ? (
                  <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.qualified_candidates)}</p>
                )}
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <button 
              onClick={() => onViewChange?.('candidates')}
              className="mt-4 text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
            >
              Find candidates →
            </button>
          </div>

          {/* Interviews Scheduled Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-yellow-500 transition-all hover:shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Interviews Scheduled</p>
                {statsLoading ? (
                  <div className="h-8 w-20 bg-gray-200 animate-pulse rounded mt-1"></div>
                ) : (
                  <p className="text-3xl font-bold text-gray-800">{formatStatNumber(companyStats.interviews_scheduled)}</p>
                )}
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
            <button 
              onClick={() => onViewChange?.('interviews')}
              className="mt-4 text-xs text-yellow-600 hover:text-yellow-800 font-medium flex items-center gap-1"
            >
              Schedule interview →
            </button>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Draft Jobs</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.draft_jobs}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Under Review</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.under_review}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Shortlisted</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.shortlisted}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Offers</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.offers}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Hired</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.hired}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Rejected</p>
            <p className="text-xl font-semibold text-gray-700">{companyStats.additional.rejected}</p>
          </div>
        </div>

        {/* Action Buttons */}
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

          <button onClick={() => onViewChange?.('simulations-list')} className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg transition-shadow group">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-orange-200 transition-colors"><Target className="w-6 h-6 text-orange-600" /></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Manage Simulations</h3>
            <p className="text-gray-500 text-sm">Create and manage skill assessment simulations</p>
          </button>
        </div>
      </div>
    );
  }

  // CANDIDATE USER VIEW
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 w-full">
          <div className="mb-8">
            <AIMatchBanner 
              matchFilter={matchFilter}
              onSetMatchFilter={setMatchFilter}
              aiMatchesCount={aiMatches.filter(m => (m.matchScore || 0) >= 90).length}
              appliedJobsCount={appliedJobs.length}
              filteredMatchesLength={displayJobs.length}
            />
            
            {candidateInfo && aiMatches.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-gray-700">
                <span className="font-medium">👤 {candidateInfo.name}</span> • 
                <span className="ml-2">📊 {candidateInfo.level}</span> • 
                <span className="ml-2">💼 {candidateInfo.total_experience_years} years exp</span> • 
                <span className="ml-2">🎯 Skills: {candidateInfo.skills?.slice(0, 5).join(', ')}</span>
              </div>
            )}

            <StatsCards aiMatches={aiMatches} />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="ml-3 text-gray-600">Loading AI job matches...</p>
              </div>
            ) : jobError ? (
              <div className="text-center py-12 bg-red-50 rounded-lg">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <p className="text-red-600">{jobError}</p>
                <button onClick={() => fetchAiJobMatches()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Retry</button>
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
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No matches for filter</h3>
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
                    onWithdrawApplication={() => {}}
                    onApplyNow={handleApplyNow}
                    formatFullDate={formatFullDate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 w-full space-y-4 sm:space-y-6">
          {profileLoading ? (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            </div>
          ) : fullCandidateProfile === null ? (
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
              <ProfileProgressRing percentage={completionPercentage} sections={completionStatus?.sections} />
              <button onClick={() => onViewChange?.('profile')} className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
                {completionPercentage === 100 ? 'Update Profile' : 'Complete Profile'}
              </button>
            </div>
          )}
          
          <div className="sticky top-96">
            <SimulationScheduler simulations={realSimulations} onStartSimulation={(sim) => onViewChange?.('simulation')} />
          </div>
        </div>
      </div>

      {showApplicationModal && selectedMatchForApply && fullCandidateProfile && (
        <JobApplicationModal
          isOpen={showApplicationModal}
          onClose={() => { setShowApplicationModal(false); setSelectedMatchForApply(null); }}
          onSuccess={() => {
            if (selectedMatchForApply) {
              appliedJobsManager.addAppliedJob(selectedMatchForApply.id);
              setAppliedJobs([...appliedJobs, selectedMatchForApply.id]);
            }
            setShowApplicationModal(false);
            setSelectedMatchForApply(null);
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
          requiredDocuments={['Resume', 'Cover Letter']}
        />
      )}

      {showDetails && selectedMatch && (
        <JobViewModal
          isOpen={showDetails}
          onClose={() => { setShowDetails(false); setSelectedMatch(null); }}
          matchScore={selectedMatch.matchScore}
          criteria_scores={{
            skillsScore: selectedMatch.criteriaScores?.skills_match,
            qualificationsScore: selectedMatch.criteriaScores?.qualifications_match,
            experienceScore: selectedMatch.criteriaScores?.experience_match,
            preferencesScore: selectedMatch.criteriaScores?.preferences_match,
          }}
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