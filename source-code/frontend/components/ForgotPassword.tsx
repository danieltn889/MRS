import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, Loader, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { forgotPassword } from '../services/authAPI';

interface ForgotPasswordState {
  status: 'idle'| 'loading'| 'success'| 'error'| 'rate_limit';
  message: string;
  code?: string;
}

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isValidEmail, setIsValidEmail] = useState(false);
  const [forgotState, setForgotState] = useState<ForgotPasswordState>({
    status: 'idle',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Handle email input
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setIsValidEmail(emailRegex.test(value));
  };

  // Handle rate limit countdown
  useEffect(() => {
    if (forgotState.status === 'rate_limit'&& rateLimitCountdown > 0) {
      const timer = setTimeout(() => {
        setRateLimitCountdown(rateLimitCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [rateLimitCountdown, forgotState.status]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidEmail) {
      setForgotState({
        status: 'error',
        message: 'Please enter a valid email address',
        code: 'INVALID_EMAIL',
      });
      return;
    }

    setForgotState({ status: 'loading', message: ''});

    try {
      await forgotPassword(email);
      
      setForgotState({
        status: 'success',
        message: `Password reset link sent to ${email}. Check your inbox and spam folder.`,
      });
      setSubmitted(true);
    } catch (error: any) {
      const errorCode = error?.code || 'UNKNOWN_ERROR';
      const errorMessage = error?.message || 'Failed to request password reset';

      if (error?.statusCode === 429 || errorCode === 'RATE_LIMIT_EXCEEDED') {
        setRateLimitCountdown(3600); // 1 hour in seconds
        setForgotState({
          status: 'rate_limit',
          message: 'Too many password reset requests. Try again in 1 hour.',
          code: 'RATE_LIMIT_EXCEEDED',
        });
      } else {
        setForgotState({
          status: 'error',
          message: errorMessage,
          code: errorCode,
        });
      }
    }
  };

  const renderErrorContent = () => {
    switch (forgotState.code) {
      case 'INVALID_EMAIL':
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Invalid email format</p>
                <p className="text-sm text-red-700 mt-1">
                  Please enter a valid email address (e.g., user@example.com)
                </p>
              </div>
            </div>
          </div>
        );
      case 'RATE_LIMIT_EXCEEDED':
        return (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Too many requests</p>
                <p className="text-sm text-amber-700 mt-1">
                  You've requested too many password resets. Try again in <span className="font-semibold">{Math.ceil(rateLimitCountdown / 60)} minute{Math.ceil(rateLimitCountdown / 60) !== 1 ? 's': ''}</span>.
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
                  {forgotState.message}
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

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

            <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h1>
            <p className="text-gray-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {forgotState.status === 'success'&& submitted && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 rounded-lg bg-green-50 border border-green-200 p-4"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">Check your email</p>
                    <p className="text-sm text-green-700 mt-1">
                      {forgotState.message}
                    </p>
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-green-700 font-medium">Next steps:</p>
                      <ul className="text-xs text-green-700 space-y-1 list-disc list-inside">
                        <li>Click the link in the email to reset your password</li>
                        <li>The link expires in 1 hour for security</li>
                        <li>If you don't see it, check your spam folder</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {forgotState.status === 'error'&& (
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

          {/* Rate Limit Message */}
          <AnimatePresence>
            {forgotState.status === 'rate_limit'&& (
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

          {/* Form - Show only if not rate limited */}
          {forgotState.status !== 'rate_limit'? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    disabled={forgotState.status === 'loading'|| submitted}
                    placeholder="your@email.com"
                    className={`w-full pl-12 pr-4 py-3 border-2 rounded-lg font-medium transition-all ${
                      isValidEmail
                        ? 'border-green-500 bg-green-50 text-gray-900'
                        : email
                        ? 'border-red-500 bg-red-50 text-gray-900'
                        : 'border-gray-200 bg-gray-50 text-gray-900'
                    } ${
                      submitted ? 'opacity-75 cursor-not-allowed': ''
                    }`}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={!submitted && isValidEmail && forgotState.status !== 'loading'? { scale: 1.02 } : {}}
                whileTap={!submitted && isValidEmail && forgotState.status !== 'loading'? { scale: 0.98 } : {}}
                type="submit"
                disabled={!isValidEmail || forgotState.status === 'loading'|| submitted}
                className={`w-full py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  isValidEmail && forgotState.status !== 'loading'&& !submitted
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-lg'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }`}
              >
                {forgotState.status === 'loading'&& (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Sending...</span>
                  </>
                )}
                {forgotState.status !== 'loading'&& !submitted && (
                  <>
                    <Mail className="w-5 h-5" />
                    <span>Send Reset Link</span>
                  </>
                )}
                {submitted && (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Email Sent</span>
                  </>
                )}
              </motion.button>
            </form>
          ) : (
            // Rate limit info box
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700">Please try again in {Math.ceil(rateLimitCountdown / 60)} minutes</p>
            </div>
          )}

          {/* Footer Links */}
          <div className="mt-8 pt-8 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              Remember your password?{''}
              <button
                onClick={() => navigate('/login')}
                className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Back to Login
              </button>
            </p>
          </div>

          {/* Security Note */}
          <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              <strong>🔒 Security:</strong> Reset links expire in 1 hour. Never share your reset link with anyone. We'll never ask for your password via email.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
