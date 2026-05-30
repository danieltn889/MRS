import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  ChevronRight,
  Loader2,
  BarChart3,
  Award,
  TrendingUp,
  MessageSquare,
  RefreshCw,
  Briefcase,
  FileText,
  X,
  Star,
  Target,
  Zap,
  Heart,
  Brain,
  Users,
  Eye as EyeIcon
} from 'lucide-react';
import simulationAPI from '../services/simulationAPI';
import { useAuth } from '../context/AuthContext';

// Types matching API responses
interface SimulationSession {
  id: string;
  sessionId: string;
  simulationId: string;
  simulationName: string;
  simulationType: string;
  difficulty: string;
  duration: number;
  status: 'not_started' | 'in_progress' | 'completed';
  score?: number;
  startedAt?: string;
  completedAt?: string;
  timeSpent?: number;
  currentTask?: number;
  companyName: string;
  companyLogo?: string;
  jobTitle: string;
  applicationId: string;
  tasks?: any[];
  scoringRubric?: any;
}

interface SimulationDetail extends SimulationSession {
  answers?: any;
  progress?: any;
  timeLimit?: number;
  timeRemaining?: number;
  instructions?: string;
  objectives?: string[];
  settings?: any;
  evaluation?: any;
  hasEvaluation?: boolean;
  passed?: boolean;
  punctuality_score?: number;
  communication_score?: number;
  problem_solving_score?: number;
  adaptability_score?: number;
  collaboration_score?: number;
  attention_to_detail_score?: number;
  initiative_score?: number;
}

interface SimulationSessionViewerProps {
  simulationId?: string;
  onBack: () => void;
  onResume?: (sessionId: string, simulationId: string) => void;
}

const SimulationSessionViewer: React.FC<SimulationSessionViewerProps> = ({ 
  simulationId: propSimulationId, 
  onBack, 
  onResume 
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [sessions, setSessions] = useState<SimulationSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<SimulationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // If a specific simulationId is provided, we'll filter to show only that simulation's sessions
  const isSpecificSimulation = !!propSimulationId;

  // Stats derived from sessions (only for current simulation if specific)
  const stats = {
    total: sessions.length,
    completed: sessions.filter(s => s.status === 'completed').length,
    inProgress: sessions.filter(s => s.status === 'in_progress').length,
    averageScore: sessions.filter(s => s.status === 'completed' && s.score).length > 0 
      ? sessions.filter(s => s.status === 'completed' && s.score).reduce((sum, s) => sum + (s.score || 0), 0) / sessions.filter(s => s.status === 'completed' && s.score).length
      : null,
    bestScore: sessions.filter(s => s.status === 'completed' && s.score).length > 0 
      ? Math.max(...sessions.filter(s => s.status === 'completed').map(s => s.score || 0))
      : null
  };

  // Load sessions on mount and when filter changes
  useEffect(() => {
    loadAllSessions();
  }, [filter]);

  const loadAllSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📊 Fetching simulation sessions...');
      if (isSpecificSimulation) {
        console.log('📊 Filtering for specific simulation ID:', propSimulationId);
      }
      
      // Use the dedicated simulation sessions endpoint
      const response = await simulationAPI.getMySimulationSessions({ 
        page: 1, 
        limit: 100,
        status: filter === 'all' ? undefined : filter
      });
      
      console.log('📊 API Response:', response);
      
      // Extract sessions from response - handle different response structures
      let sessionsList = [];
      if (response.data?.data && Array.isArray(response.data.data)) {
        sessionsList = response.data.data;
      } else if (response.data && Array.isArray(response.data)) {
        sessionsList = response.data;
      } else if (response.data?.results && Array.isArray(response.data.results)) {
        sessionsList = response.data.results;
      } else if (Array.isArray(response)) {
        sessionsList = response;
      }
      
      console.log('📊 Sessions list extracted:', sessionsList.length);
      
      // Map to component format
      let mappedSessions: SimulationSession[] = sessionsList.map((item: any) => {
        // Determine status
        let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
        const sessionStatus = item.session_status || item.status;
        
        if (sessionStatus === 'completed') {
          status = 'completed';
        } else if (sessionStatus === 'in_progress') {
          status = 'in_progress';
        }
        
        return {
          id: item.session_id || item.id,
          sessionId: item.session_id || item.id,
          simulationId: item.simulation_id,
          simulationName: item.simulation_name || 'Simulation',
          simulationType: item.simulation_type || 'technical',
          difficulty: item.difficulty || 'intermediate',
          duration: item.duration_minutes || 30,
          status: status,
          score: item.overall_score || item.session_score || item.score,
          startedAt: item.started_at,
          completedAt: item.completed_at,
          timeSpent: item.time_spent,
          currentTask: item.current_task || 0,
          companyName: item.company_name || 'Company',
          companyLogo: item.company_logo,
          jobTitle: item.job_title || 'Position',
          applicationId: item.application_id,
          tasks: item.tasks,
          scoringRubric: item.scoring_rubric
        };
      });
      
      // CRITICAL FIX: If a specific simulationId is provided, filter sessions to only that simulation
      if (isSpecificSimulation && propSimulationId) {
        const beforeCount = mappedSessions.length;
        mappedSessions = mappedSessions.filter(session => 
          session.simulationId === propSimulationId || 
          session.id === propSimulationId ||
          session.sessionId === propSimulationId
        );
        console.log(`📊 Filtered sessions: ${beforeCount} -> ${mappedSessions.length} for simulation ID: ${propSimulationId}`);
        
        // If we have exactly one session for this simulation, auto-select it
        if (mappedSessions.length === 1 && !selectedSessionId) {
          const singleSession = mappedSessions[0];
          console.log('📊 Auto-selecting single session:', singleSession.sessionId);
          setSelectedSessionId(singleSession.sessionId);
          loadSimulationDetails(singleSession.sessionId);
        }
      }
      
      setSessions(mappedSessions);
      
      console.log('📊 Final sessions count:', mappedSessions.length);
      console.log('📊 Status breakdown:', {
        completed: mappedSessions.filter(s => s.status === 'completed').length,
        in_progress: mappedSessions.filter(s => s.status === 'in_progress').length,
        not_started: mappedSessions.filter(s => s.status === 'not_started').length
      });
      
    } catch (error: any) {
      console.error('Error loading simulation sessions:', error);
      setError(error.message || 'Failed to load simulation sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSimulationDetails = async (sessionId: string) => {
    try {
      setLoading(true);
      // Get detailed session info
      const response = await simulationAPI.getSessionById(sessionId);
      
      console.log('📊 Full API response:', JSON.stringify(response, null, 2));
      
      // ✅ FIX: Extract the nested data structure correctly
      let apiData = response.data?.data || response.data;
      
      if (apiData) {
        // ✅ Extract from the nested structure based on your API response
        const sessionData = apiData.session || apiData;
        const evaluationData = apiData.evaluation;
        const templateData = apiData.simulation_template;
        const companyData = apiData.company;
        const jobData = apiData.job;
        const applicationData = apiData.application;
        
        console.log('📊 Session data:', sessionData);
        console.log('📊 Evaluation data:', evaluationData);
        console.log('📊 Template data:', templateData);
        
        // ✅ Determine correct status
        let sessionStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
        
        if (sessionData?.status === 'completed' || evaluationData?.status === 'completed' || apiData.has_evaluation === true) {
          sessionStatus = 'completed';
        } else if (sessionData?.status === 'in_progress') {
          sessionStatus = 'in_progress';
        }
        
        console.log('📊 Determined status:', sessionStatus);
        
        // ✅ Determine correct score
        let sessionScore = null;
        if (evaluationData?.overall_score) {
          sessionScore = evaluationData.overall_score;
        } else if (apiData.total_score) {
          sessionScore = apiData.total_score;
        } else if (sessionData?.score) {
          sessionScore = parseFloat(sessionData.score);
        } else if (sessionData?.overall_score) {
          sessionScore = parseFloat(sessionData.overall_score);
        }
        
        console.log('📊 Determined score:', sessionScore);
        
        const session: SimulationDetail = {
          id: sessionData?.id || sessionId,
          sessionId: sessionData?.id || sessionId,
          simulationId: templateData?.id || apiData.simulation_id,
          simulationName: templateData?.name || apiData.simulation_name || 'Simulation',
          simulationType: templateData?.type || 'technical',
          difficulty: templateData?.difficulty || 'intermediate',
          duration: templateData?.duration_minutes || 30,
          status: sessionStatus,
          score: sessionScore,
          startedAt: sessionData?.started_at,
          completedAt: sessionData?.completed_at,
          timeSpent: sessionData?.time_spent,
          currentTask: sessionData?.current_task || 0,
          companyName: companyData?.name || apiData.company_name || 'Company',
          companyLogo: companyData?.logo_url,
          jobTitle: jobData?.title || apiData.job_title || 'Position',
          applicationId: applicationData?.id || apiData.application_id,
          tasks: templateData?.tasks || [],
          answers: sessionData?.answers,
          progress: sessionData?.progress,
          timeLimit: sessionData?.time_limit,
          timeRemaining: sessionData?.time_remaining,
          scoringRubric: templateData?.scoring_rubric,
          instructions: templateData?.instructions,
          objectives: templateData?.tasks_structure?.objectives,
          settings: templateData?.tasks_structure?.settings,
          evaluation: evaluationData,
          hasEvaluation: apiData.has_evaluation,
          passed: apiData.passed,
          punctuality_score: evaluationData?.punctuality_score || sessionData?.punctuality_score,
          communication_score: evaluationData?.communication_score || sessionData?.communication_score,
          problem_solving_score: evaluationData?.problem_solving_score || sessionData?.problem_solving_score,
          adaptability_score: evaluationData?.adaptability_score || sessionData?.adaptability_score,
          collaboration_score: evaluationData?.collaboration_score || sessionData?.collaboration_score,
          attention_to_detail_score: evaluationData?.attention_to_detail_score || sessionData?.attention_score,
          initiative_score: evaluationData?.initiative_score || sessionData?.initiative_score
        };
        
        setSelectedSession(session);
        setSelectedSessionId(sessionId);
      }
    } catch (error) {
      console.error('Error loading simulation details:', error);
      setError('Failed to load simulation details');
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async (sessionId: string, simulationId: string) => {
    try {
      setResumingId(sessionId);
      setError(null);
      
      // Call the resume endpoint
      const response = await simulationAPI.resumeSession(sessionId);
      const data = response.data?.data || response.data;
      
      if (data && onResume) {
        onResume(sessionId, simulationId);
      } else {
        // Open the simulation execution page
        window.open(`/simulation/execute/${sessionId}`, '_blank');
      }
    } catch (error: any) {
      console.error('Error resuming simulation:', error);
      setError(error.message || 'Failed to resume simulation. Please try again.');
    } finally {
      setResumingId(null);
    }
  };

  const handleCancel = async (sessionId: string, simulationId: string) => {
    if (!confirm('Are you sure you want to cancel this simulation? Your progress will be lost.')) {
      return;
    }
    
    try {
      setResumingId(sessionId);
      await simulationAPI.cancelSession(sessionId);
      
      await loadAllSessions();
      if (selectedSessionId === simulationId) {
        setSelectedSessionId(null);
        setSelectedSession(null);
      }
      
      alert('Simulation cancelled successfully');
    } catch (error: any) {
      console.error('Error cancelling simulation:', error);
      alert(error.message || 'Failed to cancel simulation');
    } finally {
      setResumingId(null);
    }
  };

  const handleViewResults = (session: SimulationDetail) => {
    setSelectedSession(session);
    setShowResultsModal(true);
  };

  const ResultsModal = () => {
    if (!selectedSession) return null;
    
    const score = selectedSession.score || 0;
    const passed = score >= 70;
    const evaluation = selectedSession.evaluation || {};
    
    // Score categories
    const scoreCategories = [
      { name: 'Punctuality', score: selectedSession.punctuality_score || evaluation.punctuality_score || 0, icon: <Clock className="w-4 h-4" />, color: 'bg-blue-500' },
      { name: 'Communication', score: selectedSession.communication_score || evaluation.communication_score || 0, icon: <MessageSquare className="w-4 h-4" />, color: 'bg-green-500' },
      { name: 'Problem Solving', score: selectedSession.problem_solving_score || evaluation.problem_solving_score || 0, icon: <Brain className="w-4 h-4" />, color: 'bg-purple-500' },
      { name: 'Adaptability', score: selectedSession.adaptability_score || evaluation.adaptability_score || 0, icon: <Zap className="w-4 h-4" />, color: 'bg-yellow-500' },
      { name: 'Collaboration', score: selectedSession.collaboration_score || evaluation.collaboration_score || 0, icon: <Users className="w-4 h-4" />, color: 'bg-indigo-500' },
      { name: 'Attention to Detail', score: selectedSession.attention_to_detail_score || evaluation.attention_to_detail_score || 0, icon: <EyeIcon className="w-4 h-4" />, color: 'bg-pink-500' },
      { name: 'Initiative', score: selectedSession.initiative_score || evaluation.initiative_score || 0, icon: <Target className="w-4 h-4" />, color: 'bg-orange-500' }
    ];
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Detailed Report</h2>
              <p className="text-sm text-gray-500">{selectedSession.simulationName}</p>
            </div>
            <button
              onClick={() => setShowResultsModal(false)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="p-6">
            {/* Overall Score Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{Math.round(score)}%</div>
                  <div className="text-xs text-white opacity-90">Overall Score</div>
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {passed ? 'PASSED' : 'FAILED'} (Passing Score: 70%)
              </div>
            </div>
            
            {/* Score Categories Grid */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scoreCategories.map((cat, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full ${cat.color} flex items-center justify-center text-white`}>
                          {cat.icon}
                        </div>
                        <span className="font-medium text-gray-900">{cat.name}</span>
                      </div>
                      <span className={`text-lg font-bold ${
                        cat.score >= 70 ? 'text-green-600' : cat.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {Math.round(cat.score)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${
                          cat.score >= 70 ? 'bg-green-500' : cat.score >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${cat.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Time Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Time Spent</span>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {Math.floor((selectedSession.timeSpent || 0) / 60)} minutes {(selectedSession.timeSpent || 0) % 60} seconds
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-900">Completed</span>
                </div>
                <p className="text-purple-700">
                  {selectedSession.completedAt ? new Date(selectedSession.completedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
            
            {/* Task Summary */}
            {selectedSession.tasks && selectedSession.tasks.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Summary</h3>
                <div className="space-y-3">
                  {selectedSession.tasks.map((task: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-500">Task {idx + 1}</span>
                            {idx < (selectedSession.currentTask || 0) && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                          <h4 className="font-medium text-gray-900">{task.title || `Task ${idx + 1}`}</h4>
                          <p className="text-sm text-gray-500 mt-1">{task.description?.slice(0, 100)}...</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-400">{task.type || 'technical'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowResultsModal(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      not_started: 'bg-gray-100 text-gray-600',
      in_progress: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-green-100 text-green-700'
    };
    const labels = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      completed: 'Completed'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreColor = (score?: number) => {
    if (!score) return 'text-gray-400';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Stats cards - only show if not filtering for specific simulation
  const StatsCards = () => {
    if (isSpecificSimulation) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Simulations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Score</p>
              <p className={`text-2xl font-bold ${getScoreColor(stats.averageScore || undefined)}`}>
                {stats.averageScore ? `${Math.round(stats.averageScore)}%` : 'N/A'}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Sessions list
  const SessionsList = () => {
    // If filtering for specific simulation and no sessions found
    if (isSpecificSimulation && sessions.length === 0 && !loading) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No sessions found</h3>
            <p className="text-gray-500">
              No simulation sessions found for this simulation ID.
            </p>
            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {isSpecificSimulation ? 'Simulation Sessions' : 'My Simulation Sessions'}
            </h2>
            {!isSpecificSimulation && (
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    filter === 'all' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('in_progress')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    filter === 'in_progress' 
                      ? 'bg-yellow-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => setFilter('completed')}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    filter === 'completed' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Completed
                </button>
              </div>
            )}
          </div>
        </div>

        {sessions.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No simulations found</h3>
            <p className="text-gray-500">
              {filter === 'all' 
                ? "You haven't started any simulations yet. Apply to jobs that have assessments!" 
                : `No ${filter} simulations found`}
            </p>
            <button
              onClick={() => window.location.href = '/job-match'}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Browse Jobs
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {sessions.map((session) => (
              <div 
                key={session.id}
                className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => loadSimulationDetails(session.sessionId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(session.status)}
                      <h3 className="font-semibold text-gray-900">
                        {session.simulationName || session.jobTitle}
                      </h3>
                      {getStatusBadge(session.status)}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Briefcase className="w-4 h-4" />
                        <span>{session.companyName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="w-4 h-4" />
                        <span>{session.jobTitle}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(session.startedAt || session.completedAt)}</span>
                      </div>
                    </div>

                    {session.status === 'completed' && session.score && (
                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Award className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm font-medium">Score:</span>
                          <span className={`text-sm font-bold ${getScoreColor(session.score)}`}>
                            {Math.round(session.score)}%
                          </span>
                        </div>
                        {session.timeSpent && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              Time: {formatTime(session.timeSpent)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {session.status === 'in_progress' && (
                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm text-gray-600">
                            Task {session.currentTask || 0} / {session.duration || '?'} min
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {session.status === 'in_progress' && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancel(session.sessionId, session.simulationId);
                          }}
                          disabled={resumingId === session.sessionId}
                          className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center gap-2 disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResume(session.sessionId, session.simulationId);
                          }}
                          disabled={resumingId === session.sessionId}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                        >
                          {resumingId === session.sessionId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Resume
                        </button>
                      </>
                    )}
                    {session.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Pass the session data to view results
                          const sessionDetail = sessions.find(s => s.sessionId === session.sessionId);
                          if (sessionDetail) {
                            // We need to load full details first
                            loadSimulationDetails(session.sessionId).then(() => {
                              setTimeout(() => {
                                if (selectedSession) {
                                  handleViewResults(selectedSession);
                                }
                              }, 500);
                            });
                          } else {
                            loadSimulationDetails(session.sessionId);
                          }
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        View Results
                      </button>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Detailed view of a specific simulation
  const SimulationDetailView = () => {
    if (!selectedSession) return null;

    // Determine if the simulation is completed based on status or evaluation
    const isCompleted = selectedSession.status === 'completed' || selectedSession.hasEvaluation === true;
    const displayStatus = isCompleted ? 'completed' : selectedSession.status;
    const displayScore = selectedSession.score || selectedSession.evaluation?.overall_score;

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedSessionId(null);
                setSelectedSession(null);
              }}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
            >
              ← Back to list
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedSession.simulationName || selectedSession.jobTitle}
            </h2>
          </div>
          <RefreshCw 
            className="w-5 h-5 text-gray-400 cursor-pointer hover:text-gray-600" 
            onClick={() => loadSimulationDetails(selectedSession.sessionId)}
          />
        </div>

        <div className="p-6">
          {/* Company Info */}
          <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-200">
            {selectedSession.companyLogo ? (
              <img 
                src={selectedSession.companyLogo} 
                alt={selectedSession.companyName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-gray-900">{selectedSession.companyName}</h3>
              <p className="text-sm text-gray-500">{selectedSession.jobTitle}</p>
              {selectedSession.applicationId && (
                <p className="text-xs text-gray-400 mt-1">Application ID: {selectedSession.applicationId.slice(0, 8)}...</p>
              )}
            </div>
          </div>

          {/* Status and Score */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                {getStatusIcon(displayStatus)}
                <span className="font-medium">Status: {displayStatus === 'completed' ? 'Completed' : (displayStatus === 'in_progress' ? 'In Progress' : 'Not Started')}</span>
              </div>
              
              {selectedSession.startedAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span>Started: {formatDate(selectedSession.startedAt)}</span>
                </div>
              )}
              
              {selectedSession.completedAt && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4" />
                  <span>Completed: {formatDate(selectedSession.completedAt)}</span>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-yellow-500" />
                <span className="font-medium">Performance</span>
              </div>
              
              {displayScore ? (
                <>
                  <div className="text-3xl font-bold mb-2">
                    <span className={getScoreColor(displayScore)}>
                      {Math.round(displayScore)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4" />
                    <span>Time spent: {formatTime(selectedSession.timeSpent)}</span>
                  </div>
                  {selectedSession.duration && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <Clock className="w-4 h-4" />
                      <span>Duration: {selectedSession.duration} min</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-gray-500">Not completed yet</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            {displayStatus === 'in_progress' && (
              <>
                <button
                  onClick={() => handleResume(selectedSession.sessionId, selectedSession.simulationId)}
                  disabled={resumingId === selectedSession.sessionId}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                >
                  {resumingId === selectedSession.sessionId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Resume Simulation
                </button>
                <button
                  onClick={() => handleCancel(selectedSession.sessionId, selectedSession.simulationId)}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  Cancel
                </button>
              </>
            )}
            
            {displayStatus === 'completed' && displayScore && (
              <button
                onClick={() => handleViewResults(selectedSession)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                View Detailed Report
              </button>
            )}
            
            <button
              onClick={() => window.open(`/simulation/chat/${selectedSession.simulationId}`, '_blank')}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Chat History
            </button>
          </div>

          {/* Tasks Progress */}
          {selectedSession.tasks && selectedSession.tasks.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-3">Tasks Progress</h4>
              <div className="space-y-2">
                {selectedSession.tasks.map((task: any, index: number) => (
                  <div 
                    key={index}
                    className={`p-3 rounded-lg border ${
                      selectedSession.currentTask && index < selectedSession.currentTask
                        ? 'bg-green-50 border-green-200'
                        : selectedSession.currentTask === index
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-sm text-gray-500">Task {index + 1}</span>
                        <p className="font-medium">{task.name || task.title || `Task ${index + 1}`}</p>
                        {task.type && (
                          <span className="text-xs text-gray-400">{task.type}</span>
                        )}
                      </div>
                      {selectedSession.currentTask && index < selectedSession.currentTask && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {selectedSession.currentTask === index && (
                        <Clock className="w-5 h-5 text-yellow-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Objectives */}
          {selectedSession.objectives && selectedSession.objectives.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Learning Objectives</h4>
              <ul className="list-disc list-inside space-y-1">
                {selectedSession.objectives.map((obj: string, idx: number) => (
                  <li key={idx} className="text-sm text-blue-700">{obj}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading && sessions.length === 0 && !selectedSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading simulation sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button onClick={onBack} className="mr-4 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                ← Back
              </button>
              <h1 className="text-xl font-bold text-gray-900">
                {isSpecificSimulation ? 'Simulation Details' : 'My Simulation Sessions'}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5 inline mr-2" />
            {error}
          </div>
        )}

        {/* Stats Cards - only show if not specific simulation */}
        <StatsCards />

        {/* Main Content */}
        {selectedSessionId && selectedSession ? (
          <SimulationDetailView />
        ) : (
          <SessionsList />
        )}
      </div>

      {/* Results Modal */}
      {showResultsModal && <ResultsModal />}
    </div>
  );
};

export default SimulationSessionViewer;