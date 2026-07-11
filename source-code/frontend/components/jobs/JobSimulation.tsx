import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, RefreshCw, AlertCircle, Building2, Play } from 'lucide-react';
import { 
  getMySimulations, 
  getMySimulationStats, 
  startAppliedJobSimulation, 
  resumeMySimulation, 
  getMySimulationById,
  getSessionById
} from '../../services/simulationAPI';
import SimulationCard from '../SimulationExecutor/JobSimulation/SimulationCard';
import StatsCards from '../SimulationExecutor/JobSimulation/StatsCards';
import StatusFilter from '../SimulationExecutor/JobSimulation/StatusFilter';
import { 
  SessionStartDialog, 
  RepoCreatedDialog, 
  ResumeSimulationDialog 
} from '../SimulationExecutor/Dialogs';
import { useGitHubRepo } from '../SimulationExecutor/context/GitHubRepoContext';
import { 
  resolveStatus, 
  deduplicateSimulations, 
  getAvailabilityStatus, 
  getCurrentDayInTz, 
  getCurrentTimeInTz,
  Simulation 
} from '../SimulationExecutor/JobSimulation/simulationHelpers';

// Extended Simulation interface with additional display fields
interface ExtendedSimulation extends Simulation {
  name?: string;
  jobId?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  companyDescription?: string;
  simulationName?: string;
  description?: string;
  duration?: number;
  difficulty?: string;
  type?: string;
  score?: number | string;
  appliedAt?: string;
  applicationStatus?: string;
  matchScore?: number;
  tasks?: any[];
  tasksStructure?: any;
  scoringRubric?: any;
  passFailCriteria?: any;
  instructions?: string;
  sessionDetails?: any;
  sessionId?: string;
  sessionStatus?: string;
  simulation_status?: string;
}

interface JobSimulationProps {
  onBack: () => void;
}

// Helper function to check if score has a valid value
const hasValidScore = (score: any): boolean => {
  if (score === null || score === undefined) return false;
  const strScore = String(score).trim();
  if (strScore === ''|| strScore === 'null'|| strScore === 'undefined') return false;
  const numScore = parseFloat(strScore);
  return !isNaN(numScore) && numScore > 0;
};

// Helper function to check if simulation has valid configuration (has tasks)
const hasValidConfig = (simulation: ExtendedSimulation): boolean => {
  return simulation.tasks !== null && 
         simulation.tasks !== undefined && 
         Array.isArray(simulation.tasks) && 
         simulation.tasks.length > 0;
};

const JobSimulation: React.FC<JobSimulationProps> = ({ onBack }) => {
  const navigate = useNavigate();
  const { clearAllTaskRepos } = useGitHubRepo();
  const [simulations, setSimulations] = useState<ExtendedSimulation[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [startingSimulation, setStartingSimulation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllTasks, setShowAllTasks] = useState<Record<string, boolean>>({});
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [sessionStartDialogOpen, setSessionStartDialogOpen] = useState(false);
  const [repoCreatedDialogOpen, setRepoCreatedDialogOpen] = useState(false);
  
  // State variables for resume dialog
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeSessionData, setResumeSessionData] = useState<any>(null);
  const [resumeSimulationRef, setResumeSimulationRef] = useState<ExtendedSimulation | null>(null);
  const [repoData, setRepoData] = useState<any>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pendingSimulation, setPendingSimulation] = useState<ExtendedSimulation | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  
  // State for no session modal
  const [noSessionModalOpen, setNoSessionModalOpen] = useState(false);
  const [noSessionSimulation, setNoSessionSimulation] = useState<ExtendedSimulation | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadSimulations = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = { page: 1, limit: 50 };
      if (selectedStatus !== 'all'&& ['not_started', 'in_progress', 'completed'].includes(selectedStatus)) {
        params.status = selectedStatus;
      }

      const response = await getMySimulations(params);

      if (response.success && response.data) {
        const rawData = response.data.data ?? response.data;
        const mapped: ExtendedSimulation[] = rawData.map((sim: any) => {
          // Check all possible session ID locations
          const sessionId = sim.sessionId || 
                           sim.session?.id || 
                           sim.session_id ||
                           sim.simulation_session?.id;
          
          const sessionStatus = sim.sessionStatus || sim.session?.status;
          const hasSessionId = !!sessionId;
          const hasScore = hasValidScore(sim.score);
          
          // Determine the correct status based on session status
          let computedStatus = sim.status;
          
          // If there's a session and it's completed, mark as completed
          if (hasSessionId && sessionStatus === 'completed') {
            computedStatus = 'completed';
          }
          // If there's a session and it's in progress, mark as in_progress
          else if (hasSessionId && (sessionStatus === 'in_progress'|| sessionStatus === 'scheduled')) {
            computedStatus = 'in_progress';
          }
          // If completed from API
          else if (sim.status === 'completed') {
            computedStatus = 'completed';
          }
          // If has score without session (legacy)
          else if (hasScore && !hasSessionId) {
            computedStatus = 'completed';
          }
          
          console.log(`📊 Simulation ${sim.id}:`, {
            status: computedStatus,
            hasSessionId,
            sessionId,
            sessionStatus,
            hasScore,
            originalStatus: sim.status,
            hasTasks: sim.tasks && Array.isArray(sim.tasks) && sim.tasks.length > 0
          });
          
          return {
            ...sim,
            status: computedStatus,
            sessionId: sessionId,
            sessionStatus: sessionStatus,
            simulation_status: sim.simulation_status || sim.status,
            is_completed: computedStatus === 'completed'
          };
        });
        setSimulations(deduplicateSimulations(mapped) as ExtendedSimulation[]);
      } else {
        setSimulations([]);
      }
    } catch (err: any) {
      console.error('Failed to load simulations:', err);
      setError(err.message || 'Failed to load practical assessments');
      setSimulations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await getMySimulationStats();
      if (response.success && response.data) {
        setStats(response.data.stats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    loadSimulations();
    loadStats();
  }, [selectedStatus]);

  // Handle viewing report - using handleViewReport pattern
  const handleViewReport = (sessionId: string) => {
    console.log('📊 Viewing report for session ID:', sessionId);
    navigate(`/session-report/${sessionId}`);
  };

  // Fetch session details for resume dialog using simulationAPI
  const fetchSessionDetails = async (sessionId: string, simulation: ExtendedSimulation) => {
    try {
      setIsResuming(true);
      
      console.log('🔍 Fetching session details for sessionId:', sessionId);
      
      const response = await getSessionById(sessionId);
      const result = response?.data;
      const session = result?.session || result;
      
      console.log('📦 Session data received:', session);
      
      if (!session) {
        console.warn('Session not found, resuming directly');
        await handleResumeExistingSession(simulation);
        return;
      }
      
      let githubRepo = null;
      if (session.github_links || session.githubRepo) {
        const ghData = session.github_links || session.githubRepo;
        githubRepo = typeof ghData === 'string'? JSON.parse(ghData) : ghData;
        console.log('🐙 GitHub repo found in session:', githubRepo);
      }
      
      const userStr = localStorage.getItem('user');
      let isRecruiter = false;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          isRecruiter = user.user_type === 'recruiter'|| 
                        user.user_type === 'company_admin'|| 
                        user.user_type === 'system_admin';
        } catch (e) {
          console.error('Failed to parse user:', e);
        }
      }
      
      setResumeSessionData({
        sessionId: session.id,
        simulationName: simulation.simulationName || simulation.name || 'Practical Assessment',
        jobTitle: simulation.jobTitle,
        companyName: simulation.companyName,
        startedAt: session.started_at,
        lastActivityAt: session.updated_at,
        currentTask: session.current_task ? session.current_task + 1 : 1,
        totalTasks: simulation.tasks?.length || 0,
        timeSpent: session.time_spent,
        timeRemaining: session.time_remaining,
        progress: session.progress?.percentage || 
          (session.current_task && simulation.tasks?.length 
            ? Math.round((session.current_task / simulation.tasks.length) * 100) 
            : 0),
        githubRepo: githubRepo ? {
          repoName: githubRepo.repoName,
          repoUrl: githubRepo.repoUrl,
          cloneUrl: githubRepo.cloneUrl,
          branchName: githubRepo.branchName || 'main',
          organizationName: githubRepo.organizationName || 'recruitment-platform',
          candidateUsername: githubRepo.candidateUsername
        } : null,
        isRecruiter: isRecruiter
      });
      
      setResumeSimulationRef(simulation);
      setResumeDialogOpen(true);
      
    } catch (err) {
      console.error('Failed to fetch session details:', err);
      await handleResumeExistingSession(simulation);
    } finally {
      setIsResuming(false);
    }
  };

  const handleStartSimulation = async (simulation: ExtendedSimulation, forceNew: boolean = false) => {
    console.log('handleStartSimulation called:', { 
      simulationId: simulation.id, 
      forceNew, 
      hasSessionId: !!simulation.sessionId,
      sessionStatus: simulation.sessionStatus,
      status: simulation.status,
      score: simulation.score
    });
    
    if (!simulation.id || simulation.id === 'null') {
      alert('This practical assessment is not yet available.');
      return;
    }

    const { canStart, message } = getAvailabilityStatus(simulation, currentDateTime);
    if (!canStart) {
      alert(message);
      return;
    }

    // Check if there's an existing session ID to resume (only if session is not completed)
    if (simulation.sessionId && simulation.sessionStatus !== 'completed'&& !forceNew) {
      console.log('🔄 Existing active session found, showing resume dialog. SessionId:', simulation.sessionId);
      await fetchSessionDetails(simulation.sessionId, simulation);
      return;
    }

    // For new sessions, show GitHub username dialog
    console.log(' No existing active session or forceNew=true, showing GitHub dialog');
    setPendingSimulation(simulation);
    setSessionStartDialogOpen(true);
    setDialogError(null);
  };

  const handleResumeExistingSession = async (simulation: ExtendedSimulation) => {
    console.log('handleResumeExistingSession called with simulation:', simulation);
    
    const sessionId = simulation.sessionId;
    
    if (!sessionId) {
      console.error('No session ID available for resume');
      alert('Cannot resume: No active session found');
      return;
    }

    try {
      setIsResuming(true);
      setStartingSimulation(simulation.id || null);
      setResumeDialogOpen(false);
      
      console.log('🔄 Calling resumeMySimulation with sessionId:', sessionId);
      
      const resumeResponse = await resumeMySimulation(sessionId);
      
      console.log('📦 Resume response:', resumeResponse);
      
      if (resumeResponse.success && resumeResponse.data) {
        const sessionData = resumeResponse.data;
        const finalSessionId = sessionData.sessionId || sessionId;
        
        console.log('Resume successful, opening simulation with sessionId:', finalSessionId);
        
        window.open(`/simulation/execute/${finalSessionId}`, '_blank');
        
        await loadSimulations();
        await loadStats();
      } else {
        throw new Error(resumeResponse.message || 'Failed to resume practical assessment');
      }
    } catch (err: any) {
      console.error(' Failed to resume simulation:', err);
      alert(err.message || 'Failed to resume practical assessment. Please try again.');
    } finally {
      setIsResuming(false);
      setStartingSimulation(null);
      setResumeSessionData(null);
      setResumeSimulationRef(null);
    }
  };

  const handleResumeFromDialog = () => {
    console.log('🔘 Resume button clicked in dialog');
    if (resumeSimulationRef) {
      handleResumeExistingSession(resumeSimulationRef);
    } else {
      console.error('No simulation reference available for resume');
      alert('Cannot resume: Session data not found');
      handleCancelResume();
    }
  };

  const handleSessionStart = async (githubUsername: string) => {
    if (!pendingSimulation) return;
    const simulation = pendingSimulation;

    try {
      setDialogLoading(true);
      setDialogError(null);

      console.log(' Starting NEW simulation with:', {
        simulationId: simulation.id,
        applicationId: simulation.applicationId,
        githubUsername
      });

      const startResponse = await startAppliedJobSimulation(
        simulation.id || '',
        simulation.applicationId || '',
        githubUsername
      );

      console.log('📦 Start response:', startResponse);

      if (startResponse.success && startResponse.data) {
        const responseData = startResponse.data;
        
        const githubRepo = responseData.githubRepo || {
          repoName: responseData.repoName || `sim-${(simulation.id || '').substring(0, 8)}`,
          repoUrl: responseData.repoUrl || `https://github.com/danieltn889/sim-${(simulation.id || '').substring(0, 8)}`,
          cloneUrl: responseData.cloneUrl || `https://github.com/danieltn889/sim-${(simulation.id || '').substring(0, 8)}.git`,
          branchName: responseData.branchName || `candidate-${githubUsername.substring(0, 8)}`,
          organizationName: responseData.organizationName || responseData.orgName || 'danieltn889',
          candidateUsername: githubUsername,
          sessionId: responseData.sessionId,
          simulationId: responseData.simulationId || simulation.id,
          issues: responseData.issuesCreated || responseData.issues || [],
          existing: responseData.existing || false
        };

        setCreatedSessionId(githubRepo.sessionId || responseData.sessionId);
        setRepoData(githubRepo);
        setSessionStartDialogOpen(false);
        setRepoCreatedDialogOpen(true);
      } else {
        setDialogError(startResponse.message || 'Failed to create GitHub repository');
      }
    } catch (err: any) {
      console.error(' Failed to start simulation:', err);
      setDialogError(err.message || 'Failed to start practical assessment. Please try again.');
    } finally {
      setDialogLoading(false);
    }
  };

  const handleRepoCreatedContinue = async () => {
    if (!pendingSimulation) return;

    try {
      setStartingSimulation(pendingSimulation.id || null);
      setRepoCreatedDialogOpen(false);

      if (createdSessionId) {
        window.open(`/simulation/execute/${createdSessionId}`, '_blank');
      } else if (repoData?.sessionId) {
        window.open(`/simulation/execute/${repoData.sessionId}`, '_blank');
      } else {
        console.warn('No session ID available for navigation');
      }

      await loadSimulations();
      await loadStats();
    } catch (err: any) {
      console.error('Failed to continue simulation:', err);
      alert(err.message || 'Failed to continue. Please try again.');
    } finally {
      setStartingSimulation(null);
      setPendingSimulation(null);
      setRepoData(null);
      setCreatedSessionId(null);
    }
  };

  const handleCancelResume = () => {
    setResumeDialogOpen(false);
    setResumeSessionData(null);
    setResumeSimulationRef(null);
  };

  const findSessionIdForSimulation = async (simulationId: string): Promise<string | null> => {
    try {
      const response = await getMySimulationById(simulationId);
      const data = response?.data;
      
      if (data) {
        const sessionId = data.sessionId || 
                         data.session?.id || 
                         data.session_id ||
                         data.simulation_session?.id;
        
        if (sessionId) {
          console.log('Found sessionId from API:', sessionId);
          return sessionId;
        }
      }
      
      return null;
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      return null;
    }
  };

  const handleReviewSimulation = async (simulation: ExtendedSimulation) => {
    console.log('🔍 handleReviewSimulation called:', {
      id: simulation.id,
      sessionId: simulation.sessionId,
      sessionStatus: simulation.sessionStatus,
      status: simulation.status,
      score: simulation.score
    });
    
    if (!simulation.id || simulation.id === 'null') {
      alert('Cannot review practical assessment: Assessment not available');
      return;
    }

    if (simulation.sessionId) {
      console.log('Using sessionId for navigation to session report:', simulation.sessionId);
      navigate(`/session-report/${simulation.sessionId}`);
      return;
    }

    try {
      const foundSessionId = await findSessionIdForSimulation(simulation.id);
      if (foundSessionId) {
        console.log('Found sessionId via API, navigating to session report:', foundSessionId);
        navigate(`/session-report/${foundSessionId}`);
        return;
      }

      if (hasValidScore(simulation.score)) {
        console.log(' Simulation has score but no sessionId, showing modal');
        setNoSessionSimulation(simulation);
        setNoSessionModalOpen(true);
        return;
      }

      console.log(' No sessionId found anywhere, falling back to results page');
      navigate(`/simulation/results/${simulation.id}`);
    } catch (error) {
      console.error(' Error finding sessionId:', error);
      navigate(`/simulation/results/${simulation.id}`);
    }
  };

  const toggleTasks = (applicationId: string | undefined) => {
    if (applicationId) {
      setShowAllTasks(prev => ({ ...prev, [applicationId]: !prev[applicationId] }));
    }
  };

  const getFormattedCurrentDateTime = () => {
    return currentDateTime.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    });
  };

  const getDayForSimulation = (sim: any): string => {
    return getCurrentDayInTz(sim, currentDateTime);
  };

  const getTimeForSimulation = (sim: any): string => {
    return getCurrentTimeInTz(sim, currentDateTime);
  };

  const handleCancelStart = () => {
    setSessionStartDialogOpen(false);
    setPendingSimulation(null);
    setDialogError(null);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading your practical assessments…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Play className="w-8 h-8 text-blue-600" />
              Job Practical Assessments
            </h1>
            <p className="text-gray-600 mt-2">
              Complete practical assessments for jobs you've applied to and showcase your skills
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { loadSimulations(); loadStats(); }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>

        {/* Current date/time banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6 border border-blue-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-full">
                <Sun className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-blue-600 uppercase tracking-wide">Current Date &amp; Time</p>
                <p className="text-lg font-semibold text-gray-800">{getFormattedCurrentDateTime()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-xs text-gray-500">Timezone</p>
                <p className="text-md font-medium text-gray-700">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Status Filter */}
      <StatusFilter selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} />

      {/* Simulation Grid */}
      {simulations.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-md">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No practical assessments available</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            {selectedStatus !== 'all'
              ? `You don't have any ${selectedStatus.replace('_', '')} practical assessments.`
              : "The employers you applied to haven't created practical assessments yet. Check back later!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {simulations.map((simulation, index) => {
            // ''Check if simulation has valid configuration (has tasks)
            const isValidConfig = hasValidConfig(simulation);
            const isTemplateMissing = simulation.status === 'no_template'|| !isValidConfig;
            
            const hasSessionId = !!simulation.sessionId;
            const hasScore = hasValidScore(simulation.score);
            const sessionStatus = simulation.sessionStatus;
            
            // ''IN PROGRESS only if: has sessionId AND session is NOT completed/submitted AND has valid config
            const isInProgress = hasSessionId && 
                                 !isTemplateMissing && 
                                 sessionStatus !== 'completed'&& 
                                 sessionStatus !== 'submitted';
            
            // ''COMPLETED if: status is 'completed'OR (has sessionId and session is completed) OR (has score without session)
            const isCompleted = (simulation.status === 'completed'|| 
                                (hasSessionId && sessionStatus === 'completed') ||
                                (hasScore && !hasSessionId)) && 
                                !isTemplateMissing;
            
            // ''NOT STARTED: has valid config, no sessionId, no score, not completed
            const isNotStarted = !hasSessionId && 
                                 !hasScore && 
                                 !isTemplateMissing && 
                                 simulation.status !== 'completed';
            
            console.log(`''Simulation ${simulation.id}:`, {
              isValidConfig,
              isTemplateMissing,
              hasSessionId,
              hasScore,
              sessionStatus,
              isInProgress,
              isCompleted,
              isNotStarted,
              status: simulation.status,
              tasksCount: simulation.tasks?.length || 0
            });
            
            const availability = getAvailabilityStatus(simulation, currentDateTime);
            const showTasks = showAllTasks[simulation.applicationId || ''] ?? false;
            const uniqueKey = `${simulation.applicationId}-${simulation.id ?? index}`;

            return (
              <SimulationCard
                key={uniqueKey}
                simulation={simulation}
                isTemplateMissing={isTemplateMissing}
                isCompleted={isCompleted}
                isInProgress={isInProgress}
                isNotStarted={isNotStarted}
                availability={availability}
                startingSimulation={startingSimulation}
                showTasks={showTasks}
                onToggleTasks={toggleTasks}
                onStartSimulation={handleStartSimulation}
                onReviewSimulation={handleReviewSimulation}
                getCurrentDayInTz={getDayForSimulation}
                getCurrentTimeInTz={getTimeForSimulation}
              />
            );
          })}
        </div>
      )}

      {/* Resume Simulation Dialog */}
      <ResumeSimulationDialog
        open={resumeDialogOpen}
        sessionData={resumeSessionData}
        onResume={handleResumeFromDialog}
        onCancel={handleCancelResume}
        onViewReport={handleViewReport}
        isLoading={isResuming}
      />

      {/* Session Start Dialog */}
      <SessionStartDialog
        open={sessionStartDialogOpen}
        templateId={pendingSimulation?.id || ''}
        applicationId={pendingSimulation?.applicationId || ''}
        onStart={handleSessionStart}
        onCancel={handleCancelStart}
        isLoading={dialogLoading}
        error={dialogError}
      />

      {/* Repo Created Dialog */}
      {repoData && (
        <RepoCreatedDialog
          open={repoCreatedDialogOpen}
          repoData={repoData}
          onContinue={handleRepoCreatedContinue}
          onBeforeContinue={clearAllTaskRepos}
        />
      )}

      {/* No Session Data Modal */}
      {noSessionModalOpen && noSessionSimulation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Cannot View Results</h2>
              <p className="text-gray-600 mb-4">
                This practical assessment has a score of <strong>{String(noSessionSimulation.score)}%</strong> but no session data is available.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-left">
                <p className="text-sm text-yellow-800 font-medium mb-2">This may happen if:</p>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                  <li>The practical assessment was completed in a previous version</li>
                  <li>The session was deleted or archived</li>
                  <li>There was an issue creating the session</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setNoSessionModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setNoSessionModalOpen(false);
                    navigate(`/simulation/results/${noSessionSimulation.id}`);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  View Raw Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobSimulation;