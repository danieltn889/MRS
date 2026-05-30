import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader, CheckCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { loginUser, resendVerificationEmail } from '../services/authAPI';
import { useAuth } from '../context/AuthContext';

interface LoginState {
  status: 'idle' | 'loading' | 'success' | 'error' | 'unverified' | 'locked' | 'invalid_password' | 'rate_limit';
  message: string;
  code?: string;
  attemptsRemaining?: number;
  minutesRemaining?: number;
}

interface LocationState {
  from?: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loginState, setLoginState] = useState<LoginState>({
    status: 'idle',
    message: '',
  });
  const [isValidEmail, setIsValidEmail] = useState(false);
  const [isFormValid, setIsFormValid] = useState(false);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    // Validate email on change
    if (name === 'email') {
      setIsValidEmail(emailRegex.test(value));
    }
  };

  // Check form validity
  useEffect(() => {
    const isValid =
      isValidEmail &&
      formData.password.length >= 8 &&
      formData.password.length <= 72 &&
      loginState.status !== 'loading';

    setIsFormValid(isValid);
  }, [isValidEmail, formData.password, loginState.status]);

  // Countdown timer for account lockout
  useEffect(() => {
    if (lockoutCountdown > 0) {
      const timer = setTimeout(() => {
        setLockoutCountdown(lockoutCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [lockoutCountdown]);

  // Handle login form submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      setLoginState({
        status: 'error',
        message: 'Please fill in all fields correctly',
      });
      return;
    }

    setLoginState({
      status: 'loading',
      message: 'Logging in...',
    });

    try {
      const result = await loginUser({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });

      setLoginState({
        status: 'success',
        message: `Welcome back, ${result.user?.firstName || 'User'}!`,
      });

      // Update auth context
      login(result.user, result.token);

      // Redirect to dashboard or originally requested page
      const from = (location.state as LocationState)?.from || '/';
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 1500);
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed. Please try again.';
      const errorCode = error.code || 'LOGIN_ERROR';

      let newStatus: LoginState['status'] = 'error';
      let attemptsRemaining = undefined;
      let minutesRemaining = undefined;

      // Check for rate limit error
      if (errorCode === 'RATE_LIMIT_EXCEEDED' || error.statusCode === 429) {
        newStatus = 'rate_limit';
      }
      // Check for unverified account (by code or message fallback)
      else if (errorCode === 'ACCOUNT_UNVERIFIED' || 
          errorMessage.toLowerCase().includes('not verified') ||
          errorMessage.toLowerCase().includes('verify')) {
        newStatus = 'unverified';
      } else if (errorCode === 'ACCOUNT_LOCKED') {
        newStatus = 'locked';
        minutesRemaining = error.minutesRemaining || 15;
        setLockoutCountdown(minutesRemaining * 60);
      } else if (errorCode === 'INVALID_PASSWORD') {
        newStatus = 'invalid_password';
        attemptsRemaining = error.attemptsRemaining || 0;
      }

      setLoginState({
        status: newStatus,
        message: errorMessage,
        code: errorCode,
        attemptsRemaining,
        minutesRemaining,
      });
    }
  };

  // Handle resend verification email
  const handleResendVerificationEmail = async () => {
    if (!formData.email || !isValidEmail) {
      setResendMessage('Please enter a valid email address');
      setResendStatus('error');
      return;
    }

    setIsResendingEmail(true);
    setResendStatus('loading');

    try {
      const result = await resendVerificationEmail(formData.email);
      
      setResendStatus('success');
      setResendMessage(result.message || 'Verification email sent! Check your inbox.');
      
      // Reset after 5 seconds
      setTimeout(() => {
        setResendStatus('idle');
        setResendMessage('');
      }, 5000);
    } catch (error: any) {
      setResendStatus('error');
      setResendMessage(error.message || 'Failed to resend verification email');
    } finally {
      setIsResendingEmail(false);
    }
  };

  // Render error state with specific handling
  const renderErrorContent = () => {
    switch (loginState.code) {
      case 'ACCOUNT_UNVERIFIED':
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">
              Your email hasn't been verified yet. Please check your inbox for the verification link.
            </p>
            {resendMessage && (
              <div className={`p-3 rounded-lg text-sm font-medium ${
                resendStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {resendMessage}
              </div>
            )}
            <button
              onClick={handleResendVerificationEmail}
              disabled={isResendingEmail || resendStatus === 'success'}
              className="w-full bg-blue-50 text-blue-600 py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isResendingEmail ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : resendStatus === 'success' ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Sent!
                </>
              ) : (
                'Resend Verification Email'
              )}
            </button>
          </div>
        );

      case 'ACCOUNT_LOCKED':
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">
              Too many failed login attempts. Your account is temporarily locked.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-800">
                Try again in {lockoutCountdown} second{lockoutCountdown !== 1 ? 's' : ''}
              </span>
            </div>
            <button
              onClick={() =>
                navigate('/forgot-password', { state: { email: formData.email } })
              }
              className="w-full bg-blue-50 text-blue-600 py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
            >
              Reset Password Instead
            </button>
          </div>
        );

      case 'INVALID_PASSWORD':
        return (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {loginState.attemptsRemaining !== undefined && loginState.attemptsRemaining > 0
                ? `Incorrect password. ${loginState.attemptsRemaining} attempt${
                    loginState.attemptsRemaining !== 1 ? 's' : ''
                  } remaining.`
                : 'Incorrect password. Your account has been locked for security.'}
            </p>
            <button
              onClick={() => navigate('/forgot-password')}
              className="w-full bg-blue-50 text-blue-600 py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
            >
              Forgot Password?
            </button>
          </div>
        );

      case 'rate_limit':
        return (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
              <Clock className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-900">Too many attempts</p>
                <p className="text-xs text-orange-700 mt-1">
                  You've exceeded the login attempt limit. Please wait a few minutes before trying again.
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              This is a security measure to protect your account. After 15 minutes, you can try again.
            </p>
            <button
              onClick={() => navigate('/verify-email-manual', { state: { email: formData.email } })}
              className="w-full bg-blue-50 text-blue-600 py-2 px-4 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
            >
              Verify Email Instead
            </button>
          </div>
        );

      default:
        return <p className="text-sm text-gray-600">{loginState.message}</p>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-block p-3 bg-blue-50 rounded-full mb-4"
          >
            <Mail className="w-6 h-6 text-blue-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Log in to access your account</p>
        </div>

        {/* Success State */}
        <AnimatePresence>
          {loginState.status === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3"
            >
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {loginState.message}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error State */}
        <AnimatePresence>
          {(loginState.status === 'error' || loginState.status === 'unverified' || loginState.status === 'locked' || loginState.status === 'invalid_password' || loginState.status === 'rate_limit') && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  {renderErrorContent()}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Login Form */}
        <motion.form
          onSubmit={handleLogin}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-5"
        >
          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleInputChange}
                autoComplete="email"
                disabled={loginState.status === 'loading'}
                className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  formData.email && !isValidEmail
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300 bg-white'
                } disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
              {formData.email && !isValidEmail && (
                <p className="text-xs text-red-600 mt-1">Please enter a valid email address</p>
              )}
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleInputChange}
                autoComplete="current-password"
                disabled={loginState.status === 'loading'}
                maxLength={72}
                className="w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loginState.status === 'loading'}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
              {formData.password && formData.password.length < 8 && (
                <p className="text-xs text-gray-500 mt-1">
                  Password must be at least 8 characters
                </p>
              )}
            </div>
          </div>

          {/* Remember Me Checkbox */}
          <div className="flex items-center gap-3">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              checked={formData.rememberMe}
              onChange={handleInputChange}
              disabled={loginState.status === 'loading'}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
            />
            <label htmlFor="rememberMe" className="text-sm text-gray-700 flex items-center gap-1.5">
              Remember me for 30 days
              <span className="text-gray-400 text-xs">(extends session timeout)</span>
            </label>
          </div>

          {/* Submit Button */}
          <motion.button
            whileHover={{ scale: isFormValid && loginState.status !== 'loading' ? 1.02 : 1 }}
            whileTap={{ scale: isFormValid && loginState.status !== 'loading' ? 0.98 : 1 }}
            type="submit"
            disabled={!isFormValid}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
              isFormValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {loginState.status === 'loading' ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Logging in...
              </>
            ) : (
              'Log In'
            )}
          </motion.button>
        </motion.form>

        {/* Footer Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 pt-6 border-t border-gray-200 space-y-3 text-center text-sm"
        >
          <div className="flex items-center justify-center gap-1">
            <span className="text-gray-600">Don't have an account?</span>
            <button
              onClick={() => navigate('/signup')}
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Sign up
            </button>
          </div>

          <button
            onClick={() => navigate('/forgot-password')}
            className="text-gray-600 hover:text-gray-700 w-full py-2 px-3 rounded hover:bg-gray-50 transition-colors"
          >
            Forgot your password?
          </button>

          <p className="text-xs text-gray-500 mt-4">
            By logging in, you agree to our Terms of Service and Privacy Policy
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Login;