// API Service for Job Posting Management
// Handles all communication between frontend and backend for job operations

/// <reference types="vite/client" />

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// =====================================================
// TYPE DEFINITIONS
// =====================================================

export const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Helper function for multipart/form-data requests (file uploads)
export const getFormDataHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Helper function to handle API responses
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// =====================================================
// CORE JOB OPERATIONS
// =====================================================

/**
 * Get all jobs with filtering and pagination (public job search)
 */
export const getJobs = async (params: Record<string, any> = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/jobs${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    const result = await handleResponse(response);
    
    if (result.success && result.data) {
      if (result.data.data && Array.isArray(result.data.data)) {
        return {
          success: true,
          data: {
            jobs: result.data.data,
            total: result.data.pagination?.total || result.data.data.length,
            pagination: result.data.pagination
          }
        };
      }
      if (Array.isArray(result.data)) {
        return {
          success: true,
          data: {
            jobs: result.data,
            total: result.data.length,
            pagination: null
          }
        };
      }
      if (result.data.jobs && Array.isArray(result.data.jobs)) {
        return {
          success: true,
          data: {
            jobs: result.data.jobs,
            total: result.data.total || result.data.jobs.length,
            pagination: result.data.pagination
          }
        };
      }
    }
    
    if (Array.isArray(result)) {
      return {
        success: true,
        data: {
          jobs: result,
          total: result.length,
          pagination: null
        }
      };
    }
    
    if (result.jobs && Array.isArray(result.jobs)) {
      return {
        success: true,
        data: {
          jobs: result.jobs,
          total: result.total || result.jobs.length,
          pagination: result.pagination
        }
      };
    }
    
    return {
      success: true,
      data: {
        jobs: [],
        total: 0,
        pagination: null
      }
    };
    
  } catch (error) {
    console.error('Error getting jobs:', error);
    return {
      success: false,
      data: {
        jobs: [],
        total: 0,
        pagination: null
      }
    };
  }
};

/**
 * Get single job details
 */
export const getJob = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting job:', error);
    throw error;
  }
};

export const getJobById = async (jobId: string) => {
  return getJob(jobId);
};

export const getCompanyJobs = async (params: Record<string, any> = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/companies/jobs${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting company jobs:', error);
    throw error;
  }
};

export const previewJob = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/preview`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error previewing job:', error);
    throw error;
  }
};

export const getMyJobs = async (params: Record<string, any> = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/jobs/my-jobs${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting my jobs:', error);
    throw error;
  }
};

export const createJob = async (jobData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(jobData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error creating job:', error);
    throw error;
  }
};

export const updateJob = async (jobId: string, jobData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(jobData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error updating job:', error);
    throw error;
  }
};

export const deleteJob = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error deleting job:', error);
    throw error;
  }
};

export const duplicateJob = async (jobId: string, modifications: any = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/duplicate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(modifications),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error duplicating job:', error);
    throw error;
  }
};

// =====================================================
// DRAFT MANAGEMENT
// =====================================================

export const saveJobDraft = async (jobData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/draft`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(jobData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error saving job draft:', error);
    throw error;
  }
};

export const saveAsDraft = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/draft`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error saving as draft:', error);
    throw error;
  }
};

export const publishJobDraft = async (draftId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/draft/${draftId}/publish`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error publishing job draft:', error);
    throw error;
  }
};

// =====================================================
// JOB MANAGEMENT
// =====================================================

export const setJobExpiration = async (jobId: string, expirationData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/expiration`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(expirationData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error setting job expiration:', error);
    throw error;
  }
};

export const extendJobDeadline = async (jobId: string, extensionData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/extend`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(extensionData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error extending job deadline:', error);
    throw error;
  }
};

export const pauseJobPosting = async (jobId: string, pauseData: any = { paused: true }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/pause`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(pauseData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error pausing job posting:', error);
    throw error;
  }
};

export const resumeJobPosting = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/resume`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error resuming job posting:', error);
    throw error;
  }
};

export const archiveJobPosting = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/archive`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error archiving job posting:', error);
    throw error;
  }
};

// =====================================================
// JOB TEMPLATES
// =====================================================

export const getJobTemplates = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/templates`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting job templates:', error);
    throw error;
  }
};

// =====================================================
// SUGGESTIONS (live from DB for autocomplete)
// =====================================================

export const getSuggestions = async (): Promise<{
  skills: string[];
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  degreeTypes: string[];
  fieldsOfStudy: string[];
} | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/suggestions`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const result = await handleResponse(response);
    return result?.data ?? null;
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return null;
  }
};

// =====================================================
// DEBUG & UTILITY
// =====================================================

export const debugUserCompany = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/debug/user-company`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error debugging user company:', error);
    throw error;
  }
};

// =====================================================
// SAVE JOB (for candidates)
// =====================================================

export const saveJob = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error saving job:', error);
    throw error;
  }
};

// =====================================================
// APPLY TO JOB
// =====================================================

export const applyToJob = async (jobId: string, applicationData: any) => {
  try {
    let response;
    
    const isFormData = applicationData && typeof applicationData.append === 'function';
    
    if (isFormData) {
      const token = localStorage.getItem('authToken');
      response = await fetch(`${API_BASE_URL}/applications/apply-with-profile/${jobId}`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: applicationData,
      });
    } else {
      response = await fetch(`${API_BASE_URL}/applications/apply-with-profile/${jobId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(applicationData),
      });
    }
    
    const result = await handleResponse(response);
    
    return {
      success: result.success === true,
      message: result.message || 'Application submitted successfully',
      data: result.data,
      applicationId: result.data?.id || result.data?.applicationId
    };
    
  } catch (error: any) {
    console.error('Error applying to job:', error);
    return {
      success: false,
      message: error.message || 'Failed to submit application',
      error: error.message
    };
  }
};

// =====================================================
// JOB CANDIDATES WITH AI MATCH SCORES
// =====================================================

export const getJobCandidatesWithMatches = async (jobId: string, params: any = {}) => {
  try {
    const { page = 1, limit = 20, sortBy = 'match_score', sortOrder = 'DESC' } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder
    });
    
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/candidates?${queryParams}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    const result = await handleResponse(response);
    
    if (result.success && result.data) {
      return {
        success: true,
        data: {
          job: result.data.job || {},
          candidates: result.data.candidates || [],
          stats: result.data.stats || {},
          pagination: result.data.pagination || {},
          filters: result.data.filters || {}
        }
      };
    }
    
    return {
      success: true,
      data: {
        job: {},
        candidates: [],
        stats: {
          total_applications: 0,
          avg_match_score: 0,
          max_match_score: 0,
          min_match_score: 0,
          high_match_count: 0,
          medium_match_count: 0,
          low_match_count: 0,
          by_status: {
            submitted: 0,
            under_review: 0,
            shortlisted: 0,
            interview: 0,
            assessment: 0,
            offer: 0,
            hired: 0,
            rejected: 0
          }
        },
        pagination: {
          current_page: 1,
          per_page: 20,
          total_items: 0,
          total_pages: 0,
          has_next_page: false,
          has_prev_page: false
        },
        filters: {
          sort_by: sortBy,
          sort_order: sortOrder
        }
      }
    };
    
  } catch (error: any) {
    console.error('Error getting job candidates with matches:', error);
    return {
      success: false,
      data: {
        job: {},
        candidates: [],
        stats: {},
        pagination: {},
        filters: {}
      },
      error: error.message
    };
  }
};

// =====================================================
// JOB CANDIDATES COMPLETE - WITH SIMULATIONS & TASKS
// =====================================================

/**
 * Get all candidates who applied to a job with complete details including simulations, tasks, and marks
 * @param jobId - The job ID
 * @param params - Query parameters for pagination, filtering, and sorting
 * @returns Complete candidate data with simulation results, task progress, and ranking
 */
export const getJobCandidatesComplete = async (jobId: string, params: any = {}) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'overall_score',
      sortOrder = 'DESC',
      minScore,
      maxScore,
      status,
      hasSimulation = 'all'
    } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sortBy,
      sortOrder
    });
    
    if (minScore) queryParams.append('minScore', minScore.toString());
    if (maxScore) queryParams.append('maxScore', maxScore.toString());
    if (status && status !== 'all') queryParams.append('status', status);
    if (hasSimulation && hasSimulation !== 'all') queryParams.append('hasSimulation', hasSimulation);
    
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/candidates/complete?${queryParams}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    
    const result = await handleResponse(response);
    
    if (result.success && result.data) {
      return {
        success: true,
        data: {
          job: result.data.job || {},
          candidates: result.data.candidates || [],
          stats: result.data.stats || {},
          pagination: result.data.pagination || {},
          filters: result.data.filters || {}
        }
      };
    }
    
    return {
      success: true,
      data: {
        job: {},
        candidates: [],
        stats: {
          total_applicants: 0,
          by_status: {
            submitted: 0,
            under_review: 0,
            shortlisted: 0,
            interviewing: 0,
            offers: 0,
            hired: 0,
            rejected: 0
          },
          scores: {
            average: 0,
            max: 0,
            min: 0
          },
          simulations: {
            with_simulation: 0,
            without_simulation: 0
          }
        },
        pagination: {
          current_page: 1,
          per_page: 20,
          total_items: 0,
          total_pages: 0,
          has_next_page: false,
          has_prev_page: false
        },
        filters: {
          sort_by: sortBy,
          sort_order: sortOrder,
          min_score: minScore || null,
          max_score: maxScore || null,
          status: status || 'all',
          has_simulation: hasSimulation || 'all'
        }
      }
    };
    
  } catch (error: any) {
    console.error('Error getting job candidates complete:', error);
    return {
      success: false,
      data: {
        job: {},
        candidates: [],
        stats: {},
        pagination: {},
        filters: {}
      },
      error: error.message
    };
  }
};

// =====================================================
// APPLICATION STATUS MANAGEMENT
// =====================================================

export const updateApplicationStatus = async (applicationId: string, updateData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/applications/${applicationId}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updateData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error updating application status:', error);
    throw error;
  }
};

export const addApplicationNote = async (applicationId: string, note: string, isInternal: boolean = false) => {
  try {
    const response = await fetch(`${API_BASE_URL}/applications/${applicationId}/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ note, isInternal }),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error adding application note:', error);
    throw error;
  }
};

export const scheduleInterview = async (applicationId: string, interviewData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/applications/${applicationId}/interview`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(interviewData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error scheduling interview:', error);
    throw error;
  }
};

// =====================================================
// CANDIDATE JOB BROWSING
// =====================================================

export const getJobsForCandidates = async (params: any = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/jobs/candidate/list${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting jobs for candidates:', error);
    throw error;
  }
};

export const getJobForCandidate = async (jobId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/candidate/${jobId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error getting job for candidate:', error);
    throw error;
  }
};

// =====================================================
// EXPORT ALL FUNCTIONS
// =====================================================

export default {
  // Core Job Operations
  getJobs,
  getJob,
  getJobById,
  getCompanyJobs,
  previewJob,
  getMyJobs,
  createJob,
  updateJob,
  deleteJob,
  duplicateJob,
  
  // Draft Management
  saveJobDraft,
  saveAsDraft,
  publishJobDraft,
  
  // Job Management
  setJobExpiration,
  extendJobDeadline,
  pauseJobPosting,
  resumeJobPosting,
  archiveJobPosting,
  
  // Templates & Debug
  getJobTemplates,
  debugUserCompany,
  
  // Candidate Actions
  saveJob,
  applyToJob,
  
  // Candidate Browsing
  getJobsForCandidates,
  getJobForCandidate,
  
  // Candidate Management with AI Match Scores
  getJobCandidatesWithMatches,
  
  // NEW: Candidate Management with Complete Simulation Data
  getJobCandidatesComplete,
  
  // Application Management
  updateApplicationStatus,
  addApplicationNote,
  scheduleInterview,
};