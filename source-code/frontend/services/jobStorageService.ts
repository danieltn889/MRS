const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

interface SavedJob {
  id: string;
  title: string;
  company_name: string;
  saved_at?: string;
  [key: string]: any;
}

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

/**
 * Normalise whatever the API returns into a plain SavedJob[].
 * Handles the three shapes we have seen in production:
 *   1. { success: true, data: SavedJob[] }
 *   2. { success: true, data: { data: SavedJob[], total, page, … } }  ← paginated
 *   3. SavedJob[]  (bare array)
 */
const extractJobs = (raw: any): SavedJob[] => {
  if (!raw) return [];

  // bare array
  if (Array.isArray(raw)) return raw;

  const inner = raw.data;
  if (!inner) return [];

  // { data: SavedJob[] }
  if (Array.isArray(inner)) return inner;

  // { data: { data: SavedJob[], … } }  — paginated envelope
  if (inner && Array.isArray(inner.data)) return inner.data;

  // { data: { jobs: SavedJob[], … } }  — some backends use "jobs"
  if (inner && Array.isArray(inner.jobs)) return inner.jobs;

  return [];
};

// ─── save / unsave ────────────────────────────────────────────────────────────

export const saveJob = async (jobId: string): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to save job');
    }
    return await response.json();
  } catch (error) {
    console.error('Error saving job:', error);
    throw error;
  }
};

export const unsaveJob = async (jobId: string): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to unsave job');
    }
    return await response.json();
  } catch (error) {
    console.error('Error unsaving job:', error);
    throw error;
  }
};

// ─── check ───────────────────────────────────────────────────────────────────

export const isJobSaved = async (jobId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}/check`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (response.ok) {
      const data = await response.json();
      return (
        data.saved === true ||
        data.isSaved === true ||
        data.data?.saved === true
      );
    }

    // fall back to full list check
    const savedJobs = await loadSavedJobsFromAPI();
    return savedJobs.includes(jobId);
  } catch (error) {
    console.error('Error checking if job is saved:', error);
    try {
      const savedJobs = await loadSavedJobsFromAPI();
      return savedJobs.includes(jobId);
    } catch {
      return false;
    }
  }
};

// ─── load (IDs only) ─────────────────────────────────────────────────────────

export const loadSavedJobsFromAPI = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) return [];

    const raw = await response.json();
    const jobs = extractJobs(raw);
    return jobs.map((job: SavedJob) => job.id).filter(Boolean);
  } catch (error) {
    console.error('Error loading saved jobs:', error);
    return [];
  }
};

// ─── load (full objects) ─────────────────────────────────────────────────────

export const getSavedJobsDetails = async (): Promise<SavedJob[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) return [];

    const raw = await response.json();
    return extractJobs(raw);
  } catch (error) {
    console.error('Error fetching saved jobs details:', error);
    return [];
  }
};

// ─── toggle ──────────────────────────────────────────────────────────────────

export const toggleSaveJob = async (jobId: string): Promise<boolean> => {
  const isCurrentlySaved = await isJobSaved(jobId);
  if (isCurrentlySaved) {
    await unsaveJob(jobId);
    return false;
  } else {
    await saveJob(jobId);
    return true;
  }
};