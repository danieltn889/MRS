import { useState, useEffect } from 'react';
import {
  Users,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  Bell,
  UserPlus,
  Eye
} from 'lucide-react';

interface Application {
  id: string;
  job_id: string;
  job_title: string;
  company_name: string;
  candidate_name: string;
  candidate_email: string;
  applied_at: string;
  status: string;
  match_score?: number;
  application_number: string;
  updated_at: string;
}

interface Job {
  id: string;
  title: string;
  location: string;
  application_count: number;
  status: string;
  created_at: string;
}

interface RecruiterDashboardProps {
  onBack: () => void;
}

const RecruiterDashboard = ({ onBack }: RecruiterDashboardProps) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    loadData();
    // Set up real-time updates (simulate with interval)
    const interval = setInterval(() => {
      loadData();
      setLastUpdated(new Date());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Simulate API calls - replace with actual API calls
      const mockApplications: Application[] = [
        {
          id: '1',
          job_id: '1',
          job_title: 'Senior Full Stack Developer',
          company_name: 'TechCorp Inc.',
          candidate_name: 'John Doe',
          candidate_email: 'john.doe@email.com',
          applied_at: '2024-01-15T10:30:00Z',
          status: 'submitted',
          match_score: 85,
          application_number: 'APP-2024-001',
          updated_at: '2024-01-15T10:30:00Z'
        },
        {
          id: '2',
          job_id: '1',
          job_title: 'Senior Full Stack Developer',
          company_name: 'TechCorp Inc.',
          candidate_name: 'Jane Smith',
          candidate_email: 'jane.smith@email.com',
          applied_at: '2024-01-14T14:20:00Z',
          status: 'under_review',
          match_score: 92,
          application_number: 'APP-2024-002',
          updated_at: '2024-01-15T09:15:00Z'
        },
        {
          id: '3',
          job_id: '2',
          job_title: 'DevOps Engineer',
          company_name: 'CloudTech Solutions',
          candidate_name: 'Mike Johnson',
          candidate_email: 'mike.johnson@email.com',
          applied_at: '2024-01-13T16:45:00Z',
          status: 'shortlisted',
          match_score: 88,
          application_number: 'APP-2024-003',
          updated_at: '2024-01-14T11:30:00Z'
        }
      ];

      const mockJobs: Job[] = [
        {
          id: '1',
          title: 'Senior Full Stack Developer',
          location: 'San Francisco, CA',
          application_count: 12,
          status: 'active',
          created_at: '2024-01-10T00:00:00Z'
        },
        {
          id: '2',
          title: 'DevOps Engineer',
          location: 'Remote',
          application_count: 8,
          status: 'active',
          created_at: '2024-01-12T00:00:00Z'
        }
      ];

      setApplications(mockApplications);
      setJobs(mockJobs);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredApplications = () => {
    return applications.filter(app => {
      const matchesJob = selectedJob === 'all'|| app.job_id === selectedJob;
      const matchesStatus = statusFilter === 'all'|| app.status === statusFilter;
      const matchesSearch = searchTerm === ''||
        app.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.job_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.application_number.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesJob && matchesStatus && matchesSearch;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'under_review': return 'bg-yellow-100 text-yellow-800';
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'interview': return 'bg-purple-100 text-purple-800';
      case 'offer': return 'bg-indigo-100 text-indigo-800';
      case 'hired': return 'bg-emerald-100 text-emerald-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'withdrawn': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <FileText size={14} />;
      case 'under_review': return <Clock size={14} />;
      case 'shortlisted': return <CheckCircle size={14} />;
      case 'interview': return <Users size={14} />;
      case 'offer': return <CheckCircle size={14} />;
      case 'hired': return <CheckCircle size={14} />;
      case 'rejected': return <XCircle size={14} />;
      case 'withdrawn': return <XCircle size={14} />;
      default: return <FileText size={14} />;
    }
  };

  const getDashboardStats = () => {
    const filteredApps = getFilteredApplications();
    const today = new Date();
    const todayApps = filteredApps.filter(app =>
      new Date(app.applied_at).toDateString() === today.toDateString()
    );

    return {
      totalApplications: filteredApps.length,
      newToday: todayApps.length,
      underReview: filteredApps.filter(app => app.status === 'under_review').length,
      shortlisted: filteredApps.filter(app => app.status === 'shortlisted').length,
      interviews: filteredApps.filter(app => app.status === 'interview').length,
      offers: filteredApps.filter(app => app.status === 'offer').length,
      hired: filteredApps.filter(app => app.status === 'hired').length
    };
  };

  const updateApplicationStatus = async (applicationId: string, newStatus: string) => {
    try {
      // Simulate API call
      setApplications(prev => prev.map(app =>
        app.id === applicationId
          ? { ...app, status: newStatus, updated_at: new Date().toISOString() }
          : app
      ));

      // Show success message
      console.log(`Application ${applicationId} status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating application status:', error);
    }
  };

  const exportApplications = () => {
    const filteredApps = getFilteredApplications();
    const csvContent = [
      ['Application #', 'Job Title', 'Candidate Name', 'Email', 'Status', 'Applied Date', 'Match Score'],
      ...filteredApps.map(app => [
        app.application_number,
        app.job_title,
        app.candidate_name,
        app.candidate_email,
        app.status,
        new Date(app.applied_at).toLocaleDateString(),
        app.match_score || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = getDashboardStats();
  const filteredApplications = getFilteredApplications();

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
              <h1 className="text-2xl font-bold text-gray-900">Recruiter Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <RefreshCw size={16} />
                <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Applications</p>
                <p className="text-3xl font-bold text-gray-900">{stats.totalApplications}</p>
                <p className="text-sm text-green-600">+{stats.newToday} today</p>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Under Review</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.underReview}</p>
                <p className="text-sm text-gray-600">Needs attention</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Shortlisted</p>
                <p className="text-3xl font-bold text-green-600">{stats.shortlisted}</p>
                <p className="text-sm text-gray-600">Ready for interview</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Interviews</p>
                <p className="text-3xl font-bold text-purple-600">{stats.interviews}</p>
                <p className="text-sm text-gray-600">In progress</p>
              </div>
              <Users className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
              <div className="flex items-center space-x-2">
                <Filter size={16} className="text-gray-500" />
                <select
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Jobs</option>
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.title} ({job.application_count} apps)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="submitted">Submitted</option>
                  <option value="under_review">Under Review</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="hired">Hired</option>
                  <option value="rejected">Rejected</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                onClick={exportApplications}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>

        {/* Applications Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Applications ({filteredApplications.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Match Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applied
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredApplications.map((application) => (
                  <tr key={application.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {application.application_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {application.id}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {application.candidate_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {application.candidate_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {application.job_title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {application.company_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(application.status)}`}>
                        {getStatusIcon(application.status)}
                        <span className="ml-1 capitalize">{application.status.replace('_', '')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {application.match_score ? (
                        <div className="flex items-center">
                          <span className={`text-sm font-medium ${
                            application.match_score >= 90 ? 'text-green-600':
                            application.match_score >= 80 ? 'text-yellow-600':
                            'text-red-600'
                          }`}>
                            {application.match_score}%
                          </span>
                          <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                application.match_score >= 90 ? 'bg-green-600':
                                application.match_score >= 80 ? 'bg-yellow-600':
                                'bg-red-600'
                              }`}
                              style={{ width: `${application.match_score}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(application.applied_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <select
                          value={application.status}
                          onChange={(e) => updateApplicationStatus(application.id, e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="submitted">Submitted</option>
                          <option value="under_review">Under Review</option>
                          <option value="shortlisted">Shortlisted</option>
                          <option value="interview">Interview</option>
                          <option value="offer">Offer</option>
                          <option value="hired">Hired</option>
                          <option value="rejected">Rejected</option>
                        </select>
                        <button className="text-blue-600 hover:text-blue-800">
                          <Eye size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredApplications.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
              <p className="text-gray-600">
                {searchTerm || selectedJob !== 'all'|| statusFilter !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'Applications will appear here as candidates apply to your jobs.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Bell className="w-6 h-6 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
            </div>
            <p className="text-gray-600 mb-4">Stay updated with new applications and status changes.</p>
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              Configure Alerts
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <BarChart3 className="w-6 h-6 text-green-600" />
              <h3 className="text-lg font-semibold text-gray-900">Analytics</h3>
            </div>
            <p className="text-gray-600 mb-4">View detailed hiring metrics and insights.</p>
            <button className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
              View Reports
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-4">
              <UserPlus className="w-6 h-6 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Team Management</h3>
            </div>
            <p className="text-gray-600 mb-4">Manage team members and permissions.</p>
            <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">
              Manage Team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruiterDashboard;