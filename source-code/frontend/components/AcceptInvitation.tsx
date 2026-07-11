import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Loader, Users, Briefcase, Crown, Eye, Search } from 'lucide-react';
import { acceptTeamInvitation } from '../services/authAPI';

interface InvitationDetails {
  company_name: string;
  role: string;
  first_name?: string;
  last_name?: string;
  personal_message?: string;
}

const AcceptInvitation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<'loading'| 'details'| 'form'| 'success'| 'error'>('loading');
  const [invitationDetails, setInvitationDetails] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form state for new users
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: ''
  });

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStep('error');
      setError('Invalid invitation link. No token provided.');
      return;
    }

    // For now, we'll assume the invitation is valid and show the form
    // In a real implementation, you might want to validate the token first
    setStep('form');
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) return;

    // Validate form for new users
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await acceptTeamInvitation({
        token,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone
      });

      setStep('success');
      setInvitationDetails({
        company_name: result.data.company.name,
        role: result.data.role,
        first_name: formData.firstName,
        last_name: formData.lastName
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);

    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-6 h-6 text-yellow-500" />;
      case 'recruiter': return <Briefcase className="w-6 h-6 text-blue-500" />;
      case 'reviewer': return <Search className="w-6 h-6 text-green-500" />;
      case 'viewer': return <Eye className="w-6 h-6 text-gray-500" />;
      default: return <Users className="w-6 h-6 text-gray-400" />;
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Full access to company settings and team management. Can post and manage jobs, review candidates.';
      case 'recruiter':
        return 'Can post and manage jobs, review and manage candidates, access company dashboard.';
      case 'reviewer':
        return 'Can review and assess candidates, provide feedback on applications.';
      case 'viewer':
        return 'Read-only access to company dashboard and candidate information.';
      default:
        return 'Access level to be determined by company administrator.';
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md w-full">
          <Loader className="w-8 h-8 mx-auto text-blue-600 animate-spin mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Loading Invitation</h1>
          <p className="text-gray-600 mt-2">Please wait while we verify your invitation...</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md w-full">
          <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to the Team!</h1>
          <p className="text-gray-600 mb-4">
            You've successfully joined <strong>{invitationDetails?.company_name}</strong> as a{''}
            <strong>{invitationDetails?.role}</strong>.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              {invitationDetails?.role && getRoleIcon(invitationDetails.role)}
              <span className="font-medium capitalize">{invitationDetails?.role} Access</span>
            </div>
            <p className="text-sm text-gray-600">
              {invitationDetails?.role && getRoleDescription(invitationDetails.role)}
            </p>
          </div>
          <p className="text-sm text-gray-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md w-full">
          <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg"
            >
              Go to Login
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form step - for accepting invitation
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <Users className="w-12 h-12 mx-auto text-blue-600 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Join the Team</h1>
          <p className="text-gray-600 mt-2">Complete your account setup to get started</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleAccept} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone (Optional)
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              required
              minLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            {loading && <Loader className="w-4 h-4 animate-spin" />}
            {loading ? 'Joining Team...': 'Join Team'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            By joining, you agree to the company's terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;