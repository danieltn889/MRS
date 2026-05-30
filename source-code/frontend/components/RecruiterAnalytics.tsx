import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileText,
  Clock,
  CheckCircle,
  Download,
  RefreshCw,
  Target,
  MapPin,
  Briefcase
} from 'lucide-react';

interface AnalyticsData {
  totalApplications: number;
  applicationsThisMonth: number;
  applicationsLastMonth: number;
  conversionRate: number;
  averageTimeToHire: number;
  topSkills: { skill: string; count: number }[];
  applicationsByStatus: { status: string; count: number; percentage: number }[];
  applicationsByJob: { job_title: string; count: number }[];
  applicationsByLocation: { location: string; count: number }[];
  hiringFunnel: { stage: string; count: number; conversion: number }[];
  timeToDecision: { range: string; count: number }[];
  sourceEffectiveness: { source: string; applications: number; hires: number }[];
  monthlyTrends: { month: string; applications: number; hires: number }[];
}

interface RecruiterAnalyticsProps {
  onBack: () => void;
}

const RecruiterAnalytics = ({ onBack }: RecruiterAnalyticsProps) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockData: AnalyticsData = {
        totalApplications: 1247,
        applicationsThisMonth: 89,
        applicationsLastMonth: 76,
        conversionRate: 12.5,
        averageTimeToHire: 28,
        topSkills: [
          { skill: 'React', count: 156 },
          { skill: 'JavaScript', count: 142 },
          { skill: 'Python', count: 98 },
          { skill: 'Node.js', count: 87 },
          { skill: 'TypeScript', count: 76 },
          { skill: 'AWS', count: 65 },
          { skill: 'Docker', count: 54 },
          { skill: 'SQL', count: 43 }
        ],
        applicationsByStatus: [
          { status: 'submitted', count: 456, percentage: 36.6 },
          { status: 'under_review', count: 234, percentage: 18.8 },
          { status: 'shortlisted', count: 156, percentage: 12.5 },
          { status: 'interview', count: 98, percentage: 7.9 },
          { status: 'offer', count: 45, percentage: 3.6 },
          { status: 'hired', count: 34, percentage: 2.7 },
          { status: 'rejected', count: 224, percentage: 18.0 }
        ],
        applicationsByJob: [
          { job_title: 'Senior Full Stack Developer', count: 89 },
          { job_title: 'DevOps Engineer', count: 67 },
          { job_title: 'Frontend Developer', count: 54 },
          { job_title: 'Backend Developer', count: 43 },
          { job_title: 'Product Manager', count: 32 }
        ],
        applicationsByLocation: [
          { location: 'San Francisco, CA', count: 156 },
          { location: 'New York, NY', count: 134 },
          { location: 'Austin, TX', count: 98 },
          { location: 'Seattle, WA', count: 87 },
          { location: 'Remote', count: 234 }
        ],
        hiringFunnel: [
          { stage: 'Applied', count: 1000, conversion: 100 },
          { stage: 'Reviewed', count: 300, conversion: 30 },
          { stage: 'Shortlisted', count: 120, conversion: 12 },
          { stage: 'Interviewed', count: 60, conversion: 6 },
          { stage: 'Offered', count: 24, conversion: 2.4 },
          { stage: 'Hired', count: 12, conversion: 1.2 }
        ],
        timeToDecision: [
          { range: '< 1 day', count: 123 },
          { range: '1-3 days', count: 234 },
          { range: '3-7 days', count: 345 },
          { range: '1-2 weeks', count: 287 },
          { range: '2-4 weeks', count: 156 },
          { range: '> 4 weeks', count: 102 }
        ],
        sourceEffectiveness: [
          { source: 'LinkedIn', applications: 456, hires: 23 },
          { source: 'Indeed', applications: 345, hires: 18 },
          { source: 'Company Website', applications: 234, hires: 15 },
          { source: 'Referrals', applications: 123, hires: 12 },
          { source: 'Other', applications: 89, hires: 4 }
        ],
        monthlyTrends: [
          { month: 'Jan', applications: 76, hires: 5 },
          { month: 'Feb', applications: 89, hires: 7 },
          { month: 'Mar', applications: 95, hires: 8 },
          { month: 'Apr', applications: 82, hires: 6 },
          { month: 'May', applications: 98, hires: 9 },
          { month: 'Jun', applications: 104, hires: 11 }
        ]
      };

      setAnalyticsData(mockData);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportAnalytics = () => {
    if (!analyticsData) return;

    const csvContent = [
      ['Metric', 'Value'],
      ['Total Applications', analyticsData.totalApplications.toString()],
      ['Applications This Month', analyticsData.applicationsThisMonth.toString()],
      ['Conversion Rate (%)', analyticsData.conversionRate.toString()],
      ['Average Time to Hire (days)', analyticsData.averageTimeToHire.toString()],
      ['', ''],
      ['Applications by Status', ''],
      ['Status', 'Count', 'Percentage'],
      ...analyticsData.applicationsByStatus.map(item => [
        item.status,
        item.count.toString(),
        item.percentage.toString()
      ]),
      ['', '', ''],
      ['Top Skills', ''],
      ['Skill', 'Count'],
      ...analyticsData.topSkills.map(item => [item.skill, item.count.toString()])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruiter-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'bg-blue-500';
      case 'under_review': return 'bg-yellow-500';
      case 'shortlisted': return 'bg-green-500';
      case 'interview': return 'bg-purple-500';
      case 'offer': return 'bg-indigo-500';
      case 'hired': return 'bg-emerald-500';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No data available</h3>
          <p className="text-gray-600">Unable to load analytics data.</p>
        </div>
      </div>
    );
  }

  const growthRate = calculateGrowth(analyticsData.applicationsThisMonth, analyticsData.applicationsLastMonth);

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
              <h1 className="text-2xl font-bold text-gray-900">Recruiter Analytics</h1>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>
              <button
                onClick={loadAnalyticsData}
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={exportAnalytics}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Applications</p>
                <p className="text-3xl font-bold text-gray-900">{analyticsData.totalApplications.toLocaleString()}</p>
                <div className="flex items-center mt-2">
                  {growthRate >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                  )}
                  <span className={`text-sm font-medium ${growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {Math.abs(growthRate).toFixed(1)}% from last month
                  </span>
                </div>
              </div>
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Conversion Rate</p>
                <p className="text-3xl font-bold text-green-600">{analyticsData.conversionRate}%</p>
                <p className="text-sm text-gray-600 mt-2">
                  {Math.round(analyticsData.totalApplications * analyticsData.conversionRate / 100)} hires
                </p>
              </div>
              <Target className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Time to Hire</p>
                <p className="text-3xl font-bold text-purple-600">{analyticsData.averageTimeToHire} days</p>
                <p className="text-sm text-gray-600 mt-2">From application to offer</p>
              </div>
              <Clock className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Jobs</p>
                <p className="text-3xl font-bold text-orange-600">{analyticsData.applicationsByJob.length}</p>
                <p className="text-sm text-gray-600 mt-2">Currently posting</p>
              </div>
              <Briefcase className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Applications by Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Status</h3>
            <div className="space-y-3">
              {analyticsData.applicationsByStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(item.status)}`} />
                    <span className="text-sm font-medium text-gray-900">
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">{item.count}</span>
                    <span className="text-xs text-gray-500">({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hiring Funnel */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Hiring Funnel</h3>
            <div className="space-y-4">
              {analyticsData.hiringFunnel.map((stage, index) => (
                <div key={stage.stage} className="relative">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{stage.stage}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{stage.count}</span>
                      <span className="text-xs text-gray-500">({stage.conversion}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${stage.conversion}%` }}
                    />
                  </div>
                  {index < analyticsData.hiringFunnel.length - 1 && (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                      <div className="w-0.5 h-4 bg-gray-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Skills */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Skills in Demand</h3>
            <div className="space-y-3">
              {analyticsData.topSkills.slice(0, 8).map((skill, index) => (
                <div key={skill.skill} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                    <span className="text-sm font-medium text-gray-900">{skill.skill}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(skill.count / analyticsData.topSkills[0].count) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-12 text-right">{skill.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Trends */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Trends</h3>
            <div className="space-y-3">
              {analyticsData.monthlyTrends.map((month) => (
                <div key={month.month} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{month.month}</span>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <FileText size={14} className="text-blue-500" />
                      <span className="text-sm text-gray-600">{month.applications}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <CheckCircle size={14} className="text-green-500" />
                      <span className="text-sm text-gray-600">{month.hires}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Charts Row 3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Applications by Location */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Location</h3>
            <div className="space-y-3">
              {analyticsData.applicationsByLocation.map((location) => (
                <div key={location.location} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <MapPin size={16} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">{location.location}</span>
                  </div>
                  <span className="text-sm text-gray-600">{location.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Time to Decision */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Time to Decision</h3>
            <div className="space-y-3">
              {analyticsData.timeToDecision.map((range) => (
                <div key={range.range} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">{range.range}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-orange-500 h-2 rounded-full"
                        style={{
                          width: `${(range.count / Math.max(...analyticsData.timeToDecision.map(r => r.count))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 w-12 text-right">{range.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Source Effectiveness */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Source Effectiveness</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applications
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conversion Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quality Score
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analyticsData.sourceEffectiveness.map((source) => {
                  const conversionRate = (source.hires / source.applications) * 100;
                  return (
                    <tr key={source.source}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {source.source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {source.applications}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {source.hires}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {conversionRate.toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${
                                conversionRate >= 5 ? 'bg-green-500' :
                                conversionRate >= 3 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(conversionRate * 20, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${
                            conversionRate >= 5 ? 'text-green-600' :
                            conversionRate >= 3 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {conversionRate >= 5 ? 'High' : conversionRate >= 3 ? 'Medium' : 'Low'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Applications by Job */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Job</h3>
          <div className="space-y-4">
            {analyticsData.applicationsByJob.map((job) => (
              <div key={job.job_title} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Briefcase size={16} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{job.job_title}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-600">{job.count} applications</span>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{
                        width: `${(job.count / Math.max(...analyticsData.applicationsByJob.map(j => j.count))) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecruiterAnalytics;