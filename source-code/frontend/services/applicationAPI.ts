import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export interface ApplicationData {
  jobId: string;  // Must be UUID format
  coverLetter?: string;
  expectedSalary?: number;
  noticePeriod?: string;
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  availability?: string;
  additionalInfo?: {
    screeningAnswers?: Record<string, any>;
    documents?: Array<{
      name: string;
      url: string;
      type: 'resume'| 'cover_letter'| 'portfolio'| 'certificate';
    }>;
    candidateProfile?: any;
    jobDetails?: any;
    matchScore?: number;
    submittedAt?: string;
  };
}

export interface Application {
  id: string;
  job_id: string;
  job_title?: string;
  company_name?: string;
  company_logo?: string;
  user_id: string;
  application_number: string;
  status: 'submitted'| 'under_review'| 'shortlisted'| 'interview'| 'assessment'| 'reference_check'| 'offer'| 'hired'| 'rejected'| 'withdrawn'| 'on_hold';
  current_stage?: string;
  applied_at: string;
  updated_at: string;
  submitted_data?: {
    coverLetter?: string;
    expectedSalary?: number;
    noticePeriod?: string;
    portfolioUrl?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    availability?: string;
  };
  match_score?: number;
  rejection_reason?: string;
  interview_date?: string;
  assigned_to?: string;
  notes?: string;
  feedback?: string;
  profile_data?: any;
  source?: string;
}

export interface ApplicationDetails extends Application {
  job_description?: string;
  job_requirements?: string;
  job_benefits?: string;
  candidate_email?: string;
  candidate_first_name?: string;
  candidate_last_name?: string;
  candidate_phone?: string;
  candidate_location?: string;
  candidate_headline?: string;
  candidate_bio?: string;
  candidate_profile_photo?: string;
  candidate_portfolio?: string;
  candidate_linkedin?: string;
  candidate_github?: string;
  candidate_current_salary?: any;
  candidate_expected_salary?: any;
  candidate_languages?: any;
  candidate_availability?: any;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  event_description: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
  created_by?: string;
  metadata?: any;
}

export interface ApplicationResponse {
  success: boolean;
  data?: Application | { application: Application; timeline: TimelineEvent[] };
  message?: string;
}

export interface ApplicationsListResponse {
  success: boolean;
  data: {
    applications: Application[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

export interface ApplicationRequirements {
  title: string;
  description: string;
  requirements: any;
  screening_questions: any[];
  application_instructions: string;
  documents: any[];
}

export interface JobRequirementsResponse {
  success: boolean;
  data: ApplicationRequirements;
  message?: string;
}

// Helper function to get auth token
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

// Submit application for a job - FIXED: Converts matchScore to integer
export const submitApplication = async (applicationData: ApplicationData): Promise<ApplicationResponse> => {
  try {
    const token = getAuthToken();
    
    // Validate required fields
    if (!applicationData.jobId) {
      throw { response: { data: { success: false, message: 'Job ID is required'} } };
    }

    // CRITICAL FIX: Convert matchScore to integer to avoid PostgreSQL error
    // The error "invalid input syntax for type integer: '55.3'" occurs because
    // the database expects an integer but receives a float
    const sanitizedData = {
      jobId: applicationData.jobId,
      coverLetter: applicationData.coverLetter,
      expectedSalary: applicationData.expectedSalary,
      noticePeriod: applicationData.noticePeriod,
      portfolioUrl: applicationData.portfolioUrl,
      linkedinUrl: applicationData.linkedinUrl,
      githubUrl: applicationData.githubUrl,
      availability: applicationData.availability,
      additionalInfo: applicationData.additionalInfo ? {
        ...applicationData.additionalInfo,
        // Round matchScore to nearest integer
        matchScore: applicationData.additionalInfo.matchScore 
          ? Math.round(applicationData.additionalInfo.matchScore) 
          : null,
        submittedAt: applicationData.additionalInfo?.submittedAt || new Date().toISOString()
      } : undefined
    };

    console.log('📤 Submitting application with sanitized data:', sanitizedData);

    const response = await axios.post(`${API_BASE_URL}/applications`, sanitizedData, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Application submitted successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Submit application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to submit application'};
  }
};




// Get user's applications
export const getApplications = async (params?: {
  page?: number;
  limit?: number;
  status?: Application['status'];
}): Promise<ApplicationsListResponse> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();

    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);

    const response = await axios.get(`${API_BASE_URL}/applications?${queryParams.toString()}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get applications error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch applications'};
  }
};

// Get single application details with timeline
export const getApplication = async (applicationId: string): Promise<{ success: boolean; data: { application: ApplicationDetails; timeline: TimelineEvent[] }; message?: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_BASE_URL}/applications/${applicationId}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch application'};
  }
};

// Update application status (recruiters) or withdraw (candidates)
export const updateApplication = async (
  applicationId: string,
  updates: {
    status?: Application['status'];
    notes?: string;
    interviewDate?: string;
    feedback?: string;
  }
): Promise<ApplicationResponse> => {
  try {
    const token = getAuthToken();
    const response = await axios.put(`${API_BASE_URL}/applications/${applicationId}`, updates, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Update application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to update application'};
  }
};

// Delete/Withdraw application
export const deleteApplication = async (applicationId: string): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.delete(`${API_BASE_URL}/applications/${applicationId}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Delete application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to withdraw application'};
  }
};

// Withdraw application (candidates only)
// applicationAPI.ts - Update the withdrawApplication function

// Withdraw application (candidates only) - Use PUT method
export const withdrawApplication = async (applicationId: string): Promise<ApplicationResponse> => {
  try {
    const token = getAuthToken();
    // ''Use PUT method with status: 'withdrawn'
    const response = await axios.put(
      `${API_BASE_URL}/applications/${applicationId}`,
      { status: 'withdrawn'},  // ← Send status in body
      {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error: any) {
    console.error('Withdraw application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to withdraw application'};
  }
};

// Get rejection reason for an application
export const getRejectionReason = async (applicationId: string): Promise<{ success: boolean; data: { rejection_reason: string }; message?: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_BASE_URL}/applications/${applicationId}/rejection-reason`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get rejection reason error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch rejection reason'};
  }
};

// Get application requirements for a job
export const getApplicationRequirements = async (jobId: string): Promise<JobRequirementsResponse> => {
  try {
    const token = getAuthToken();
    const response = await axios.get(`${API_BASE_URL}/applications/requirements/${jobId}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get application requirements error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch application requirements'};
  }
};

// Apply with saved profile data
export const applyWithProfile = async (jobId: string): Promise<{ success: boolean; data: { applicationId: string; status?: string }; message?: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/apply-with-profile/${jobId}`, {}, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Apply with profile error:', error);
    throw error.response?.data || { success: false, message: 'Failed to submit application with profile'};
  }
};

// Upload document to application
export const uploadApplicationDocument = async (
  applicationId: string,
  document: {
    name: string;
    url: string;
    type: 'resume'| 'cover_letter'| 'portfolio'| 'certificate';
  }
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/${applicationId}/documents`, document, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Upload document error:', error);
    throw error.response?.data || { success: false, message: 'Failed to upload document'};
  }
};

// Submit answers to screening questions
export const submitScreeningAnswers = async (
  applicationId: string,
  answers: Array<{ questionId: number; answer: string }>
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/${applicationId}/questions`, { answers }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Submit answers error:', error);
    throw error.response?.data || { success: false, message: 'Failed to submit answers'};
  }
};

// Schedule simulation from application
export const scheduleSimulation = async (
  applicationId: string,
  simulationId: string,
  scheduledAt: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/${applicationId}/schedule-simulation`, {
      simulationId,
      scheduledAt
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Schedule simulation error:', error);
    throw error.response?.data || { success: false, message: 'Failed to schedule simulation'};
  }
};

// Get application history
export const getApplicationHistory = async (params?: {
  page?: number;
  limit?: number;
}): Promise<{
  success: boolean;
  data: {
    applications: Application[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();
    
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const response = await axios.get(`${API_BASE_URL}/applications/history?${queryParams.toString()}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get application history error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch application history'};
  }
};

// Recruiter endpoints

export interface RecruiterFeedResponse {
  success: boolean;
  data: Array<{
    id: string;
    job_id: string;
    job_title: string;
    candidate_email: string;
    applied_at: string;
    status: string;
  }>;
}

// Get new applications feed (recruiters)
export const getRecruiterFeed = async (since?: string): Promise<RecruiterFeedResponse> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();
    if (since) queryParams.append('since', since);

    const response = await axios.get(`${API_BASE_URL}/applications/recruiter/feed?${queryParams.toString()}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get recruiter feed error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch applications feed'};
  }
};

// Bulk process applications
export const bulkProcessApplications = async (
  applicationIds: string[],
  action: 'shortlist'| 'reject'| 'move_to_interview',
  rejectionReason?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/bulk`, {
      applicationIds,
      action,
      rejectionReason
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Bulk process error:', error);
    throw error.response?.data || { success: false, message: 'Failed to process applications'};
  }
};

// Move application to next stage
export const moveApplicationStage = async (
  applicationId: string,
  newStatus: 'under_review'| 'shortlisted'| 'interview'| 'offer'| 'hired'| 'rejected',
  notes?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/move-stage`, {
      applicationId,
      newStatus,
      notes
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Move stage error:', error);
    throw error.response?.data || { success: false, message: 'Failed to move application stage'};
  }
};

// Add internal note to application
export const addApplicationNote = async (
  applicationId: string,
  notes: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/notes`, {
      applicationId,
      notes
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Add note error:', error);
    throw error.response?.data || { success: false, message: 'Failed to add note'};
  }
};

// Assign application to team member
export const assignApplication = async (
  applicationId: string,
  assigneeId: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/assign`, {
      applicationId,
      assigneeId
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Assign application error:', error);
    throw error.response?.data || { success: false, message: 'Failed to assign application'};
  }
};

// Set reminder for application
export const setApplicationReminder = async (
  applicationId: string,
  reminderDate: string,
  message: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/reminders`, {
      applicationId,
      reminderDate,
      message
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Set reminder error:', error);
    throw error.response?.data || { success: false, message: 'Failed to set reminder'};
  }
};

// Export applications
export const exportApplications = async (
  format: 'csv'| 'excel',
  jobId?: string
): Promise<{ success: boolean; data: any[]; message: string }> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();
    queryParams.append('format', format);
    if (jobId) queryParams.append('jobId', jobId);

    const response = await axios.get(`${API_BASE_URL}/applications/recruiter/export?${queryParams.toString()}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Export applications error:', error);
    throw error.response?.data || { success: false, message: 'Failed to export applications'};
  }
};

// Get application sources breakdown
export const getApplicationSources = async (jobId?: string): Promise<{
  success: boolean;
  data: Array<{ source: string; count: number }>;
}> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();
    if (jobId) queryParams.append('jobId', jobId);

    const response = await axios.get(`${API_BASE_URL}/applications/recruiter/sources?${queryParams.toString()}`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Get sources error:', error);
    throw error.response?.data || { success: false, message: 'Failed to fetch application sources'};
  }
};

// Blacklist a candidate
export const blacklistCandidate = async (
  candidateId: string,
  reason: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/blacklist`, {
      candidateId,
      reason
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Blacklist candidate error:', error);
    throw error.response?.data || { success: false, message: 'Failed to blacklist candidate'};
  }
};

// Setup auto-reject rules
export const setupAutoRejectRules = async (
  jobId: string,
  rules: Array<{
    condition: string;
    value: any;
    rejectionReason: string;
  }>
): Promise<{ success: boolean; message: string }> => {
  try {
    const token = getAuthToken();
    const response = await axios.post(`${API_BASE_URL}/applications/recruiter/auto-reject`, {
      jobId,
      rules
    }, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error: any) {
    console.error('Setup auto-reject error:', error);
    throw error.response?.data || { success: false, message: 'Failed to setup auto-reject rules'};
  }
};

export default {
  submitApplication,
  getApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  withdrawApplication,
  getRejectionReason,
  getApplicationRequirements,
  applyWithProfile,
  uploadApplicationDocument,
  submitScreeningAnswers,
  scheduleSimulation,
  getApplicationHistory,
  getRecruiterFeed,
  bulkProcessApplications,
  moveApplicationStage,
  addApplicationNote,
  assignApplication,
  setApplicationReminder,
  exportApplications,
  getApplicationSources,
  blacklistCandidate,
  setupAutoRejectRules
};