import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Mail, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Email Verification Component - Story 2
 * Handles email verification with token from email link
 * Also provides manual code entry and resend options
 */

interface VerificationResponse {
  success: boolean;
  message: string;
  data?: {
    email: string;
    status: string;
  };
  errorCode?: string;
}

interface VerificationState {
  status: 'pending'| 'loading'| 'success'| 'error'| 'expired'| 'already_verified';
  message: string;
  email?: string;
  error?: {
    code: string;
    message: string;
    canResend?: boolean;
  };
}

const EmailVerification: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Verification states
  const [verificationState, setVerificationState] = useState<VerificationState>({
    status: 'pending',
    message: 'Verifying your email...'
  });

  // Manual code verification states
  const [showManualCode, setShowManualCode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [codeEmail, setCodeEmail] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  // Resend email states
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Prevent multiple verification attempts using ref
  const verificationAttemptedRef = useRef(false);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

  // Verify email with token from URL on component mount
  useEffect(() => {
    const token = searchParams.get('token');
    if (token && !verificationAttemptedRef.current) {
      verificationAttemptedRef.current = true;
      verifyEmailWithToken(token);
    } else if (!token) {
      setVerificationState({
        status: 'error',
        message: 'No verification token provided',
        error: {
          code: 'NO_TOKEN',
          message: 'Please use the verification link from your email'
        }
      });
    }
  }, []); // Empty dependency array - only run once on mount

  // Handle token verification
  const verifyEmailWithToken = async (token: string) => {
    try {
      setVerificationState({
        status: 'loading',
        message: 'Verifying your email address...'
      });

      const response = await fetch(`${apiUrl}/verify-email/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
      });

      let data: VerificationResponse;

      if (response.status === 429) {
        // Rate limit exceeded - handle as plain text response
        const textResponse = await response.text();
        setVerificationState({
          status: 'error',
          message: 'Too many verification attempts',
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: textResponse || 'Too many verification attempts, please try again later.',
            canResend: false
          }
        });
        return;
      }

      try {
        data = await response.json();
      } catch (parseError) {
        // If JSON parsing fails, treat as plain text error
        const textResponse = await response.text();
        setVerificationState({
          status: 'error',
          message: 'Verification failed',
          error: {
            code: 'PARSE_ERROR',
            message: textResponse || 'An error occurred during verification',
            canResend: true
          }
        });
        return;
      }

      if (data.success) {
        // Success case
        setVerificationState({
          status: 'success',
          message: 'Email verified successfully!',
          email: data.data?.email
        });

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate(`/login?email=${encodeURIComponent(data.data?.email || '')}`);
        }, 3000);
      } else {
        // Error cases
        handleVerificationError(data);
      }
    } catch (error) {
      console.error('Email verification error:', error);
      setVerificationState({
        status: 'error',
        message: 'An error occurred during verification',
        error: {
          code: 'VERIFICATION_ERROR',
          message: 'Please try again or use the manual code option'
        }
      });
    }
  };

  // Handle different verification errors
  const handleVerificationError = (data: VerificationResponse) => {
    const errorCode = data.errorCode || 'UNKNOWN_ERROR';

    switch (errorCode) {
      case 'INVALID_TOKEN':
        setVerificationState({
          status: 'error',
          message: 'Invalid verification link',
          error: {
            code: 'INVALID_TOKEN',
            message: 'The verification link is invalid or has been tampered with. Please request a new verification email.',
            canResend: true
          }
        });
        break;

      case 'EXPIRED_TOKEN':
        setVerificationState({
          status: 'expired',
          message: 'Verification link expired',
          error: {
            code: 'EXPIRED_TOKEN',
            message: 'Your verification link has expired. A new email has been sent to you.',
            canResend: true
          }
        });
        break;

      case 'ALREADY_VERIFIED':
        setVerificationState({
          status: 'already_verified',
          message: 'Email already verified',
          email: data.data?.email,
          error: {
            code: 'ALREADY_VERIFIED',
            message: 'This email is already verified. You can now log in.'
          }
        });
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate(`/login?email=${encodeURIComponent(data.data?.email || '')}`);
        }, 2000);
        break;

      case 'TOKEN_ALREADY_USED':
        setVerificationState({
          status: 'already_verified',
          message: 'This link has already been used',
          email: data.data?.email,
          error: {
            code: 'TOKEN_ALREADY_USED',
            message: 'This verification link has already been used. Please log in.'
          }
        });
        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate(`/login?email=${encodeURIComponent(data.data?.email || '')}`);
        }, 2000);
        break;

      default:
        setVerificationState({
          status: 'error',
          message: data.message || 'Verification failed',
          error: {
            code: errorCode,
            message: 'An unexpected error occurred. Please try again.'
          }
        });
    }
  };

  // Handle manual code verification
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!manualCode || !/^\d{6}$/.test(manualCode)) {
      setCodeError('Please enter a valid 6-digit code');
      return;
    }

    if (!codeEmail) {
      setCodeError('Please enter your email address');
      return;
    }

    try {
      setCodeLoading(true);
      setCodeError('');

      const response = await fetch(`${apiUrl}/verify-email/code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: codeEmail,
          code: manualCode
        })
      });

      const data: VerificationResponse = await response.json();

      if (data.success) {
        // Success case
        setVerificationState({
          status: 'success',
          message: 'Email verified successfully!',
          email: data.data?.email
        });

        // Clear manual code form
        setManualCode('');
        setCodeEmail('');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate(`/login?email=${encodeURIComponent(data.data?.email || '')}`);
        }, 3000);
      } else {
        // Handle different error codes
        const errorCode = data.errorCode || 'UNKNOWN_ERROR';

        switch (errorCode) {
          case 'INVALID_CODE':
            setAttemptsRemaining(prev => Math.max(0, prev - 1));
            setCodeError(data.message || 'Invalid verification code. Please check and try again.');
            break;

          case 'EXPIRED_CODE':
            setCodeError('Verification code has expired. Please request a new verification email.');
            setAttemptsRemaining(0);
            break;

          case 'TOO_MANY_ATTEMPTS':
            setCodeError('Too many failed attempts. Please request a new verification email.');
            setAttemptsRemaining(0);
            break;

          default:
            setCodeError(data.message || 'An error occurred during verification');
        }
      }
    } catch (error) {
      console.error('Code verification error:', error);
      setCodeError('An error occurred. Please try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  // Handle resend verification email
  const handleResendEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resendEmail) {
      setResendMessage('Please enter your email address');
      return;
    }

    try {
      setResendLoading(true);
      setResendMessage('');

      const response = await fetch(`${apiUrl}/verify-email/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: resendEmail })
      });

      const data: VerificationResponse = await response.json();

      if (data.success) {
        setResendMessage('✓ '+ data.message);
        setResendEmail('');

        // Start 5-minute cooldown
        setResendCooldown(300); // 5 minutes in seconds
      } else {
        setResendMessage(data.message);
      }
    } catch (error) {
      console.error('Resend error:', error);
      setResendMessage('An error occurred. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  // Handle cooldown timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Render different states
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Success State */}
        <AnimatePresence mode="wait">
          {verificationState.status === 'success'&& (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-lg shadow-lg p-8 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              </motion.div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Email Verified!</h1>
              <p className="text-gray-600 mb-2">Your email has been verified successfully.</p>
              {verificationState.email && (
                <p className="text-sm text-gray-500 mb-6">{verificationState.email}</p>
              )}
              <p className="text-sm text-blue-600 animate-pulse">Redirecting to login...</p>
            </motion.div>
          )}

          {/* Already Verified State */}
          {verificationState.status === 'already_verified'&& (
            <motion.div
              key="already-verified"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-lg p-8 text-center"
            >
              <Mail className="w-16 h-16 mx-auto text-blue-500 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Already Verified</h1>
              <p className="text-gray-600 mb-2">This email is already verified.</p>
              {verificationState.email && (
                <p className="text-sm text-gray-500 mb-6">{verificationState.email}</p>
              )}
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
              >
                Go to Login
              </button>
            </motion.div>
          )}

          {/* Loading State */}
          {verificationState.status === 'loading'&& (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-lg shadow-lg p-8 text-center"
            >
              <Loader className="w-12 h-12 mx-auto text-blue-600 animate-spin mb-4" />
              <h1 className="text-xl font-bold text-gray-800">Verifying Email</h1>
              <p className="text-gray-600 mt-2">Please wait while we verify your email...</p>
            </motion.div>
          )}

          {/* Error States */}
          {verificationState.status === 'error'&& (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-lg p-8"
            >
              <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Verification Failed</h1>
              <p className="text-gray-600 text-center mb-2">{verificationState.message}</p>
              {verificationState.error && (
                <p className="text-sm text-red-600 text-center bg-red-50 p-3 rounded mb-6">
                  {verificationState.error.message}
                </p>
              )}

              <div className="space-y-4">
                {/* Manual Code Entry Option */}
                {!showManualCode && (
                  <button
                    onClick={() => setShowManualCode(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
                  >
                    Enter Verification Code Instead
                  </button>
                )}

                {/* Resend Email Option */}
                {verificationState.error?.canResend && (
                  <button
                    onClick={() => setShowManualCode(false)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition"
                  >
                    Resend Verification Email
                  </button>
                )}

                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg transition"
                >
                  Back to Login
                </button>
              </div>
            </motion.div>
          )}

          {/* Expired Token State */}
          {verificationState.status === 'expired'&& (
            <motion.div
              key="expired"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-lg p-8"
            >
              <AlertCircle className="w-16 h-16 mx-auto text-yellow-500 mb-4" />
              <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Link Expired</h1>
              <p className="text-gray-600 text-center mb-6">
                Your verification link has expired. A new verification email has been sent to your inbox.
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => setShowManualCode(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition"
                >
                  I Have a Code
                </button>

                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg transition"
                >
                  Back to Login
                </button>
              </div>
            </motion.div>
          )}

          {/* Manual Code Entry Form */}
          {showManualCode && (
            <motion.div
              key="manual-code"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-lg shadow-lg p-8"
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Verify with Code</h2>
              <p className="text-gray-600 mb-6">Enter the 6-digit code sent to your email</p>

              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={codeEmail}
                    onChange={(e) => setCodeEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    disabled={codeLoading || attemptsRemaining === 0}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code (6 digits)
                  </label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-2 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                    disabled={codeLoading || attemptsRemaining === 0}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {attemptsRemaining > 0
                      ? `${attemptsRemaining} attempts remaining`
                      : 'No attempts remaining'}
                  </p>
                </div>

                {codeError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                    {codeError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={codeLoading || !manualCode || !codeEmail || attemptsRemaining === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {codeLoading && <Loader className="w-4 h-4 animate-spin" />}
                  {codeLoading ? 'Verifying...': 'Verify Code'}
                </button>
              </form>

              <button
                onClick={() => {
                  setShowManualCode(false);
                  setCodeError('');
                  setManualCode('');
                }}
                className="w-full mt-4 text-blue-600 hover:text-blue-700 font-medium py-2"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {/* Resend Email Form - shown when verification fails with canResend */}
          {showManualCode === false && verificationState.error?.canResend && verificationState.status === 'error'&& (
            <motion.div
              key="resend-email"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-lg shadow-lg p-8"
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Resend Verification Email</h2>
              <p className="text-gray-600 mb-6">We'll send a new verification link to your email</p>

              <form onSubmit={handleResendEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    disabled={resendLoading || resendCooldown > 0}
                  />
                </div>

                {resendMessage && (
                  <div className={`p-3 rounded text-sm ${
                    resendMessage.startsWith('✓')
                      ? 'bg-green-50 border border-green-200 text-green-600'
                      : 'bg-gray-50 border border-gray-200 text-gray-600'
                  }`}>
                    {resendMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={resendLoading || resendCooldown > 0 || !resendEmail}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {resendLoading && <Loader className="w-4 h-4 animate-spin" />}
                  {resendCooldown > 0
                    ? `Wait ${resendCooldown}s`
                    : resendLoading
                    ? 'Sending...'
                    : 'Resend Email'}
                </button>
              </form>

              <button
                onClick={() => setShowManualCode(true)}
                className="w-full mt-4 text-blue-600 hover:text-blue-700 font-medium py-2"
              >
                Have a code? ↓
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default EmailVerification;
