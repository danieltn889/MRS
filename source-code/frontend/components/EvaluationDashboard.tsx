import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Star,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  Lightbulb,
  Zap,
  Shield,
  Activity,
  Settings,
  Download,
  Share,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Plus,
  Minus,
  Edit,
  Save,
  RotateCcw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  MoreHorizontal,
  Info,
  HelpCircle,
  AlertCircle,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  TrophyIcon,
  GoalIcon,
  GrowthIcon,
  ChartIcon,
  PieIcon,
  PulseIcon,
  GearIcon,
  SoundOnIcon,
  SoundOffIcon,
  FullscreenIcon,
  ExitFullscreenIcon,
  RestartIcon,
  SpeedIcon,
  NextIcon,
  MenuIcon,
  EditIcon,
  DeleteIcon,
  AddIcon,
  RemoveIcon,
  CopyIcon,
  ShareIcon,
  FlagIcon,
  BookIcon,
  BreakIcon,
  OnlineIcon,
  OfflineIcon,
  BatteryIcon,
  DesktopIcon,
  MobileIcon,
  TabletIcon,
  HeadphonesIcon,
  MicOnIcon,
  MicOffIcon,
  CameraOnIcon,
  CameraOffIcon
} from 'lucide-react';

// Types for evaluation data
interface CandidateEvaluation {
  id: string;
  candidateId: string;
  simulationId: string;
  overallScore: number;
  status: 'pending' | 'completed' | 'reviewed';
  completedAt: string;
  reviewedAt?: string;
  reviewerId?: string;

  // Core scores
  punctualityScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  adaptabilityScore: number;
  collaborationScore: number;
  attentionToDetailScore: number;
  initiativeScore: number;

  // Detailed breakdowns
  sectionBreakdown: SectionScore[];
  behavioralMetrics: BehavioralMetric[];
  skillAssessments: SkillAssessment[];

  // AI analysis
  aiFeedback: AIFeedback;
  aiConfidence: number;

  // Benchmark comparisons
  benchmarkComparison: BenchmarkComparison;

  // Qualitative feedback
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  interviewQuestions: string[];
}

interface SectionScore {
  sectionId: string;
  sectionName: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeSpent: number;
  tasksCompleted: number;
  totalTasks: number;
}

interface BehavioralMetric {
  metric: string;
  score: number;
  description: string;
  examples: string[];
  improvement: string;
}

interface SkillAssessment {
  skill: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  score: number;
  evidence: string[];
}

interface AIFeedback {
  summary: string;
  detailedAnalysis: string;
  strengths: string[];
  areasForImprovement: string[];
  recommendations: string[];
  confidence: number;
}

interface BenchmarkComparison {
  overallPercentile: number;
  rolePercentile: number;
  industryPercentile: number;
  companyPercentile: number;
  similarCandidates: SimilarCandidate[];
}

interface SimilarCandidate {
  id: string;
  score: number;
  similarity: number;
  role: string;
  experience: string;
}

interface EvaluationDashboardProps {
  candidateId: string;
  simulationId: string;
  onBack: () => void;
}

const EvaluationDashboard: React.FC<EvaluationDashboardProps> = ({
  candidateId,
  simulationId,
  onBack
}) => {
  const [evaluation, setEvaluation] = useState<CandidateEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  useEffect(() => {
    loadEvaluation();
  }, [candidateId, simulationId]);

  const loadEvaluation = async () => {
    try {
      const response = await fetch(`/api/v1/evaluations/${candidateId}/${simulationId}`);
      const data = await response.json();
      setEvaluation(data.evaluation);
    } catch (error) {
      console.error('Failed to load evaluation:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAISettings = async (settings: any) => {
    try {
      await fetch('/api/v1/admin/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
    } catch (error) {
      console.error('Failed to update AI settings:', error);
    }
  };

  const defineCommunicationStandards = async (standards: any) => {
    try {
      await fetch('/api/v1/admin/communication-standards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(standards)
      });
    } catch (error) {
      console.error('Failed to update communication standards:', error);
    }
  };

  const setMinimumScores = async (thresholds: any) => {
    try {
      await fetch('/api/v1/admin/minimum-scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(thresholds)
      });
    } catch (error) {
      console.error('Failed to update minimum scores:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading evaluation...</p>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Evaluation Not Found</h2>
          <p className="text-gray-600">Unable to load the candidate evaluation.</p>
          <button
            onClick={onBack}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 90) return 'bg-green-100';
    if (score >= 80) return 'bg-blue-100';
    if (score >= 70) return 'bg-yellow-100';
    if (score >= 60) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="text-center">
          <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${getScoreBgColor(evaluation.overallScore)} mb-4`}>
            <span className={`text-3xl font-bold ${getScoreColor(evaluation.overallScore)}`}>
              {evaluation.overallScore}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Overall Score</h2>
          <p className="text-gray-600">
            Completed on {new Date(evaluation.completedAt).toLocaleDateString()}
          </p>
          {evaluation.status === 'reviewed' && (
            <p className="text-sm text-gray-500 mt-1">
              Reviewed by evaluator
            </p>
          )}
        </div>
      </div>

      {/* Core Competencies Radar */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Core Competencies</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.punctualityScore)} mb-2`}>
              <Clock className={`h-8 w-8 ${getScoreColor(evaluation.punctualityScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.punctualityScore)}`}>
              {evaluation.punctualityScore}
            </div>
            <div className="text-sm text-gray-600">Punctuality</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.communicationScore)} mb-2`}>
              <MessageSquare className={`h-8 w-8 ${getScoreColor(evaluation.communicationScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.communicationScore)}`}>
              {evaluation.communicationScore}
            </div>
            <div className="text-sm text-gray-600">Communication</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.problemSolvingScore)} mb-2`}>
              <Lightbulb className={`h-8 w-8 ${getScoreColor(evaluation.problemSolvingScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.problemSolvingScore)}`}>
              {evaluation.problemSolvingScore}
            </div>
            <div className="text-sm text-gray-600">Problem Solving</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.adaptabilityScore)} mb-2`}>
              <Zap className={`h-8 w-8 ${getScoreColor(evaluation.adaptabilityScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.adaptabilityScore)}`}>
              {evaluation.adaptabilityScore}
            </div>
            <div className="text-sm text-gray-600">Adaptability</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.collaborationScore)} mb-2`}>
              <Users className={`h-8 w-8 ${getScoreColor(evaluation.collaborationScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.collaborationScore)}`}>
              {evaluation.collaborationScore}
            </div>
            <div className="text-sm text-gray-600">Collaboration</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.attentionToDetailScore)} mb-2`}>
              <Target className={`h-8 w-8 ${getScoreColor(evaluation.attentionToDetailScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.attentionToDetailScore)}`}>
              {evaluation.attentionToDetailScore}
            </div>
            <div className="text-sm text-gray-600">Attention to Detail</div>
          </div>

          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(evaluation.initiativeScore)} mb-2`}>
              <TrendingUp className={`h-8 w-8 ${getScoreColor(evaluation.initiativeScore)}`} />
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(evaluation.initiativeScore)}`}>
              {evaluation.initiativeScore}
            </div>
            <div className="text-sm text-gray-600">Initiative</div>
          </div>
        </div>
      </div>

      {/* Benchmark Comparison */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Benchmark Comparison</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {evaluation.benchmarkComparison.overallPercentile}th
            </div>
            <div className="text-sm text-gray-600">Overall Percentile</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-1">
              {evaluation.benchmarkComparison.rolePercentile}th
            </div>
            <div className="text-sm text-gray-600">Role Percentile</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 mb-1">
              {evaluation.benchmarkComparison.industryPercentile}th
            </div>
            <div className="text-sm text-gray-600">Industry Percentile</div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600 mb-1">
              {evaluation.benchmarkComparison.companyPercentile}th
            </div>
            <div className="text-sm text-gray-600">Company Percentile</div>
          </div>
        </div>
      </div>

      {/* AI Feedback Summary */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis Summary</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confidence:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              evaluation.aiConfidence >= 90 ? 'bg-green-100 text-green-800' :
              evaluation.aiConfidence >= 80 ? 'bg-blue-100 text-blue-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {evaluation.aiConfidence}%
            </span>
          </div>
        </div>
        <p className="text-gray-700 mb-4">{evaluation.aiFeedback.summary}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Key Strengths</h4>
            <ul className="space-y-1">
              {evaluation.aiFeedback.strengths.slice(0, 3).map((strength, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{strength}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Areas for Improvement</h4>
            <ul className="space-y-1">
              {evaluation.aiFeedback.areasForImprovement.slice(0, 3).map((area, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDetailedBreakdownTab = () => (
    <div className="space-y-6">
      {/* Section Scores */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Section Breakdown</h3>
        <div className="space-y-4">
          {evaluation.sectionBreakdown.map((section) => (
            <div key={section.sectionId} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">{section.sectionName}</h4>
                <div className="flex items-center space-x-4">
                  <span className={`text-lg font-bold ${getScoreColor(section.percentage)}`}>
                    {section.score}/{section.maxScore} ({section.percentage}%)
                  </span>
                  <button
                    onClick={() => setSelectedSection(
                      selectedSection === section.sectionId ? null : section.sectionId
                    )}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {selectedSection === section.sectionId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Tasks Completed:</span> {section.tasksCompleted}/{section.totalTasks}
                </div>
                <div>
                  <span className="font-medium">Time Spent:</span> {Math.round(section.timeSpent / 60)}m
                </div>
                <div>
                  <span className="font-medium">Avg Score:</span> {section.percentage}%
                </div>
              </div>

              {selectedSection === section.sectionId && (
                <div className="mt-4 pt-4 border-t">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${section.percentage}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Behavioral Metrics */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Behavioral Assessment</h3>
        <div className="space-y-4">
          {evaluation.behavioralMetrics.map((metric, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">{metric.metric}</h4>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  metric.score >= 80 ? 'bg-green-100 text-green-800' :
                  metric.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {metric.score}/100
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{metric.description}</p>

              <div className="space-y-2">
                <h5 className="text-sm font-medium text-gray-900">Examples:</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  {metric.examples.map((example, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="text-gray-400 mt-1">•</span>
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <h5 className="text-sm font-medium text-blue-900 mb-1">Improvement Suggestion:</h5>
                <p className="text-sm text-blue-800">{metric.improvement}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skill Assessments */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Skill Assessment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evaluation.skillAssessments.map((skill, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">{skill.skill}</h4>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  skill.level === 'expert' ? 'bg-purple-100 text-purple-800' :
                  skill.level === 'advanced' ? 'bg-blue-100 text-blue-800' :
                  skill.level === 'intermediate' ? 'bg-green-100 text-green-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {skill.level}
                </span>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Proficiency</span>
                  <span>{skill.score}/100</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${skill.score}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-medium text-gray-900 mb-2">Evidence:</h5>
                <ul className="text-sm text-gray-700 space-y-1">
                  {skill.evidence.map((evidence, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                      <span>{evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAIFeedbackTab = () => (
    <div className="space-y-6">
      {/* AI Confidence & Summary */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Analysis Confidence:</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              evaluation.aiConfidence >= 90 ? 'bg-green-100 text-green-800' :
              evaluation.aiConfidence >= 80 ? 'bg-blue-100 text-blue-800' :
              evaluation.aiConfidence >= 70 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {evaluation.aiConfidence}%
            </span>
          </div>
        </div>

        <div className="prose max-w-none">
          <p className="text-gray-700 mb-4">{evaluation.aiFeedback.detailedAnalysis}</p>
        </div>
      </div>

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-green-900 mb-4 flex items-center">
            <CheckCircle className="h-5 w-5 mr-2" />
            Key Strengths
          </h3>
          <ul className="space-y-3">
            {evaluation.aiFeedback.strengths.map((strength, index) => (
              <li key={index} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-gray-700">{strength}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-orange-900 mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            Areas for Improvement
          </h3>
          <ul className="space-y-3">
            {evaluation.aiFeedback.areasForImprovement.map((area, index) => (
              <li key={index} className="flex items-start space-x-3">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-gray-700">{area}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center">
          <Lightbulb className="h-5 w-5 mr-2" />
          AI Recommendations
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evaluation.aiFeedback.recommendations.map((recommendation, index) => (
            <div key={index} className="p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800">{recommendation}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderBenchmarksTab = () => (
    <div className="space-y-6">
      {/* Overall Benchmarks */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Benchmarks</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-4xl font-bold text-blue-600 mb-2">
              {evaluation.benchmarkComparison.overallPercentile}
            </div>
            <div className="text-sm text-gray-600 mb-1">Overall Percentile</div>
            <div className="text-xs text-gray-500">Across all candidates</div>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold text-green-600 mb-2">
              {evaluation.benchmarkComparison.rolePercentile}
            </div>
            <div className="text-sm text-gray-600 mb-1">Role Percentile</div>
            <div className="text-xs text-gray-500">Similar roles</div>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold text-purple-600 mb-2">
              {evaluation.benchmarkComparison.industryPercentile}
            </div>
            <div className="text-sm text-gray-600 mb-1">Industry Percentile</div>
            <div className="text-xs text-gray-500">Same industry</div>
          </div>

          <div className="text-center">
            <div className="text-4xl font-bold text-orange-600 mb-2">
              {evaluation.benchmarkComparison.companyPercentile}
            </div>
            <div className="text-sm text-gray-600 mb-1">Company Percentile</div>
            <div className="text-xs text-gray-500">Your company</div>
          </div>
        </div>
      </div>

      {/* Similar Candidates */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Similar Candidates</h3>
        <div className="space-y-3">
          {evaluation.benchmarkComparison.similarCandidates.map((candidate, index) => (
            <div key={candidate.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-600">
                    {candidate.similarity}%
                  </span>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Candidate {index + 1}</div>
                  <div className="text-sm text-gray-600">{candidate.role} • {candidate.experience}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${getScoreColor(candidate.score)}`}>
                  {candidate.score}
                </div>
                <div className="text-xs text-gray-500">Score</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Benchmark Insights */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Benchmark Insights</h3>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Performance Relative to Peers</h4>
            <p className="text-blue-800 text-sm">
              Your candidate performed in the {evaluation.benchmarkComparison.overallPercentile}th percentile
              compared to all candidates who have taken this simulation.
            </p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">Role-Specific Performance</h4>
            <p className="text-green-800 text-sm">
              Among candidates applying for similar roles, this candidate ranks in the
              {evaluation.benchmarkComparison.rolePercentile}th percentile.
            </p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-medium text-purple-900 mb-2">Industry Comparison</h4>
            <p className="text-purple-800 text-sm">
              Within the same industry, this candidate's performance places them in the
              {evaluation.benchmarkComparison.industryPercentile}th percentile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAdminSettingsTab = () => (
    <div className="space-y-6">
      {/* AI Scoring Weights */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Scoring Weights</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Technical Skills', key: 'technical' },
              { label: 'Communication', key: 'communication' },
              { label: 'Problem Solving', key: 'problemSolving' },
              { label: 'Adaptability', key: 'adaptability' },
              { label: 'Collaboration', key: 'collaboration' },
              { label: 'Attention to Detail', key: 'attentionToDetail' },
              { label: 'Initiative', key: 'initiative' },
              { label: 'Punctuality', key: 'punctuality' }
            ].map((item) => (
              <div key={item.key} className="text-center">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {item.label}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue="10"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => updateAISettings({})}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Update Weights
            </button>
          </div>
        </div>
      </div>

      {/* Communication Standards */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Communication Standards</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Define "Good Communication" for your company
            </label>
            <textarea
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the communication standards, tone, style, and expectations for your organization..."
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => defineCommunicationStandards({})}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Save Standards
            </button>
          </div>
        </div>
      </div>

      {/* Minimum Acceptable Scores */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Minimum Acceptable Scores</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Overall Minimum Score
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue="70"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Critical Skills Threshold
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue="80"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Individual Competency Minimums</h4>
            {[
              'Technical Skills',
              'Communication',
              'Problem Solving',
              'Adaptability',
              'Collaboration',
              'Attention to Detail',
              'Initiative',
              'Punctuality'
            ].map((competency) => (
              <div key={competency} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{competency}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue="60"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setMinimumScores({})}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Set Thresholds
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'breakdown', label: 'Detailed Breakdown', icon: PieChart },
    { id: 'ai-feedback', label: 'AI Feedback', icon: MessageSquare },
    { id: 'benchmarks', label: 'Benchmarks', icon: TrendingUp },
    { id: 'admin', label: 'Admin Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                Candidate Evaluation
              </h1>
              <span className="text-sm text-gray-500">
                ID: {evaluation.id}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center space-x-1">
                <Download size={16} />
                <span>Export</span>
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center space-x-1">
                <Share size={16} />
                <span>Share</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'breakdown' && renderDetailedBreakdownTab()}
        {activeTab === 'ai-feedback' && renderAIFeedbackTab()}
        {activeTab === 'benchmarks' && renderBenchmarksTab()}
        {activeTab === 'admin' && renderAdminSettingsTab()}
      </div>
    </div>
  );
};

export default EvaluationDashboard;