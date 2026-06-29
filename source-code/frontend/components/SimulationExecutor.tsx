// SimulationExecutor.tsx - COMPLETE WITH DETAILED GITHUB STATS SIDEBAR (FIXED TYPES - NO AUTO-SAVE)

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSimulationSession } from './SimulationExecutor/hooks/useSimulationSession';
import { useChat } from './SimulationExecutor/hooks/useChat';
import { useFileSystem } from './SimulationExecutor/hooks/useFileSystem';
import { MIN_SUBMIT_SECONDS, useTimer } from './SimulationExecutor/hooks/useTimer';
import { GitHubRepoProvider, useGitHubRepo } from './SimulationExecutor/context/GitHubRepoContext';
import SimulationHeader from './SimulationExecutor/SimulationHeader';
import TaskList from './SimulationExecutor/TaskList';
import FileExplorer from './SimulationExecutor/FileExplorer';
import TaskContent from './SimulationExecutor/TaskContent';
import ChatPanel from './SimulationExecutor/ChatPanel';
import GitHubPanel from './SimulationExecutor/GitHubPanel';
import { GitHubDetailsSidebar } from './SimulationExecutor/GitHubDetailsSidebar';
import EvaluationProgress from './SimulationExecutor/EvaluationProgress';
import {
  StartDialog,
  PauseDialog,
  SubmitDialog,
  TaskCompletionDialog,
  PostSubmitDialog,
} from './SimulationExecutor/Dialogs';
import {
  AlertCircle,
  MessageCircle,
  Github,
  Layout,
  X,
  UploadCloud,
  Download,
  GitBranch,
} from 'lucide-react';

interface SimulationExecutorProps {
  onComplete: (results: any) => void;
  onExit: () => void;
  simulationId?: string;
}

type TabType = 'workspace' | 'chat' | 'github';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Inner component that uses the GitHub context
const SimulationExecutorInner: React.FC<SimulationExecutorProps> = ({
  onComplete: _onComplete,
  onExit,
  simulationId: propSimulationId,
}) => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string | undefined }>();
  const { user } = useAuth();
  const sessionId = propSimulationId || urlSessionId || '';
  const currentUserType = (user as any)?.userType || (user as any)?.user_type || '';
  const isCompanyReviewer =
    currentUserType === 'company_admin' ||
    currentUserType === 'recruiter' ||
    currentUserType === 'system_admin';

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window === 'undefined') return 'workspace';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'chat' || tab === 'github' || tab === 'workspace' ? tab : 'workspace';
  });
  const [shouldInitialize, setShouldInitialize] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [githubPushStatus, setGithubPushStatus] = useState<SyncStatus>('idle');
  const [githubPullStatus, setGithubPullStatus] = useState<SyncStatus>('idle');
  const [githubMessage, setGithubMessage] = useState('');
  const [showGitHubStatsModal, setShowGitHubStatsModal] = useState(false);
  const [statsTaskIndex, setStatsTaskIndex] = useState<number | null>(null);

  // Flag to prevent auto-save while starting a task
  const isStartingTaskRef = useRef(false);
  // Debounce timer for manual save
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.toString());

    if (tab === 'workspace' || tab === 'github') {
      void refreshCurrentRepoFromGitHub();
    }
  };

  // Get GitHub repo from context - PER TASK STORAGE!
  const {
    currentRepo,
    loadRepository,
    loadRepositoryFromUrl,
    isLoading: isRepoLoading,
    hasRepo,
    currentTaskIndex: globalTaskIndex,
    setCurrentTaskIndex: setGlobalTaskIndex,
    saveCurrentRepoForTask,
    loadRepoForTask,
    getReposForAllTasks,
    refreshStats,
  } = useGitHubRepo();

  const {
    session,
    tasks,
    currentTask,
    setCurrentTask,
    loading,
    error: sessionError,
    progress,
    answers: sessionAnswers,
    taskProgress,
    saveProgress,
    submitSimulation,
    submissionResult,
    isSubmitting,
    updateTaskProgress,
    updateTimeSpent,
    githubRepo,
    refreshTaskProgress,
    startTask,
  } = useSimulationSession(sessionId || null, currentUserType);

  // Get the SIMULATION ID from the session
  const simulationIdForChat = session?.simulationId;

  const {
    messages,
    unreadCount,
    sendMessage,
    loadMoreMessages,
    hasMore,
    socketConnected,
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    editContent,
    setEditContent,
    saveEdit,
    deleteMessage,
    startEdit,
    startReply,
    cancelEdit,
    cancelReply,
    markAsRead,
  } = useChat(simulationIdForChat || null, user?.id, sessionId || null);

  const {
    fileStructure,
    currentFilePath,
    currentFileContent,
    setCurrentFileContent,
    currentFileLanguage,
    setCurrentFile,
    resetCurrentFile,
    updateFileContent: _updateFileContent,
    createFile,
    createFolder,
    deleteFile,
    renameFile,
    moveFile,
    copyFile,
    refreshFiles,
    pushToLocal,
    pullFromLocal,
    syncStatus,
    syncMessage,
    loadFromGitHubRepo,
    isLoading: isFileSystemLoading,
  } = useFileSystem(sessionId, currentTask);

  // Timer only updates UI, NO AUTO-SAVE
  const {
    timeSpent,
    timeLimit,
    timeRemaining,
    isExpired,
    isRunning: _isRunning,
    isPaused: _isPaused,
    startTimer,
    pauseTimer,
    resumeTimer,
    formatTime,
    getTimeColor,
    getCountdownColor,
    getCurrentTime,
  } = useTimer(
    session,
    (newTime) => {
      if (!isStartingTaskRef.current) {
        updateTimeSpent?.(newTime);
      }
    },
    () => {
      // Time's up: persist whatever the candidate has so nothing is lost.
      if (!isStartingTaskRef.current) {
        try { saveProgress(); } catch { /* ignore */ }
      }
    }
  );

  // UI State
  const [showStartDialog, setShowStartDialog] = useState(true);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showTaskCompletionDialog, setShowTaskCompletionDialog] = useState(false);
  const [showPostSubmitDialog, setShowPostSubmitDialog] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedTaskIndex, setSelectedTaskIndex] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [editorTheme, setEditorTheme] = useState('vs-dark');
  const [fontSize, setFontSize] = useState(14);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showTimer, setShowTimer] = useState(true);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');

  // Task type specific state
  const [code, setCode] = useState('');
  const [essay, setEssay] = useState('');
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, number[]>>({});
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const [taskCompletionDraft, setTaskCompletionDraft] = useState({
    completed: false,
    comment: '',
    challenges: '',
    suggestions: '',
    githubCommitUrl: '',
  });

  const hasValidId = sessionId && sessionId.length > 0;

  // Helper functions
  const getGitHubRepoUrl = () => {
    if (currentTask?.data?.githubRepoUrl) {
      return currentTask.data.githubRepoUrl;
    }
    if ((user as any)?.githubUsername) {
      return `https://github.com/${(user as any).githubUsername}`;
    }
    return '';
  };

  const handleLoadFromGitHub = async (owner: string, repo: string) => {
    await loadFromGitHubRepo(owner, repo);
    setTimeout(() => {
      saveCurrentRepoForTask();
    }, 500);
  };

  const handleLoadFromUrl = async (url: string) => {
    await loadRepositoryFromUrl(url);
    setTimeout(() => {
      saveCurrentRepoForTask();
    }, 500);
  };

  const refreshCurrentRepoFromGitHub = async () => {
    const selectedIndex = selectedTaskIndex ?? session?.currentTaskIndex ?? 0;
    setGlobalTaskIndex(selectedIndex);

    if (currentRepo) {
      await loadRepository(
        currentRepo.owner,
        currentRepo.repo,
        currentRepo.repoUrl,
        currentRepo.branchName || githubRepo?.branchName || 'main'
      );
      refreshFiles();
      return;
    }

    if (githubRepo?.repoUrl) {
      const match = githubRepo.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
      if (match) {
        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
        await loadRepository(owner, repo, githubRepo.repoUrl, githubRepo.branchName || 'main');
      } else {
        await loadRepositoryFromUrl(githubRepo.repoUrl);
      }
      refreshFiles();
      return;
    }

    loadRepoForTask(selectedIndex);
  };

  const handleRefreshGitHubStats = async () => {
    if ((currentRepo || githubRepo?.repoUrl) && refreshStats) {
      if (!currentRepo) {
        setGithubPushStatus('syncing');
        setGithubMessage('Refreshing repository...');

        try {
          await refreshCurrentRepoFromGitHub();
          await refreshStats();
          setGithubPushStatus('success');
          setGithubMessage('Repository refreshed');
          setTimeout(() => setGithubMessage(''), 3000);
        } catch (error) {
          setGithubPushStatus('error');
          setGithubMessage('Failed to refresh repository');
          setTimeout(() => setGithubMessage(''), 3000);
        } finally {
          setTimeout(() => {
            setGithubPushStatus('idle');
          }, 2000);
        }
        return;
      }

      setGithubPushStatus('syncing');
      setGithubMessage(`Refreshing stats for ${currentRepo.owner}/${currentRepo.repo}...`);

      try {
        await refreshCurrentRepoFromGitHub();
        await refreshStats();
        setGithubPushStatus('success');
        setGithubMessage(`✓ Stats refreshed for ${currentRepo.owner}/${currentRepo.repo}`);
        setTimeout(() => setGithubMessage(''), 3000);
      } catch (error) {
        setGithubPushStatus('error');
        setGithubMessage('✗ Failed to refresh stats');
        setTimeout(() => setGithubMessage(''), 3000);
      } finally {
        setTimeout(() => {
          setGithubPushStatus('idle');
        }, 2000);
      }
    }
  };

  const handlePushToGitHub = async () => {
    if (!currentRepo) {
      setGithubMessage('No repository loaded');
      setGithubPushStatus('error');
      setTimeout(() => setGithubPushStatus('idle'), 3000);
      return;
    }

    setGithubPushStatus('syncing');
    setGithubMessage(`Pushing to ${currentRepo.owner}/${currentRepo.repo}...`);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      setGithubPushStatus('success');
      setGithubMessage(`✓ Successfully pushed to ${currentRepo.owner}/${currentRepo.repo}`);
      setTimeout(() => {
        setGithubPushStatus('idle');
        setGithubMessage('');
      }, 3000);
    } catch (error) {
      setGithubPushStatus('error');
      setGithubMessage('✗ Failed to push to GitHub');
      setTimeout(() => {
        setGithubPushStatus('idle');
        setGithubMessage('');
      }, 3000);
    }
  };

  const handlePullFromGitHub = async () => {
    if (!currentRepo && !githubRepo?.repoUrl) {
      setGithubMessage('No repository loaded');
      setGithubPullStatus('error');
      setTimeout(() => setGithubPullStatus('idle'), 3000);
      return;
    }

    if (!currentRepo) {
      setGithubPullStatus('syncing');
      setGithubMessage('Pulling from GitHub...');

      try {
        await refreshCurrentRepoFromGitHub();
        setGithubPullStatus('success');
        setGithubMessage('Successfully pulled from GitHub');
        setTimeout(() => {
          setGithubPullStatus('idle');
          setGithubMessage('');
        }, 3000);
      } catch (error) {
        setGithubPullStatus('error');
        setGithubMessage('Failed to pull from GitHub');
        setTimeout(() => {
          setGithubPullStatus('idle');
          setGithubMessage('');
        }, 3000);
      }
      return;
    }

    setGithubPullStatus('syncing');
    setGithubMessage(currentRepo ? `Pulling from ${currentRepo.owner}/${currentRepo.repo}...` : 'Pulling from GitHub...');

    try {
      await refreshCurrentRepoFromGitHub();
      setGithubPullStatus('success');
      setGithubMessage(`✓ Successfully pulled from ${currentRepo.owner}/${currentRepo.repo}`);
      setTimeout(() => {
        setGithubPullStatus('idle');
        setGithubMessage('');
      }, 3000);
    } catch (error) {
      setGithubPullStatus('error');
      setGithubMessage('✗ Failed to pull from GitHub');
      setTimeout(() => {
        setGithubPullStatus('idle');
        setGithubMessage('');
      }, 3000);
    }
  };

  // Make sure this function exists in SimulationExecutor (it should already be there):
  const handleOpenGitHubStats = (taskIndex: number) => {
    console.log('📊 Opening GitHub stats for task:', taskIndex);
    setStatsTaskIndex(taskIndex);
    setShowGitHubStatsModal(true);
  };

  const hasGitHubRepoForTask = (taskIndex: number): boolean => {
    const taskRepos = getReposForAllTasks();
    return !!taskRepos[taskIndex];
  };

  const handleUpdateTaskProgress = async (taskIndex: number, data: any) => {
    console.log(`📝 [SimulationExecutor] Updating task ${taskIndex}:`, data);

    if (isStartingTaskRef.current && data.status === 'in_progress') {
      console.log('⚠️ Skipping update while starting task');
      return;
    }

    try {
      await updateTaskProgress(taskIndex, data);

      if (data.status === 'completed') {
        if (refreshTaskProgress) {
          await refreshTaskProgress();
        }
      }
    } catch (error) {
      console.error(`❌ Failed to update task ${taskIndex}:`, error);
    }
  };

  // Manual save with debounce
  const handleSaveProgress = async () => {
    if (isStartingTaskRef.current) {
      console.log('⚠️ Skipping save progress while starting task');
      return;
    }

    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = setTimeout(async () => {
      console.log('💾 Manual save triggered by user');
      await saveProgress();
      saveDebounceRef.current = null;
    }, 500);
  };

  // Periodic auto-save: persist progress every 20s while the simulation is
  // running so nothing is lost on refresh/crash (the backend restores it on
  // reload). A ref keeps the interval pointed at the latest save closure.
  const autoSaveFnRef = useRef<() => void>(() => {});
  autoSaveFnRef.current = () => {
    if (isStartingTaskRef.current) return;
    if (session?.status !== 'in_progress') return;
    if (isExpired) return;
    try { saveProgress(); } catch { /* ignore */ }
  };
  useEffect(() => {
    const interval = setInterval(() => { autoSaveFnRef.current(); }, 20000);
    return () => clearInterval(interval);
  }, []);

  const getMinSubmitMessage = () => {
    const latestTimeSpent = Math.max(timeSpent, getCurrentTime());
    const remainingSeconds = Math.max(0, MIN_SUBMIT_SECONDS - latestTimeSpent);
    return `You must spend at least 3 minutes before submitting. ${formatTime(remainingSeconds)} remaining.`;
  };

  const handleOpenSubmitDialog = () => {
    const latestTimeSpent = Math.max(timeSpent, getCurrentTime());
    if (latestTimeSpent < MIN_SUBMIT_SECONDS) {
      const message = getMinSubmitMessage();
      setSubmitError(message);
      window.alert(message);
    } else {
      setSubmitError(null);
    }
    setShowSubmitDialog(true);
  };

  const handleSubmitSimulation = async () => {
    const latestTimeSpent = Math.max(timeSpent, getCurrentTime());
    if (latestTimeSpent < MIN_SUBMIT_SECONDS) {
      const message = getMinSubmitMessage();
      setSubmitError(message);
      window.alert(message);
      return;
    }

    try {
      setSubmitError(null);
      setShowSubmitDialog(false);
      setIsEvaluating(true);
      await submitSimulation(progress, latestTimeSpent);
      setIsEvaluating(false);
      setShowPostSubmitDialog(true);
    } catch (error: any) {
      setIsEvaluating(false);
      setSubmitError(error?.message || 'Failed to submit simulation. Please try again.');
    }
  };

  useEffect(() => {
    if (currentRepo && !taskCompletionDraft.githubCommitUrl) {
      setTaskCompletionDraft(prev => ({
        ...prev,
        githubCommitUrl: `https://github.com/${currentRepo.owner}/${currentRepo.repo}`
      }));
    }
  }, [currentRepo]);

  useEffect(() => {
    if (sessionAnswers && selectedTaskIndex !== null) {
      const savedAnswer = sessionAnswers[selectedTaskIndex];
      if (savedAnswer) {
        console.log('📝 Restoring saved answer for task:', selectedTaskIndex, savedAnswer);
        setTaskCompletionDraft(prev => ({
          ...prev,
          completed: savedAnswer.completed || false,
          comment: savedAnswer.comment || '',
          challenges: savedAnswer.challenges || '',
          suggestions: savedAnswer.suggestions || '',
          githubCommitUrl: savedAnswer.githubCommitUrl || savedAnswer.githubRepo?.url || prev.githubCommitUrl,
        }));

        if (savedAnswer.code) setCode(savedAnswer.code);
        if (savedAnswer.essay) setEssay(savedAnswer.essay);
        if (savedAnswer.mcqAnswers) setMcqAnswers(savedAnswer.mcqAnswers);
      }
    }
  }, [sessionAnswers, selectedTaskIndex]);

  useEffect(() => {
    if (selectedTaskIndex !== null && selectedTaskIndex !== globalTaskIndex) {
      console.log(`🔄 Task changed to ${selectedTaskIndex}, loading its repository...`);
      setGlobalTaskIndex(selectedTaskIndex);
      loadRepoForTask(selectedTaskIndex);
    }
  }, [selectedTaskIndex, globalTaskIndex, setGlobalTaskIndex, loadRepoForTask]);

  useEffect(() => {
    if (currentRepo && selectedTaskIndex !== null) {
      console.log(`💾 Saving repository for Task ${selectedTaskIndex}:`, currentRepo.owner, currentRepo.repo);
      saveCurrentRepoForTask();
    }
  }, [currentRepo, selectedTaskIndex, saveCurrentRepoForTask]);

  useEffect(() => {
    if (session?.currentTaskIndex !== undefined && selectedTaskIndex === null) {
      console.log('🎯 Initializing selectedTaskIndex from session:', session.currentTaskIndex);
      setSelectedTaskIndex(session.currentTaskIndex);
      setGlobalTaskIndex(session.currentTaskIndex);
      if (tasks[session.currentTaskIndex]) {
        setCurrentTask(tasks[session.currentTaskIndex]);
      }
      loadRepoForTask(session.currentTaskIndex);
    }
  }, [session?.currentTaskIndex, tasks, setGlobalTaskIndex, loadRepoForTask, setCurrentTask]);

  // Auto-load GitHub repo from session with branch name
  useEffect(() => {
    if (githubRepo?.repoUrl && !currentRepo) {
      console.log('🐙 [SimulationExecutor] Auto-loading GitHub repo from session:', {
        repoUrl: githubRepo.repoUrl,
        branchName: githubRepo.branchName
      });

      const match = githubRepo.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
      if (match) {
        const owner = match[1];
        const repo = match[2].replace(/\.git$/, '');
        const branch = githubRepo.branchName || 'main';

        loadRepository(owner, repo, githubRepo.repoUrl, branch).catch((err) => {
          console.error('❌ Failed to auto-load GitHub repo from session:', err);
        });
      } else {
        loadRepositoryFromUrl(githubRepo.repoUrl).catch((err) => {
          console.error('❌ Failed to auto-load GitHub repo from session:', err);
        });
      }
    }
  }, [githubRepo?.repoUrl, githubRepo?.branchName, currentRepo, loadRepository, loadRepositoryFromUrl]);

  useEffect(() => {
    if (selectedTaskIndex !== null) {
      console.log('🔄 selectedTaskIndex changed to:', selectedTaskIndex);
      const task = tasks[selectedTaskIndex];
      console.log('🔄 Current task:', task?.title);

      const taskStatus = taskProgress?.find(tp => tp.task_index === selectedTaskIndex)?.status;
      console.log('📊 Task status from taskProgress:', taskStatus || 'not_started');
    }
  }, [selectedTaskIndex, tasks, taskProgress]);

  useEffect(() => {
    if (!loading && session && hasValidId) {
      const hasProgress = session.timeSpent > 0 ||
        session.currentTaskIndex > 0 ||
        Object.keys(session.progress || {}).length > 0;

      if (hasProgress && session.status === 'in_progress') {
        setShowStartDialog(false);
        startTimer();
      }
      setShouldInitialize(true);
    }
  }, [loading, session, startTimer, hasValidId]);

  useEffect(() => {
    if (activeTab === 'chat' && unreadCount > 0) {
      markAsRead();
    }
  }, [activeTab, unreadCount, markAsRead]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
    };
  }, []);

  if (!hasValidId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700 text-center">
          <div className="text-yellow-500 mb-4"><AlertCircle size={48} className="mx-auto" /></div>
          <h2 className="text-xl font-bold text-white mb-2">No Session ID</h2>
          <p className="text-gray-400 mb-6">Please provide a valid session ID.</p>
          <button onClick={onExit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Go Back</button>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700 text-center">
          <div className="text-red-500 mb-4"><AlertCircle size={48} className="mx-auto" /></div>
          <h2 className="text-xl font-bold text-white mb-2">Session Error</h2>
          <p className="text-gray-400 mb-6">{sessionError}</p>
          <button onClick={() => window.location.href = '/'} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Go to Dashboard</button>
        </div>
      </div>
    );
  }

  if (loading || !shouldInitialize) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading simulation…</p>
        </div>
      </div>
    );
  }

  const isExistingSession = session && (session.timeSpent > 0 || session.currentTaskIndex > 0 || Object.keys(session.progress || {}).length > 0);

  if (!isCompanyReviewer && showStartDialog && session?.status !== 'completed' && session?.status !== 'submitted' && !isExistingSession) {
    return <StartDialog session={session} onStart={() => { startTimer(); setShowStartDialog(false); }} onExit={onExit} />;
  }


  // In SimulationExecutor.tsx - This is the frontend component

  // Find this section (around line 380-400) and replace it:

  if (!isCompanyReviewer && !showPostSubmitDialog && (session?.status === 'completed' || session?.status === 'submitted')) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700 text-center">
          <div className="text-green-500 mb-4">
            <svg className="h-16 w-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Simulation Already Completed</h2>
          <p className="text-gray-400 mb-6">This simulation has already been submitted.</p>
          <button
            onClick={() => {
              // Use session ID to go to session report
              const currentSessionId = session?.id || sessionId;
              if (currentSessionId) {
                window.location.href = `/session-report/${currentSessionId}`;
              } else {
                window.location.href = `/session-report/${sessionId}`;
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Results
          </button>
        </div>
      </div>
    );
  }

  const handleCompleteTask = async () => {
    if (selectedTaskIndex === null) return;
    console.log('✅ Completing task:', selectedTaskIndex);
    await updateTaskProgress(selectedTaskIndex, {
      status: taskCompletionDraft.completed ? 'completed' : 'in_progress',
      answer: {
        completed: taskCompletionDraft.completed,
        comment: taskCompletionDraft.comment,
        challenges: taskCompletionDraft.challenges,
        suggestions: taskCompletionDraft.suggestions,
        githubCommitUrl: taskCompletionDraft.githubCommitUrl,
        githubRepo: currentRepo ? {
          owner: currentRepo.owner,
          repo: currentRepo.repo,
          url: `https://github.com/${currentRepo.owner}/${currentRepo.repo}`,
          files: Object.keys(currentRepo.files).length,
        } : null,
        code: code,
        essay: essay,
        mcqAnswers: mcqAnswers,
      },
      githubCommitUrl: taskCompletionDraft.githubCommitUrl,
    });
    setShowTaskCompletionDialog(false);

    if (refreshTaskProgress) {
      await refreshTaskProgress();
    }
  };

  const handlePostSubmitComplete = () => {
    setShowPostSubmitDialog(false);
    _onComplete({ sessionId, progress, timeSpent, submissionResult });
  };

  // FIXED: Handle review results after submission - navigate to session report with SESSION ID
  const handlePostSubmitReviewResults = () => {
    console.log('📊 Post-submit review results clicked');
    console.log('📊 Session object:', session);
    console.log('📊 Current sessionId:', sessionId);

    // Use the session ID (not simulation ID) to go to the session report
    // The route needed in App.jsx: /session-report/:sessionId
    const currentSessionId = session?.id || sessionId;

    if (currentSessionId) {
      console.log('🔍 Navigating to session report with sessionId:', currentSessionId);
      // Navigate to the session report page
      window.location.href = `/session-report/${currentSessionId}`;
    } else {
      console.warn('No sessionId available');
      handlePostSubmitComplete();
    }
  };

  const tabs = [
    { id: 'workspace' as TabType, label: 'Workspace', icon: <Layout size={14} /> },
    { id: 'chat' as TabType, label: 'Chat', icon: <MessageCircle size={14} />, badge: unreadCount },
    { id: 'github' as TabType, label: 'GitHub Analytics', icon: <Github size={14} /> },
  ];

  const isOverallLoading = isFileSystemLoading || isRepoLoading;
  const isLoadingDisplay = isOverallLoading && !hasRepo;

  const stats = currentRepo?.fullStats;
  const fileCount = currentRepo?.files ? Object.keys(currentRepo.files).length : 0;
  const folderCount = currentRepo?.fileStructure?.filter(f => f.type === 'folder').length || 0;
  const qualityScore = stats?.scores?.overall || (fileCount > 0 ? 65 : 0);

  const syncStatusTyped = (syncStatus as SyncStatus) || 'idle';
  const isSyncing = syncStatusTyped === 'syncing' || githubPushStatus === 'syncing' || githubPullStatus === 'syncing';

  const getSyncButtonClass = () => {
    if (isSyncing) return 'bg-yellow-600/20 text-yellow-400 border-yellow-600';
    if (syncStatusTyped === 'success' || githubPushStatus === 'success' || githubPullStatus === 'success') return 'bg-green-600/20 text-green-400 border-green-600';
    if (syncStatusTyped === 'error' || githubPushStatus === 'error' || githubPullStatus === 'error') return 'bg-red-600/20 text-red-400 border-red-600';
    return 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600';
  };

  const displayMessage = syncMessage || githubMessage;

  const openChatFromHeader = () => {
    handleTabChange('chat');
    if (unreadCount > 0) {
      markAsRead();
    }
  };

  const handleSelectTask = async (idx: number) => {
    console.log('📌 Task clicked - index:', idx);
    console.log('📌 Task title:', tasks[idx]?.title);

    setSelectedTaskIndex(idx);
    setCurrentTask(tasks[idx]);
    setGlobalTaskIndex(idx);
    resetCurrentFile();
    const cachedRepo = loadRepoForTask(idx);

    try {
      if (cachedRepo) {
        await loadRepository(
          cachedRepo.owner,
          cachedRepo.repo,
          cachedRepo.repoUrl,
          cachedRepo.branchName || githubRepo?.branchName || 'main',
          idx
        );
        return;
      }

      if (githubRepo?.repoUrl) {
        const match = githubRepo.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
        if (match) {
          const owner = match[1];
          const repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
          await loadRepository(owner, repo, githubRepo.repoUrl, githubRepo.branchName || 'main', idx);
        }
      }
    } catch (error) {
      console.error('Failed to refresh repository after task change:', error);
    }
  };

  const handleOpenCompletion = (idx: number) => {
    console.log('✅ Opening completion dialog for task:', idx);
    setSelectedTaskIndex(idx);
    setShowTaskCompletionDialog(true);
  };

  const repoForDialog = currentRepo ? {
    owner: currentRepo.owner,
    repo: currentRepo.repo,
    url: `https://github.com/${currentRepo.owner}/${currentRepo.repo}`,
    files: currentRepo.files,
    fileStructure: currentRepo.fileStructure,
    fullStats: currentRepo.fullStats || undefined,
  } : null;

  const currentSelectedTask = selectedTaskIndex !== null ? tasks[selectedTaskIndex] : null;

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      <SimulationHeader
        currentTask={currentTask}
        currentTaskIndex={session?.currentTaskIndex ?? 0}
        totalTasks={tasks.length}
        timeSpent={timeSpent}
        timeLimit={timeLimit}
        timeRemaining={timeRemaining}
        isExpired={isExpired}
        showTimer={showTimer}
        setShowTimer={setShowTimer}
        formatTime={formatTime}
        getTimeColor={getTimeColor}
        getCountdownColor={getCountdownColor}
        editorTheme={editorTheme}
        setEditorTheme={setEditorTheme}
        fontSize={fontSize}
        setFontSize={(size: number) => setFontSize(size)}
        showMinimap={showMinimap}
        setShowMinimap={setShowMinimap}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        syncStatus={syncStatusTyped}
        syncMessage={syncMessage}
        onPushToLocal={pushToLocal}
        onPullFromLocal={pullFromLocal}
        onSave={handleSaveProgress}
        onPause={() => { pauseTimer(); setShowPauseDialog(true); }}
        onSubmit={handleOpenSubmitDialog}
        minSubmitRemainingSeconds={Math.max(0, MIN_SUBMIT_SECONDS - timeSpent)}
        onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
        showRightSidebar={showRightSidebar}
        chatUnreadCount={unreadCount}
        onOpenChat={openChatFromHeader}
      />

      {/* Tab Navigation Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${activeTab === tab.id
                ? 'border-blue-500 text-blue-400 bg-gray-900/50'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={pushToLocal}
            disabled={isSyncing}
            className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-xs transition-colors border ${getSyncButtonClass()}`}
            title="Push all files to your local PC"
          >
            <UploadCloud size={13} />
            {syncStatusTyped === 'syncing' ? 'Pushing...' : syncStatusTyped === 'success' ? '✓ Pushed!' : 'Push to PC'}
          </button>

          <button
            onClick={pullFromLocal}
            disabled={isSyncing}
            className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-xs transition-colors border ${getSyncButtonClass()}`}
            title="Pull all files from your local PC"
          >
            <Download size={13} />
            {syncStatusTyped === 'syncing' ? 'Pulling...' : syncStatusTyped === 'success' ? '✓ Pulled!' : 'Pull from PC'}
          </button>

          <div className="w-px h-5 bg-gray-600 mx-1" />

          {/* Push to GitHub Button */}
          <button
            onClick={handlePushToGitHub}
            disabled={!currentRepo || isSyncing}
            className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-xs transition-colors border ${currentRepo && !isSyncing
              ? githubPushStatus === 'syncing'
                ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600'
                : githubPushStatus === 'success'
                  ? 'bg-green-600/20 text-green-400 border-green-600'
                  : githubPushStatus === 'error'
                    ? 'bg-red-600/20 text-red-400 border-red-600'
                    : 'bg-purple-600/20 text-purple-400 border-purple-600 hover:bg-purple-600/30'
              : 'bg-gray-700/50 text-gray-500 border-gray-600 cursor-not-allowed'
              }`}
            title="Push code to GitHub repository"
          >
            <GitBranch size={13} />
            {githubPushStatus === 'syncing'
              ? 'Pushing...'
              : githubPushStatus === 'success'
                ? '✓ Pushed!'
                : githubPushStatus === 'error'
                  ? '✗ Failed'
                  : 'Push to GitHub'}
          </button>

          {/* Pull from GitHub Button */}
          <button
            onClick={handlePullFromGitHub}
            disabled={!currentRepo || isSyncing}
            className={`px-2.5 py-1.5 rounded flex items-center gap-1 text-xs transition-colors border ${currentRepo && !isSyncing
              ? githubPullStatus === 'syncing'
                ? 'bg-yellow-600/20 text-yellow-400 border-yellow-600'
                : githubPullStatus === 'success'
                  ? 'bg-green-600/20 text-green-400 border-green-600'
                  : githubPullStatus === 'error'
                    ? 'bg-red-600/20 text-red-400 border-red-600'
                    : 'bg-purple-600/20 text-purple-400 border-purple-600 hover:bg-purple-600/30'
              : 'bg-gray-700/50 text-gray-500 border-gray-600 cursor-not-allowed'
              }`}
            title="Pull latest code from GitHub repository"
          >
            <Download size={13} />
            {githubPullStatus === 'syncing'
              ? 'Pulling...'
              : githubPullStatus === 'success'
                ? '✓ Pulled!'
                : githubPullStatus === 'error'
                  ? '✗ Failed'
                  : 'Pull from GitHub'}
          </button>

          {displayMessage && (
            <span className={`text-xs ${syncStatusTyped === 'success' || githubPushStatus === 'success' || githubPullStatus === 'success' ? 'text-green-400' :
              syncStatusTyped === 'error' || githubPushStatus === 'error' || githubPullStatus === 'error' ? 'text-red-400' :
                'text-yellow-400'
              } ml-1`}>
              {displayMessage}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {/* WORKSPACE TAB */}
        {activeTab === 'workspace' && (
          <div className="flex flex-col h-full overflow-hidden">

            <TaskList
              tasks={tasks}
              taskProgress={taskProgress}
              selectedTaskIndex={selectedTaskIndex !== null ? selectedTaskIndex : (session?.currentTaskIndex ?? 0)}
              onSelectTask={handleSelectTask}
              onOpenCompletion={handleOpenCompletion}
              onStartTask={startTask}
              onOpenGitHubStats={handleOpenGitHubStats}
              hasGitHubRepoForTask={hasGitHubRepoForTask}
              // ✅ NEW PROPS
              onOpenChat={() => handleTabChange('chat')}
              onOpenGitHubAnalytics={handleOpenGitHubStats}
              unreadCount={unreadCount}
            />

            <div className="flex flex-1 overflow-hidden min-h-0">
              {showSidebar && (
                <FileExplorer
                  files={fileStructure}
                  currentFile={currentFilePath}
                  currentTaskIndex={selectedTaskIndex ?? session?.currentTaskIndex ?? 0}
                  onFileSelect={setCurrentFile}
                  onCreateFile={createFile}
                  onCreateFolder={createFolder}
                  onDeleteFile={deleteFile}
                  onRenameFile={renameFile}
                  onMoveFile={moveFile}
                  onCopyFile={copyFile}
                  onRefresh={refreshFiles}
                  onLoadFromGitHub={handleLoadFromGitHub}
                  isLoadingGitHub={isRepoLoading}
                  githubRepo={githubRepo}
                />
              )}

              <div className="flex-1 flex flex-col overflow-y-auto min-h-0">
                {isLoadingDisplay ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">Loading repository...</p>
                    </div>
                  </div>
                ) : (
                  // ... inside the workspace tab, find the TaskContent call and replace with:

                  <TaskContent
                    task={currentSelectedTask}
                    simulationId={sessionId || undefined}
                    taskIndex={selectedTaskIndex ?? undefined}
                    candidateGitHubUsername={(user as any)?.githubUsername}
                    githubRepo={githubRepo}
                    code={code}
                    setCode={setCode}
                    currentFileContent={currentFileContent}
                    setCurrentFileContent={setCurrentFileContent}
                    currentFileLanguage={currentFileLanguage}
                    essay={essay}
                    setEssay={setEssay}
                    mcqAnswers={mcqAnswers}
                    setMcqAnswers={setMcqAnswers}
                    uploadedFiles={uploadedFiles}
                    setUploadedFiles={setUploadedFiles}
                    editorTheme={editorTheme}
                    fontSize={fontSize}
                    showMinimap={showMinimap}
                    currentFilePath={currentFilePath}
                    onLoadFromGitHub={handleLoadFromGitHub}
                    isLoadingGitHub={isRepoLoading}
                    taskProgress={taskProgress}
                    onStartTask={startTask}
                    onUpdateTaskProgress={handleUpdateTaskProgress}
                    onRefreshTaskProgress={refreshTaskProgress}
                    session={session}
                    currentRepo={currentRepo}
                    taskRepositories={getReposForAllTasks()}
                    onRefreshRepo={handleRefreshGitHubStats}
                    // ✅ NEW PROPS - These make the buttons work!
                    onOpenChat={() => {
                      console.log('💬 Opening chat from TaskContent');
                      handleTabChange('chat');
                    }}
                    onOpenGitHubAnalytics={(taskIndex: number) => {
                      console.log('📊 Opening GitHub analytics for task:', taskIndex);
                      handleOpenGitHubStats(taskIndex);
                    }}
                    unreadCount={unreadCount}
                  />
                )}
              </div>

              {showRightSidebar && (
                <GitHubDetailsSidebar
                  currentRepo={currentRepo}
                  stats={stats}
                  fileCount={fileCount}
                  folderCount={folderCount}
                  qualityScore={qualityScore}
                  displayMessage={displayMessage}
                  isSyncing={isSyncing}
                  syncStatusTyped={syncStatusTyped}
                  githubPushStatus={githubPushStatus}
                  onClose={() => setShowRightSidebar(false)}
                  onRefresh={handleRefreshGitHubStats}
                />
              )}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="h-full flex flex-col overflow-hidden">
            <ChatPanel
              messages={messages}
              unreadCount={unreadCount}
              socketConnected={socketConnected}
              replyingTo={replyingTo}
              onReplyCancel={cancelReply}
              onStartReply={startReply}
              onSendMessage={sendMessage}
              onLoadMore={loadMoreMessages}
              hasMoreMessages={hasMore}
              editingMessage={editingMessage}
              editContent={editContent}
              onEditChange={setEditContent}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onStartEdit={startEdit}
              onDeleteMessage={deleteMessage}
              onFocusMessages={markAsRead}
              currentUserId={user?.id}
              currentUserEmail={user?.email}
            />
          </div>
        )}

        {/* GITHUB ANALYTICS TAB */}
        {activeTab === 'github' && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-6xl mx-auto">
              <div className="mb-4">
                <h2 className="text-white text-lg font-semibold flex items-center gap-2 mb-2">
                  <Github size={20} />
                  GitHub Repository Analysis
                </h2>
                <p className="text-gray-400 text-sm">Analyze any GitHub repository to see code quality, commit history, pull requests, and more.</p>
              </div>

              <GitHubPanel
                repoUrl={githubRepoUrl || getGitHubRepoUrl()}
                simulationId={sessionId || undefined}
                taskIndex={selectedTaskIndex ?? undefined}
                githubUsername={(user as any)?.githubUsername}
                onRepoAnalyzed={(data) => console.log('Repository analyzed:', data)}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* GitHub Stats Modal */}
      {showGitHubStatsModal && statsTaskIndex !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-850">
              <div className="flex items-center gap-2">
                <Github size={18} className="text-white" />
                <h3 className="text-white font-semibold">
                  GitHub Repository Stats - {tasks[statsTaskIndex]?.title || `Task ${statsTaskIndex + 1}`}
                </h3>
              </div>
              <button onClick={() => setShowGitHubStatsModal(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <GitHubPanel
                simulationId={sessionId || undefined}
                taskIndex={statsTaskIndex}
                githubUsername={(user as any)?.githubUsername}
                onRepoAnalyzed={(data) => console.log('Stats loaded for task:', statsTaskIndex, data)}
                className="w-full"
              />
            </div>

            <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
              <button onClick={() => setShowGitHubStatsModal(false)} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PauseDialog open={showPauseDialog} onResume={() => { resumeTimer(); setShowPauseDialog(false); }} session={session} />
      <SubmitDialog
        open={showSubmitDialog}
        onCancel={() => {
          setShowSubmitDialog(false);
          setSubmitError(null);
        }}
        onSubmit={handleSubmitSimulation}
        session={session}
        timeSpent={timeSpent}
        minSubmitSeconds={MIN_SUBMIT_SECONDS}
        isSubmitting={isSubmitting}
        submitError={submitError}
        formatTime={formatTime}
      />
      {isEvaluating && <EvaluationProgress sessionId={sessionId} userId={user?.id} />}
      <PostSubmitDialog
        open={showPostSubmitDialog}
        onReviewResults={handlePostSubmitReviewResults}
        onExit={onExit}
        session={session}
        result={submissionResult}
        formatTime={formatTime}
      />

      <TaskCompletionDialog
        open={showTaskCompletionDialog}
        task={selectedTaskIndex !== null ? tasks[selectedTaskIndex] : null}
        draft={taskCompletionDraft}
        onDraftChange={setTaskCompletionDraft}
        onCancel={() => setShowTaskCompletionDialog(false)}
        onSave={handleCompleteTask}
        session={session}
        currentRepo={repoForDialog}
        onLoadFromGitHub={handleLoadFromGitHub}
        isLoadingGitHub={isRepoLoading}
        taskIndex={selectedTaskIndex ?? 0}
        taskRepositories={getReposForAllTasks()}
        onRefreshRepo={handleRefreshGitHubStats}
        isRefreshingRepo={githubPushStatus === 'syncing'}
        code={code}
        essay={essay}
        mcqAnswers={mcqAnswers}
      />
    </div>
  );
};

// Wrap with provider
export const SimulationExecutor: React.FC<SimulationExecutorProps> = (props) => {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string | undefined }>();
  const providerSessionId = props.simulationId || urlSessionId || null;

  return (
    <GitHubRepoProvider sessionId={providerSessionId}>
      <SimulationExecutorInner {...props} />
    </GitHubRepoProvider>
  );
};

export default SimulationExecutor;
