import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, RefreshCw, AlertCircle, Building2, Play } from 'lucide-react';
import { 
  getMySimulations, 
  getMySimulationStats, 
  startAppliedJobSimulation, 
  resumeMySimulation, 
  getMySimulationById 
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
  score?: number;
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
}

interface JobSimulationProps {
  onBack: () => void;
}

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
  
  // ============================================
  // ✅ ADD MISSING STATE VARIABLES
  // ============================================
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeSessionData, setResumeSessionData] = useState<any>(null);
  const [resumeSimulationRef, setResumeSimulationRef] = useState<ExtendedSimulation | null>(null);
  const [repoData, setRepoData] = useState<any>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pendingSimulation, setPendingSimulation] = useState<ExtendedSimulation | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadSimulations = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = { page: 1, limit: 50 };
      if (selectedStatus !== 'all' && ['not_started', 'in_progress', 'completed'].includes(selectedStatus)) {
        params.status = selectedStatus;
      }

      const response = await getMySimulations(params);

      if (response.success && response.data) {
        const rawData = response.data.data ?? response.data;
        const mapped: ExtendedSimulation[] = rawData.map((sim: any) => ({
          ...sim,
          status: resolveStatus(sim),
          // Extract sessionId from the data
          sessionId: sim.sessionId || sim.session?.id || null
        }));
        setSimulations(deduplicateSimulations(mapped) as ExtendedSimulation[]);
      } else {
        setSimulations([]);
      }
    } catch (err: any) {
      console.error('Failed to load simulations:', err);
      setError(err.message || 'Failed to load simulations');
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

  // Fetch session details for resume dialog
  const fetchSessionDetails = async (sessionId: string, simulation: ExtendedSimulation) => {
    try {
      setIsResuming(true);
      
      console.log('🔍 Fetching session details for sessionId:', sessionId);
      
      const response = await fetch(`http://localhost:3001/api/v1/simulations/sessions/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        const session = result.data;
        
        console.log('📦 Session data received:', session);
        
        // ✅ Extract GitHub repo from session
        let githubRepo = null;
        if (session.github_links || session.githubRepo) {
          const ghData = session.github_links || session.githubRepo;
          githubRepo = typeof ghData === 'string' ? JSON.parse(ghData) : ghData;
          console.log('🐙 GitHub repo found in session:', githubRepo);
        }
        
        setResumeSessionData({
          sessionId: session.id,
          simulationName: simulation.simulationName || simulation.name || 'Simulation',
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
          } : null
        });
        
        setResumeSimulationRef(simulation);
        setResumeDialogOpen(true);
      } else {
        console.warn('Could not fetch session details, resuming directly');
        await handleResumeExistingSession(simulation);
      }
    } catch (err) {
      console.error('Failed to fetch session details:', err);
      await handleResumeExistingSession(simulation);
    } finally {
      setIsResuming(false);
    }
  };

  // Handle starting a simulation (shows appropriate dialog)
  const handleStartSimulation = async (simulation: ExtendedSimulation, forceNew: boolean = false) => {
    console.log('🎯 handleStartSimulation called:', { simulationId: simulation.id, forceNew, hasSessionId: !!simulation.sessionId });
    
    if (!simulation.id || simulation.id === 'null') {
      alert('This simulation is not yet available.');
      return;
    }

    const { canStart, message } = getAvailabilityStatus(simulation, currentDateTime);
    if (!canStart) {
      alert(message);
      return;
    }

    // Check if there's an existing session ID to resume
    if (simulation.sessionId && !forceNew) {
      console.log('🔄 Existing session found, showing resume dialog');
      // Show resume dialog with session details
      await fetchSessionDetails(simulation.sessionId, simulation);
      return;
    }

    // For new sessions, show GitHub username dialog
    console.log('✨ No existing session, showing GitHub dialog');
    setPendingSimulation(simulation);
    setSessionStartDialogOpen(true);
    setDialogError(null);
  };

  // Handle resuming an existing session after dialog confirmation
  const handleResumeExistingSession = async (simulation: ExtendedSimulation) => {
    console.log('🎯 handleResumeExistingSession called with simulation:', simulation);
    
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
        
        console.log('✅ Resume successful, opening simulation with sessionId:', finalSessionId);
        
        // Open the simulation executor in a new tab
        window.open(`/simulation/execute/${finalSessionId}`, '_blank');
        
        // Refresh the list to update status
        await loadSimulations();
        await loadStats();
      } else {
        throw new Error(resumeResponse.message || 'Failed to resume simulation');
      }
    } catch (err: any) {
      console.error('❌ Failed to resume simulation:', err);
      alert(err.message || 'Failed to resume simulation. Please try again.');
    } finally {
      setIsResuming(false);
      setStartingSimulation(null);
      setResumeSessionData(null);
      setResumeSimulationRef(null);
    }
  };

  // Handle resume from dialog
  const handleResumeFromDialog = () => {
    console.log('🔘 Resume button clicked in dialog');
    if (resumeSimulationRef) {
      console.log('📌 Resuming simulation:', resumeSimulationRef);
      handleResumeExistingSession(resumeSimulationRef);
    } else {
      console.error('No simulation reference available for resume');
      alert('Cannot resume: Session data not found');
      handleCancelResume();
    }
  };

  // Handle starting a NEW simulation with GitHub username
  const handleSessionStart = async (githubUsername: string) => {
    if (!pendingSimulation) return;
    const simulation = pendingSimulation;

    try {
      setDialogLoading(true);
      setDialogError(null);

      console.log('🚀 Starting NEW simulation with:', {
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
      console.error('❌ Failed to start simulation:', err);
      setDialogError(err.message || 'Failed to start simulation. Please try again.');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle continue after repo creation
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

  const handleReviewSimulation = async (simulation: ExtendedSimulation) => {
    if (!simulation.id || simulation.id === 'null') {
      alert('Cannot review simulation: Assessment not available');
      return;
    }

    try {
      const results = await getMySimulationById(simulation.id);
      if (results.success) {
        navigate(`/simulation/results/${simulation.id}`);
      } else if (simulation.sessionId) {
        navigate(`/simulation/results/${simulation.sessionId}`);
      } else {
        alert('No results available for this simulation yet.');
      }
    } catch (err) {
      console.error('Failed to get simulation results:', err);
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
            <p className="text-gray-600">Loading your simulations…</p>
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
              Job Simulations
            </h1>
            <p className="text-gray-600 mt-2">
              Complete simulations for jobs you've applied to and showcase your skills
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
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No simulations available</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            {selectedStatus !== 'all'
              ? `You don't have any ${selectedStatus.replace('_', ' ')} simulations.`
              : "The employers you applied to haven't created simulations yet. Check back later!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {simulations.map((simulation, index) => {
            const isTemplateMissing = simulation.status === 'no_template';
            const isCompleted = simulation.status === 'completed';
            const isInProgress = simulation.status === 'in_progress';
            const isNotStarted = !isTemplateMissing && !isCompleted && !isInProgress && simulation.status !== 'expired';
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

      {/* ✅ Resume Simulation Dialog - Shows session details before resuming */}
      <ResumeSimulationDialog
        open={resumeDialogOpen}
        sessionData={resumeSessionData}
        onResume={handleResumeFromDialog}
        onCancel={handleCancelResume}
        isLoading={isResuming}
      />

      {/* Session Start Dialog - ONLY for NEW simulations (asks for GitHub username) */}
      <SessionStartDialog
        open={sessionStartDialogOpen}
        templateId={pendingSimulation?.id || ''}
        applicationId={pendingSimulation?.applicationId || ''}
        onStart={handleSessionStart}
        onCancel={handleCancelStart}
        isLoading={dialogLoading}
        error={dialogError}
      />

      {/* Repo Created Dialog - Show GitHub Repo Details for NEW simulations */}
      {repoData && (
        <RepoCreatedDialog
          open={repoCreatedDialogOpen}
          repoData={repoData}
          onContinue={handleRepoCreatedContinue}
          onBeforeContinue={clearAllTaskRepos}
        />
      )}
    </div>
  );
};

export default JobSimulation;