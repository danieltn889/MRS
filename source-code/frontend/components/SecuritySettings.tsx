import React, { useState, useEffect } from 'react';
import {
  Shield,
  Monitor,
  Smartphone,
  MapPin,
  Clock,
  LogOut,
  AlertTriangle,
  CheckCircle,
  X,
  Eye,
  EyeOff,
  History,
  Download,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { getActiveSessions, logoutAllDevices, getLoginHistory, exportLoginHistory } from '../services/authAPI';
import { useAuth } from '../context/AuthContext';

export default function SecuritySettings({ onBack }) {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState('sessions');
  const [sessions, setSessions] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Login history filters
  const [filters, setFilters] = useState({
    dateRange: '30days',
    status: 'all',
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'sessions') {
      loadActiveSessions();
    } else if (isAuthenticated && activeTab === 'history') {
      loadLoginHistory();
    }
  }, [isAuthenticated, activeTab, filters.page]);

  const loadActiveSessions = async () => {
    try {
      setLoading(true);
      const result = await getActiveSessions();
      if (result.success) {
        setSessions(result.sessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setError('Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadLoginHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await getLoginHistory(filters);
      if (result.success) {
        setLoginHistory(result.data.history);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      console.error('Failed to load login history:', error);
      setError('Failed to load login history');
    } finally {
      setLoading(false);
    }
  };

  const handleExportHistory = async () => {
    try {
      setError('');
      const blob = await exportLoginHistory(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `login-history-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccess('Login history exported successfully');
    } catch (error) {
      setError('Failed to export login history');
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters({ ...filters, ...newFilters, page: 1 });
  };

  const handleLogoutAll = async () => {
    if (!password.trim()) {
      setError('Please enter your password');
      return;
    }

    try {
      setLogoutLoading(true);
      setError('');

      const result = await logoutAllDevices(password);
      if (result.success) {
        setSuccess(result.message);
        setShowLogoutModal(false);
        setPassword('');
        // Reload sessions to show only current session
        await loadActiveSessions();
      }
    } catch (error) {
      setError(error.message || 'Failed to logout from all devices');
    } finally {
      setLogoutLoading(false);
    }
  };

  const getDeviceIcon = (deviceInfo) => {
    if (!deviceInfo) return <Monitor className="w-5 h-5" />;

    const userAgent = deviceInfo.userAgent || '';
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return <Smartphone className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const formatDeviceInfo = (deviceInfo) => {
    if (!deviceInfo) return 'Unknown Device';

    const browser = deviceInfo.browser || 'Unknown Browser';
    const os = deviceInfo.os || 'Unknown OS';
    return `${browser} on ${os}`;
  };

  const formatLocation = (location) => {
    if (!location) return 'Unknown Location';

    const city = location.city || '';
    const country = location.country || '';
    return [city, country].filter(Boolean).join(', ') || 'Unknown Location';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return 'Invalid Date';
    }
  };

  const otherSessions = sessions.filter(session => !session.is_current);
  const currentSession = sessions.find(session => session.is_current);

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Authentication Check */}
      {!isAuthenticated && (
        <div className="text-center py-12">
          <Shield className="mx-auto h-16 w-16 text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-6">
            You need to be logged in to access Security Settings and view your login history.
          </p>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      {/* Main Content - Only show when authenticated */}
      {isAuthenticated && (
        <>
          <div className="mb-6">
            <button
              onClick={onBack}
              className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Shield className="w-6 h-6 mr-2" />
              Security Settings
            </h1>
            <p className="text-gray-600 mt-1">Manage your account security and monitor login activity</p>
          </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'sessions'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Active Sessions
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Login History
          </button>
        </nav>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">{error}</span>
          <button
            onClick={() => setError('')}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
          <span className="text-green-700">{success}</span>
          <button
            onClick={() => setSuccess('')}
            className="ml-auto text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Sessions Tab */}
      {activeTab === 'sessions' && (
        <>
          {/* Active Sessions Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h2>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading sessions...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Current Session */}
                {currentSession && (
                  <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getDeviceIcon(currentSession.device_info)}
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              {formatDeviceInfo(currentSession.device_info)}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Current Session
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-1" />
                              {formatLocation(currentSession.location)}
                            </div>
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              Started {formatDate(currentSession.created_at)}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Last active: {formatDate(currentSession.last_activity_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Other Sessions */}
                {otherSessions.map((session) => (
                  <div key={session.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        {getDeviceIcon(session.device_info)}
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              {formatDeviceInfo(session.device_info)}
                            </span>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {session.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 mt-1 text-sm text-gray-600">
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 mr-1" />
                              {formatLocation(session.location)}
                            </div>
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-1" />
                              Started {formatDate(session.created_at)}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Last active: {formatDate(session.last_activity_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {sessions.length === 0 && !loading && (
                  <div className="text-center py-8 text-gray-500">
                    <Monitor className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No active sessions found</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Logout All Devices Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <LogOut className="w-5 h-5 mr-2" />
              Log Out from All Devices
            </h2>
            <p className="text-gray-600 mb-4">
              This will log you out from all devices except the one you're currently using.
              You'll need to enter your password to confirm this action.
            </p>

            {otherSessions.length > 0 ? (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                    <span className="text-yellow-800">
                      This will terminate {otherSessions.length} active session{otherSessions.length !== 1 ? 's' : ''}.
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowLogoutModal(true)}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                >
                  Log Out from All Devices
                </button>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-gray-800">
                    You are only logged in on this device. No other active sessions found.
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Login History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Login History</h2>
              <button
                onClick={handleExportHistory}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Filters */}
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => handleFilterChange({ dateRange: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="7days">Last 7 days</option>
                    <option value="30days">Last 30 days</option>
                    <option value="90days">Last 90 days</option>
                    <option value="custom">Custom range</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange({ status: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="success">Successful</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => loadLoginHistory()}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Login History Table */}
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading login history...</p>
              </div>
            ) : loginHistory.length === 0 ? (
              <div className="text-center py-8">
                <History className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No login history</h3>
                <p className="mt-1 text-sm text-gray-500">No login attempts found for the selected filters.</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date & Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Device & Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          IP Address
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {loginHistory.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(entry.created_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <div className="font-medium">{entry.device_info || 'Unknown Device'}</div>
                              <div className="text-gray-500">{entry.location || 'Unknown Location'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              entry.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {entry.status === 'success' ? 'Successful' : 'Failed'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {entry.ip_address || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700">
                        Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleFilterChange({ page: pagination.page - 1 })}
                          disabled={pagination.page <= 1}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => handleFilterChange({ page: pagination.page + 1 })}
                          disabled={pagination.page >= pagination.totalPages}
                          className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Confirm Logout</h3>
            </div>

            <p className="text-gray-600 mb-4">
              This will log you out from <strong>{otherSessions.length} device{otherSessions.length !== 1 ? 's' : ''}</strong> except this one.
              You will receive an email confirmation of this action.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your password to confirm
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  placeholder="Enter your password"
                  disabled={logoutLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowLogoutModal(false);
                  setPassword('');
                  setError('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                disabled={logoutLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutAll}
                disabled={logoutLoading || !password.trim()}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {logoutLoading ? 'Logging out...' : 'Confirm Logout'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}