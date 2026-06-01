// services/jobStorageService.js
const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

export const saveJob = async (jobId) => {
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

export const unsaveJob = async (jobId) => {
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

export const loadSavedJobsFromAPI = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        return data.data.map(job => job.id);
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading saved jobs:', error);
    return [];
  }
};