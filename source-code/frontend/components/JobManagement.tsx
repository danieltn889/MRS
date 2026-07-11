import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Edit, Trash2, Eye, Copy, Users,
  Briefcase, MapPin, Clock, CheckCircle,
  AlertCircle, UserCheck, BarChart3, ArrowLeft,
  Star, Award, Medal, TrendingUp, XCircle
} from 'lucide-react';
import { getCompanyJobs, deleteJob, duplicateJob, getJob } from '../services/jobAPI';
import JobViewModal from './jobs/JobViewModal';
import type { Job, JobStatus, JobManagementProps } from './types/jobTypes';
import CandidatesResultsScreen from './jobs/CandidatesResultsScreen';

// ─── Helpers ───────────────────────────────────────────────────────────────

const formatLocation = (job: any): string => {
  if (job.locations && Array.isArray(job.locations) && job.locations.length > 0) {
    const loc = job.locations[0];
    if (typeof loc === 'string') return loc;
    if (loc?.is_remote) return 'Remote';
    return [loc?.city, loc?.country].filter(Boolean).join(', ') || 'Remote';
  }
  return typeof job.location === 'string'? job.location : 'Remote';
};

const formatSalary = (job: any): string => {
  const currency = job.salary_currency || 'Rwf';
  const fmt = (n: string | number) => Number(n).toLocaleString();
  if (job.salary_min && job.salary_max)
    return `${currency} ${fmt(job.salary_min)} – ${fmt(job.salary_max)}`;
  if (job.salary_min) return `From ${currency} ${fmt(job.salary_min)}`;
  if (job.salary_max) return `Up to ${currency} ${fmt(job.salary_max)}`;
  return 'Not specified';
};

const normaliseJob = (job: any): Job => ({
  id: job.id,
  title: job.title || 'Untitled',
  department: job.department || 'Not specified',
  status: (['active', 'draft', 'closed'].includes(job.status) ? job.status : 'draft') as JobStatus,
  location: formatLocation(job),
  applications_count: Number(job.applications_count ?? job.application_count ?? 0),
  results_count: Number(job.results_count ?? 0),
  created_at: job.created_at
    ? new Date(job.created_at).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0],
  salary_range: formatSalary(job),
  opens_at: job.published_at || job.opens_at || null,
  closes_at: job.expires_at || job.closes_at || null,
});

const extractJobsArray = (response: any): any[] => {
  if (response?.data?.data?.jobs && Array.isArray(response.data.data.jobs))
    return response.data.data.jobs;
  if (response?.data?.jobs && Array.isArray(response.data.jobs))
    return response.data.jobs;
  if (response?.data?.data && Array.isArray(response.data.data))
    return response.data.data;
  if (response?.data && Array.isArray(response.data))
    return response.data;
  if (Array.isArray(response))
    return response;
  return [];
};

// ─── Status badge ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobStatus, { label: string; dot: string; bg: string; text: string }> = {
  active:  { label: 'Active',  dot: '#22c55e', bg: '#f0fdf4', text: '#15803d'},
  draft:   { label: 'Draft',   dot: '#f59e0b', bg: '#fffbeb', text: '#b45309'},
  closed:  { label: 'Closed',  dot: '#ef4444', bg: '#fef2f2', text: '#b91c1c'},
  pending: { label: 'Pending', dot: '#8b5cf6', bg: '#f5f3ff', text: '#6d28d9'},
};

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20,
      background: cfg.bg, color: cfg.text,
      fontSize: 12, fontWeight: 600, letterSpacing: 0.3,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: cfg.dot, display: 'inline-block',
        boxShadow: `0 0 0 2px ${cfg.dot}33`,
      }} />
      {cfg.label}
    </span>
  );
};

// ─── Stat card ──────────────────────────────────────────────────────────────

const StatCard = ({
  label, value, icon: Icon, color,
}: { label: string; value: number; icon: React.ElementType; color: string }) => (
  <div style={{
    background: '#fff', borderRadius: 16, padding: '20px 24px',
    boxShadow: '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    border: '1px solid #f1f5f9',
  }}>
    <div>
      <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase'}}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{value}</p>
    </div>
    <div style={{
      width: 48, height: 48, borderRadius: 14,
      background: `${color}15`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={22} color={color} />
    </div>
  </div>
);

// ─── Main JobManagement Component ───────────────────────────────────────────

interface ExtendedJobManagementProps extends JobManagementProps {
  onViewCandidates?: (jobId: string, jobTitle: string) => void;
}

const JobManagement: React.FC<ExtendedJobManagementProps> = ({
  onBack, onCreateJob, onEditJob, onViewCandidates, refreshTrigger = 0,
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // State for results screen
  const [showResultsScreen, setShowResultsScreen] = useState(false);
  const [selectedJobForResults, setSelectedJobForResults] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => { loadJobs(); }, [refreshTrigger]);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');
      if (!token) { setJobs([]); return; }
      const response = await getCompanyJobs();
      setJobs(extractJobsArray(response).map(normaliseJob));
    } catch (err) {
      console.error('Failed to load jobs:', err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (jobId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      setActionLoading(jobId);
      await deleteJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
    } catch (err) {
      alert('Failed to delete job. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDuplicate = async (jobId: string) => {
    try {
      setActionLoading(jobId + '-dup');
      await duplicateJob(jobId);
      await loadJobs();
    } catch (err) {
      alert('Failed to duplicate job.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleView = async (jobId: string) => {
    try {
      setActionLoading(jobId + '-view');
      const response = await getJob(jobId);
      const raw = response?.data?.data || response?.data || response;
      setSelectedJob({ 
        ...raw, 
        location: formatLocation(raw), 
        salary_range: formatSalary(raw) 
      });
      setShowViewModal(true);
    } catch (err) {
      alert('Failed to load job details.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewCandidates = (jobId: string, jobTitle: string) => {
    if (onViewCandidates) {
      onViewCandidates(jobId, jobTitle);
    }
  };

  // Handle View Results button click
  const handleViewResults = (jobId: string, jobTitle: string) => {
    setSelectedJobForResults({ id: jobId, title: jobTitle });
    setShowResultsScreen(true);
  };

  const filtered = jobs.filter(j => {
    const q = searchTerm.toLowerCase();
    return (j.title.toLowerCase().includes(q) || j.department.toLowerCase().includes(q))
      && (statusFilter === 'all'|| j.status === statusFilter);
  });

  const stats = {
    total: jobs.length,
    active: jobs.filter(j => j.status === 'active').length,
    draft: jobs.filter(j => j.status === 'draft').length,
    applications: jobs.reduce((s, j) => s + (j.applications_count ?? 0), 0),
  };

  // Show results screen when a job is selected
  if (showResultsScreen && selectedJobForResults) {
    return (
      <div style={{
        minHeight: '100vh', background: '#f8fafc',
        fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
        padding: '24px'
      }}>
        <CandidatesResultsScreen
          jobId={selectedJobForResults.id}
          jobTitle={selectedJobForResults.title}
          onBack={() => {
            setShowResultsScreen(false);
            setSelectedJobForResults(null);
          }}
        />
      </div>
    );
  }

  // Styles
  const s = {
    page: {
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    } as React.CSSProperties,

    header: {
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      padding: '0 32px',
      height: 64,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 10,
    } as React.CSSProperties,

    logo: {
      fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: -0.5,
    } as React.CSSProperties,

    btn: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 18px', borderRadius: 10, fontWeight: 600,
      fontSize: 14, cursor: 'pointer', border: 'none', transition: 'all .15s',
    } as React.CSSProperties,

    primaryBtn: {
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      color: '#fff',
      boxShadow: '0 2px 8px rgba(37,99,235,.35)',
    } as React.CSSProperties,

    ghostBtn: {
      background: 'transparent', color: '#64748b',
      border: '1px solid #e2e8f0',
    } as React.CSSProperties,

    body: { padding: '32px 32px'} as React.CSSProperties,

    sectionTitle: {
      fontSize: 24, fontWeight: 700, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4,
    } as React.CSSProperties,

    sectionSub: { fontSize: 14, color: '#64748b', marginBottom: 24 } as React.CSSProperties,

    statsGrid: {
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28,
    } as React.CSSProperties,

    toolbar: {
      display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center',
    } as React.CSSProperties,

    searchWrap: {
      flex: 1, position: 'relative',
    } as React.CSSProperties,

    searchIcon: {
      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
      color: '#94a3b8', pointerEvents: 'none',
    } as React.CSSProperties,

    searchInput: {
      width: '100%', padding: '9px 12px 9px 38px',
      border: '1px solid #e2e8f0', borderRadius: 10,
      fontSize: 14, color: '#0f172a', background: '#fff',
      outline: 'none', boxSizing: 'border-box',
      transition: 'border .15s',
    } as React.CSSProperties,

    select: {
      padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10,
      fontSize: 14, color: '#0f172a', background: '#fff',
      outline: 'none', cursor: 'pointer', minWidth: 140,
    } as React.CSSProperties,

    table: {
      width: '100%', borderCollapse: 'collapse'as const,
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    } as React.CSSProperties,

    th: {
      padding: '12px 20px', textAlign: 'left'as const,
      fontSize: 11, fontWeight: 600, color: '#64748b',
      letterSpacing: 0.8, textTransform: 'uppercase'as const,
      background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
    } as React.CSSProperties,

    td: {
      padding: '14px 20px', fontSize: 14, color: '#334155',
      borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle'as const,
    } as React.CSSProperties,

    iconBtn: (color: string) => ({
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 30, height: 30, borderRadius: 8, border: 'none',
      background: `${color}10`, color, cursor: 'pointer', transition: 'all .15s',
    } as React.CSSProperties),

    // Labeled action button (icon + text) so each action is clear to the user.
    actionBtn: (color: string) => ({
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '6px 10px', borderRadius: 8, border: 'none',
      background: `${color}15`, color, cursor: 'pointer',
      fontSize: 12, fontWeight: 600, transition: 'all .15s',
    } as React.CSSProperties),

    resultsBtn: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 8, fontWeight: 500,
      fontSize: 12, cursor: 'pointer', border: 'none',
      background: '#22c55e15', color: '#16a34a',
    } as React.CSSProperties,

    emptyBox: {
      textAlign: 'center'as const, padding: '64px 0',
      background: '#fff', borderRadius: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    } as React.CSSProperties,
  };

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{ textAlign: 'center'}}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '3px solid #e2e8f0', borderTopColor: '#2563eb',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading jobs…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.logo}>Job Management</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} style={{ ...s.btn, ...s.ghostBtn }}>
            ← Back
          </button>
          <button onClick={onCreateJob} style={{ ...s.btn, ...s.primaryBtn }}>
            <Plus size={15} /> Post a Job
          </button>
        </div>
      </div>

      <div style={s.body}>
        <p style={s.sectionTitle}>Job Postings</p>
        <p style={s.sectionSub}>Manage your company's active, draft, and closed job listings</p>

        <div style={s.statsGrid}>
          <StatCard label="Total Jobs" value={stats.total} icon={Briefcase} color="#2563eb" />
          <StatCard label="Active" value={stats.active} icon={CheckCircle} color="#22c55e" />
          <StatCard label="Applications" value={stats.applications} icon={Users} color="#8b5cf6" />
          <StatCard label="Drafts" value={stats.draft} icon={AlertCircle} color="#f59e0b" />
        </div>

        <div style={s.toolbar}>
          <div style={s.searchWrap}>
            <Search size={15} style={s.searchIcon} />
            <input
              style={s.searchInput}
              placeholder="Search by title or department…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div style={s.emptyBox}>
            <Briefcase size={48} color="#cbd5e1" style={{ margin: '0 auto 16px'}} />
            <p style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>No jobs found</p>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              {searchTerm || statusFilter !== 'all'
                ? 'Try different search terms or filters.'
                : 'Create your first job posting to get started.'}
            </p>
            {!searchTerm && statusFilter === 'all'&& (
              <button onClick={onCreateJob} style={{ ...s.btn, ...s.primaryBtn }}>
                <Plus size={15} /> Post a Job
              </button>
            )}
          </div>
        ) : (
          <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', overflowX: 'auto'}}>
            <table style={{ ...s.table, minWidth: 1020 }}>
              <thead>
                <tr>
                  {['Job Title', 'Department', 'Status', 'Location', 'Applications', 'Opens', 'Closes', 'Created', 'Actions'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((job, i) => (
                  <tr key={job.id} style={{ background: i % 2 === 0 ? '#fff': '#fafafa'}}>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10,
                          background: 'linear-gradient(135deg, #2563eb15, #2563eb25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Briefcase size={16} color="#2563eb" />
                        </div>
                        <span style={{ fontWeight: 600, color: '#0f172a'}}>{job.title}</span>
                      </div>
                    </td>
                    <td style={s.td}>{job.department}</td>
                    <td style={s.td}><StatusBadge status={job.status} /></td>
                    <td style={s.td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={13} color="#94a3b8" />{job.location}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: '#f1f5f9', padding: '3px 10px', borderRadius: 20,
                        fontSize: 13, fontWeight: 600, color: '#475569',
                      }}>
                        <Users size={12} />{job.applications_count ?? 0}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: 13, color: '#64748b', whiteSpace: 'nowrap'}}>
                      {job.opens_at
                        ? new Date(job.opens_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})
                        : job.status === 'draft'
                          ? 'Not published'
                          /* Active/open job with no published_at → it's been open since creation */
                          : new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}
                    </td>
                    <td style={{ ...s.td, fontSize: 13, color: '#64748b', whiteSpace: 'nowrap'}}>
                      {job.closes_at
                        ? new Date(job.closes_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})
                        : 'No deadline'}
                    </td>
                    <td style={{ ...s.td, fontSize: 13, color: '#64748b', whiteSpace: 'nowrap'}}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} color="#94a3b8" />
                        {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric'})}
                      </span>
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                        <button onClick={() => handleView(job.id)} style={s.actionBtn('#2563eb')} title="View job details">
                          <Eye size={14} /> View
                        </button>
                        <button onClick={() => onEditJob?.(job.id)} style={s.actionBtn('#8b5cf6')} title="Edit job">
                          <Edit size={14} /> Edit
                        </button>
                        <button onClick={() => handleDuplicate(job.id)} style={s.actionBtn('#22c55e')} title="Duplicate job">
                          <Copy size={14} /> Duplicate
                        </button>
                        <button
                          onClick={() => handleViewCandidates(job.id, job.title)}
                          style={s.actionBtn('#7c3aed')}
                          title="View applicants for this job"
                        >
                          <UserCheck size={14} /> Candidates ({job.applications_count ?? 0})
                        </button>
                        <button
                          onClick={() => handleViewResults(job.id, job.title)}
                          style={s.actionBtn('#16a34a')}
                          title="View candidate results & scores"
                        >
                          <BarChart3 size={14} /> Results ({job.results_count ?? 0})
                        </button>
                        <button
                          onClick={() => handleDelete(job.id, job.title)}
                          style={s.actionBtn('#ef4444')}
                          title="Delete job"
                          disabled={actionLoading === job.id}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JobViewModal
        isOpen={showViewModal}
        onClose={() => { setShowViewModal(false); setSelectedJob(null); }}
        job={selectedJob}
      />
    </div>
  );
};

export default JobManagement;