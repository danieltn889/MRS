// App.jsx - REMOVE the Router wrapper
import React from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'; // Remove BrowserRouter import
import SignUp from './components/SignUp';
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
import SimulationExecutor from './components/SimulationExecutor';
import SimulationSessionViewer from './components/SimulationSessionViewer';
import SessionReportComponent from './components/SessionReport';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';

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

      {/* Login Route - Shows Modal Only On Demand */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <div className="app">
              <LandingPage onSignUp={handleSignUp} onLogin={handleLogin} />
              <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
                <div className="relative w-full max-w-md bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                  <button onClick={handleCloseModal} className="absolute top-4 right-4 z-10 text-gray-500 hover:text-gray-700 text-2xl font-bold bg-white hover:bg-gray-100 w-8 h-8 flex items-center justify-center rounded-full">✕</button>
                  <div className="p-0 max-h-[85vh] overflow-y-auto"><Login /></div>
                </div>
              </div>
            </div>
          )
        }
      />

      {/* Signup Route - Shows Modal Only On Demand */}
      <Route
        path="/signup"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <div className="app">
              <LandingPage onSignUp={handleSignUp} onLogin={handleLogin} />
              <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
                <div className="relative w-full max-w-md bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                  <button onClick={handleCloseModal} className="absolute top-4 right-4 z-10 text-gray-500 hover:text-gray-700 text-2xl font-bold bg-white hover:bg-gray-100 w-8 h-8 flex items-center justify-center rounded-full">✕</button>
                  <div className="p-0"><SignUp onSignupSuccess={handleSignupSuccess} /></div>
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
              onBack={() => navigate('/dashboard')}
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
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard onSignUp={handleSignUp} onLogin={handleLogin} /></ProtectedRoute>} />

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
        {/* NO Router here - Router is in main.jsx */}
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;