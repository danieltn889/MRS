// src/services/dashboardAPI.ts

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export interface DashboardStats {
  active_jobs: number;
  total_applications: number;
  qualified_candidates: number;
  interviews_scheduled: number;
  additional?: {
    active_jobs: number;
    draft_jobs: number;
    paused_jobs: number;
    closed_jobs: number;
    expired_jobs: number;
    pending_applications: number;
    under_review: number;
    shortlisted: number;
    interviews: number;
    offers: number;
    hired: number;
    rejected: number;
  };
}

export const getCompanyDashboardStats = async (): Promise<DashboardStats> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/company/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const result = await handleResponse(response);
    return result.data;
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    throw error;
  }
};

export default {
  getCompanyDashboardStats,
};