import React, { useState, useEffect } from 'react';
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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const RecruiterAnalytics = ({ onBack }: RecruiterAnalyticsProps) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  };

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();
      
      switch (dateRange) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // Get current user info from token
      const token = localStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Decode token to get user ID
      const tokenPayload = JSON.parse(atob(token.split('.')[1]));
      const userId = tokenPayload.id;

      // Get all jobs for the company
      const jobsResponse = await fetch(`${API_BASE_URL}/jobs/my-jobs`, {
        headers: getAuthHeaders(),
      });
      
      const jobsData = await jobsResponse.json();
      console.log('Jobs API response:', jobsData);
      
      // Parse jobs data
      let jobs: any[] = [];
      if (jobsData.success && jobsData.data) {
        if (Array.isArray(jobsData.data)) {
          jobs = jobsData.data;
        } else if (jobsData.data.data && Array.isArray(jobsData.data.data)) {
          jobs = jobsData.data.data;
        } else if (jobsData.data.jobs && Array.isArray(jobsData.data.jobs)) {
          jobs = jobsData.data.jobs;
        }
      }

      if (jobs.length === 0) {
        setAnalyticsData({
          totalApplications: 0,
          applicationsThisMonth: 0,
          applicationsLastMonth: 0,
          conversionRate: 0,
          averageTimeToHire: 0,
          topSkills: [],
          applicationsByStatus: [],
          applicationsByJob: [],
          applicationsByLocation: [],
          hiringFunnel: [],
          timeToDecision: [],
          sourceEffectiveness: [],
          monthlyTrends: []
        });
        setLoading(false);
        return;
      }

      // Get job IDs
      const jobIds = jobs.map((job: any) => job.id);

      // ''FIXED: Use the applications endpoint with job_id filter
      // First, try to get all applications (without job filter)
      let allApplications: any[] = [];
      
      try {
        const appsResponse = await fetch(`${API_BASE_URL}/applications`, {
          headers: getAuthHeaders(),
        });
        
        if (appsResponse.ok) {
          const appsData = await appsResponse.json();
          console.log('Applications API response:', appsData);
          
          if (appsData.success && appsData.data) {
            let apps = [];
            if (Array.isArray(appsData.data)) {
              apps = appsData.data;
            } else if (appsData.data.applications && Array.isArray(appsData.data.applications)) {
              apps = appsData.data.applications;
            } else if (appsData.data.data && Array.isArray(appsData.data.data)) {
              apps = appsData.data.data;
            }
            
            // Filter applications by job IDs
            allApplications = apps.filter((app: any) => jobIds.includes(app.job_id));
          }
        }
      } catch (err) {
        console.error('Error fetching applications:', err);
      }

      // If the above fails, try to get applications per job using the existing job applications endpoint
      if (allApplications.length === 0) {
        for (const jobId of jobIds) {
          try {
            // Try different possible endpoints
            let appsData = null;
            
            // Try 1: /applications?job_id={jobId}
            let response = await fetch(`${API_BASE_URL}/applications?job_id=${jobId}`, {
              headers: getAuthHeaders(),
            });
            
            if (!response.ok) {
              // Try 2: /jobs/{jobId}/applications
              response = await fetch(`${API_BASE_URL}/jobs/${jobId}/applications`, {
                headers: getAuthHeaders(),
              });
            }
            
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data) {
                let apps = [];
                if (Array.isArray(data.data)) {
                  apps = data.data;
                } else if (data.data.applications && Array.isArray(data.data.applications)) {
                  apps = data.data.applications;
                }
                allApplications = [...allApplications, ...apps];
              }
            }
          } catch (err) {
            console.error(`Error fetching applications for job ${jobId}:`, err);
          }
        }
      }

      // Filter applications by date range
      const filteredApplications = allApplications.filter((app: any) => {
        const appDate = new Date(app.applied_at || app.created_at);
        return appDate >= startDate && appDate <= endDate;
      });

      // Calculate key metrics
      const totalApplications = filteredApplications.length;
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const applicationsThisMonth = filteredApplications.filter((app: any) => {
        const appDate = new Date(app.applied_at || app.created_at);
        return appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear;
      }).length;
      
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const applicationsLastMonth = filteredApplications.filter((app: any) => {
        const appDate = new Date(app.applied_at || app.created_at);
        return appDate.getMonth() === lastMonth && appDate.getFullYear() === lastMonthYear;
      }).length;
      
      const hiredCount = filteredApplications.filter((app: any) => app.status === 'hired').length;
      const conversionRate = totalApplications > 0 ? (hiredCount / totalApplications) * 100 : 0;
      
      // Calculate average time to hire
      const hiredApplications = filteredApplications.filter((app: any) => app.status === 'hired');
      let averageTimeToHire = 0;
      if (hiredApplications.length > 0) {
        const totalDays = hiredApplications.reduce((sum: number, app: any) => {
          const appliedDate = new Date(app.applied_at || app.created_at);
          const hiredDate = app.hired_at ? new Date(app.hired_at) : new Date(app.updated_at);
          const days = Math.ceil((hiredDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0);
        averageTimeToHire = Math.round(totalDays / hiredApplications.length);
      }

      // Process skills from jobs
      const skillsMap = new Map<string, number>();
      jobs.forEach((job: any) => {
        let skills = job.skills_required || [];
        if (typeof skills === 'string') {
          try {
            skills = JSON.parse(skills);
          } catch {
            skills = [];
          }
        }
        skills.forEach((skill: any) => {
          const skillName = typeof skill === 'string'? skill : skill.name;
          if (skillName) {
            skillsMap.set(skillName, (skillsMap.get(skillName) || 0) + 1);
          }
        });
      });
      const topSkills = Array.from(skillsMap.entries())
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // Process applications by status
      const statusCounts = new Map<string, number>();
      filteredApplications.forEach((app: any) => {
        const status = app.status || 'submitted';
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      });
      const applicationsByStatus = Array.from(statusCounts.entries())
        .map(([status, count]) => ({
          status,
          count,
          percentage: totalApplications > 0 ? (count / totalApplications) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Process applications by job
      const jobCounts = new Map<string, number>();
      filteredApplications.forEach((app: any) => {
        const job = jobs.find((j: any) => j.id === app.job_id);
        const jobTitle = job?.title || 'Unknown Job';
        jobCounts.set(jobTitle, (jobCounts.get(jobTitle) || 0) + 1);
      });
      const applicationsByJob = Array.from(jobCounts.entries())
        .map(([job_title, count]) => ({ job_title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Process applications by location
      const locationCounts = new Map<string, number>();
      filteredApplications.forEach((app: any) => {
        const job = jobs.find((j: any) => j.id === app.job_id);
        let location = 'Remote';
        if (job?.locations && job.locations.length > 0) {
          const loc = job.locations[0];
          if (typeof loc === 'object') {
            const city = loc.city || '';
            const country = loc.country || '';
            location = [city, country].filter(Boolean).join(', ');
            if (!location) location = 'Remote';
          } else if (typeof loc === 'string') {
            location = loc;
          }
        }
        locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
      });
      const applicationsByLocation = Array.from(locationCounts.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Hiring funnel data
      const hiringFunnel = [
        { stage: 'Applied', count: totalApplications, conversion: 100 },
        { stage: 'Reviewed', count: statusCounts.get('under_review') || 0, conversion: totalApplications > 0 ? ((statusCounts.get('under_review') || 0) / totalApplications) * 100 : 0 },
        { stage: 'Shortlisted', count: statusCounts.get('shortlisted') || 0, conversion: totalApplications > 0 ? ((statusCounts.get('shortlisted') || 0) / totalApplications) * 100 : 0 },
        { stage: 'Interviewed', count: statusCounts.get('interview') || 0, conversion: totalApplications > 0 ? ((statusCounts.get('interview') || 0) / totalApplications) * 100 : 0 },
        { stage: 'Offered', count: statusCounts.get('offer') || 0, conversion: totalApplications > 0 ? ((statusCounts.get('offer') || 0) / totalApplications) * 100 : 0 },
        { stage: 'Hired', count: hiredCount, conversion: conversionRate }
      ];

      // Time to decision data
      const timeToDecision = [
        { range: '< 1 day', count: 0 },
        { range: '1-3 days', count: 0 },
        { range: '3-7 days', count: 0 },
        { range: '1-2 weeks', count: 0 },
        { range: '2-4 weeks', count: 0 },
        { range: '> 4 weeks', count: 0 }
      ];
      
      filteredApplications.forEach((app: any) => {
        if (app.status !== 'submitted'&& app.updated_at) {
          const appliedDate = new Date(app.applied_at || app.created_at);
          const decisionDate = new Date(app.updated_at);
          const days = Math.ceil((decisionDate.getTime() - appliedDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (days < 1) timeToDecision[0].count++;
          else if (days <= 3) timeToDecision[1].count++;
          else if (days <= 7) timeToDecision[2].count++;
          else if (days <= 14) timeToDecision[3].count++;
          else if (days <= 28) timeToDecision[4].count++;
          else timeToDecision[5].count++;
        }
      });

      // Source effectiveness data (simplified)
      const sourceEffectiveness = [
        { source: 'Direct Apply', applications: filteredApplications.filter((a: any) => !a.source || a.source === 'direct').length, hires: filteredApplications.filter((a: any) => a.status === 'hired'&& (!a.source || a.source === 'direct')).length },
        { source: 'LinkedIn', applications: filteredApplications.filter((a: any) => a.source === 'linkedin').length, hires: filteredApplications.filter((a: any) => a.status === 'hired'&& a.source === 'linkedin').length },
        { source: 'Indeed', applications: filteredApplications.filter((a: any) => a.source === 'indeed').length, hires: filteredApplications.filter((a: any) => a.status === 'hired'&& a.source === 'indeed').length },
        { source: 'Referral', applications: filteredApplications.filter((a: any) => a.source === 'referral').length, hires: filteredApplications.filter((a: any) => a.status === 'hired'&& a.source === 'referral').length },
      ].filter(s => s.applications > 0);

      // Monthly trends data
      const monthlyData = new Map<string, { applications: number; hires: number }>();
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return d;
      }).reverse();
      
      last6Months.forEach(date => {
        const monthKey = date.toLocaleString('default', { month: 'short'});
        monthlyData.set(monthKey, { applications: 0, hires: 0 });
      });
      
      filteredApplications.forEach((app: any) => {
        const appDate = new Date(app.applied_at || app.created_at);
        const monthKey = appDate.toLocaleString('default', { month: 'short'});
        if (monthlyData.has(monthKey)) {
          monthlyData.get(monthKey)!.applications++;
          if (app.status === 'hired') {
            monthlyData.get(monthKey)!.hires++;
          }
        }
      });
      
      const monthlyTrends = Array.from(monthlyData.entries()).map(([month, data]) => ({
        month,
        applications: data.applications,
        hires: data.hires
      }));

      setAnalyticsData({
        totalApplications,
        applicationsThisMonth,
        applicationsLastMonth,
        conversionRate: Math.round(conversionRate * 10) / 10,
        averageTimeToHire,
        topSkills,
        applicationsByStatus,
        applicationsByJob,
        applicationsByLocation,
        hiringFunnel,
        timeToDecision,
        sourceEffectiveness,
        monthlyTrends
      });

    } catch (error) {
      console.error('Error loading analytics data:', error);
      setError('Failed to load analytics data. Please try again.');
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
        item.percentage.toFixed(1)
      ]),
      ['', '', ''],
      ['Top Skills', ''],
      ['Skill', 'Count'],
      ...analyticsData.topSkills.map(item => [item.skill, item.count.toString()])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv'});
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
    return status.replace('_', '').replace(/\b\w/g, l => l.toUpperCase());
  };

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !analyticsData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No data available</h3>
          <p className="text-gray-600">{error || 'Unable to load analytics data.'}</p>
          <button
            onClick={loadAnalyticsData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Retry
          </button>
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
                  <span className={`text-sm font-medium ${growthRate >= 0 ? 'text-green-600': 'text-red-600'}`}>
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

        {/* Applications by Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
                    <span className="text-xs text-gray-500">({item.percentage.toFixed(1)}%)</span>
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
                      <span className="text-xs text-gray-500">({stage.conversion.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${Math.min(stage.conversion, 100)}%` }}
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

        {/* Top Skills */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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

        {/* Applications by Location & Time to Decision */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applications</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversion Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quality Score</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analyticsData.sourceEffectiveness.map((source) => {
                  const conversionRate = source.applications > 0 ? (source.hires / source.applications) * 100 : 0;
                  return (
                    <tr key={source.source}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{source.source}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{source.applications}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{source.hires}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{conversionRate.toFixed(1)}%</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${conversionRate >= 5 ? 'bg-green-500': conversionRate >= 3 ? 'bg-yellow-500': 'bg-red-500'}`}
                              style={{ width: `${Math.min(conversionRate * 20, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${conversionRate >= 5 ? 'text-green-600': conversionRate >= 3 ? 'text-yellow-600': 'text-red-600'}`}>
                            {conversionRate >= 5 ? 'High': conversionRate >= 3 ? 'Medium': 'Low'}
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