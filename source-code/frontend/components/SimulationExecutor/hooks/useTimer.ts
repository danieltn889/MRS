// hooks/useTimer.ts - Simple version (NO auto-save, manual save only)

import { useState, useEffect, useRef, useCallback } from 'react';

interface SimulationSession {
  id: string;
  status: string;
  timeSpent?: number;
  started_at?: string;
  startTime?: string;
  time_limit?: number;
}

export const MIN_SUBMIT_SECONDS = 3 * 60;

export function useTimer(
  session: SimulationSession | null,
  onTick?: (timeSpent: number) => void,
  onExpire?: () => void
) {
  const [timeSpent, setTimeSpent] = useState(0);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isInitializedRef = useRef(false);
  const lastTickRef = useRef<number>(0);
  const hasExpiredRef = useRef(false);

  // Countdown: how much time is left, and whether the clock has run out.
  const timeRemaining: number | null = timeLimit != null ? Math.max(0, timeLimit - timeSpent) : null;
  const isExpired: boolean = timeLimit != null && timeSpent >= timeLimit;

  // Calculate real elapsed time from start time
  const calculateElapsedTime = useCallback((): number => {
    if (!sessionStartTimeRef.current) return 0;
    const now = new Date();
    const elapsed = Math.floor((now.getTime() - sessionStartTimeRef.current.getTime()) / 1000);
    return Math.max(0, elapsed);
  }, []);

  // Format time for display (mm:ss or hh:mm:ss)
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }, []);

  // Get color based on elapsed time vs time limit
  const getTimeColor = useCallback((elapsed: number): string => {
    if (!timeLimit) return 'text-green-400';

    const percentage = (elapsed / timeLimit) * 100;
    if (percentage < 50) return 'text-green-400';
    if (percentage < 80) return 'text-yellow-400';
    if (percentage < 100) return 'text-orange-400';
    return 'text-red-400';
  }, [timeLimit]);

  // Countdown color: red when expired, orange under 5 minutes, yellow in the
  // final stretch, green otherwise.
  const getCountdownColor = useCallback((remaining: number | null): string => {
    if (remaining == null) return 'text-green-400';
    if (remaining <= 0) return 'text-red-400';
    if (remaining <= 300) return 'text-orange-400';
    if (timeLimit && remaining <= timeLimit * 0.2) return 'text-yellow-400';
    return 'text-green-400';
  }, [timeLimit]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Timer that updates UI every second (NO saving)
  const startTimer = useCallback(() => {
    if (!session) return;
    if (session.status === 'completed'|| session.status === 'submitted') return;
    if (!sessionStartTimeRef.current) return;
    
    if (timerRef.current) clearInterval(timerRef.current);
    
    setIsRunning(true);
    setIsPaused(false);
    
    // Update UI immediately
    const elapsed = calculateElapsedTime();
    if (lastTickRef.current !== elapsed) {
      lastTickRef.current = elapsed;
      setTimeSpent(elapsed);
      onTick?.(elapsed);
    }
    
    // Update UI every second (NO saving)
    timerRef.current = setInterval(() => {
      const newElapsed = calculateElapsedTime();
      if (lastTickRef.current !== newElapsed) {
        lastTickRef.current = newElapsed;
        setTimeSpent(newElapsed);
        onTick?.(newElapsed);
      }
    }, 1000);
  }, [session, calculateElapsedTime, onTick]);

  const pauseTimer = useCallback(() => {
    if (session?.status === 'completed'|| session?.status === 'submitted') return;
    clearTimer();
    setIsRunning(false);
    setIsPaused(true);
  }, [clearTimer, session?.status]);

  const resumeTimer = useCallback(() => {
    if (session?.status === 'completed'|| session?.status === 'submitted') return;
    startTimer();
  }, [startTimer, session?.status]);

  // Get current time for manual save
  const getCurrentTime = useCallback((): number => {
    return calculateElapsedTime();
  }, [calculateElapsedTime]);

  // Initialize when session changes
  useEffect(() => {
    if (!session) {
      sessionStartTimeRef.current = null;
      setTimeSpent(0);
      setTimeLimit(null);
      isInitializedRef.current = false;
      lastTickRef.current = 0;
      clearTimer();
      return;
    }

    // Set time limit for display only
    if (session.time_limit && timeLimit !== session.time_limit) {
      setTimeLimit(session.time_limit);
    }

    // Initialize timer based on session data
    if (!isInitializedRef.current && session.id) {
      const startTimeStr = session.startTime || session.started_at;
      
      if (startTimeStr) {
        const startTime = new Date(startTimeStr);
        sessionStartTimeRef.current = startTime;
        const elapsed = calculateElapsedTime();
        setTimeSpent(elapsed);
        lastTickRef.current = elapsed;
        onTick?.(elapsed);
      } 
      else if (session.timeSpent !== undefined && session.timeSpent > 0) {
        setTimeSpent(session.timeSpent);
        lastTickRef.current = session.timeSpent;
        onTick?.(session.timeSpent);
      }
      else if (session.status === 'in_progress') {
        const now = new Date();
        sessionStartTimeRef.current = now;
        setTimeSpent(0);
        lastTickRef.current = 0;
      }
      
      isInitializedRef.current = true;
    }
  }, [session, calculateElapsedTime, onTick, timeLimit, clearTimer]);

  // Auto-start timer when session is in_progress
  useEffect(() => {
    if (session?.status === 'in_progress'&& !isPaused && !isRunning && sessionStartTimeRef.current && isInitializedRef.current) {
      startTimer();
    }
  }, [session?.status, isPaused, isRunning, startTimer]);

  // Fire onExpire exactly once when the countdown reaches zero, and stop ticking.
  useEffect(() => {
    if (isExpired && !hasExpiredRef.current) {
      hasExpiredRef.current = true;
      clearTimer();
      setIsRunning(false);
      onExpire?.();
    }
  }, [isExpired, clearTimer, onExpire]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    timeSpent,
    timeLimit,
    timeRemaining,
    isExpired,
    isRunning,
    isPaused,
    startTimer,
    pauseTimer,
    resumeTimer,
    formatTime,
    getTimeColor,
    getCountdownColor,
    getCurrentTime,  // 👈 Returns current time for manual save
    clearTimer,
    MIN_SUBMIT_SECONDS,
  };
}

export default useTimer;