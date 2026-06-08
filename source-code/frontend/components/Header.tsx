import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Settings, LogOut, User, Menu, X, UserPlus, Building, ChevronDown, Briefcase, MessageCircle } from 'lucide-react';
import { io } from 'socket.io-client';
import ThemeSwitcher from './ThemeSwitcher';
import { SOCKET_BASE_URL } from '../services/simulationAPI';

// Add proper type definitions
interface ChatNotification {
  id: string;
  title: string;
  body: string;
  sessionId?: string;
  simulationId?: string;
  createdAt: string;
  read: boolean;
}

interface ChatMessage {
  id: string;
  session_id?: string;
  simulation_id?: string;
  user_id?: string;
  author?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  user_email?: string;
  message: string;
  timestamp?: string;
  created_at?: string;
}

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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [chatNotifications, setChatNotifications] = useState<ChatNotification[]>([]);
  const [chatToast, setChatToast] = useState<ChatNotification | null>(null);
  const [showSignupDropdown, setShowSignupDropdown] = useState<boolean>(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const lastSoundAtRef = useRef<number>(0);
  const chatNotificationIdsRef = useRef<Set<string>>(new Set());

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
      // Try 'company' key
      let storedCompany = localStorage.getItem('company');
      if (storedCompany) {
        try {
          const parsed = JSON.parse(storedCompany);
          if (parsed && (parsed.name || parsed.company_name)) {
            return parsed;
          }
        } catch {}
      }
      
      // Try 'companyData' key
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
    return userType === 'company_admin' || userType === 'recruiter';
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
  const unreadChatCount = chatNotifications.filter((n: ChatNotification) => !n.read).length;
  const chatNotificationStorageKey = normalizedUser?.id
    ? `simulationChatNotifications:${normalizedUser.id}`
    : null;

  const playIncomingSound = (): void => {
    const now = Date.now();
    if (now - lastSoundAtRef.current < 900) return;
    lastSoundAtRef.current = now;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(740, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(980, audioContext.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
      window.setTimeout(() => audioContext.close().catch(() => undefined), 300);
    } catch {
      // Browser may block notification audio before the first user interaction.
    }
  };

  const parseChatText = (message: string): string => {
    if (!message) return 'New chat message';
    try {
      let current: any = message;
      let depth = 0;
      while (typeof current === 'string' && depth < 10) {
        const trimmed = current.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('"')) return current;
        current = JSON.parse(current);
        depth += 1;
      }
      return current?.text || 'New chat message';
    } catch {
      return String(message).slice(0, 140);
    }
  };

  const getMessageAuthor = (message: ChatMessage): string => {
    const fullName = `${message?.author?.first_name || ''} ${message?.author?.last_name || ''}`.trim();
    return fullName || message?.author?.email?.split('@')[0] || message?.user_email?.split('@')[0] || 'Chat';
  };

  const buildChatNotification = (message: ChatMessage, fallback: Partial<ChatNotification> = {}): ChatNotification => ({
    id: message.id,
    title: fallback.title || `Message from ${getMessageAuthor(message)}`,
    body: fallback.body || parseChatText(message.message),
    sessionId: message.session_id,
    simulationId: message.simulation_id,
    createdAt: message.timestamp || message.created_at || new Date().toISOString(),
    read: false,
  });

  const addChatNotification = (notification: ChatNotification, shouldPlaySound: boolean = true): void => {
    if (chatNotificationIdsRef.current.has(notification.id)) return;
    chatNotificationIdsRef.current.add(notification.id);
    setChatNotifications((prev: ChatNotification[]) => [notification, ...prev].slice(0, 20));

    if (shouldPlaySound) playIncomingSound();
    setChatToast(notification);
    window.setTimeout(() => {
      setChatToast((current: ChatNotification | null) => current?.id === notification.id ? null : current);
    }, 5000);
  };

  useEffect(() => {
    chatNotificationIdsRef.current = new Set(chatNotifications.map((item: ChatNotification) => item.id));
  }, [chatNotifications]);

  // 🔍 DEBUG: Log all data to console
  useEffect(() => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 HEADER DEBUG - COMPANY DATA');
    console.log('═══════════════════════════════════════');
    console.log('📌 user prop:', user);
    console.log('📌 company prop:', company);
    console.log('📌 normalizedUser:', normalizedUser);
    console.log('📌 normalizedCompany:', normalizedCompany);
    console.log('───────────────────────────────────────');
    console.log('👤 User Info:');
    console.log('   - userName:', userName);
    console.log('   - userType:', userType);
    console.log('   - isCompanyUser:', isCompanyUser());
    console.log('   - companyId:', normalizedUser?.company_id || normalizedUser?.companyId);
    console.log('───────────────────────────────────────');
    console.log('🏢 Company Info:');
    console.log('   - companyName:', companyName);
    console.log('   - companyInitial:', companyInitial);
    console.log('   - showCompanyInfo:', showCompanyInfo);
    console.log('═══════════════════════════════════════');
    
    // Also check localStorage
    console.log('💾 localStorage keys and values:');
    console.log('   - user:', localStorage.getItem('user'));
    console.log('   - company:', localStorage.getItem('company'));
    console.log('   - companyData:', localStorage.getItem('companyData'));
  }, [user, company, normalizedUser, normalizedCompany, userName, userType, companyName, showCompanyInfo]);

  useEffect(() => {
    if (!isLoggedIn || !normalizedUser?.id) return;

    const socket = io(SOCKET_BASE_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      socket.emit('join_user', normalizedUser.id);
    });

    socket.on('simulation_chat_message', (message: ChatMessage) => {
      const senderId = message?.user_id || message?.author?.id;
      if (!message?.id || senderId === normalizedUser.id) return;

      const isOnChatRoute =
        window.location.pathname.startsWith('/simulation/execute/') &&
        new URLSearchParams(window.location.search).get('tab') === 'chat' &&
        (!message.session_id || window.location.pathname.includes(message.session_id));

      if (isOnChatRoute) return;

      addChatNotification(buildChatNotification(message), true);
    });

    return () => {
      if (socket.connected) socket.emit('leave_user', normalizedUser.id);
      socket.disconnect();
    };
  }, [isLoggedIn, normalizedUser?.id]);

  useEffect(() => {
    if (!chatNotificationStorageKey) {
      setChatNotifications([]);
      return;
    }

    try {
      const stored = JSON.parse(localStorage.getItem(chatNotificationStorageKey) || '[]');
      setChatNotifications(Array.isArray(stored) ? stored.slice(0, 20) : []);
    } catch {
      setChatNotifications([]);
    }
  }, [chatNotificationStorageKey]);

  useEffect(() => {
    if (!chatNotificationStorageKey) return;
    localStorage.setItem(chatNotificationStorageKey, JSON.stringify(chatNotifications.slice(0, 20)));
  }, [chatNotificationStorageKey, chatNotifications]);

  useEffect(() => {
    const handleChatNotification = (event: CustomEvent<{ message: ChatMessage; title?: string; body?: string }>) => {
      const message = event.detail?.message;
      if (!message?.id) return;
      const senderId = message?.user_id || message?.author?.id;
      if (senderId === normalizedUser?.id) return;
      addChatNotification(buildChatNotification(message, {
        title: event.detail?.title,
        body: event.detail?.body,
      }), false);
    };

    window.addEventListener('simulation-chat-message', handleChatNotification as EventListener);
    return () => window.removeEventListener('simulation-chat-message', handleChatNotification as EventListener);
  }, [normalizedUser?.id]);

  const openChatNotification = (notification: ChatNotification): void => {
    setChatNotifications((prev: ChatNotification[]) =>
      prev.map((item: ChatNotification) => item.id === notification.id ? { ...item, read: true } : item)
    );
    setShowNotifications(false);
    setChatToast(null);

    if (notification.sessionId) {
      window.location.href = `/simulation/execute/${notification.sessionId}?tab=chat`;
    } else if (onViewChange) {
      onViewChange('my-simulations');
    }
  };

  const handleCompanySignup = (): void => {
    window.location.href = '/company-signup';
    setShowSignupDropdown(false);
  };

  const handleCandidateSignup = (): void => {
    window.location.href = '/signup';
    setShowSignupDropdown(false);
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (onViewChange) onViewChange('job-search');
      localStorage.setItem('searchQuery', searchQuery.trim());
    }
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
        <div className="flex-1 mx-0 sm:mx-4 order-3 sm:order-2 w-full sm:w-auto min-w-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 flex-shrink-0" size={18} />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleSearch}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 text-sm"
            />
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
                    <ChevronDown size={16} className={`transition-transform duration-200 ${showSignupDropdown ? 'rotate-180' : ''}`} />
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
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] leading-[18px] text-white text-center font-bold">
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
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
                    <div className="w-8 sm:w-10 h-8 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 shadow-md">
                      {userInitial}
                    </div>
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
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md">
                            {userInitial}
                          </div>
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
                {unreadChatCount > 0 && (
                  <button
                    onClick={() => {
                      setChatNotifications((prev: ChatNotification[]) => prev.map((item: ChatNotification) => ({ ...item, read: true })));
                      setChatToast(null);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {chatNotifications.length > 0 ? (
                chatNotifications.map((notification: ChatNotification) => (
                  <button
                    key={notification.id}
                    onClick={() => openChatNotification(notification)}
                    className={`w-full text-left p-4 hover:bg-blue-50 border-b border-gray-100 cursor-pointer transition-colors ${notification.read ? 'bg-white' : 'bg-blue-50/60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                        <MessageCircle size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">{notification.title}</p>
                          {!notification.read && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{notification.body}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-gray-500">
                  No new notifications
                </div>
              )}
            </div>
          </div>
        )}

        {chatToast && isLoggedIn && !showNotifications && (
          <button
            onClick={() => openChatNotification(chatToast)}
            className="absolute right-4 sm:right-6 top-16 sm:top-20 w-80 bg-white rounded-lg shadow-xl border border-blue-100 z-50 text-left p-4 hover:bg-blue-50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                <MessageCircle size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{chatToast.title}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-words">{chatToast.body}</p>
                <p className="text-[11px] text-blue-600 mt-2 font-medium">Open chat to reply</p>
              </div>
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  setChatToast(null);
                }}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={14} />
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default Header;