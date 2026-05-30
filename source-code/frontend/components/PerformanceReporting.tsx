import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Calendar,
  Download,
  Filter,
  Search,
  Eye,
  FileText,
  Target,
  Award,
  Zap,
  Activity
} from 'lucide-react';

interface PerformanceMetric {
  id: string;
  name: string;
  value: number;
  previousValue: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  category: 'recruitment' | 'onboarding' | 'retention' | 'quality';
}

interface ReportData {
  period: string;
  metrics: PerformanceMetric[];
  insights: string[];
  recommendations: string[];
}

interface PerformanceReportingProps {
  onBack: () => void;
}

const PerformanceReporting = ({ onBack }: PerformanceReportingProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportData();
  }, [selectedPeriod, selectedCategory]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockData: ReportData = {
        period: selectedPeriod,
        metrics: [
          {
            id: '1',
            name: 'Time to Hire',
            value: 18,
            previousValue: 22,
            unit: 'days',
            trend: 'up',
            category: 'recruitment'
          },
          {
            id: '2',
            name: 'Offer Acceptance Rate',
            value: 78,
            previousValue: 72,
            unit: '%',
            trend: 'up',
            category: 'recruitment'
          },
          {
            id: '3',
            name: 'Candidate Quality Score',
            value: 8.2,
            previousValue: 7.8,
            unit: '/10',
            trend: 'up',
            category: 'quality'
          },
          {
            id: '4',
            name: 'Onboarding Completion Rate',
            value: 85,
            previousValue: 82,
            unit: '%',
            trend: 'up',
            category: 'onboarding'
          },
          {
            id: '5',
            name: 'Employee Retention (90 days)',
            value: 92,
            previousValue: 89,
            unit: '%',
            trend: 'up',
            category: 'retention'
          },
          {
            id: '6',
            name: 'Interview to Offer Ratio',
            value: 3.2,
            previousValue: 3.8,
            unit: ':1',
            trend: 'up',
            category: 'recruitment'
          },
          {
            id: '7',
            name: 'Cost per Hire',
            value: 8500,
            previousValue: 9200,
            unit: '$',
            trend: 'up',
            category: 'recruitment'
          },
          {
            id: '8',
            name: 'Diversity Hire Rate',
            value: 34,
            previousValue: 31,
            unit: '%',
            trend: 'up',
            category: 'quality'
          }
        ].filter(metric => selectedCategory === 'all' || metric.category === selectedCategory),
        insights: [
          'Time to hire has improved by 18% compared to last period',
          'Offer acceptance rate shows strong upward trend',
          'Quality scores are consistently above industry average',
          'Onboarding completion rate exceeds target by 5%'
        ],
        recommendations: [
          'Continue optimizing interview processes to maintain time-to-hire improvements',
          'Expand diversity hiring initiatives to build on current momentum',
          'Invest in onboarding technology to further improve completion rates',
          'Monitor cost per hire trends and identify optimization opportunities'
        ]
      };

      setReportData(mockData);
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return <TrendingUp size={16} className="text-green-500" />;
      case 'down': return <TrendingDown size={16} className="text-red-500" />;
      default: return <Activity size={16} className="text-gray-500" />;
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'recruitment': return <Users size={20} />;
      case 'onboarding': return <CheckCircle size={20} />;
      case 'retention': return <Target size={20} />;
      case 'quality': return <Award size={20} />;
      default: return <BarChart3 size={20} />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'recruitment': return 'bg-blue-100 text-blue-800';
      case 'onboarding': return 'bg-green-100 text-green-800';
      case 'retention': return 'bg-purple-100 text-purple-800';
      case 'quality': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === '$') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
    }
    return `${value}${unit}`;
  };

  const calculateChange = (current: number, previous: number) => {
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change),
      direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'no change'
    };
  };

  const exportReport = () => {
    // Simulate export functionality
    console.log('Exporting performance report...');
    alert('Report exported successfully!');
  };

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
              <h1 className="text-2xl font-bold text-gray-900">Performance Reporting</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={exportReport}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Export Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Categories</option>
                <option value="recruitment">Recruitment</option>
                <option value="onboarding">Onboarding</option>
                <option value="retention">Retention</option>
                <option value="quality">Quality</option>
              </select>
            </div>
          </div>
        </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {reportData?.metrics.slice(0, 4).map((metric) => {
            const change = calculateChange(metric.value, metric.previousValue);
            return (
              <div key={metric.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{metric.name}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">
                      {formatValue(metric.value, metric.unit)}
                    </p>
                    <div className="flex items-center mt-2">
                      {getTrendIcon(metric.trend)}
                      <span className={`text-sm ml-1 ${getTrendColor(metric.trend)}`}>
                        {change.value.toFixed(1)}% {change.direction}
                      </span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${getCategoryColor(metric.category)}`}>
                    {getCategoryIcon(metric.category)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detailed Metrics Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Detailed Metrics</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Metric
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Previous Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportData?.metrics.map((metric) => {
                  const change = calculateChange(metric.value, metric.previousValue);
                  return (
                    <tr key={metric.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {metric.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatValue(metric.value, metric.unit)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {formatValue(metric.previousValue, metric.unit)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center text-sm ${getTrendColor(metric.trend)}`}>
                          {getTrendIcon(metric.trend)}
                          <span className="ml-1">
                            {change.value.toFixed(1)}% {change.direction}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(metric.category)}`}>
                          {getCategoryIcon(metric.category)}
                          <span className="ml-1 capitalize">{metric.category}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getTrendIcon(metric.trend)}
                          <span className={`ml-1 text-sm capitalize ${getTrendColor(metric.trend)}`}>
                            {metric.trend}
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

        {/* Insights and Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Key Insights */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-yellow-500" />
                Key Insights
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {reportData?.insights.map((insight, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Target className="w-5 h-5 mr-2 text-green-500" />
                Recommendations
              </h3>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {reportData?.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <p className="text-sm text-gray-700">{recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Performance Trends Chart Placeholder */}
        <div className="bg-white rounded-lg shadow mt-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
              Performance Trends
            </h3>
          </div>
          <div className="p-6">
            <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Interactive charts would be displayed here</p>
                <p className="text-sm text-gray-500 mt-2">
                  Integration with charting libraries like Chart.js or D3.js
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Benchmarking Section */}
        <div className="bg-white rounded-lg shadow mt-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Award className="w-5 h-5 mr-2 text-purple-500" />
              Industry Benchmarks
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Time to Hire</p>
                <p className="text-2xl font-bold text-blue-600">21 days</p>
                <p className="text-xs text-gray-500">Industry Average</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Offer Acceptance</p>
                <p className="text-2xl font-bold text-green-600">68%</p>
                <p className="text-xs text-gray-500">Industry Average</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600">Cost per Hire</p>
                <p className="text-2xl font-bold text-purple-600">$9,200</p>
                <p className="text-xs text-gray-500">Industry Average</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-gray-600">Quality Score</p>
                <p className="text-2xl font-bold text-orange-600">7.5/10</p>
                <p className="text-xs text-gray-500">Industry Average</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceReporting;