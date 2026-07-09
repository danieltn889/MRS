import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, Users, Briefcase, Target, RefreshCw } from 'lucide-react';
import { getPlatformStats, getAdminCompanies, PlatformStats, AdminCompany } from '../services/adminAPI';

const StatCard: React.FC<{ label: string; value: number | string; icon: any; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className={`bg-white rounded-xl shadow-md p-6 border-l-4 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
      </div>
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center"><Icon className="w-6 h-6 text-gray-600" /></div>
    </div>
  </div>
);

const SystemAnalytics: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const [statsRes, companiesRes] = await Promise.all([
        getPlatformStats(),
        getAdminCompanies({ limit: 100 }),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      setCompanies((companiesRes.data || []).sort((a, b) => (b.job_count + b.team_count) - (a.job_count + a.team_count)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-center py-16 text-gray-500">Loading analytics...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-1">System Analytics</h1>
          <p className="text-gray-600">Platform-wide usage across every company</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 h-fit">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <StatCard label="Companies" value={stats?.companies.total ?? 0} icon={Building2} color="border-purple-500" />
        <StatCard label="Users" value={stats?.users.total ?? 0} icon={Users} color="border-blue-500" />
        <StatCard label="Active Jobs" value={stats?.jobs.active ?? 0} icon={Briefcase} color="border-green-500" />
        <StatCard label="Applications" value={stats?.applications.total ?? 0} icon={Target} color="border-yellow-500" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Company verification</p>
          <p className="text-sm text-gray-800">{stats?.companies.verified ?? 0} verified / {stats?.companies.pending ?? 0} pending</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Users by role</p>
          <p className="text-sm text-gray-800">{stats?.users.candidates ?? 0} candidates · {stats?.users.recruiters ?? 0} recruiters · {stats?.users.company_admins ?? 0} admins</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Hiring outcomes</p>
          <p className="text-sm text-gray-800">{stats?.applications.hired ?? 0} hired · {stats?.applications.rejected ?? 0} rejected</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">In progress</p>
          <p className="text-sm text-gray-800">{stats?.applications.in_review ?? 0} in review · {stats?.applications.interview ?? 0} interviewing</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">Most active companies</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Industry</th>
              <th className="px-4 py-3">Jobs</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {companies.slice(0, 15).map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600">{c.industry || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.job_count}</td>
                <td className="px-4 py-3 text-gray-600">{c.team_count}</td>
                <td className="px-4 py-3 text-gray-600">{c.verification_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SystemAnalytics;
