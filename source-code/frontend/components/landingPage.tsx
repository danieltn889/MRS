import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Menu, X, Brain, Shield, Target,
  Badge, Clock, Award, ChevronRight, Star, Users,
  ArrowRight, Check, Search, Loader2, Briefcase, MapPin,
  Sparkles, GraduationCap, BookOpen, ExternalLink,
  Bookmark, DollarSign, Lock, LogIn
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// =====================================================
// TYPES
// =====================================================

interface JobResult {
  id: string;
  title: string;
  company: string;
  description?: string;
  job_type: string;
  work_arrangement: string;
  location: string[];
  salary: string | null;
  skills?: string[];
  education_level?: string;
  fields_of_study?: string[];
  responsibilities?: string[];
  requirements?: string[];
  qualifications?: string[];
  certifications?: string[];
  experience_level?: string;
  match_priority?: string;
  match_priority_level?: string;
  match_score?: number;
  matched_field?: string;
  priority_icon?: string;
}

interface SearchResponse {
  success: boolean;
  total: number;
  results: JobResult[];
  search_term: string;
  processing_time_ms?: number;
  breakdown?: {
    title_matches: number;
    qualification_matches: number;
    responsibility_matches: number;
    requirement_matches: number;
    skill_matches: number;
  };
}

interface LandingPageProps {
  onLogin: () => void;
}

// =====================================================
// PRIORITY CONFIG
// =====================================================

const PRIORITY_CONFIG: Record<string, {
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
  label: string;
  labelShort: string;
  order: number;
}> = {
  "JOB TITLE": {
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    borderColor: "border-red-200",
    icon: "🎯",
    label: "Title Match (Highest)",
    labelShort: "Title",
    order: 1
  },
  "QUALIFICATIONS": {
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    icon: "📚",
    label: "Qualification Match",
    labelShort: "Qual",
    order: 2
  },
  "RESPONSIBILITIES": {
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    icon: "📋",
    label: "Responsibilities Match",
    labelShort: "Resp",
    order: 3
  },
  "REQUIREMENTS": {
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    borderColor: "border-green-200",
    icon: "✅",
    label: "Requirements Match",
    labelShort: "Req",
    order: 4
  },
  "SKILLS": {
    bgColor: "bg-gray-50",
    textColor: "text-gray-600",
    borderColor: "border-gray-200",
    icon: "💪",
    label: "Skill Match",
    labelShort: "Skills",
    order: 5
  }
};

const SEARCH_API_URL = 'http://localhost:8001/search';

// =====================================================
// JOB CARD COMPONENT
// =====================================================

interface JobCardProps {
  job: JobResult;
  isExpanded: boolean;
  onToggle: () => void;
  onViewJob: (id: string) => void;
}

function JobCard({ job, isExpanded, onToggle, onViewJob }: JobCardProps) {
  const ps = PRIORITY_CONFIG[job.match_priority || 'SKILLS'] || PRIORITY_CONFIG['SKILLS'];

  return (
    <div
      className={`border rounded-xl bg-white transition-all duration-200 overflow-hidden ${
        isExpanded ? 'border-blue-300 shadow-lg' : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-4 h-4 text-gray-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{job.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${ps.bgColor} ${ps.textColor}`}>
              {ps.icon} {ps.labelShort}
            </span>
            {job.match_score != null && (
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
                {Math.round(job.match_score * 100)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            <span>{job.company || 'Company'}</span>
            {job.location?.[0] && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {job.location[0]}
              </span>
            )}
            <span>{job.job_type || 'Full-time'}</span>
            <span className="capitalize">{job.work_arrangement || 'Onsite'}</span>
            {job.experience_level && (
              <span className="capitalize">🎯 {job.experience_level}</span>
            )}
            {job.salary && <span>{job.salary}</span>}
          </div>
        </div>

        <ChevronRight
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
          {job.description && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Description</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{job.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            {job.education_level && (
              <div>
                <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <GraduationCap className="w-3 h-3" /> Education
                </span>
                <p className="text-sm text-gray-700 font-medium">{job.education_level}</p>
              </div>
            )}

            {job.fields_of_study && job.fields_of_study.length > 0 && (
              <div>
                <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <BookOpen className="w-3 h-3" /> Fields of Study
                </span>
                <p className="text-sm text-gray-700">{job.fields_of_study.join(', ')}</p>
              </div>
            )}

            {job.certifications && job.certifications.length > 0 && (
              <div className="col-span-2">
                <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                  <Award className="w-3 h-3" /> Certifications
                </span>
                <p className="text-sm text-gray-700">{job.certifications.join(', ')}</p>
              </div>
            )}
          </div>

          {job.skills && job.skills.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Required Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map(skill => (
                  <span key={skill} className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {job.responsibilities && job.responsibilities.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Responsibilities</h4>
              <ul className="list-disc list-inside space-y-1">
                {job.responsibilities.map((resp, idx) => (
                  <li key={idx} className="text-xs text-gray-600">{resp}</li>
                ))}
              </ul>
            </div>
          )}

          {job.requirements && job.requirements.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Requirements</h4>
              <ul className="list-disc list-inside space-y-1">
                {job.requirements.map((req, idx) => (
                  <li key={idx} className="text-xs text-gray-600">{req}</li>
                ))}
              </ul>
            </div>
          )}

          {job.matched_field && (
            <p className="text-xs text-emerald-600 mb-3 flex items-center gap-1 bg-emerald-50 p-2 rounded-lg">
              <Check className="w-3 h-3" />
              Matched on: {job.matched_field} (Score: {Math.round((job.match_score || 0) * 100)}%)
            </p>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => onViewJob(job.id)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-md transition-all"
            >
              View full job
              <ExternalLink className="w-3 h-3" />
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-white transition-colors">
              <Bookmark className="w-3 h-3" />
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================
// LANDING PAGE COMPONENT
// =====================================================

export default function LandingPage({ onLogin }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<JobResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [recentJobs, setRecentJobs] = useState<JobResult[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [searchBreakdown, setSearchBreakdown] = useState<SearchResponse['breakdown'] | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [activePriorityFilter, setActivePriorityFilter] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // Auth gate for viewing the detailed analysis
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pendingJob, setPendingJob] = useState<{ id: string; title: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load recent jobs on page load
  useEffect(() => {
    const loadRecentJobs = async () => {
      try {
        const response = await fetch(`${SEARCH_API_URL}?limit=6`);
        const data = await response.json();
        if (data.success) {
          setRecentJobs(data.results);
        }
      } catch (error) {
        console.error('Error loading recent jobs:', error);
      } finally {
        setIsLoadingRecent(false);
      }
    };
    loadRecentJobs();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setShowResults(true);
    setActivePriorityFilter(null);
    setShowAllResults(false);
    setExpandedJobId(null);

    try {
      const response = await fetch(
        `${SEARCH_API_URL}?q=${encodeURIComponent(searchQuery)}&limit=50`
      );
      const data: SearchResponse = await response.json();

      if (data.success) {
        setSearchResults(data.results);
        setSearchBreakdown(data.breakdown || null);
        setProcessingTime(data.processing_time_ms || null);
      } else {
        setSearchResults([]);
        setSearchBreakdown(null);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    // Clear results when user starts typing new query
    if (showResults) {
      setShowResults(false);
    }
  };

  const handleJobClick = (jobId: string) => {
    const targetPath = `/jobs/${jobId}`;

    // Already logged in: go straight to the detailed analysis (SPA navigation
    // keeps the search results in place).
    if (isAuthenticated) {
      navigate(targetPath);
      return;
    }

    // Not logged in: remember exactly where the user wanted to go so we can
    // bring them back after login, then show a friendly prompt instead of
    // silently bouncing them to the login screen.
    sessionStorage.setItem('redirectAfterLogin', targetPath);
    const job = [...searchResults, ...recentJobs].find(j => j.id === jobId);
    setPendingJob({ id: jobId, title: job?.title || 'this job' });
    setShowLoginPrompt(true);
  };

  const handleGoToLogin = () => {
    setShowLoginPrompt(false);
    // redirectAfterLogin is already set; Login reads it and returns the user
    // straight to the detailed analysis page — no need to search again.
    onLogin();
  };

  const handlePopularSearch = (term: string) => {
    setSearchQuery(term);
    setTimeout(() => {
      handleSearch();
    }, 50);
  };

  const toggleJob = (id: string) => {
    setExpandedJobId(prev => (prev === id ? null : id));
  };

  // Group results by priority
  const getResultsByPriority = () => {
    const groups: Record<string, JobResult[]> = {
      "JOB TITLE": [],
      "QUALIFICATIONS": [],
      "RESPONSIBILITIES": [],
      "REQUIREMENTS": [],
      "SKILLS": []
    };
    searchResults.forEach(job => {
      const priority = job.match_priority || 'SKILLS';
      if (groups[priority]) {
        groups[priority].push(job);
      } else {
        groups['SKILLS'].push(job);
      }
    });
    return groups;
  };

  const resultsByPriority = getResultsByPriority();

  const getDisplayedResults = () => {
    if (activePriorityFilter) return resultsByPriority[activePriorityFilter] || [];
    if (showAllResults) return searchResults;
    return searchResults.slice(0, 5);
  };

  const displayedResults = getDisplayedResults();

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-200">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-extrabold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent tracking-tight">
                SimuHire Rwanda
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              {['Features', 'How It Works', 'For Companies', 'For Candidates'].map(label => (
                <a
                  key={label}
                  href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                  className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
                >
                  {label}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={onLogin}
                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={onLogin}
                className="px-5 py-2 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all"
              >
                Get Started
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3 shadow-lg">
            {['Features', 'How It Works', 'For Companies', 'For Candidates'].map(label => (
              <a key={label} href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                className="block text-sm font-medium text-gray-600 hover:text-blue-600 py-1">
                {label}
              </a>
            ))}
            <div className="pt-3 space-y-2 border-t border-gray-100">
              <button onClick={onLogin} className="w-full py-2.5 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50">Sign In</button>
              <button onClick={onLogin} className="w-full py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl">Get Started Free</button>
            </div>
          </div>
        )}
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-visible">
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-60" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-100 rounded-full blur-3xl opacity-50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-blue-50 to-purple-50 rounded-full blur-3xl opacity-40" />
          </div>

          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-sm font-semibold text-blue-700 mb-6">
              <Sparkles className="w-4 h-4" />
              AI + Blockchain Powered Recruitment
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
              Hire Smarter in<br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Rwanda's Digital Economy
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Virtual work simulations powered by AI behavioral analytics and blockchain verification find the perfect cultural and technical fit for your organisation.
            </p>

            {/* Search Container */}
            <div className="max-w-2xl mx-auto relative z-20" ref={dropdownRef}>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by title, degree, field of study, skills, or responsibilities..."
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  className="w-full pl-12 pr-32 py-4 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400 bg-white shadow-sm"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 text-sm"
                  >
                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </div>

              {/* Loading Indicator */}
              {isSearching && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 p-8">
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                    <p className="text-gray-500">Searching for jobs...</p>
                    <p className="text-xs text-gray-400 mt-2">Analyzing job titles, qualifications, requirements and skills</p>
                  </div>
                </div>
              )}

              {/* Search Results Dropdown */}
              {showResults && !isSearching && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 flex flex-col" style={{ maxHeight: '32rem' }}>
                  
                  {/* Header with results count */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                    <div>
                      <span className="font-semibold text-gray-900">
                        {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found
                      </span>
                      {processingTime && (
                        <span className="text-xs text-gray-400 ml-2">in {processingTime}ms</span>
                      )}
                    </div>
                    <button
                      onClick={() => setShowResults(false)}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  {/* Match Breakdown Bar */}
                  {searchBreakdown && (
                    <div className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100">
                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                        <span className="font-semibold text-gray-700">Match breakdown:</span>
                        <div className="flex gap-3 flex-wrap">
                          {searchBreakdown.title_matches > 0 && <span className="text-red-600">🎯 Title: {searchBreakdown.title_matches}</span>}
                          {searchBreakdown.qualification_matches > 0 && <span className="text-purple-600">📚 Qual: {searchBreakdown.qualification_matches}</span>}
                          {searchBreakdown.responsibility_matches > 0 && <span className="text-blue-600">📋 Resp: {searchBreakdown.responsibility_matches}</span>}
                          {searchBreakdown.requirement_matches > 0 && <span className="text-green-600">✅ Req: {searchBreakdown.requirement_matches}</span>}
                          {searchBreakdown.skill_matches > 0 && <span className="text-gray-600">💪 Skills: {searchBreakdown.skill_matches}</span>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Filter Tabs */}
                  {searchResults.length > 0 && (
                    <div className="flex-shrink-0 flex gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto">
                      <button
                        onClick={() => { setActivePriorityFilter(null); setExpandedJobId(null); }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${!activePriorityFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        All ({searchResults.length})
                      </button>
                      {Object.entries(resultsByPriority).map(([priority, jobs]) =>
                        jobs.length > 0 && (
                          <button
                            key={priority}
                            onClick={() => { setActivePriorityFilter(priority); setExpandedJobId(null); }}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap ${activePriorityFilter === priority ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                          >
                            <span>{PRIORITY_CONFIG[priority]?.icon}</span>
                            <span>{PRIORITY_CONFIG[priority]?.labelShort} ({jobs.length})</span>
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Results List */}
                  <div className="overflow-y-auto flex-1 px-3 py-2">
                    {searchResults.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {displayedResults.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            isExpanded={expandedJobId === job.id}
                            onToggle={() => toggleJob(job.id)}
                            onViewJob={handleJobClick}
                          />
                        ))}

                        {/* See All Button */}
                        {!showAllResults && !activePriorityFilter && searchResults.length > 5 && (
                          <button
                            onClick={() => setShowAllResults(true)}
                            className="w-full py-3 text-sm text-blue-600 hover:text-blue-700 font-medium border-t border-gray-100 mt-1"
                          >
                            See all {searchResults.length} results →
                          </button>
                        )}
                      </div>
                    ) : (
                      /* NO RESULTS FOUND */
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                          <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h4 className="text-md font-semibold text-gray-900 mb-2">No results found</h4>
                        <p className="text-sm text-gray-500 max-w-md">
                          We couldn't find any jobs matching "{searchQuery}".
                        </p>
                        <div className="flex flex-wrap justify-center gap-2 mt-4">
                          <span className="text-xs text-gray-400">Try:</span>
                          {['Software Engineer', 'Data Analyst', 'Product Manager', 'React Developer', 'Node.js'].map((term) => (
                            <button
                              key={term}
                              onClick={() => handlePopularSearch(term)}
                              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-blue-100 rounded-full text-gray-600 hover:text-blue-600 transition-colors"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Jobs - Only show when no search active */}
              {!showResults && !isSearching && !isLoadingRecent && recentJobs.length > 0 && (
                <div className="mt-4 text-left">
                  <p className="text-xs text-gray-400 mb-2">📌 Recent Jobs</p>
                  <div className="flex flex-wrap gap-2">
                    {recentJobs.slice(0, 5).map((job) => (
                      <button
                        key={job.id}
                        onClick={() => handleJobClick(job.id)}
                        className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-blue-100 rounded-full text-gray-600 hover:text-blue-600 transition-colors"
                      >
                        {job.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular Searches */}
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <span className="text-xs text-gray-400">Popular:</span>
                {['Software Engineer', 'Data Analyst', 'Product Manager', 'Bachelor Computer Science', 'Advanced Diploma IT', 'React Developer', 'Node.js', 'Python'].map((term) => (
                  <button
                    key={term}
                    onClick={() => handlePopularSearch(term)}
                    className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500 mt-8">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> 14-day free trial</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> Free for candidates</span>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Platform Features</p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  Revolutionising Recruitment<br />in Rwanda
                </h2>
                <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                  Combining cutting-edge AI with blockchain technology for transparent, predictive hiring assessments.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Brain, gradient: 'from-blue-500 to-blue-700', glow: 'shadow-blue-200',
                    title: 'AI Behavioral Analytics',
                    desc: 'NLP-powered communication analysis, punctuality tracking, and adaptability scoring tailored to Rwandan workplace norms.',
                    tags: ['NLP Analysis', 'Soft Skills', 'Adaptability'],
                  },
                  {
                    icon: Shield, gradient: 'from-purple-500 to-purple-700', glow: 'shadow-purple-200',
                    title: 'Blockchain Verification',
                    desc: 'Tamper-proof assessment records and verifiable credentials. 100% transparent and immutable hiring decisions.',
                    tags: ['Tamper-Proof', 'Immutable', 'Transparent'],
                  },
                  {
                    icon: Target, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-200',
                    title: 'Real Work Simulations',
                    desc: 'Interactive tasks that mirror actual job responsibilities. Assess real skills, not just resumes.',
                    tags: ['Real Tasks', 'Skill-Based', 'Job-Ready'],
                  },
                ].map(({ icon: Icon, gradient, glow, title, desc, tags }) => (
                  <div key={title} className="group relative bg-white rounded-3xl p-8 border border-gray-100 hover:border-blue-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                    <div className={`w-14 h-14 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center mb-6 shadow-lg ${glow} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
                    <p className="text-gray-500 leading-relaxed mb-5">{desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(tag => (
                        <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-24 bg-gradient-to-b from-gray-50 to-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <p className="text-sm font-bold text-purple-600 uppercase tracking-widest mb-3">Simple Process</p>
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">How SimuHire Works</h2>
                <p className="text-xl text-gray-500 max-w-xl mx-auto">
                  A simple, transparent process for better hiring outcomes.
                </p>
              </div>
              <div className="relative">
                <div className="hidden md:block absolute top-10 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-gradient-to-r from-blue-200 via-purple-200 to-blue-200" />
                <div className="grid md:grid-cols-4 gap-8">
                  {[
                    { step: '01', title: 'Post a Job', desc: 'Define role requirements and cultural parameters' },
                    { step: '02', title: 'Candidate Simulates', desc: 'Complete realistic work tasks in a virtual environment' },
                    { step: '03', title: 'AI Analysis', desc: 'Behavioral scoring and blockchain recording of results' },
                    { step: '04', title: 'Data-Driven Hire', desc: 'Make confident decisions with verified, immutable insights' },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="relative flex flex-col items-center text-center">
                      <div className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-700 flex items-center justify-center shadow-xl mb-5">
                        <span className="text-2xl font-extrabold text-white">{step}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* For Companies Section */}
        <section id="for-companies" className="py-24 bg-gray-900 overflow-hidden relative">
          <div className="absolute inset-0 -z-0">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-900/40 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-900/40 rounded-full blur-3xl" />
          </div>
          <div className="relative w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-2 gap-16 items-center">
                <div>
                  <p className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4">For Employers</p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-5 leading-tight tracking-tight">
                    Hire with Confidence,<br />Not Guesswork
                  </h2>
                  <p className="text-lg text-gray-400 mb-8 leading-relaxed">
                    Reduce hiring costs by 40% and improve retention with our AI-powered assessment platform built for Rwandan companies.
                  </p>
                  <ul className="space-y-4 mb-10">
                    {[
                      'Customisable cultural fit parameters for your organisation',
                      'Blockchain-verified candidate assessments',
                      'Analytics dashboard with predictive insights',
                      "Support for Rwanda's NICI III digital economy goals",
                    ].map(item => (
                      <li key={item} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-green-400" />
                        </div>
                        <span className="text-gray-300 text-sm leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onLogin}
                    className="group flex items-center gap-2 px-7 py-3.5 bg-white text-gray-900 font-bold rounded-2xl hover:shadow-xl hover:bg-blue-50 transition-all"
                  >
                    Schedule a Demo
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: '68%', label: 'Fewer Mis-hires', sub: 'Vs traditional CV screening', bg: 'from-blue-600 to-blue-800' },
                    { value: '40%', label: 'Time-to-Hire Saved', sub: 'Average across all sectors', bg: 'from-purple-600 to-purple-800' },
                    { value: '3×', label: 'Better Retention', sub: 'Year-1 employee retention', bg: 'from-indigo-600 to-indigo-800' },
                    { value: '15+', label: 'Companies Trust Us', sub: 'Across Rwanda', bg: 'from-violet-600 to-violet-800' },
                  ].map(({ value, label, sub, bg }) => (
                    <div key={label} className={`bg-gradient-to-br ${bg} rounded-2xl p-6 text-white`}>
                      <div className="text-4xl font-extrabold mb-1">{value}</div>
                      <div className="text-sm font-semibold mb-0.5">{label}</div>
                      <div className="text-xs text-white/60">{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* For Candidates Section */}
        <section id="for-candidates" className="py-24 bg-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="grid md:grid-cols-2 gap-16 items-center">
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-3xl p-8 border border-blue-100 shadow-xl shadow-blue-50">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Badge className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-gray-700">Featured Simulation</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                      <Star className="w-3 h-3" /> Popular
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-gray-900 mb-2">Software Developer</h3>
                  <p className="text-gray-500 mb-6">Complete real development tasks and showcase your skills to top employers.</p>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span>Duration: <strong>2 hours</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="w-4 h-4 text-purple-500" />
                      <span>Blockchain-verified certificate on completion</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-green-500" />
                      <span><strong>120+</strong> candidates completed this month</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {['JavaScript', 'React', 'Node.js', 'SQL'].map(tag => (
                      <span key={tag} className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">{tag}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-bold text-purple-600 uppercase tracking-widest mb-4">For Job Seekers</p>
                  <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-5 leading-tight tracking-tight">
                    Stand Out Beyond<br />Your Resume
                  </h2>
                  <p className="text-xl text-gray-500 mb-8 leading-relaxed">
                    Showcase your real abilities. Get verified credentials that top Rwandan employers trust.
                  </p>
                  <ul className="space-y-4 mb-10">
                    {[
                      'Demonstrate technical and soft skills in real scenarios',
                      'Blockchain-verified performance records',
                      'Stand out to top Rwandan tech companies',
                      'Free access to all simulations',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-green-100 border border-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-green-600" />
                        </div>
                        <span className="text-gray-600 text-sm leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={onLogin}
                    className="group flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-blue-200 hover:-translate-y-0.5 transition-all"
                  >
                    Create Free Candidate Account
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
          <div className="absolute inset-0 -z-0">
            <div className="absolute top-0 left-1/4 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-60 h-60 bg-white/5 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-4xl mx-auto text-center px-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 border border-white/20 rounded-full text-sm font-semibold text-white mb-6">
              <Zap className="w-4 h-4" /> Join 15+ companies already hiring smarter
            </div>
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-5 tracking-tight leading-tight">
              Ready to Transform<br />Your Hiring?
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
              Join the future of recruitment in Rwanda. Start your 14-day free trial today — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={onLogin}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-700 font-bold rounded-2xl text-lg hover:shadow-2xl hover:-translate-y-0.5 transition-all"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={onLogin}
                className="px-8 py-4 border-2 border-white/40 text-white font-bold rounded-2xl text-lg hover:bg-white/10 hover:border-white transition-all"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-4 gap-10 mb-12">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-extrabold text-white text-lg">SimuHire Rwanda</span>
                </div>
                <p className="text-sm leading-relaxed text-gray-500">
                  AI + Blockchain powered recruitment simulations for Rwanda's digital economy.
                </p>
              </div>
              {[
                { title: 'Product', links: ['Features', 'How It Works', 'Pricing', 'FAQ'], hrefs: ['#features', '#how-it-works', '#', '#'] },
                { title: 'Company', links: ['About Us', 'Blog', 'Careers', 'Contact'], hrefs: ['#', '#', '#', '#'] },
                { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'GDPR Compliance'], hrefs: ['#', '#', '#'] },
              ].map(({ title, links, hrefs }) => (
                <div key={title}>
                  <h4 className="text-white font-bold mb-5">{title}</h4>
                  <ul className="space-y-3">
                    {links.map((link, i) => (
                      <li key={link}>
                        <a href={hrefs[i]} className="text-sm text-gray-500 hover:text-white transition-colors">{link}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-600">
              <p>© 2026 SimuHire Rwanda. Supporting Rwanda's Vision 2050 and NICI III.</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-600 font-medium">All systems operational</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Login Required Prompt — shown when an unauthenticated user tries to
          view the detailed analysis ("View full job"). */}
      {showLoginPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowLoginPrompt(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLoginPrompt(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Lock className="h-7 w-7 text-blue-600" />
            </div>

            <h3 className="mb-2 text-center text-lg font-bold text-gray-900">
              Login required
            </h3>
            <p className="mb-6 text-center text-sm leading-relaxed text-gray-500">
              You are not logged in. Please log in first to view the detailed
              analysis{pendingJob ? <> of <span className="font-semibold text-gray-700">{pendingJob.title}</span></> : null} and save your search history.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleGoToLogin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-lg"
              >
                <LogIn className="h-4 w-4" />
                Login
              </button>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="w-full rounded-xl px-5 py-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100"
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}