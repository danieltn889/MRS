// API Service for Candidate Profile Management
// Handles all communication between frontend and backend for candidate profile operations

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Helper function for multipart/form-data requests (file uploads)
const getFormDataHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// Helper function to handle API responses
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.errors
      ? `Validation failed: ${errorData.errors.map((err: any) => `${err.path}: ${err.msg}`).join(', ')}`
      : errorData.message || `HTTP error! status: ${response.status}`;
    throw new Error(errorMessage);
  }
  return response.json();
};

// =====================================================
// PROFILE MANAGEMENT
// =====================================================

/**
 * Get candidate profile
 * @param {string} userId - Optional user ID to get specific profile
 * @returns {Promise<Object>} Profile data with all sections (education, experience, skills, portfolio, resumes)
 */
export const getCandidateProfile = async (userId?: string) => {
  try {
    const url = userId
      ? `${API_BASE_URL}/candidates/profile/${userId}`
      : `${API_BASE_URL}/candidates/profile`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting candidate profile:', error);
    throw error;
  }
};

/**
 * Update candidate profile (partial update)
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} Updated profile data
 */
export const updateCandidateProfile = async (profileData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(profileData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating candidate profile:', error);
    throw error;
  }
};

/**
 * Upload profile photo
 * @param {File} photoFile - Photo file to upload
 * @returns {Promise<Object>} Upload response with photo URL
 */
export const uploadProfilePhoto = async (photoFile: File) => {
  try {
    const formData = new FormData();
    formData.append('photo', photoFile);

    const response = await fetch(`${API_BASE_URL}/candidates/profile/photo`, {
      method: 'POST',
      headers: getFormDataHeaders(),
      body: formData,
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading profile photo:', error);
    throw error;
  }
};

/**
 * Delete the current profile photo
 * @returns {Promise<Object>} Result
 */
export const deleteProfilePhoto = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/profile/photo`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting profile photo:', error);
    throw error;
  }
};

export const uploadCandidateDocument = async (documentFile: File, documentType: string = 'candidate_document') => {
  try {
    const formData = new FormData();
    formData.append('document', documentFile);
    formData.append('documentType', documentType);

    const response = await fetch(`${API_BASE_URL}/candidates/documents`, {
      method: 'POST',
      headers: getFormDataHeaders(),
      body: formData,
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading candidate document:', error);
    throw error;
  }
};

/**
 * Fetch a side (front/back) of the candidate's identity document as a blob,
 * for previewing/opening a document already on file   see
 * GET /api/v1/candidates/documents/:documentId/file/:side.
 */
export const getIdentityDocumentFile = async (documentId: string, side: 'front'| 'back'): Promise<Blob> => {
  const response = await fetch(`${API_BASE_URL}/candidates/documents/${documentId}/file/${side}`, {
    method: 'GET',
    headers: getFormDataHeaders(),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  return await response.blob();
};

/**
 * Add or replace the candidate's identity document (National ID / passport).
 * Re-submitting resets verification_status to 'pending'for review.
 */
export const updateIdentityDocument = async (
  documentType: 'national_id'| 'passport',
  documentNumber: string,
  documentFront?: File | null,
  documentBack?: File | null
) => {
  try {
    const formData = new FormData();
    formData.append('documentType', documentType);
    formData.append('documentNumber', documentNumber);
    if (documentFront) formData.append('documentFront', documentFront);
    if (documentBack) formData.append('documentBack', documentBack);

    const response = await fetch(`${API_BASE_URL}/candidates/documents/identity`, {
      method: 'PUT',
      headers: getFormDataHeaders(),
      body: formData,
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating identity document:', error);
    throw error;
  }
};

/**
 * Complete profile (mark as complete)
 * @returns {Promise<Object>} Profile completion result
 */
export const completeProfile = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/complete-profile`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error completing profile:', error);
    throw error;
  }
};

/**
 * Get profile completion status
 * @returns {Promise<Object>} Profile completion status with percentages
 */
export const getProfileCompletionStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/profile-completion-status`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting profile completion status:', error);
    throw error;
  }
};

// =====================================================
// PREFERENCES & SETTINGS
// =====================================================

/**
 * Update job preferences
 * @param {Object} preferencesData - Job preferences data
 * @returns {Promise<Object>} Updated preferences
 */
export const updateJobPreferences = async (preferencesData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/preferences`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(preferencesData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating job preferences:', error);
    throw error;
  }
};

/**
 * Update availability status
 * @param {Object} availabilityData - Availability data (status, availableFrom, noticePeriod, openToOpportunities)
 * @returns {Promise<Object>} Updated availability
 */
export const updateAvailability = async (availabilityData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/availability`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(availabilityData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating availability:', error);
    throw error;
  }
};

/**
 * Update privacy settings
 * @param {Object} privacyData - Privacy settings data (profileVisibility, showContactInfo, etc.)
 * @returns {Promise<Object>} Updated privacy settings
 */
export const updatePrivacySettings = async (privacyData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/privacy`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(privacyData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating privacy settings:', error);
    throw error;
  }
};

// =====================================================
// EDUCATION MANAGEMENT
// =====================================================

/**
 * Add education entry
 * @param {Object} educationData - Education data
 * @returns {Promise<Object>} Created education entry
 */
export const addEducation = async (educationData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/education`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(educationData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding education:', error);
    throw error;
  }
};

/**
 * Update education entry
 * @param {string} id - Education entry ID
 * @param {Object} educationData - Updated education data
 * @returns {Promise<Object>} Updated education entry
 */
export const updateEducation = async (id: string, educationData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/education/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(educationData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating education:', error);
    throw error;
  }
};

/**
 * Delete education entry
 * @param {string} id - Education entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteEducation = async (id: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/education/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting education:', error);
    throw error;
  }
};

// =====================================================
// WORK EXPERIENCE MANAGEMENT
// =====================================================

/**
 * Add work experience entry
 * @param {Object} experienceData - Work experience data
 * @returns {Promise<Object>} Created work experience entry
 */
export const addWorkExperience = async (experienceData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/experience`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(experienceData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding work experience:', error);
    throw error;
  }
};

/**
 * Update work experience entry
 * @param {string} id - Work experience entry ID
 * @param {Object} experienceData - Updated work experience data
 * @returns {Promise<Object>} Updated work experience entry
 */
export const updateWorkExperience = async (id: string, experienceData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/experience/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(experienceData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating work experience:', error);
    throw error;
  }
};

/**
 * Delete work experience entry
 * @param {string} id - Work experience entry ID
 * @returns {Promise<Object>} Success response
 */
export const deleteWorkExperience = async (id: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/experience/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting work experience:', error);
    throw error;
  }
};

// =====================================================
// SKILLS MANAGEMENT
// =====================================================

/**
 * Get skills list for dropdowns
 * @param {Object} params - Query parameters (category, search, skillType, limit)
 * @returns {Promise<Array>} Skills list
 */
export const getSkillsList = async (params: any = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE_URL}/candidates/skills-list${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting skills list:', error);
    throw error;
  }
};

/**
 * Add skill to candidate profile
 * @param {Object} skillData - Skill data (skillId or skillName, proficiencyLevel, yearsExperience, isPrimary)
 * @returns {Promise<Object>} Created skill entry
 */
export const addSkill = async (skillData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/skills`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(skillData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding skill:', error);
    throw error;
  }
};

/**
 * Update candidate skill
 * @param {string} skillId - Skill ID
 * @param {Object} skillData - Updated skill data
 * @returns {Promise<Object>} Updated skill entry
 */
export const updateSkill = async (skillId: string, skillData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/skills/${skillId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(skillData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating skill:', error);
    throw error;
  }
};

/**
 * Delete skill from candidate profile
 * @param {string} skillId - Skill ID
 * @returns {Promise<Object>} Success response
 */
export const deleteSkill = async (skillId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/skills/${skillId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting skill:', error);
    throw error;
  }
};

// =====================================================
// PORTFOLIO LINKS MANAGEMENT
// =====================================================

/**
 * Add portfolio link
 * @param {Object} linkData - Portfolio link data
 * @returns {Promise<Object>} Created portfolio link
 */
export const addPortfolioLink = async (linkData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/portfolio`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(linkData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding portfolio link:', error);
    throw error;
  }
};

/**
 * Add multiple portfolio links at once
 * @param {Array} links - Array of portfolio link objects
 * @returns {Promise<Object>} Created portfolio links
 */
export const addPortfolioLinks = async (links: any[]) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/portfolio/batch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ links }),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding portfolio links batch:', error);
    throw error;
  }
};

/**
 * Update portfolio link
 * @param {string} id - Portfolio link ID
 * @param {Object} linkData - Updated link data
 * @returns {Promise<Object>} Updated portfolio link
 */
export const updatePortfolioLink = async (id: string, linkData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/portfolio/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(linkData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating portfolio link:', error);
    throw error;
  }
};

/**
 * Delete portfolio link
 * @param {string} id - Portfolio link ID
 * @returns {Promise<Object>} Success response
 */
export const deletePortfolioLink = async (id: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/portfolio/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting portfolio link:', error);
    throw error;
  }
};

// =====================================================
// RESUME MANAGEMENT
// =====================================================

/**
 * Upload resume
 * @param {File} resumeFile - Resume file (PDF or Word document)
 * @param {boolean} isPrimary - Whether this should be the primary resume
 * @returns {Promise<Object>} Upload response with file URL
 */
export const uploadResume = async (resumeFile: File, isPrimary: boolean = false, parsedData?: any) => {
  try {
    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('isPrimary', String(isPrimary));
    if (parsedData) {
      formData.append('parsedData', JSON.stringify(parsedData));
      if (parsedData.extractedText) {
        formData.append('extractedText', parsedData.extractedText);
      }
    }

    const response = await fetch(`${API_BASE_URL}/candidates/resume`, {
      method: 'POST',
      headers: getFormDataHeaders(),
      body: formData,
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading resume:', error);
    throw error;
  }
};

/**
 * Download resume
 * @param {string} id - Resume ID
 * @returns {Promise<Blob>} Resume file blob
 */
export const downloadResume = async (id: string): Promise<Blob> => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/resume/${id}/download`, {
      method: 'GET',
      headers: getFormDataHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.blob();
  } catch (error: any) {
    console.error('Error downloading resume:', error);
    throw error;
  }
};

/**
 * Delete resume
 * @param {string} id - Resume ID
 * @returns {Promise<Object>} Success response
 */
export const deleteResume = async (id: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/resume/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting resume:', error);
    throw error;
  }
};

/**
 * Set primary resume
 * @param {string} id - Resume ID
 * @returns {Promise<Object>} Success response
 */
export const setPrimaryResume = async (id: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/resume/${id}/primary`, {
      method: 'PUT',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error setting primary resume:', error);
    throw error;
  }
};

// =====================================================
// DATA EXPORT
// =====================================================

/**
 * Download complete profile data as JSON
 * @returns {Promise<Object>} Complete profile data
 */
export const downloadProfileData = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/export`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error downloading profile data:', error);
    throw error;
  }
};

// =====================================================
// SEARCH CANDIDATES (For Recruiters)
// =====================================================

/**
 * Search candidates (recruiter only)
 * @param {Object} params - Search parameters (q, location, skills, minSalary, maxSalary, availability, page, limit)
 * @returns {Promise<Object>} Search results with pagination
 */
export const searchCandidates = async (params: any = {}) => {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/candidates/search?${queryString}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error searching candidates:', error);
    throw error;
  }
};

// =====================================================
// LEGACY/COMPATIBILITY FUNCTIONS
// =====================================================

/**
 * Set availability status (legacy)
 * @param {Object} availabilityData - Availability data
 * @returns {Promise<Object>} Response
 */
export const setAvailabilityStatus = async (availabilityData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/profile/availability`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(availabilityData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error setting availability status:', error);
    throw error;
  }
};

/**
 * Control profile privacy (legacy)
 * @param {Object} privacyData - Privacy settings
 * @returns {Promise<Object>} Response
 */
export const controlProfilePrivacy = async (privacyData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/candidates/profile/privacy`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(privacyData),
    });

    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error controlling profile privacy:', error);
    throw error;
  }
};

// =====================================================
// EXPORT ALL FUNCTIONS
// =====================================================

export default {
  // Profile management
  getCandidateProfile,
  updateCandidateProfile,
  uploadProfilePhoto,
  uploadCandidateDocument,
  updateIdentityDocument,
  getIdentityDocumentFile,
  completeProfile,
  getProfileCompletionStatus,
  
  // Preferences & settings
  updateJobPreferences,
  updateAvailability,
  updatePrivacySettings,
  
  // Education
  addEducation,
  updateEducation,
  deleteEducation,
  
  // Work experience
  addWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  
  // Skills
  getSkillsList,
  addSkill,
  updateSkill,
  deleteSkill,
  
  // Portfolio links
  addPortfolioLink,
  addPortfolioLinks,
  updatePortfolioLink,
  deletePortfolioLink,
  
  // Resumes
  uploadResume,
  downloadResume,
  deleteResume,
  setPrimaryResume,
  
  // Data export
  downloadProfileData,
  
  // Search
  searchCandidates,
  
  // Legacy
  setAvailabilityStatus,
  controlProfilePrivacy,
};
