import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  User,
  Briefcase,
  GraduationCap,
  Award,
  Globe,
  ArrowLeft,
  Eye,
  EyeOff,
  Clock,
  Calendar,
  MapPin,
  DollarSign,
  Mail,
  Phone,
  Linkedin,
  Github,
  ExternalLink
} from 'lucide-react';
import { getApplications, withdrawApplication } from '../services/applicationAPI';
import ApplicationStatus from './ApplicationStatus';

interface Application {
  id: string;
  job_id: string;
  job_title?: string;
  job_location?: string;
  job_type?: string;
  experience_level?: string;
  company_name?: string;
  company_logo?: string;
  applied_at: string;
  status: 'submitted' | 'under_review' | 'shortlisted' | 'interview' | 'assessment' | 'reference_check' | 'offer' | 'hired' | 'rejected' | 'withdrawn' | 'on_hold';
  cover_letter?: string;
  expected_salary?: number;
  match_score?: number;
  application_number: string;
  updated_at?: string;
  interview_date?: string;
  rejection_reason?: string;
  feedback?: string;
  candidate_location?: string;
  candidate_headline?: string;
  candidate_profile_photo?: string;
}

interface ApplicationRequirementsProps {
  onBack: () => void;
}

const ApplicationRequirements: React.FC<ApplicationRequirementsProps> = ({ onBack }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('ApplicationRequirements: Loading applications from API...');
      const response = await getApplications({ limit: 50 });
      console.log('ApplicationRequirements: API response:', response);
      
      if (response.success && response.data && response.data.applications) {
        console.log('ApplicationRequirements: Using real API data:', response.data.applications.length, 'applications');
        setApplications(response.data.applications);
      } else {
        console.log('ApplicationRequirements: API returned no data');
        setApplications([]);
      }
    } catch (error) {
      console.error('ApplicationRequirements: Error loading applications:', error);
      setError('Failed to load applications. Please try again.');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (applicationId: string) => {
    if (!window.confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) {
      return;
    }

    try {
      setWithdrawingId(applicationId);
      const response = await withdrawApplication(applicationId);
      
      if (response.success) {
        // Update local state
        setApplications(prevApps =>
          prevApps.map(app =>
            app.id === applicationId
              ? { ...app, status: 'withdrawn' as const, updated_at: new Date().toISOString() }
              : app
          )
        );
        alert('Application withdrawn successfully');
      } else {
        alert(response.message || 'Failed to withdraw application');
      }
    } catch (error: any) {
      console.error('Withdraw error:', error);
      alert(error.message || 'Failed to withdraw application');
    } finally {
      setWithdrawingId(null);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'under_review': return 'bg-yellow-100 text-yellow-800';
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'interview': return 'bg-purple-100 text-purple-800';
      case 'assessment': return 'bg-indigo-100 text-indigo-800';
      case 'reference_check': return 'bg-cyan-100 text-cyan-800';
      case 'offer': return 'bg-emerald-100 text-emerald-800';
      case 'hired': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'withdrawn': return 'bg-gray-100 text-gray-800';
      case 'on_hold': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'submitted': return <FileText size={16} />;
      case 'under_review': return <Eye size={16} />;
      case 'shortlisted': return <CheckCircle size={16} />;
      case 'interview': return <User size={16} />;
      case 'assessment': return <GraduationCap size={16} />;
      case 'offer': return <Award size={16} />;
      case 'hired': return <CheckCircle size={16} />;
      case 'rejected': return <XCircle size={16} />;
      case 'withdrawn': return <XCircle size={16} />;
      case 'on_hold': return <Clock size={16} />;
      default: return <FileText size={16} />;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'under_review': return 'Under Review';
      case 'shortlisted': return 'Shortlisted';
      case 'reference_check': return 'Reference Check';
      case 'on_hold': return 'On Hold';
      default: return status.replace('_', ' ');
    }
  };

  const canWithdraw = (status: string): boolean => {
    return ['submitted', 'under_review', 'shortlisted'].includes(status);
  };

  const checkUserRequirements = (application: Application) => {
    const requirements = [];

    // Application completeness check
    const appCompleteReq = {
      title: 'Application Complete',
      required: true,
      status: application.application_number ? 'met' : 'not_met',
      description: 'Full application submitted with all required fields'
    };
    requirements.push(appCompleteReq);

    // Status requirement
    const statusReq = {
      title: 'Application Status',
      required: 'Active',
      status: application.status !== 'rejected' && application.status !== 'withdrawn' ? 'met' : 'not_met',
      description: `Current status: ${getStatusLabel(application.status)}`
    };
    requirements.push(statusReq);

    // Cover letter requirement
    const coverLetterReq = {
      title: 'Cover Letter',
      required: 'Recommended',
      status: application.cover_letter ? 'met' : 'partial',
      description: application.cover_letter ? 'Cover letter provided' : 'Cover letter not provided (optional)'
    };
    requirements.push(coverLetterReq);

    // Salary expectations
    const salaryReq = {
      title: 'Salary Expectations',
      required: 'Provided',
      status: application.expected_salary ? 'met' : 'not_met',
      description: application.expected_salary 
        ? `Expected: $${application.expected_salary.toLocaleString()}`
        : 'Salary expectations not specified'
    };
    requirements.push(salaryReq);

    return requirements;
  };

  const getRequirementStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'met':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'not_met':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getRequirementStatusLabel = (status: string): { text: string; className: string } => {
    switch (status) {
      case 'met':
        return { text: 'Met', className: 'bg-green-100 text-green-800' };
      case 'not_met':
        return { text: 'Not Met', className: 'bg-red-100 text-red-800' };
      case 'partial':
        return { text: 'Partial', className: 'bg-yellow-100 text-yellow-800' };
      default:
        return { text: 'Unknown', className: 'bg-gray-100 text-gray-800' };
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMatchScoreColor = (score?: number): string => {
    if (!score) return 'bg-gray-200';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const filteredApplications = filterStatus === 'all'
    ? applications
    : applications.filter(app => app.status === filterStatus);

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900 flex items-center space-x-1"
              >
                <ArrowLeft size={20} />
                <span>Back</span>
              </button>
              <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
            </div>
            <div className="text-sm text-gray-600">
              {applications.length} total applications
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
            <button
              onClick={loadApplications}
              className="mt-2 text-sm text-red-600 hover:text-red-800"
            >
              Try again
            </button>
          </div>
        )}

        {/* Status Filter Bar */}
        {applications.length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1 rounded-full text-sm ${
                  filterStatus === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({applications.length})
              </button>
              {Object.entries(statusCounts).map(([status, count]) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 rounded-full text-sm ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : `bg-gray-100 text-gray-700 hover:bg-gray-200`
                  }`}
                >
                  {getStatusLabel(status)} ({count})
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredApplications.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
            <p className="text-gray-600 mb-4">
              {applications.length === 0 
                ? "You haven't applied to any jobs yet."
                : `No applications with status: ${getStatusLabel(filterStatus)}`}
            </p>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Browse Jobs
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredApplications.map((application) => (
              <div key={application.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {application.company_logo && (
                          <img 
                            src={application.company_logo} 
                            alt={application.company_name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900">
                          {application.job_title || 'Untitled Position'}
                        </h3>
                      </div>
                      <p className="text-gray-600 mb-2">{application.company_name || 'Company'}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500 mb-3">
                        {application.job_location && (
                          <span className="flex items-center">
                            <MapPin size={14} className="mr-1" />
                            {application.job_location}
                          </span>
                        )}
                        {application.job_type && (
                          <span className="flex items-center">
                            <Briefcase size={14} className="mr-1" />
                            {application.job_type}
                          </span>
                        )}
                        {application.expected_salary && (
                          <span className="flex items-center">
                            <DollarSign size={14} className="mr-1" />
                            ${application.expected_salary.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full flex items-center space-x-1 ${getStatusColor(application.status)}`}>
                          {getStatusIcon(application.status)}
                          <span>{getStatusLabel(application.status)}</span>
                        </span>
                        <span className="text-xs text-gray-500 flex items-center">
                          <Calendar size={12} className="mr-1" />
                          Applied {formatDate(application.applied_at)}
                        </span>
                        {application.match_score !== undefined && application.match_score > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-16 bg-gray-200 rounded-full h-1.5">
                              <div 
                                className={`${getMatchScoreColor(application.match_score)} h-1.5 rounded-full`}
                                style={{ width: `${application.match_score}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">{application.match_score}% match</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400 font-mono">
                        #{application.application_number}
                      </div>
                    </div>
                  </div>

                  {/* Requirements Check */}
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Application Requirements</h4>
                    <div className="space-y-2">
                      {checkUserRequirements(application).map((req, index) => {
                        const statusInfo = getRequirementStatusLabel(req.status);
                        return (
                          <div key={index} className="flex items-center justify-between py-2">
                            <div className="flex items-center space-x-2">
                              {getRequirementStatusIcon(req.status)}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{req.title}</p>
                                <p className="text-xs text-gray-600">{req.description}</p>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full ${statusInfo.className}`}>
                              {statusInfo.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interview Date if scheduled */}
                  {application.interview_date && (
                    <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex items-center space-x-2">
                        <Calendar size={16} className="text-purple-600" />
                        <span className="text-sm font-medium text-purple-900">Interview Scheduled:</span>
                        <span className="text-sm text-purple-700">{formatDateTime(application.interview_date)}</span>
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason if rejected */}
                  {application.status === 'rejected' && application.rejection_reason && (
                    <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-start space-x-2">
                        <XCircle size={16} className="text-red-600 mt-0.5" />
                        <div>
                          <span className="text-sm font-medium text-red-900">Rejection Reason:</span>
                          <p className="text-sm text-red-700 mt-1">{application.rejection_reason}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-2 mt-4 pt-4 border-t">
                    <button
                      onClick={() => {
                        setSelectedApplication(application);
                        setShowDetails(true);
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center space-x-1"
                    >
                      <Eye size={14} />
                      <span>View Details</span>
                    </button>
                    {canWithdraw(application.status) && (
                      <button
                        onClick={() => handleWithdraw(application.id)}
                        disabled={withdrawingId === application.id}
                        className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
                      >
                        {withdrawingId === application.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700"></div>
                        ) : (
                          <XCircle size={14} />
                        )}
                        <span>Withdraw</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Application Status View Modal */}
      {showDetails && selectedApplication && (
        <ApplicationStatus
          applicationId={selectedApplication.id}
          onBack={() => {
            setShowDetails(false);
            setSelectedApplication(null);
          }}
        />
      )}
    </div>
  );
};

export default ApplicationRequirements;