import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Settings, LogOut, User, Menu, UserPlus, Building, ChevronDown, Briefcase, MessageCircle, Loader2, ExternalLink, Send } from 'lucide-react';
import { io } from 'socket.io-client';
import ThemeSwitcher from './ThemeSwitcher';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '../services/notificationAPI';
import { getCandidateProfile } from '../services/candidateAPI';
import { resolveFileUrl } from '../utils/fileUrl';
import { useFeedTracker } from '../hooks/useFeedTracker';

// Same search endpoint the landing page uses, so the navbar search behaves
// exactly like the public search (just without the auth gate, since the
// navbar is only shown to logged-in users).
const SEARCH_API_URL = import.meta.env.VITE_SEARCH_URL || 'http://localhost:8001/search';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/v1\/?$/, '');

interface HeaderProps {
  onToggleSidebar?: () => void;
  onSignUp?: () => void;
  onLogin?: () => void;
  user?: any;
  company?: any;
  onLogout?: () => void;
  currentView?: string;
  onViewChange?: (view: string) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  onToggleSidebar, 
  onSignUp, 
  onLogin, 
  user, 
  company, 
  onLogout, 
  currentView, 
  onViewChange 
}) => {
  const navigate = useNavigate();
  const { trackSearch } = useFeedTracker();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>([]);
  const [notifUnread, setNotifUnread] = useState<number>(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showSignupDropdown, setShowSignupDropdown] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  // ============================================
  // 🔧 FIXED: Better user and company data extraction
  // ============================================
  
  const getNormalizedUser = (): any => {
    // First try prop
    if (user) return user;
    
    // Then try localStorage
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          return JSON.parse(storedUser);
        } catch {
          return null;
        }
      }
    }
    return null;
  };

  // 🔧 FIXED: Get company data from multiple possible sources
  const getNormalizedCompany = (): any => {
    // First try company prop
    if (company) return company;
    
    // Then try localStorage with different possible keys
    if (typeof window !== 'undefined') {
      // Try 'company'key
      let storedCompany = localStorage.getItem('company');
      if (storedCompany) {
        try {
          const parsed = JSON.parse(storedCompany);
          if (parsed && (parsed.name || parsed.company_name)) {
            return parsed;
          }
        } catch {}
      }
      
      // Try 'companyData'key
      storedCompany = localStorage.getItem('companyData');
      if (storedCompany) {
        try {
          const parsed = JSON.parse(storedCompany);
          if (parsed && (parsed.name || parsed.company_name)) {
            return parsed;
          }
        } catch {}
      }
      
      // Try to get company from user object if it has company info
      if (user) {
        if (user.company || user.companyId) {
          return {
            id: user.companyId || user.company?.id,
            name: user.companyName || user.company?.name
          };
        }
      }
    }
    return null;
  };

  const normalizedUser = getNormalizedUser();
  const normalizedCompany = getNormalizedCompany();
  const isLoggedIn = !!normalizedUser;
  
  // 🔧 FIXED: Better company user detection
  const isCompanyUser = (): boolean => {
    const userType = normalizedUser?.user_type || normalizedUser?.userType || '';
    return userType === 'company_admin'|| userType === 'recruiter';
  };
  
  // Get user name
  const getUserName = (): string => {
    if (!normalizedUser) return 'Guest';
    return normalizedUser.firstName || 
           normalizedUser.name || 
           (normalizedUser.email ? normalizedUser.email.split('@')[0] : 'Guest');
  };
  
  // Get user type display
  const getUserTypeDisplay = (): string => {
    if (!normalizedUser) return '';
    const type = normalizedUser.user_type || normalizedUser.userType || '';
    if (type === 'candidate') return 'Applicant';
    if (type === 'recruiter') return 'Recruiter';
    if (type === 'company_admin') return 'Company Admin';
    if (type === 'system_admin') return 'System Admin';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };
  
  // 🔧 FIXED: Get company name from multiple possible fields
  const getCompanyName = (): string => {
    if (!normalizedCompany) {
      // If no company object, try to get from user's associated company
      if (normalizedUser?.companyName) return normalizedUser.companyName;
      if (normalizedUser?.company?.name) return normalizedUser.company.name;
      return '';
    }
    return normalizedCompany.name || normalizedCompany.company_name || '';
  };
  
  // 🔧 FIXED: Get company initial
  const getCompanyInitial = (): string => {
    const companyName = getCompanyName();
    if (!companyName) return 'C';
    return companyName.charAt(0).toUpperCase();
  };
  
  // Get user initial
  const getUserInitial = (): string => {
    const name = getUserName();
    return name.charAt(0).toUpperCase();
  };

  const userName = getUserName();
  const userType = getUserTypeDisplay();
  const userInitial = getUserInitial();
  const companyName = getCompanyName();
  const companyInitial = getCompanyInitial();
  const showCompanyInfo = isLoggedIn && isCompanyUser() && !!companyName;

  // 🔍 DEBUG: Log all data to console
  useEffect(() => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 HEADER DEBUG - COMPANY DATA');
    console.log('═══════════════════════════════════════');
    console.log('user prop:', user);
    console.log('company prop:', company);
    console.log('normalizedUser:', normalizedUser);
    console.log('normalizedCompany:', normalizedCompany);
    console.log('───────────────────────────────────────');
    console.log(' User Info:');
    console.log('  - userName:', userName);
    console.log('  - userType:', userType);
    console.log('  - isCompanyUser:', isCompanyUser());
    console.log('  - companyId:', normalizedUser?.company_id || normalizedUser?.companyId);
    console.log('───────────────────────────────────────');
    console.log('🏢 Company Info:');
    console.log('  - companyName:', companyName);
    console.log('  - companyInitial:', companyInitial);
    console.log('  - showCompanyInfo:', showCompanyInfo);
    console.log('═══════════════════════════════════════');
    
    // Also check localStorage
    console.log('💾 localStorage keys and values:');
    console.log('  - user:', localStorage.getItem('user'));
    console.log('  - company:', localStorage.getItem('company'));
    console.log('  - companyData:', localStorage.getItem('companyData'));
  }, [user, company, normalizedUser, normalizedCompany, userName, userType, companyName, showCompanyInfo]);

  useEffect(() => {
    if (!isLoggedIn || !normalizedUser?.id) return;

    const socket = io(SOCKET_BASE_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 10000,
      auth: {
        token: localStorage.getItem('authToken') || undefined,
        userId: normalizedUser.id,
      },
    });

    socket.on('connect', () => {
      socket.emit('join_user', normalizedUser.id);
    });

    // Persistent notifications pushed from the backend (application updates, etc.)
    socket.on('notification', (n: AppNotification) => {
      if (!n?.id) return;
      setAppNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
      setNotifUnread((c) => c + 1);
    });
    socket.on('notification_unread_count', (data: { count: number }) => {
      setNotifUnread(typeof data?.count === 'number'? data.count : 0);
    });

    return () => {
      if (socket.connected) socket.emit('leave_user', normalizedUser.id);
      socket.disconnect();
    };
  }, [isLoggedIn, normalizedUser?.id]);

  // Load persisted notifications + unread count when the user logs in.
  useEffect(() => {
    if (!isLoggedIn || !normalizedUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [list, count] = await Promise.all([getNotifications({ limit: 20 }), getUnreadCount()]);
        if (!cancelled) {
          setAppNotifications(list.notifications || []);
          setNotifUnread(count);
        }
      } catch {
        // Non-fatal   bell just stays empty if the request fails.
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn, normalizedUser?.id]);

  // Profile avatar: seed from localStorage, fetch from backend for candidates, and
  // update live when the profile photo changes elsewhere in the app.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      if (stored.profile_photo_url) setAvatarUrl(stored.profile_photo_url);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    const type = String(normalizedUser?.userType || normalizedUser?.user_type || '').toLowerCase();
    const isCandidate = type.includes('candidate') || type.includes('applicant');
    if (!isCandidate) return;
    let cancelled = false;
    getCandidateProfile()
      .then((res: any) => {
        const url = res?.data?.profile?.profile_photo_url;
        if (!cancelled && url) {
          setAvatarUrl(url);
          try {
            const stored = JSON.parse(localStorage.getItem('user') || '{}');
            stored.profile_photo_url = url;
            localStorage.setItem('user', JSON.stringify(stored));
          } catch { /* ignore */ }
        }
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [isLoggedIn, normalizedUser?.id]);

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ url: string | null }>).detail?.url ?? null;
      setAvatarUrl(url);
    };
    window.addEventListener('profile-photo-updated', handler as EventListener);
    return () => window.removeEventListener('profile-photo-updated', handler as EventListener);
  }, []);

  const openAppNotification = async (n: AppNotification): Promise<void> => {
    setShowNotifications(false);
    if (n.status !== 'read') {
      setAppNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, status: 'read'} : x)));
      setNotifUnread((c) => Math.max(0, c - 1));
      try { await markNotificationRead(n.id); } catch { /* ignore */ }
    }
    const url = n.data?.url;
    if (url) {
      window.location.href = url;
    } else if (onViewChange) {
      onViewChange('dashboard');
    }
  };

  const handleMarkAllNotificationsRead = async (): Promise<void> => {
    setAppNotifications((prev) => prev.map((x) => ({ ...x, status: 'read'})));
    setNotifUnread(0);
    try { await markAllNotificationsRead(); } catch { /* ignore */ }
  };

  // Group notifications into Today / Yesterday / Earlier for the panel.
  const groupNotificationsByDate = (items: AppNotification[]): Array<{ label: string; items: AppNotification[] }> => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const groups: Record<string, AppNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const n of items) {
      const t = new Date(n.created_at).getTime();
      if (t >= startOfToday) groups.Today.push(n);
      else if (t >= startOfYesterday) groups.Yesterday.push(n);
      else groups.Earlier.push(n);
    }
    return [
      { label: 'Today', items: groups.Today },
      { label: 'Yesterday', items: groups.Yesterday },
      { label: 'Earlier', items: groups.Earlier },
    ].filter((g) => g.items.length > 0);
  };

  const handleCompanySignup = (): void => {
    window.location.href = '/company-signup';
    setShowSignupDropdown(false);
  };

  const handleCandidateSignup = (): void => {
    window.location.href = '/signup';
    setShowSignupDropdown(false);
  };

  const runSearch = async (): Promise<void> => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setShowSearchResults(true);
    localStorage.setItem('searchQuery', q);
    trackSearch(q);

    try {
      const response = await fetch(`${SEARCH_API_URL}?q=${encodeURIComponent(q)}&limit=20`);
      const data = await response.json();
      setSearchResults(data?.success ? data.results : []);
    } catch (error) {
      console.error('Navbar search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      runSearch();
    }
  };

  // Logged-in users go straight to the detailed analysis   no auth gate needed.
  const handleViewJob = (jobId: string): void => {
    setShowSearchResults(false);
    navigate(`/jobs/${jobId}`);
  };

  // Same ?apply=1 pattern used by the Job Feed and Saved Jobs "Apply Now"
  // buttons   lands on the job details page with the real application modal
  // already open, instead of just viewing the job first.
  const handleApplyJob = (jobId: string): void => {
    setShowSearchResults(false);
    navigate(`/jobs/${jobId}?apply=1`);
  };

  const handleProfileClick = (): void => {
    setShowProfileDropdown(!showProfileDropdown);
  };

  const handleGoToProfile = (): void => {
    if (onViewChange) onViewChange('profile');
    setShowProfileDropdown(false);
  };

  const handleGoToCompanyDashboard = (): void => {
    if (onViewChange) onViewChange('company-dashboard');
    setShowProfileDropdown(false);
  };

  const handleLogout = (): void => {
    setShowProfileDropdown(false);
    if (onLogout) onLogout();
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSignupDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4 flex-wrap">
        {/* Left Section - Hamburger Menu */}
        <div className="flex-1 min-w-0 order-1 flex items-start gap-2 sm:gap-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200 flex-shrink-0 mt-1"
            aria-label="Toggle sidebar"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* Center Section - Search Bar */}
        <div className="flex-1 mx-0 sm:mx-4 order-3 sm:order-2 w-full sm:w-auto min-w-0" ref={searchBoxRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 flex-shrink-0" size={18} />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleSearch}
              onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 text-sm"
            />

            {/* Search Results Dropdown */}
            {showSearchResults && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-2xl z-50 max-h-96 overflow-y-auto">
                {isSearching ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                    <p className="text-xs text-gray-500">Searching jobs...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="py-1">
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                      {searchResults.length} {searchResults.length === 1 ? 'result': 'results'}
                    </div>
                    {searchResults.map((job) => (
                      <div
                        key={job.id}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                      >
                        <button
                          onClick={() => handleViewJob(job.id)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left"
                          title="View job details"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                            <p className="text-xs text-gray-400 truncate">{job.company || job.location?.[0] || ''}</p>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        </button>
                        <button
                          onClick={() => handleApplyJob(job.id)}
                          className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold"
                          title="Apply to this job"
                        >
                          <Send className="w-3 h-3" />
                          Apply
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-500">No jobs found for "{searchQuery}".</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 sm:gap-4 order-2 sm:order-3 flex-shrink-0">
          <ThemeSwitcher />

          {/* Not logged in */}
          {!isLoggedIn && (
            <>
              {onLogin && (
                <button
                  onClick={onLogin}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-all duration-200 font-semibold text-sm"
                >
                  <User size={18} />
                  Log In
                </button>
              )}

              {onSignUp && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowSignupDropdown(!showSignupDropdown)}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-semibold text-sm shadow-md hover:shadow-lg"
                  >
                    <UserPlus size={18} />
                    Sign Up
                    <ChevronDown size={16} className={`transition-transform duration-200 ${showSignupDropdown ? 'rotate-180': ''}`} />
                  </button>

                  {showSignupDropdown && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                      <div className="py-1">
                        <button
                          onClick={handleCandidateSignup}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                        >
                          <User size={18} className="text-blue-600" />
                          <div>
                            <div className="font-medium">Sign Up as Candidate</div>
                            <div className="text-sm text-gray-500">Find jobs and build your career</div>
                          </div>
                        </button>
                        <button
                          onClick={handleCompanySignup}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                        >
                          <Building size={18} className="text-green-600" />
                          <div>
                            <div className="font-medium">Sign Up as Company</div>
                            <div className="text-sm text-gray-500">Post jobs and find talent</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Logged in UI */}
          {isLoggedIn && (
            <>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200 hover:text-blue-600"
                aria-label="Notifications"
              >
                <Bell size={20} />
                {notifUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] leading-[18px] text-white text-center font-bold">
                    {notifUnread > 9 ? '9+': notifUnread}
                  </span>
                )}
              </button>

              <button 
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200 hover:text-blue-600 hidden sm:block"
                aria-label="Settings"
              >
                <Settings size={20} />
              </button>

              {/* Profile Avatar */}
              <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-gray-200">
                <div className="relative" ref={profileRef}>
                  <div
                    onClick={handleProfileClick}
                    className="flex items-center gap-2 sm:gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors duration-200"
                  >
                    {avatarUrl ? (
                      <img src={resolveFileUrl(avatarUrl)} alt="" className="w-8 sm:w-10 h-8 sm:h-10 rounded-full object-cover flex-shrink-0 shadow-md" />
                    ) : (
                      <div className="w-8 sm:w-10 h-8 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 shadow-md">
                        {userInitial}
                      </div>
                    )}
                    <div className="hidden sm:block">
                      <p className="text-sm font-semibold text-gray-800">{userName}</p>
                      <p className="text-xs text-gray-500">{userType}</p>
                    </div>
                  </div>

                  {/* Profile Dropdown */}
                  {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
                      {/* User Info Section */}
                      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-purple-50">
                        <div className="flex items-center gap-3">
                          {avatarUrl ? (
                            <img src={resolveFileUrl(avatarUrl)} alt="" className="w-12 h-12 rounded-full object-cover shadow-md" />
                          ) : (
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                              {userInitial}
                            </div>
                          )}
                          <div>
                            <p className="text-base font-semibold text-gray-800">{userName}</p>
                            <p className="text-sm text-gray-600">{userType}</p>
                            {normalizedUser?.email && (
                              <p className="text-xs text-gray-500 mt-0.5">{normalizedUser.email}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Company Info Section */}
                      {isLoggedIn && isCompanyUser() && (
                        <div className="p-4 border-b border-gray-100 bg-green-50">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                              {companyInitial}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                                <Briefcase size={14} className="text-green-600" />
                                {companyName || 'Company Name Not Found'}
                              </p>
                              <p className="text-xs text-gray-500">Company Account</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Menu Items */}
                      <div className="py-2">
                        <button
                          onClick={handleGoToProfile}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-200 group"
                        >
                          <User size={18} className="text-blue-600 group-hover:text-blue-700" />
                          <span className="font-medium">Go to Profile</span>
                        </button>
                        
                        {isCompanyUser() && (
                          <button
                            onClick={handleGoToCompanyDashboard}
                            className="flex items-center gap-3 w-full px-4 py-3 text-left text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors duration-200 group"
                          >
                            <Building size={18} className="text-green-600 group-hover:text-green-700" />
                            <span className="font-medium">Company Dashboard</span>
                          </button>
                        )}
                        
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors duration-200 group"
                        >
                          <LogOut size={18} className="text-red-600 group-hover:text-red-700" />
                          <span className="font-medium">Logout</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Notifications Dropdown */}
        {showNotifications && isLoggedIn && (
          <div className="absolute right-4 sm:right-6 top-16 sm:top-20 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 order-4">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">Notifications</h3>
                {notifUnread > 0 && (
                  <button
                    onClick={handleMarkAllNotificationsRead}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {appNotifications.length > 0 ? (
                groupNotificationsByDate(appNotifications).map((group) => (
                  <div key={group.label}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
                    {group.items.map((notification: AppNotification) => {
                      const isUnread = notification.status !== 'read';
                      return (
                        <button
                          key={notification.id}
                          onClick={() => openAppNotification(notification)}
                          className={`w-full text-left p-4 hover:bg-blue-50 border-b border-gray-100 cursor-pointer transition-colors ${isUnread ? 'bg-blue-50/60': 'bg-white'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                              <MessageCircle size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-800 truncate">{notification.title}</p>
                                {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                              </div>
                              {notification.content && (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{notification.content}</p>
                              )}
                              <p className="text-[11px] text-gray-400 mt-1">
                                {new Date(notification.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-gray-500">
                  No notifications yet
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Header;