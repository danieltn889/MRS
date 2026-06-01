// API Service for Authentication
// Handles all communication between frontend and backend for auth operations

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// ============================================
// TYPES / INTERFACES
// ============================================

interface LoginHistoryFilters {
  dateRange?: '7days' | '30days' | '90days' | 'all' | 'custom';
  status?: 'success' | 'failed' | 'all';
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

interface LoginHistoryResponse {
  success: boolean;
  data: {
    history: Array<any>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    filters: LoginHistoryFilters;
  };
}

// ============================================
// AUTH API FUNCTIONS
// ============================================

/**
 * Check if email is already registered
 * @param {string} email - Email to check
 * @returns {Promise<{exists: boolean, message: string}>}
 */
export const checkEmailExists = async (email: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/check-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      exists: data.exists || false,
      message: data.message || '',
    };
  } catch (error: any) {
    console.error('Error checking email:', error);
    throw new Error('Failed to check email availability');
  }
};

/**
 * Register a new candidate
 * @param {Object} payload - Registration data
 * @param {string} payload.email - User email
 * @param {string} payload.password - User password
 * @param {string} payload.firstName - First name
 * @param {string} payload.lastName - Last name
 * @returns {Promise<{success: boolean, message: string, userId?: string, verificationEmailSent?: boolean}>}
 */
export const registerCandidate = async (payload: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        firstName: payload.firstName,
        lastName: payload.lastName,
        userType: 'candidate',
        companyId: null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    return {
      success: true,
      message: data.message || 'Account created successfully',
      userId: data.userId,
      verificationEmailSent: true,
    };
  } catch (error: any) {
    console.error('Error during registration:', error);
    throw new Error(error?.message || 'Failed to create account');
  }
};

/**
 * Resend verification email
 * @param {string} email - Email to send verification to
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const resendVerificationEmail = async (email: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-email/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to resend email');
    }

    return {
      success: true,
      message: data.message || 'Verification email sent',
    };
  } catch (error: any) {
    console.error('Error resending verification email:', error);
    throw new Error(error?.message || 'Failed to resend verification email');
  }
};

/**
 * Verify email with token
 * @param {string} token - Verification token
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const verifyEmail = async (token: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Email verification failed');
    }

    return {
      success: true,
      message: data.message || 'Email verified successfully',
    };
  } catch (error: any) {
    console.error('Error verifying email:', error);
    throw new Error(error?.message || 'Failed to verify email');
  }
};

/**
 * Login user with email and password
 * @param {Object} payload - Login data
 * @param {string} payload.email - User email
 * @param {string} payload.password - User password
 * @param {boolean} payload.rememberMe - Remember me for 30 days
 * @returns {Promise<{success: boolean, user: Object, token: string, message: string}>}
 */
export const loginUser = async (payload: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        rememberMe: payload.rememberMe || false,
      }),
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const error = new Error(response.statusText || 'Login failed') as any;
      error.statusCode = response.status;
      if (response.status === 429) {
        error.code = 'RATE_LIMIT_EXCEEDED';
      }
      throw error;
    }

    if (!response.ok) {
      const error = new Error(data.message || 'Login failed') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.attemptsRemaining = data.attemptsRemaining;
      error.minutesRemaining = data.minutesRemaining;
      if (response.status === 429) {
        error.code = 'RATE_LIMIT_EXCEEDED';
      }
      throw error;
    }

    if (data.data?.token) {
      localStorage.setItem('authToken', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
      if (payload.rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
    }

    return {
      success: true,
      user: data.data?.user || {},
      token: data.data?.token || '',
      message: data.message || 'Login successful',
    };
  } catch (error: any) {
    console.error('Error during login:', error);
    const newError = new Error(error?.message || 'Failed to login') as any;
    newError.code = error?.code;
    newError.statusCode = error?.statusCode;
    newError.attemptsRemaining = error?.attemptsRemaining;
    newError.minutesRemaining = error?.minutesRemaining;
    throw newError;
  }
};

/**
 * Logout user
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const logoutUser = async () => {
  try {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Logout failed');
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');

    return {
      success: true,
      message: 'Logged out successfully',
    };
  } catch (error: any) {
    console.error('Error during logout:', error);
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('rememberMe');
    throw new Error(error?.message || 'Failed to logout');
  }
};

/**
 * Update user profile
 * @param {Object} profileData - Profile data to update
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const updateProfile = async (profileData: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
}) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(profileData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Profile update failed');
    }

    return {
      success: true,
      message: data.message || 'Profile updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating profile:', error);
    throw new Error(error?.message || 'Failed to update profile');
  }
};

/**
 * Request password reset email
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const forgotPassword = async (email: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to request password reset') as any;
      error.code = data.code;
      error.statusCode = response.status;
      throw error;
    }

    return {
      success: true,
      message: data.message || 'Password reset email sent',
    };
  } catch (error: any) {
    console.error('Error requesting password reset:', error);
    throw error;
  }
};

/**
 * Validate reset token
 * @param {string} token - Reset token from URL
 * @returns {Promise<{valid: boolean, email?: string}>}
 */
export const validateResetToken = async (token: string) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate-reset-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        valid: false,
        message: data.message || 'Invalid or expired token',
      };
    }

    return {
      valid: true,
      message: data.message,
      email: data.email,
    };
  } catch (error) {
    console.error('Error validating reset token:', error);
    return {
      valid: false,
      message: 'Failed to validate token',
    };
  }
};

/**
 * Reset password with token
 * @param {Object} payload - Reset data
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const resetPassword = async (payload: { token: string; password: string }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: payload.token,
        password: payload.password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Password reset failed') as any;
      error.code = data.code;
      error.statusCode = response.status;
      throw error;
    }

    return {
      success: true,
      message: data.message || 'Password reset successfully',
    };
  } catch (error: any) {
    console.error('Error resetting password:', error);
    throw error;
  }
};

/**
 * Log out from all devices
 * @param {string} password - Current password for verification
 * @returns {Promise<{success: boolean, message: string, terminatedCount?: number}>}
 */
export const logoutAllDevices = async (password: string) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}/auth/logout-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to logout from all devices');
    }

    return {
      success: true,
      message: data.message || 'Logged out from all devices successfully',
      terminatedCount: data.terminatedCount || 0,
    };
  } catch (error: any) {
    console.error('Error logging out from all devices:', error);
    throw error;
  }
};

/**
 * Get active sessions for current user
 * @returns {Promise<{success: boolean, sessions: Array, total: number}>}
 */
export const getActiveSessions = async () => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}/auth/sessions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve active sessions');
    }

    return {
      success: true,
      sessions: data.sessions || [],
      total: data.total || 0,
    };
  } catch (error: any) {
    console.error('Error getting active sessions:', error);
    throw error;
  }
};

/**
 * Get login history for current user
 * @param {LoginHistoryFilters} filters - Filter options
 * @returns {Promise<LoginHistoryResponse>}
 */
export const getLoginHistory = async (filters: LoginHistoryFilters = {}): Promise<LoginHistoryResponse> => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const params = new URLSearchParams();
    
    // ✅ Fixed: Now using optional chaining with proper type checking
    if (filters.dateRange) params.append('dateRange', filters.dateRange);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await fetch(`${API_BASE_URL}/auth/login-history?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to retrieve login history');
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    console.error('Error getting login history:', error);
    throw error;
  }
};

/**
 * Export login history to CSV
 * @param {LoginHistoryFilters} filters - Filter options (same as getLoginHistory)
 * @returns {Promise<Blob>} CSV file blob
 */
export const exportLoginHistory = async (filters: LoginHistoryFilters = {}): Promise<Blob> => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token found');
    }

    const params = new URLSearchParams();
    
    // ✅ Fixed: Now using optional chaining with proper type checking
    if (filters.dateRange) params.append('dateRange', filters.dateRange);
    if (filters.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);

    const response = await fetch(`${API_BASE_URL}/auth/login-history/export?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Failed to export login history');
    }

    return await response.blob();
  } catch (error: any) {
    console.error('Error exporting login history:', error);
    throw error;
  }
};

/**
 * Register a new company with admin account creation
 * @param {Object} payload - Company registration data
 * @returns {Promise<{success: boolean, data: Object, message: string, code: string}>}
 */
export const registerCompanyComplete = async (payload: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/company/register-complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Company registration failed') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error during company registration:', error);
    throw error;
  }
};

/**
 * Check password strength
 * @param {string} password - Password to check
 * @returns { strength: 'weak'|'fair'|'good'|'strong', score: number, requirements: Object }
 */
export const checkPasswordStrength = (password: string) => {
  const requirements = {
    length: password.length >= 8 && password.length <= 72,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
  };

  const metRequirements = Object.values(requirements).filter(Boolean).length;
  let strength = 'weak';
  let score = 0;

  if (metRequirements === 1) {
    strength = 'weak';
    score = 25;
  } else if (metRequirements === 2) {
    strength = 'fair';
    score = 50;
  } else if (metRequirements === 3 || metRequirements === 4) {
    strength = 'good';
    score = 75;
  } else if (metRequirements === 5) {
    strength = 'strong';
    score = 100;
  }

  return {
    strength,
    score,
    requirements,
    isValid: requirements.length && requirements.hasUppercase && requirements.hasLowercase && requirements.hasNumber && requirements.hasSpecialChar,
  };
};

/**
 * Invite team members to company
 * @param {Object} payload - Invitation data
 * @returns {Promise<{success: boolean, message: string, data: {sent: Object[], errors: Object[]}}>}
 */
export const inviteTeamMembers = async (payload: {
  emails: string[];
  role: string;
  personalMessage?: string;
  firstName?: string;
  lastName?: string;
}) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/company/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to send invitations') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error inviting team members:', error);
    throw error;
  }
};

/**
 * Accept team invitation
 * @param {Object} payload - Acceptance data
 * @returns {Promise<{success: boolean, message: string, data: Object}>}
 */
export const acceptTeamInvitation = async (payload: {
  token: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/team/accept-invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to accept invitation') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error accepting team invitation:', error);
    throw error;
  }
};

/**
 * Get team invitations for company
 * @returns {Promise<{success: boolean, data: Object[]}>}
 */
export const getTeamInvitations = async () => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/team/invitations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to fetch invitations') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error fetching team invitations:', error);
    throw error;
  }
};

/**
 * Resend team invitation
 * @param {string} invitationId - ID of the invitation to resend
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const resendTeamInvitation = async (invitationId: string) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/team/resend-invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ invitationId }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to resend invitation') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error resending team invitation:', error);
    throw error;
  }
};

/**
 * Revoke team invitation
 * @param {string} invitationId - ID of the invitation to revoke
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const revokeTeamInvitation = async (invitationId: string) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/team/revoke-invitation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ invitationId }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to revoke invitation') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error revoking team invitation:', error);
    throw error;
  }
};

/**
 * Get company team members
 * @returns {Promise<{success: boolean, data: {company: Object, userRole: string, members: Object[]}}>}
 */
export const getTeamMembers = async () => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/team/members`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to fetch team members') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error fetching team members:', error);
    throw error;
  }
};

/**
 * Update team member role
 * @param {string} memberId - ID of the team member
 * @param {string} newRole - New role (admin, recruiter, reviewer, viewer)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const updateTeamMemberRole = async (memberId: string, newRole: string) => {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(`${API_BASE_URL}/auth/team/update-role`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ memberId, newRole }),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Failed to update team member role') as any;
      error.code = data.code;
      error.statusCode = response.status;
      error.response = data;
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error updating team member role:', error);
    throw error;
  }
};