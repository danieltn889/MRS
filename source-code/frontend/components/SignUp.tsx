import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, Mail, Loader } from 'lucide-react';
import { checkEmailExists, registerCandidate, resendVerificationEmail } from '../services/authAPI';

interface SuccessState {
  email: string;
  message: string;
  accountCreated?: boolean;
}

/**
 * SignUp Component - Candidate registration with email and password
 * Includes real-time validation, password strength meter, and error handling
 */
const SignUp = ({ onSignupSuccess }) => {
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    firstName: '',
    lastName: '',
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
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [showEmailSendError, setShowEmailSendError] = useState(false);

  // Password strength validation
  const validatePasswordStrength = useCallback((password) => {
    let strength = 0;
    const requirements = {
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*]/.test(password),
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
        newErrors.password =
          'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
      } else {
        delete newErrors.password;
      }

      // Check password confirmation match
      if (newFormData.passwordConfirm && value !== newFormData.passwordConfirm) {
        newErrors.passwordConfirm = 'Passwords do not match';
      } else if (newFormData.passwordConfirm && value === newFormData.passwordConfirm) {
        delete newErrors.passwordConfirm;
      }
    }

    if (name === 'passwordConfirm') {
      if (!value) {
        newErrors.passwordConfirm = '';
      } else if (value !== newFormData.password) {
        newErrors.passwordConfirm = 'Passwords do not match';
      } else {
        delete newErrors.passwordConfirm;
      }
    }

    if (name === 'agreeTerms') {
      if (!checked) {
        newErrors.agreeTerms = 'You must accept the Terms & Conditions to continue';
      } else {
        delete newErrors.agreeTerms;
      }
    }

    setErrors(newErrors);
  };

  // Get password strength color and label
  const getPasswordStrengthDisplay = () => {
    if (passwordStrength === 0) return { color: 'bg-gray-300', label: '', width: '0%' };
    if (passwordStrength <= 40) return { color: 'bg-red-500', label: 'Weak', width: '25%' };
    if (passwordStrength <= 60) return { color: 'bg-yellow-500', label: 'Fair', width: '50%' };
    if (passwordStrength <= 80) return { color: 'bg-blue-500', label: 'Good', width: '75%' };
    return { color: 'bg-green-500', label: 'Strong', width: '100%' };
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate form
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address (e.g., name@example.com)';
    }

    if (!formData.firstName) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.lastName) {
      newErrors.lastName = 'Last name is required';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else {
      const { strength, requirements } = validatePasswordStrength(formData.password);
      if (
        !requirements.hasMinLength ||
        !requirements.hasUppercase ||
        !requirements.hasLowercase ||
        !requirements.hasNumber ||
        !requirements.hasSpecial
      ) {
        newErrors.password =
          'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
      }
    }

    if (!formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Password confirmation is required';
    } else if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Passwords do not match';
    }

    if (!formData.agreeTerms) {
      newErrors.agreeTerms = 'You must accept the Terms & Conditions to continue';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    // Submit form
    setIsSubmitting(true);
    setSubmitError('');
    setShowEmailSendError(false);

    try {
      const result = await registerCandidate({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });

      setSuccessState({
        email: formData.email,
        message: 'Check your email to verify your account',
      });

      // Call parent callback if provided
      if (onSignupSuccess) {
        onSignupSuccess({ ...result, email: formData.email });
      }
    } catch (error) {
      if (error.message.includes('Too many attempts')) {
        setShowRateLimitError(true);
        // Start countdown timer (5 minutes)
        let countdown = 300;
        const timer = setInterval(() => {
          countdown--;
          setRetryCountdown(countdown);
          if (countdown <= 0) {
            clearInterval(timer);
            setShowRateLimitError(false);
            setRetryCountdown(0);
          }
        }, 1000);
      } else if (error.message.includes('verification email failed')) {
        setShowEmailSendError(true);
        setSuccessState({
          email: formData.email,
          accountCreated: true,
        });
      } else {
        setSubmitError(error.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resend verification email
  const handleResendEmail = async () => {
    try {
      await resendVerificationEmail(formData.email);
      setShowEmailSendError(false);
      setSuccessState({
        ...successState,
        message: 'Verification email sent! Check your inbox.',
      });
    } catch (error) {
      setSubmitError(error.message || 'Failed to resend verification email');
    }
  };

  // If signup was successful, show success screen
  if (successState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full animate-slide-in">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="bg-green-100 rounded-full p-3">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-2">Account Created!</h2>

            <p className="text-gray-600 mb-4">
              We've sent a verification link to <strong>{successState.email}</strong>
            </p>

            <p className="text-gray-700 mb-6 text-sm">{successState.message}</p>

            {showEmailSendError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-sm text-yellow-800 font-semibold">
                      Verification email failed to send
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Your account has been created, but we couldn't send the verification email.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {showEmailSendError && (
                <button
                  onClick={handleResendEmail}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  <Mail className="w-4 h-4 inline mr-2" />
                  Resend Verification Email
                </button>
              )}

              <p className="text-xs text-gray-500 mt-4">
                The verification link will expire in 24 hours. If you don't see the email, check your spam folder.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { color: strengthColor, label: strengthLabel, width: strengthWidth } = getPasswordStrengthDisplay();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full animate-slide-in">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Create Account</h1>
        <p className="text-gray-600 mb-6">Sign up as a candidate to get started</p>

        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">{submitError}</div>
          </div>
        )}

        {showRateLimitError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">Too many attempts</p>
              <p className="text-xs text-red-700 mt-1">
                Please try again in {Math.floor(retryCountdown / 60)}:{String(retryCountdown % 60).padStart(2, '0')}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-2">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              disabled={showRateLimitError}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.firstName ? 'border-red-500' : ''
              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              placeholder="John"
            />
            {errors.firstName && (
              <div className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.firstName}
              </div>
            )}
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-2">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              disabled={showRateLimitError}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.lastName ? 'border-red-500' : ''
              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              placeholder="Doe"
            />
            {errors.lastName && (
              <div className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.lastName}
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={showRateLimitError}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.email ? 'border-red-500' : ''
              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              placeholder="you@example.com"
            />
            {errors.email && (
              <div className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.email}
              </div>
            )}
            {!errors.email && formData.email && (
              <div className="mt-1 text-sm text-green-600 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Email looks good
              </div>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={showRateLimitError}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
                  errors.password ? 'border-red-500' : ''
                } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                placeholder="Create a strong password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Password Strength Meter */}
            {formData.password && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-600">Strength:</span>
                  <span className={`text-xs font-bold ${strengthLabel === 'Weak' ? 'text-red-600' : strengthLabel === 'Fair' ? 'text-yellow-600' : strengthLabel === 'Good' ? 'text-blue-600' : 'text-green-600'}`}>
                    {strengthLabel}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all duration-300 ${strengthColor}`} style={{ width: strengthWidth }} />
                </div>
              </div>
            )}

            {errors.password && (
              <div className="mt-1 text-sm text-red-600 flex items-start">
                <AlertCircle className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
                <span>{errors.password}</span>
              </div>
            )}
          </div>

          {/* Password Requirements */}
          {formData.password && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold text-gray-700 mb-2">Password Requirements:</p>
              <div className="space-y-1">
                {[
                  { label: 'At least 8 characters', test: formData.password.length >= 8 },
                  { label: 'Uppercase letter (A-Z)', test: /[A-Z]/.test(formData.password) },
                  { label: 'Lowercase letter (a-z)', test: /[a-z]/.test(formData.password) },
                  { label: 'Number (0-9)', test: /\d/.test(formData.password) },
                  { label: 'Special character (!@#$%^&*)', test: /[!@#$%^&*]/.test(formData.password) },
                ].map((req) => (
                  <div key={req.label} className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 flex items-center justify-center ${req.test ? 'bg-green-500' : 'bg-gray-300'}`}>
                      {req.test && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className={req.test ? 'text-green-700' : 'text-gray-600'}>{req.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirm Password */}
          <div>
            <label htmlFor="passwordConfirm" className="block text-sm font-semibold text-gray-700 mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <input
                type={showPasswordConfirm ? 'text' : 'password'}
                id="passwordConfirm"
                name="passwordConfirm"
                value={formData.passwordConfirm}
                onChange={handleInputChange}
                disabled={showRateLimitError}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 ${
                  errors.passwordConfirm ? 'border-red-500' : ''
                } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {errors.passwordConfirm && (
              <div className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.passwordConfirm}
              </div>
            )}
            {!errors.passwordConfirm && formData.passwordConfirm && formData.password === formData.passwordConfirm && (
              <div className="mt-1 text-sm text-green-600 flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Passwords match
              </div>
            )}
          </div>

          {/* Terms & Conditions */}
          <div className="bg-gray-50 rounded-lg p-3">
            <label className="flex items-start cursor-pointer">
              <input
                type="checkbox"
                name="agreeTerms"
                checked={formData.agreeTerms}
                onChange={handleInputChange}
                disabled={showRateLimitError}
                className={`mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${errors.agreeTerms ? 'border-red-500' : ''} disabled:cursor-not-allowed`}
              />
              <span className="ml-3 text-sm text-gray-700">
                I agree to the{' '}
                <a href="#" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">
                  Terms & Conditions
                </a>
              </span>
            </label>
            {errors.agreeTerms && (
              <div className="mt-2 text-sm text-red-600 flex items-center ml-6">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.agreeTerms}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || showRateLimitError || Object.keys(errors).length > 0}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300 flex items-center justify-center ${
              isSubmitting || showRateLimitError || Object.keys(errors).length > 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader className="w-5 h-5 animate-spin mr-2" />
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>

          {/* Sign In Link */}
          <p className="text-center text-sm text-gray-600 mt-4">
            Already have an account?{' '}
            <a href="#" className="text-blue-600 hover:underline font-semibold">
              Sign in
            </a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignUp;
