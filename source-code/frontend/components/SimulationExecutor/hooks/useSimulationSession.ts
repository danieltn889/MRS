// hooks/useSimulationSession.ts - COMPLETE FIXED VERSION

import { useState, useEffect, useCallback, useRef } from 'react';
import simulationAPI from '../../../services/simulationAPI';
import githubAPI from '../../../services/githubAPI';
import { MIN_SUBMIT_SECONDS } from './useTimer';

interface SimulationSession {
  id: string;
  simulationId: string;
  candidateId: string;
  status: 'not_started' | 'in_progress' | 'paused' | 'completed' | 'submitted';
  startTime?: string;
  endTime?: string;
  timeSpent: number;
  currentTaskIndex: number;
  progress: Record<string, any>;
  answers: Record<string, any>;
  pausedAt?: string;
  totalPauseTime: number;
  isPractice: boolean;
  githubRepo?: any;
}

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

export function useSimulationSession(simulationId: string | null, currentUserType?: string) {
  const [session, setSession] = useState<SimulationSession | null>(null);
  const [tasks, setTasks] = useState<SimulationTask[]>([]);
  const [currentTask, setCurrentTask] = useState<SimulationTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [taskProgress, setTaskProgress] = useState<any[]>([]);
  const [githubLinks, setGithubLinks] = useState<Record<string, string>>({});
  const [githubRepo, setGithubRepo] = useState<any>(null);
  const [githubFiles, setGithubFiles] = useState<Record<string, string>>({});
  const [githubFileStructure, setGithubFileStructure] = useState<any[]>([]);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refs for tracking latest values without triggering re-renders
  const sessionRef = useRef<SimulationSession | null>(null);
  const taskProgressRef = useRef<any[]>([]);
  const isStartingTaskRef = useRef(false);
  const updateQueueRef = useRef<Promise<any> | null>(null);

  // Sync refs with state
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    taskProgressRef.current = taskProgress;
    console.log('🔄 [taskProgress] State updated:', taskProgress);
  }, [taskProgress]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };

  const normalizeStatus = (status: string): SimulationSession['status'] => {
    switch (status) {
      case 'submitted': return 'submitted';
      case 'completed': return 'completed';
      case 'paused': return 'paused';
      case 'in_progress': return 'in_progress';
      case 'not_started': return 'not_started';
      default: return 'in_progress';
    }
  };

  const getStoredUserType = (): string => {
    if (currentUserType) return currentUserType;
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      return storedUser.userType || storedUser.user_type || '';
    } catch {
      return '';
    }
  };

  const isCompanyReviewer = () => {
    const userType = getStoredUserType();
    return userType === 'company_admin' || userType === 'recruiter' || userType === 'system_admin';
  };

  // ✅ PARSE GITHUB URL - Helper function
  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    if (!url) return null;
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    const owner = match[1];
    let repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
    return { owner, repo };
  };

  // ✅ LOAD GITHUB REPOSITORY FILES
  const loadGithubRepository = useCallback(async (repoUrl: string, branchName?: string) => {
    if (!repoUrl) {
      console.warn('⚠️ No GitHub repo URL provided');
      return false;
    }
    
    setLoadingGithub(true);
    
    try {
      const parsed = parseGitHubUrl(repoUrl);
      if (!parsed) {
        console.error('❌ Failed to parse GitHub URL:', repoUrl);
        return false;
      }
      
      const { owner, repo } = parsed;
      const branch = branchName || 'main';
      
      console.log(`📦 Loading GitHub repository: ${owner}/${repo}`, { branch });
      
      // Fetch all repository contents
      const response = await githubAPI.getEverything(owner, repo, true, 500);
      
      if (response?.data?.code?.structure || response?.data?.files) {
        const files = response.data.code?.structure || response.data.files || [];
        const fileMap: Record<string, string> = {};
        
        // Helper to decode base64 content
        const decodeContent = (content: string, encoding?: string): string => {
          if (!content) return '';
          if (encoding === 'base64') {
            try {
              return atob(content);
            } catch {
              return content;
            }
          }
          return content;
        };
        
        // Process each file
        for (const file of files) {
          if (file.type !== 'tree') {
            let content = file.content || '';
            if (file.encoding === 'base64' && content) {
              content = decodeContent(content, file.encoding);
            }
            fileMap[file.path] = content || `// File: ${file.path}`;
          }
        }
        
        setGithubFiles(fileMap);
        setGithubFileStructure(files);
        
        console.log(`✅ Loaded ${Object.keys(fileMap).length} files from GitHub`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Failed to load GitHub repository:', error);
      return false;
    } finally {
      setLoadingGithub(false);
    }
  }, []);

  const loadTaskProgress = useCallback(async (sessionId: string, forceRefresh: boolean = false) => {
    if (!sessionId) return null;
    
    try {
      console.log('📊 [loadTaskProgress] Loading task progress...', { forceRefresh });
      const result = await simulationAPI.getSessionTaskProgress(sessionId);
      
      console.log('📊 [loadTaskProgress] Raw API response:', result);
      
      if (result.success && result.data) {
        const progressData = result.data.map((item: any) => ({
          ...item,
          task_index: Number(item?.task_index ?? item?.taskIndex ?? 0),
          status: item?.status || 'not_started',
        }));
        
        console.log('📊 [loadTaskProgress] Processed taskProgress:', progressData);
        
        setTaskProgress([...progressData]);
        taskProgressRef.current = [...progressData];
        
        const restoredAnswers: Record<string, any> = {};
        const restoredProgress: Record<string, any> = {};
        
        for (const task of progressData) {
          if (task.answer !== undefined && task.answer !== null) {
            const answerKey = `task_${task.task_index}`;
            restoredAnswers[answerKey] = task.answer;
            restoredProgress[answerKey] = task.answer;
          }
          if (task.status) {
            const statusKey = `task_${task.task_index}_status`;
            restoredProgress[statusKey] = task.status;
          }
        }
        
        if (Object.keys(restoredAnswers).length > 0) {
          setAnswers(restoredAnswers);
          setProgress(restoredProgress);
        }
        
        return progressData;
      }
      return null;
    } catch (error) {
      console.error('❌ [loadTaskProgress] Failed:', error);
      return null;
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!simulationId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const result = isCompanyReviewer()
        ? await simulationAPI.getSessionById(simulationId)
        : await simulationAPI.resumeMySimulation(simulationId);
      const data = result?.data ?? result;
      
      // ✅ EXTRACT GITHUB REPO FROM RESPONSE
      if (data?.githubRepo) {
        console.log('📦 GitHub repo found in session:', data.githubRepo);
        setGithubRepo(data.githubRepo);
        
        // Auto-load repository files
        if (data.githubRepo.repoUrl) {
          await loadGithubRepository(data.githubRepo.repoUrl, data.githubRepo.branchName);
        }
      } else if (data?.github_links) {
        console.log('📦 GitHub links found in session:', data.github_links);
        setGithubLinks(data.github_links);
        
        // Also try to extract repo from github_links
        if (data.github_links.repoUrl) {
          setGithubRepo({
            repoUrl: data.github_links.repoUrl,
            repoName: data.github_links.repoName,
            branchName: data.github_links.branchName || 'main',
            organizationName: data.github_links.organizationName,
            candidateUsername: data.github_links.candidateUsername
          });
          await loadGithubRepository(data.github_links.repoUrl, data.github_links.branchName);
        }
      }
      
      const sessionStatus = data?.status || data?.session?.status;
      const sessionIdValue = data?.id || data?.sessionId || data?.session_id || data?.session?.id || simulationId;
      
      // FIXED: Redirect to session report (not simulation results) when completed
      if (!isCompanyReviewer() && (sessionStatus === 'completed' || sessionStatus === 'submitted')) {
        setError('This simulation has already been completed. Redirecting to report...');
        setTimeout(() => {
          // Use session ID to go to session report
          window.location.href = `/session-report/${sessionIdValue}`;
        }, 2000);
        setLoading(false);
        return;
      }
      
      if (data) {
        const nestedSession = data.session || {};
        const nestedSimulation = data.simulation_record || {};
        const rawTaskSource = data.tasks ?? data.simulation_template?.tasks ?? [];
        const rawTasks = typeof rawTaskSource === 'string' ? JSON.parse(rawTaskSource) : rawTaskSource;
        setTasks(rawTasks);
        
        const savedAnswers = data.answers ?? nestedSession.answers ?? nestedSimulation.answers ?? {};
        const savedProgress = data.sessionProgress ?? data.progress ?? nestedSession.progress ?? nestedSimulation.progress ?? {};
        setAnswers(savedAnswers);
        setProgress(savedProgress);
        
        const currentTaskIndex = data.currentTask ?? data.currentTaskIndex ?? nestedSession.current_task ?? nestedSimulation.current_task ?? 0;
        setCurrentTask(rawTasks[currentTaskIndex] ?? rawTasks[0] ?? null);
        
        let elapsedTime = 0;
        const startTime = data.startedAt || data.started_at || data.startTime || nestedSession.started_at || nestedSimulation.started_at;
        
        if (startTime) {
          const startTimeMs = new Date(startTime).getTime();
          elapsedTime = Math.floor((Date.now() - startTimeMs) / 1000);
          elapsedTime = Math.max(0, elapsedTime);
        } else if (data.timeSpent !== undefined && data.timeSpent > 0) {
          elapsedTime = data.timeSpent;
        } else if (nestedSession.time_spent !== undefined && nestedSession.time_spent > 0) {
          elapsedTime = nestedSession.time_spent;
        }
        
        const newSession: SimulationSession = {
          id: sessionIdValue,
          simulationId: data.simulationId ?? data.simulation_id ?? nestedSession.simulation_id ?? nestedSimulation.id ?? simulationId,
          candidateId: data.userId ?? data.candidateId ?? nestedSession.candidate_id ?? data.candidate?.id ?? '',
          status: normalizeStatus(sessionStatus || 'in_progress'),
          startTime: startTime || new Date().toISOString(),
          timeSpent: elapsedTime,
          currentTaskIndex: currentTaskIndex,
          progress: savedProgress,
          answers: savedAnswers,
          totalPauseTime: data.totalPauseTime ?? 0,
          isPractice: data.isPractice ?? false,
          githubRepo: data.githubRepo
        };
        
        setSession(newSession);
        
        if (Array.isArray(data.task_progress)) {
          const progressData = [...data.task_progress];
          setTaskProgress(progressData);
          taskProgressRef.current = progressData;
        } else {
          const loadedProgress = await loadTaskProgress(sessionIdValue);
          if (loadedProgress) {
            taskProgressRef.current = loadedProgress;
          }
        }
      }
    } catch (err: any) {
      console.error('❌ [loadSession] Failed:', err);
      setError(err.message || 'Failed to load simulation session');
    } finally {
      setLoading(false);
    }
  }, [simulationId, currentUserType, loadTaskProgress, loadGithubRepository]);

  const saveProgress = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession) return;
    
    if (isStartingTaskRef.current) {
      console.log('⚠️ [saveProgress] Skipping save while starting task');
      return;
    }
    
    if (currentSession.status === 'completed' || currentSession.status === 'submitted') return;
    
    try {
      console.log('💾 [saveProgress] Saving progress...');
      await simulationAPI.saveSimulationProgress(currentSession.id, {
        currentTask: currentSession.currentTaskIndex,
        answers: answers,
        timeSpent: currentSession.timeSpent,
      });
      console.log('✅ [saveProgress] Progress saved successfully');
      await loadTaskProgress(currentSession.id);
    } catch (error) {
      console.error('❌ [saveProgress] Save failed:', error);
      showNotification('error', '❌ Failed to save progress');
    }
  }, [answers, loadTaskProgress]);

  const updateTaskProgress = useCallback(async (taskIndex: number, data: any) => {
    const currentSession = sessionRef.current;
    if (!currentSession) return null;
    
    if (currentSession.status === 'completed' || currentSession.status === 'submitted') return null;
    
    const updatePromise = (async () => {
      try {
        console.log(`📝 [updateTaskProgress] Updating task ${taskIndex}:`, data);
        
        const result = await simulationAPI.updateTaskProgress(currentSession.id, taskIndex, data);
        const saved = result?.data ?? result;
        
        if (saved) {
          console.log(`✅ [updateTaskProgress] Task ${taskIndex} updated:`, saved);
          
          setTaskProgress(prev => {
            const filtered = prev.filter(t => t.task_index !== taskIndex);
            const newProgress = [...filtered, saved].sort((a, b) => a.task_index - b.task_index);
            taskProgressRef.current = newProgress;
            return newProgress;
          });
          
          if (data.status) {
            setProgress(prev => ({ ...prev, [`task_${taskIndex}_status`]: data.status }));
          }
          
          if (data.answer !== undefined && data.answer !== null) {
            setAnswers(prev => ({ ...prev, [`task_${taskIndex}`]: data.answer }));
          }
          
          return saved;
        }
        return null;
      } catch (error) {
        console.error(`❌ [updateTaskProgress] Failed:`, error);
        throw error;
      }
    })();
    
    updateQueueRef.current = updatePromise;
    return updatePromise;
  }, []);

  const updateTimeSpent = useCallback((newTimeSpent: number) => {
    const currentSession = sessionRef.current;
    if (currentSession && currentSession.status !== 'completed' && currentSession.status !== 'submitted') {
      setSession(prev => prev ? { ...prev, timeSpent: newTimeSpent } : null);
    }
  }, []);

  const refreshTaskProgress = useCallback(async () => {
    if (session?.id) {
      console.log('🔄 [refreshTaskProgress] Force refreshing...');
      const refreshed = await loadTaskProgress(session.id, true);
      if (refreshed) {
        taskProgressRef.current = refreshed;
      }
    }
  }, [session?.id, loadTaskProgress]);

  const submitSimulation = useCallback(async (latestAnswers: Record<string, any>, timeSpentSeconds: number) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      throw new Error('No active simulation session found');
    }

    if (timeSpentSeconds < MIN_SUBMIT_SECONDS) {
      const remainingSeconds = MIN_SUBMIT_SECONDS - timeSpentSeconds;
      const message = `You must spend at least 3 minutes before submitting. ${formatTime(remainingSeconds)} remaining.`;
      showNotification('error', message);
      throw new Error(message);
    }

    setIsSubmitting(true);
    try {
      const result = await simulationAPI.submitSimulationSession(
        currentSession.id,
        latestAnswers,
        timeSpentSeconds
      );
      const submitData = result?.data ?? result;

      setSubmissionResult(submitData);
      setSession(prev => prev ? {
        ...prev,
        status: 'completed',
        endTime: submitData?.submittedAt || new Date().toISOString(),
        timeSpent: submitData?.summary?.total_time_seconds ?? timeSpentSeconds,
      } : prev);

      showNotification('success', submitData?.message || result?.message || 'Simulation submitted successfully');
      return submitData;
    } catch (error: any) {
      showNotification('error', error?.message || 'Failed to submit simulation');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const startTask = useCallback(async (taskIndex: number) => {
    const currentSession = sessionRef.current;
    if (!currentSession) {
      console.log('⚠️ [startTask] No current session');
      return;
    }
    
    if (currentSession.status === 'completed' || currentSession.status === 'submitted') {
      console.warn('⚠️ [startTask] Cannot start task on completed session');
      return;
    }
    
    if (updateQueueRef.current) {
      try {
        await updateQueueRef.current;
      } catch (error) {
        console.warn('Previous update failed, continuing anyway');
      }
    }
    
    const existingProgress = taskProgressRef.current.find(tp => tp.task_index === taskIndex);
    
    if (existingProgress?.status === 'completed') {
      console.log('⚠️ [startTask] Task already completed');
      showNotification('error', `Task ${taskIndex + 1} is already completed`);
      return;
    }
    
    if (existingProgress?.status === 'in_progress') {
      console.log('⚠️ [startTask] Task already in progress');
      return;
    }
    
    isStartingTaskRef.current = true;
    
    try {
      console.log(`🚀 [startTask] Starting task ${taskIndex}...`);
      
      const result = await updateTaskProgress(taskIndex, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
        time_spent: 0
      });
      
      console.log(`✅ [startTask] Task ${taskIndex} started:`, result);
      
      if (currentSession.id) {
        console.log(`🔄 [startTask] Reloading task progress...`);
        const refreshed = await loadTaskProgress(currentSession.id, true);
        if (refreshed) {
          taskProgressRef.current = refreshed;
        }
      }
      
      showNotification('success', `Task ${taskIndex + 1} started!`);
      return result;
    } catch (error) {
      console.error(`❌ [startTask] Failed:`, error);
      showNotification('error', `Failed to start task ${taskIndex + 1}`);
      throw error;
    } finally {
      setTimeout(() => {
        isStartingTaskRef.current = false;
      }, 1000);
    }
  }, [updateTaskProgress, loadTaskProgress]);

  // Initial load effect
  useEffect(() => {
    loadSession();
  }, [loadSession]);

  return {
    session,
    tasks,
    currentTask,
    setCurrentTask,
    loading,
    error,
    progress,
    setProgress,
    answers,
    setAnswers,
    taskProgress,
    githubLinks,
    setGithubLinks,
    githubRepo,
    githubFiles,
    githubFileStructure,
    loadingGithub,
    notification,
    submissionResult,
    isSubmitting,
    showNotification,
    saveProgress,
    submitSimulation,
    updateTaskProgress,
    startTask,
    loadSession,
    updateTimeSpent,
    refreshTaskProgress,
    loadGithubRepository,
  };
}