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
  status: 'submitted'| 'under_review'| 'shortlisted'| 'interview'| 'assessment'| 'reference_check'| 'offer'| 'hired'| 'rejected'| 'withdrawn'| 'on_hold';
  cover_letter?: string;
  expected_salary?: number;
  notice_period?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  github_url?: string;
  availability?: string;
  match_score?: number;
  application_number: string;
  updated_at?: string;
  interview_date?: string;
  rejection_reason?: string;
  feedback?: string;
  // Salary info
  salary_min?: string;
  salary_max?: string;
  salary_currency?: string;
  // Candidate info (as returned by API)
  candidate_email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  candidate_location?: string;
  headline?: string;
  profile_photo_url?: string | null;
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
      const response = await getApplications({ limit: 50 });

      if (response.success && response.data && response.data.applications) {
        setApplications(response.data.applications);
      } else {
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
        setApplications(prev =>
          prev.map(app =>
            app.id === applicationId
              ? { ...app, status: 'withdrawn'as const, updated_at: new Date().toISOString() }
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
      case 'submitted':       return 'bg-blue-100 text-blue-800';
      case 'under_review':    return 'bg-yellow-100 text-yellow-800';
      case 'shortlisted':     return 'bg-green-100 text-green-800';
      case 'interview':       return 'bg-purple-100 text-purple-800';
      case 'assessment':      return 'bg-indigo-100 text-indigo-800';
      case 'reference_check': return 'bg-cyan-100 text-cyan-800';
      case 'offer':           return 'bg-emerald-100 text-emerald-800';
      case 'hired':           return 'bg-green-100 text-green-800';
      case 'rejected':        return 'bg-red-100 text-red-800';
      case 'withdrawn':       return 'bg-gray-100 text-gray-800';
      case 'on_hold':         return 'bg-orange-100 text-orange-800';
      default:                return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'submitted':       return <FileText size={14} />;
      case 'under_review':    return <Eye size={14} />;
      case 'shortlisted':     return <CheckCircle size={14} />;
      case 'interview':       return <User size={14} />;
      case 'assessment':      return <GraduationCap size={14} />;
      case 'reference_check': return <Globe size={14} />;
      case 'offer':           return <Award size={14} />;
      case 'hired':           return <CheckCircle size={14} />;
      case 'rejected':        return <XCircle size={14} />;
      case 'withdrawn':       return <XCircle size={14} />;
      case 'on_hold':         return <Clock size={14} />;
      default:                return <FileText size={14} />;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'under_review':    return 'Under Review';
      case 'shortlisted':     return 'Shortlisted';
      case 'reference_check': return 'Reference Check';
      case 'on_hold':         return 'On Hold';
      default: return status.charAt(0).toUpperCase() + status.slice(1).replace('_', '');
    }
  };

  const canWithdraw = (status: string): boolean =>
    ['submitted', 'under_review', 'shortlisted'].includes(status);

  // ── Salary display helper ──────────────────────────────────────────────────
  const formatSalary = (app: Application): string | null => {
    const currency = app.salary_currency || 'Rwf';
    const fmt = (n: string | number) => Number(n).toLocaleString();
    if (app.salary_min && app.salary_max)
      return `${currency} ${fmt(app.salary_min)} – ${fmt(app.salary_max)}`;
    if (app.salary_min) return `From ${currency} ${fmt(app.salary_min)}`;
    if (app.salary_max) return `Up to ${currency} ${fmt(app.salary_max)}`;
    if (app.expected_salary)
      return `${currency} ${app.expected_salary.toLocaleString()} (expected)`;
    return null;
  };

  // ── Requirements check ─────────────────────────────────────────────────────
  const checkUserRequirements = (application: Application) => {
    return [
      {
        title: 'Application Submitted',
        status: application.application_number ? 'met': 'not_met',
        description: application.application_number
          ? `Application #${application.application_number}`
          : 'Application not properly submitted',
      },
      {
        title: 'Application Status',
        status: !['rejected', 'withdrawn'].includes(application.status) ? 'met': 'not_met',
        description: `Current status: ${getStatusLabel(application.status)}`,
      },
      {
        title: 'Cover Letter',
        status: application.cover_letter ? 'met': 'partial',
        description: application.cover_letter
          ? 'Cover letter provided'
          : 'Cover letter not provided (optional but recommended)',
      },
      {
        title: 'Salary Expectations',
        status: application.expected_salary ? 'met': 'partial',
        description: application.expected_salary
          ? `Expected: ${application.salary_currency || 'Rwf'} ${application.expected_salary.toLocaleString()}`
          : 'Salary expectations not specified',
      },
      {
        title: 'Contact Information',
        status: application.candidate_email || application.phone ? 'met': 'not_met',
        description: application.candidate_email
          ? `Email: ${application.candidate_email}`
          : 'No contact information on file',
      },
    ];
  };

  const getRequirementStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'met':     return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'not_met': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'partial': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getRequirementStatusLabel = (status: string): { text: string; className: string } => {
    switch (status) {
      case 'met':     return { text: 'Met',     className: 'bg-green-100 text-green-800'};
      case 'not_met': return { text: 'Not Met', className: 'bg-red-100 text-red-800'};
      case 'partial': return { text: 'Partial', className: 'bg-yellow-100 text-yellow-800'};
      default:        return { text: 'Unknown', className: 'bg-gray-100 text-gray-800'};
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getMatchScoreColor = (score?: number): string => {
    if (!score) return 'bg-gray-200';
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getMatchScoreLabel = (score?: number): string => {
    if (!score) return '';
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Low';
  };

  const filteredApplications = filterStatus === 'all'
    ? applications
    : applications.filter(app => app.status === filterStatus);

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading your applications…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900 flex items-center space-x-1 transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Back</span>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Track the status of your job applications
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {applications.length} application{applications.length !== 1 ? 's': ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* ── Error ── */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
            <button
              onClick={loadApplications}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Summary cards ── */}
        {applications.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total',      value: applications.length,                                          color: 'bg-blue-500'},
              { label: 'Active',     value: applications.filter(a => !['rejected','withdrawn'].includes(a.status)).length, color: 'bg-green-500'},
              { label: 'Interviews', value: applications.filter(a => a.status === 'interview').length,    color: 'bg-purple-500'},
              { label: 'Offers',     value: applications.filter(a => ['offer','hired'].includes(a.status)).length, color: 'bg-emerald-500'},
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
                <div className={`w-10 h-10 ${card.color} bg-opacity-10 rounded-lg flex items-center justify-center`}>
                  <span className={`text-lg font-bold ${card.color.replace('bg-', 'text-')}`}>{card.value}</span>
                </div>
                <span className="text-sm text-gray-600 font-medium">{card.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Status filter ── */}
        {applications.length > 0 && (
          <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
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
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {getStatusLabel(status)} ({count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {filteredApplications.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
            <FileText className="w-14 h-14 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No applications found</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              {applications.length === 0
                ? "You haven't applied to any jobs yet. Start exploring opportunities!"
                : `No applications with status: ${getStatusLabel(filterStatus)}`}
            </p>
            <button
              onClick={onBack}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Browse Jobs
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredApplications.map(application => {
              const salaryDisplay = formatSalary(application);
              const candidateName = [application.first_name, application.last_name].filter(Boolean).join('');
              const requirements = checkUserRequirements(application);
              const metCount = requirements.filter(r => r.status === 'met').length;

              return (
                <div
                  key={application.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="p-6 flex-1">

                    {/* ── Card header ── */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {application.company_logo ? (
                          <img
                            src={application.company_logo}
                            alt={application.company_name || 'Company'}
                            className="w-11 h-11 rounded-xl object-cover border border-gray-200 shrink-0"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                            <Briefcase size={18} className="text-white" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 truncate">
                            {application.job_title || 'Untitled Position'}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {application.company_name || 'Company'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 font-mono shrink-0 ml-2">
                        #{application.application_number}
                      </span>
                    </div>

                    {/* ── Job meta ── */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 mb-3">
                      {application.job_location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />{application.job_location}
                        </span>
                      )}
                      {application.job_type && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} />{application.job_type.replace('-', '')}
                        </span>
                      )}
                      {application.experience_level && (
                        <span className="flex items-center gap-1">
                          <Award size={12} />{application.experience_level}
                        </span>
                      )}
                      {salaryDisplay && (
                        <span className="flex items-center gap-1">
                          <DollarSign size={12} />{salaryDisplay}
                        </span>
                      )}
                    </div>

                    {/* ── Status row ── */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${getStatusColor(application.status)}`}>
                        {getStatusIcon(application.status)}
                        {getStatusLabel(application.status)}
                      </span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar size={11} />Applied {formatDate(application.applied_at)}
                      </span>
                      {application.updated_at && application.updated_at !== application.applied_at && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={11} />Updated {formatDate(application.updated_at)}
                        </span>
                      )}
                    </div>

                    {/* ── Match score ── */}
                    {application.match_score !== undefined && application.match_score > 0 && (
                      <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600 font-medium">Profile Match</span>
                            <span className={`font-bold ${
                              application.match_score >= 80 ? 'text-green-600':
                              application.match_score >= 60 ? 'text-yellow-600':
                              'text-red-600'
                            }`}>
                              {application.match_score}%   {getMatchScoreLabel(application.match_score)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`${getMatchScoreColor(application.match_score)} h-1.5 rounded-full transition-all`}
                              style={{ width: `${application.match_score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Candidate info (compact) ── */}
                    {(candidateName || application.candidate_email || application.phone) && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs font-semibold text-blue-800 mb-1.5">Your Contact Info on File</p>
                        <div className="space-y-1">
                          {candidateName && (
                            <p className="text-xs text-blue-700 flex items-center gap-1.5">
                              <User size={11} />{candidateName}
                              {application.headline && <span className="text-blue-500">· {application.headline}</span>}
                            </p>
                          )}
                          {application.candidate_email && (
                            <p className="text-xs text-blue-700 flex items-center gap-1.5">
                              <Mail size={11} />{application.candidate_email}
                            </p>
                          )}
                          {application.phone && (
                            <p className="text-xs text-blue-700 flex items-center gap-1.5">
                              <Phone size={11} />{application.phone}
                            </p>
                          )}
                          {application.candidate_location && (
                            <p className="text-xs text-blue-700 flex items-center gap-1.5">
                              <MapPin size={11} />{application.candidate_location}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Requirements check ── */}
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-800">Application Checklist</h4>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          metCount === requirements.length
                            ? 'bg-green-100 text-green-700'
                            : metCount >= requirements.length / 2
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {metCount}/{requirements.length} met
                        </span>
                      </div>
                      <div className="space-y-2">
                        {requirements.map((req, index) => {
                          const statusInfo = getRequirementStatusLabel(req.status);
                          return (
                            <div key={index} className="flex items-center justify-between py-1.5">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {getRequirementStatusIcon(req.status)}
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{req.title}</p>
                                  <p className="text-xs text-gray-500 truncate">{req.description}</p>
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ml-2 ${statusInfo.className}`}>
                                {statusInfo.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Interview scheduled ── */}
                    {application.interview_date && (
                      <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2">
                          <Calendar size={15} className="text-purple-600 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-purple-900">Interview Scheduled</p>
                            <p className="text-xs text-purple-700">{formatDateTime(application.interview_date)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Rejection reason ── */}
                    {application.status === 'rejected'&& application.rejection_reason && (
                      <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="flex items-start gap-2">
                          <XCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-red-900">Rejection Reason</p>
                            <p className="text-xs text-red-700 mt-0.5">{application.rejection_reason}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Feedback ── */}
                    {application.feedback && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex items-start gap-2">
                          <FileText size={15} className="text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-blue-900">Feedback</p>
                            <p className="text-xs text-blue-700 mt-0.5">{application.feedback}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Actions ── */}
                  <div className="px-6 pb-5 flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedApplication(application);
                        setShowDetails(true);
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1.5 font-medium transition-colors"
                    >
                      <Eye size={14} />
                      View Details
                    </button>
                    {canWithdraw(application.status) && (
                      <button
                        onClick={() => handleWithdraw(application.id)}
                        disabled={withdrawingId === application.id}
                        className="px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 font-medium transition-colors"
                      >
                        {withdrawingId === application.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700" />
                        ) : (
                          <XCircle size={14} />
                        )}
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Application Status Detail Modal ── */}
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