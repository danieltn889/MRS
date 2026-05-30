import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Download, Clock, Calendar, Award, CheckCircle, XCircle, Code, 
  Link as LinkIcon, FileText, User, Briefcase, Building, Target, MessageSquare, 
  Activity, Zap, Eye, Star, AlertTriangle, Coffee, Brain, Users as UsersIcon, 
  List, CheckSquare, Play, Lock, Terminal, GitBranch, Database, Server, 
  Cpu, ChevronDown, ChevronUp, Copy, ExternalLink, Maximize2, Minimize2,
  Save, Edit, Check, X, Github, Trophy, ThumbsUp, ThumbsDown, TrendingUp,
  FolderOpen, FileCode, Loader, Edit2, PlusCircle, Award as AwardIcon
} from 'lucide-react';
import simulationAPI from '../../services/simulationAPI';

interface SessionReportProps {
  sessionId?: string;
  onBack?: () => void;
}

interface TaskProgressItem {
  id: string | null;
  task_index: number;
  task_id: string;
  task_title: string;
  task_description: string;
  task_duration: number;
  task_type: string;
  status: string;
  score: number | null;
  feedback: string | null;
  answer: any;
  github_commit_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  time_spent: number;
  code_submission: any;
  template_task: any;
}

const SessionReport: React.FC<SessionReportProps> = ({ sessionId: propSessionId, onBack }) => {
  const navigate = useNavigate();
  const { sessionId: paramSessionId } = useParams();
  const sessionId = propSessionId || paramSessionId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<TaskProgressItem[]>([]);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [editingFeedback, setEditingFeedback] = useState<number | null>(null);
  const [tempFeedback, setTempFeedback] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [showScoreModal, setShowScoreModal] = useState<number | null>(null);
  const [tempScore, setTempScore] = useState<number>(0);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Get current user from localStorage on component mount
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
        console.log('👤 Current user from localStorage:', user);
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }, []);

  // Check if user can grade (recruiter or company_admin) - check multiple sources
  const canGrade = (() => {
    // Check from state
    if (currentUser) {
      const userType = currentUser.user_type || currentUser.role || currentUser.type;
      if (userType === 'recruiter' || userType === 'company_admin' || userType === 'Company Admin' || userType === 'admin') {
        return true;
      }
    }
    // Check from session data
    if (sessionData?.session?.user_type) {
      const userType = sessionData.session.user_type;
      if (userType === 'recruiter' || userType === 'company_admin' || userType === 'Company Admin') {
        return true;
      }
    }
    return false;
  })();

  console.log('🔍 canGrade:', canGrade);
  console.log('🔍 currentUser:', currentUser);

  useEffect(() => {
    if (sessionId) {
      fetchSessionData();
    } else {
      setError('No session ID provided');
      setLoading(false);
    }
  }, [sessionId]);

  const fetchSessionData = async () => {
    if (!sessionId) return;
    
    try {
      setLoading(true);
      console.log('📞 Fetching session data for:', sessionId);
      const response = await simulationAPI.getSessionById(sessionId);
      console.log('📊 Response:', response);
      const data = response?.data || response;
      setSessionData(data);
      
      if (data && data.task_progress) {
        setTaskProgress(data.task_progress);
        console.log('📋 Task progress:', data.task_progress);
      }
      
      setError(null);
    } catch (err: any) {
      console.error('Error fetching session data:', err);
      setError(err?.message || 'Failed to load session data');
      setSessionData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScore = async (taskIndex: number, taskId: string, score: number) => {
    if (!canGrade) {
      setCopySuccess('❌ You do not have permission to grade');
      setTimeout(() => setCopySuccess(null), 3000);
      return;
    }
    
    try {
      setSaving(true);
      console.log('📝 Saving score:', { sessionId, taskIndex, taskId, score });
      
      // Update local state first for immediate feedback
      setTaskProgress(prev => prev.map(task => 
        task.task_index === taskIndex ? { ...task, score: score } : task
      ));
      setShowScoreModal(null);
      setCopySuccess(`✅ Score ${score}% saved for Task ${taskIndex}`);
      setTimeout(() => setCopySuccess(null), 3000);
    } catch (err) {
      console.error('Error saving score:', err);
      setCopySuccess(`❌ Failed to save score: ${err.message || 'Unknown error'}`);
      setTimeout(() => setCopySuccess(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFeedback = async (taskIndex: number, taskId: string, feedback: string) => {
    if (!canGrade) return;
    
    try {
      setSaving(true);
      // Update local state
      setTaskProgress(prev => prev.map(task => 
        task.task_index === taskIndex ? { ...task, feedback: feedback } : task
      ));
      setEditingFeedback(null);
      setCopySuccess(`✅ Feedback saved for Task ${taskIndex}`);
      setTimeout(() => setCopySuccess(null), 3000);
    } catch (err) {
      console.error('Error saving feedback:', err);
      setCopySuccess(`❌ Failed to save feedback for Task ${taskIndex}`);
      setTimeout(() => setCopySuccess(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getTaskStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'in_progress':
        return <Play size={16} className="text-blue-500" />;
      default:
        return <Lock size={16} className="text-gray-400" />;
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'in_progress':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const downloadReport = () => {
    if (!sessionData) return;
    
    const reportData = {
      session_id: sessionId,
      generated_at: new Date().toISOString(),
      session: sessionData.session,
      candidate: sessionData.candidate,
      evaluation: sessionData.evaluation,
      simulation_template: sessionData.simulation_template,
      job: sessionData.job,
      company: sessionData.company,
      task_progress: taskProgress,
      total_score: sessionData.total_score,
      passed: sessionData.passed
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_report_${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const copyToClipboard = (text: string, taskId: number) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(`Task ${taskId} code copied!`);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const renderCodeBlock = (code: string, language: string, taskIndex: number) => {
    if (!code) return null;
    
    const codeLines = code.split('\n');
    const displayCode = codeLines.slice(0, 30).join('\n');
    const hasMore = codeLines.length > 30;
    
    return (
      <div className="mt-4 bg-gray-900 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-green-400" />
            <span className="text-sm text-gray-300 font-mono">{language || 'javascript'}</span>
          </div>
          <button
            onClick={() => copyToClipboard(code, taskIndex)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
          >
            <Copy size={12} />
            Copy
          </button>
        </div>
        <pre className="p-4 overflow-x-auto text-sm font-mono text-gray-300 max-h-96 overflow-y-auto">
          <code>{displayCode}{hasMore && '\n\n... (truncated)'}</code>
        </pre>
      </div>
    );
  };

  // Score Modal Component
  const ScoreModal = ({ task, onClose }: { task: TaskProgressItem; onClose: () => void }) => {
    const [localScore, setLocalScore] = useState(task.score || 0);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Set Score for Task {task.task_index}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">{task.task_title}</p>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Score (0-100)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={localScore}
                onChange={(e) => setLocalScore(parseInt(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={localScore}
                onChange={(e) => setLocalScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => handleSaveScore(task.task_index, task.task_id, localScore)}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
            >
              {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              Save Score
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || !sessionData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-2xl shadow-lg">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Session Not Found</h2>
          <p className="text-gray-600 mb-4">
            {error || 'The session you are looking for does not exist.'}
          </p>
          <p className="text-sm text-gray-500 mb-6 break-all font-mono bg-gray-100 p-2 rounded">
            Session ID: {sessionId}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleBack}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasEvaluation = sessionData.has_evaluation && sessionData.evaluation;
  const overallScore = sessionData.total_score || 0;
  const passed = sessionData.passed || false;
  const candidate = sessionData.candidate || {};
  const session = sessionData.session || {};
  const evaluation = sessionData.evaluation || {};
  const simulationTemplate = sessionData.simulation_template || {};
  const job = sessionData.job || {};
  const company = sessionData.company || {};
  
  const completedTasks = taskProgress.filter(t => t.status === 'completed').length;
  const totalTasks = taskProgress.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Session Report</h1>
                <p className="text-sm text-gray-500 font-mono">
                  Session ID: {sessionId?.substring(0, 8)}...{sessionId?.substring(sessionId.length - 4)}
                </p>
              </div>
            </div>
            <button
              onClick={downloadReport}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <Download size={16} />
              Download Report
            </button>
          </div>
        </div>
      </div>

      {copySuccess && (
        <div className={`fixed bottom-4 right-4 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in ${
          copySuccess.includes('Failed') ? 'bg-red-600' : 'bg-green-600'
        }`}>
          {copySuccess}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Candidate Info Card */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {candidate.first_name?.charAt(0)}{candidate.last_name?.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{candidate.full_name}</h2>
              <p className="text-gray-500">{candidate.email}</p>
              <div className="flex flex-wrap gap-3 mt-2">
                {candidate.headline && (
                  <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                    <Briefcase size={14} /> {candidate.headline}
                  </span>
                )}
                {candidate.city && (
                  <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                    <Building size={14} /> {candidate.city}, {candidate.country}
                  </span>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
                {Math.round(overallScore)}%
              </div>
              <div className="text-sm text-gray-500">Overall Score</div>
              <div className="mt-1">
                {passed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <CheckCircle size={12} /> Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                    <XCircle size={12} /> Failed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Task Progress Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <List size={18} className="text-purple-500" />
            Task Progress Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <CheckCircle size={24} className="text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-600">{completedTasks}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <Play size={24} className="text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-600">{taskProgress.filter(t => t.status === 'in_progress').length}</p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <Lock size={24} className="text-gray-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-600">{taskProgress.filter(t => t.status === 'not_started').length}</p>
              <p className="text-sm text-gray-600">Not Started</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 text-center">
              <AwardIcon size={24} className="text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-purple-600">{taskProgress.filter(t => t.score !== null).length}</p>
              <p className="text-sm text-gray-600">Graded</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-600">Overall Progress</span>
            <span className="text-gray-600">{Math.round((completedTasks / totalTasks) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
            />
          </div>
        </div>

        {/* Tasks List */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckSquare size={18} className="text-purple-500" />
            Tasks Breakdown ({completedTasks}/{totalTasks} Completed)
          </h3>
          
          {/* Debug info - remove after fixing */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="text-blue-700">
              🔍 Debug: canGrade = {canGrade ? 'true' : 'false'} | User: {currentUser?.email || 'Not logged in'} | Role: {currentUser?.user_type || currentUser?.role || 'unknown'}
            </p>
          </div>
          
          <div className="space-y-4">
            {taskProgress.map((task) => (
              <div 
                key={task.task_id}
                className={`rounded-lg border p-4 transition-all ${getTaskStatusColor(task.status)}`}
              >
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-1">
                    {getTaskStatusIcon(task.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-gray-900">
                          Task {task.task_index}: {task.task_title}
                        </h4>
                        {task.score !== null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getScoreBgColor(task.score)} ${getScoreColor(task.score)} font-medium`}>
                            Score: {Math.round(task.score)}%
                          </span>
                        )}
                        {task.score === null && task.status === 'completed' && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                            Pending Grade
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{task.task_description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock size={14} /> {task.task_duration} min
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                      task.task_type === 'technical' ? 'bg-blue-100 text-blue-700' :
                      task.task_type === 'behavioral' ? 'bg-purple-100 text-purple-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {task.task_type}
                    </span>
                    
                    {/* SET SCORE BUTTON - Force show for completed tasks when in development */}
                    {task.status === 'completed' && (
                      <button
                        onClick={() => {
                          console.log('🎯 Opening score modal for task:', task.task_index);
                          setTempScore(task.score || 70);
                          setShowScoreModal(task.task_index);
                        }}
                        className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-1 text-sm font-medium"
                      >
                        <AwardIcon size={14} />
                        {task.score !== null ? `Update Score (${Math.round(task.score)}%)` : 'Set Score'}
                      </button>
                    )}
                    
                    {/* Expand/Collapse button */}
                    <button
                      onClick={() => setExpandedTask(expandedTask === task.task_index ? null : task.task_index)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {expandedTask === task.task_index ? (
                        <ChevronUp size={18} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Status indicators */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    {task.status === 'completed' && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle size={14} /> Completed
                      </span>
                    )}
                    {task.github_commit_url && (
                      <a 
                        href={task.github_commit_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GitBranch size={14} /> View GitHub
                      </a>
                    )}
                    {task.answer && task.answer.code && (
                      <span className="flex items-center gap-1 text-purple-600">
                        <Terminal size={14} /> Code Submitted
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Expanded details */}
                {expandedTask === task.task_index && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                    {/* Feedback Section */}
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-sm font-semibold text-blue-700">Feedback</h5>
                        {editingFeedback !== task.task_index && (
                          <button
                            onClick={() => {
                              setTempFeedback(task.feedback || '');
                              setEditingFeedback(task.task_index);
                            }}
                            className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                          >
                            <Edit2 size={12} /> Edit Feedback
                          </button>
                        )}
                      </div>
                      
                      {editingFeedback === task.task_index ? (
                        <div className="space-y-3">
                          <textarea
                            value={tempFeedback}
                            onChange={(e) => setTempFeedback(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                            placeholder="Enter feedback for the candidate..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveFeedback(task.task_index, task.task_id, tempFeedback)}
                              disabled={saving}
                              className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                            >
                              <Save size={14} /> Save Feedback
                            </button>
                            <button
                              onClick={() => setEditingFeedback(null)}
                              className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {task.feedback ? (
                            <p className="text-gray-700 whitespace-pre-wrap">{task.feedback}</p>
                          ) : (
                            <span className="text-gray-400 italic">No feedback provided yet</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* GitHub Link */}
                    {task.github_commit_url && (
                      <div className="bg-purple-50 rounded-lg p-4">
                        <h5 className="text-sm font-semibold text-purple-700 mb-2">GitHub Repository</h5>
                        <a 
                          href={task.github_commit_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-purple-600 hover:text-purple-800 flex items-center gap-1 break-all"
                        >
                          <GitBranch size={14} />
                          {task.github_commit_url}
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                    
                    {/* Answer/Code Submission */}
                    {task.answer && task.answer.code && (
                      <div>
                        <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                          <Code size={14} className="text-purple-500" />
                          Code Submission
                        </h5>
                        {renderCodeBlock(task.answer.code, 'javascript', task.task_index)}
                      </div>
                    )}
                    
                    {/* Task Progress Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Started At</p>
                        <p className="font-medium">{formatDate(task.started_at)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Completed At</p>
                        <p className="font-medium">{formatDate(task.completed_at)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Time Spent</p>
                        <p className="font-medium">{formatTime(task.time_spent)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Simulation Info Card */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target size={18} className="text-purple-500" />
            Simulation Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Simulation Name</p>
              <p className="font-medium">{simulationTemplate.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Job Title</p>
              <p className="font-medium">{job.title || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Company</p>
              <p className="font-medium">{company.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Difficulty</p>
              <p className="font-medium capitalize">{simulationTemplate.difficulty || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Duration</p>
              <p className="font-medium">{simulationTemplate.duration_minutes || 'N/A'} minutes</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Tasks</p>
              <p className="font-medium">{simulationTemplate.total_tasks || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Score Modal */}
      {showScoreModal !== null && (
        <ScoreModal 
          task={taskProgress.find(t => t.task_index === showScoreModal)!} 
          onClose={() => setShowScoreModal(null)} 
        />
      )}
    </div>
  );  
};

export default SessionReport;