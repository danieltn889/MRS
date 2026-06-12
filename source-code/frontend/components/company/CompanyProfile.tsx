import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, MapPin, Users, Heart, ArrowLeft, Briefcase,
  CheckCircle2, AlertCircle, Info, X, Clock
} from 'lucide-react';
import { getCompanyProfile } from '../../services/companyAPI';
import CompanyProfileForm from './CompanyProfileForm';
import CompanyLocations from './CompanyLocations';
import CompanyCulture from './CompanyCulture';
import CompanyTeam from './CompanyTeam';
import CompanyProjects from './CompanyProjects';

// ─── Toast types ─────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  details?: string;
  timestamp: Date;
}

export type NotifyFn = (type: ToastType, title: string, message: string, details?: string) => void;

// ─── CompanyProfileData ───────────────────────────────────────────────────────

interface CompanyProfileData {
  id: string;
  name: string;
  legalName?: string;
  industry?: string;
  size?: string;
  foundedYear?: number;
  website?: string;
  description?: string;
  shortDescription?: string;
  mission?: string;
  vision?: string;
  values?: string[];
  culture?: any;
  socialLinks?: any;
  logo_url?: string;
  banner_url?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Toast Component ──────────────────────────────────────────────────────────

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.type === 'error' ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [toast.id, toast.type, onDismiss]);

  const styles = {
    success: { bar: 'bg-green-500', bg: 'bg-white border-green-200', icon: <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />, title: 'text-green-800' },
    error:   { bar: 'bg-red-500',   bg: 'bg-white border-red-200',   icon: <AlertCircle   className="h-5 w-5 text-red-500   flex-shrink-0 mt-0.5" />, title: 'text-red-800'   },
    info:    { bar: 'bg-blue-500',  bg: 'bg-white border-blue-200',  icon: <Info           className="h-5 w-5 text-blue-500  flex-shrink-0 mt-0.5" />, title: 'text-blue-800'  },
  }[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={`relative w-80 rounded-xl shadow-lg border overflow-hidden ${styles.bg}`}
    >
      {/* coloured left bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${styles.bar}`} />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start gap-2.5">
          {styles.icon}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${styles.title}`}>{toast.title}</p>
            <p className="text-sm text-gray-600 mt-0.5 leading-snug">{toast.message}</p>
            {toast.details && (
              <p className="text-xs text-gray-400 mt-1 font-mono break-words">{toast.details}</p>
            )}
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
              <Clock className="h-3 w-3" />
              {toast.timestamp.toLocaleTimeString()}
            </div>
          </div>
          <button onClick={() => onDismiss(toast.id)} className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ─── CompanyProfile (main) ────────────────────────────────────────────────────

const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [companyData, setCompanyData] = useState<CompanyProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { loadCompanyProfile(); }, []);

  const loadCompanyProfile = async () => {
    try {
      setLoading(true);
      const response = await getCompanyProfile();
      setCompanyData(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load company profile');
    } finally {
      setLoading(false);
    }
  };

  // Global notify callback — passed down to every sub-component
  const notify = useCallback<NotifyFn>((type, title, message, details) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message, details, timestamp: new Date() }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const tabs = [
    { id: 'profile',   label: 'Company Profile', icon: Building2, description: 'Basic information & branding' },
    { id: 'locations', label: 'Locations',        icon: MapPin,    description: 'Office locations & addresses' },
    { id: 'culture',   label: 'Culture & Values', icon: Heart,     description: 'Company culture & values'    },
    { id: 'team',      label: 'Team Members',     icon: Users,     description: 'Team & leadership'          },
    { id: 'projects',  label: 'Projects',         icon: Briefcase, description: 'Projects & achievements'    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':   return <CompanyProfileForm companyData={companyData} onUpdate={loadCompanyProfile} onNotify={notify} />;
      case 'locations': return <CompanyLocations onNotify={notify} />;
      case 'culture':   return <CompanyCulture onNotify={notify} />;
      case 'team':      return <CompanyTeam onNotify={notify} />;
      case 'projects':  return <CompanyProjects onNotify={notify} />;
      default:          return <CompanyProfileForm companyData={companyData} onUpdate={loadCompanyProfile} onNotify={notify} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative h-14 w-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
          </div>
          <p className="text-gray-600 font-medium">Loading company profile…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md bg-white rounded-2xl shadow-sm border p-8">
          <div className="h-14 w-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Failed to load profile</h2>
          <p className="text-sm text-gray-500 mb-5">{error}</p>
          <button onClick={loadCompanyProfile}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ────────────────────────────────── */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              {companyData?.logo_url ? (
                <img src={companyData.logo_url} alt="logo" className="h-9 w-9 rounded-lg object-cover border" />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-base font-semibold text-gray-900 leading-tight">
                  {companyData?.name || 'Company Profile'}
                </h1>
                <p className="text-xs text-gray-400">Profile Management</p>
              </div>
            </div>
            <button onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border p-5 sticky top-24">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                Profile Management
              </p>
              <nav className="space-y-1">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${
                        active
                          ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                        active ? 'bg-blue-600' : 'bg-gray-100'
                      }`}>
                        <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-gray-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                          {tab.label}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{tab.description}</p>
                      </div>
                      {active && <div className="w-1.5 h-6 rounded-full bg-blue-600 flex-shrink-0" />}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-xl shadow-sm border overflow-hidden"
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── Global toast stack ───────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastItem toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CompanyProfile;
