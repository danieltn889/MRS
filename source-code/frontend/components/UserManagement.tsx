import React, { useState, useEffect } from 'react';
import {
  Users as UsersIcon, UserPlus, Search, Trash2, Building2, X, ArrowLeft,
  Mail, ShieldCheck, ChevronDown, Lock, CheckCircle,
} from 'lucide-react';
import {
  getAdminCompanies, getAdminCompanyUsers, createAdminCompanyUser, updateAdminUser, deleteAdminUser,
  AdminCompany, AdminCompanyUser,
} from '../services/adminAPI';

interface Alert { id: number; type: 'success'| 'error'; message: string; }

const TEAM_ROLES: Array<{ value: 'admin'| 'recruiter'| 'reviewer'| 'viewer'; label: string }> = [
  { value: 'admin', label: 'Company Admin'},
  { value: 'recruiter', label: 'Recruiter'},
  { value: 'reviewer', label: 'Reviewer'},
  { value: 'viewer', label: 'Viewer'},
];

const USER_STATUSES = ['active', 'suspended', 'locked'];

const UserManagement: React.FC<{ onBack?: () => void; initialCompany?: AdminCompany | null }> = ({ onBack, initialCompany }) => {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<AdminCompany | null>(initialCompany || null);
  const [showCompanyPicker, setShowCompanyPicker] = useState(!initialCompany);

  const [users, setUsers] = useState<AdminCompanyUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', title: '', teamRole: 'recruiter'as typeof TEAM_ROLES[number]['value'] });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const addAlert = (type: 'success'| 'error', message: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 6000);
  };

  useEffect(() => {
    getAdminCompanies({ limit: 100 }).then(res => setCompanies(res.data || [])).catch(() => {});
  }, []);

  const loadUsers = async (companyId: string) => {
    try {
      setLoadingUsers(true);
      const res = await getAdminCompanyUsers(companyId);
      setUsers(res.data || []);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (selectedCompany) loadUsers(selectedCompany.id);
  }, [selectedCompany?.id]);

  const pickCompany = (c: AdminCompany) => {
    setSelectedCompany(c);
    setShowCompanyPicker(false);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    if (!form.name.trim() || !form.email.trim()) { addAlert('error', 'Name and email are required'); return; }
    try {
      setSaving(true);
      await createAdminCompanyUser(selectedCompany.id, form);
      addAlert('success', `User created   login details emailed to ${form.email}`);
      setShowAddForm(false);
      setForm({ name: '', email: '', title: '', teamRole: 'recruiter'});
      loadUsers(selectedCompany.id);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (u: AdminCompanyUser, status: string) => {
    try {
      setBusyId(u.user_id);
      await updateAdminUser(u.user_id, { status });
      setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, status } : x));
      addAlert('success', `${u.name} is now ${status}`);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to update user');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: AdminCompanyUser) => {
    if (!window.confirm(`Remove ${u.name} (${u.login_email}) from ${selectedCompany?.name}?`)) return;
    try {
      setBusyId(u.user_id);
      await deleteAdminUser(u.user_id);
      setUsers(prev => prev.filter(x => x.user_id !== u.user_id));
      addAlert('success', 'User removed');
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to delete user');
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      active: { bg: '#f0fdf4', text: '#16a34a'},
      suspended: { bg: '#fef2f2', text: '#dc2626'},
      locked: { bg: '#fffbeb', text: '#d97706'},
      unverified: { bg: '#f1f5f9', text: '#475569'},
      verified: { bg: '#eff6ff', text: '#2563eb'},
    };
    const s = map[status] || map.unverified;
    return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text }}>{status}</span>;
  };

  const filteredCompanies = companies.filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="fixed top-4 right-4 z-50 w-96">
        {alerts.map(a => (
          <div key={a.id} className={`mb-2 p-3 rounded-lg shadow-lg text-sm font-medium ${a.type === 'success'? 'bg-green-50 text-green-800 border border-green-200': 'bg-red-50 text-red-800 border border-red-200'}`}>
            {a.message}
          </div>
        ))}
      </div>

      <div className="mb-6">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        )}
        <h1 className="text-3xl font-bold text-gray-900 mb-1">User Management</h1>
        <p className="text-gray-600">Select a company, then add, edit, or remove its users</p>
      </div>

      {/* Company selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <button onClick={() => setShowCompanyPicker(p => !p)} className="w-full flex items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-purple-500" />
            {selectedCompany ? (
              <span className="font-medium text-gray-900">{selectedCompany.name}</span>
            ) : (
              <span className="text-gray-500">Select a company...</span>
            )}
          </div>
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${showCompanyPicker ? 'rotate-180': ''}`} />
        </button>

        {showCompanyPicker && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search companies..." value={companySearch}
                onChange={e => setCompanySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
              {filteredCompanies.map(c => (
                <button
                  key={c.id} onClick={() => pickCompany(c)}
                  className="w-full text-left px-2 py-2.5 hover:bg-gray-50 rounded flex items-center justify-between"
                >
                  <span className="text-sm text-gray-900">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.team_count} users</span>
                </button>
              ))}
              {filteredCompanies.length === 0 && <p className="text-sm text-gray-400 py-3 text-center">No companies match.</p>}
            </div>
          </div>
        )}
      </div>

      {!selectedCompany ? (
        <div className="text-center py-16 text-gray-500">
          <UsersIcon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          Select a company above to manage its users.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Users at {selectedCompany.name}</h2>
            <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
              <UserPlus className="w-4 h-4" /> Add User
            </button>
          </div>

          {loadingUsers ? (
            <div className="text-center py-16 text-gray-500">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-white border border-gray-200 rounded-xl">
              No users yet for this company.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Login email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last login</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.user_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.name}</div>
                        <div className="text-xs text-gray-400">{u.title}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 flex items-center gap-1"><Mail size={12} /> {u.login_email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded">
                          <ShieldCheck size={12} /> {TEAM_ROLES.find(r => r.value === u.team_role)?.label || u.team_role}
                        </span>
                      </td>
                      <td className="px-4 py-3">{statusBadge(u.status)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.status !== 'active'&& (
                            <button onClick={() => changeStatus(u, 'active')} disabled={busyId === u.user_id} title="Activate"
                              className="p-1.5 rounded border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-50">
                              <CheckCircle size={14} />
                            </button>
                          )}
                          {u.status !== 'suspended'&& (
                            <button onClick={() => changeStatus(u, 'suspended')} disabled={busyId === u.user_id} title="Suspend"
                              className="p-1.5 rounded border border-amber-200 text-amber-600 hover:bg-amber-50 disabled:opacity-50">
                              <Lock size={14} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(u)} disabled={busyId === u.user_id} title="Remove"
                            className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showAddForm && selectedCompany && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Add User to {selectedCompany.name}</h2>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={submitAdd} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (used to log in) *</label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Senior Recruiter"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={form.teamRole} onChange={e => setForm(f => ({ ...f, teamRole: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {TEAM_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg p-3">
                A password will be generated automatically and emailed to this address along with a login link.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
                  {saving ? 'Creating...': 'Create & send login email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
