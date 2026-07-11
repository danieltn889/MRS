import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, Loader, CheckCircle, ArrowLeft, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { resetPassword, checkPasswordStrength, validateResetToken } from '../services/authAPI';

interface ResetPasswordState {
  status: 'idle'| 'loading'| 'success'| 'error'| 'validating';
  message: string;
  code?: string;
}

interface TokenValidation {
  valid: boolean;
  email?: string;
  message?: string;
}

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [tokenValidation, setTokenValidation] = useState<TokenValidation | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetState, setResetState] = useState<ResetPasswordState>({
    status: 'validating',
    message: '',
  });
  const [passwordStrength, setPasswordStrength] = useState<any>(null);

  // Password requirements
  const requirements = [
    { key: 'length', label: '8+ characters', check: password.length >= 8 && password.length <= 72 },
    { key: 'hasUppercase', label: 'Uppercase letter (A-Z)', check: /[A-Z]/.test(password) },
    { key: 'hasLowercase', label: 'Lowercase letter (a-z)', check: /[a-z]/.test(password) },
    { key: 'hasNumber', label: 'Number (0-9)', check: /\d/.test(password) },
    { key: 'hasSpecialChar', label: 'Special character (!@#$%^&*)', check: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];

  const allRequirementsMet = requirements.every(r => r.check);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setResetState({
        status: 'error',
        message: 'Invalid reset link. No token provided.',
        code: 'NO_TOKEN',
      });
      return;
    }

    const validateToken = async () => {
      try {
        const validation = await validateResetToken(token);
        setTokenValidation(validation);

        if (!validation.valid) {
          setResetState({
            status: 'error',
            message: validation.message || 'Invalid or expired reset link',
            code: 'INVALID_TOKEN',
          });
        } else {
          setResetState({ status: 'idle', message: ''});
        }
      } catch (error) {
        setResetState({
          status: 'error',
          message: 'Failed to validate reset link',
          code: 'VALIDATION_ERROR',
        });
      }
    };

    validateToken();
  }, [token]);

  // Update password strength meter
  useEffect(() => {
    if (password) {
      const strength = checkPasswordStrength(password);
      setPasswordStrength(strength);
    }
  }, [password]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allRequirementsMet) {
      setResetState({
        status: 'error',
        message: 'Password does not meet all requirements',
        code: 'WEAK_PASSWORD',
      });
      return;
    }

    if (!passwordsMatch) {
      setResetState({
        status: 'error',
        message: 'Passwords do not match',
        code: 'PASSWORD_MISMATCH',
      });
      return;
    }

    if (!token) {
      setResetState({
        status: 'error',
        message: 'Reset token is missing',
        code: 'NO_TOKEN',
      });
      return;
    }

    setResetState({ status: 'loading', message: ''});

    try {
      await resetPassword({ token, password });

      setResetState({
        status: 'success',
        message: 'Password reset successfully',
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (error: any) {
      const errorCode = error?.code || 'UNKNOWN_ERROR';
      const errorMessage = error?.message || 'Failed to reset password';

      setResetState({
        status: 'error',
        message: errorMessage,
        code: errorCode,
      });
    }
  };

  const renderErrorContent = () => {
    switch (resetState.code) {
      case 'NO_TOKEN':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Invalid Reset Link</p>
                <p className="text-sm text-red-700 mt-1">
                  The reset link is missing or invalid. Please request a new one.
                </p>
              </div>
            </div>
          </div>
        );
      case 'INVALID_TOKEN':
      case 'VALIDATION_ERROR':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Reset Link Expired</p>
                <p className="text-sm text-red-700 mt-1">
                  {resetState.message || 'Your password reset link has expired or is invalid. Reset links expire after 1 hour.'}
                </p>
              </div>
            </div>
          </div>
        );
      case 'WEAK_PASSWORD':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Password Does Not Meet Requirements</p>
                <p className="text-sm text-red-700 mt-1">
                  Your password must meet all requirements listed below.
                </p>
              </div>
            </div>
          </div>
        );
      case 'PASSWORD_MISMATCH':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Passwords Do Not Match</p>
                <p className="text-sm text-red-700 mt-1">
                  Please ensure both password fields contain the same password.
                </p>
              </div>
            </div>
          </div>
        );
      case 'PASSWORD_REUSED':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Cannot Reuse Recent Password</p>
                <p className="text-sm text-red-700 mt-1">
                  {resetState.message}
                </p>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700 mt-1">
                  {resetState.message}
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  // Loading state
  if (resetState.status === 'validating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validating reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Login</span>
            </button>

            <h1 className="text-3xl font-bold text-gray-900 mb-1">Reset Password</h1>
            {tokenValidation?.email && (
              <p className="text-sm text-gray-600">
                Resetting password for <span className="font-medium">{tokenValidation.email}</span>
              </p>
            )}
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {resetState.status === 'success'&& (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">Password Reset Successfully!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Your password has been changed. Redirecting to login...
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {resetState.status === 'error'&& (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6"
              >
                {renderErrorContent()}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Show error message above the form if present */}
          {resetState.status === 'error'&& (
            <div className="mb-4">
              {renderErrorContent()}
            </div>
          )}

          {/* Form - Show only if token is valid */}
          {resetState.status !== 'error'? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* New Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text': 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={resetState.status === 'loading'}
                    placeholder="Enter new password"
                    className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-lg font-medium transition-all focus:border-blue-500 focus:bg-blue-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-900"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Password Strength Meter */}
              {password && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  {/* Strength Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">Strength</span>
                      <span className={`text-xs font-semibold ${
                        passwordStrength?.strength === 'weak'? 'text-red-600':
                        passwordStrength?.strength === 'fair'? 'text-orange-600':
                        passwordStrength?.strength === 'good'? 'text-blue-600':
                        'text-green-600'
                      }`}>
                        {passwordStrength?.strength?.toUpperCase()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${passwordStrength?.score}%` }}
                        className={`h-full transition-all ${
                          passwordStrength?.strength === 'weak'? 'bg-red-500':
                          passwordStrength?.strength === 'fair'? 'bg-orange-500':
                          passwordStrength?.strength === 'good'? 'bg-blue-500':
                          'bg-green-500'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Requirements Checklist */}
                  <div className="space-y-2">
                    {requirements.map((req) => (
                      <motion.div
                        key={req.key}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`flex items-center gap-2 text-xs transition-colors ${
                          req.check ? 'text-green-700': 'text-gray-500'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          req.check ? 'border-green-500 bg-green-50': 'border-gray-300'
                        }`}>
                          {req.check && <CheckCircle className="w-3 h-3 text-green-600" />}
                        </div>
                        <span>{req.label}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Confirm Password Field */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text': 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={resetState.status === 'loading'}
                    placeholder="Confirm new password"
                    className={`w-full pl-12 pr-12 py-3 border-2 rounded-lg font-medium transition-all ${
                      confirmPassword && passwordsMatch
                        ? 'border-green-500 bg-green-50'
                        : confirmPassword
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-900"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && passwordsMatch && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Passwords match
                  </p>
                )}
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={allRequirementsMet && passwordsMatch && resetState.status !== 'loading'? { scale: 1.02 } : {}}
                whileTap={allRequirementsMet && passwordsMatch && resetState.status !== 'loading'? { scale: 0.98 } : {}}
                type="submit"
                disabled={!allRequirementsMet || !passwordsMatch || resetState.status === 'loading'}
                className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  allRequirementsMet && passwordsMatch && resetState.status !== 'loading'
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:shadow-lg'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {resetState.status === 'loading'&& (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Resetting...</span>
                  </>
                )}
                {resetState.status !== 'loading'&& (
                  <>
                    <Zap className="w-5 h-5" />
                    <span>Reset Password</span>
                  </>
                )}
              </motion.button>
            </form>
          ) : null}

          {/* Security Note */}
          {resetState.status !== 'error'&& (
            <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>🔒 Security:</strong> For your protection, you'll be logged out of all devices. Log in again with your new password.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
