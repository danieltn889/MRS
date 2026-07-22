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

// Validated categorical palette (blue/orange/aqua/yellow - slots 1-4 of the
// standard order), fixed per-position so the same rank always gets the same
// hue across every breakdown on this page.
const BREAKDOWN_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

const MiniBreakdown: React.FC<{ items: { label: string; value: number }[] }> = ({ items }) => {
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <div className="mt-2 space-y-2 text-left">
      {items.map((item, i) => {
        const color = BREAKDOWN_COLORS[i % BREAKDOWN_COLORS.length];
        // Near-zero values still get a sliver of visible width- a true 0%
        // bar reads as "missing" rather than "zero", and the number to the
        // right already carries the exact value.
        const widthPct = Math.max(2, (item.value / max) * 100);
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                {item.label}
              </span>
              <span className="font-semibold text-gray-800" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-sm bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-r-[3px]"
                style={{ width: `${widthPct}%`, background: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Company verification</p>
          <MiniBreakdown items={[
            { label: 'Verified', value: stats?.companies.verified ?? 0 },
            { label: 'Pending', value: stats?.companies.pending ?? 0 },
          ]} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Users by role</p>
          <MiniBreakdown items={[
            { label: 'Candidates', value: stats?.users.candidates ?? 0 },
            { label: 'Recruiters', value: stats?.users.recruiters ?? 0 },
            { label: 'Company admins', value: stats?.users.company_admins ?? 0 },
            { label: 'System admins', value: stats?.users.system_admins ?? 0 },
          ]} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Hiring outcomes</p>
          <MiniBreakdown items={[
            { label: 'Hired', value: stats?.applications.hired ?? 0 },
            { label: 'Rejected', value: stats?.applications.rejected ?? 0 },
          ]} />
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">In progress</p>
          <MiniBreakdown items={[
            { label: 'In review', value: stats?.applications.in_review ?? 0 },
            { label: 'Interviewing', value: stats?.applications.interview ?? 0 },
          ]} />
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
                <td className="px-4 py-3 text-gray-600">{c.industry || ' '}</td>
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
