// Dashboard.tsx - FIXED IMPORTS
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import BlockchainExplorer from './components/BlockchainExplorer';
import SecuritySettings from './components/SecuritySettings';
import TeamManagement from './components/TeamManagement';
import ProfileManagement from './components/ProfileManagement';
import CompanyProfile from './components/company/CompanyProfile';
import SavedJobs from './components/jobs/SavedJobs';
import ApplicationRequirements from './components/ApplicationRequirements';
import ApplicationHistory from './components/ApplicationHistory';
import JobManagement from './components/JobManagement';
import JobPostingScreen from './components/jobs/JobPostingScreen';
import JobSimulation from './components/jobs/JobSimulation';
import Results from './components/Results';
import BulkCandidateProcessing from './components/BulkCandidateProcessing';
import AdvancedCandidateSearch from './components/AdvancedCandidateSearch';
import RecruiterAnalytics from './components/RecruiterAnalytics';
import RecruiterDashboard from './components/RecruiterDashboard';
import TeamCollaboration from './components/TeamCollaboration';
import InterviewScheduling from './components/InterviewScheduling';
import OfferManagement from './components/OfferManagement';
import CandidateOnboarding from './components/CandidateOnboarding';
import PerformanceReporting from './components/PerformanceReporting';
import PlatformFeatures from './components/PlatformFeatures';
import SimulationDesigner from './components/SimulationDesigner';
import SimulationList from './components/Simulation/SimulationList';
import SimulationSessionViewer from './components/SimulationSessionViewer';
import DashboardHome from './components/DashboardHome';
import JobCandidatesView from './components/jobs/JobCandidatesView';
import { useTheme } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import { GitHubRepoProvider } from './components/SimulationExecutor/context/GitHubRepoContext';
import appliedJobsManager from './src/utils/AppliedJobsManager';
import SessionReportComponent from './components/SessionReport';
import CandidateDetailView from './components/CandidateDetailView';
import CandidatePerformance from './components/CandidatePerformance';
import PersonalizedFeed from './components/jobs/PersonalizedFeed';

// Define the props for DashboardHome if needed, but it should accept these
interface DashboardProps {
  onSignUp?: () => void;
  onLogin?: () => void;
}

// Define AuthContextType to match what useAuth returns
interface AuthContextType {
  user: any;
  logout: () => void;
  isAuthenticated: boolean;
  loading?: boolean;
}

export default function Dashboard({ onSignUp, onLogin }: DashboardProps) {
  const navigate = useNavigate();
  const themeContext = useTheme();
  const authContext = useAuth() as AuthContextType;
  
  const currentTheme = (themeContext as any).currentTheme || 'blue';
  const authUser = authContext.user;
  const logout = authContext.logout;
  const loading = authContext.loading || false;

  const [user, setUser] = useState<any>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [appliedJobs, setAppliedJobs] = useState<string[]>(() => appliedJobsManager.getAllAppliedJobs());
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 768;
    return false;
  });
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editingSimulationId, setEditingSimulationId] = useState<string | null>(null);

  // For Job Candidates View
  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState<{ id: string; title: string } | null>(null);

  // For Candidate Performance View
  const [selectedSimulation, setSelectedSimulation] = useState<any>(null);

  // Tracks which view to return to after closing a session report
  const [reportReturnView, setReportReturnView] = useState('simulations-list');

  // Sync user from auth context or localStorage
  useEffect(() => {
    if (authUser) {
      setUser(authUser);
      console.log('✅ User loaded from auth context:', authUser);
    } else {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          console.log('✅ Loaded user from localStorage fallback:', parsedUser);
        } catch (e) {
          console.error('Failed to parse user from localStorage:', e);
        }
      }
    }
  }, [authUser]);

  useEffect(() => {
    const handleAppliedJobsChange = (appliedJobIds: string[]) => setAppliedJobs(appliedJobIds);
    appliedJobsManager.addListener(handleAppliedJobsChange);
    return () => appliedJobsManager.removeListener(handleAppliedJobsChange);
  }, []);

  useEffect(() => {
    console.log('📊 Dashboard - Auth State:', {
      authUser, 
      user, 
      loading, 
      userType: user?.userType || user?.user_type,
      hasToken: !!localStorage.getItem('authToken'),
      hasUser: !!localStorage.getItem('user'),
    });
  }, [authUser, user, loading]);

  // Handle deep links (e.g. notification clicks navigating to /?view=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const sessionIdParam = params.get('sessionId');
    const jobIdParam = params.get('jobId');
    if (viewParam === 'session-report' && sessionIdParam) {
      setReportReturnView('simulations-list');
      setEditingSimulationId(sessionIdParam);
      setCurrentView('session-report');
    } else if (viewParam === 'job-candidates' && jobIdParam) {
      setSelectedJobForCandidates({ id: jobIdParam, title: '' });
      setCurrentView('job-candidates');
    } else if (viewParam === 'application-history') {
      setCurrentView('application-history');
    }
  }, []);

  const handleApplyJob = (jobId: string) => {
    appliedJobsManager.addAppliedJob(jobId);
    console.log(`Applied to job ${jobId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('company');
    localStorage.removeItem('companyData');
    if (logout) logout();
    setUser(null);
    setCurrentView('dashboard');
    setSidebarOpen(true);
    navigate('/', { replace: true });
  };

  const handleViewCandidates = (jobId: string, jobTitle: string) => {
    setSelectedJobForCandidates({ id: jobId, title: jobTitle });
    setCurrentView('job-candidates');
  };

  const handleEditSimulation = (simulationId: string) => {
    setEditingSimulationId(simulationId);
    setCurrentView('simulation-designer');
  };

  const handleCreateSimulation = () => {
    setEditingSimulationId(null);
    setCurrentView('simulation-designer');
  };

  const handleViewCandidatePerformance = (simulation: any) => {
    setSelectedSimulation(simulation);
    setCurrentView('candidate-performance');
  };

  const bgGradient: Record<string, string> = {
    'blue': 'from-blue-50 to-blue-100',
    'purple': 'from-purple-50 to-purple-100',
    'indigo': 'from-indigo-50 to-indigo-100',
    'slate': 'from-slate-50 to-slate-100',
    'green': 'from-green-50 to-green-100',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    console.log('🎯 Rendering view:', currentView, 'User type:', user?.userType || user?.user_type);

    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardHome
            user={user}
            onApplyJob={handleApplyJob}
            onViewChange={setCurrentView}
          />
        );
      case 'for-you':
        return (
          <PersonalizedFeed
            onApplyToJob={(jobId) => {
              // Navigate to the real job details page and auto-open the
              // actual application modal there (same ?apply=1 pattern
              // SavedJobs.tsx uses) — this feed's own job objects are too
              // thin (no description/salary/screening questions) to render
              // a real application form inline, and handleApplyJob() only
              // faked "applied" locally without ever submitting anything.
              window.location.href = `/jobs/${jobId}?apply=1`;
            }}
          />
        );
      case 'saved-jobs':
        return <SavedJobs onBack={() => setCurrentView('dashboard')} />;

      case 'profile':
        return <ProfileManagement onNavigate={setCurrentView} />;

      case 'security':
        return <SecuritySettings onBack={() => setCurrentView('dashboard')} />;

      case 'team':
        return <TeamManagement onBack={() => setCurrentView('dashboard')} />;

      case 'company-profile':
        return <CompanyProfile />;

      case 'jobs':
        return (
          <JobManagement
            onBack={() => setCurrentView('dashboard')}
            onCreateJob={() => setCurrentView('job-posting')}
            onEditJob={(jobId: string) => {
              setEditingJobId(jobId);
              setCurrentView('job-posting-edit');
            }}
            onViewCandidates={handleViewCandidates}
          />
        );

      case 'job-candidates':
        return (
          <JobCandidatesView
            jobId={selectedJobForCandidates?.id || ''}
            jobTitle={selectedJobForCandidates?.title || ''}
            onBack={() => {
              setSelectedJobForCandidates(null);
              setCurrentView('jobs');
            }}
            onViewCandidate={(candidate: any) => {
              setSelectedCandidate(candidate);
              setCurrentView('candidate-detail');
            }}
          />
        );

      case 'candidate-detail':
        return (
          <CandidateDetailView
            candidate={selectedCandidate}
            onBack={() => setCurrentView('job-candidates')}
          />
        );

      case 'job-posting':
        return <JobPostingScreen onBack={() => setCurrentView('jobs')} isEditing={false} />;

      case 'job-posting-edit':
        return <JobPostingScreen onBack={() => setCurrentView('jobs')} isEditing={true} jobId={editingJobId || undefined} />;

      case 'simulation':
        return (
          <GitHubRepoProvider>
            <JobSimulation onBack={() => setCurrentView('dashboard')} />
          </GitHubRepoProvider>
        );

      case 'my-simulations':
        return <SimulationSessionViewer onBack={() => setCurrentView('dashboard')} />;

      case 'simulations-list':
        return (
          <SimulationList
            onBack={() => setCurrentView('dashboard')}
            onEditSimulation={handleEditSimulation}
            onCreateNew={handleCreateSimulation}
            // ✅ REMOVED: onViewCandidatePerformance is not supported by SimulationList
            // onViewCandidatePerformance={handleViewCandidatePerformance}
          />
        );

      case 'simulation-designer':
        return (
          <SimulationDesigner
            simulationId={editingSimulationId || undefined}
            onBack={() => setCurrentView('simulations-list')}
          />
        );

      case 'candidate-performance':
        return (
          <CandidatePerformance
            simulation={selectedSimulation}
            onBack={() => setCurrentView('simulations-list')}
            onViewReport={(sessionId: string) => {
              setReportReturnView('candidate-performance');
              setEditingSimulationId(sessionId);
              setCurrentView('session-report');
            }}
          />
        );

      case 'session-report':
        return (
          <SessionReportComponent
            sessionId={editingSimulationId || ''}
            onBack={() => setCurrentView(reportReturnView)}
          />
        );

      case 'results':
        return <Results onBack={() => setCurrentView('dashboard')} />;

      case 'blockchain':
        return <BlockchainExplorer />;

      case 'applications':
        return <ApplicationRequirements onBack={() => setCurrentView('dashboard')} />;

      case 'application-history':
        return <ApplicationHistory onBack={() => setCurrentView('dashboard')} />;

      case 'recruiter-dashboard':
        return <RecruiterDashboard onBack={() => setCurrentView('dashboard')} />;

      case 'candidates':
      case 'advanced-search':
        return <AdvancedCandidateSearch onBack={() => setCurrentView('dashboard')} />;

      case 'bulk-processing':
        return <BulkCandidateProcessing onBack={() => setCurrentView('dashboard')} />;

      case 'recruiter-analytics':
      case 'analytics':
        return <RecruiterAnalytics onBack={() => setCurrentView('dashboard')} />;

      case 'team-collaboration':
        return <TeamCollaboration onBack={() => setCurrentView('dashboard')} />;

      case 'interview-scheduling':
      case 'interviews':
        return <InterviewScheduling onBack={() => setCurrentView('dashboard')} />;

      case 'offers':
        return <OfferManagement onBack={() => setCurrentView('dashboard')} />;

      case 'onboarding':
        return <CandidateOnboarding onBack={() => setCurrentView('dashboard')} />;

      case 'performance':
        return <PerformanceReporting onBack={() => setCurrentView('dashboard')} />;

      case 'platform':
        return <PlatformFeatures onBack={() => setCurrentView('dashboard')} />;

      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {currentView?.charAt(0).toUpperCase() + currentView?.slice(1) || 'Unknown'} Page
              </h2>
              <p className="text-gray-600">This page is under development.</p>
              <button
                onClick={() => setCurrentView('dashboard')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        );
    }
  };

  // ============================================
  // SAME LAYOUT FOR EVERYONE - Keep sidebar visible
  // ============================================
  return (
    <div className={`flex h-screen bg-gradient-to-br ${bgGradient[currentTheme] || bgGradient.blue}`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Visible for EVERYONE (candidates AND recruiters) */}
      <div className={`
        fixed md:static left-0 top-16 md:top-0 h-[calc(100vh-4rem)] md:h-screen z-40 md:z-20 w-64 lg:w-72
        ${sidebarOpen ? 'block' : 'hidden'}
        transition-all duration-300 ease-in-out
      `}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={currentView}
          onViewChange={setCurrentView}
          userType={user?.userType || user?.user_type || 'candidate'}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          onSignUp={onSignUp}
          onLogin={onLogin}
          user={user}
          company={user?.company || null}
          onLogout={handleLogout}
          currentView={currentView}
          onViewChange={setCurrentView}
        />

        <div className="flex-1 overflow-auto">
          {renderView()}
        </div>
      </div>
    </div>
  );
}