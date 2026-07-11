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
  UserPlus,
  Mail,
  Phone,
  Globe,
  Linkedin,
  Github
} from 'lucide-react';
import applicationAPI from '../services/applicationAPI';
import ApplicationStatus from './ApplicationStatus';

// API Response Types
interface ApiApplication {
  id: string;
  job_id: string;
  company_name?: string;
  company_logo?: string;
  user_id: string;
  application_number: string;
  status: string;
  applied_at: string;
  updated_at: string;
  match_score?: number;
  cover_letter?: string | null;
  expected_salary?: number | null;
  notice_period?: string | null;
  portfolio_url?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  availability?: string | null;
  job_title?: string;
  job_location?: string;
  job_type?: string;
  experience_level?: string;
  salary_min?: string;
  salary_max?: string;
  salary_currency?: string;
  candidate_email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  candidate_location?: string;
  headline?: string;
  profile_photo_url?: string | null;
  skills?: string[];
  certifications?: string[];
  languages?: string[];
}

interface ApiResponse {
  success: boolean;
  data: {
    applications: ApiApplication[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

interface Candidate {
  id: string;
  job_id: string;
  company_name?: string;
  company_logo?: string;
  user_id: string;
  application_number: string;
  status: string;
  applied_at: string;
  updated_at: string;
  match_score?: number;
  name: string;
  email: string;
  phone?: string;
  location: string;
  headline?: string;
  profile_photo_url?: string | null;
  job_title: string;
  job_location: string;
  job_type: string;
  experience_level: string;
  salary_min: number;
  salary_max: number;
  salary_currency: string;
  cover_letter?: string;
  expected_salary?: number;
  notice_period?: string;
  portfolio_url?: string;
  linkedin_url?: string;
  github_url?: string;
  availability?: string;
  skills: string[];
  certifications: string[];
  languages: string[];
  experience_years: number;
  education_level: string;
  remote_work: boolean;
  relocation: boolean;
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
  
  // State for viewing application details
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [viewingApplication, setViewingApplication] = useState(false);

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
    loadSavedSearches();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [candidates, filters]);

  const loadCandidates = async (): Promise<void> => {
    try {
      setLoading(true);

      const searchParams: Record<string, any> = {
        limit: 100,
        page: 1
      };

      console.log('🔍 Fetching applications with params:', searchParams);
      const response = await applicationAPI.getApplications(searchParams) as ApiResponse;
      console.log(' Applications response:', response);

      let applicationsArray: ApiApplication[] = [];
      
      if (response?.data?.applications && Array.isArray(response.data.applications)) {
        applicationsArray = response.data.applications;
      } else if (response?.data && Array.isArray(response.data)) {
        applicationsArray = response.data as unknown as ApiApplication[];
      } else if (Array.isArray(response)) {
        applicationsArray = response as unknown as ApiApplication[];
      }

      const mappedCandidates: Candidate[] = applicationsArray.map((app: ApiApplication) => {
        let experienceYears = 0;
        const headline = app.headline || '';
        const jobTitle = app.job_title || '';
        
        const yearMatch = (headline + ''+ jobTitle).match(/(\d+)\+?\s*(?:years?|yrs?)/i);
        if (yearMatch) {
          experienceYears = parseInt(yearMatch[1], 10);
        }

        let educationLevel = 'Not specified';
        const headlineLower = headline.toLowerCase();
        if (headlineLower.includes('phd') || headlineLower.includes('doctorate')) {
          educationLevel = 'PhD';
        } else if (headlineLower.includes('master')) {
          educationLevel = "Master's";
        } else if (headlineLower.includes('bachelor')) {
          educationLevel = "Bachelor's";
        } else if (headlineLower.includes('associate')) {
          educationLevel = "Associate's";
        }

        let skills: string[] = [];
        if (app.skills && Array.isArray(app.skills)) {
          skills = app.skills;
        }

        let certifications: string[] = [];
        if (app.certifications && Array.isArray(app.certifications)) {
          certifications = app.certifications;
        }

        let languages: string[] = [];
        if (app.languages && Array.isArray(app.languages)) {
          languages = app.languages;
        }

        return {
          id: app.id,
          job_id: app.job_id,
          company_name: app.company_name,
          company_logo: app.company_logo,
          user_id: app.user_id,
          application_number: app.application_number,
          status: app.status,
          applied_at: app.applied_at,
          updated_at: app.updated_at,
          match_score: app.match_score,
          name: `${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Unknown Candidate',
          email: app.candidate_email || '',
          phone: app.phone,
          location: app.candidate_location || app.job_location || 'Not specified',
          headline: app.headline,
          profile_photo_url: app.profile_photo_url,
          job_title: app.job_title || 'Unknown Position',
          job_location: app.job_location || 'Remote',
          job_type: app.job_type || 'full-time',
          experience_level: app.experience_level || 'Not specified',
          salary_min: app.salary_min ? parseFloat(app.salary_min) : 0,
          salary_max: app.salary_max ? parseFloat(app.salary_max) : 0,
          salary_currency: app.salary_currency || 'Rwf',
          cover_letter: app.cover_letter || undefined,
          expected_salary: app.expected_salary ? Number(app.expected_salary) : undefined,
          notice_period: app.notice_period || undefined,
          portfolio_url: app.portfolio_url || undefined,
          linkedin_url: app.linkedin_url || undefined,
          github_url: app.github_url || undefined,
          availability: app.availability || 'not_specified',
          skills: skills,
          certifications: certifications,
          languages: languages,
          experience_years: experienceYears,
          education_level: educationLevel,
          remote_work: false,
          relocation: false
        };
      });

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

  const loadSavedSearches = (): void => {
    const saved = localStorage.getItem('savedCandidateSearches');
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
  };

  const applyFilters = (): void => {
    const filtered = candidates.filter(candidate => {
      if (filters.keywords) {
        const keywordMatch = filters.keywords.toLowerCase().split(' ').every(keyword =>
          (candidate.name && candidate.name.toLowerCase().includes(keyword)) ||
          (candidate.email && candidate.email.toLowerCase().includes(keyword)) ||
          (candidate.skills && candidate.skills.some(skill => skill.toLowerCase().includes(keyword))) ||
          (candidate.job_title && candidate.job_title.toLowerCase().includes(keyword)) ||
          (candidate.company_name && candidate.company_name.toLowerCase().includes(keyword))
        );
        if (!keywordMatch) return false;
      }

      if (filters.location && candidate.location && !candidate.location.toLowerCase().includes(filters.location.toLowerCase())) {
        return false;
      }

      if (candidate.experience_years) {
        if (candidate.experience_years < filters.experience_min || candidate.experience_years > filters.experience_max) {
          return false;
        }
      } else if (filters.experience_min > 0) {
        return false;
      }

      if (filters.education_level && candidate.education_level !== filters.education_level) {
        return false;
      }

      if (candidate.expected_salary) {
        if (candidate.expected_salary < filters.salary_min || candidate.expected_salary > filters.salary_max) {
          return false;
        }
      }

      if (filters.skills.length > 0) {
        const hasRequiredSkills = filters.skills.every(skill =>
          candidate.skills.some(candidateSkill => candidateSkill.toLowerCase().includes(skill.toLowerCase()))
        );
        if (!hasRequiredSkills) return false;
      }

      if (filters.certifications.length > 0) {
        const hasRequiredCerts = filters.certifications.every(cert =>
          candidate.certifications.some(candidateCert => candidateCert.toLowerCase().includes(cert.toLowerCase()))
        );
        if (!hasRequiredCerts) return false;
      }

      if (filters.languages.length > 0) {
        const hasRequiredLangs = filters.languages.every(lang =>
          candidate.languages.some(candidateLang => candidateLang.toLowerCase().includes(lang.toLowerCase()))
        );
        if (!hasRequiredLangs) return false;
      }

      if (filters.job_title && candidate.job_title && !candidate.job_title.toLowerCase().includes(filters.job_title.toLowerCase())) {
        return false;
      }

      if (filters.company && candidate.company_name && !candidate.company_name.toLowerCase().includes(filters.company.toLowerCase())) {
        return false;
      }

      if (candidate.match_score != null && candidate.match_score < filters.match_score_min) {
        return false;
      }

      if (filters.availability && candidate.availability !== filters.availability) {
        return false;
      }

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

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]): void => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const addSkill = (skill: string): void => {
    if (skill && !filters.skills.includes(skill)) {
      updateFilter('skills', [...filters.skills, skill]);
    }
  };

  const removeSkill = (skill: string): void => {
    updateFilter('skills', filters.skills.filter(s => s !== skill));
  };

  const addCertification = (cert: string): void => {
    if (cert && !filters.certifications.includes(cert)) {
      updateFilter('certifications', [...filters.certifications, cert]);
    }
  };

  const removeCertification = (cert: string): void => {
    updateFilter('certifications', filters.certifications.filter(c => c !== cert));
  };

  const addLanguage = (lang: string): void => {
    if (lang && !filters.languages.includes(lang)) {
      updateFilter('languages', [...filters.languages, lang]);
    }
  };

  const removeLanguage = (lang: string): void => {
    updateFilter('languages', filters.languages.filter(l => l !== lang));
  };

  const saveSearch = (): void => {
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

  const loadSearch = (search: any): void => {
    setFilters(search.filters);
    setSearchName(search.name);
  };

  const deleteSearch = (searchId: string): void => {
    const updated = savedSearches.filter(s => s.id !== searchId);
    setSavedSearches(updated);
    localStorage.setItem('savedCandidateSearches', JSON.stringify(updated));
  };

  const clearFilters = (): void => {
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

  const toggleExpanded = (candidateId: string): void => {
    const newExpanded = new Set(expandedCandidates);
    if (newExpanded.has(candidateId)) {
      newExpanded.delete(candidateId);
    } else {
      newExpanded.add(candidateId);
    }
    setExpandedCandidates(newExpanded);
  };

  // Handle viewing application details
  const handleViewApplication = (applicationId: string): void => {
    console.log('🔍 Viewing application details for:', applicationId);
    setSelectedApplicationId(applicationId);
    setViewingApplication(true);
  };

  // Handle back to search from application details
  const handleBackToSearch = (): void => {
    setViewingApplication(false);
    setSelectedApplicationId(null);
    // Reload candidates to refresh data if needed
    loadCandidates();
  };

  const exportResults = (): void => {
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Location', 'Job Title', 'Company', 'Status', 'Match Score', 'Applied Date'],
      ...filteredCandidates.map(candidate => [
        candidate.name ?? '',
        candidate.email ?? '',
        candidate.phone ?? '',
        candidate.location ?? '',
        candidate.job_title ?? '',
        candidate.company_name ?? '',
        candidate.status ?? '',
        (candidate.match_score ?? 0).toString(),
        candidate.applied_at ? new Date(candidate.applied_at).toLocaleDateString() : ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate-search-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'under_review': return 'bg-yellow-100 text-yellow-800';
      case 'shortlisted': return 'bg-green-100 text-green-800';
      case 'interview': return 'bg-purple-100 text-purple-800';
      case 'assessment': return 'bg-indigo-100 text-indigo-800';
      case 'reference_check': return 'bg-cyan-100 text-cyan-800';
      case 'offer': return 'bg-emerald-100 text-emerald-800';
      case 'hired': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'withdrawn': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatSalary = (min: number, max: number, currency: string): string => {
    if (min && max && min !== max) {
      return `${currency} ${min.toLocaleString()} – ${max.toLocaleString()}`;
    }
    if (min) return `From ${currency} ${min.toLocaleString()}`;
    if (max) return `Up to ${currency} ${max.toLocaleString()}`;
    return 'Not specified';
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // If viewing an application, show the ApplicationStatus component
  if (viewingApplication && selectedApplicationId) {
    return (
      <ApplicationStatus 
        applicationId={selectedApplicationId} 
        onBack={handleBackToSearch}
      />
    );
  }

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
                Avg Match Score: {filteredCandidates.length > 0
                  ? Math.round(filteredCandidates.reduce((sum, c) => sum + (c.match_score ?? 0), 0) / filteredCandidates.length)
                  : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Candidates Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCandidates.map((candidate) => {
            const isExpanded = expandedCandidates.has(candidate.id);
            const salaryDisplay = formatSalary(candidate.salary_min, candidate.salary_max, candidate.salary_currency);
            
            return (
              <div key={candidate.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-3">
                    {candidate.profile_photo_url ? (
                      <img
                        src={candidate.profile_photo_url}
                        alt={candidate.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users size={24} className="text-blue-600" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">{candidate.name}</h4>
                      <p className="text-sm text-gray-600">{candidate.job_title}</p>
                      {candidate.company_name && (
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Building size={12} /> {candidate.company_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(candidate.status)}`}>
                      {candidate.status?.replace(/_/g, '').toUpperCase()}
                    </span>
                    <div className="flex items-center space-x-1">
                      <Star size={14} className="text-yellow-500" />
                      <span className="text-sm font-medium">{candidate.match_score ?? 0}% Match</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <MapPin size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.location}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Briefcase size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.experience_level || 'Not specified'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <GraduationCap size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{candidate.education_level}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">Applied: {formatDate(candidate.applied_at)}</span>
                  </div>
                </div>

                {salaryDisplay && (
                  <div className="flex items-center space-x-2 mb-4">
                    <DollarSign size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600">{salaryDisplay}</span>
                  </div>
                )}

                {candidate.expected_salary && (
                  <div className="flex items-center space-x-2 mb-4">
                    <DollarSign size={16} className="text-green-500" />
                    <span className="text-sm text-gray-600">
                      Expected: {candidate.salary_currency} {candidate.expected_salary.toLocaleString()}
                    </span>
                  </div>
                )}

                {candidate.skills.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Code size={14} /> Skills
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills.slice(0, 6).map((skill, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {skill}
                        </span>
                      ))}
                      {candidate.skills.length > 6 && (
                        <span className="text-xs text-gray-500">+{candidate.skills.length - 6} more</span>
                      )}
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Additional Details</h4>
                    <div className="space-y-2 text-sm text-gray-600">
                      {candidate.email && (
                        <p className="flex items-center gap-2">
                          <Mail size={14} className="text-gray-400" />
                          <a href={`mailto:${candidate.email}`} className="text-blue-600 hover:underline">
                            {candidate.email}
                          </a>
                        </p>
                      )}
                      {candidate.phone && (
                        <p className="flex items-center gap-2">
                          <Phone size={14} className="text-gray-400" />
                          {candidate.phone}
                        </p>
                      )}
                      {candidate.availability && candidate.availability !== 'not_specified'&& (
                        <p><strong>Availability:</strong> {candidate.availability.replace('_', '')}</p>
                      )}
                      {candidate.languages.length > 0 && (
                        <p><strong>Languages:</strong> {candidate.languages.join(', ')}</p>
                      )}
                      {candidate.certifications.length > 0 && (
                        <p><strong>Certifications:</strong> {candidate.certifications.join(', ')}</p>
                      )}
                      {candidate.cover_letter && (
                        <div>
                          <strong>Cover Letter:</strong>
                          <p className="mt-1 text-xs bg-gray-50 p-2 rounded">{candidate.cover_letter.substring(0, 300)}...</p>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2">
                        {candidate.portfolio_url && (
                          <a href={candidate.portfolio_url} target="_blank" rel="noopener noreferrer" 
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                            <Globe size={12} /> Portfolio
                          </a>
                        )}
                        {candidate.linkedin_url && (
                          <a href={candidate.linkedin_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                            <Linkedin size={12} /> LinkedIn
                          </a>
                        )}
                        {candidate.github_url && (
                          <a href={candidate.github_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                            <Github size={12} /> GitHub
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-3 border-t">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">App #{candidate.application_number?.slice(-6)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleExpanded(candidate.id)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 flex items-center space-x-1"
                    >
                      <Eye size={14} />
                      <span>{isExpanded ? 'Show Less': 'Show More'}</span>
                    </button>
                    <button
                      onClick={() => handleViewApplication(candidate.id)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center space-x-1"
                    >
                      <UserPlus size={14} />
                      <span>View Details</span>
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