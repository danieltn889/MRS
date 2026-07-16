import React from 'react';
import {
  BarChart3,
  Zap,
  FileText,
  CheckSquare,
  TrendingUp,
  User,
  Shield,
  LogOut,
  X,
  Users,
  Briefcase,
  Building,
  Search,
  Bookmark,
  FileText as OfferIcon,
  UserCheck,
  Activity,
  Settings,
  Play,
  List,
  Sparkles
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
  userType?: string;
  onLogout: () => void;
}

const Sidebar = ({ isOpen, onClose, activeView, onViewChange, userType, onLogout }: SidebarProps) => {
  const { theme, currentTheme } = useTheme();
  const activeBg = ({
    blue: 'bg-blue-600',
    purple: 'bg-purple-600',
    indigo: 'bg-indigo-600',
    slate: 'bg-slate-600',
    green: 'bg-green-600',
  } as Record<string, string>)[currentTheme] || 'bg-blue-600';

  // Navigation items based on user type
  const getNavItems = () => {
    const normalizedUserType = userType?.toLowerCase();
    switch (normalizedUserType) {
      case 'system_admin':
        return [
          { id: 'dashboard', label: 'System Dashboard', icon: Building },
          { id: 'companies', label: 'Company Management', icon: Building },
          { id: 'users', label: 'User Management', icon: Users },
          { id: 'platform', label: 'Platform Settings', icon: Settings },
          { id: 'analytics', label: 'System Analytics', icon: BarChart3 },
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'security', label: 'Security Settings', icon: Shield }
        ];
      case 'company_admin':
        return [
          { id: 'dashboard', label: 'Company Dashboard', icon: Building },
          { id: 'company-profile', label: 'Company Profile', icon: Building },
          { id: 'jobs', label: 'Job Management', icon: Briefcase },
          { id: 'candidates', label: 'Candidate Search', icon: Search },
          { id: 'onboarding', label: 'Candidate Onboarding', icon: UserCheck },
          { id: 'team', label: 'Team Management', icon: Users },
          { id: 'analytics', label: 'Company Analytics', icon: BarChart3 },
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'security', label: 'Security Settings', icon: Shield }
        ];
      case 'recruiter':
        return [
          { id: 'dashboard', label: 'Recruiter Dashboard', icon: BarChart3 },
          { id: 'jobs', label: 'My Jobs', icon: Briefcase },
          { id: 'candidates', label: 'Candidate Search', icon: Search },
          { id: 'applications', label: 'Application Review', icon: CheckSquare },
          { id: 'interviews', label: 'Interview Scheduling', icon: UserCheck },
          { id: 'analytics', label: 'Recruitment Analytics', icon: TrendingUp },
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'security', label: 'Security Settings', icon: Shield }
        ];
      default: // candidate
        return [
          { id: 'dashboard', label: 'Applicant Dashboard', icon: BarChart3 },
          { id: 'saved-jobs', label: 'Saved Jobs', icon: Bookmark },
          { id: 'applications', label: 'My Applications', icon: CheckSquare },
          { id: 'my-activity', label: 'My Activity', icon: Activity },
          { id: 'profile', label: 'My Profile', icon: User },
          { id: 'security', label: 'Security Settings', icon: Shield }
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <>
      {/* Mobile Sidebar */}
      <div
        className={`fixed md:hidden left-0 top-0 h-screen w-64 bg-gradient-to-b ${theme.primary} text-white flex flex-col shadow-lg transform transition-transform duration-300 ease-in-out z-40 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b ${theme.border} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center font-bold text-lg text-white">
              M
            </div>
            <div className="text-xl font-bold"> HRS</div>
          </div>
          <button onClick={onClose} className={`md:hidden p-1 rounded-lg transition-colors ${theme.hover}`}>
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  console.log('[Sidebar] Mobile nav clicked:', item.id);
                  onViewChange(item.id);
                  onClose();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs ${isActive
                    ? `${activeBg} text-white shadow-md`
                    : `${theme.text} ${theme.hover} hover:text-white`
                  }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="font-medium leading-tight text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={`px-3 py-2 border-t ${theme.border}`}>
          <button
            onClick={() => {
              console.log('[Sidebar] Mobile logout clicked');
              onLogout();
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg ${theme.text} ${theme.hover} hover:text-white transition-all duration-200 text-xs`}
          >
            <LogOut size={16} className="flex-shrink-0" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div
        className={`hidden md:flex md:w-65 h-screen bg-gradient-to-b ${theme.primary} text-white flex-col shadow-lg z-20 mr-1`}
      >
        <div className={`px-4 sm:px-6 py-3 sm:py-4 border-b ${theme.border} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center font-bold text-lg text-white">
              M
            </div>
            <div className="text-lg sm:text-xl font-bold"> HRS</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  console.log('[Sidebar] Desktop nav clicked:', item.id);
                  onViewChange(item.id);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 text-xs ${isActive
                    ? `${activeBg} text-white shadow-md`
                    : `${theme.text} ${theme.hover} hover:text-white`
                  }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="font-medium leading-tight text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={`px-3 py-2 border-t ${theme.border}`}>
          <button
            onClick={() => {
              console.log('[Sidebar] Desktop logout clicked');
              onLogout();
            }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg ${theme.text} ${theme.hover} hover:text-white transition-all duration-200 text-xs`}
          >
            <LogOut size={16} className="flex-shrink-0" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;