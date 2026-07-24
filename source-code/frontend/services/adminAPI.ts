// API Service for System Admin   Company Management & User Management

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

const handleResponse = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.message || `HTTP error! status: ${response.status}`) as Error & Record<string, any>;
    err.code = data.code;
    err.existingUserId = data.existingUserId;
    throw err;
  }
  return data;
};

export interface AdminCompany {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  verification_status: 'pending'| 'verified'| 'rejected'| 'expired';
  created_at: string;
  created_by: string | null;
  owner_email: string | null;
  job_count: number;
  team_count: number;
}

export interface AdminCompanyUser {
  team_id: string;
  name: string;
  title: string;
  team_role: 'admin'| 'recruiter'| 'reviewer'| 'viewer';
  team_email: string;
  user_id: string;
  login_email: string;
  user_type: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export interface PlatformStats {
  companies: { total: number; verified: number; pending: number };
  users: { total: number; candidates: number; recruiters: number; company_admins: number; system_admins: number };
  jobs: { total: number; active: number };
  applications: {
    total: number; shortlisted: number; interview: number; offer: number;
    hired: number; rejected: number; withdrawn: number; in_review: number;
  };
  candidatesWhoApplied: number;
}

export const getPlatformStats = async (): Promise<{ success: boolean; data: PlatformStats }> => {
  const response = await fetch(`${API_BASE_URL}/admin/stats`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export interface PlatformAnalytics {
  days: number;
  timeSeries: {
    registrations: { date: string; count: string }[];
    applications: { date: string; count: string }[];
    jobsPosted: { date: string; count: string }[];
  };
  jobsByIndustry: { industry: string; count: string }[];
  employmentType: { job_type: string; count: string }[];
  applicationStatus: { status: string; count: string }[];
  companyVerification: { verification_status: string; count: string }[];
  topRecruiters: { id: string; name: string; company_name: string | null; jobs_posted: string }[];
}

export const getPlatformAnalytics = async (days: number = 30): Promise<{ success: boolean; data: PlatformAnalytics }> => {
  const response = await fetch(`${API_BASE_URL}/admin/analytics?days=${days}`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const getAdminCompanies = async (params: { page?: number; limit?: number; q?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.q) qs.set('q', params.q);
  const response = await fetch(`${API_BASE_URL}/admin/companies?${qs.toString()}`, { headers: getAuthHeaders() });
  return handleResponse(response) as Promise<{ success: boolean; data: AdminCompany[]; pagination: { page: number; limit: number; total: number } }>;
};

export const createAdminCompany = async (payload: {
  name: string; description?: string; industry?: string; city?: string; country?: string;
  website?: string; size?: string;
}) => {
  const response = await fetch(`${API_BASE_URL}/admin/companies`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const updateAdminCompany = async (id: string, payload: Partial<{
  name: string; description: string; industry: string; city: string; country: string;
  website: string; size: string; verificationStatus: string;
}>) => {
  const response = await fetch(`${API_BASE_URL}/admin/companies/${id}`, {
    method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteAdminCompany = async (id: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/companies/${id}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const getAdminCompanyUsers = async (companyId: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/companies/${companyId}/users`, { headers: getAuthHeaders() });
  return handleResponse(response) as Promise<{ success: boolean; data: AdminCompanyUser[] }>;
};

export const createAdminCompanyUser = async (companyId: string, payload: {
  name: string; email: string; title?: string; teamRole: 'admin'| 'recruiter'| 'reviewer'| 'viewer';
}) => {
  const response = await fetch(`${API_BASE_URL}/admin/companies/${companyId}/users`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const resendAdminUserCredentials = async (userId: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/resend-credentials`, {
    method: 'POST', headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateAdminUser = async (userId: string, payload: Partial<{
  status: string; teamRole: string; title: string;
}>) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteAdminUser = async (userId: string) => {
  const response = await fetch(`${API_BASE_URL}/admin/users/${userId}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export default {
  getPlatformStats,
  getPlatformAnalytics,
  getAdminCompanies,
  createAdminCompany,
  updateAdminCompany,
  deleteAdminCompany,
  getAdminCompanyUsers,
  createAdminCompanyUser,
  updateAdminUser,
  deleteAdminUser,
};
