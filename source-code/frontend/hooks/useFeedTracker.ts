import { useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Fire-and-forget   never throws, never blocks UI
function fire(url: string, method: string, body?: object, token?: string | null) {
  if (!token) return;
  fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {});
}

export function useFeedTracker() {
  const { token, user } = useAuth();
  const isCandidate = user?.userType === 'candidate'|| (user as any)?.user_type === 'candidate';

  // Debounce search logs so rapid keystrokes don't spam the API
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track hover start time per job
  const hoverStart = useRef<Record<string, number>>({});

  const trackView = useCallback((jobId: string, secondsSpent = 0) => {
    if (!isCandidate || !jobId) return;
    fire(`${API}/feed/view/${jobId}`, 'POST', { seconds_spent: secondsSpent }, token);
  }, [token, isCandidate]);

  const trackSearch = useCallback((query: string) => {
    if (!isCandidate || !query?.trim()) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fire(`${API}/feed/search-log`, 'POST', { query: query.trim() }, token);
    }, 1500); // wait 1.5s after user stops typing
  }, [token, isCandidate]);

  const trackSave = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    fire(`${API}/feed/save/${jobId}`, 'POST', undefined, token);
  }, [token, isCandidate]);

  const trackUnsave = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    fire(`${API}/feed/save/${jobId}`, 'DELETE', undefined, token);
  }, [token, isCandidate]);

  const trackIgnore = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    fire(`${API}/feed/ignore/${jobId}`, 'POST', undefined, token);
  }, [token, isCandidate]);

  // Call when the Apply form is opened for a job (not when it's submitted   see submitApplication)
  const trackApplicationStart = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    fire(`${API}/feed/application-start/${jobId}`, 'POST', undefined, token);
  }, [token, isCandidate]);

  // Call on mouseenter of a job card
  const onHoverStart = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    hoverStart.current[jobId] = Date.now();
  }, [isCandidate]);

  // Call on mouseleave   logs a view if hovered 4+ seconds
  const onHoverEnd = useCallback((jobId: string) => {
    if (!isCandidate || !jobId) return;
    const start = hoverStart.current[jobId];
    if (!start) return;
    const seconds = Math.round((Date.now() - start) / 1000);
    delete hoverStart.current[jobId];
    if (seconds >= 4) {
      trackView(jobId, seconds);
    }
  }, [isCandidate, trackView]);

  return { trackView, trackSearch, trackSave, trackUnsave, trackIgnore, trackApplicationStart, onHoverStart, onHoverEnd };
}
