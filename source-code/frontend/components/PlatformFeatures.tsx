import React, { useState, useEffect } from 'react';
import {
  Bell,
  Shield,
  Mail,
  MessageSquare,
  Calendar,
  Users,
  BarChart3,
  Link,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  Save,
  RefreshCw,
  ExternalLink,
  Smartphone,
  Monitor,
  Cloud,
  Lock,
  Key,
  Webhook,
  Code,
  Image,
  Video
} from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: 'connected'| 'disconnected'| 'error';
  lastSync?: string;
  category: 'communication'| 'calendar'| 'storage'| 'analytics'| 'other';
}

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  email: boolean;
  push: boolean;
  inApp: boolean;
}

interface PlatformFeaturesProps {
  onBack: () => void;
}

const PlatformFeatures = ({ onBack }: PlatformFeaturesProps) => {
  const [activeTab, setActiveTab] = useState('integrations');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Simulate API calls - replace with actual APIs

      const mockIntegrations: Integration[] = [
        {
          id: '1',
          name: 'Gmail',
          description: 'Email integration for automated communications',
          icon: <Mail size={20} />,
          status: 'connected',
          lastSync: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          category: 'communication'
        },
        {
          id: '2',
          name: 'Google Calendar',
          description: 'Schedule interviews and meetings automatically',
          icon: <Calendar size={20} />,
          status: 'connected',
          lastSync: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          category: 'calendar'
        },
        {
          id: '3',
          name: 'Slack',
          description: 'Team collaboration and notifications',
          icon: <MessageSquare size={20} />,
          status: 'disconnected',
          category: 'communication'
        },
        {
          id: '4',
          name: 'Google Drive',
          description: 'Document storage and sharing',
          icon: <Cloud size={20} />,
          status: 'connected',
          lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          category: 'storage'
        },
        {
          id: '5',
          name: 'LinkedIn',
          description: 'Professional networking and candidate sourcing',
          icon: <Users size={20} />,
          status: 'error',
          category: 'other'
        },
        {
          id: '6',
          name: 'Zoom',
          description: 'Video conferencing for remote interviews',
          icon: <Video size={20} />,
          status: 'connected',
          lastSync: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          category: 'communication'
        },
        {
          id: '7',
          name: 'Google Analytics',
          description: 'Track platform usage and performance',
          icon: <BarChart3 size={20} />,
          status: 'connected',
          lastSync: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          category: 'analytics'
        },
        {
          id: '8',
          name: 'Dropbox',
          description: 'Alternative cloud storage solution',
          icon: <Cloud size={20} />,
          status: 'disconnected',
          category: 'storage'
        }
      ];

      const mockNotifications: NotificationSetting[] = [
        {
          id: '1',
          title: 'New Applications',
          description: 'When candidates apply to your jobs',
          email: true,
          push: true,
          inApp: true
        },
        {
          id: '2',
          title: 'Interview Reminders',
          description: 'Upcoming interview notifications',
          email: true,
          push: false,
          inApp: true
        },
        {
          id: '3',
          title: 'Offer Updates',
          description: 'When candidates respond to offers',
          email: true,
          push: true,
          inApp: true
        },
        {
          id: '4',
          title: 'System Alerts',
          description: 'Platform maintenance and updates',
          email: false,
          push: false,
          inApp: true
        },
        {
          id: '5',
          title: 'Team Activity',
          description: 'When team members take actions',
          email: false,
          push: false,
          inApp: true
        },
        {
          id: '6',
          title: 'Performance Reports',
          description: 'Weekly and monthly analytics reports',
          email: true,
          push: false,
          inApp: true
        }
      ];

      setIntegrations(mockIntegrations);
      setNotifications(mockNotifications);
    } catch (error) {
      console.error('Error loading platform features data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleIntegration = async (integrationId: string) => {
    try {
      setIntegrations(prev => prev.map(integration =>
        integration.id === integrationId
          ? {
              ...integration,
              status: integration.status === 'connected'? 'disconnected': 'connected',
              lastSync: integration.status === 'disconnected'? new Date().toISOString() : integration.lastSync
            }
          : integration
      ));

      console.log('Integration status updated');
    } catch (error) {
      console.error('Error updating integration:', error);
    }
  };

  const updateNotificationSetting = (settingId: string, type: 'email'| 'push'| 'inApp', value: boolean) => {
    setNotifications(prev => prev.map(setting =>
      setting.id === settingId
        ? { ...setting, [type]: value }
        : setting
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-100 text-green-800';
      case 'disconnected': return 'bg-gray-100 text-gray-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle size={14} />;
      case 'disconnected': return <X size={14} />;
      case 'error': return <AlertTriangle size={14} />;
      default: return <Info size={14} />;
    }
  };

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  const tabs = [
    { id: 'integrations', label: 'Integrations', icon: <Link size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
    { id: 'api', label: 'API & Webhooks', icon: <Code size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
    { id: 'branding', label: 'Branding', icon: <Image size={16} /> }
  ];

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
              <h1 className="text-2xl font-bold text-gray-900">Platform Features</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2">
                <Save size={16} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Integrations Tab */}
            {activeTab === 'integrations'&& (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Third-party Integrations</h3>
                  <p className="text-gray-600">
                    Connect your favorite tools to streamline your recruitment workflow
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {integrations.map((integration) => (
                    <div key={integration.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-white rounded-lg">
                            {integration.icon}
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{integration.name}</h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(integration.status)}`}>
                              {getStatusIcon(integration.status)}
                              <span className="ml-1 capitalize">{integration.status}</span>
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleIntegration(integration.id)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            integration.status === 'connected'? 'bg-blue-600': 'bg-gray-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              integration.status === 'connected'? 'translate-x-6': 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      <p className="text-sm text-gray-600 mb-3">{integration.description}</p>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Last sync: {formatLastSync(integration.lastSync)}</span>
                        <button className="text-blue-600 hover:text-blue-800">
                          <RefreshCw size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Integration Categories */}
                <div className="mt-8">
                  <h4 className="font-medium text-gray-900 mb-4">Integration Status by Category</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['communication', 'calendar', 'storage', 'analytics'].map((category) => {
                      const categoryIntegrations = integrations.filter(i => i.category === category);
                      const connectedCount = categoryIntegrations.filter(i => i.status === 'connected').length;

                      return (
                        <div key={category} className="bg-white rounded-lg p-4 border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-900 capitalize">{category}</span>
                            <span className="text-sm text-gray-500">
                              {connectedCount}/{categoryIntegrations.length}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${(connectedCount / categoryIntegrations.length) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications'&& (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Notification Preferences</h3>
                  <p className="text-gray-600">
                    Customize how and when you receive notifications
                  </p>
                </div>

                <div className="space-y-6">
                  {notifications.map((setting) => (
                    <div key={setting.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{setting.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{setting.description}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={setting.email}
                            onChange={(e) => updateNotificationSetting(setting.id, 'email', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex items-center">
                            <Mail size={14} className="mr-1" />
                            Email
                          </span>
                        </label>

                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={setting.push}
                            onChange={(e) => updateNotificationSetting(setting.id, 'push', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex items-center">
                            <Smartphone size={14} className="mr-1" />
                            Push
                          </span>
                        </label>

                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={setting.inApp}
                            onChange={(e) => updateNotificationSetting(setting.id, 'inApp', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex items-center">
                            <Monitor size={14} className="mr-1" />
                            In-App
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Info size={20} className="text-blue-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-blue-900">Notification Summary</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        You have {notifications.filter(n => n.email || n.push || n.inApp).length} active notification types configured.
                        Changes will take effect immediately.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API & Webhooks Tab */}
            {activeTab === 'api'&& (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">API Access & Webhooks</h3>
                  <p className="text-gray-600">
                    Integrate with external systems using our REST API and webhook notifications
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* API Keys */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                      <Key size={16} className="mr-2" />
                      API Keys
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Production API Key</p>
                          <p className="text-xs text-gray-500">sk_live_••••••••••••••••••••</p>
                        </div>
                        <button className="text-blue-600 hover:text-blue-800 text-sm">
                          Regenerate
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-white rounded">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Sandbox API Key</p>
                          <p className="text-xs text-gray-500">sk_test_••••••••••••••••••••</p>
                        </div>
                        <button className="text-blue-600 hover:text-blue-800 text-sm">
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Webhooks */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                      <Webhook size={16} className="mr-2" />
                      Webhook Endpoints
                    </h4>
                    <div className="space-y-3">
                      <div className="p-3 bg-white rounded">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-900">Application Events</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">https://api.example.com/webhooks/applications</p>
                      </div>
                      <div className="p-3 bg-white rounded">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-900">Interview Events</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Pending
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">Not configured</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* API Documentation */}
                <div className="mt-6 bg-white rounded-lg p-6 border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">API Documentation</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Complete API reference with examples and code samples
                      </p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2">
                      <ExternalLink size={16} />
                      <span>View Docs</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security'&& (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Security Settings</h3>
                  <p className="text-gray-600">
                    Configure security policies and access controls
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Two-Factor Authentication */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                      <Lock size={16} className="mr-2" />
                      Two-Factor Authentication
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Enable 2FA for all users</span>
                        <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6"></span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Require 2FA for admins</span>
                        <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600">
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6"></span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Session Management */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                      <Shield size={16} className="mr-2" />
                      Session Security
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">
                          Session timeout (minutes)
                        </label>
                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md">
                          <option>15 minutes</option>
                          <option>30 minutes</option>
                          <option>60 minutes</option>
                          <option>120 minutes</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">Force logout on suspicious activity</span>
                        <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200">
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1"></span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Audit Log */}
                <div className="mt-6 bg-white rounded-lg p-6 border">
                  <h4 className="font-medium text-gray-900 mb-4">Recent Security Events</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Failed login attempt</p>
                        <p className="text-xs text-gray-500">user@company.com • 192.168.1.1</p>
                      </div>
                      <span className="text-xs text-gray-500">2 hours ago</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Password changed</p>
                        <p className="text-xs text-gray-500">admin@company.com</p>
                      </div>
                      <span className="text-xs text-gray-500">1 day ago</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">New API key generated</p>
                        <p className="text-xs text-gray-500">system</p>
                      </div>
                      <span className="text-xs text-gray-500">3 days ago</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Branding Tab */}
            {activeTab === 'branding'&& (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Company Branding</h3>
                  <p className="text-gray-600">
                    Customize the look and feel of your recruitment platform
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Logo Upload */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4">Company Logo</h4>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                          <Image size={24} className="text-gray-400" />
                        </div>
                        <div>
                          <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                            Upload Logo
                          </button>
                          <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Color Scheme */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-4">Color Scheme</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Primary Color</label>
                        <input
                          type="color"
                          defaultValue="#3B82F6"
                          className="w-full h-10 rounded border border-gray-300"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Secondary Color</label>
                        <input
                          type="color"
                          defaultValue="#10B981"
                          className="w-full h-10 rounded border border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Templates */}
                <div className="mt-6 bg-white rounded-lg p-6 border">
                  <h4 className="font-medium text-gray-900 mb-4">Email Templates</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded">
                      <div>
                        <p className="font-medium text-gray-900">Application Received</p>
                        <p className="text-sm text-gray-600">Sent when candidate applies</p>
                      </div>
                      <button className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">
                        Edit Template
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded">
                      <div>
                        <p className="font-medium text-gray-900">Interview Scheduled</p>
                        <p className="text-sm text-gray-600">Interview confirmation email</p>
                      </div>
                      <button className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">
                        Edit Template
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded">
                      <div>
                        <p className="font-medium text-gray-900">Offer Extended</p>
                        <p className="text-sm text-gray-600">Job offer notification</p>
                      </div>
                      <button className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700">
                        Edit Template
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformFeatures;