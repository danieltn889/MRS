// TaskContent.tsx - WITH CHAT AND GITHUB ANALYTICS BUTTONS

import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Code, Upload, FileText, X, Lightbulb, Target,
  Bold, Italic, Underline, Github, Play, Clock, CheckCircle, AlertCircle, Lock, RefreshCw,
  MessageCircle, BarChart3, ExternalLink
} from 'lucide-react';
import GitHubTaskPanel from './GitHubTaskPanel';
import { TaskCompletionDialog } from './Dialogs';

interface SimulationTask {
  id: string;
  title: string;
  description: string;
  type: string;
  duration?: number;
  instructions: string;
  data: any;
  required: boolean;
  order: number;
}

interface TaskContentProps {
  task: SimulationTask | null;
  simulationId?: string;
  taskIndex?: number;
  candidateGitHubUsername?: string;
  githubRepo?: any;
  code: string;
  setCode: (code: string) => void;
  currentFileContent: string;
  setCurrentFileContent: (content: string) => void;
  currentFileLanguage: string;
  essay: string;
  setEssay: (essay: string) => void;
  mcqAnswers: Record<string, number[]>;
  setMcqAnswers: (answers: Record<string, number[]>) => void;
  uploadedFiles: File[];
  setUploadedFiles: (files: File[]) => void;
  editorTheme: string;
  fontSize: number;
  showMinimap: boolean;
  currentFilePath?: string | null;
  onLoadFromGitHub?: (owner: string, repo: string) => Promise<void>;
  isLoadingGitHub?: boolean;
  taskProgress?: any[];
  onStartTask?: (taskIndex: number) => Promise<void>;
  onUpdateTaskProgress?: (taskIndex: number, data: any) => Promise<void>;
  onRefreshTaskProgress?: () => Promise<void>;
  session?: any;
  currentRepo?: any;
  taskRepositories?: Record<number, any>;
  onRefreshRepo?: () => Promise<void>;
  // ✅ NEW PROPS
  onOpenChat?: () => void;
  onOpenGitHubAnalytics?: (taskIndex: number) => void;
  unreadCount?: number;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds === 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const TaskContent: React.FC<TaskContentProps> = ({
  task,
  simulationId,
  taskIndex,
  candidateGitHubUsername,
  githubRepo,
  code,
  setCode,
  currentFileContent,
  setCurrentFileContent,
  currentFileLanguage,
  essay,
  setEssay,
  mcqAnswers,
  setMcqAnswers,
  uploadedFiles,
  setUploadedFiles,
  editorTheme,
  fontSize,
  showMinimap,
  currentFilePath,
  onLoadFromGitHub,
  isLoadingGitHub,
  taskProgress,
  onStartTask,
  onUpdateTaskProgress,
  onRefreshTaskProgress,
  session,
  currentRepo,
  taskRepositories = {},
  onRefreshRepo,
  // ✅ NEW PROPS
  onOpenChat,
  onOpenGitHubAnalytics,
  unreadCount = 0,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [hideStartModal, setHideStartModal] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showChatTooltip, setShowChatTooltip] = useState(false);
  const [showGithubTooltip, setShowGithubTooltip] = useState(false);
  
  // Completion dialog draft state
  const [completionDraft, setCompletionDraft] = useState({
    completed: true,
    comment: '',
    challenges: '',
    suggestions: '',
    githubCommitUrl: '',
  });

  // Get task progress status from API
  const currentTaskProgress = taskProgress?.find(tp => tp.task_index === taskIndex);
  const isTaskCompleted = currentTaskProgress?.status === 'completed';
  const isTaskInProgress = currentTaskProgress?.status === 'in_progress';
  const isTaskNotStarted = !isTaskInProgress && !isTaskCompleted;
  const shouldShowStartModal = !hideStartModal && isTaskNotStarted;
  const taskStartTime = currentTaskProgress?.started_at;
  const taskTimeSpent = currentTaskProgress?.time_spent || 0;

  // Calculate task number (1-based for display)
  const taskNumber = (taskIndex !== undefined && taskIndex !== null) ? taskIndex + 1 : '?';
  const totalTasks = taskProgress?.length || 0;

  // Local state for elapsed time
  const [elapsedTime, setElapsedTime] = useState(taskTimeSpent);

  useEffect(() => {
    setHideStartModal(false);
    setStartError(null);
  }, [taskIndex]);

  useEffect(() => {
    if (isTaskInProgress || isTaskCompleted) {
      setHideStartModal(true);
    }
  }, [isTaskInProgress, isTaskCompleted]);
  
  // Timer for elapsed time
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    if (isTaskInProgress && !isTaskCompleted && taskStartTime) {
      const startTime = new Date(taskStartTime).getTime();
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(elapsed);
        
        if (onUpdateTaskProgress && elapsed % 3600 === 0 && elapsed > 0) {
          onUpdateTaskProgress(taskIndex!, { timeSpent: elapsed });
        }
      }, 1000);
    } else {
      setElapsedTime(taskTimeSpent);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTaskInProgress, isTaskCompleted, taskStartTime, taskTimeSpent, taskIndex, onUpdateTaskProgress]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    if (!onRefreshTaskProgress) {
      console.warn('No refresh function available');
      return;
    }
    
    setIsRefreshing(true);
    console.log('🔄 Manual refresh triggered by user');
    
    try {
      await onRefreshTaskProgress();
      console.log('✅ Manual refresh completed successfully');
      setTimeout(() => setIsRefreshing(false), 500);
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
      setIsRefreshing(false);
    }
  };

  const handleStartTask = async () => {
    if (!onStartTask || taskIndex === undefined) {
      console.error('❌ Cannot start task: missing onStartTask or taskIndex');
      return;
    }
    
    console.log(`🚀 Manually starting task ${taskIndex}...`);
    setIsStarting(true);
    setStartError(null);
    
    try {
      await onStartTask(taskIndex);
      setHideStartModal(true);
      console.log(`✅ Task ${taskIndex} started successfully`);
      
      if (onRefreshTaskProgress) {
        await onRefreshTaskProgress();
      }
    } catch (err: any) {
      console.error(`❌ Failed to start task ${taskIndex}:`, err);
      setStartError(err.message || 'Failed to start task');
      setTimeout(() => setStartError(null), 3000);
    } finally {
      setIsStarting(false);
    }
  };

  const handleOpenCompletionDialog = () => {
    console.log(`📝 Opening completion dialog for task ${taskNumber}`);
    setCompletionDraft({
      completed: true,
      comment: '',
      challenges: '',
      suggestions: '',
      githubCommitUrl: currentRepo ? `https://github.com/${currentRepo.owner}/${currentRepo.repo}` : '',
    });
    setShowCompletionDialog(true);
  };

  const handleSaveCompletion = async () => {
    if (taskIndex === undefined || !onUpdateTaskProgress) {
      console.error('❌ Cannot complete task: missing taskIndex or onUpdateTaskProgress');
      return;
    }
    
    console.log(`✅ Completing task ${taskNumber}...`);
    console.log('📊 Completion data:', completionDraft);
    
    try {
      await onUpdateTaskProgress(taskIndex, { 
        status: 'completed',
        completed_at: new Date().toISOString(),
        time_spent: elapsedTime,
        answer: {
          completed: completionDraft.completed,
          comment: completionDraft.comment,
          challenges: completionDraft.challenges,
          suggestions: completionDraft.suggestions,
          githubCommitUrl: completionDraft.githubCommitUrl,
          githubRepo: currentRepo ? {
            owner: currentRepo.owner,
            repo: currentRepo.repo,
            url: `https://github.com/${currentRepo.owner}/${currentRepo.repo}`,
          } : null,
          code: code,
          essay: essay,
          mcqAnswers: mcqAnswers,
        }
      });
      console.log(`✅ Task ${taskNumber} completed successfully`);
      
      setShowCompletionDialog(false);
      
      if (onRefreshTaskProgress) {
        await onRefreshTaskProgress();
      }
    } catch (error) {
      console.error(`❌ Failed to complete task ${taskNumber}:`, error);
    }
  };

  // ✅ Handle Chat button click
  const handleChatClick = () => {
    console.log('💬 Opening chat for task:', taskNumber);
    if (onOpenChat) {
      onOpenChat();
    }
  };

  // ✅ Handle GitHub Analytics button click
  const handleGitHubAnalyticsClick = () => {
    console.log('📊 Opening GitHub Analytics for task:', taskNumber);
    if (onOpenGitHubAnalytics && taskIndex !== undefined) {
      onOpenGitHubAnalytics(taskIndex);
    }
  };

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Target size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Select a task to begin</p>
        </div>
      </div>
    );
  }

  // ============================================
  // SHOW START SCREEN IF NOT STARTED
  // ============================================
  if (shouldShowStartModal) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900/95 z-50 p-3 sm:p-4 overflow-y-auto">
        <div className="relative w-full max-w-md max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)] bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl flex flex-col">
          <button
            type="button"
            onClick={() => setHideStartModal(true)}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/80 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-colors"
            aria-label="Hide start modal"
          >
            <X size={14} />
            Hide
          </button>

          <div className="bg-gray-850 px-6 py-5 border-b border-gray-700 text-center flex-shrink-0">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-yellow-900/30 mb-4">
              <Lock size={34} className="text-yellow-500" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Task {taskNumber}: {task.title || `Task ${taskNumber}`}
            </h3>
            <p className="text-sm font-medium text-yellow-400">Not Started Yet</p>
          </div>
          
          <div className="overflow-y-auto flex-1 min-h-0">
            <div className="px-6 py-5">
              <div className="bg-gray-900 rounded-lg p-4 mb-4">
                <p className="text-gray-400 text-sm mb-2">📋 Task Type</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-3 py-1.5 rounded-full ${
                    task.type === 'technical' ? 'bg-blue-900/50 text-blue-300' :
                    task.type === 'code_editor' ? 'bg-purple-900/50 text-purple-300' :
                    'bg-gray-700 text-gray-300'
                  }`}>
                    {task.type || 'Generic'}
                  </span>
                  {task.duration && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock size={14} />
                      {task.duration} min
                    </span>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-900 rounded-lg p-4 mb-5">
                <p className="text-gray-400 text-sm mb-2">📝 What you'll build</p>
                <p className="text-gray-300 text-sm leading-relaxed">
                  {task.description || 'Complete the requirements for this task.'}
                </p>
              </div>
              
              <div className="bg-blue-900/20 rounded-lg p-4 border border-blue-800/50">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle size={16} className="text-blue-500" />
                  <p className="text-blue-400 text-sm font-semibold">Ready to begin?</p>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Click "Start Task" to unlock the instructions and begin working on this task.
                </p>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 border-t border-gray-700 bg-gray-850 flex-shrink-0">
            {startError && (
              <div className="mb-4 p-3 bg-red-900/50 rounded-lg text-red-300 text-sm text-center">
                {startError}
              </div>
            )}
            <button
              onClick={handleStartTask}
              disabled={isStarting}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:opacity-50 rounded-xl transition-all duration-200 font-semibold text-white shadow-lg cursor-pointer"
            >
              {isStarting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="text-base">Starting Task {taskNumber}...</span>
                </>
              ) : (
                <>
                  <Play size={20} className="text-white" />
                  <span className="text-base">Start Task {taskNumber}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setHideStartModal(true)}
              className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors font-medium text-gray-200"
            >
              <X size={16} />
              Hide for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // SHOW FULL TASK CONTENT
  // ============================================
  return (
    <>
      <div className="h-full overflow-y-auto">
        <div className="p-4 space-y-4 pb-8">
          
          {/* TASK HEADER */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="px-4 py-3 bg-gray-850 border-b border-gray-700 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-white font-semibold text-base">
                  Task {taskNumber}: {task.title || `Task ${taskNumber}`}
                </h2>
                {task.duration && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock size={12} />
                    {task.duration} min
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {/* ✅ CHAT BUTTON */}
                <div className="relative">
                  <button
                    onClick={handleChatClick}
                    onMouseEnter={() => setShowChatTooltip(true)}
                    onMouseLeave={() => setShowChatTooltip(false)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium shadow-md"
                    title="Chat with recruiter or admin"
                  >
                    <MessageCircle size={14} />
                    Chat
                    {unreadCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {showChatTooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700 whitespace-nowrap z-50">
                      💬 Ask questions or get clarification
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>

                {/* ✅ GITHUB ANALYTICS BUTTON */}
                <div className="relative">
                  <button
                    onClick={handleGitHubAnalyticsClick}
                    onMouseEnter={() => setShowGithubTooltip(true)}
                    onMouseLeave={() => setShowGithubTooltip(false)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium shadow-md"
                    title="View GitHub repository analytics"
                  >
                    <BarChart3 size={14} />
                    Analytics
                  </button>
                  {showGithubTooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700 whitespace-nowrap z-50">
                      📊 View repository stats and code analysis
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                  )}
                </div>

                {/* ✅ REFRESH BUTTON */}
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium shadow-md"
                  title="Refresh task progress"
                >
                  <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>

                {/* STATUS BADGE */}
                {isTaskCompleted ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/30 border border-green-700 rounded-lg">
                    <CheckCircle size={14} className="text-green-400" />
                    <span className="text-green-400 text-sm font-medium">Completed</span>
                    <span className="text-green-300 text-xs ml-2 font-mono">
                      {formatDuration(taskTimeSpent)}
                    </span>
                  </div>
                ) : isTaskNotStarted ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                      <Lock size={14} className="text-yellow-400" />
                      <span className="text-yellow-300 text-sm font-medium">Not Started</span>
                    </div>
                    <button
                      onClick={handleStartTask}
                      disabled={isStarting}
                      className="px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium shadow-md"
                    >
                      {isStarting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          Start Task {taskNumber}
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Status Badge with Timer */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border border-blue-700 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-blue-300 text-sm font-medium">In Progress</span>
                      <span className="text-blue-300 text-xs font-mono ml-2">
                        {formatDuration(elapsedTime)}
                      </span>
                    </div>
                    
                    {/* COMPLETE BUTTON */}
                    <button
                      onClick={handleOpenCompletionDialog}
                      className="px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg flex items-center gap-2 transition-all duration-200 text-sm font-medium shadow-md"
                    >
                      <CheckCircle size={14} />
                      Complete Task {taskNumber}
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {/* Helpful Info Bar */}
            <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-700 flex items-center gap-4 flex-wrap text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <MessageCircle size={12} className="text-blue-400" />
                <span>💬 <strong className="text-blue-300">Chat</strong> - Ask questions or get clarification</span>
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 size={12} className="text-purple-400" />
                <span>📊 <strong className="text-purple-300">Analytics</strong> - View GitHub repo stats</span>
              </span>
              <span className="flex items-center gap-1">
                <RefreshCw size={12} className="text-gray-400" />
                <span>🔄 <strong className="text-gray-300">Refresh</strong> - Update task progress</span>
              </span>
            </div>
            
            {startError && (
              <div className="px-4 py-2 bg-red-900/50 border-b border-red-700 flex items-center gap-2">
                <AlertCircle size={14} className="text-red-400" />
                <span className="text-red-300 text-xs">{startError}</span>
              </div>
            )}
            
            {task.description && (
              <div className="px-4 py-3 bg-gray-900/50">
                <p className="text-gray-300 text-sm">{task.description}</p>
              </div>
            )}
          </div>

          {isTaskNotStarted && (
            <div className="bg-yellow-900/20 border border-yellow-700/60 rounded-lg p-4">
              <div className="flex gap-3">
                <Lock size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-yellow-300 text-sm font-semibold">Start this task to continue</p>
                  <p className="text-gray-300 text-sm mt-1">
                    Instructions are hidden until you start. Use the Start Task button above when you are ready.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chat Help Message - shown when task is not started */}
          {isTaskNotStarted && (
            <div className="bg-blue-900/20 border border-blue-700/60 rounded-lg p-4">
              <div className="flex gap-3">
                <MessageCircle size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-sm font-semibold">Need help?</p>
                  <p className="text-gray-300 text-sm mt-1">
                    Use the <strong className="text-blue-400">Chat</strong> button above to ask the recruiter or admin for clarification on this task.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* GitHub Analytics Help Message */}
          {!isTaskNotStarted && (
            <div className="bg-purple-900/20 border border-purple-700/60 rounded-lg p-4">
              <div className="flex gap-3">
                <BarChart3 size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-purple-300 text-sm font-semibold">Track your progress</p>
                  <p className="text-gray-300 text-sm mt-1">
                    Click the <strong className="text-purple-400">Analytics</strong> button above to view detailed GitHub repository statistics and code analysis for this task.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* INSTRUCTIONS */}
          {!isTaskNotStarted && task.instructions && (
            <div className="bg-blue-900/30 border-l-4 border-blue-500 rounded-r p-4">
              <div className="flex gap-3">
                <Lightbulb size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide mb-2">Instructions</p>
                  <div className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                    {task.instructions}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CODE EDITOR */}
          {(task.type === 'technical' || task.type === 'code_editor' || task.type === 'code_execution') && (
            <div className="space-y-4">
              {task.data?.starterCode && (
                <div className="bg-gray-800 rounded p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Code size={12} /> Starter Code</p>
                  <pre className="text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">{task.data.starterCode}</pre>
                </div>
              )}
              <div className="rounded-lg overflow-hidden border border-gray-700" style={{ height: '60vh', minHeight: '400px' }}>
                <Editor
                  height="100%"
                  width="100%"
                  language={currentFileLanguage || 'javascript'}
                  value={currentFileContent}
                  onChange={(v) => { 
                    setCurrentFileContent(v || ''); 
                    setCode(v || '');
                    if (onUpdateTaskProgress && taskIndex !== undefined) {
                      onUpdateTaskProgress(taskIndex, { code: v || '' });
                    }
                  }}
                  theme={editorTheme}
                  options={{
                    fontSize,
                    minimap: { enabled: showMinimap },
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                  }}
                />
              </div>
            </div>
          )}

          {/* ESSAY */}
          {task.type === 'essay' && (
            <div className="bg-gray-800 rounded border border-gray-700">
              <div className="border-b border-gray-700 px-3 py-2">
                <span className="text-xs text-gray-400">Word count: {essay.split(/\s+/).filter(w => w.length > 0).length}</span>
              </div>
              <textarea 
                value={essay} 
                onChange={e => {
                  setEssay(e.target.value);
                  if (onUpdateTaskProgress && taskIndex !== undefined) {
                    onUpdateTaskProgress(taskIndex, { essay: e.target.value });
                  }
                }} 
                placeholder="Write your response here…" 
                rows={20}
                className="w-full p-4 resize-none focus:outline-none bg-gray-800 text-white text-sm" 
                style={{ minHeight: '300px' }} 
              />
            </div>
          )}

          {/* MCQ */}
          {task.type === 'mcq' && task.data?.questions && (
            <div className="space-y-4">
              {task.data.questions.map((q: any, qi: number) => (
                <div key={q.id} className="bg-gray-800 rounded p-4 border border-gray-700">
                  <h3 className="font-semibold text-white mb-3 text-sm">{qi + 1}. {q.question}</h3>
                  <div className="space-y-2">
                    {q.options.map((opt: string, oi: number) => (
                      <label key={oi} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-gray-700 rounded">
                        <input
                          type={q.allowMultiple ? 'checkbox' : 'radio'}
                          name={`q-${q.id}`}
                          checked={mcqAnswers[q.id]?.includes(oi) ?? false}
                          onChange={() => {
                            const cur = mcqAnswers[q.id] ?? [];
                            const next = q.allowMultiple 
                              ? (cur.includes(oi) ? cur.filter((a: number) => a !== oi) : [...cur, oi])
                              : [oi];
                            setMcqAnswers({ ...mcqAnswers, [q.id]: next });
                            if (onUpdateTaskProgress && taskIndex !== undefined) {
                              onUpdateTaskProgress(taskIndex, { mcqAnswers: { ...mcqAnswers, [q.id]: next } });
                            }
                          }}
                          className="w-4 h-4 text-blue-500"
                        />
                        <span className="text-gray-300 text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* COMPLETION MESSAGE */}
          {isTaskCompleted && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center">
              <CheckCircle size={28} className="mx-auto text-green-400 mb-2" />
              <p className="text-green-300 text-lg font-semibold">Task {taskNumber} Completed!</p>
              <p className="text-green-400 text-sm font-mono">Time spent: {formatDuration(taskTimeSpent)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Task Completion Dialog */}
      <TaskCompletionDialog
        open={showCompletionDialog}
        task={task}
        draft={completionDraft}
        onDraftChange={setCompletionDraft}
        onCancel={() => setShowCompletionDialog(false)}
        onSave={handleSaveCompletion}
        session={session}
        currentRepo={currentRepo}
        onLoadFromGitHub={onLoadFromGitHub}
        isLoadingGitHub={isLoadingGitHub}
        taskIndex={taskIndex}
        taskRepositories={taskRepositories}
        onRefreshRepo={onRefreshRepo}
        isRefreshingRepo={false}
        code={code}
        essay={essay}
        mcqAnswers={mcqAnswers}
      />
    </>
  );
};

export default TaskContent;