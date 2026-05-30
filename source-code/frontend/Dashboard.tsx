import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, Zap, FileText, CheckSquare, TrendingUp, User, Search, Bell,
  Settings, LogOut, ChevronRight, Clock, MapPin, Badge, Users, Briefcase,
  Shield, Brain, Link as LinkIcon, Award, Clock as ClockIcon, MessageSquare,
  Target, Globe, ChevronDown, Menu, X
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import JobCard from './components/JobCard';
import ProfileProgressRing from './components/ProfileProgressRing';
import SimulationScheduler from './components/Simulation/SimulationScheduler';
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
import { mockJobs, mockSimulations } from './data/mockData';
import { useTheme } from './context/ThemeContext';
import { useAuth } from './context/AuthContext';
import { GitHubRepoProvider } from './components/SimulationExecutor/context/GitHubRepoContext';
import appliedJobsManager from './src/utils/AppliedJobsManager';
import SessionReportComponent from './components/SessionReport';
import CandidateDetailView from './components/CandidateDetailView';
import CandidatePerformance from './components/CandidatePerformance';

export default function Dashboard({ onSignUp, onLogin }) {
  const navigate = useNavigate();
  const { currentTheme } = useTheme();
  const { user: authUser, logout, loading } = useAuth();

  const [user, setUser] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [appliedJobs, setAppliedJobs] = useState(() => appliedJobsManager.getAllAppliedJobs());
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 768;
    return false;
  });
  const [currentView, setCurrentView] = useState('dashboard');
  const [editingJobId, setEditingJobId] = useState(null);
  const [editingSimulationId, setEditingSimulationId] = useState(null);

  // For Job Candidates View
  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState(null);

  // For Candidate Performance View
  const [selectedSimulation, setSelectedSimulation] = useState(null);

  // ← NEW: tracks which view to return to after closing a session report
  const [reportReturnView, setReportReturnView] = useState('simulations-list');

  // Sync user from auth context or localStorage
  useEffect(() => {
    if (authUser) {
      setUser(authUser);
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
    const handleAppliedJobsChange = (appliedJobIds) => setAppliedJobs(appliedJobIds);
    appliedJobsManager.addListener(handleAppliedJobsChange);
    return () => appliedJobsManager.removeListener(handleAppliedJobsChange);
  }, []);

  useEffect(() => {
    console.log('Dashboard - Auth State:', {
      authUser, user, loading,
      hasToken: !!localStorage.getItem('authToken'),
      hasUser: !!localStorage.getItem('user'),
      storedUser: localStorage.getItem('user')
    });
  }, [authUser, user, loading]);

  // Handle ?view=session-report&sessionId=xxx deep links
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const viewParam = params.get('view');
    const sessionIdParam = params.get('sessionId');
    if (viewParam === 'session-report' && sessionIdParam) {
      setReportReturnView('simulations-list');
      setEditingSimulationId(sessionIdParam);
      setCurrentView('session-report');
    }
  }, [location.search]);

  const handleApplyJob = (jobId) => {
    appliedJobsManager.addAppliedJob(jobId);
    console.log(`Applied to job ${jobId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
    if (logout) logout();
    setUser(null);
    setCurrentView('dashboard');
    setSidebarOpen(true);
    navigate('/', { replace: true });
  };

  const handleViewCandidates = (jobId, jobTitle) => {
    setSelectedJobForCandidates({ id: jobId, title: jobTitle });
    setCurrentView('job-candidates');
  };

  const handleEditSimulation = (simulationId) => {
    setEditingSimulationId(simulationId);
    setCurrentView('simulation-designer');
  };

  const handleCreateSimulation = () => {
    setEditingSimulationId(null);
    setCurrentView('simulation-designer');
  };

  // ← NEW: open CandidatePerformance for a specific simulation
  const handleViewCandidatePerformance = (simulation) => {
    setSelectedSimulation(simulation);
    setCurrentView('candidate-performance');
  };

  const bgGradient = {
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
    console.log('🎯 Rendering view:', currentView);

    switch (currentView) {
      case 'dashboard':
        return (
          <DashboardHome
            user={user}
            mockJobs={mockJobs}
            mockSimulations={mockSimulations}
            onApplyJob={handleApplyJob}
            onViewChange={setCurrentView}
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
            onEditJob={(jobId) => {
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
            onViewCandidate={(candidate) => {
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
        return <JobPostingScreen onBack={() => setCurrentView('jobs')} isEditing={true} jobId={editingJobId} />;

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
            // Wire this up in SimulationList wherever you have a "View Candidates" / "View Performance" button:
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

      // ← NEW: Candidate Performance — opened from SimulationList
      case 'candidate-performance':
        return (
          <CandidatePerformance
            simulation={selectedSimulation}
            onBack={() => setCurrentView('simulations-list')}
            onViewReport={(sessionId) => {
              // Remember we came from candidate-performance so Back returns here
              setReportReturnView('candidate-performance');
              setEditingSimulationId(sessionId);
              setCurrentView('session-report');
            }}
          />
        );

      // Session report — Back goes to wherever it was opened from
      case 'session-report':
        return (
          <SessionReportComponent
            sessionId={editingSimulationId}
            onBack={() => setCurrentView(reportReturnView)}
          />
        );

      case 'results':
        return <Results onBack={() => setCurrentView('dashboard')} />;

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

  return (
    <div className={`flex h-screen bg-gradient-to-br ${bgGradient[currentTheme]}`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static left-0 top-16 md:top-0 h-[calc(100vh-4rem)] md:h-screen z-40 md:z-20 w-64 lg:w-72
        ${sidebarOpen ? 'block' : 'hidden'}
      `}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeView={currentView}
          onViewChange={setCurrentView}
          userType={user?.userType || 'candidate'}
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