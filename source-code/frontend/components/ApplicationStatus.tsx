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
  Mail
} from 'lucide-react';
import { getApplication, updateApplication } from '../services/applicationAPI';

interface Application {
  id: string;
  job_id: string;
  job_title: string;
  job_location: string;
  job_type: string;
  company_name: string;
  company_logo?: string;
  applied_at: string;
  status: string;
  cover_letter?: string;
  expected_salary?: number;
  match_score?: number;
  application_number: string;
  updated_at: string;
  notes?: string;
  interview_date?: string;
  feedback?: string;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  event_description: string;
  old_status?: string;
  new_status?: string;
  created_at: string;
  created_by: string;
  metadata?: Record<string, any>;
}

interface ApplicationStatusProps {
  applicationId: string;
  onBack: () => void;
}

const ApplicationStatus = ({ applicationId, onBack }: ApplicationStatusProps) => {
  const [application, setApplication] = useState<Application | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [message, setMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    loadApplicationDetails();
  }, [applicationId]);

  const loadApplicationDetails = async () => {
    try {
      setLoading(true);
      const response = await getApplication(applicationId);
      if (response.success) {
        setApplication(response.data.application);
        setTimeline(response.data.timeline || []);
      }
    } catch (error) {
      console.error('Error loading application details:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'under_review': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'shortlisted': return 'bg-green-100 text-green-800 border-green-200';
      case 'interview': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'offer': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'hired': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
      case 'withdrawn': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <FileText size={20} className="text-blue-600" />;
      case 'under_review': return <Eye size={20} className="text-yellow-600" />;
      case 'shortlisted': return <CheckCircle size={20} className="text-green-600" />;
      case 'interview': return <User size={20} className="text-purple-600" />;
      case 'offer': return <CheckCircle size={20} className="text-indigo-600" />;
      case 'hired': return <CheckCircle size={20} className="text-emerald-600" />;
      case 'rejected': return <XCircle size={20} className="text-red-600" />;
      case 'withdrawn': return <XCircle size={20} className="text-gray-600" />;
      default: return <Clock size={20} className="text-gray-600" />;
    }
  };

  const getTimelineIcon = (eventType: string) => {
    switch (eventType) {
      case 'application_submitted': return <FileText size={16} className="text-blue-600" />;
      case 'status_changed': return <CheckCircle size={16} className="text-green-600" />;
      case 'interview_scheduled': return <Calendar size={16} className="text-purple-600" />;
      case 'feedback_provided': return <MessageSquare size={16} className="text-orange-600" />;
      case 'application_withdrawn': return <XCircle size={16} className="text-red-600" />;
      default: return <Clock size={16} className="text-gray-600" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  };

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      setSendingMessage(true);
      // Here you would call an API to send a message
      // For now, we'll just simulate it
      console.log('Sending message:', message);

      // Add to timeline (simulate)
      const newEvent: TimelineEvent = {
        id: Date.now().toString(),
        event_type: 'message_sent',
        event_description: `Message sent: ${message}`,
        created_at: new Date().toISOString(),
        created_by: 'candidate', // or get from user context
        metadata: { message: message }
      };

      setTimeline(prev => [newEvent, ...prev]);
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const withdrawApplication = async () => {
    if (!application) return;

    if (!confirm('Are you sure you want to withdraw this application? This action cannot be undone.')) {
      return;
    }

    try {
      await updateApplication(application.id, { status: 'withdrawn' });
      setApplication(prev => prev ? { ...prev, status: 'withdrawn' } : null);

      // Add withdrawal event to timeline
      const withdrawalEvent: TimelineEvent = {
        id: Date.now().toString(),
        event_type: 'application_withdrawn',
        event_description: 'Application withdrawn by candidate',
        old_status: application.status,
        new_status: 'withdrawn',
        created_at: new Date().toISOString(),
        created_by: 'candidate'
      };

      setTimeline(prev => [withdrawalEvent, ...prev]);
    } catch (error) {
      console.error('Error withdrawing application:', error);
      alert('Failed to withdraw application. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Application Not Found</h2>
          <p className="text-gray-600 mb-4">The application you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Applications
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Application Status</h1>
                <p className="text-gray-600">Application #{application.application_number}</p>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-lg border-2 flex items-center space-x-2 ${getStatusColor(application.status)}`}>
              {getStatusIcon(application.status)}
              <span className="font-medium capitalize">{application.status.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Job Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Job Details</h2>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-8 h-8 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{application.job_title}</h3>
                  <p className="text-gray-600 mb-2">{application.company_name}</p>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="flex items-center">
                      <Clock size={14} className="mr-1" />
                      Applied {formatRelativeTime(application.applied_at)}
                    </span>
                    <span className="flex items-center">
                      <User size={14} className="mr-1" />
                      {application.job_type}
                    </span>
                  </div>
                  {application.match_score && (
                    <div className="mt-2">
                      <span className="text-sm text-gray-600">Match Score: </span>
                      <span className="font-semibold text-green-600">{application.match_score}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Application Timeline */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Application Timeline</h2>
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={event.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getTimelineIcon(event.event_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{event.event_description}</p>
                        <span className="text-xs text-gray-500">{formatRelativeTime(event.created_at)}</span>
                      </div>
                      {event.old_status && event.new_status && (
                        <p className="text-xs text-gray-600 mt-1">
                          Status changed from <span className="font-medium">{event.old_status.replace('_', ' ')}</span> to{' '}
                          <span className="font-medium">{event.new_status.replace('_', ' ')}</span>
                        </p>
                      )}
                      {event.metadata?.message && (
                        <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700">{event.metadata.message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {timeline.length === 0 && (
                  <div className="text-center py-8">
                    <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">No timeline events yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Rejection Feedback */}
            {application.status === 'rejected' && application.feedback && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-start space-x-3">
                  <XCircle className="w-6 h-6 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-900 mb-2">Application Feedback</h3>
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                      <p className="text-gray-700 whitespace-pre-wrap">{application.feedback}</p>
                    </div>
                    <div className="mt-4 flex items-center space-x-4 text-sm text-red-700">
                      <span>This feedback is provided to help you improve future applications.</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Application Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Applied Date
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(application.applied_at)}</p>
                </div>

                {application.expected_salary && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Expected Salary
                    </label>
                    <p className="text-sm text-gray-900">${application.expected_salary.toLocaleString()}</p>
                  </div>
                )}

                {application.interview_date && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Interview Date
                    </label>
                    <p className="text-sm text-gray-900">{formatDate(application.interview_date)}</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Last Updated
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(application.updated_at)}</p>
                </div>
              </div>
            </div>

            {/* Application Content Toggle */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-between text-left"
              >
                <h3 className="text-lg font-semibold text-gray-900">Application Content</h3>
                {showDetails ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>

              {showDetails && (
                <div className="mt-4 space-y-4">
                  {application.cover_letter && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Cover Letter
                      </label>
                      <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.cover_letter}</p>
                      </div>
                    </div>
                  )}

                  {application.feedback && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Feedback
                      </label>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            {application.status !== 'withdrawn' && application.status !== 'hired' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                <div className="space-y-3">
                  <button
                    onClick={withdrawApplication}
                    className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 flex items-center justify-center space-x-2"
                  >
                    <XCircle size={16} />
                    <span>Withdraw Application</span>
                  </button>
                </div>
              </div>
            )}

            {/* Contact Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Mail size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-600">recruiter@company.com</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-600">+1 (555) 123-4567</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplicationStatus;