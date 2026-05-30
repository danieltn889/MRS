import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Award,
  Clock,
  Target,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  Calendar,
  Download,
  Share2,
  Filter
} from 'lucide-react';

interface SimulationResult {
  id: string;
  simulation_name: string;
  company: string;
  completed_at: string;
  score: number;
  status: string;
  duration: string;
  skills_assessed: string[];
  feedback: string;
  certificate_url?: string;
  recommendations?: string[];
}

const Results = ({ onBack }: { onBack: () => void }) => {
  const [results, setResults] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API when available
      setTimeout(() => {
        setResults([
          {
            id: '1',
            simulation_name: 'Full Stack Developer Assessment',
            company: 'TechCorp Rwanda',
            completed_at: '2024-01-20T14:30:00Z',
            score: 92,
            status: 'passed',
            duration: '2h 15m',
            skills_assessed: ['React', 'Node.js', 'Database Design', 'API Development'],
            feedback: 'Excellent performance in React development and API design. Strong problem-solving skills demonstrated.',
            certificate_url: '/certificates/cert-001.pdf',
            recommendations: [
              'Consider specializing in microservices architecture',
              'Great foundation for senior developer roles'
            ]
          },
          {
            id: '2',
            simulation_name: 'DevOps Engineer Challenge',
            company: 'CloudTech Rwanda',
            completed_at: '2024-01-18T10:45:00Z',
            score: 88,
            status: 'passed',
            duration: '1h 45m',
            skills_assessed: ['Docker', 'Kubernetes', 'CI/CD', 'Cloud Architecture'],
            feedback: 'Solid understanding of containerization and deployment pipelines. Room for improvement in advanced Kubernetes configurations.',
            certificate_url: '/certificates/cert-002.pdf',
            recommendations: [
              'Practice advanced Kubernetes networking',
              'Explore infrastructure as code tools like Terraform'
            ]
          },
          {
            id: '3',
            simulation_name: 'Product Manager Simulation',
            company: 'InnovateLabs',
            completed_at: '2024-01-15T16:20:00Z',
            score: 85,
            status: 'passed',
            duration: '3h 30m',
            skills_assessed: ['Product Strategy', 'User Research', 'Agile Methodology', 'Stakeholder Management'],
            feedback: 'Strong strategic thinking and user-centric approach. Excellent communication skills in requirements gathering.',
            certificate_url: '/certificates/cert-003.pdf',
            recommendations: [
              'Focus on quantitative product metrics',
              'Develop expertise in A/B testing frameworks'
            ]
          },
          {
            id: '4',
            simulation_name: 'Data Analyst Assessment',
            company: 'DataDriven Rwanda',
            completed_at: '2024-01-12T11:15:00Z',
            score: 78,
            status: 'passed',
            duration: '2h 45m',
            skills_assessed: ['SQL', 'Python', 'Data Visualization', 'Statistical Analysis'],
            feedback: 'Good foundational skills in data analysis. Needs improvement in advanced statistical methods and data storytelling.',
            certificate_url: '/certificates/cert-004.pdf',
            recommendations: [
              'Strengthen statistical analysis skills',
              'Practice creating compelling data visualizations',
              'Learn advanced SQL optimization techniques'
            ]
          },
          {
            id: '5',
            simulation_name: 'UI/UX Designer Challenge',
            company: 'DesignHub Rwanda',
            completed_at: '2024-01-10T13:00:00Z',
            score: 65,
            status: 'failed',
            duration: '2h 10m',
            skills_assessed: ['Figma', 'User Research', 'Prototyping', 'Design Systems'],
            feedback: 'Basic design skills present but needs significant improvement in user research methodology and design thinking processes.',
            certificate_url: undefined,
            recommendations: [
              'Take user research and usability testing courses',
              'Practice creating user personas and journey maps',
              'Study design systems and component libraries',
              'Improve prototyping skills with advanced tools'
            ]
          }
        ]);
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error('Error loading results:', error);
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-yellow-600 bg-yellow-50';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredResults = results.filter(result => {
    if (filter === 'all') return true;
    return result.status === filter;
  });

  const stats = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    averageScore: results.length > 0 ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : 0
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
            <p className="text-gray-600">View your simulation performance and certificates</p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <BarChart3 className="w-8 h-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Total Simulations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Passed</p>
              <p className="text-2xl font-bold text-green-600">{stats.passed}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <XCircle className="w-8 h-8 text-red-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <Award className="w-8 h-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">Average Score</p>
              <p className={`text-2xl font-bold ${getScoreColor(stats.averageScore)}`}>{stats.averageScore}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <Filter className="w-5 h-5 text-gray-500" />
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full text-sm ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('passed')}
            className={`px-3 py-1 rounded-full text-sm ${filter === 'passed' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Passed ({stats.passed})
          </button>
          <button
            onClick={() => setFilter('failed')}
            className={`px-3 py-1 rounded-full text-sm ${filter === 'failed' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            Failed ({stats.failed})
          </button>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.map((result) => (
          <div key={result.id} className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{result.simulation_name}</h3>
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStatusColor(result.status)}`}>
                    {getStatusIcon(result.status)}
                    {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                  </div>
                </div>
                <p className="text-gray-600 mb-2">{result.company}</p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(result.completed_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {result.duration}
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    Score: <span className={`font-semibold ${getScoreColor(result.score)}`}>{result.score}%</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {result.certificate_url && (
                  <button className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    <Download className="w-4 h-4" />
                    Certificate
                  </button>
                )}
                <button className="flex items-center gap-1 px-3 py-1 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm">
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
              </div>
            </div>

            {/* Skills Assessed */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Skills Assessed:</h4>
              <div className="flex flex-wrap gap-2">
                {result.skills_assessed.map((skill, index) => (
                  <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Feedback */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Feedback:</h4>
              <p className="text-gray-700 text-sm">{result.feedback}</p>
            </div>

            {/* Recommendations */}
            {result.recommendations && result.recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Recommendations:</h4>
                <ul className="list-disc list-inside text-gray-700 text-sm space-y-1">
                  {result.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredResults.length === 0 && (
        <div className="text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">Try adjusting your filter or complete some simulations to see your results here.</p>
        </div>
      )}
    </div>
  );
};

export default Results;