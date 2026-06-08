import React, { useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Calendar,
  User,
  FileText,
  ArrowLeft,
  Eye,
  EyeOff,
  Send,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  DollarSign,
  Award
} from 'lucide-react';
import { getApplication, withdrawApplication } from '../services/applicationAPI';

// ── Type Definitions ─────────────────────────────────────────────────────────

interface JobDetails {
  id: string;
  title: string;
  department?: string;
  type: string;
  work_arrangement?: string;
  experience_level?: string;
  location?: string;
  description?: string;
  requirements?: string[];
  benefits?: string[];
  salary?: {
    min: number;
    max: number;
    currency: string;
  };
}

interface CompanyDetails {
  id: string;
  name: string;
  logo?: string;
  website?: string;
  description?: string;
  industry?: string;
  size?: string;
}

interface CandidateDetails {
  id: string;
  email: string;
  user_type?: string;
  registered_at?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  phone?: string;
  location?: string;
  headline?: string;
  profile_photo?: string | null;
  portfolio_url?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  summary?: string;
  skills?: string[];
  experience?: Array<{
    title: string;
    company: string;
    start_date: string;
    end_date?: string;
    is_current: boolean;
    description?: string;
  }>;
  education?: Array<{
    degree: string;
    institution: string;
    field_of_study?: string;
    start_date: string;
    end_date?: string;
    is_current: boolean;
  }>;
  languages?: string[];
  current_salary?: Record<string, any>;
  expected_salary?: number | null;
  availability?: {
    status: string;
    notice_period?: string | null;
    available_from?: string | null;
    open_to_opportunities: boolean;
  };
}

interface ApplicationData {
  id: string;
  job_id: string;
  user_id: string;
  status: string;
  applied_at: string;
  updated_at: string;
  match_score?: number;
  rating?: number | null;
  submitted_data?: {
    documents?: Array<{ name: string; size: number; type: string; uploaded: boolean }>;
    matchScore?: number;
    submittedAt?: string;
    screeningAnswers?: Record<string, string>;
    coverLetter?: string;
    expectedSalary?: number;
  };
  screening_answers?: Record<string, string>;
  documents?: Array<{ name: string; size: number; type: string; uploaded: boolean }>;
  notes?: any[];
  internal_notes?: any[];
  tags?: any[];
  match_details?: Record<string, any>;
  metadata?: Record<string, any>;
  job?: JobDetails;
  company?: CompanyDetails;
  candidate?: CandidateDetails;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  event_description: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
  created_by?: string;
  metadata?: Record<string, any>;
}

interface APIResponse {
  success: boolean;
  data: {
    application: ApplicationData;
    timeline: TimelineEvent[];
  };
}

interface ApplicationStatusProps {
  applicationId: string;
  onBack: () => void;
}

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_STEPS = [
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'assessment',
  'reference_check',
  'offer',
  'hired',
];

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    'submitted':       'bg-blue-100 text-blue-800 border-blue-200',
    'under_review':    'bg-yellow-100 text-yellow-800 border-yellow-200',
    'shortlisted':     'bg-green-100 text-green-800 border-green-200',
    'interview':       'bg-purple-100 text-purple-800 border-purple-200',
    'assessment':      'bg-indigo-100 text-indigo-800 border-indigo-200',
    'reference_check': 'bg-cyan-100 text-cyan-800 border-cyan-200',
    'offer':           'bg-emerald-100 text-emerald-800 border-emerald-200',
    'hired':           'bg-green-100 text-green-800 border-green-200',
    'rejected':        'bg-red-100 text-red-800 border-red-200',
    'withdrawn':       'bg-gray-100 text-gray-800 border-gray-200',
    'on_hold':         'bg-orange-100 text-orange-800 border-orange-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    'under_review':    'Under Review',
    'shortlisted':     'Shortlisted',
    'reference_check': 'Reference Check',
    'on_hold':         'On Hold',
  };
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
};

const getStatusIcon = (status: string, size = 20) => {
  const icons: Record<string, React.ReactNode> = {
    'submitted':       <FileText size={size} className="text-blue-600" />,
    'under_review':    <Eye size={size} className="text-yellow-600" />,
    'shortlisted':     <CheckCircle size={size} className="text-green-600" />,
    'interview':       <User size={size} className="text-purple-600" />,
    'assessment':      <Award size={size} className="text-indigo-600" />,
    'reference_check': <User size={size} className="text-cyan-600" />,
    'offer':           <CheckCircle size={size} className="text-emerald-600" />,
    'hired':           <CheckCircle size={size} className="text-green-600" />,
    'rejected':        <XCircle size={size} className="text-red-600" />,
    'withdrawn':       <XCircle size={size} className="text-gray-600" />,
    'on_hold':         <Clock size={size} className="text-orange-600" />,
  };
  return icons[status] || <Clock size={size} className="text-gray-600" />;
};

const getTimelineIcon = (eventType: string) => {
  const icons: Record<string, React.ReactNode> = {
    'application_submitted':  <FileText size={15} className="text-blue-600" />,
    'status_changed':         <CheckCircle size={15} className="text-green-600" />,
    'interview_scheduled':    <Calendar size={15} className="text-purple-600" />,
    'feedback_provided':      <MessageSquare size={15} className="text-orange-600" />,
    'application_withdrawn':  <XCircle size={15} className="text-red-600" />,
    'message_sent':           <Send size={15} className="text-blue-600" />,
  };
  return icons[eventType] || <Clock size={15} className="text-gray-600" />;
};

// ── Main component ─────────────────────────────────────────────────────────

const ApplicationStatus: React.FC<ApplicationStatusProps> = ({ applicationId, onBack }) => {
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplicationDetails();
  }, [applicationId]);

  const loadApplicationDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getApplication(applicationId) as APIResponse;

      if (response.success && response.data) {
        // The data is nested under data.application
        const appData = response.data.application;
        const timelineData = response.data.timeline || [];
        
        setApplication(appData);
        setTimeline(timelineData);
      } else {
        setError('Failed to load application details.');
      }
    } catch (err) {
      console.error('Error loading application details:', err);
      setError('Failed to load application details.');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!application) return;
    if (!window.confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) return;

    try {
      setWithdrawing(true);
      const response = await withdrawApplication(application.id);

      if (response.success) {
        setApplication(prev => prev ? { ...prev, status: 'withdrawn' } : null);
        const withdrawalEvent: TimelineEvent = {
          id: Date.now().toString(),
          event_type: 'application_withdrawn',
          event_description: 'Application withdrawn by candidate',
          old_status: application.status,
          new_status: 'withdrawn',
          created_at: new Date().toISOString(),
          created_by: 'candidate',
        };
        setTimeline(prev => [withdrawalEvent, ...prev]);
      } else {
        alert(response.message || 'Failed to withdraw application.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to withdraw application.');
    } finally {
      setWithdrawing(false);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return 'Invalid date';
    }
  };

  const formatRelativeTime = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - date.getTime());
      const diffMins  = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays  = Math.floor(diffMs / 86400000);
      if (diffMins  < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays  === 1) return '1 day ago';
      if (diffDays  < 7)  return `${diffDays} days ago`;
      return formatDate(dateString);
    } catch {
      return '';
    }
  };

  const formatSalary = (): string | null => {
    const job = application?.job;
    if (!job?.salary) return null;
    
    const { min, max, currency } = job.salary;
    const fmt = (n: number) => n.toLocaleString();
    
    if (min && max && min !== max) return `${currency} ${fmt(min)} – ${fmt(max)}`;
    if (min) return `From ${currency} ${fmt(min)}`;
    if (max) return `Up to ${currency} ${fmt(max)}`;
    return null;
  };

  const getCoverLetter = (): string => {
    // Try to get cover letter from submitted_data
    if (application?.submitted_data?.coverLetter) {
      return application.submitted_data.coverLetter;
    }
    // Check if there's a cover letter document
    const coverLetterDoc = application?.documents?.find(doc => doc.type === 'Cover Letter');
    if (coverLetterDoc) {
      return `Cover Letter: ${coverLetterDoc.name}`;
    }
    return '';
  };

  const getExpectedSalary = (): number | null => {
    return application?.submitted_data?.expectedSalary || 
           (application?.candidate?.expected_salary as number) || 
           null;
  };

  // Progress tracker — only for non-terminal statuses
  const currentStepIndex = STATUS_STEPS.indexOf(application?.status || '');
  const isTerminal = ['rejected', 'withdrawn', 'on_hold'].includes(application?.status || '');

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading application details…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !application) {
    return (
      <div className="fixed inset-0 bg-white z-50 flex items-center justify-center">
        <div className="text-center px-6">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Application Not Found</h2>
          <p className="text-gray-500 mb-6 max-w-sm">
            {error || "The application you're looking for doesn't exist or has been removed."}
          </p>
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Back to Applications
          </button>
        </div>
      </div>
    );
  }

  const salaryDisplay = formatSalary();
  const candidate = application.candidate;
  const job = application.job;
  const company = application.company;
  const candidateName = candidate ? `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() : '';
  const coverLetter = getCoverLetter();
  const expectedSalary = getExpectedSalary();

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto">

      {/* ── Header ── */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={18} />
                <span className="text-sm font-medium">Back</span>
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Application Details</h1>
                <p className="text-xs text-gray-500">#{application.id?.slice(0, 8)}</p>
              </div>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-2 text-sm font-medium ${getStatusColor(application.status)}`}>
              {getStatusIcon(application.status, 16)}
              {getStatusLabel(application.status)}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left / Main ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Job card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-start gap-4">
                {company?.logo ? (
                  <img
                    src={company.logo}
                    alt={company.name || 'Company'}
                    className="w-14 h-14 rounded-xl object-cover border border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Briefcase size={22} className="text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">
                    {job?.title || 'Untitled Position'}
                  </h2>
                  <p className="text-sm text-gray-500 mb-2">{company?.name || 'Company'}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {job?.location && (
                      <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                    )}
                    {job?.type && (
                      <span className="flex items-center gap-1"><Briefcase size={11} />{job.type.replace('-', ' ')}</span>
                    )}
                    {job?.experience_level && (
                      <span className="flex items-center gap-1"><Award size={11} />{job.experience_level}</span>
                    )}
                    {salaryDisplay && (
                      <span className="flex items-center gap-1"><DollarSign size={11} />{salaryDisplay}</span>
                    )}
                  </div>
                  {application.match_score !== undefined && application.match_score > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Profile match:</span>
                      <div className="flex-1 max-w-[120px] bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            application.match_score >= 80 ? 'bg-green-500' :
                            application.match_score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(application.match_score, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${
                        application.match_score >= 80 ? 'text-green-600' :
                        application.match_score >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>{application.match_score}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Progress tracker */}
            {!isTerminal && currentStepIndex >= 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Application Progress</h2>
                <div className="relative">
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200" />
                  <div
                    className="absolute top-4 left-4 h-0.5 bg-blue-500 transition-all"
                    style={{
                      width: `${(currentStepIndex / (STATUS_STEPS.length - 1)) * 100}%`,
                    }}
                  />
                  <div className="relative flex justify-between">
                    {STATUS_STEPS.map((step, idx) => {
                      const done    = idx < currentStepIndex;
                      const current = idx === currentStepIndex;
                      return (
                        <div key={step} className="flex flex-col items-center gap-1" style={{ minWidth: 0 }}>
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 ${
                            done    ? 'bg-blue-500 border-blue-500' :
                            current ? 'bg-white border-blue-500' :
                                      'bg-white border-gray-200'
                          }`}>
                            {done
                              ? <CheckCircle size={16} className="text-white" />
                              : current
                              ? <div className="w-3 h-3 rounded-full bg-blue-500" />
                              : <div className="w-3 h-3 rounded-full bg-gray-200" />
                            }
                          </div>
                          <span className={`text-xs text-center leading-tight ${
                            current ? 'text-blue-600 font-semibold' :
                            done    ? 'text-gray-500' : 'text-gray-300'
                          }`} style={{ maxWidth: 56 }}>
                            {getStatusLabel(step)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Terminal status banner */}
            {isTerminal && (
              <div className={`rounded-xl border p-4 flex items-center gap-3 ${
                application.status === 'rejected'  ? 'bg-red-50 border-red-200' :
                application.status === 'withdrawn' ? 'bg-gray-50 border-gray-200' :
                                                     'bg-orange-50 border-orange-200'
              }`}>
                {getStatusIcon(application.status, 20)}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {application.status === 'rejected'  ? 'Application Not Successful' :
                     application.status === 'withdrawn' ? 'Application Withdrawn' :
                                                          'Application On Hold'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {application.status === 'rejected'
                      ? 'Thank you for your interest. This application was not selected.'
                      : application.status === 'withdrawn'
                      ? 'You withdrew this application.'
                      : 'This application is currently on hold.'}
                  </p>
                </div>
              </div>
            )}

            {/* Rejection reason - would need to be added to API */}
            {application.status === 'rejected' && application.metadata?.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 mb-1">Rejection Reason</h3>
                    <p className="text-sm text-red-700">{String(application.metadata.rejection_reason)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback */}
            {application.metadata?.feedback && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2">Feedback from Recruiter</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{String(application.metadata.feedback)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Activity Timeline</h2>
              {timeline.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No activity recorded yet</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-5">
                    {timeline.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 relative">
                        <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 z-10">
                          {getTimelineIcon(event.event_type)}
                        </div>
                        <div className="flex-1 min-w-0 pt-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900">{event.event_description}</p>
                            <span className="text-xs text-gray-400 shrink-0">{formatRelativeTime(event.created_at)}</span>
                          </div>
                          {event.old_status && event.new_status && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              <span className="font-medium">{getStatusLabel(event.old_status)}</span>
                              {' → '}
                              <span className="font-medium">{getStatusLabel(event.new_status)}</span>
                            </p>
                          )}
                          {event.metadata?.message && (
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <p className="text-xs text-gray-600">{String(event.metadata.message)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right / Sidebar ── */}
          <div className="space-y-5">

            {/* Application details */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Application Details</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Applied</p>
                  <p className="text-sm text-gray-800">{formatDate(application.applied_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Last Updated</p>
                  <p className="text-sm text-gray-800">{formatDate(application.updated_at)}</p>
                </div>
                {application.metadata?.interview_date && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Interview Date</p>
                    <p className="text-sm text-gray-800 flex items-center gap-1">
                      <Calendar size={13} className="text-purple-500" />
                      {formatDate(String(application.metadata.interview_date))}
                    </p>
                  </div>
                )}
                {salaryDisplay && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Job Salary</p>
                    <p className="text-sm text-gray-800">{salaryDisplay}</p>
                  </div>
                )}
                {expectedSalary && (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">Expected Salary</p>
                    <p className="text-sm text-gray-800">
                      {job?.salary?.currency || 'Rwf'} {expectedSalary.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Candidate info */}
            {(candidateName || candidate?.email || candidate?.phone) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Your Info on File</h3>
                <div className="space-y-2.5">
                  {candidateName && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <User size={14} className="text-gray-400 shrink-0" />
                      <span>{candidateName}</span>
                      {candidate?.headline && (
                        <span className="text-xs text-gray-400 truncate">· {candidate.headline}</span>
                      )}
                    </div>
                  )}
                  {candidate?.email && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Mail size={14} className="text-gray-400 shrink-0" />
                      <span className="truncate">{candidate.email}</span>
                    </div>
                  )}
                  {candidate?.phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Phone size={14} className="text-gray-400 shrink-0" />
                      <span>{candidate.phone}</span>
                    </div>
                  )}
                  {candidate?.location && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <MapPin size={14} className="text-gray-400 shrink-0" />
                      <span>{candidate.location}</span>
                    </div>
                  )}
                  {candidate?.github_url && (
                    <a href={candidate.github_url} target="_blank" rel="noopener noreferrer" 
                      className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.604-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.195.69.795.575C20.565 21.795 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                      </svg>
                      GitHub Profile
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Skills */}
            {candidate?.skills && candidate.skills.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, idx) => (
                    <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cover letter toggle */}
            {coverLetter && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <button
                  onClick={() => setShowCoverLetter(prev => !prev)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">Cover Letter</h3>
                  {showCoverLetter ? <EyeOff size={16} className="text-gray-400" /> : <Eye size={16} className="text-gray-400" />}
                </button>
                {showCoverLetter && (
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {coverLetter}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Withdraw action */}
            {!['withdrawn', 'hired', 'rejected'].includes(application.status) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Actions</h3>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing}
                  className="w-full px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                >
                  {withdrawing ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700" />
                  ) : (
                    <XCircle size={15} />
                  )}
                  Withdraw Application
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicationStatus;