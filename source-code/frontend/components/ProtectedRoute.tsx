// components/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, save the attempted URL and redirect to login
  if (!isAuthenticated) {
    // Save the current location to redirect back after login
    const returnUrl = location.pathname + location.search;
    
    // Store in sessionStorage (persists across page refresh)
    sessionStorage.setItem('redirectAfterLogin', returnUrl);
    
    // Also pass via state for immediate use
    return <Navigate to="/login" state={{ from: returnUrl }} replace />;
  }

  // ✅ Clear any stale redirect URL if user is already authenticated
  if (sessionStorage.getItem('redirectAfterLogin')) {
    sessionStorage.removeItem('redirectAfterLogin');
  }

  // If authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;