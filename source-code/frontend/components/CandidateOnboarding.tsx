import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Clock,
  FileText,
  Upload,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  CheckSquare,
  X,
  Download,
  Send,
  Eye,
  Edit,
  Plus,
  Search,
  Filter,
  Bell,
  MessageSquare
} from 'lucide-react';

interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  type: 'document'| 'form'| 'training'| 'meeting'| 'approval';
  status: 'pending'| 'in_progress'| 'completed'| 'overdue';
  priority: 'low'| 'medium'| 'high'| 'urgent';
  dueDate: string;
  assignedBy: string;
  completedAt?: string;
  attachments?: { name: string; url: string; type: string }[];
  notes?: string;
}

interface Candidate {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
  startDate: string;
  manager: string;
  onboardingProgress: number;
  tasks: OnboardingTask[];
  documents: { name: string; status: 'pending'| 'submitted'| 'approved'| 'rejected'; url?: string }[];
}

interface CandidateOnboardingProps {
  onBack: () => void;
}

const CandidateOnboarding = ({ onBack }: CandidateOnboardingProps) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    type: 'document'as const,
    priority: 'medium'as const,
    dueDate: '',
    notes: ''
  });

  useEffect(() => {
    loadCandidates();
  }, []);

  const loadCandidates = async () => {
    try {
      setLoading(true);
      // Simulate API call - replace with actual API
      const mockCandidates: Candidate[] = [
        {
          id: '1',
          name: 'John Doe',
          email: 'john.doe@email.com',
          position: 'Senior Full Stack Developer',
          department: 'Engineering',
          startDate: '2024-03-01',
          manager: 'Sarah Johnson',
          onboardingProgress: 75,
          tasks: [
            {
              id: '1',
              title: 'Complete Background Check',
              description: 'Submit background check authorization form',
              type: 'document',
              status: 'completed',
              priority: 'high',
              dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
              assignedBy: 'HR Team',
              completedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
              notes: 'Background check completed successfully'
            },
            {
              id: '2',
              title: 'Setup Development Environment',
              description: 'Install required software and configure development tools',
              type: 'training',
              status: 'in_progress',
              priority: 'medium',
              dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
              assignedBy: 'Tech Lead',
              notes: 'Working on setting up local development environment'
            },
            {
              id: '3',
              title: 'Review Company Policies',
              description: 'Read and acknowledge company handbook and policies',
              type: 'form',
              status: 'pending',
              priority: 'high',
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              assignedBy: 'HR Team'
            }
          ],
          documents: [
            { name: 'Offer Letter', status: 'approved', url: '#'},
            { name: 'Background Check Authorization', status: 'approved', url: '#'},
            { name: 'Tax Forms (W-4)', status: 'submitted', url: '#'},
            { name: 'Direct Deposit Form', status: 'pending'},
            { name: 'Emergency Contact Form', status: 'pending'}
          ]
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane.smith@email.com',
          position: 'DevOps Engineer',
          department: 'Engineering',
          startDate: '2024-02-15',
          manager: 'Mike Chen',
          onboardingProgress: 90,
          tasks: [
            {
              id: '4',
              title: 'Security Training',
              description: 'Complete mandatory security awareness training',
              type: 'training',
              status: 'completed',
              priority: 'high',
              dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
              assignedBy: 'Security Team',
              completedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
            }
          ],
          documents: [
            { name: 'Offer Letter', status: 'approved', url: '#'},
            { name: 'Tax Forms (W-4)', status: 'approved', url: '#'},
            { name: 'Direct Deposit Form', status: 'approved', url: '#'},
            { name: 'Emergency Contact Form', status: 'approved', url: '#'}
          ]
        },
        {
          id: '3',
          name: 'Mike Johnson',
          email: 'mike.johnson@email.com',
          position: 'Frontend Developer',
          department: 'Engineering',
          startDate: '2024-03-15',
          manager: 'Lisa Wong',
          onboardingProgress: 45,
          tasks: [
            {
              id: '5',
              title: 'Submit Required Documents',
              description: 'Upload all required HR documents',
              type: 'document',
              status: 'pending',
              priority: 'urgent',
              dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              assignedBy: 'HR Team',
              notes: 'Overdue - please submit immediately'
            }
          ],
          documents: [
            { name: 'Offer Letter', status: 'approved', url: '#'},
            { name: 'Tax Forms (W-4)', status: 'pending'},
            { name: 'Direct Deposit Form', status: 'pending'},
            { name: 'Emergency Contact Form', status: 'pending'}
          ]
        }
      ];

      setCandidates(mockCandidates);
    } catch (error) {
      console.error('Error loading candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredCandidates = () => {
    return candidates.filter(candidate => {
      const matchesSearch = searchTerm === ''||
        candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        candidate.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all'||
        (filterStatus === 'completed'&& candidate.onboardingProgress === 100) ||
        (filterStatus === 'in_progress'&& candidate.onboardingProgress > 0 && candidate.onboardingProgress < 100) ||
        (filterStatus === 'pending'&& candidate.onboardingProgress === 0);

      return matchesSearch && matchesStatus;
    });
  };

  const createTask = async () => {
    if (!selectedCandidate) return;

    try {
      const task: OnboardingTask = {
        id: Date.now().toString(),
        title: newTask.title,
        description: newTask.description,
        type: newTask.type,
        status: 'pending',
        priority: newTask.priority,
        dueDate: newTask.dueDate,
        assignedBy: 'Current User', // Would come from context
        notes: newTask.notes
      };

      setCandidates(prev => prev.map(candidate =>
        candidate.id === selectedCandidate.id
          ? { ...candidate, tasks: [...candidate.tasks, task] }
          : candidate
      ));

      setShowTaskModal(false);
      setNewTask({
        title: '',
        description: '',
        type: 'document',
        priority: 'medium',
        dueDate: '',
        notes: ''
      });

      console.log('Task created successfully');
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const updateTaskStatus = async (candidateId: string, taskId: string, status: OnboardingTask['status']) => {
    try {
      setCandidates(prev => prev.map(candidate =>
        candidate.id === candidateId
          ? {
              ...candidate,
              tasks: candidate.tasks.map(task =>
                task.id === taskId
                  ? {
                      ...task,
                      status,
                      completedAt: status === 'completed'? new Date().toISOString() : undefined
                    }
                  : task
              )
            }
          : candidate
      ));

      // Recalculate progress
      updateCandidateProgress(candidateId);
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const updateCandidateProgress = (candidateId: string) => {
    setCandidates(prev => prev.map(candidate => {
      if (candidate.id === candidateId) {
        const totalTasks = candidate.tasks.length;
        const completedTasks = candidate.tasks.filter(task => task.status === 'completed').length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return { ...candidate, onboardingProgress: progress };
      }
      return candidate;
    }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} />;
      case 'in_progress': return <Clock size={14} />;
      case 'pending': return <AlertTriangle size={14} />;
      case 'overdue': return <AlertTriangle size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTaskTypeIcon = (type: string) => {
    switch (type) {
      case 'document': return <FileText size={16} />;
      case 'form': return <CheckSquare size={16} />;
      case 'training': return <User size={16} />;
      case 'meeting': return <MessageSquare size={16} />;
      case 'approval': return <CheckCircle size={16} />;
      default: return <FileText size={16} />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  const filteredCandidates = getFilteredCandidates();

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
              <h1 className="text-2xl font-bold text-gray-900">Candidate Onboarding</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowTaskModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Add Task</span>
              </button>
              <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center space-x-2">
                <Download size={16} />
                <span>Export Report</span>
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
                <p className="text-sm font-medium text-gray-600">Total Candidates</p>
                <p className="text-3xl font-bold text-gray-900">{candidates.length}</p>
              </div>
              <User className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Fully Onboarded</p>
                <p className="text-3xl font-bold text-green-600">
                  {candidates.filter(c => c.onboardingProgress === 100).length}
                </p>
                <p className="text-sm text-gray-600">
                  {candidates.length > 0 ? Math.round((candidates.filter(c => c.onboardingProgress === 100).length / candidates.length) * 100) : 0}% completion rate
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">In Progress</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {candidates.filter(c => c.onboardingProgress > 0 && c.onboardingProgress < 100).length}
                </p>
                <p className="text-sm text-gray-600">Active onboarding</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overdue Tasks</p>
                <p className="text-3xl font-bold text-red-600">
                  {candidates.reduce((total, candidate) =>
                    total + candidate.tasks.filter(task =>
                      task.status !== 'completed'&& isOverdue(task.dueDate)
                    ).length, 0
                  )}
                </p>
                <p className="text-sm text-gray-600">Require attention</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search candidates..."
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
              <option value="completed">Fully Onboarded</option>
              <option value="in_progress">In Progress</option>
              <option value="pending">Not Started</option>
            </select>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Candidates ({filteredCandidates.length})
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
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {candidate.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {candidate.email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {candidate.position}
                      </div>
                      <div className="text-sm text-gray-500">
                        {candidate.department}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${candidate.onboardingProgress}%` }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-600">
                          {candidate.onboardingProgress}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(candidate.startDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-900">
                          {candidate.tasks.filter(t => t.status === 'completed').length}/{candidate.tasks.length}
                        </span>
                        {candidate.tasks.some(t => t.status !== 'completed'&& isOverdue(t.dueDate)) && (
                          <AlertTriangle size={14} className="text-red-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedCandidate(candidate)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCandidate(candidate);
                            setShowTaskModal(true);
                          }}
                          className="text-green-600 hover:text-green-800"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredCandidates.length === 0 && (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
              <p className="text-gray-600">
                {searchTerm || filterStatus !== 'all'
                  ? 'Try adjusting your filters or search terms.'
                  : 'No candidates are currently in the onboarding process.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Candidate Detail Modal */}
        {selectedCandidate && !showTaskModal && !showDocumentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-96 overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedCandidate.name} - Onboarding Progress
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedCandidate.position} • {selectedCandidate.department}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCandidate(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Progress Overview */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Overall Progress</h4>
                    <span className="text-2xl font-bold text-blue-600">
                      {selectedCandidate.onboardingProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${selectedCandidate.onboardingProgress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Tasks Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Onboarding Tasks</h4>
                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                    >
                      Add Task
                    </button>
                  </div>

                  <div className="space-y-3">
                    {selectedCandidate.tasks.map((task) => (
                      <div key={task.id} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <div className="mt-1">
                              {getTaskTypeIcon(task.type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h5 className="font-medium text-gray-900">{task.title}</h5>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(task.status)}`}>
                                  {getStatusIcon(task.status)}
                                  <span className="ml-1 capitalize">{task.status.replace('_', '')}</span>
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
                                  {task.priority}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>Due: {formatDate(task.dueDate)}</span>
                                <span>Assigned by: {task.assignedBy}</span>
                                {task.completedAt && (
                                  <span>Completed: {formatDate(task.completedAt)}</span>
                                )}
                              </div>
                              {task.notes && (
                                <p className="text-sm text-gray-700 mt-2 italic">{task.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            {task.status !== 'completed'&& (
                              <>
                                <button
                                  onClick={() => updateTaskStatus(selectedCandidate.id, task.id, 'in_progress')}
                                  className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                >
                                  Start
                                </button>
                                <button
                                  onClick={() => updateTaskStatus(selectedCandidate.id, task.id, 'completed')}
                                  className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                >
                                  Complete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Documents Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-gray-900">Required Documents</h4>
                    <button
                      onClick={() => setShowDocumentModal(true)}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      Upload Document
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedCandidate.documents.map((doc, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <FileText size={16} className="text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>
                                {doc.status}
                              </span>
                            </div>
                          </div>
                          {doc.url && (
                            <button className="text-blue-600 hover:text-blue-800">
                              <Download size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Task Modal */}
        {showTaskModal && selectedCandidate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedCandidate ? `Add Task for ${selectedCandidate.name}` : 'Create Task'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowTaskModal(false);
                      setSelectedCandidate(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Task Title
                    </label>
                    <input
                      type="text"
                      value={newTask.title}
                      onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter task title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Task description..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Type
                      </label>
                      <select
                        value={newTask.type}
                        onChange={(e) => setNewTask(prev => ({ ...prev, type: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="document">Document</option>
                        <option value="form">Form</option>
                        <option value="training">Training</option>
                        <option value="meeting">Meeting</option>
                        <option value="approval">Approval</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Priority
                      </label>
                      <select
                        value={newTask.priority}
                        onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={newTask.dueDate}
                      onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={newTask.notes}
                      onChange={(e) => setNewTask(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => {
                      setShowTaskModal(false);
                      setSelectedCandidate(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createTask}
                    disabled={!newTask.title.trim() || !newTask.description.trim() || !newTask.dueDate}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Create Task
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

export default CandidateOnboarding;