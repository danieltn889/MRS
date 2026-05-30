// components/DashboardHome/index.tsx
import React, { useState, useEffect } from 'react';
import {
  User, Briefcase, Search, Users, AlertCircle, Building2, Filter
} from 'lucide-react';
import ProfileProgressRing from './ProfileProgressRing';
import SimulationScheduler from './Simulation/SimulationScheduler.tsx';
import JobCard from './DashboardHome/JobCard.tsx';
import AIMatchBanner from './DashboardHome/AIMatchBanner.tsx';
import StatsCards from './DashboardHome/StatsCards.tsx';
import { getJobs } from '../services/jobAPI';
import { submitApplication, getApplications, getApplication, withdrawApplication } from '../services/applicationAPI';
import { getProfileCompletionStatus } from '../services/candidateAPI';
import { getMySimulations } from '../services/simulationAPI';
import JobViewModal from './jobs/JobViewModal.tsx';
import JobApplicationModal from './jobs/JobApplicationModal.tsx';
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

  const isCompanyUser = user?.userType?.toLowerCase() === 'recruiter';

  // Fetch functions (same as before, but simplified)
  const fetchAiJobMatches = async () => {
    try {
      const candidateId = user?.id;
      if (!candidateId) return;
      const data = await getJobMatchesFromAI(candidateId);
      if (data.success) {
        setCandidateInfo(data.candidate);
        const transformedMatches = data.matches.map((match: any) => 
          transformMatchData(match, formatNumber, formatDate, getDaysRemaining, getExpiryStatusColor)
        );
        setAiMatches(transformedMatches);
      }
    } catch (error) {
      console.error('Error fetching AI matches:', error);
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
      if (!user?.id) return;
      setLoading(true);
      try {
        const savedJobIds = await loadSavedJobsFromAPI();
        setSavedJobs(new Set(savedJobIds));
      } catch (error) {
        console.error('Error loading saved jobs:', error);
      }
      await Promise.all([
        fetchFullCandidateProfile(),
        fetchRealSimulations(),
        fetchAiJobMatches()
      ]);
      setLoading(false);
    };
    
    const loadApplications = async () => {
      await appliedJobsManager.loadFromAPI();
      setAppliedJobs(appliedJobsManager.getAllAppliedJobs());
    };
    
    const handleAppliedJobsChange = (appliedJobIds: string[]) => setAppliedJobs(appliedJobIds);
    appliedJobsManager.addListener(handleAppliedJobsChange);
    loadApplications();
    if (user?.id) loadData();
    return () => appliedJobsManager.removeListener(handleAppliedJobsChange);
  }, [user?.id]);

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
    // Create a simple alert to show application status
    // In a real app, you'd fetch the full application details from the API
    alert(`You have applied for "${job.title}" at ${job.company}.\n\nApplication Status: Submitted\n\nYou can check back later for updates on your application status.`);
  };

  const filteredMatches = aiMatches.filter(match => {
    if (matchFilter === 'all') return true;
    if (matchFilter === 'applied') return appliedJobs.includes(match.id);
    if (matchFilter === 'high') return match.matchScore! >= 90;
    if (matchFilter === 'medium') return match.matchScore! >= 75 && match.matchScore! < 90;
    if (matchFilter === 'low') return match.matchScore! < 75;
    return true;
  });

  const displayJobs = aiMatches.length > 0 ? filteredMatches : allJobs;
  const completionPercentage = completionStatus?.completionPercentage || fullCandidateProfile?.profile?.profile_completion || 0;

  if (isCompanyUser) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Company Dashboard</h1>
          <p className="text-gray-600 mb-6">Welcome to your recruitment management dashboard</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => onViewChange?.('jobs')} className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-left">
              <Briefcase className="w-8 h-8 mb-2" /><h3 className="font-semibold mb-1">Post New Job</h3>
            </button>
            <button onClick={() => onViewChange?.('team')} className="p-4 bg-green-600 hover:bg-green-700 text-white rounded-lg text-left">
              <Users className="w-8 h-8 mb-2" /><h3 className="font-semibold mb-1">Manage Team</h3>
            </button>
            <button onClick={() => onViewChange?.('candidates')} className="p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-left">
              <Search className="w-8 h-8 mb-2" /><h3 className="font-semibold mb-1">Find Candidates</h3>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-3 w-full">
          <div className="mb-8">
            <AIMatchBanner 
              matchFilter={matchFilter}
              onSetMatchFilter={setMatchFilter}
              aiMatchesCount={aiMatches.filter(m => m.matchScore >= 90).length}
              appliedJobsCount={appliedJobs.length}
              filteredMatchesLength={filteredMatches.length}
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
              </div>
            ) : jobError ? (
              <div className="text-center py-12 bg-red-50 rounded-lg">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <p className="text-red-600">{jobError}</p>
              </div>
            ) : displayJobs.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No jobs found</h3>
                <p className="text-gray-600">Update your profile to see more job matches.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayJobs.map((job) => (
                  <JobCard
                    key={job.id}
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
            // Update applied jobs list when application is successful
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
            skillsScore:         selectedMatch.criteriaScores?.skills_match,
            qualificationsScore: selectedMatch.criteriaScores?.qualifications_match,
            experienceScore:     selectedMatch.criteriaScores?.experience_match,
            preferencesScore:    selectedMatch.criteriaScores?.preferences_match,
          }}
          matchData={selectedMatch}
          candidateInfo={candidateInfo}
          job={{
            id:               selectedMatch.id,
            title:            selectedMatch.title,
            company_name:     selectedMatch.company,
            location:         selectedMatch.location,
            salary_range:     selectedMatch.salary,
            salary_min:       selectedMatch.rawJob?.salary_min,
            salary_max:       selectedMatch.rawJob?.salary_max,
            salary_currency:  selectedMatch.rawJob?.salary_currency,
            salary_period:    selectedMatch.rawJob?.salary_period,
            job_type:         selectedMatch.type,
            work_arrangement: selectedMatch.workArrangement,
            description:      selectedMatch.description,
            responsibilities: selectedMatch.responsibilities,
            requirements:     selectedMatch.requirements,
            skills_required:  selectedMatch.rawJob?.skills_required || selectedMatch.skills,
            benefits:         selectedMatch.benefits,
            tags:             selectedMatch.tags,
            screeningQuestions: selectedMatch.screeningQuestions,
            expires_at:       selectedMatch.expiresAt,
            published_at:     selectedMatch.publishedAt,
            application_count: selectedMatch.applications,
            experience_min:   selectedMatch.rawJob?.experience_min,
            experience_max:   selectedMatch.rawJob?.experience_max,
            experience_level: selectedMatch.experienceLevel,
            department:       selectedMatch.department,
            education_required: selectedMatch.rawJob?.education_required,
            status:           selectedMatch.status,
          }}
        />
      )}
    </>
  );
};

export default DashboardHome;