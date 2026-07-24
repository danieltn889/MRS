import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Building2, Users, Briefcase, Target, RefreshCw, Download, Trophy } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler, type ChartData, type ChartOptions,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  getPlatformStats, getAdminCompanies, getPlatformAnalytics,
  PlatformStats, AdminCompany, PlatformAnalytics,
} from '../services/adminAPI';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

// ── Palette (validated categorical order; see dataviz skill) ───────────────
// Fixed position -> fixed hue everywhere on this page, so "slot 1" always
// means the same color whichever breakdown it appears in.
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'];
const SEQUENTIAL_BLUE = '#2a78d6'; // magnitude comparisons (bar/column) use one hue, not identity colors
const INK_SECONDARY = '#52514e';
const GRID = '#e1e0d9';

const toNum = (v: string | number | undefined | null) => (v == null ? 0 : typeof v === 'number' ? v : parseInt(v, 10) || 0);

const humanize = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const baseFont = { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", size: 11 };

const legendOpts = (show: boolean) => ({
  display: show,
  position: 'bottom' as const,
  labels: { color: INK_SECONDARY, font: baseFont, boxWidth: 10, boxHeight: 10, padding: 12, usePointStyle: true, pointStyle: 'circle' as const },
});

const tooltipOpts = {
  backgroundColor: '#0b0b0b',
  titleFont: baseFont,
  bodyFont: baseFont,
  padding: 8,
  cornerRadius: 6,
  displayColors: true,
  boxPadding: 4,
};

// ── Small stat tile with an optional 12-point sparkline ────────────────────
const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points }) => {
  const data: ChartData<'line'> = {
    labels: points.map((_, i) => String(i)),
    datasets: [{
      data: points,
      borderColor: '#94938c',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.35,
      fill: false,
    }],
  };
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: { x: { display: false }, y: { display: false } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
  };
  return <div style={{ height: 32, width: 80 }}><Line data={data} options={options} /></div>;
};

const StatCard: React.FC<{ label: string; value: number | string; icon: any; color: string; sparkline?: number[] }> = ({ label, value, icon: Icon, color, sparkline }) => (
  <div className={`bg-white rounded-xl shadow-md p-6 border-l-4 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-500 text-sm font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-800">{value}</p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center"><Icon className="w-6 h-6 text-gray-600" /></div>
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} color={SEQUENTIAL_BLUE} />}
      </div>
    </div>
  </div>
);

// ── Horizontal-bar breakdown used for the small "at a glance" cards ────────
const MiniBreakdown: React.FC<{ items: { label: string; value: number }[] }> = ({ items }) => {
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <div className="mt-2 space-y-2 text-left">
      {items.map((item, i) => {
        const color = CATEGORICAL[i % CATEGORICAL.length];
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
              <div className="h-full rounded-r-[3px]" style={{ width: `${widthPct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Chart card chrome: title + PNG export, shared by every chart below ─────
const ChartCard: React.FC<{ title: string; subtitle?: string; height?: number; exportRef?: React.RefObject<any>; children: React.ReactNode }> = ({ title, subtitle, height = 240, exportRef, children }) => {
  const handleExport = () => {
    const chart = exportRef?.current;
    if (!chart) return;
    const url = chart.toBase64Image('image/png', 1);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {exportRef && (
          <button onClick={handleExport} title="Export as PNG" className="text-gray-400 hover:text-gray-700 shrink-0">
            <Download size={14} />
          </button>
        )}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
};

// "All time" (days = ALL_DAYS = 3650) would otherwise densify 3650 empty
// daily points- unreadable and pointless. Cap how far back the dense series
// goes to whatever the real data actually spans (or this cap, whichever is
// smaller), so "All" shows the platform's real history at a readable
// day-by-day resolution instead of a decade of mostly-zero points.
const MAX_DENSE_DAYS = 180;

// ── Dense daily series: fills gaps the SQL GROUP BY leaves for quiet days ──
const buildDailySeries = (rows: { date: string; count: string }[], days: number): { labels: string[]; values: number[] } => {
  const byDate = new Map(rows.map(r => [r.date, toNum(r.count)]));
  const today = new Date();
  let spanDays = Math.min(days, MAX_DENSE_DAYS);
  if (days > MAX_DENSE_DAYS && rows.length > 0) {
    const earliest = rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date);
    const spanFromData = Math.ceil((today.getTime() - new Date(earliest).getTime()) / 86_400_000) + 1;
    spanDays = Math.min(Math.max(spanFromData, 1), days);
  }
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = spanDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    values.push(byDate.get(key) ?? 0);
  }
  return { labels, values };
};

// 3650 days (~10 years) doubles as "All time"- see the backend comment on
// the /admin/analytics days validator.
const ALL_DAYS = 3650;
const DAY_RANGES: { value: number; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: ALL_DAYS, label: 'All' },
];

const DAYS_STORAGE_KEY = 'sysAnalytics.days';
const AUTO_REFRESH_STORAGE_KEY = 'sysAnalytics.autoRefresh';

const SystemAnalytics: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  // Remembered across visits (defaults to "All" the first time, so a new
  // admin sees the platform's whole history rather than a 30-day slice
  // they didn't ask for).
  const [days, setDays] = useState<number>(() => {
    const saved = Number(localStorage.getItem(DAYS_STORAGE_KEY));
    return DAY_RANGES.some(r => r.value === saved) ? saved : ALL_DAYS;
  });
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === 'true');
  const [sortBy, setSortBy] = useState<'jobs' | 'team' | 'name'>('jobs');

  useEffect(() => { localStorage.setItem(DAYS_STORAGE_KEY, String(days)); }, [days]);
  useEffect(() => { localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh)); }, [autoRefresh]);

  const activityChartRef = useRef<any>(null);
  const industryChartRef = useRef<any>(null);
  const employmentChartRef = useRef<any>(null);
  const verificationChartRef = useRef<any>(null);
  const statusChartRef = useRef<any>(null);

  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [statsRes, analyticsRes, companiesRes] = await Promise.all([
        getPlatformStats(),
        getPlatformAnalytics(days),
        getAdminCompanies({ limit: 100 }),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (analyticsRes.success) setAnalytics(analyticsRes.data);
      setCompanies(companiesRes.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  // Auto-refresh: polling, not a live push feed- there's no websocket/SSE
  // channel for admin analytics, and polling every 60s is simple, reliable,
  // and cheap enough for a handful of aggregate queries.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [autoRefresh, days]);

  const sortedCompanies = useMemo(() => {
    const copy = [...companies];
    if (sortBy === 'jobs') copy.sort((a, b) => b.job_count - a.job_count);
    else if (sortBy === 'team') copy.sort((a, b) => b.team_count - a.team_count);
    else copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [companies, sortBy]);

  const exportCompaniesCsv = () => {
    const header = ['Company', 'Industry', 'Jobs', 'Team', 'Verification'];
    const rows = sortedCompanies.map(c => [c.name, c.industry || '', String(c.job_count), String(c.team_count), c.verification_status]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'companies.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="max-w-7xl mx-auto p-6 text-center py-16 text-gray-500">Loading analytics...</div>;
  }

  // ── Derived chart data ────────────────────────────────────────────────
  const registrationsSeries = buildDailySeries(analytics?.timeSeries.registrations || [], days);
  const applicationsSeries = buildDailySeries(analytics?.timeSeries.applications || [], days);
  const jobsSeries = buildDailySeries(analytics?.timeSeries.jobsPosted || [], days);

  const activityData: ChartData<'line'> = {
    labels: registrationsSeries.labels,
    datasets: [
      { label: 'Registrations', data: registrationsSeries.values, borderColor: CATEGORICAL[0], backgroundColor: CATEGORICAL[0] + '1a', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Applications', data: applicationsSeries.values, borderColor: CATEGORICAL[1], backgroundColor: CATEGORICAL[1] + '1a', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Jobs posted', data: jobsSeries.values, borderColor: CATEGORICAL[2], backgroundColor: CATEGORICAL[2] + '1a', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    ],
  };
  const activityOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: legendOpts(true), tooltip: tooltipOpts },
    scales: {
      x: { ticks: { color: INK_SECONDARY, font: baseFont, maxRotation: 0, autoSkip: true }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: INK_SECONDARY, font: baseFont, precision: 0 }, grid: { color: GRID } },
    },
  };

  const industryRows = (analytics?.jobsByIndustry || []).slice(0, 10);
  const industryData: ChartData<'bar'> = {
    labels: industryRows.map(r => r.industry),
    datasets: [{ label: 'Active jobs', data: industryRows.map(r => toNum(r.count)), backgroundColor: SEQUENTIAL_BLUE, borderRadius: 3, maxBarThickness: 20 }],
  };
  const horizontalBarOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: legendOpts(false), tooltip: tooltipOpts },
    scales: {
      x: { beginAtZero: true, ticks: { color: INK_SECONDARY, font: baseFont, precision: 0 }, grid: { color: GRID } },
      y: { ticks: { color: INK_SECONDARY, font: baseFont }, grid: { display: false } },
    },
  };

  const employmentRows = analytics?.employmentType || [];
  const employmentData: ChartData<'doughnut'> = {
    labels: employmentRows.map(r => humanize(r.job_type)),
    datasets: [{ data: employmentRows.map(r => toNum(r.count)), backgroundColor: CATEGORICAL, borderColor: '#fff', borderWidth: 2 }],
  };

  const VERIFICATION_ORDER = ['verified', 'pending', 'rejected', 'expired'];
  const verificationRows = (analytics?.companyVerification || []).sort((a, b) => VERIFICATION_ORDER.indexOf(a.verification_status) - VERIFICATION_ORDER.indexOf(b.verification_status));
  const verificationData: ChartData<'doughnut'> = {
    labels: verificationRows.map(r => humanize(r.verification_status)),
    datasets: [{ data: verificationRows.map(r => toNum(r.count)), backgroundColor: CATEGORICAL, borderColor: '#fff', borderWidth: 2 }],
  };

  const doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: legendOpts(true), tooltip: tooltipOpts },
  };

  // Pipeline order (not magnitude order)- the story here is "where are
  // applications in the process," so stage sequence carries more meaning
  // than sorting tallest-first. Rejected/withdrawn are terminal exits, shown
  // after the active pipeline rather than folded into it.
  const STATUS_ORDER = ['submitted', 'under_review', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];
  const statusByKey = new Map((analytics?.applicationStatus || []).map(r => [r.status, toNum(r.count)]));
  const statusRows = STATUS_ORDER.map(s => ({ status: s, count: statusByKey.get(s) ?? 0 })).filter(r => statusByKey.has(r.status));
  const statusData: ChartData<'bar'> = {
    labels: statusRows.map(r => humanize(r.status)),
    datasets: [{ label: 'Applications', data: statusRows.map(r => r.count), backgroundColor: SEQUENTIAL_BLUE, borderRadius: 3, maxBarThickness: 20 }],
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowLeft size={14} /> Back to Dashboard
            </button>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-1">System Analytics</h1>
          <p className="text-gray-600">Platform-wide usage across every company</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {DAY_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => setDays(r.value)}
                className={`px-3 py-2 text-xs font-medium ${days === r.value ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            title="Poll for new data every 60s"
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border ${autoRefresh ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-green-500' : 'bg-gray-300'}`} />
            Auto-refresh
          </button>
          <button onClick={() => load()} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <StatCard label="Companies" value={stats?.companies.total ?? 0} icon={Building2} color="border-purple-500" />
        <StatCard label="Users" value={stats?.users.total ?? 0} icon={Users} color="border-blue-500" sparkline={registrationsSeries.values} />
        <StatCard label="Active Jobs" value={stats?.jobs.active ?? 0} icon={Briefcase} color="border-green-500" sparkline={jobsSeries.values} />
        <StatCard label="Applications" value={stats?.applications.total ?? 0} icon={Target} color="border-yellow-500" sparkline={applicationsSeries.values} />
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="Platform activity" subtitle={`${days === ALL_DAYS ? 'All time' : `Last ${days} days`} - registrations, applications, jobs posted`} height={260} exportRef={activityChartRef}>
            <Line ref={activityChartRef} data={activityData} options={activityOptions} />
          </ChartCard>
        </div>
        <ChartCard title="Company verification" height={260} exportRef={verificationChartRef}>
          <Doughnut ref={verificationChartRef} data={verificationData} options={doughnutOptions} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <ChartCard title="Applications by pipeline stage" subtitle="Current status of every application" height={260} exportRef={statusChartRef}>
            <Bar ref={statusChartRef} data={statusData} options={horizontalBarOptions} />
          </ChartCard>
        </div>
        <ChartCard title="Employment types" subtitle="Active job postings" height={260} exportRef={employmentChartRef}>
          <Doughnut ref={employmentChartRef} data={employmentData} options={doughnutOptions} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ChartCard title="Jobs by industry" subtitle="Top 10 industries by active job count" height={280} exportRef={industryChartRef}>
            <Bar ref={industryChartRef} data={industryData} options={horizontalBarOptions} />
          </ChartCard>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5 mb-3"><Trophy size={14} className="text-yellow-500" /> Top recruiters</h3>
          <ol className="space-y-2">
            {(analytics?.topRecruiters || []).slice(0, 8).map((r, i) => (
              <li key={r.id} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-gray-700 truncate">
                  <span className="w-4 text-gray-400 font-semibold shrink-0">{i + 1}</span>
                  <span className="truncate">{r.name}{r.company_name ? ` · ${r.company_name}` : ''}</span>
                </span>
                <span className="font-semibold text-gray-800 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>{toNum(r.jobs_posted)}</span>
              </li>
            ))}
            {(!analytics?.topRecruiters || analytics.topRecruiters.length === 0) && (
              <li className="text-xs text-gray-400">No jobs posted yet</li>
            )}
          </ol>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="font-semibold text-gray-800 text-sm">Most active companies</div>
          <div className="flex items-center gap-2">
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-600">
              <option value="jobs">Sort: Jobs</option>
              <option value="team">Sort: Team size</option>
              <option value="name">Sort: Name</option>
            </select>
            <button onClick={exportCompaniesCsv} className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">
              <Download size={12} /> CSV
            </button>
          </div>
        </div>
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
            {sortedCompanies.slice(0, 15).map(c => (
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

      <p className="text-xs text-gray-400 mt-4">
        Not included here: a geographic map (no verified province/district boundary data wired to this API), heatmap/treemap/bubble/radar/gauge
        forms (would need more dimensions than the platform currently tracks), and native Excel/PDF export (CSV is provided instead - opens in Excel).
      </p>
    </div>
  );
};

export default SystemAnalytics;
