import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Calendar,
  Target,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Filter,
  RefreshCw,
  Award,
  Briefcase,
  MapPin,
  DollarSign
} from 'lucide-react';
import { getApplications } from '../services/applicationAPI';

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
  updated_at: string;
  interview_date?: string;
  rejection_reason?: string;
  feedback?: string;
}

interface ApplicationHistoryProps {
  onBack: () => void;
}

interface Stats {
  total: number;
  submitted: number;
  underReview: number;
  shortlisted: number;
  interview: number;
  assessment: number;
  referenceCheck: number;
  offer: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  onHold: number;
  responseRate: number;
  averageResponseTime: number;
  acceptanceRate: number;
  conversionRate: number;
}

const ApplicationHistory: React.FC<ApplicationHistoryProps> = ({ onBack }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'month', 'quarter', 'year'
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getApplications({ limit: 100 });
      if (response.success && response.data?.applications) {
        setApplications(response.data.applications);
      } else {
        setApplications([]);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      setError('Failed to load application data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadApplications();
    setRefreshing(false);
  };

  const filterApplicationsByTime = (apps: Application[]): Application[] => {
    const now = new Date();
    const filterDate = new Date();

    switch (timeFilter) {
      case 'month':
        filterDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        filterDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        filterDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        return apps;
    }

    return apps.filter(app => new Date(app.applied_at) >= filterDate);
  };

  const getApplicationStats = (): Stats => {
    const filteredApps = filterApplicationsByTime(applications);

    const stats = {
      total: filteredApps.length,
      submitted: filteredApps.filter(app => app.status === 'submitted').length,
      underReview: filteredApps.filter(app => app.status === 'under_review').length,
      shortlisted: filteredApps.filter(app => app.status === 'shortlisted').length,
      interview: filteredApps.filter(app => app.status === 'interview').length,
      assessment: filteredApps.filter(app => app.status === 'assessment').length,
      referenceCheck: filteredApps.filter(app => app.status === 'reference_check').length,
      offer: filteredApps.filter(app => app.status === 'offer').length,
      hired: filteredApps.filter(app => app.status === 'hired').length,
      rejected: filteredApps.filter(app => app.status === 'rejected').length,
      withdrawn: filteredApps.filter(app => app.status === 'withdrawn').length,
      onHold: filteredApps.filter(app => app.status === 'on_hold').length,
      responseRate: 0,
      averageResponseTime: 0,
      acceptanceRate: 0,
      conversionRate: 0
    };

    // Calculate response rate (applications that received any response)
    const respondedApps = filteredApps.filter(app =>
      ['shortlisted', 'interview', 'assessment', 'reference_check', 'offer', 'hired', 'rejected'].includes(app.status)
    );
    stats.responseRate = filteredApps.length > 0 ? (respondedApps.length / filteredApps.length) * 100 : 0;

    // Calculate average response time (days)
    const responseTimes = respondedApps
      .map(app => {
        const appliedDate = new Date(app.applied_at);
        const updatedDate = new Date(app.updated_at);
        return Math.max(0, Math.floor((updatedDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24)));
      })
      .filter(time => time > 0);

    stats.averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    // Calculate acceptance rate (offer to hire conversion)
    stats.acceptanceRate = stats.offer > 0 ? (stats.hired / stats.offer) * 100 : 0;

    // Calculate conversion rate (application to hire)
    stats.conversionRate = stats.total > 0 ? (stats.hired / stats.total) * 100 : 0;

    return stats;
  };

  const getStatusDistribution = () => {
    const filteredApps = filterApplicationsByTime(applications);
    return {
      submitted: filteredApps.filter(app => app.status === 'submitted').length,
      under_review: filteredApps.filter(app => app.status === 'under_review').length,
      shortlisted: filteredApps.filter(app => app.status === 'shortlisted').length,
      interview: filteredApps.filter(app => app.status === 'interview').length,
      assessment: filteredApps.filter(app => app.status === 'assessment').length,
      reference_check: filteredApps.filter(app => app.status === 'reference_check').length,
      offer: filteredApps.filter(app => app.status === 'offer').length,
      hired: filteredApps.filter(app => app.status === 'hired').length,
      rejected: filteredApps.filter(app => app.status === 'rejected').length,
      withdrawn: filteredApps.filter(app => app.status === 'withdrawn').length,
      on_hold: filteredApps.filter(app => app.status === 'on_hold').length,
    };
  };

  const getMonthlyTrends = () => {
    const filteredApps = filterApplicationsByTime(applications);
    const monthlyData: { [key: string]: { count: number; hired: number } } = {};

    filteredApps.forEach(app => {
      const month = new Date(app.applied_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, hired: 0 };
      }
      monthlyData[month].count++;
      if (app.status === 'hired') {
        monthlyData[month].hired++;
      }
    });

    return Object.entries(monthlyData)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .slice(-6);
  };

  const getTopCompanies = () => {
    const filteredApps = filterApplicationsByTime(applications);
    const companyCount: { [key: string]: { count: number; hired: number } } = {};

    filteredApps.forEach(app => {
      if (!companyCount[app.company_name || 'Unknown']) {
        companyCount[app.company_name || 'Unknown'] = { count: 0, hired: 0 };
      }
      companyCount[app.company_name || 'Unknown'].count++;
      if (app.status === 'hired') {
        companyCount[app.company_name || 'Unknown'].hired++;
      }
    });

    return Object.entries(companyCount)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5);
  };

  const getSuccessRateByJobType = () => {
    const filteredApps = filterApplicationsByTime(applications);
    const jobTypeStats: { [key: string]: { total: number; successful: number; hired: number } } = {};

    filteredApps.forEach(app => {
      const jobType = app.job_type || 'Unknown';
      if (!jobTypeStats[jobType]) {
        jobTypeStats[jobType] = { total: 0, successful: 0, hired: 0 };
      }
      jobTypeStats[jobType].total++;
      if (['shortlisted', 'interview', 'assessment', 'reference_check', 'offer', 'hired'].includes(app.status)) {
        jobTypeStats[jobType].successful++;
      }
      if (app.status === 'hired') {
        jobTypeStats[jobType].hired++;
      }
    });

    return Object.entries(jobTypeStats).map(([jobType, stats]) => ({
      jobType,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
      hireRate: stats.total > 0 ? (stats.hired / stats.total) * 100 : 0,
      total: stats.total
    }));
  };

  const getAverageMatchScore = () => {
    const filteredApps = filterApplicationsByTime(applications);
    const appsWithScore = filteredApps.filter(app => app.match_score !== undefined && app.match_score > 0);
    if (appsWithScore.length === 0) return 0;
    return appsWithScore.reduce((sum, app) => sum + (app.match_score || 0), 0) / appsWithScore.length;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'submitted': return 'bg-blue-500';
      case 'under_review': return 'bg-yellow-500';
      case 'shortlisted': return 'bg-green-500';
      case 'interview': return 'bg-purple-500';
      case 'assessment': return 'bg-indigo-500';
      case 'reference_check': return 'bg-cyan-500';
      case 'offer': return 'bg-emerald-500';
      case 'hired': return 'bg-green-600';
      case 'rejected': return 'bg-red-500';
      case 'withdrawn': return 'bg-gray-500';
      case 'on_hold': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'under_review': return 'Under Review';
      case 'reference_check': return 'Reference Check';
      case 'on_hold': return 'On Hold';
      default: return status.replace('_', ' ');
    }
  };

  const stats = getApplicationStats();
  const statusDistribution = getStatusDistribution();
  const monthlyTrends = getMonthlyTrends();
  const topCompanies = getTopCompanies();
  const jobTypeSuccess = getSuccessRateByJobType();
  const averageMatchScore = getAverageMatchScore();

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
              <h1 className="text-2xl font-bold text-gray-900">Application Analytics</h1>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <div className="flex items-center space-x-2">
                <Filter size={16} className="text-gray-500" />
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">All Time</option>
                  <option value="month">Last Month</option>
                  <option value="quarter">Last Quarter</option>
                  <option value="year">Last Year</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="text-red-800">{error}</p>
              </div>
              <button onClick={loadApplications} className="text-red-600 hover:text-red-800 text-sm">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Applications</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Target className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Response Rate</p>
                <p className="text-3xl font-bold text-green-600">{stats.responseRate.toFixed(1)}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Response Time</p>
                <p className="text-3xl font-bold text-orange-600">{stats.averageResponseTime.toFixed(0)} days</p>
              </div>
              <Clock className="w-8 h-8 text-orange-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                <p className="text-3xl font-bold text-purple-600">{stats.conversionRate.toFixed(1)}%</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">Interview Rate</p>
            <p className="text-xl font-bold text-gray-900">
              {stats.total > 0 ? ((stats.interview + stats.offer + stats.hired) / stats.total * 100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">Offer Rate</p>
            <p className="text-xl font-bold text-gray-900">
              {stats.total > 0 ? (stats.offer / stats.total * 100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">Acceptance Rate</p>
            <p className="text-xl font-bold text-gray-900">{stats.acceptanceRate.toFixed(1)}%</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">Avg Match Score</p>
            <p className="text-xl font-bold text-gray-900">{averageMatchScore.toFixed(0)}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Status Distribution</h3>
            <div className="space-y-3">
              {Object.entries(statusDistribution)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`} />
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">{count}</span>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getStatusColor(status)}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Monthly Trends */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Application Trends</h3>
            {monthlyTrends.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {monthlyTrends.map(([month, data]) => {
                  const maxCount = Math.max(...monthlyTrends.map(([, d]) => d.count));
                  return (
                    <div key={month} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">{month}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">{data.count} apps</span>
                          {data.hired > 0 && (
                            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              {data.hired} hired
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${(data.count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Companies */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Companies Applied To</h3>
            {topCompanies.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {topCompanies.map(([company, data], index) => (
                  <div key={company} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700 w-6">#{index + 1}</span>
                      <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{company}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                        {data.count} apps
                      </span>
                      {data.hired > 0 && (
                        <span className="text-xs text-green-600">
                          🎉 {data.hired} hired
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Success Rate by Job Type */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Success Rate by Job Type</h3>
            {jobTypeSuccess.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {jobTypeSuccess.map(({ jobType, successRate, hireRate, total }) => (
                  <div key={jobType}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-700 capitalize">{jobType}</span>
                        <span className="text-xs text-gray-500">({total} apps)</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-green-600">
                          {successRate.toFixed(1)}%
                        </span>
                        {hireRate > 0 && (
                          <span className="text-xs text-blue-600">
                            ({hireRate.toFixed(1)}% hired)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(successRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Insights & Recommendations */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Insights & Recommendations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Response Rate</h4>
                  <p className="text-sm text-gray-600">
                    Your {stats.responseRate.toFixed(1)}% response rate is
                    {stats.responseRate > 30 ? ' excellent! Keep up the good work.' :
                     stats.responseRate > 15 ? ' good. Consider tailoring your applications more.' :
                     ' below average. Focus on customizing your applications to each role.'}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-orange-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Response Time</h4>
                  <p className="text-sm text-gray-600">
                    Average response time is {stats.averageResponseTime.toFixed(0)} days.
                    {stats.averageResponseTime > 21 ? ' This is quite long. Consider following up on applications.' :
                     stats.averageResponseTime > 14 ? ' This is slightly above average.' :
                     ' This is within normal range.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Target className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Application Strategy</h4>
                  <p className="text-sm text-gray-600">
                    You've applied to {topCompanies.length} different companies.
                    {jobTypeSuccess.length > 0 && (
                      <> Your best performing job type is{' '}
                        <strong>
                          {jobTypeSuccess.reduce((best, current) => 
                            current.successRate > best.successRate ? current : best
                          ).jobType}
                        </strong> with a {Math.max(...jobTypeSuccess.map(j => j.successRate)).toFixed(0)}% success rate.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Award className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Conversion Rate</h4>
                  <p className="text-sm text-gray-600">
                    Your application to hire conversion rate is {stats.conversionRate.toFixed(1)}%.
                    {stats.conversionRate > 10 ? ' This is excellent!' :
                     stats.conversionRate > 5 ? ' This is good.' :
                     ' Focus on improving interview skills and application quality.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actionable Tips */}
          {stats.total > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Tips</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {stats.submitted > 5 && (
                  <div className="text-xs text-gray-600 flex items-center space-x-1">
                    <AlertTriangle size={12} className="text-yellow-500" />
                    <span>You have {stats.submitted} pending applications</span>
                  </div>
                )}
                {stats.rejected > stats.total * 0.5 && (
                  <div className="text-xs text-gray-600 flex items-center space-x-1">
                    <TrendingDown size={12} className="text-red-500" />
                    <span>High rejection rate - review application quality</span>
                  </div>
                )}
                {averageMatchScore < 60 && averageMatchScore > 0 && (
                  <div className="text-xs text-gray-600 flex items-center space-x-1">
                    <Target size={12} className="text-blue-500" />
                    <span>Target jobs with higher match scores</span>
                  </div>
                )}
                {stats.onHold > 0 && (
                  <div className="text-xs text-gray-600 flex items-center space-x-1">
                    <Clock size={12} className="text-orange-500" />
                    <span>Follow up on {stats.onHold} on-hold applications</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationHistory;