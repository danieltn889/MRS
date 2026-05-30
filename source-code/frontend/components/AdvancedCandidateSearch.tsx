import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  SlidersHorizontal,
  MapPin,
  Briefcase,
  GraduationCap,
  DollarSign,
  Calendar,
  Star,
  Users,
  Building,
  Code,
  Award,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Save,
  Download,
  Eye,
  UserPlus
} from 'lucide-react';
import applicationAPI, { Application } from '../services/applicationAPI';

interface Candidate {
  id: string;
  job_id: string;
  // FIX 1: Removed duplicate `job_title` field declaration
  company_name?: string;
  company_logo?: string;
  user_id: string;
  application_number: string;
  status: string;
  applied_at: string;
  updated_at: string;
  submitted_data?: {
    coverLetter?: string;
    expectedSalary?: number;
    noticePeriod?: string;
    portfolioUrl?: string;
    linkedinUrl?: string;
    githubUrl?: string;
    availability?: string;
  };
  match_score?: number;
  rejection_reason?: string;
  interview_date?: string;
  assigned_to?: string;
  notes?: string;
  feedback?: string;
  profile_data?: any;
  source?: string;
  cover_letter?: string;
  expected_salary?: number;
  notice_period?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  github_url?: string;
  availability?: string;
  job_location?: string;
  job_type?: string;
  experience_level?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  candidate_email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  candidate_location?: string;
  headline?: string;
  profile_photo_url?: string;
  // Mapped fields for display
  name?: string;
  email?: string;
  location?: string;
  experience_years?: number;
  education_level?: string;
  current_salary?: number;
  skills?: string[];
  job_title?: string;
  company?: string;
  match_score_display?: number;
  certifications?: string[];
  languages?: string[];
  remote_work?: boolean;
  relocation?: boolean;
  applied_date?: string;
}

interface SearchFilters {
  keywords: string;
  location: string;
  experience_min: number;
  experience_max: number;
  education_level: string;
  salary_min: number;
  salary_max: number;
  skills: string[];
  job_title: string;
  company: string;
  match_score_min: number;
  availability: string;
  certifications: string[];
  languages: string[];
  remote_work: boolean | null;
  relocation: boolean | null;
  applied_date_from: string;
  applied_date_to: string;
}

interface AdvancedCandidateSearchProps {
  onBack: () => void;
}

const AdvancedCandidateSearch = ({ onBack }: AdvancedCandidateSearchProps) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [savedSearches, setSavedSearches] = useState<any[]>([]);
  const [searchName, setSearchName] = useState('');
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());

  const [filters, setFilters] = useState<SearchFilters>({
    keywords: '',
    location: '',
    experience_min: 0,
    experience_max: 20,
    education_level: '',
    salary_min: 0,
    salary_max: 300000,
    skills: [],
    job_title: '',
    company: '',
    match_score_min: 0,
    availability: '',
    certifications: [],
    languages: [],
    remote_work: null,
    relocation: null,
    applied_date_from: '',
    applied_date_to: ''
  });

  useEffect(() => {
    loadCandidates();
    // FIX 2: loadSavedSearches was never called — added here so saved searches load on mount
    loadSavedSearches();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [candidates, filters]);

  const loadCandidates = async () => {
    try {
      setLoading(true);

      const searchParams: any = {
        limit: 100,
        page: 1
      };

      console.log('🔍 Fetching applications with params:', searchParams);
      const response = await applicationAPI.getApplications(searchParams);
      console.log('📥 Applications response:', response);

      let applicationsArray = [];
      if (response?.data?.applications && Array.isArray(response.data.applications)) {
        applicationsArray = response.data.applications;
      } else if (response?.data && Array.isArray(response.data)) {
        applicationsArray = response.data;
      } else if (Array.isArray(response)) {
        applicationsArray = response;
      }

      const mappedCandidates: Candidate[] = applicationsArray.map((app: any) => ({
        ...app,
        name: `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Unknown',
        email: app.candidate_email || '',
        location: app.candidate_location || '',
        experience_years: 0,
        education_level: '',
        current_salary: app.expected_salary ? Number(app.expected_salary) : undefined,
        expected_salary: app.expected_salary ? Number(app.expected_salary) : undefined,
        skills: [],
        job_title: app.job_title || '',
        company: app.company_name || '',
        match_score: app.match_score || 0,
        match_score_display: app.match_score || 0,
        availability: app.availability || app.submitted_data?.availability || 'not_specified',
        certifications: [],
        languages: [],
        remote_work: false,
        relocation: false,
        applied_date: app.applied_at || new Date().toISOString(),
        status: app.status || 'submitted'
      }));

      // FIX 3: loadCandidates was incorrectly applying filters by treating the array `filtered`
      // as a single object (e.g. `filtered.name`, `filtered.candidate_location`).
      // Removed the broken per-field early-exit logic here; applyFilters() handles all filtering
      // reactively via the useEffect whenever `candidates` or `filters` changes.
      setCandidates(mappedCandidates);

      console.log('📋 Loaded applications:', {
        totalApplications: mappedCandidates.length,
        applications: mappedCandidates.map(app => ({
          id: app.id,
          name: app.name,
          job_title: app.job_title,
          match_score: app.match_score
        }))
      });
    } catch (error) {
      console.error('Error loading applications:', error);
      setCandidates([]);
      setFilteredCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSearches = () => {
    const saved = localStorage.getItem('savedCandidateSearches');
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
  };

  const applyFilters = () => {
    const filtered = candidates.filter(candidate => {
      // Keywords search
      if (filters.keywords) {
        const keywordMatch = filters.keywords.toLowerCase().split(' ').every(keyword =>
          (candidate.name && candidate.name.toLowerCase().includes(keyword)) ||
          (candidate.email && candidate.email.toLowerCase().includes(keyword)) ||
          (candidate.skills && candidate.skills.some(skill => skill.toLowerCase().includes(keyword))) ||
          (candidate.job_title && candidate.job_title.toLowerCase().includes(keyword)) ||
          (candidate.company && candidate.company.toLowerCase().includes(keyword))
        );
        if (!keywordMatch) return false;
      }

      // FIX 4: Was using `candidate.candidate_location` inconsistently — normalised to
      // the mapped `candidate.location` field which is always populated in loadCandidates
      if (filters.location && candidate.location && !candidate.location.toLowerCase().includes(filters.location.toLowerCase())) {
        return false;
      }

      // Salary
      if (candidate.expected_salary) {
        if (candidate.expected_salary < filters.salary_min || candidate.expected_salary > filters.salary_max) {
          return false;
        }
      }

      // Job title
      if (filters.job_title && candidate.job_title && !candidate.job_title.toLowerCase().includes(filters.job_title.toLowerCase())) {
        return false;
      }

      // Company
      if (filters.company && candidate.company_name && !candidate.company_name.toLowerCase().includes(filters.company.toLowerCase())) {
        return false;
      }

      // Match score
      // FIX 5: Added null guard — match_score could be undefined, which made the comparison unreliable
      if (candidate.match_score != null && candidate.match_score < filters.match_score_min) {
        return false;
      }

      // Availability
      if (filters.availability && candidate.availability !== filters.availability) {
        return false;
      }

      // Applied date range
      if (filters.applied_date_from) {
        if (new Date(candidate.applied_at) < new Date(filters.applied_date_from)) {
          return false;
        }
      }
      if (filters.applied_date_to) {
        if (new Date(candidate.applied_at) > new Date(filters.applied_date_to)) {
          return false;
        }
      }

      return true;
    });

    setFilteredCandidates(filtered);
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const addSkill = (skill: string) => {
    if (skill && !filters.skills.includes(skill)) {
      updateFilter('skills', [...filters.skills, skill]);
    }
  };

  const removeSkill = (skill: string) => {
    updateFilter('skills', filters.skills.filter(s => s !== skill));
  };

  const addCertification = (cert: string) => {
    if (cert && !filters.certifications.includes(cert)) {
      updateFilter('certifications', [...filters.certifications, cert]);
    }
  };

  const removeCertification = (cert: string) => {
    updateFilter('certifications', filters.certifications.filter(c => c !== cert));
  };

  const addLanguage = (lang: string) => {
    if (lang && !filters.languages.includes(lang)) {
      updateFilter('languages', [...filters.languages, lang]);
    }
  };

  const removeLanguage = (lang: string) => {
    updateFilter('languages', filters.languages.filter(l => l !== lang));
  };

  const saveSearch = () => {
    if (!searchName.trim()) return;

    const newSearch = {
      id: Date.now().toString(),
      name: searchName,
      filters: { ...filters },
      created_at: new Date().toISOString()
    };

    const updated = [...savedSearches, newSearch];
    setSavedSearches(updated);
    localStorage.setItem('savedCandidateSearches', JSON.stringify(updated));
    setSearchName('');
  };

  const loadSearch = (search: any) => {
    setFilters(search.filters);
    setSearchName(search.name);
  };

  const deleteSearch = (searchId: string) => {
    const updated = savedSearches.filter(s => s.id !== searchId);
    setSavedSearches(updated);
    localStorage.setItem('savedCandidateSearches', JSON.stringify(updated));
  };

  const clearFilters = () => {
    setFilters({
      keywords: '',
      location: '',
      experience_min: 0,
      experience_max: 20,
      education_level: '',
      salary_min: 0,
      salary_max: 300000,
      skills: [],
      job_title: '',
      company: '',
      match_score_min: 0,
      availability: '',
      certifications: [],
      languages: [],
      remote_work: null,
      relocation: null,
      applied_date_from: '',
      applied_date_to: ''
    });
  };

  const toggleExpanded = (candidateId: string) => {
    const newExpanded = new Set(expandedCandidates);
    if (newExpanded.has(candidateId)) {
      newExpanded.delete(candidateId);
    } else {
      newExpanded.add(candidateId);
    }
    setExpandedCandidates(newExpanded);
  };

  const exportResults = () => {
    // FIX 6: Added null guards on all fields that could be undefined before calling
    // array methods like .join() or string conversions
    const csvContent = [
      ['Name', 'Email', 'Location', 'Experience', 'Education', 'Skills', 'Match Score', 'Availability', 'Applied Date'],
      ...filteredCandidates.map(candidate => [
        candidate.name ?? '',
        candidate.email ?? '',
        candidate.location ?? '',
        (candidate.experience_years ?? 0).toString(),
        candidate.education_level ?? '',
        (candidate.skills ?? []).join('; '),
        (candidate.match_score ?? 0).toString(),
        candidate.availability ?? '',
        candidate.applied_date ? new Date(candidate.applied_date).toLocaleDateString() : ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate-search-results-${new Date().toISOString().split('T')[0]}.csv`;
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
              <h1 className="text-2xl font-bold text-gray-900">Advanced Candidate Search</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                <SlidersHorizontal size={16} />
                <span>Filters</span>
                {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <button
                onClick={exportResults}
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
        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Saved Searches</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedSearches.map(search => (
                <div key={search.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{search.name}</h4>
                    <button
                      onClick={() => deleteSearch(search.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Created {new Date(search.created_at).toLocaleDateString()}
                  </p>
                  <button
                    onClick={() => loadSearch(search)}
                    className="w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Load Search
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Search Filters</h3>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search name..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={saveSearch}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center space-x-1"
                  >
                    <Save size={14} />
                    <span>Save</span>
                  </button>
                </div>
                <button
                  onClick={clearFilters}
                  className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Keywords
                </label>
                <input
                  type="text"
                  value={filters.keywords}
                  onChange={(e) => updateFilter('keywords', e.target.value)}
                  placeholder="Skills, job titles, companies..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) => updateFilter('location', e.target.value)}
                    placeholder="City, State, or Country"
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Experience Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Experience (Years)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={filters.experience_min}
                    onChange={(e) => updateFilter('experience_min', Number(e.target.value))}
                    className="w-20 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={filters.experience_max}
                    onChange={(e) => updateFilter('experience_max', Number(e.target.value))}
                    className="w-20 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Education Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Education Level
                </label>
                <select
                  value={filters.education_level}
                  onChange={(e) => updateFilter('education_level', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Any</option>
                  <option value="High School">High School</option>
                  <option value="Associate's">Associate's</option>
                  <option value="Bachelor's">Bachelor's</option>
                  <option value="Master's">Master's</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>

              {/* Salary Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected Salary ($)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={filters.salary_min}
                    onChange={(e) => updateFilter('salary_min', Number(e.target.value))}
                    className="w-24 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-gray-500">to</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={filters.salary_max}
                    onChange={(e) => updateFilter('salary_max', Number(e.target.value))}
                    className="w-24 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Match Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Match Score
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filters.match_score_min}
                  onChange={(e) => updateFilter('match_score_min', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Required Skills
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {filters.skills.map(skill => (
                    <span
                      key={skill}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      {skill}
                      <button
                        onClick={() => removeSkill(skill)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Add skill..."
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      addSkill((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Availability */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Availability
                </label>
                <select
                  value={filters.availability}
                  onChange={(e) => updateFilter('availability', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Any</option>
                  <option value="immediate">Immediate</option>
                  <option value="2_weeks">2 Weeks</option>
                  <option value="1_month">1 Month</option>
                  <option value="2_months">2 Months</option>
                  <option value="3_months">3+ Months</option>
                </select>
              </div>

              {/* Remote Work */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Remote Work
                </label>
                <select
                  value={filters.remote_work === null ? '' : filters.remote_work.toString()}
                  onChange={(e) => updateFilter('remote_work', e.target.value === '' ? null : e.target.value === 'true')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Any</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Results Summary */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Search Results ({filteredCandidates.length} candidates)
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Found {filteredCandidates.length} candidates matching your criteria
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                {/* FIX 7: Added null guard on match_score in the reduce to avoid NaN */}
                Avg Match Score: {filteredCandidates.length > 0
                  ? Math.round(filteredCandidates.reduce((sum, c) => sum + (c.match_score ?? 0), 0) / filteredCandidates.length)
                  : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Candidates Grid */}
        {/* FIX 8: Added missing closing </div> for the candidates grid wrapper */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCandidates.map((candidate) => {
            const isExpanded = expandedCandidates.has(candidate.id);
            return (
              <div key={candidate.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users size={24} className="text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">{candidate.name}</h4>
                      <p className="text-sm text-gray-600">{candidate.job_title}</p>
                      {candidate.company && (
                        <p className="text-sm text-gray-500">{candidate.company}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(candidate.status)}`}>
                      {candidate.status.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-1">
                      <Star size={14} className="text-yellow-500" />
                      <span className="text-sm font-medium">{candidate.match_score ?? 0}%</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <MapPin size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.candidate_location || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Briefcase size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.experience_level || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <GraduationCap size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.education_level || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.availability || 'Not specified'}</span>
                  </div>
                </div>

                {candidate.expected_salary && (
                  <div className="flex items-center space-x-2 mb-4">
                    <DollarSign size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Expected: ${candidate.expected_salary.toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Skills</h5>
                  <div className="flex flex-wrap gap-1">
                    {(candidate.skills ?? []).map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {(candidate.certifications ?? []).length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Certifications</h5>
                    <div className="flex flex-wrap gap-1">
                      {(candidate.certifications ?? []).map((cert, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                        >
                          <Award size={12} className="mr-1" />
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Additional Details</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      {candidate.phone && (
                        <p><strong>Phone:</strong> {candidate.phone}</p>
                      )}
                      {candidate.availability && (
                        <p><strong>Availability:</strong> {candidate.availability}</p>
                      )}
                      {(candidate.languages ?? []).length > 0 && (
                        <p><strong>Languages:</strong> {(candidate.languages ?? []).join(', ')}</p>
                      )}
                      {candidate.cover_letter && (
                        <div>
                          <strong>Cover Letter:</strong>
                          <p className="mt-1 text-xs">{candidate.cover_letter.substring(0, 200)}...</p>
                        </div>
                      )}
                      {candidate.portfolio_url && (
                        <p><strong>Portfolio:</strong> <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Portfolio</a></p>
                      )}
                      {candidate.linkedin_url && (
                        <p><strong>LinkedIn:</strong> <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Profile</a></p>
                      )}
                      {candidate.github_url && (
                        <p><strong>GitHub:</strong> <a href={candidate.github_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Profile</a></p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {candidate.remote_work && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Remote OK
                      </span>
                    )}
                    {candidate.relocation && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Open to Relocate
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleExpanded(candidate.id)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center space-x-1"
                    >
                      <Eye size={14} />
                      <span>{isExpanded ? 'View Less' : 'View More'}</span>
                    </button>
                    <button className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center space-x-1">
                      <UserPlus size={14} />
                      <span>Contact</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCandidates.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
            <p className="text-gray-600">
              Try adjusting your search filters to find more candidates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdvancedCandidateSearch;