import React, { useState, useEffect } from 'react';
import {
  Zap,
  Target,
  TrendingUp,
  Star,
  MapPin,
  Clock,
  DollarSign,
  Users,
  CheckCircle,
  AlertCircle,
  Bookmark,
  ExternalLink,
  Filter,
  Briefcase,
  Building2,
  Award,
  ThumbsUp,
  ThumbsDown,
  Info,
  ChevronRight
} from 'lucide-react';

// Import your existing ApplicationScreen component
import ApplicationScreen from './ApplicationScreen';

// ============================================
// API SERVICE - JOB MATCHING (AI Gateway)
// ============================================
const API_GATEWAY_URL = import.meta.env.VITE_ML_GATEWAY_URL || 'http://localhost:8080/matcher';

export const getJobMatches = async (candidateId) => {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json'},
      body: JSON.stringify({ candidate_id: candidateId }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching job matches:', error);
    throw error;
  }
};

// ============================================
// API SERVICE - JOB POSTING (Backend)
// ============================================
const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
  };
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const saveJob = async (jobId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/save`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error saving job:', error);
    throw error;
  }
};

export const applyToJob = async (jobId, applicationData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/applications/apply-with-profile/${jobId}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(applicationData),
    });
    return await handleResponse(response);
  } catch (error) {
    console.error('Error applying to job:', error);
    throw error;
  }
};

// ============================================
// MAIN JOB MATCH COMPONENT
// ============================================
const JobMatch = ({ onBack }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [error, setError] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [savedJobs, setSavedJobs] = useState(new Set());
  
  // State for showing ApplicationScreen
  const [showApplication, setShowApplication] = useState(false);
  const [selectedJobForApplication, setSelectedJobForApplication] = useState(null);

  useEffect(() => {
    const fetchJobMatches = async () => {
      try {
        setLoading(true);
        setError(null);
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const candidateId = user?.id || 'b281c649-feee-4859-837f-70d8ffcfdc64';
        const data = await getJobMatches(candidateId);
        if (data.success) {
          setCandidateInfo(data.candidate);
          const transformedMatches = data.matches.map((match) => transformMatchData(match));
          setMatches(transformedMatches);
        } else {
          setError(data.error || 'Failed to load matches');
        }
      } catch (err) {
        console.error('Error fetching job matches:', err);
        setError('Failed to connect to AI matching service. Make sure the API is running on port 8000');
      } finally {
        setLoading(false);
      }
    };
    fetchJobMatches();
  }, []);

  const transformMatchData = (match) => {
    const salaryDisplay = match.salary_details?.min && match.salary_details?.max
      ? `${match.salary_details.currency} ${formatNumber(match.salary_details.min)} - ${formatNumber(match.salary_details.max)}/${match.salary_details.period}`
      : 'Salary not specified';
    const locationDisplay = match.job.locations_display || 
      (match.job.locations?.map(l => l.city).filter(Boolean).join(', ') || 'Location not specified');
    const matchReasons = [];
    const criteria = match.criteria_scores;
    
    if (criteria.skills_match >= 70) {
      matchReasons.push({ type: 'positive', text: `${criteria.skills_match}% skill match with your ${match.skills.matched_skills?.join(', ') || 'skills'}` });
    } else if (match.skills.matched_skills?.length > 0) {
      matchReasons.push({ type: 'positive', text: `✓ Matched skills: ${match.skills.matched_skills.join(', ')}` });
    }
    if (match.skills.missing_skills?.length > 0) {
      matchReasons.push({ type: 'improvement', text: `Consider learning: ${match.skills.missing_skills.slice(0, 3).join(', ')}` });
    }
    if (criteria.experience_years_match >= 90) {
      matchReasons.push({ type: 'positive', text: `Your experience level matches job requirements` });
    }
    if (criteria.location_match >= 90) {
      matchReasons.push({ type: 'positive', text: `Location preference aligns with job (Remote available)` });
    }
    if (criteria.salary_match < 80) {
      matchReasons.push({ type: 'warning', text: `Salary expectation gap: ${match.salary_details.match_message}` });
    }
    if (criteria.experience_level_match < 80) {
      matchReasons.push({ type: 'warning', text: `Experience level gap: ${criteria.experience_level_match}% match to ${match.job.experience_level} role` });
    }
    
    return {
      id: match.job.id,
      title: match.job.title,
      company: match.company.name,
      companyLogo: match.company.logo_url,
      location: locationDisplay,
      salary: salaryDisplay,
      matchScore: match.match_score,
      matchStars: match.match_stars,
      recommendation: match.match_recommendation,
      skills: match.skills.required_skills || [],
      matchedSkills: match.skills.matched_skills || [],
      missingSkills: match.skills.missing_skills || [],
      description: match.job.description || match.job.summary,
      postedDate: formatDate(match.job.published_at),
      applications: match.job.application_count || 0,
      type: match.job.type,
      workArrangement: match.job.work_arrangement,
      responsibilities: match.job.responsibilities || [],
      requirements: match.job.requirements || [],
      benefits: match.job.benefits || [],
      criteriaScores: match.criteria_scores,
      matchReasons: matchReasons,
      companyDetails: match.company,
      jobDetails: match.job,
      screeningQuestions: match.job.screening_questions || [],
      tags: match.job.tags || [],
      expiresAt: match.job.expires_at
    };
  };
  
  const formatNumber = (value) => { 
    if (!value) return '0'; 
    const num = typeof value === 'string'? parseFloat(value) : value; 
    return num.toLocaleString(); 
  };
  
  const formatDate = (dateString) => { 
    if (!dateString) return 'Recently'; 
    const date = new Date(dateString); 
    const now = new Date(); 
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24)); 
    if (diffDays === 0) return 'Today'; 
    if (diffDays === 1) return 'Yesterday'; 
    if (diffDays < 7) return `${diffDays} days ago`; 
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`; 
    return date.toLocaleDateString(); 
  };

  const getMatchColor = (score) => { 
    if (score >= 90) return 'text-green-600 bg-green-100'; 
    if (score >= 75) return 'text-blue-600 bg-blue-100'; 
    if (score >= 60) return 'text-yellow-600 bg-yellow-100'; 
    return 'text-gray-600 bg-gray-100'; 
  };

  const getScoreColor = (score) => { 
    if (score >= 90) return 'bg-gradient-to-r from-green-400 to-green-600'; 
    if (score >= 75) return 'bg-gradient-to-r from-blue-400 to-blue-600'; 
    if (score >= 60) return 'bg-gradient-to-r from-yellow-400 to-yellow-600'; 
    return 'bg-gradient-to-r from-gray-400 to-gray-600'; 
  };

  const handleSaveJob = async (jobId) => {
    try {
      await saveJob(jobId);
      setSavedJobs(prev => new Set([...prev, jobId]));
      alert('Job saved successfully!');
    } catch (error) {
      console.error('Error saving job:', error);
      alert('Failed to save job');
    }
  };

  const handleViewDetails = (match) => {
    setSelectedJob(match);
    setShowDetails(true);
  };

  // Handle Apply - Show ApplicationScreen directly (no modal)
  const handleApply = (match) => {
    setSelectedJobForApply(match);
    setShowApplication(true);
  };

  const filteredMatches = matches.filter(match => {
    if (filter === 'all') return true;
    if (filter === 'high') return match.matchScore >= 90;
    if (filter === 'medium') return match.matchScore >= 75 && match.matchScore < 90;
    if (filter === 'low') return match.matchScore < 75;
    return true;
  });

  // Show Application Screen if applying
  if (showApplication && selectedJobForApply) {
    // Create application data for the ApplicationScreen
    const applicationData = {
      id: `app_${Date.now()}`,
      job_id: selectedJobForApply.id,
      job_title: selectedJobForApply.title,
      company_name: selectedJobForApply.company,
      location: selectedJobForApply.location,
      salary_range: selectedJobForApply.salary,
      job_type: selectedJobForApply.type,
      job_description: selectedJobForApply.description,
      match_score: selectedJobForApply.matchScore,
      status: 'draft',
      applied_at: new Date().toISOString(),
      candidate_name: candidateInfo?.name || 'John Doe',
      candidate_email: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).email : '',
      candidate_location: 'New York, USA',
      candidate_experience: candidateInfo?.total_experience_years || 0,
      skills: candidateInfo?.skills || [],
      answers: {},
      documents: [],
      match_details: {
        skills_match: selectedJobForApply.criteriaScores?.skills_match || 0,
        experience_match: selectedJobForApply.criteriaScores?.experience_years_match || 0,
        location_match: selectedJobForApply.criteriaScores?.location_match || 0
      }
    };

    return (
      <ApplicationScreen
        application={applicationData}
        onBack={() => {
          setShowApplication(false);
          setSelectedJobForApply(null);
        }}
        onCancel={() => {
          setShowApplication(false);
          setSelectedJobForApply(null);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">AI is analyzing your profile against available jobs...</p>
            <p className="text-sm text-gray-500 mt-2">Using WordNet semantic matching technology</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800 mb-2">Unable to load job matches</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Try Again</button>
        </div>
      </div>
    );
  }

  // Job Details Modal (when clicking View Details)
  if (showDetails && selectedJob) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
            <h2 className="text-xl font-bold">{selectedJob.title}</h2>
            <button onClick={() => setShowDetails(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="p-6">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2"><Building2 className="w-5 h-5 text-gray-500" /><span className="font-semibold">{selectedJob.company}</span></div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{selectedJob.location}</span>
                <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" />{selectedJob.salary}</span>
                <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{selectedJob.type} • {selectedJob.workArrangement}</span>
              </div>
              <p className="text-gray-700">{selectedJob.description}</p>
            </div>
            <div className="mb-6"><h3 className="font-semibold text-lg mb-3">Responsibilities</h3><ul className="list-disc list-inside space-y-1 text-gray-700">{selectedJob.responsibilities?.slice(0, 5).map((resp, i) => (<li key={i}>{resp}</li>))}</ul></div>
            <div className="mb-6"><h3 className="font-semibold text-lg mb-3">Requirements</h3><ul className="list-disc list-inside space-y-1 text-gray-700">{selectedJob.requirements?.slice(0, 5).map((req, i) => (<li key={i}>{req}</li>))}</ul></div>
            <div className="mb-6"><h3 className="font-semibold text-lg mb-3">Benefits</h3><div className="flex flex-wrap gap-2">{selectedJob.benefits?.map((benefit, i) => (<span key={i} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">{benefit}</span>))}</div></div>
            <div className="flex gap-3">
              <button onClick={() => handleApply(selectedJob)} className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700">Apply Now</button>
              <button onClick={() => handleSaveJob(selectedJob.id)} className="px-6 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50">Save Job</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Job Matches View
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Zap className="w-8 h-8 text-blue-600" />AI Job Matches</h1>
            <p className="text-gray-600 mt-2">AI-powered job recommendations using WordNet semantic matching</p>
            {candidateInfo && (<div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500"><span> {candidateInfo.name}</span><span>📊 {candidateInfo.level}</span><span> {candidateInfo.total_experience_years} years experience</span><span>''Skills: {candidateInfo.skills?.join(', ')}</span></div>)}
          </div>
          <button onClick={onBack} className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg">← Back to Dashboard</button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Total Matches</p><p className="text-2xl font-bold text-gray-900">{matches.length}</p></div><Target className="w-8 h-8 text-blue-600" /></div></div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-green-600"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Excellent (90%+)</p><p className="text-2xl font-bold text-green-600">{matches.filter(m => m.matchScore >= 90).length}</p></div><Star className="w-8 h-8 text-green-600" /></div></div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-600"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Average Score</p><p className="text-2xl font-bold text-blue-600">{matches.length > 0 ? Math.round(matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length) : 0}%</p></div><TrendingUp className="w-8 h-8 text-blue-600" /></div></div>
          <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-purple-600"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">AI Engine</p><p className="text-lg font-bold text-purple-600">WordNet NLTK</p></div><Award className="w-8 h-8 text-purple-600" /></div></div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Filter className="w-5 h-5 text-gray-600" /><span className="text-sm font-medium text-gray-700">Filter by match:</span>
          <div className="flex flex-wrap gap-2">
            {[{ id: 'all', label: 'All', count: matches.length, color: 'gray'},{ id: 'high', label: 'Excellent (90%+)', count: matches.filter(m => m.matchScore >= 90).length, color: 'green'},{ id: 'medium', label: 'Good (75-89%)', count: matches.filter(m => m.matchScore >= 75 && m.matchScore < 90).length, color: 'blue'},{ id: 'low', label: 'Fair (<75%)', count: matches.filter(m => m.matchScore < 75).length, color: 'yellow'}].map(f => (<button key={f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === f.id ? `bg-${f.color === 'green'? 'green': f.color === 'blue'? 'blue': f.color === 'yellow'? 'yellow': 'gray'}-600 text-white` : `bg-gray-100 text-gray-700 hover:bg-gray-200`}`}>{f.label} ({f.count})</button>))}
          </div>
        </div>
      </div>

      {/* Job Matches */}
      <div className="space-y-6">
        {filteredMatches.map((match) => (
          <div key={match.id} className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
            <div className={`h-2 ${getScoreColor(match.matchScore)}`}></div>
            <div className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-1">{match.title}</h3>
                      <div className="flex items-center gap-2 mb-2">
                        {match.companyLogo ? <img src={match.companyLogo} alt={match.company} className="w-5 h-5 rounded" /> : <Building2 className="w-4 h-4 text-gray-400" />}
                        <p className="text-gray-600 font-medium">{match.company}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-3">
                        <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{match.location}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-4 h-4" />{match.salary}</span>
                        <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{match.postedDate}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" />{match.type} • {match.workArrangement}</span>
                        <span className="flex items-center gap-1"><Users className="w-4 h-4" />{match.applications} applicants</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getMatchColor(match.matchScore)}`}><Star className="w-4 h-4" />{match.matchScore}% Match</div>
                      <p className="text-xs text-gray-500 mt-1">{match.matchStars} {match.recommendation}</p>
                    </div>
                  </div>
                  <p className="text-gray-700 mb-4 line-clamp-2">{match.description}</p>
                  <div className="flex flex-wrap gap-2 mb-4">{match.skills.slice(0, 6).map((skill, index) => (<span key={index} className={`px-2 py-1 text-xs rounded-full ${match.matchedSkills.includes(skill) ? 'bg-green-100 text-green-800 border border-green-300': 'bg-gray-100 text-gray-600'}`}>{skill}{match.matchedSkills.includes(skill) && '✓'}</span>))}</div>
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4"><h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2"><CheckCircle className="w-4 h-4" />AI Match Analysis</h4><ul className="text-sm space-y-1">{match.matchReasons.slice(0, 4).map((reason, index) => (<li key={index} className="flex items-start gap-2">{reason.type === 'positive'&& <ThumbsUp className="w-4 h-4 text-green-600 mt-0.5" />}{reason.type === 'warning'&& <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />}{reason.type === 'improvement'&& <Info className="w-4 h-4 text-blue-600 mt-0.5" />}<span className={reason.type === 'positive'? 'text-green-800': reason.type === 'warning'? 'text-yellow-800': 'text-blue-800'}>{reason.text}</span></li>))}</ul></div>
                  <div className="flex flex-wrap gap-3 text-xs"><span className="px-2 py-1 bg-gray-100 rounded">Skills: {match.criteriaScores.skills_match}%</span><span className="px-2 py-1 bg-gray-100 rounded">Experience: {match.criteriaScores.experience_years_match}%</span><span className="px-2 py-1 bg-gray-100 rounded">Level: {match.criteriaScores.experience_level_match}%</span><span className="px-2 py-1 bg-gray-100 rounded">Salary: {match.criteriaScores.salary_match}%</span></div>
                </div>
                <div className="flex flex-col gap-2 lg:min-w-[200px]">
                  <button onClick={() => handleViewDetails(match)} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"><ExternalLink className="w-4 h-4" />View Details</button>
                  <button onClick={() => handleSaveJob(match.id)} className="w-full px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center justify-center gap-2"><Bookmark className="w-4 h-4" />{savedJobs.has(match.id) ? 'Saved': 'Save Job'}</button>
                  <button onClick={() => handleApply(match)} className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2">Apply Now<ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filteredMatches.length === 0 && (<div className="text-center py-12 bg-gray-50 rounded-lg"><AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" /><h3 className="text-xl font-semibold text-gray-900 mb-2">No matches found</h3><p className="text-gray-600">Update your profile to see more job matches.</p></div>)}
      </div>
    </div>
  );
};

export default JobMatch;