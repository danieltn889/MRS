import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Menu, X, Brain, Shield, Target,
  Badge, Award, ChevronRight, Star,
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
    semantic_matches: number;
  };
  // Typo-corrected version of the query (see ml_search.py's display_corrected_query)  
  // only meaningfully different from search_term when a typo was actually fixed.
  corrected_query?: string;
}

interface LandingPageProps {
  onLogin: () => void;
  onCompanySignUp?: () => void;
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
    icon: "''",
    label: "Title Match (Highest)",
    labelShort: "Title",
    order: 1
  },
  "QUALIFICATIONS": {
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    icon: "",
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
    icon: "''",
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
  },
  "SEMANTIC (related)": {
    bgColor: "bg-indigo-50",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
    icon: "🧠",
    label: "Related Match (AI similarity, no exact keyword)",
    labelShort: "Related",
    order: 6
  }
};

const SEARCH_API_URL = import.meta.env.VITE_SEARCH_URL || 'http://localhost:8001/search';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

// =====================================================
// BACKEND JOB NORMALIZER
// =====================================================

function normalizeBackendJob(job: any): JobResult {
  const locs: string[] = Array.isArray(job.locations)
    ? (job.locations as any[])
      .map((l) => (typeof l === 'object' ? l.city || l.country || '' : String(l)))
      .filter(Boolean)
    : [];

  let salary: string | null = null;
  if (job.salary_min && job.salary_max) {
    const currency = job.salary_currency || 'RWF';
    salary = `${currency} ${Number(job.salary_min).toLocaleString()} – ${Number(job.salary_max).toLocaleString()}`;
  } else if (job.salary_min) {
    salary = `From ${job.salary_currency || 'RWF'} ${Number(job.salary_min).toLocaleString()}`;
  }

  return {
    id: job.id,
    title: job.title,
    company: job.company_name || 'Company',
    description: job.description,
    job_type: job.job_type || 'full-time',
    work_arrangement: job.work_arrangement || 'onsite',
    location: locs,
    salary,
    experience_level: job.experience_level,
    skills: Array.isArray(job.skills_required)
      ? job.skills_required.map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
      : [],
  };
}

// =====================================================
// JOB CARD COMPONENT
// =====================================================

interface JobCardProps {
  job: JobResult;
  isExpanded: boolean;
  onToggle: () => void;
  onViewJob: (id: string) => void;
  showMatchBadge?: boolean;
}

function JobCard({ job, isExpanded, onToggle, onViewJob, showMatchBadge = true }: JobCardProps) {
  const ps = PRIORITY_CONFIG[job.match_priority || 'SKILLS'] || PRIORITY_CONFIG['SKILLS'];

  return (
    <div
      className={`border rounded-xl bg-white transition-all duration-200 overflow-hidden ${isExpanded ? 'border-blue-300 shadow-lg' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
        }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-50 to-purple-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
          <Briefcase className="w-4 h-4 text-blue-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-900 truncate">{job.title}</span>
            {showMatchBadge && (
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${ps.bgColor} ${ps.textColor}`}>
                {ps.icon} {ps.labelShort}
              </span>
            )}
            {job.match_score != null && (
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
                {Math.round(job.match_score * 100)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            <span>{job.company}</span>
            {job.location?.[0] && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {job.location[0]}
              </span>
            )}
            <span className="capitalize">{(job.job_type || 'full-time').replace('-', '')}</span>
            <span className="capitalize">{job.work_arrangement || 'onsite'}</span>
            {job.experience_level && (
              <span className="capitalize">''{job.experience_level}</span>
            )}
            {job.salary && <span>{job.salary}</span>}
          </div>
        </div>

        <ChevronRight
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''
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

export default function LandingPage({ onLogin, onCompanySignUp }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<JobResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [recentJobs, setRecentJobs] = useState<JobResult[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [searchBreakdown, setSearchBreakdown] = useState<SearchResponse['breakdown'] | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [activePriorityFilter, setActivePriorityFilter] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // All-jobs browse section
  const [allJobs, setAllJobs] = useState<JobResult[]>([]);
  const [isLoadingAllJobs, setIsLoadingAllJobs] = useState(true);
  const [totalJobs, setTotalJobs] = useState(0);
  const [showAllBrowseJobs, setShowAllBrowseJobs] = useState(false);

  // Auth gate for viewing the detailed analysis
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pendingJob, setPendingJob] = useState<{ id: string; title: string } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Load recent jobs from search service (for quick-access pills)
  useEffect(() => {
    const loadRecentJobs = async () => {
      try {
        const response = await fetch(`${SEARCH_API_URL}?limit=6`);
        const data = await response.json();
        if (data.success) {
          setRecentJobs(data.results);
        }
      } catch {
        // silent   recent pills are optional
      } finally {
        setIsLoadingRecent(false);
      }
    };
    loadRecentJobs();
  }, []);

  // Load all active jobs from backend API for the Browse section
  useEffect(() => {
    const loadAllJobs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/jobs?limit=50&page=1`);
        const data = await res.json();
        if (data.success && data.data) {
          const raw: any[] = data.data.data || data.data.jobs || data.data || [];
          const jobs = Array.isArray(raw) ? raw.map(normalizeBackendJob) : [];
          setAllJobs(jobs);
          setTotalJobs(data.data.pagination?.total || jobs.length);
        }
      } catch {
        // silent
      } finally {
        setIsLoadingAllJobs(false);
      }
    };
    loadAllJobs();
  }, []);

  // =====================================================
  // SEARCH
  // =====================================================

  const handleSearch = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!q) return;

    setIsSearching(true);
    setShowResults(true);
    setActivePriorityFilter(null);
    setShowAllResults(false);
    setExpandedJobId(null);

    try {
      const response = await fetch(
        `${SEARCH_API_URL}?q=${encodeURIComponent(q)}&limit=50`
      );
      const data: SearchResponse = await response.json();

      if (data.success) {
        setSearchResults(data.results);
        setSearchBreakdown(data.breakdown || null);
        setProcessingTime(data.processing_time_ms || null);
        // Only show the "did you mean" hint when correction actually changed something
        const corrected = data.corrected_query;
        setCorrectedQuery(corrected && corrected.toLowerCase() !== q.toLowerCase() ? corrected : null);
      } else {
        setSearchResults([]);
        setSearchBreakdown(null);
        setCorrectedQuery(null);
      }
    } catch {
      // Fallback: use backend API search (expanded fields via our improved controller)
      try {
        const res = await fetch(
          `${API_BASE_URL}/jobs?search=${encodeURIComponent(q)}&limit=50`
        );
        const data = await res.json();
        const raw: any[] = data.data?.data || data.data?.jobs || data.data || [];
        const jobs = Array.isArray(raw) ? raw.map(normalizeBackendJob) : [];
        setSearchResults(jobs);
        setSearchBreakdown(null);
        setProcessingTime(null);
      } catch {
        setSearchResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Real-time debounced search: fires 300 ms after the user stops typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowAllBrowseJobs(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setShowResults(false);
      setSearchResults([]);
      setSearchBreakdown(null);
      setProcessingTime(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      handleSearch(value.trim());
    }, 300);
  };

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    setShowResults(false);
    setSearchResults([]);
    setSearchBreakdown(null);
    setProcessingTime(null);
    setShowAllBrowseJobs(false);
    searchInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      handleSearch();
    }
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const handleJobClick = (jobId: string) => {
    const targetPath = `/jobs/${jobId}`;
    if (isAuthenticated) {
      navigate(targetPath);
      return;
    }
    sessionStorage.setItem('redirectAfterLogin', targetPath);
    const job = [...searchResults, ...recentJobs, ...allJobs].find(j => j.id === jobId);
    setPendingJob({ id: jobId, title: job?.title || 'this job' });
    setShowLoginPrompt(true);
  };

  const handleGoToLogin = () => {
    setShowLoginPrompt(false);
    onLogin();
  };

  const handlePopularSearch = (term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery(term);
    handleSearch(term);
  };

  const toggleJob = (id: string) => {
    setExpandedJobId(prev => (prev === id ? null : id));
  };

  // Group search results by priority (for dropdown)
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

  // Browse section always shows every loaded job   the search dropdown handles filtered suggestions
  const browsedJobs = showAllBrowseJobs ? allJobs : allJobs.slice(0, 10);

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
            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 leading-tight mb-6 tracking-tight">
              Hire Smarter in<br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                MIFOTRA recruitment system
              </span>
            </h1>

            
            {/* Subheadline */}
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Empower smarter hiring decisions with  designed to connect organisations with skilled and qualified talent.
            </p>

            {/* ── Search Container ── */}
            <div className="max-w-2xl mx-auto relative z-20" ref={dropdownRef}>

              {/* Input wrapper   focus ring via CSS focus-within */}
              <div className="flex items-center bg-white border border-gray-200 rounded-2xl shadow-md transition-all duration-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                {/* Search icon */}
                <div className="pl-4 flex-shrink-0 pointer-events-none">
                  {isSearching
                    ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    : <Search className="w-5 h-5 text-gray-400" />
                  }
                </div>

                {/* Input */}
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by title, skills, company, location, or employment type…"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  aria-label="Search jobs"
                  aria-autocomplete="list"
                  aria-expanded={showResults}
                  aria-haspopup="listbox"
                  className="flex-1 py-4 px-3 outline-none text-gray-900 placeholder-gray-400 bg-transparent text-sm"
                />

                {/* Clear (X) button   only when there is text */}
                {searchQuery && (
                  <button
                    onClick={handleClear}
                    className="p-1.5 mr-1 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                    aria-label="Clear search"
                    tabIndex={0}
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                )}

                {/* Search button */}
                <button
                  onClick={() => {
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    handleSearch();
                  }}
                  disabled={isSearching}
                  className="m-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 text-sm flex-shrink-0"
                  aria-label="Submit search"
                >
                  Search
                </button>
              </div>

              {/* Loading Indicator */}
              {isSearching && (
                <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 p-8">
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                    <p className="text-gray-500">Searching for jobs…</p>
                    <p className="text-xs text-gray-400 mt-2">Scanning titles, qualifications, skills, and more</p>
                  </div>
                </div>
              )}

              {/* ── Search Results Dropdown ── */}
              {showResults && !isSearching && (
                <div
                  role="listbox"
                  aria-label="Search results"
                  className="absolute left-0 right-0 mt-2 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 flex flex-col"
                  style={{ maxHeight: '32rem' }}
                >
                  {/* Header */}
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
                      aria-label="Close results"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  {/* "Did you mean"   only shown when typo correction actually changed the query */}
                  {correctedQuery && (
                    <div className="flex-shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
                      Showing results for <button className="underline font-semibold" onClick={() => handleSearch(correctedQuery)}>{correctedQuery}</button> instead of "{searchQuery}"
                    </div>
                  )}

                  {/* Match Breakdown Bar */}
                  {searchBreakdown && (
                    <div className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100">
                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                        <span className="font-semibold text-gray-700">Match breakdown:</span>
                        <div className="flex gap-3 flex-wrap">
                          {searchBreakdown.title_matches > 0 && <span className="text-red-600">''Title: {searchBreakdown.title_matches}</span>}
                          {searchBreakdown.qualification_matches > 0 && <span className="text-purple-600"> Qual: {searchBreakdown.qualification_matches}</span>}
                          {searchBreakdown.responsibility_matches > 0 && <span className="text-blue-600">📋 Resp: {searchBreakdown.responsibility_matches}</span>}
                          {searchBreakdown.requirement_matches > 0 && <span className="text-green-600">''Req: {searchBreakdown.requirement_matches}</span>}
                          {searchBreakdown.skill_matches > 0 && <span className="text-gray-600">💪 Skills: {searchBreakdown.skill_matches}</span>}
                          {searchBreakdown.semantic_matches > 0 && <span className="text-indigo-600">🧠 Related: {searchBreakdown.semantic_matches}</span>}
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
                  <div className="overflow-y-auto flex-1 px-3 py-2" role="group">
                    {searchResults.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {displayedResults.map((job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            isExpanded={expandedJobId === job.id}
                            onToggle={() => toggleJob(job.id)}
                            onViewJob={handleJobClick}
                            showMatchBadge
                          />
                        ))}

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
                      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <Search className="w-7 h-7 text-gray-300" />
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1">No keyword matches</h4>
                        <p className="text-sm text-gray-500 mb-4 max-w-xs">
                          Try a job title, skill, or technology   or scroll down to browse every active job.
                        </p>
                        <button
                          onClick={() => {
                            setShowResults(false);
                            document.getElementById('browse-jobs')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="px-5 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-md transition-all mb-4"
                        >
                          Browse all jobs ↓
                        </button>
                        <div className="flex flex-wrap justify-center gap-2">
                          <span className="text-xs text-gray-400">Quick searches:</span>
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

              {/* Recent Jobs   shown only when search is idle */}
              {!showResults && !isSearching && !isLoadingRecent && recentJobs.length > 0 && (
                <div className="mt-4 text-left">
                  <p className="text-xs text-gray-400 mb-2">Recent Jobs</p>
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

            {/* Browse All Jobs CTA   always visible, outside the dropdown */}
            <div className="mt-6 flex justify-center">
              <button
                onClick={() =>
                  document.getElementById('browse-jobs')?.scrollIntoView({ behavior: 'smooth' })
                }
                className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-blue-200 text-blue-700 font-semibold rounded-2xl hover:bg-blue-50 hover:border-blue-400 transition-all shadow-sm text-sm"
              >
                <Briefcase className="w-4 h-4" />
                Browse all active jobs
                <ChevronRight className="w-4 h-4 rotate-90" />
              </button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500 mt-8">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> 14-day free trial</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-green-500" /> Free for candidates</span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            BROWSE ALL JOBS SECTION
            Shows all active jobs by default; instantly
            filters as the user types in the search box.
        ══════════════════════════════════════════════ */}
        <section id="browse-jobs" className="py-16 bg-gradient-to-b from-blue-50/40 to-white">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">

              {/* Section header */}
              <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                <div>
                  <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">
                    Latest Job Openings
                  </h2>
                  <p className="text-gray-500 mt-1 text-sm">
                    {isLoadingAllJobs
                      ? 'Loading positions…'
                      : `${totalJobs} active position${totalJobs !== 1 ? 's' : ''} available right now`}
                  </p>
                </div>
              </div>

              {/* Loading skeletons */}
              {isLoadingAllJobs && (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-200 rounded-lg flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                          <div className="h-3 bg-gray-100 rounded w-3/4" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Job list   always shows ALL active jobs regardless of search query */}
              {!isLoadingAllJobs && allJobs.length > 0 && (
                <>
                  <div className="flex flex-col gap-2">
                    {browsedJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        isExpanded={expandedJobId === job.id}
                        onToggle={() => toggleJob(job.id)}
                        onViewJob={handleJobClick}
                        showMatchBadge={false}
                      />
                    ))}
                  </div>

                  {!showAllBrowseJobs && allJobs.length > 10 && (
                    <button
                      onClick={() => setShowAllBrowseJobs(true)}
                      className="mt-6 w-full py-3 border-2 border-blue-200 text-blue-600 font-semibold rounded-xl hover:bg-blue-50 transition-colors text-sm"
                    >
                      Show all {allJobs.length} jobs ↓
                    </button>
                  )}
                </>
              )}

              {/* No jobs at all */}
              {!isLoadingAllJobs && allJobs.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-200" />
                  <p className="text-lg font-medium">No active job openings at the moment.</p>
                  <p className="text-sm mt-1">Check back soon   new positions are added regularly.</p>
                </div>
              )}

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
                  Combining an explainable rule-based matcher with a machine-learning recommender for transparent, accurate job matching.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                {[
                  {
                    icon: Target, gradient: 'from-blue-500 to-blue-700', glow: 'shadow-blue-200',
                    title: 'Explainable Rule-Based Matcher',
                    desc: 'Scores every candidate against a job on Skills, Qualifications, Experience, and Preferences   with a full, transparent breakdown of what matched and what didn\'t.',
                    tags: ['Skills', 'Qualifications', 'Experience'],
                  },
                  {
                    icon: Brain, gradient: 'from-purple-500 to-purple-700', glow: 'shadow-purple-200',
                    title: 'AI Hybrid Recommender',
                    desc: 'A 5-signal machine-learning engine that learns from candidate behavior, content similarity, and job freshness to surface the best-fit roles.',
                    tags: ['Behavior-Aware', 'ML-Driven', 'Personalised'],
                  },
                  {
                    icon: Shield, gradient: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-200',
                    title: 'One Transparent Match Score',
                    desc: 'Both engines blend into a single % match on every job card, so candidates and recruiters always know exactly why a match is strong or weak.',
                    tags: ['Transparent', 'Data-Driven', 'Fair'],
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
                    { step: '02', title: 'Candidates Apply', desc: 'Job seekers build a profile and apply to open roles' },
                    { step: '03', title: 'AI Match Scoring', desc: 'The hybrid engine scores and ranks every candidate transparently' },
                    { step: '04', title: 'Data-Driven Hire', desc: 'Make confident decisions with clear, explainable match insights' },
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
                      'Transparent, explainable match scoring for every candidate',
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
                      <span className="text-sm font-bold text-gray-700">Sample Match Score</span>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                      <Star className="w-3 h-3" /> 87% Match
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold text-gray-900 mb-2">Software Developer</h3>
                  <p className="text-gray-500 mb-6">See exactly why you match a job before you apply   not just a resume guess.</p>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Rule-Based Matcher</p>
                  <div className="space-y-3 mb-5">
                    {[
                      { label: 'Skills', value: 90 },
                      { label: 'Qualifications', value: 85 },
                      { label: 'Experience', value: 80 },
                      { label: 'Preferences', value: 92 },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{label}</span>
                          <span className="font-semibold">{value}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">AI Hybrid Recommender</p>
                  <div className="space-y-3 mb-6">
                    {[
                      { label: 'Content', value: 89 },
                      { label: 'Behavior', value: 84 },
                      { label: 'Collaborative', value: 78 },
                      { label: 'Freshness', value: 95 },
                      { label: 'Popularity', value: 70 },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>{label}</span>
                          <span className="font-semibold">{value}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500 to-purple-700 rounded-full" style={{ width: `${value}%` }} />
                        </div>
                      </div>
                    ))}
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
                      'Full transparency into every job match   skills, qualifications, experience',
                      'Personalised recommendations that learn from your activity',
                      'Stand out to top Rwandan tech companies',
                      'Free access to all practical assessments',
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
              Join the future of recruitment in Rwanda. Start your 14-day free trial today   no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => onCompanySignUp ? onCompanySignUp() : navigate('/company-signup')}
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
                  AI-powered recruitment matching for Rwanda's digital economy.
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

      {/* Login Required Prompt */}
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
