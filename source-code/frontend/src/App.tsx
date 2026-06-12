// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'; // ← ADD THIS LINE
import SignUp from '../components/SignUp';
import CompanySignUp from '../components/CompanySignUp';
import Login from '../components/Login';
import ForgotPassword from '../components/ForgotPassword';
import ResetPassword from '../components/ResetPassword';
import EmailVerification from '../components/EmailVerification';
import AcceptInvitation from '../components/AcceptInvitation';
import ProtectedRoute from '../components/ProtectedRoute';
import Dashboard from '../Dashboard';
import LandingPage from '../components/landingPage';
import CompanyProfile from '../components/company/CompanyProfile';
import SimulationExecutor from '../components/SimulationExecutor';
import SimulationSessionViewer from '../components/SimulationSessionViewer';
import SessionReportComponent from '../components/SessionReport';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider, useAuth } from '../context/AuthContext';

// Wrapper component for SimulationSessionViewer to handle URL params
const SimulationResultsWrapper = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  return <SimulationSessionViewer simulationId={sessionId} onBack={() => navigate('/simulations')} />;
};

// SessionReport wrapper - extracts sessionId from URL params
const SessionReportWrapper = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  return <SessionReportComponent sessionId={sessionId} onBack={() => navigate(-1)} />;
};

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleSignupSuccess = (result) => {
    console.log('✅ Signup successful:', result);
    alert(`Account created! Check email: ${result.email}`);
  };

  const handleCompanySignupSuccess = (result) => {
    console.log('✅ Company registration successful:', result);
    alert(`Company registered! Check admin email: ${result.data.user.email}`);
  };

  const handleSignUp = () => {
    navigate('/signup');
  };

  const handleLogin = () => {
    navigate('/login');
  };

  const handleCloseModal = () => {
    navigate('/');
  };

  return (
    <Routes>
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

      {/* Login Route */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <div className="relative">
              {/* Blurred landing page */}
              <div className="filter blur-sm pointer-events-none select-none">
                <LandingPage onSignUp={handleSignUp} onLogin={handleLogin} />
              </div>
              {/* Overlay backdrop */}
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                {/* Modal: full-screen on mobile, 90 vw on md+, max 1400 px */}
                <div className="relative w-full h-full md:w-11/12 md:max-w-7xl md:h-[95vh] md:rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <button
                    onClick={handleCloseModal}
                    className="absolute top-4 right-4 z-[60] w-9 h-9 bg-white/90 hover:bg-white shadow-lg rounded-full flex items-center justify-center text-gray-700 hover:text-gray-900 font-bold transition-all"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                  <div className="flex-1 overflow-y-auto h-full">
                    <Login />
                  </div>
                </div>
              </div>
            </div>
          )
        }
      />

      {/* Signup Route */}
      <Route
        path="/signup"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <div className="relative">
              <div className="filter blur-sm pointer-events-none select-none">
                <LandingPage onSignUp={handleSignUp} onLogin={handleLogin} />
              </div>
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                <div className="relative w-full h-full md:w-11/12 md:max-w-7xl md:h-[95vh] md:rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                  <button
                    onClick={handleCloseModal}
                    className="absolute top-4 right-4 z-[60] w-9 h-9 bg-white/90 hover:bg-white shadow-lg rounded-full flex items-center justify-center text-gray-700 hover:text-gray-900 font-bold transition-all"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                  <div className="flex-1 overflow-y-auto h-full">
                    <SignUp onSignupSuccess={handleSignupSuccess} />
                  </div>
                </div>
              </div>
            </div>
          )
        }
      />

      {/* Company Signup Route - Full Page */}
      <Route path="/company-signup" element={!isAuthenticated ? <CompanySignUp onSignupSuccess={handleCompanySignupSuccess} /> : <Navigate to="/" replace />} />

      {/* Email Verification Routes */}
      <Route path="/verify-email" element={<EmailVerification />} />
      <Route path="/verify-email-manual" element={<EmailVerification />} />

      {/* Accept Team Invitation Route */}
      <Route path="/accept-invitation" element={<AcceptInvitation />} />

      {/* Forgot Password & Reset Password Routes */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* Simulation Session Viewer Routes */}
      <Route 
        path="/simulations/my" 
        element={
          <ProtectedRoute>
            <SimulationSessionViewer 
              onBack={() => navigate('/')}
              onResume={(sessionId, simulationId) => {
                navigate(`/simulation/execute/${sessionId}`);
              }}
            />
          </ProtectedRoute>
        } 
      />

      {/* Show sessions for a specific simulation */}
      <Route 
        path="/simulations/:simulationId/sessions" 
        element={
          <ProtectedRoute>
            <SimulationSessionViewer onBack={() => navigate(-1)} />
          </ProtectedRoute>
        } 
      />

      {/* Simulation Executor Route */}
      <Route 
        path="/simulation/execute/:sessionId" 
        element={
          <ProtectedRoute>
            <SimulationExecutor 
              onComplete={(sessionId) => navigate(`/simulation/results/${sessionId}`)} 
              onExit={() => navigate('/')} 
            />
          </ProtectedRoute>
        } 
      />

      {/* Simulation Results Route */}
      <Route 
        path="/simulation/results/:sessionId" 
        element={
          <ProtectedRoute>
            <SimulationResultsWrapper />
          </ProtectedRoute>
        } 
      />

      {/* Session Report Route */}
      <Route 
        path="/session-report/:sessionId" 
        element={
          <ProtectedRoute>
            <SessionReportWrapper />
          </ProtectedRoute>
        } 
      />

      {/* Protected Dashboard Route */}
      <Route path="/" element={<ProtectedRoute><Dashboard onSignUp={handleSignUp} onLogin={handleLogin} /></ProtectedRoute>} />

      {/* Company Profile Route */}
      <Route path="/company-profile" element={<ProtectedRoute><CompanyProfile /></ProtectedRoute>} />

      {/* Default route */}
      <Route path="/*" element={<Navigate to={isAuthenticated ? "/" : "/"} replace />} />
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