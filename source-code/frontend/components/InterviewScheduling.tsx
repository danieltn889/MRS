import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  Video,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Edit,
  Trash2,
  Send,
  Eye,
  User,
  Building,
  MessageSquare,
  Bell,
  Settings,
  Search,
  Filter,
  Download,
  Upload,
  FileText,
  Star
} from 'lucide-react';

interface Interview {
  id: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  type: 'phone'| 'video'| 'onsite'| 'panel';
  status: 'scheduled'| 'confirmed'| 'completed'| 'cancelled'| 'no_show';
  scheduledAt: string;
  duration: number; // minutes
  interviewers: Interviewer[];
  location?: string;
  meetingLink?: string;
  notes?: string;
  feedback?: InterviewFeedback;
  createdAt: string;
  updatedAt: string;
}

interface Interviewer {
  id: string;
  name: string;
  email: string;
  role: string;
  availability: string[];
}

interface InterviewFeedback {
  overallRating: number;
  technicalSkills: number;
  communication: number;
  culturalFit: number;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'strong_hire'| 'hire'| 'maybe'| 'no_hire';
  notes: string;
  submittedAt: string;
  submittedBy: string;
}

interface InterviewSchedulingProps {
  onBack: () => void;
}

const InterviewScheduling = ({ onBack }: InterviewSchedulingProps) => {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [newInterview, setNewInterview] = useState({
    candidateId: '',
    candidateName: '',
    jobTitle: '',
    type: 'video'as const,
    scheduledAt: '',
    duration: 60,
    interviewers: [] as Interviewer[],
    location: '',
    meetingLink: '',
    notes: ''
  });

  const [feedback, setFeedback] = useState({
    overallRating: 3,
    technicalSkills: 3,
    communication: 3,
    culturalFit: 3,
    strengths: [] as string[],
    weaknesses: [] as string[],
    recommendation: 'maybe'as const,
    notes: ''
  });

  useEffect(() => {
    loadInterviews();
  }, []);

  const loadInterviews = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockInterviews: Interview[] = [
        {
          id: '1',
          candidateId: '1',
          candidateName: 'John Doe',
          jobTitle: 'Senior Full Stack Developer',
          companyName: 'TechCorp Inc.',
          type: 'video',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
          duration: 60,
          interviewers: [
            {
              id: '1',
              name: 'Sarah Johnson',
              email: 'sarah.johnson@techcorp.com',
              role: 'Senior Recruiter',
              availability: ['monday', 'tuesday', 'wednesday']
            },
            {
              id: '2',
              name: 'Mike Chen',
              email: 'mike.chen@techcorp.com',
              role: 'Technical Lead',
              availability: ['tuesday', 'thursday', 'friday']
            }
          ],
          meetingLink: 'https://meet.google.com/abc-defg-hij',
          notes: 'Technical interview focusing on React, Node.js, and system design',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: '2',
          candidateId: '2',
          candidateName: 'Jane Smith',
          jobTitle: 'DevOps Engineer',
          companyName: 'CloudTech Solutions',
          type: 'panel',
          status: 'completed',
          scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
          duration: 90,
          interviewers: [
            {
              id: '3',
              name: 'Emily Davis',
              email: 'emily.davis@cloudtech.com',
              role: 'DevOps Manager',
              availability: ['monday', 'wednesday', 'friday']
            }
          ],
          location: 'Conference Room A',
          feedback: {
            overallRating: 4,
            technicalSkills: 5,
            communication: 4,
            culturalFit: 4,
            strengths: ['Strong AWS experience', 'Excellent problem-solving', 'Good communication'],
            weaknesses: ['Limited experience with Kubernetes'],
            recommendation: 'hire',
            notes: 'Very impressed with her technical knowledge and approach to problem-solving. Would be a great addition to the team.',
            submittedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            submittedBy: 'Emily Davis'
          },
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
        },
        {
          id: '3',
          candidateId: '3',
          candidateName: 'Mike Johnson',
          jobTitle: 'Frontend Developer',
          companyName: 'StartupXYZ',
          type: 'phone',
          status: 'confirmed',
          scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
          duration: 45,
          interviewers: [
            {
              id: '4',
              name: 'Alex Rodriguez',
              email: 'alex.rodriguez@startupxyz.com',
              role: 'Frontend Lead',
              availability: ['monday', 'tuesday', 'thursday']
            }
          ],
          notes: 'Initial phone screen to discuss experience and motivation',
          createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      setInterviews(mockInterviews);
    } catch (error) {
      console.error('Error loading interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredInterviews = () => {
    return interviews.filter(interview => {
      const matchesSearch = searchTerm === ''||
        interview.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        interview.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all'|| interview.status === filterStatus;
      const matchesType = filterType === 'all'|| interview.type === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  };

  const scheduleInterview = async () => {
    try {
      const interview: Interview = {
        id: Date.now().toString(),
        candidateId: newInterview.candidateId,
        candidateName: newInterview.candidateName,
        jobTitle: newInterview.jobTitle,
        companyName: 'Current Company', // Would come from context
        type: newInterview.type,
        status: 'scheduled',
        scheduledAt: newInterview.scheduledAt,
        duration: newInterview.duration,
        interviewers: newInterview.interviewers,
        location: newInterview.location,
        meetingLink: newInterview.meetingLink,
        notes: newInterview.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setInterviews(prev => [...prev, interview]);
      setShowScheduleForm(false);
      setNewInterview({
        candidateId: '',
        candidateName: '',
        jobTitle: '',
        type: 'video',
        scheduledAt: '',
        duration: 60,
        interviewers: [],
        location: '',
        meetingLink: '',
        notes: ''
      });

      // Send notifications
      console.log('Interview scheduled and notifications sent');
    } catch (error) {
      console.error('Error scheduling interview:', error);
    }
  };

  const submitFeedback = async () => {
    if (!selectedInterview) return;

    try {
      const feedbackData: InterviewFeedback = {
        ...feedback,
        submittedAt: new Date().toISOString(),
        submittedBy: 'Current User'// Would come from auth context
      };

      setInterviews(prev => prev.map(interview =>
        interview.id === selectedInterview.id
          ? {
              ...interview,
              status: 'completed',
              feedback: feedbackData,
              updatedAt: new Date().toISOString()
            }
          : interview
      ));

      setShowFeedbackForm(false);
      setSelectedInterview(null);
      setFeedback({
        overallRating: 3,
        technicalSkills: 3,
        communication: 3,
        culturalFit: 3,
        strengths: [],
        weaknesses: [],
        recommendation: 'maybe',
        notes: ''
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const updateInterviewStatus = async (interviewId: string, status: Interview['status']) => {
    try {
      setInterviews(prev => prev.map(interview =>
        interview.id === interviewId
          ? { ...interview, status, updatedAt: new Date().toISOString() }
          : interview
      ));
    } catch (error) {
      console.error('Error updating interview status:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'no_show': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'phone': return <Phone size={16} />;
      case 'video': return <Video size={16} />;
      case 'onsite': return <Building size={16} />;
      case 'panel': return <Users size={16} />;
      default: return <Calendar size={16} />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled': return <Clock size={14} />;
      case 'confirmed': return <CheckCircle size={14} />;
      case 'completed': return <CheckCircle size={14} />;
      case 'cancelled': return <XCircle size={14} />;
      case 'no_show': return <AlertCircle size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})
    };
  };

  const isUpcoming = (scheduledAt: string) => {
    return new Date(scheduledAt) > new Date();
  };

  const filteredInterviews = getFilteredInterviews();

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
              <h1 className="text-2xl font-bold text-gray-900">Interview Scheduling</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowScheduleForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Schedule Interview</span>
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2">
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search interviews..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No Show</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types</option>
              <option value="phone">Phone</option>
              <option value="video">Video</option>
              <option value="onsite">On-site</option>
              <option value="panel">Panel</option>
            </select>
          </div>
        </div>

        {/* Interviews List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Interviews ({filteredInterviews.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Interviewers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInterviews.map((interview) => {
                  const { date, time } = formatDateTime(interview.scheduledAt);
                  return (
                    <tr key={interview.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {interview.candidateName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {interview.jobTitle}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getTypeIcon(interview.type)}
                          <span className="text-sm text-gray-900 capitalize">
                            {interview.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm text-gray-900">{date}</div>
                          <div className="text-sm text-gray-500">{time} ({interview.duration}min)</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(interview.status)}`}>
                          {getStatusIcon(interview.status)}
                          <span className="ml-1 capitalize">{interview.status.replace('_', '')}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-1">
                          {interview.interviewers.slice(0, 3).map((interviewer) => (
                            <div
                              key={interviewer.id}
                              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium"
                              title={`${interviewer.name} (${interviewer.role})`}
                            >
                              {interviewer.name.charAt(0)}
                            </div>
                          ))}
                          {interview.interviewers.length > 3 && (
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs">
                              +{interview.interviewers.length - 3}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedInterview(interview)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <Eye size={16} />
                          </button>
                          {interview.status === 'scheduled'&& (
                            <>
                              <button className="text-green-600 hover:text-green-800">
                                <CheckCircle size={16} />
                              </button>
                              <button className="text-red-600 hover:text-red-800">
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                          {interview.status === 'completed'&& !interview.feedback && (
                            <button
                              onClick={() => {
                                setSelectedInterview(interview);
                                setShowFeedbackForm(true);
                              }}
                              className="text-purple-600 hover:text-purple-800"
                            >
                              <Star size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredInterviews.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No interviews found</h3>
              <p className="text-gray-600">
                {searchTerm || filterStatus !== 'all'|| filterType !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'Schedule your first interview to get started.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Interview Detail Modal */}
        {selectedInterview && !showFeedbackForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Interview Details
                  </h3>
                  <button
                    onClick={() => setSelectedInterview(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Candidate</h4>
                    <p className="text-gray-700">{selectedInterview.candidateName}</p>
                    <p className="text-sm text-gray-600">{selectedInterview.jobTitle}</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Interview Type</h4>
                    <div className="flex items-center space-x-2">
                      {getTypeIcon(selectedInterview.type)}
                      <span className="text-gray-700 capitalize">{selectedInterview.type}</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Date & Time</h4>
                    <p className="text-gray-700">
                      {formatDateTime(selectedInterview.scheduledAt).date}
                    </p>
                    <p className="text-sm text-gray-600">
                      {formatDateTime(selectedInterview.scheduledAt).time} ({selectedInterview.duration} minutes)
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Status</h4>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedInterview.status)}`}>
                      {getStatusIcon(selectedInterview.status)}
                      <span className="ml-1 capitalize">{selectedInterview.status.replace('_', '')}</span>
                    </span>
                  </div>
                </div>

                {selectedInterview.location && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Location</h4>
                    <div className="flex items-center space-x-2">
                      <MapPin size={16} className="text-gray-400" />
                      <span className="text-gray-700">{selectedInterview.location}</span>
                    </div>
                  </div>
                )}

                {selectedInterview.meetingLink && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Meeting Link</h4>
                    <a
                      href={selectedInterview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 flex items-center space-x-2"
                    >
                      <Video size={16} />
                      <span>Join Meeting</span>
                    </a>
                  </div>
                )}

                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Interviewers</h4>
                  <div className="space-y-2">
                    {selectedInterview.interviewers.map((interviewer) => (
                      <div key={interviewer.id} className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                          {interviewer.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{interviewer.name}</p>
                          <p className="text-xs text-gray-600">{interviewer.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedInterview.notes && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                    <p className="text-gray-700 text-sm">{selectedInterview.notes}</p>
                  </div>
                )}

                {selectedInterview.feedback && (
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Feedback</h4>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <span className="text-sm text-gray-600">Overall Rating:</span>
                          <div className="flex items-center space-x-1 mt-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                size={16}
                                className={star <= selectedInterview.feedback.overallRating ? 'text-yellow-500 fill-current': 'text-gray-300'}
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Recommendation:</span>
                          <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                            selectedInterview.feedback.recommendation === 'strong_hire'? 'bg-green-100 text-green-800':
                            selectedInterview.feedback.recommendation === 'hire'? 'bg-blue-100 text-blue-800':
                            selectedInterview.feedback.recommendation === 'maybe'? 'bg-yellow-100 text-yellow-800':
                            'bg-red-100 text-red-800'
                          }`}>
                            {selectedInterview.feedback.recommendation.replace('_', '').toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700">{selectedInterview.feedback.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Schedule Interview Modal */}
        {showScheduleForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Schedule Interview</h3>
                  <button
                    onClick={() => setShowScheduleForm(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Candidate Name
                    </label>
                    <input
                      type="text"
                      value={newInterview.candidateName}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, candidateName: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter candidate name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={newInterview.jobTitle}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, jobTitle: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter job title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Interview Type
                    </label>
                    <select
                      value={newInterview.type}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, type: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="phone">Phone</option>
                      <option value="video">Video</option>
                      <option value="onsite">On-site</option>
                      <option value="panel">Panel</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="180"
                      value={newInterview.duration}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, duration: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={newInterview.scheduledAt}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, scheduledAt: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {newInterview.type === 'onsite'&& (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location
                      </label>
                      <input
                        type="text"
                        value={newInterview.location}
                        onChange={(e) => setNewInterview(prev => ({ ...prev, location: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter location"
                      />
                    </div>
                  )}

                  {(newInterview.type === 'video'|| newInterview.type === 'phone') && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Meeting Link
                      </label>
                      <input
                        type="url"
                        value={newInterview.meetingLink}
                        onChange={(e) => setNewInterview(prev => ({ ...prev, meetingLink: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter meeting link"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={newInterview.notes}
                      onChange={(e) => setNewInterview(prev => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Additional notes or agenda"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowScheduleForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={scheduleInterview}
                    disabled={!newInterview.candidateName || !newInterview.jobTitle || !newInterview.scheduledAt}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Schedule Interview
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Form Modal */}
        {showFeedbackForm && selectedInterview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Interview Feedback - {selectedInterview.candidateName}
                  </h3>
                  <button
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setSelectedInterview(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Overall Rating
                    </label>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedback(prev => ({ ...prev, overallRating: star }))}
                          className="focus:outline-none"
                        >
                          <Star
                            size={24}
                            className={star <= feedback.overallRating ? 'text-yellow-500 fill-current': 'text-gray-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Recommendation
                    </label>
                    <select
                      value={feedback.recommendation}
                      onChange={(e) => setFeedback(prev => ({ ...prev, recommendation: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="strong_hire">Strong Hire</option>
                      <option value="hire">Hire</option>
                      <option value="maybe">Maybe</option>
                      <option value="no_hire">No Hire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Technical Skills
                    </label>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedback(prev => ({ ...prev, technicalSkills: star }))}
                          className="focus:outline-none"
                        >
                          <Star
                            size={20}
                            className={star <= feedback.technicalSkills ? 'text-blue-500 fill-current': 'text-gray-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Communication
                    </label>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedback(prev => ({ ...prev, communication: star }))}
                          className="focus:outline-none"
                        >
                          <Star
                            size={20}
                            className={star <= feedback.communication ? 'text-green-500 fill-current': 'text-gray-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cultural Fit
                    </label>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setFeedback(prev => ({ ...prev, culturalFit: star }))}
                          className="focus:outline-none"
                        >
                          <Star
                            size={20}
                            className={star <= feedback.culturalFit ? 'text-purple-500 fill-current': 'text-gray-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={feedback.notes}
                    onChange={(e) => setFeedback(prev => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Detailed feedback and comments..."
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setSelectedInterview(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitFeedback}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Submit Feedback
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewScheduling;