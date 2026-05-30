// hooks/useTimer.ts - Optimized version (Saves every 30 seconds instead of every second)

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
const SAVE_INTERVAL_SECONDS = 30; // 👈 Save every 30 seconds instead of every second

export function useTimer(
  session: SimulationSession | null,
  onTick?: (timeSpent: number) => void,
  onSaveProgress?: (timeSpent: number) => void  // 👈 Separate callback for saving
) {
  const [timeSpent, setTimeSpent] = useState(0);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);  // 👈 Separate timer for saving
  const isInitializedRef = useRef(false);
  const lastTickRef = useRef<number>(0);
  const lastSaveRef = useRef<number>(0);

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

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Timer that updates UI every second (does NOT save)
  const startUITimer = useCallback(() => {
    if (!session) return;
    if (session.status === 'completed' || session.status === 'submitted') return;
    if (!sessionStartTimeRef.current) return;
    
    if (timerRef.current) clearInterval(timerRef.current);
    
    setIsRunning(true);
    setIsPaused(false);
    
    // Update UI immediately
    const elapsed = calculateElapsedTime();
    if (lastTickRef.current !== elapsed) {
      lastTickRef.current = elapsed;
      setTimeSpent(elapsed);
      onTick?.(elapsed);  // 👈 This just updates UI, doesn't save
    }
    
    // Update UI every second (NO saving here)
    timerRef.current = setInterval(() => {
      const newElapsed = calculateElapsedTime();
      if (lastTickRef.current !== newElapsed) {
        lastTickRef.current = newElapsed;
        setTimeSpent(newElapsed);
        onTick?.(newElapsed);  // 👈 UI update only
      }
    }, 1000);
  }, [session, calculateElapsedTime, onTick]);

  // Separate timer that saves progress periodically (every 30 seconds)
  const startSaveTimer = useCallback(() => {
    if (!session) return;
    if (session.status === 'completed' || session.status === 'submitted') return;
    if (!onSaveProgress) return;
    
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    
    // Save every SAVE_INTERVAL_SECONDS
    saveTimerRef.current = setInterval(() => {
      const currentElapsed = calculateElapsedTime();
      const timeSinceLastSave = currentElapsed - lastSaveRef.current;
      
      // Only save if enough time has passed and we're not saving too frequently
      if (timeSinceLastSave >= SAVE_INTERVAL_SECONDS) {
        console.log(`💾 Auto-saving progress at ${currentElapsed} seconds`);
        onSaveProgress(currentElapsed);
        lastSaveRef.current = currentElapsed;
      }
    }, SAVE_INTERVAL_SECONDS * 1000);
  }, [session, calculateElapsedTime, onSaveProgress]);

  const pauseTimer = useCallback(() => {
    if (session?.status === 'completed' || session?.status === 'submitted') return;
    clearTimers();
    setIsRunning(false);
    setIsPaused(true);
  }, [clearTimers, session?.status]);

  const resumeTimer = useCallback(() => {
    if (session?.status === 'completed' || session?.status === 'submitted') return;
    startUITimer();
    startSaveTimer();
  }, [startUITimer, startSaveTimer, session?.status]);

  const saveNow = useCallback(() => {
    const currentElapsed = calculateElapsedTime();
    if (onSaveProgress) {
      console.log(`💾 Manual save at ${currentElapsed} seconds`);
      onSaveProgress(currentElapsed);
      lastSaveRef.current = currentElapsed;
    }
  }, [calculateElapsedTime, onSaveProgress]);

  // Initialize when session changes
  useEffect(() => {
    if (!session) {
      sessionStartTimeRef.current = null;
      setTimeSpent(0);
      setTimeLimit(null);
      isInitializedRef.current = false;
      lastTickRef.current = 0;
      lastSaveRef.current = 0;
      clearTimers();
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
        lastSaveRef.current = elapsed;  // 👈 Initialize last save time
        onTick?.(elapsed);
      } 
      else if (session.timeSpent !== undefined && session.timeSpent > 0) {
        setTimeSpent(session.timeSpent);
        lastTickRef.current = session.timeSpent;
        lastSaveRef.current = session.timeSpent;
        onTick?.(session.timeSpent);
      }
      else if (session.status === 'in_progress') {
        const now = new Date();
        sessionStartTimeRef.current = now;
        setTimeSpent(0);
        lastTickRef.current = 0;
        lastSaveRef.current = 0;
      }
      
      isInitializedRef.current = true;
    }
  }, [session, calculateElapsedTime, onTick, timeLimit, clearTimers]);

  // Auto-start timers when session is in_progress
  useEffect(() => {
    if (session?.status === 'in_progress' && !isPaused && !isRunning && sessionStartTimeRef.current && isInitializedRef.current) {
      startUITimer();
      startSaveTimer();
    }
  }, [session?.status, isPaused, isRunning, startUITimer, startSaveTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    timeSpent,
    timeLimit,
    isRunning,
    isPaused,
    startTimer: startUITimer,
    pauseTimer,
    resumeTimer,
    formatTime,
    getTimeColor,
    getElapsedTime: calculateElapsedTime,
    clearTimer: clearTimers,
    saveNow,  // 👈 Manual save trigger
  };
}

export default useTimer;