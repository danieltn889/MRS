import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckSquare,
  Square,
  Mail,
  Phone,
  Download,
  Upload,
  Filter,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Send,
  FileText,
  Star,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: string;
  match_score: number;
  applied_date: string;
  job_title: string;
  skills: string[];
  experience_years: number;
  location: string;
  resume_url?: string;
  notes?: string;
}

interface BulkCandidateProcessingProps {
  onBack: () => void;
}

const BulkCandidateProcessing = ({ onBack }: BulkCandidateProcessingProps) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(0);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkAction, setBulkAction] = useState<string>('');

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
          phone: '+1-555-0123',
          status: 'shortlisted',
          match_score: 92,
          applied_date: '2024-01-15T10:30:00Z',
          job_title: 'Senior Full Stack Developer',
          skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
          experience_years: 5,
          location: 'San Francisco, CA',
          resume_url: '/resumes/john-doe.pdf',
          notes: 'Strong technical background, excellent communication skills'
        },
        {
          id: '2',
          name: 'Jane Smith',
          email: 'jane.smith@email.com',
          phone: '+1-555-0124',
          status: 'under_review',
          match_score: 88,
          applied_date: '2024-01-14T14:20:00Z',
          job_title: 'Senior Full Stack Developer',
          skills: ['Vue.js', 'Python', 'Django', 'MongoDB'],
          experience_years: 4,
          location: 'Remote',
          resume_url: '/resumes/jane-smith.pdf',
          notes: 'Good fit for remote work, strong Python background'
        },
        {
          id: '3',
          name: 'Mike Johnson',
          email: 'mike.johnson@email.com',
          status: 'shortlisted',
          match_score: 85,
          applied_date: '2024-01-13T16:45:00Z',
          job_title: 'DevOps Engineer',
          skills: ['Docker', 'Kubernetes', 'AWS', 'Jenkins'],
          experience_years: 6,
          location: 'New York, NY',
          resume_url: '/resumes/mike-johnson.pdf',
          notes: 'Extensive DevOps experience, AWS certified'
        },
        {
          id: '4',
          name: 'Sarah Wilson',
          email: 'sarah.wilson@email.com',
          phone: '+1-555-0126',
          status: 'interview',
          match_score: 90,
          applied_date: '2024-01-12T09:15:00Z',
          job_title: 'DevOps Engineer',
          skills: ['Terraform', 'Ansible', 'Azure', 'GitLab CI'],
          experience_years: 5,
          location: 'Austin, TX',
          resume_url: '/resumes/sarah-wilson.pdf',
          notes: 'Currently in interview process, very enthusiastic'
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
      const matchesSearch = searchTerm === '' ||
        candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        candidate.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        candidate.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || candidate.status === statusFilter;
      const matchesSkill = skillFilter === 'all' ||
        candidate.skills.some(skill => skill.toLowerCase().includes(skillFilter.toLowerCase()));
      const matchesScore = candidate.match_score >= minScore;

      return matchesSearch && matchesStatus && matchesSkill && matchesScore;
    });
  };

  const handleSelectCandidate = (candidateId: string) => {
    const newSelected = new Set(selectedCandidates);
    if (newSelected.has(candidateId)) {
      newSelected.delete(candidateId);
    } else {
      newSelected.add(candidateId);
    }
    setSelectedCandidates(newSelected);
  };

  const handleSelectAll = () => {
    const filteredCandidates = getFilteredCandidates();
    if (selectedCandidates.size === filteredCandidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)));
    }
  };

  const executeBulkAction = async (action: string) => {
    if (selectedCandidates.size === 0) return;

    try {
      const selectedIds = Array.from(selectedCandidates);

      switch (action) {
        case 'status_update':
          // Update status for selected candidates
          setCandidates(prev => prev.map(candidate =>
            selectedCandidates.has(candidate.id)
              ? { ...candidate, status: 'shortlisted' }
              : candidate
          ));
          break;

        case 'send_email':
          // Simulate sending bulk email
          console.log(`Sending bulk email to ${selectedIds.length} candidates`);
          break;

        case 'schedule_interview':
          // Simulate scheduling interviews
          console.log(`Scheduling interviews for ${selectedIds.length} candidates`);
          break;

        case 'export_data':
          // Export selected candidates data
          exportCandidatesData(selectedIds);
          break;

        case 'reject':
          // Reject selected candidates
          setCandidates(prev => prev.map(candidate =>
            selectedCandidates.has(candidate.id)
              ? { ...candidate, status: 'rejected' }
              : candidate
          ));
          break;
      }

      setSelectedCandidates(new Set());
      setShowBulkActions(false);
      setBulkAction('');

      // Show success message
      alert(`Bulk action "${action}" completed for ${selectedIds.length} candidates`);

    } catch (error) {
      console.error('Error executing bulk action:', error);
      alert('Error executing bulk action. Please try again.');
    }
  };

  const exportCandidatesData = (candidateIds: string[]) => {
    const selectedCandidates = candidates.filter(c => candidateIds.includes(c.id));
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Status', 'Match Score', 'Job Title', 'Skills', 'Experience', 'Location'],
      ...selectedCandidates.map(candidate => [
        candidate.name,
        candidate.email,
        candidate.phone || '',
        candidate.status,
        candidate.match_score.toString(),
        candidate.job_title,
        candidate.skills.join('; '),
        candidate.experience_years.toString(),
        candidate.location
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidates-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
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
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <FileText size={14} />;
      case 'under_review': return <Clock size={14} />;
      case 'shortlisted': return <CheckCircle size={14} />;
      case 'interview': return <Users size={14} />;
      case 'offer': return <Star size={14} />;
      case 'hired': return <CheckCircle size={14} />;
      case 'rejected': return <XCircle size={14} />;
      default: return <FileText size={14} />;
    }
  };

  const filteredCandidates = getFilteredCandidates();
  const allSelected = selectedCandidates.size === filteredCandidates.length && filteredCandidates.length > 0;

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
              <h1 className="text-2xl font-bold text-gray-900">Bulk Candidate Processing</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {selectedCandidates.size} of {filteredCandidates.length} selected
              </span>
              {selectedCandidates.size > 0 && (
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Bulk Actions
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Bulk Actions Panel */}
        {showBulkActions && selectedCandidates.size > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Bulk Actions ({selectedCandidates.size} candidates selected)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                onClick={() => executeBulkAction('status_update')}
                className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-gray-900">Update Status</div>
                  <div className="text-sm text-gray-600">Move to shortlisted</div>
                </div>
              </button>

              <button
                onClick={() => executeBulkAction('send_email')}
                className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Mail className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="font-medium text-gray-900">Send Email</div>
                  <div className="text-sm text-gray-600">Bulk communication</div>
                </div>
              </button>

              <button
                onClick={() => executeBulkAction('schedule_interview')}
                className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Users className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="font-medium text-gray-900">Schedule Interview</div>
                  <div className="text-sm text-gray-600">Set up interviews</div>
                </div>
              </button>

              <button
                onClick={() => executeBulkAction('export_data')}
                className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-5 h-5 text-green-600" />
                <div>
                  <div className="font-medium text-gray-900">Export Data</div>
                  <div className="text-sm text-gray-600">Download CSV</div>
                </div>
              </button>

              <button
                onClick={() => executeBulkAction('reject')}
                className="flex items-center space-x-3 p-4 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <XCircle className="w-5 h-5 text-red-600" />
                <div>
                  <div className="font-medium text-gray-900">Reject</div>
                  <div className="text-sm text-gray-600">Bulk rejection</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            </select>

            <input
              type="text"
              placeholder="Filter by skill..."
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />

            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Min Score:</label>
              <input
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-20 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Candidates Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Candidates ({filteredCandidates.length})
              </h3>
              <button
                onClick={handleSelectAll}
                className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
              >
                {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Match Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Experience
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
                {filteredCandidates.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedCandidates.has(candidate.id)}
                        onChange={() => handleSelectCandidate(candidate.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {candidate.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {candidate.email}
                        </div>
                        {candidate.phone && (
                          <div className="text-sm text-gray-500">
                            {candidate.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(candidate.status)}`}>
                        {getStatusIcon(candidate.status)}
                        <span className="ml-1 capitalize">{candidate.status.replace('_', ' ')}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className={`text-sm font-medium ${
                          candidate.match_score >= 90 ? 'text-green-600' :
                          candidate.match_score >= 80 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {candidate.match_score}%
                        </span>
                        <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              candidate.match_score >= 90 ? 'bg-green-600' :
                              candidate.match_score >= 80 ? 'bg-yellow-600' :
                              'bg-red-600'
                            }`}
                            style={{ width: `${candidate.match_score}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {candidate.skills.slice(0, 3).map((skill, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            {skill}
                          </span>
                        ))}
                        {candidate.skills.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{candidate.skills.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {candidate.experience_years} years
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(candidate.applied_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button className="text-blue-600 hover:text-blue-800">
                          <Eye size={16} />
                        </button>
                        <button className="text-gray-600 hover:text-gray-800">
                          <Edit size={16} />
                        </button>
                        <button className="text-red-600 hover:text-red-800">
                          <Trash2 size={16} />
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
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== 'all' || skillFilter !== 'all' || minScore > 0
                  ? 'Try adjusting your filters or search terms.'
                  : 'Candidates will appear here as they apply to your jobs.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Candidates</p>
                <p className="text-2xl font-bold text-gray-900">{filteredCandidates.length}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Selected</p>
                <p className="text-2xl font-bold text-purple-600">{selectedCandidates.size}</p>
              </div>
              <CheckSquare className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">High Match</p>
                <p className="text-2xl font-bold text-green-600">
                  {filteredCandidates.filter(c => c.match_score >= 90).length}
                </p>
              </div>
              <Star className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ready for Interview</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {filteredCandidates.filter(c => c.status === 'shortlisted').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkCandidateProcessing;