import React, { useState, useEffect } from 'react';
import JobApplicationModal from './JobApplicationModal';
import appliedJobsManager from '../../src/utils/AppliedJobsManager';
import {
  Bookmark,
  X,
  Search,
  Filter,
  Calendar,
  MapPin,
  DollarSign,
  Briefcase,
  Star,
  Trash2,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

interface SavedJob {
  id: string;
  title: string;
  company_name: string;
  location: string;
  job_type: string;
  experience_level: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
  description: string;
  saved_at: string;
  notes?: string;
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  match_score?: number;
  match_stars?: string;
  recommendation?: string;
  requirements?: string | string[];
  skills_required?: string[];
}

interface SavedJobsProps {
  onBack: () => void;
  user?: any;
}

const SavedJobs: React.FC<SavedJobsProps> = ({ onBack, user }) => {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<SavedJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [selectedJob, setSelectedJob] = useState<SavedJob | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [editingNotes, setEditingNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  // Application Modal State
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedJobForApply, setSelectedJobForApply] = useState<SavedJob | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<string[]>(() => appliedJobsManager.getAllAppliedJobs());
  
  // Real profile data from API
  const [fullCandidateProfile, setFullCandidateProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

  // Fetch saved jobs from API
  const fetchSavedJobsFromAPI = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/jobs/saved`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // The backend wraps the payload as { success, data: { data: [...], pagination } },
          // so the array is at data.data.data. Be tolerant of either shape.
          const payload = data.data;
          const list: SavedJob[] = Array.isArray(payload)
            ? payload
            : (payload.data || payload.savedJobs || payload.jobs || []);
          console.log('SavedJobs: Fetched saved jobs from API:', list.map((job: SavedJob) => ({ id: job.id, title: job.title })));
          setSavedJobs(list);
          setFilteredJobs(list);
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching saved jobs from API:', error);
    }
  };

  // Fetch full candidate profile
  const fetchFullCandidateProfile = async () => {
    try {
      setProfileLoading(true);
      const token = localStorage.getItem('authToken');
      const userId = user?.id || localStorage.getItem('userId');
      
      if (!token || !userId) {
        setProfileLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/candidates/full-profile/${userId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        setProfileLoading(false);
        return;
      }

      const data = await response.json();
      if (data.success) {
        setFullCandidateProfile(data.data);
      }
    } catch (error) {
      console.error('Error fetching full profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    // Load existing applications on mount
    const loadApplications = async () => {
      await appliedJobsManager.loadFromAPI();
      setAppliedJobs(appliedJobsManager.getAllAppliedJobs());
    };
    loadApplications();

    // Fetch candidate profile
    fetchFullCandidateProfile();

    // Load saved jobs from API
    const loadSavedJobs = async () => {
      try {
        await fetchSavedJobsFromAPI();
      } catch (error) {
        console.error('Error loading saved jobs:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSavedJobs();

    // Set up listener for applied jobs changes
    const handleAppliedJobsChange = (appliedJobIds: string[]) => {
      console.log('SavedJobs: Applied jobs updated:', appliedJobIds);
      setAppliedJobs(appliedJobIds);
    };
    appliedJobsManager.addListener(handleAppliedJobsChange);

    // Cleanup listener
    return () => {
      appliedJobsManager.removeListener(handleAppliedJobsChange);
    };
  }, [user?.id]);

  const allTags = Array.from(new Set(savedJobs.flatMap(job => job.tags)));

  // Helper functions
  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const formatSalary = (min?: number, max?: number, currency?: string): string => {
    if (!min && !max) return 'Salary not specified';
    const curr = currency || 'USD';
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    if (max) return `Up to ${curr} ${max.toLocaleString()}`;
    return 'Salary not specified';
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      case 'low': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getMatchColor = (score: number): string => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const removeSavedJob = async (jobId: string): Promise<void> => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/jobs/saved/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        }
      });

      if (response.ok) {
        const updatedJobs = savedJobs.filter(job => job.id !== jobId);
        setSavedJobs(updatedJobs);
        setFilteredJobs(updatedJobs);
        setDeleteConfirm(null);
      } else {
        console.error('Failed to remove saved job');
      }
    } catch (error) {
      console.error('Error removing saved job:', error);
    }
  };

  const updateJobNotes = (jobId: string, notes: string): void => {
    const updatedJobs = savedJobs.map(job => 
      job.id === jobId ? { ...job, notes } : job
    );
    setSavedJobs(updatedJobs);
    setFilteredJobs(updatedJobs);
  };

  const removeJobTag = (jobId: string, tagToRemove: string): void => {
    const updatedJobs = savedJobs.map(job =>
      job.id === jobId ? { ...job, tags: (job.tags || []).filter(tag => tag !== tagToRemove) } : job
    );
    setSavedJobs(updatedJobs);
    setFilteredJobs(updatedJobs);
  };

  const updateJobPriority = (jobId: string, priority: 'low' | 'medium' | 'high'): void => {
    const updatedJobs = savedJobs.map(job =>
      job.id === jobId ? { ...job, priority } : job
    );
    setSavedJobs(updatedJobs);
    setFilteredJobs(updatedJobs);
  };

  // Filter jobs based on search and filter criteria
  useEffect(() => {
    let filtered = savedJobs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(job =>
        (job.title || '').toLowerCase().includes(q) ||
        (job.company_name || '').toLowerCase().includes(q) ||
        (job.description || '').toLowerCase().includes(q)
      );
    }

    if (filterPriority) {
      filtered = filtered.filter(job => job.priority === filterPriority);
    }

    if (filterTags.length > 0) {
      filtered = filtered.filter(job =>
        filterTags.some(tag => (job.tags || []).includes(tag))
      );
    }

    setFilteredJobs(filtered);
  }, [savedJobs, searchQuery, filterPriority, filterTags]);

  const handleApplyJob = (job: SavedJob): void => {
    setSelectedJobForApply(job);
    setShowApplicationModal(true);
  };

  // The JobApplicationModal performs the submission itself and calls this on
  // success — so here we ONLY sync local state (mark applied, close the modal).
  // Re-submitting here would cause a duplicate application.
  const handleApplicationSubmit = (_data?: any): void => {
    if (selectedJobForApply) {
      appliedJobsManager.addAppliedJob(selectedJobForApply.id);
      setAppliedJobs(appliedJobsManager.getAllAppliedJobs());
    }
    setShowApplicationModal(false);
    setSelectedJobForApply(null);
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading saved jobs...</p>
        </div>
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
              <h1 className="text-2xl font-bold text-gray-900">Saved Jobs</h1>
            </div>
            <div className="text-sm text-gray-600">
              {filteredJobs.length} saved {filteredJobs.length === 1 ? 'job' : 'jobs'}
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search saved jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.slice(0, 5).map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    if (filterTags.includes(tag)) {
                      setFilterTags(filterTags.filter(t => t !== tag));
                    } else {
                      setFilterTags([...filterTags, tag]);
                    }
                  }}
                  className={`px-3 py-1 text-sm rounded-full ${
                    filterTags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {(searchQuery || filterPriority || filterTags.length > 0) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterPriority('');
                setFilterTags([]);
              }}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 gap-6">
          {/* Jobs List */}
          {savedJobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <Bookmark className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No saved jobs yet</h3>
              <p className="text-gray-600 mb-6">
                Start browsing jobs and click the bookmark icon to save jobs you're interested in!
              </p>
              <button
                onClick={onBack}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Browse Jobs
              </button>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <Filter className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No jobs match your filters</h3>
              <p className="text-gray-600 mb-6">
                Try adjusting your search criteria or clear the filters
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterPriority('');
                  setFilterTags([]);
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map((job) => (
                <div key={job.id} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Briefcase className="w-6 h-6 text-blue-600" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 truncate">
                              {job.title}
                            </h3>
                            <span className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(job.priority)}`}>
                              {job.priority} priority
                            </span>
                            {job.match_score && (
                              <span className={`px-2 py-1 text-xs rounded-full ${getMatchColor(job.match_score)}`}>
                                <Star className="w-3 h-3 inline mr-1" />
                                {job.match_score}% Match
                              </span>
                            )}
                          </div>
                          <p className="text-gray-600">{job.company_name}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                            <span className="flex items-center">
                              <MapPin size={16} className="mr-1" />
                              {job.location}
                            </span>
                            <span className="flex items-center">
                              <DollarSign size={16} className="mr-1" />
                              {formatSalary(job.salary_min, job.salary_max, job.currency)}
                            </span>
                            <span className="flex items-center">
                              <Calendar size={16} className="mr-1" />
                              Saved {getTimeAgo(job.saved_at)}
                            </span>
                          </div>
                          <p className="text-gray-700 mt-3 line-clamp-2">
                            {job.description}
                          </p>
                          {job.tags && job.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                              {job.tags.map((tag, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center"
                                >
                                  {tag}
                                  <button
                                    onClick={() => removeJobTag(job.id, tag)}
                                    className="ml-1 hover:text-blue-900"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {job.notes && (
                            <div className="mt-3 p-3 bg-gray-50 rounded-md">
                              <p className="text-sm text-gray-700">
                                <strong>Notes:</strong> {job.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <select
                        value={job.priority}
                        onChange={(e) => updateJobPriority(job.id, e.target.value as 'low' | 'medium' | 'high')}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <button
                        onClick={() => {
                          setSelectedJob(job);
                          setEditingNotes(job.notes || '');
                          setShowNotesModal(true);
                        }}
                        className="p-2 text-gray-400 hover:text-blue-600"
                        title="Edit notes"
                      >
                        📝
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(job.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                        title="Remove from saved"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => window.open(`/jobs/${job.id}`, '_blank')}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => window.open(`/jobs/${job.id}`, '_blank')}
                        className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleApplyJob(job)}
                        disabled={appliedJobs.includes(job.id)}
                        className={`px-3 py-1 text-sm rounded ${
                          appliedJobs.includes(job.id)
                            ? 'bg-green-100 text-green-700 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {appliedJobs.includes(job.id) ? 'Applied ✓' : 'Apply Now'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Job Application Modal */}
      {showApplicationModal && selectedJobForApply && fullCandidateProfile && (
        <JobApplicationModal
          isOpen={showApplicationModal}
          onClose={() => {
            setShowApplicationModal(false);
            setSelectedJobForApply(null);
          }}
          job={{
            id: selectedJobForApply.id,
            title: selectedJobForApply.title,
            company_name: selectedJobForApply.company_name,
            location: selectedJobForApply.location,
            salary_range: formatSalary(selectedJobForApply.salary_min, selectedJobForApply.salary_max, selectedJobForApply.currency),
            job_type: selectedJobForApply.job_type,
            work_arrangement: 'hybrid',
            description: selectedJobForApply.description,
            requirements: selectedJobForApply.requirements ? 
              (Array.isArray(selectedJobForApply.requirements) ? selectedJobForApply.requirements : [selectedJobForApply.requirements]) : [],
            skills_required: selectedJobForApply.skills_required || [],
            screeningQuestions: [],
            expires_at: null
          }}
          candidateProfile={{
            profile: fullCandidateProfile?.profile?.personal_info || {},
            skills: fullCandidateProfile?.skills || [],
            education: fullCandidateProfile?.education || [],
            workExperience: fullCandidateProfile?.work_experience || [],
            portfolioLinks: fullCandidateProfile?.portfolio_links || [],
            resumes: fullCandidateProfile?.resumes || [],
          }}
          matchScore={selectedJobForApply.match_score || 78.7}
          requiredDocuments={['Resume', 'Cover Letter']}
          onSuccess={handleApplicationSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Remove Saved Job?
            </h3>
            <p className="text-gray-600 text-center mb-6">
              Are you sure you want to remove this job from your saved list? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => removeSavedJob(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Notes for {selectedJob.title}
            </h3>
            <textarea
              value={editingNotes}
              onChange={(e) => setEditingNotes(e.target.value)}
              placeholder="Add your notes about this job..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setShowNotesModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateJobNotes(selectedJob.id, editingNotes);
                  setShowNotesModal(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedJobs;