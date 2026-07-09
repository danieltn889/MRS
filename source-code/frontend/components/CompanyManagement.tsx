import React, { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, Edit, Trash2, Globe, Users as UsersIcon,
  Briefcase, CheckCircle, Clock, XCircle, X, AlertCircle, ArrowLeft,
} from 'lucide-react';
import {
  getAdminCompanies, createAdminCompany, updateAdminCompany, deleteAdminCompany,
  AdminCompany,
} from '../services/adminAPI';

interface Alert { id: number; type: 'success' | 'error'; message: string; }

const SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+'];

const emptyForm = {
  name: '', description: '', industry: '', city: '', country: '', website: '', size: '',
};

const CompanyManagement: React.FC<{ onBack?: () => void; onManageUsers?: (company: AdminCompany) => void }> = ({ onBack, onManageUsers }) => {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const addAlert = (type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 5000);
  };

  const loadCompanies = async (q = '') => {
    try {
      setLoading(true);
      const res = await getAdminCompanies({ q, limit: 100 });
      setCompanies(res.data || []);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCompanies(); }, []);

  useEffect(() => {
    const t = setTimeout(() => loadCompanies(searchTerm), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c: AdminCompany) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '', description: '', industry: c.industry || '',
      city: '', country: '', website: c.website || '', size: c.size || '',
    });
    setShowForm(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { addAlert('error', 'Company name is required'); return; }
    try {
      setSaving(true);
      if (editingId) {
        await updateAdminCompany(editingId, form);
        addAlert('success', 'Company updated');
      } else {
        await createAdminCompany(form);
        addAlert('success', 'Company created');
      }
      setShowForm(false);
      loadCompanies(searchTerm);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to save company');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this company? This cannot be undone from the UI.')) return;
    try {
      setDeletingId(id);
      await deleteAdminCompany(id);
      addAlert('success', 'Company deleted');
      setCompanies(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to delete company');
    } finally {
      setDeletingId(null);
    }
  };

  const setVerification = async (c: AdminCompany, status: 'verified' | 'rejected' | 'pending') => {
    try {
      await updateAdminCompany(c.id, { verificationStatus: status });
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, verification_status: status } : x));
      addAlert('success', `Company marked ${status}`);
    } catch (err: any) {
      addAlert('error', err.message || 'Failed to update verification status');
    }
  };

  const verificationBadge = (status: AdminCompany['verification_status']) => {
    const map: Record<string, { bg: string; text: string; icon: any }> = {
      verified: { bg: '#f0fdf4', text: '#16a34a', icon: CheckCircle },
      pending: { bg: '#fffbeb', text: '#d97706', icon: Clock },
      rejected: { bg: '#fef2f2', text: '#dc2626', icon: XCircle },
      expired: { bg: '#f1f5f9', text: '#475569', icon: Clock },
    };
    const s = map[status] || map.pending;
    const Icon = s.icon;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.text }}>
        <Icon size={12} /> {status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="fixed top-4 right-4 z-50 w-96">
        {alerts.map(a => (
          <div key={a.id} className={`mb-2 p-3 rounded-lg shadow-lg text-sm font-medium ${a.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {a.message}
          </div>
        ))}
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Company Management</h1>
          <p className="text-gray-600">Create, verify, and manage every company on the platform</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm h-fit">
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" placeholder="Search companies..." value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading companies...</div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          No companies found.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Industry</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Jobs</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <Building2 size={14} className="text-purple-500" /> {c.name}
                    </div>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noreferrer" className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                        <Globe size={10} /> {c.website}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.industry || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.owner_email || <span className="text-amber-600 flex items-center gap-1"><AlertCircle size={12} /> No admin yet</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1"><Briefcase size={12} /> {c.job_count}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1"><UsersIcon size={12} /> {c.team_count}</span>
                  </td>
                  <td className="px-4 py-3">{verificationBadge(c.verification_status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {onManageUsers && (
                        <button onClick={() => onManageUsers(c)} title="Manage users" className="p-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50">
                          <UsersIcon size={14} />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} title="Edit" className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100">
                        <Edit size={14} />
                      </button>
                      {c.verification_status !== 'verified' && (
                        <button onClick={() => setVerification(c, 'verified')} title="Verify" className="p-1.5 rounded border border-green-200 text-green-600 hover:bg-green-50">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} title="Delete"
                        className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
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

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Company' : 'Add Company'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={submitForm} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                    <option value="">Not specified</option>
                    {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} employees</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50">
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
