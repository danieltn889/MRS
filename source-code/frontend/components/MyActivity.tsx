import React, { useState, useEffect } from 'react';
import {
  Eye,
  Bookmark,
  CheckSquare,
  Search,
  Clock,
  Cpu,
  RefreshCw,
} from 'lucide-react';

interface ViewedItem { job_id: string; title: string; company_name: string; viewed_at: string; seconds_spent: number; }
interface SavedItem { job_id: string; title: string; company_name: string; saved_at: string; }
interface AppliedItem { job_id: string; title: string; company_name: string; applied_at: string; status: string; }
interface SearchedItem { query: string; searched_at: string; }
interface IncompleteItem { job_id: string; title: string; company_name: string; started_at: string; }

interface ActivityData {
  viewed: ViewedItem[];
  saved: SavedItem[];
  applied: AppliedItem[];
  searched: SearchedItem[];
  incomplete_applications: IncompleteItem[];
  counts: Record<string, number>;
}

interface BehaviorStats {
  views?: number;
  applications?: number;
  saves?: number;
  incomplete_applications?: number;
  search_events?: number;
  last_trained_at?: string | null;
}

type TabKey = 'viewed'| 'saved'| 'applied'| 'searched'| 'incomplete_applications';

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'viewed', label: 'Views', icon: Eye },
  { key: 'saved', label: 'Saved', icon: Bookmark },
  { key: 'applied', label: 'Applied', icon: CheckSquare },
  { key: 'searched', label: 'Searched', icon: Search },
  { key: 'incomplete_applications', label: 'Incomplete Applications', icon: Clock },
];

const STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  shortlisted: 'bg-purple-100 text-purple-700',
  interview: 'bg-indigo-100 text-indigo-700',
  assessment: 'bg-indigo-100 text-indigo-700',
  reference_check: 'bg-indigo-100 text-indigo-700',
  offer: 'bg-green-100 text-green-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-700',
  on_hold: 'bg-orange-100 text-orange-700',
};

interface MyActivityProps {
  onBack: () => void;
}

const MyActivity: React.FC<MyActivityProps> = ({ onBack }) => {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('viewed');
  const [behaviorStats, setBehaviorStats] = useState<BehaviorStats | null>(null);
  const [behaviorError, setBehaviorError] = useState(false);
  const [behaviorLoading, setBehaviorLoading] = useState(true);

  const API_BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001/api/v1';

  const fetchActivity = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) return;
      const response = await fetch(`${API_BASE_URL}/feed/activity`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) setActivity(data.data);
      }
    } catch (error) {
      console.error('Error fetching activity history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Confirms this data has actually reached the ML model, not just the database   goes
  // through the backend (GET /feed/ml-status -> hybrid_job_recommender.py's GET
  // /behavior/stats) rather than calling the ML gateway directly from the browser, since
  // that's a server-to-server call same as every other ML integration in this app.
  const fetchBehaviorStats = async () => {
    setBehaviorLoading(true);
    setBehaviorError(false);
    try {
      const token = localStorage.getItem('authToken');
      if (!token) { setBehaviorError(true); return; }
      const response = await fetch(`${API_BASE_URL}/feed/ml-status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setBehaviorStats(data.data);
      } else {
        setBehaviorError(true);
      }
    } catch (error) {
      console.error('Error fetching ML behavior stats:', error);
      setBehaviorError(true);
    } finally {
      setBehaviorLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    fetchBehaviorStats();
  }, []);

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - date.getTime());
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '': 's'} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '': 's'} ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '': 's'} ago`;
    return date.toLocaleDateString();
  };

  const goToJob = (jobId: string) => window.open(`/jobs/${jobId}`, '_blank');
  const resumeApplication = (jobId: string) => { window.location.href = `/jobs/${jobId}?apply=1`; };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your activity...</p>
        </div>
      </div>
    );
  }

  const counts = activity?.counts || {};

  const renderEmpty = (icon: any, message: string) => {
    const Icon = icon;
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <Icon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Nothing here yet</h3>
        <p className="text-gray-600">{message}</p>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!activity) return null;

    if (activeTab === 'viewed') {
      if (activity.viewed.length === 0) return renderEmpty(Eye, "Jobs you view will show up here.");
      return (
        <div className="space-y-3">
          {activity.viewed.map((item) => (
            <div key={item.job_id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Eye className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                  <p className="text-sm text-gray-500 truncate">{item.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                <span className="text-xs text-gray-500">{getTimeAgo(item.viewed_at)}</span>
                <button onClick={() => goToJob(item.job_id)} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'saved') {
      if (activity.saved.length === 0) return renderEmpty(Bookmark, "Jobs you bookmark will show up here.");
      return (
        <div className="space-y-3">
          {activity.saved.map((item) => (
            <div key={item.job_id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bookmark className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                  <p className="text-sm text-gray-500 truncate">{item.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                <span className="text-xs text-gray-500">Saved {getTimeAgo(item.saved_at)}</span>
                <button onClick={() => goToJob(item.job_id)} className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'applied') {
      if (activity.applied.length === 0) return renderEmpty(CheckSquare, "Jobs you apply to will show up here.");
      return (
        <div className="space-y-3">
          {activity.applied.map((item) => (
            <div key={item.job_id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckSquare className="w-5 h-5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                  <p className="text-sm text-gray-500 truncate">{item.company_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <span className={`px-2 py-1 text-xs rounded-full capitalize ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}>
                  {item.status.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-gray-500">{getTimeAgo(item.applied_at)}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'searched') {
      if (activity.searched.length === 0) return renderEmpty(Search, "Your search history will show up here.");
      return (
        <div className="space-y-3">
          {activity.searched.map((item, idx) => (
            <div key={`${item.query}-${item.searched_at}-${idx}`} className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Search className="w-5 h-5 text-purple-600" />
                </div>
                <p className="font-medium text-gray-900 truncate">"{item.query}"</p>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0 ml-4">{getTimeAgo(item.searched_at)}</span>
            </div>
          ))}
        </div>
      );
    }

    // incomplete_applications
    if (activity.incomplete_applications.length === 0) {
      return renderEmpty(Clock, "Jobs where you started an application but didn't submit will show up here.");
    }
    return (
      <div className="space-y-3">
        {activity.incomplete_applications.map((item) => (
          <div key={item.job_id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                <p className="text-sm text-gray-500 truncate">{item.company_name}</p>
                <p className="text-xs text-orange-600 mt-0.5">Started but not submitted</p>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0 ml-4">
              <span className="text-xs text-gray-500">{getTimeAgo(item.started_at)}</span>
              <button onClick={() => resumeApplication(item.job_id)} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
                Finish applying
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={onBack} className="text-gray-600 hover:text-gray-900">
                ← Back
              </button>
              <h1 className="text-2xl font-bold text-gray-900">My Activity</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ML model verification panel */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-gray-900">ML Recommendation Model</h2>
            </div>
            <button
              onClick={fetchBehaviorStats}
              className="p-1.5 text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${behaviorLoading ? 'animate-spin': ''}`} />
            </button>
          </div>
          {behaviorError ? (
            <p className="text-sm text-gray-500">ML service is unavailable right now   your interactions are still saved and will sync once it's back.</p>
          ) : behaviorLoading ? (
            <p className="text-sm text-gray-500">Checking what the model has ingested...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900">{behaviorStats?.views ?? 0}</p>
                <p className="text-xs text-gray-500">Views seen</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{behaviorStats?.saves ?? 0}</p>
                <p className="text-xs text-gray-500">Saves seen</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{behaviorStats?.applications ?? 0}</p>
                <p className="text-xs text-gray-500">Applications seen</p>
              </div>
              <div>
                <p className="text-lg font-bold text-orange-600">{behaviorStats?.incomplete_applications ?? 0}</p>
                <p className="text-xs text-gray-500">Incomplete apps seen</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{behaviorStats?.search_events ?? 0}</p>
                <p className="text-xs text-gray-500">Searches seen</p>
              </div>
            </div>
          )}
          {behaviorStats?.last_trained_at && (
            <p className="text-xs text-gray-400 mt-3">Model last trained {getTimeAgo(behaviorStats.last_trained_at)}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = counts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-blue-500': 'bg-gray-100 text-gray-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {renderTabContent()}
      </div>
    </div>
  );
};

export default MyActivity;
