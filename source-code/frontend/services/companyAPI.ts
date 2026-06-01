// API Service for Company Profile Management
// Handles all communication between frontend and backend for company operations

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

// In your companyAPI.ts
const handleResponse = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    // Log the full error response
    console.error('API Error Response:', {
      status: response.status,
      statusText: response.statusText,
      data: data
    });
    
    // Show validation errors if present
    if (data.errors && Array.isArray(data.errors)) {
      const errorMessages = data.errors.map((err: any) => 
        `${err.param || err.path || 'field'}: ${err.msg}`
      ).join(', ');
      throw new Error(`Validation failed: ${errorMessages}`);
    }
    
    throw new Error(data.message || `HTTP error! status: ${response.status}`);
  }
  return data;
};

// Helper function to clean profile data before sending
const cleanProfileData = (profileData: any) => {
  const cleaned: any = { ...profileData };
  
  // Convert empty strings to null for optional fields
  if (cleaned.legalName === '') {
    cleaned.legalName = null;
  }
  if (cleaned.foundedYear === '') {
    cleaned.foundedYear = null;
  } else if (cleaned.foundedYear && typeof cleaned.foundedYear === 'string') {
    cleaned.foundedYear = parseInt(cleaned.foundedYear, 10);
  }
  if (cleaned.shortDescription === '') {
    cleaned.shortDescription = null;
  }
  if (cleaned.mission === '') {
    cleaned.mission = null;
  }
  if (cleaned.vision === '') {
    cleaned.vision = null;
  }
  if (cleaned.website === '') {
    cleaned.website = null;
  }
  
  // Remove undefined values so they don't overwrite existing data
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });
  
  return cleaned;
};

// Helper function to clean location data
const cleanLocationData = (locationData: any) => {
  const cleaned: any = { ...locationData };
  
  // Convert empty strings to undefined/null
  if (cleaned.latitude === '') {
    delete cleaned.latitude;
  } else if (cleaned.latitude && typeof cleaned.latitude === 'string') {
    cleaned.latitude = parseFloat(cleaned.latitude);
  }
  
  if (cleaned.longitude === '') {
    delete cleaned.longitude;
  } else if (cleaned.longitude && typeof cleaned.longitude === 'string') {
    cleaned.longitude = parseFloat(cleaned.longitude);
  }
  
  if (cleaned.employeeCount === '') {
    delete cleaned.employeeCount;
  } else if (cleaned.employeeCount && typeof cleaned.employeeCount === 'string') {
    cleaned.employeeCount = parseInt(cleaned.employeeCount, 10);
  }
  
  // Remove undefined values
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined || cleaned[key] === '') {
      delete cleaned[key];
    }
  });
  
  return cleaned;
};

/**
 * Get company profile
 * @returns {Promise<Object>} Company profile data
 */
export const getCompanyProfile = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/profile`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting company profile:', error);
    throw error;
  }
};

/**
 * Update company profile
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<Object>} Updated profile data
 */
export const updateCompanyProfile = async (profileData: any) => {
  try {
    // Clean the data before sending
    const cleanedData = cleanProfileData(profileData);
    
    console.log('📤 Sending cleaned profile data:', cleanedData); // Debug log
    
    const response = await fetch(`${API_BASE_URL}/companies/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(cleanedData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating company profile:', error);
    throw error;
  }
};

export const uploadCompanyLogo = async (logoFile: File) => {
  try {
    const formData = new FormData();
    formData.append('logo', logoFile);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/companies/profile/logo`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: formData,
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading company logo:', error);
    throw error;
  }
};

export const uploadCompanyBanner = async (bannerFile: File) => {
  try {
    const formData = new FormData();
    formData.append('banner', bannerFile);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/companies/profile/banner`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: formData,
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading company banner:', error);
    throw error;
  }
};

// ✅ CORRECTED: Add company location with proper coordinate handling
export const addCompanyLocation = async (locationData: any) => {
  try {
    // Clean the location data before sending
    const cleanedData = cleanLocationData(locationData);
    
    console.log('📍 Sending location data:', cleanedData); // Debug log
    
    const response = await fetch(`${API_BASE_URL}/companies/locations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(cleanedData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding company location:', error);
    throw error;
  }
};

// ✅ CORRECTED: Update company location with proper coordinate handling
export const updateCompanyLocation = async (locationId: string, locationData: any) => {
  try {
    // Clean the location data before sending
    const cleanedData = cleanLocationData(locationData);
    
    console.log('📍 Updating location:', { id: locationId, data: cleanedData }); // Debug log
    
    const response = await fetch(`${API_BASE_URL}/companies/locations/${locationId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(cleanedData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating company location:', error);
    throw error;
  }
};

export const deleteCompanyLocation = async (locationId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/locations/${locationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting company location:', error);
    throw error;
  }
};

export const getCompanyLocations = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/locations`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const result = await handleResponse(response);
    
    // ✅ Map snake_case from database to camelCase for frontend
    if (result.data && Array.isArray(result.data)) {
      result.data = result.data.map((location: any) => ({
        id: location.id,
        name: location.name,
        type: location.type,
        addressLine1: location.address_line1 || '',
        addressLine2: location.address_line2 || '',
        city: location.city || '',
        state: location.state || '',
        postalCode: location.postal_code || '',
        country: location.country || '',
        latitude: location.latitude,
        longitude: location.longitude,
        location: location.location,
        phone: location.phone || '',
        email: location.email || '',
        hours: location.hours || {},
        amenities: location.amenities || [],
        isHiring: location.is_hiring === true,
        employeeCount: location.employee_count,
        createdAt: location.created_at,
        updatedAt: location.updated_at
      }));
    }
    
    return result;
  } catch (error: any) {
    console.error('Error getting company locations:', error);
    throw error;
  }
};

export const updateCompanyCulture = async (cultureData: any) => {
  try {
    const payload = {
      attributes: cultureData.attributes || {},  // Must be object, not array
      values: cultureData.values || [],
      description: cultureData.description || '',
      workEnvironment: cultureData.workEnvironment || '',
      teamDynamics: cultureData.teamDynamics || '',
      communicationStyle: cultureData.communicationStyle || '',
      decisionMaking: cultureData.decisionMaking || '',
      workLifeBalance: cultureData.workLifeBalance || '',
      diversityInclusion: cultureData.diversityInclusion || '',
      employeeTestimonials: cultureData.employeeTestimonials || [],
    };

    console.log('📤 Sending to backend:', payload);

    const response = await fetch(`${API_BASE_URL}/companies/culture`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    
    console.log('📥 Response status:', response.status);
    
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating company culture:', error);
    throw error;
  }
};

export const getCompanyCulture = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/culture`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const result = await handleResponse(response);
    
    // Ensure attributes is an object
    if (result.data && (!result.data.attributes || Array.isArray(result.data.attributes))) {
      result.data.attributes = {
        collaborative: 0,
        innovative: 0,
        structured: 0,
        fast_paced: 0,
        employee_focused: 0,
        customer_focused: 0,
        results_driven: 0,
        learning_oriented: 0
      };
    }
    
    return result;
  } catch (error: any) {
    console.error('Error getting company culture:', error);
    throw error;
  }
};

export const addTeamMember = async (memberData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/team`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(memberData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding team member:', error);
    throw error;
  }
};

export const updateTeamMember = async (memberId: string, memberData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/team/${memberId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(memberData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating team member:', error);
    throw error;
  }
};

export const deleteTeamMember = async (memberId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/team/${memberId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting team member:', error);
    throw error;
  }
};

export const getCompanyTeam = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/team`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting company team:', error);
    throw error;
  }
};

export const uploadTeamMemberPhoto = async (memberId: string, photoFile: File) => {
  try {
    const formData = new FormData();
    formData.append('photo', photoFile);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/companies/team/${memberId}/photo`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: formData,
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading team member photo:', error);
    throw error;
  }
};

export const getCompanyProjects = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/projects`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error getting company projects:', error);
    throw error;
  }
};

export const addCompanyProject = async (projectData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/projects`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(projectData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error adding company project:', error);
    throw error;
  }
};

export const updateCompanyProject = async (projectId: string, projectData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/projects/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(projectData),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error updating company project:', error);
    throw error;
  }
};

export const deleteCompanyProject = async (projectId: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/projects/${projectId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting company project:', error);
    throw error;
  }
};

export const uploadProjectMedia = async (projectId: string, mediaFile: File) => {
  try {
    const formData = new FormData();
    formData.append('media', mediaFile);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/companies/projects/${projectId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: formData,
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error uploading project media:', error);
    throw error;
  }
};

export const deleteProjectMedia = async (projectId: string, mediaKey: string) => {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/companies/projects/${projectId}/media/${mediaKey}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      },
    });
    return await handleResponse(response);
  } catch (error: any) {
    console.error('Error deleting project media:', error);
    throw error;
  }
};