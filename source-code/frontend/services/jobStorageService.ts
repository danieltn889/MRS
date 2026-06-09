// jobStorageService.ts

const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

interface SavedJob {
  id: string;
  title: string;
  company_name: string;
  saved_at?: string;
  [key: string]: any;
}

interface SavedJobsResponse {
  success: boolean;
  data: SavedJob[];
}

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

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

export const isJobSaved = async (jobId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}/check`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.saved === true || data.isSaved === true || data.data?.saved === true;
    }
    
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

export const loadSavedJobsFromAPI = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data.map((job: SavedJob) => job.id);
      }
      if (Array.isArray(data)) {
        return data.map((job: SavedJob) => job.id);
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading saved jobs:', error);
    return [];
  }
};

export const getSavedJobsDetails = async (): Promise<SavedJob[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data;
      }
      if (Array.isArray(data)) {
        return data;
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching saved jobs details:', error);
    return [];
  }
};

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