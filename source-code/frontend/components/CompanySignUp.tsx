import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, Mail, Loader, Building, User, Globe } from 'lucide-react';
import { checkEmailExists, registerCompanyComplete, resendVerificationEmail } from '../services/authAPI';

/**
 * CompanySignUp Component - Complete company registration with admin account creation
 * Includes company information collection, admin details, domain verification, and error handling
 */
const CompanySignUp = ({ onSignupSuccess }) => {
  // Form state
  const [formData, setFormData] = useState({
    // Company information
    companyName: '',
    industry: '',
    size: '',
    website: '',
    domain: '',
    // Admin information
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    passwordConfirm: '',
    phone: '',
    agreeTerms: false,
  });

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showRateLimitError, setShowRateLimitError] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [successState, setSuccessState] = useState(null);
  const [showEmailSendError, setShowEmailSendError] = useState(false);

  // Industry options
  const industryOptions = [
    'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
    'Retail', 'Consulting', 'Media', 'Real Estate', 'Transportation',
    'Energy', 'Agriculture', 'Government', 'Non-profit', 'Other'
  ];

  // Company size options
  const sizeOptions = [
    '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'
  ];

  // Password strength validation
  const validatePasswordStrength = useCallback((password) => {
    let strength = 0;
    const requirements = {
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      hasMinLength: password.length >= 8,
    };

    Object.values(requirements).forEach((met) => {
      if (met) strength += 20;
    });

    return { strength, requirements };
  }, []);

  // Email validation
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
    return emailRegex.test(email) && email.length <= 254;
  };

  // Domain validation
  const isValidDomain = (domain) => {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  };

  // Handle input changes with real-time validation
  const handleInputChange = async (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    const newFormData = { ...formData, [name]: newValue };
    setFormData(newFormData);

    const newErrors = { ...errors };

    // Real-time validation
    if (name === 'email') {
      if (!value) {
        newErrors.email = '';
      } else if (!isValidEmail(value)) {
        newErrors.email = 'Please enter a valid email address (e.g., name@example.com)';
      } else {
        // Check if email already exists
        try {
          const { exists } = await checkEmailExists(value);
          if (exists) {
            newErrors.email = 'This email is already registered. Try logging in or use a different email.';
          } else {
            delete newErrors.email;
          }
        } catch (error) {
          console.error('Error checking email:', error);
          // Don't block on error, let server validate
          delete newErrors.email;
        }
      }
    }

    if (name === 'domain') {
      if (!value) {
        newErrors.domain = '';
      } else if (!isValidDomain(value)) {
        newErrors.domain = 'Please enter a valid domain (e.g., company.com)';
      } else {
        delete newErrors.domain;
      }
    }

    if (name === 'password') {
      const { strength, requirements } = validatePasswordStrength(value);
      setPasswordStrength(strength);

      if (!value) {
        newErrors.password = '';
      } else if (!requirements.hasMinLength) {
        newErrors.password = 'Password must be at least 8 characters';
      } else if (
        !requirements.hasUppercase ||
        !requirements.hasLowercase ||
        !requirements.hasNumber ||
        !requirements.hasSpecial
      ) {
        newErrors.password = 'Password must include uppercase, lowercase, number, and special character';
      } else {
        delete newErrors.password;
      }
    }

    if (name === 'passwordConfirm') {
      if (value !== newFormData.password) {
        newErrors.passwordConfirm = 'Passwords do not match';
      } else {
        delete newErrors.passwordConfirm;
      }
    }

    if (name === 'companyName') {
      if (!value.trim()) {
        newErrors.companyName = 'Company name is required';
      } else if (value.length < 2) {
        newErrors.companyName = 'Company name must be at least 2 characters';
      } else {
        delete newErrors.companyName;
      }
    }

    setErrors(newErrors);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate domain-email match
    const emailDomain = formData.email.split('@')[1];
    if (emailDomain !== formData.domain) {
      setErrors(prev => ({
        ...prev,
        email: 'Admin email domain must match company domain'
      }));
      return;
    }

    // Validate all required fields
    const requiredFields = ['companyName', 'domain', 'firstName', 'lastName', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !formData[field].trim());

    if (missingFields.length > 0) {
      setErrors(prev => ({
        ...prev,
        general: 'Please fill in all required fields'
      }));
      return;
    }

    if (!formData.agreeTerms) {
      setErrors(prev => ({
        ...prev,
        agreeTerms: 'You must agree to the Terms & Conditions'
      }));
      return;
    }

    // Validate password strength
    const { strength } = validatePasswordStrength(formData.password);
    if (strength < 80) {
      setErrors(prev => ({
        ...prev,
        password: 'Password is too weak. Please choose a stronger password.'
      }));
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setErrors({});

    try {
      const payload = {
        companyName: formData.companyName.trim(),
        domain: formData.domain.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password
      };

      // Only include optional fields if they have values
      if (formData.industry) payload.industry = formData.industry;
      if (formData.size) payload.size = formData.size;
      if (formData.website.trim()) payload.website = formData.website.trim();
      if (formData.phone.trim()) payload.phone = formData.phone.trim();

      const result = await registerCompanyComplete(payload);

      setSuccessState(result);
      if (onSignupSuccess) {
        onSignupSuccess(result);
      }
    } catch (error) {
      console.error('Registration error:', error);

      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';

      if (error.response?.status === 429) {
        setShowRateLimitError(true);
        setRetryCountdown(60);
        const timer = setInterval(() => {
          setRetryCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              setShowRateLimitError(false);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (error.response?.data?.code === 'EMAIL_EXISTS') {
        setErrors(prev => ({ ...prev, email: 'This email is already registered' }));
      } else if (error.response?.data?.code === 'DOMAIN_EXISTS') {
        setErrors(prev => ({ ...prev, domain: 'A company with this domain already exists' }));
      } else if (error.response?.data?.code === 'DOMAIN_MISMATCH') {
        setErrors(prev => ({ ...prev, email: 'Admin email domain must match company domain' }));
      } else if (error.response?.data?.code === 'INVALID_PASSWORD') {
        setErrors(prev => ({ ...prev, password: error.response.data.message }));
      } else {
        setSubmitError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get password strength label and color
  const getPasswordStrengthInfo = () => {
    if (passwordStrength === 0) return { label: '', color: '' };
    if (passwordStrength <= 40) return { label: 'Weak', color: 'bg-red-500' };
    if (passwordStrength <= 60) return { label: 'Fair', color: 'bg-yellow-500' };
    if (passwordStrength <= 80) return { label: 'Good', color: 'bg-blue-500' };
    return { label: 'Strong', color: 'bg-green-500' };
  };

  const { label: strengthLabel, color: strengthColor } = getPasswordStrengthInfo();

  if (successState) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h2 className="mt-6 text-2xl font-bold text-gray-900">
                Company Registration Successful!
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Your company <strong>{successState.data.company.name}</strong> has been registered.
              </p>
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <div className="flex">
                  <Mail className="h-5 w-5 text-blue-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      Check Your Email
                    </h3>
                    <p className="mt-1 text-sm text-blue-700">
                      We've sent a verification email to <strong>{successState.data.user.email}</strong>.
                      Please click the link in the email to activate your account.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6 text-sm text-gray-500">
                <p>Next steps:</p>
                <ol className="mt-2 list-decimal list-inside text-left">
                  <li>Verify your email address</li>
                  <li>Complete domain verification</li>
                  <li>Set up your company profile</li>
                  <li>Start posting jobs</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center mb-8">
            <Building className="mx-auto h-12 w-12 text-blue-600" />
            <h2 className="mt-6 text-3xl font-bold text-gray-900">
              Register Your Company
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Create your company account and admin profile
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Company Information Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Company Information
              </h3>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                    Company Name *
                  </label>
                  <input
                    id="companyName"
                    name="companyName"
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                      errors.companyName ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="Enter company name"
                  />
                  {errors.companyName && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.companyName}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="industry" className="block text-sm font-medium text-gray-700">
                    Industry
                  </label>
                  <select
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select industry</option>
                    {industryOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="size" className="block text-sm font-medium text-gray-700">
                    Company Size
                  </label>
                  <select
                    id="size"
                    name="size"
                    value={formData.size}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select company size</option>
                    {sizeOptions.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                    Website
                  </label>
                  <input
                    id="website"
                    name="website"
                    type="url"
                    value={formData.website}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://www.company.com"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="domain" className="block text-sm font-medium text-gray-700">
                    Company Domain *
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="domain"
                      name="domain"
                      type="text"
                      required
                      value={formData.domain}
                      onChange={handleInputChange}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                        errors.domain ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="company.com"
                    />
                  </div>
                  {errors.domain && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.domain}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-500">
                    This domain will be used for email verification and must match your admin email domain.
                  </p>
                </div>
              </div>
            </div>

            {/* Admin Information Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2" />
                Admin Account Information
              </h3>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    First Name *
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Last Name *
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Doe"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Admin Email *
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className={`block w-full pl-10 pr-3 py-2 border rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                        errors.email ? 'border-red-300' : 'border-gray-300'
                      }`}
                      placeholder="admin@company.com"
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.email}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-500">
                    Must be from the company domain ({formData.domain || 'domain above'}).
                  </p>
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>
            </div>

            {/* Password Section */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password *
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`block w-full pr-10 px-3 py-2 border rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.password ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>

              {/* Password Strength Meter */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Password strength:</span>
                    <span className={`font-medium ${
                      strengthLabel === 'Weak' ? 'text-red-600' :
                      strengthLabel === 'Fair' ? 'text-yellow-600' :
                      strengthLabel === 'Good' ? 'text-blue-600' : 'text-green-600'
                    }`}>
                      {strengthLabel}
                    </span>
                  </div>
                  <div className="mt-1 h-2 bg-gray-200 rounded-full">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${strengthColor}`}
                      style={{ width: `${passwordStrength}%` }}
                    ></div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Must include: 8+ characters, uppercase, lowercase, number, special character
                  </div>
                </div>
              )}

              {errors.password && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.password}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700">
                Confirm Password *
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <input
                  id="passwordConfirm"
                  name="passwordConfirm"
                  type={showPasswordConfirm ? 'text' : 'password'}
                  required
                  value={formData.passwordConfirm}
                  onChange={handleInputChange}
                  className={`block w-full pr-10 px-3 py-2 border rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.passwordConfirm ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                >
                  {showPasswordConfirm ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 mr-1" />
                  )}
                </button>
              </div>
              {errors.passwordConfirm && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.passwordConfirm}
                </p>
              )}
            </div>

            {/* Terms and Conditions */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="agreeTerms"
                  name="agreeTerms"
                  type="checkbox"
                  checked={formData.agreeTerms}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="agreeTerms" className="text-gray-700">
                  I agree to the{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-500">
                    Terms & Conditions
                  </a>{' '}
                  and{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-500">
                    Privacy Policy
                  </a>
                </label>
                {errors.agreeTerms && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {errors.agreeTerms}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Error */}
            {submitError && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Registration Failed
                    </h3>
                    <p className="mt-1 text-sm text-red-700">
                      {submitError}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Rate Limit Error */}
            {showRateLimitError && (
              <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-yellow-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      Too Many Attempts
                    </h3>
                    <p className="mt-1 text-sm text-yellow-700">
                      Please wait {retryCountdown} seconds before trying again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader className="animate-spin -ml-1 mr-3 h-5 w-5" />
                    Creating Company Account...
                  </>
                ) : (
                  'Register Company'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompanySignUp;