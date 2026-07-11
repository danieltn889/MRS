import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  Trash2,
  Crown,
  Briefcase,
  Eye,
  Search,
  AlertCircle,
  X,
  RefreshCw,
  Info
} from 'lucide-react';
import {
  inviteTeamMembers,
  getTeamInvitations,
  getTeamMembers,
  resendTeamInvitation,
  revokeTeamInvitation,
  updateTeamMemberRole
} from '../services/authAPI';

interface TeamMember {
  id: string;
  name: string;
  title: string;
  email: string;
  role: 'admin'| 'recruiter'| 'reviewer'| 'viewer';
  permissions: any;
  joined_at: string;
  member_status: 'active'| 'pending';
  user_status?: string;
  last_login_at?: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: 'admin'| 'recruiter'| 'reviewer'| 'viewer';
  status: 'pending'| 'accepted'| 'expired'| 'revoked';
  expires_at: string;
  created_at: string;
  current_status: string;
  first_name?: string;
  last_name?: string;
  personal_message?: string;
}

interface Alert {
  id: number;
  type: 'success'| 'error'| 'warning'| 'info';
  message: string;
}

const TeamManagement: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'members'| 'invitations'>('members');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<'recruiter'| 'admin'| 'reviewer'| 'viewer'>('recruiter');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Search and filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Helper to add alert
  const addAlert = (type: 'success'| 'error'| 'warning'| 'info', message: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, type, message }]);
    // Auto remove after 5 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, 5000);
  };

  // Helper to remove alert
  const removeAlert = (id: number) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [membersData, invitationsData] = await Promise.all([
        getTeamMembers(),
        getTeamInvitations()
      ]);

      setMembers(membersData.data.members || []);
      setInvitations(invitationsData.data || []);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  // Real-time email validation
  const validateEmails = (emailsString: string) => {
    const emails = emailsString.split(',').map(e => e.trim()).filter(e => e);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      setEmailError(`Invalid email format: ${invalidEmails.join(', ')}`);
      return false;
    } else {
      setEmailError('');
      return true;
    }
  };

  const handleEmailChange = (value: string) => {
    setInviteEmails(value);
    if (value.trim()) {
      validateEmails(value);
    } else {
      setEmailError('');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    const emails = inviteEmails.split(',').map(email => email.trim()).filter(email => email);
    
    if (emails.length === 0) {
      addAlert('error', ' Please enter at least one email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      addAlert('error', ` Invalid email address(es): ${invalidEmails.join(', ')}`);
      return;
    }

    try {
      setInviting(true);

      const response = await inviteTeamMembers({
        emails,
        role: inviteRole,
        personalMessage: inviteMessage,
        firstName: inviteFirstName,
        lastName: inviteLastName
      });

      console.log('Response:', response);

      // Check response for errors
      if (response.data?.errors && response.data.errors.length > 0) {
        const errorMessages = response.data.errors.map((err: any) => `${err.email}: ${err.error}`).join('; ');
        addAlert('error', ` Failed to send: ${errorMessages}`);
      } else {
        const sentCount = response.data?.sent?.length || emails.length;
        addAlert('success', `''${sentCount} invitation${sentCount !== 1 ? 's': ''} sent successfully to: ${emails.join(', ')}`);
      }

      // Reset form and close modal
      setInviteEmails('');
      setInviteMessage('');
      setInviteFirstName('');
      setInviteLastName('');
      setEmailError('');
      setShowInviteForm(false);

      // Reload data
      await loadData();
    } catch (err: any) {
      console.error('Invite error:', err);
      addAlert('error', err.message || ' Failed to send invitations');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvitation = async (invitationId: string, email: string) => {
    try {
      await resendTeamInvitation(invitationId);
      addAlert('success', `''Invitation resent successfully to ${email}`);
      await loadData();
    } catch (err: any) {
      addAlert('error', err.message || ' Failed to resend invitation');
    }
  };

  const handleRevokeInvitation = async (invitationId: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke the invitation sent to ${email}?`)) return;

    try {
      await revokeTeamInvitation(invitationId);
      addAlert('success', `''Invitation to ${email} has been revoked`);
      await loadData();
    } catch (err: any) {
      addAlert('error', err.message || ' Failed to revoke invitation');
    }
  };

  const handleUpdateRole = async (memberId: string, memberName: string, newRole: string) => {
    try {
      await updateTeamMemberRole(memberId, newRole);
      addAlert('success', `''${memberName}'s role has been updated to ${newRole}`);
      await loadData();
    } catch (err: any) {
      addAlert('error', err.message || ' Failed to update role');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Crown className="w-4 h-4 text-yellow-500" />;
      case 'recruiter': return <Briefcase className="w-4 h-4 text-blue-500" />;
      case 'reviewer': return <Search className="w-4 h-4 text-green-500" />;
      case 'viewer': return <Eye className="w-4 h-4 text-gray-500" />;
      default: return <Users className="w-4 h-4 text-gray-400" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-yellow-100 text-yellow-800';
      case 'recruiter': return 'bg-blue-100 text-blue-800';
      case 'reviewer': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all'|| member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredInvitations = invitations.filter(invitation => {
    const matchesSearch = invitation.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all'|| invitation.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Alert Component
  const AlertMessage = ({ alert }: { alert: Alert }) => {
    const config = {
      success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: CheckCircle },
      error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: AlertCircle },
      warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: AlertCircle },
      info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: Info }
    };
    
    const { bg, border, text, icon: Icon } = config[alert.type];
    
    return (
      <div className={`mb-3 p-4 ${bg} border ${border} rounded-lg flex items-center justify-between shadow-sm`}>
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${text}`} />
          <p className={`${text} text-sm`}>{alert.message}</p>
        </div>
        <button onClick={() => removeAlert(alert.id)} className={`${text} hover:opacity-70`}>
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Management</h1>
        <p className="text-gray-600">Manage your company team members and invitations</p>
      </div>

      {/* Alerts Container - Always visible */}
      <div className="fixed top-4 right-4 z-50 w-96">
        {alerts.map(alert => (
          <AlertMessage key={alert.id} alert={alert} />
        ))}
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'members'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Team Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'invitations'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Invitations ({invitations.filter(i => i.status === 'pending').length})
          </button>
        </div>

        <button
          onClick={() => setShowInviteForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Invite Team Member
        </button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="recruiter">Recruiter</option>
          <option value="reviewer">Reviewer</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>

      {/* Content */}
      {activeTab === 'members'? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Team Members</h2>
            {filteredMembers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No team members found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">
                          {member.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{member.name}</h3>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        <p className="text-xs text-gray-500">{member.title}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(member.role)}`}>
                          {member.role}
                        </span>
                      </div>

                      <div className="text-right">
                        <p className="text-sm text-gray-600">
                          {member.member_status === 'active'? 'Active': 'Pending'}
                        </p>
                        {member.last_login_at && (
                          <p className="text-xs text-gray-500">
                            Last login: {new Date(member.last_login_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      <div className="relative">
                        <select
                          value={member.role}
                          onChange={(e) => handleUpdateRole(member.id, member.name, e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="admin">Admin</option>
                          <option value="recruiter">Recruiter</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending Invitations</h2>
            {filteredInvitations.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No invitations found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInvitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Mail className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{invitation.email}</h3>
                        {invitation.first_name && (
                          <p className="text-sm text-gray-600">
                            {invitation.first_name} {invitation.last_name}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          Invited {new Date(invitation.created_at).toLocaleDateString()}
                        </p>
                        {invitation.personal_message && (
                          <p className="text-xs text-gray-500 italic mt-1">"{invitation.personal_message}"</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(invitation.role)}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleColor(invitation.role)}`}>
                          {invitation.role}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {invitation.current_status === 'pending'&& (
                          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                        )}
                        {invitation.current_status === 'expired'&& (
                          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            <XCircle className="w-3 h-3" />
                            Expired
                          </span>
                        )}
                        {invitation.current_status === 'accepted'&& (
                          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" />
                            Accepted
                          </span>
                        )}
                      </div>

                      {invitation.status === 'pending'&& (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResendInvitation(invitation.id, invitation.email)}
                            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                          >
                            <Send className="w-3 h-3" />
                            Resend
                          </button>
                          <button
                            onClick={() => handleRevokeInvitation(invitation.id, invitation.email)}
                            className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Form Modal */}
      {showInviteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowInviteForm(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Invite Team Member</h2>
              <button onClick={() => setShowInviteForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Addresses <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={inviteEmails}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  placeholder="Enter email addresses, separated by commas"
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    emailError ? 'border-red-500 bg-red-50': 'border-gray-300'
                  }`}
                  required
                />
                {emailError && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {emailError}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas (e.g., user1@example.com, user2@example.com)</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={inviteFirstName}
                    onChange={(e) => setInviteFirstName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={inviteLastName}
                    onChange={(e) => setInviteLastName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role <span className="text-red-500">*</span>
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="recruiter">👥 Recruiter - Can post jobs and manage candidates</option>
                  <option value="admin">👑 Admin - Full access to company settings</option>
                  <option value="reviewer">🔍 Reviewer - Can assess candidates</option>
                  <option value="viewer">👁️ Viewer - Read-only access</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Personal Message (Optional)
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a personal message to the invitation..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowInviteForm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !!emailError}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {inviting ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    'Send Invitations'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamManagement;