// App.jsx - COMPLETE with GitHub OAuth Callback Route
import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import CandidateSignUp from './components/CandidateSignUp';
import CompanySignUp from './components/CompanySignUp';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import EmailVerification from './components/EmailVerification';
import AcceptInvitation from './components/AcceptInvitation';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './Dashboard';
import LandingPage from './components/landingPage';
import CompanyProfile from './components/company/CompanyProfile';
import { GitHubCallback } from './pages/Auth/GitHubCallback';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import JobDetails from './components/jobs/JobDetails';

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleSignupSuccess = (result) => {
    console.log('Signup successful:', result);
    alert(`Account created! Check email: ${result.email}`);
  };

  const handleCompanySignupSuccess = (result) => {
    console.log('Company registration successful:', result);
    alert(`Company registered! Check admin email: ${result.data.user.email}`);
  };

  const handleSignUp = () => {
    navigate('/signup');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <Routes>
      {/* GitHub OAuth Callback Route - MUST come before default routes */}
      <Route path="/auth/github/callback" element={<GitHubCallback />} />

      {/* Default Home Route */}
      <Route 
        path="/" 
        element={
          isAuthenticated ? (
            <Dashboard onSignUp={handleSignUp} onLogin={handleLogin} />
          ) : (
            <LandingPage onSignUp={handleSignUp} onLogin={handleLogin} />
          )
        } 
      />

      {/* Login Route - Full Page */}
      <Route
        path="/login"
        element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />}
      />

      {/* Signup Route - Full Page (personal info, Rwanda location, identity verification) */}
      <Route
        path="/signup"
        element={!isAuthenticated ? <CandidateSignUp onSignupSuccess={handleSignupSuccess} /> : <Navigate to="/" replace />}
      />

      {/* Company Signup Route - Full Page */}
      <Route path="/company-signup" element={!isAuthenticated ? <CompanySignUp onSignupSuccess={handleCompanySignupSuccess} /> : <Navigate to="/" replace />} />

      {/* Email Verification Routes */}
      <Route path="/verify-email" element={<EmailVerification />} />
      
      {/* Job Details Route */}
      <Route 
        path="/jobs/:id" 
        element={
          <ProtectedRoute>
            <JobDetails />
          </ProtectedRoute>
        } 
      />
      
      <Route path="/verify-email-manual" element={<EmailVerification />} />

      {/* Accept Team Invitation Route */}
      <Route path="/accept-invitation" element={<AcceptInvitation />} />

      {/* Forgot Password & Reset Password Routes */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected Dashboard Route */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard onSignUp={handleSignUp} onLogin={handleLogin} /></ProtectedRoute>} />

      {/* Company Profile Route */}
      <Route path="/company-profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />

      {/* Default route for any unmatched paths */}
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;