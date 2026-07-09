import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, Bookmark, X, MapPin, Briefcase,
  Clock, Users, RefreshCw, ChevronRight, TrendingUp, Zap,
  AlertCircle, Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getJob } from '../../services/jobAPI';
import JobViewModal from './JobViewModal';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

interface FeedJob {
  id: string;
  title: string;
  company_name: string;
  company_logo?: string;
  location: string;
  job_type: string;
  experience_level: string;
  category?: string;
  posted_at: string;
  application_count: number;
  score: number;
  score_breakdown?: Record<string, number>;
  skills_required?: string[];
}

interface FeedResponse {
  jobs: FeedJob[];
  total: number;
  page: number;
  cold_start: boolean;
}

const EXPERIENCE_LABELS: Record<string, string> = {
  entry: 'Entry Level', junior: 'Junior', mid: 'Mid Level',
  senior: 'Senior', lead: 'Lead', manager: 'Manager',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time',
  contract: 'Contract', internship: 'Internship', remote: 'Remote',
};

function daysAgo(date: string): string {
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function ScoreBar({ score, breakdown }: { score: number; breakdown?: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#94a3b8';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setOpen(p => !p)}>
        <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 9999, transition: 'width .6s ease' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 36 }}>{score.toFixed(0)}%</span>
        {breakdown && <ChevronRight size={12} color="#94a3b8" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: '.2s' }} />}
      </div>
      {open && breakdown && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, fontSize: 11 }}>
          {Object.entries(breakdown).filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: v < 0 ? '#ef4444' : '#64748b', marginBottom: 2 }}>
              <span>{k.replace(/_/g, ' ')}</span>
              <span style={{ fontWeight: 600 }}>{v > 0 ? '+' : ''}{v.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job, saved, onSave, onIgnore, onView, onApply, onViewDetails, viewLoading,
}: {
  job: FeedJob;
  saved: boolean;
  onSave: () => void;
  onIgnore: () => void;
  onView: () => void;
  onApply: () => void;
  onViewDetails: () => void;
  viewLoading: boolean;
}) {
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    viewTimer.current = setTimeout(onView, 5000); // log view after 5s visible
    return () => { if (viewTimer.current) clearTimeout(viewTimer.current); };
  }, []);

  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
      padding: '16px 18px', position: 'relative',
      boxShadow: '0 1px 4px rgba(0,0,0,.05)', transition: 'box-shadow .2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,.05)')}
    >
      {/* Ignore button */}
      <button onClick={onIgnore} title="Not interested"
        style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 2 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
      >
        <X size={14} />
      </button>

      {/* Header */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingRight: 20 }}>
        {job.company_logo ? (
          <img src={job.company_logo} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'contain', border: '1px solid #e2e8f0' }} />
        ) : (
          <div style={{ width: 42, height: 42, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Briefcase size={18} color="#2563eb" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', lineHeight: 1.3 }}>{job.title}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{job.company_name}</div>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {job.location && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
            <MapPin size={12} />{job.location}
          </span>
        )}
        {job.job_type && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
            <Briefcase size={12} />{JOB_TYPE_LABELS[job.job_type] || job.job_type}
          </span>
        )}
        {job.experience_level && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
            <TrendingUp size={12} />{EXPERIENCE_LABELS[job.experience_level] || job.experience_level}
          </span>
        )}
        {job.posted_at && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
            <Clock size={12} />{daysAgo(job.posted_at)}
          </span>
        )}
        {job.application_count > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#94a3b8' }}>
            <Users size={12} />{job.application_count} applied
          </span>
        )}
      </div>

      {/* Skills */}
      {(job.skills_required || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {job.skills_required!.slice(0, 5).map((s, i) => (
            <span key={i} style={{ padding: '2px 8px', background: '#f1f5f9', color: '#475569', borderRadius: 9999, fontSize: 11, fontWeight: 500 }}>
              {s}
            </span>
          ))}
          {job.skills_required!.length > 5 && (
            <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>+{job.skills_required!.length - 5} more</span>
          )}
        </div>
      )}

      {/* Match score */}
      <ScoreBar score={job.score} breakdown={job.score_breakdown} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onViewDetails} disabled={viewLoading}
          style={{ padding: '8px 14px', background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: viewLoading ? 'default' : 'pointer', opacity: viewLoading ? 0.6 : 1 }}>
          {viewLoading ? 'Loading…' : 'View Details'}
        </button>
        <button onClick={onApply}
          style={{ flex: 1, padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Apply Now
        </button>
        <button onClick={onSave}
          title={saved ? 'Unsave' : 'Save'}
          style={{ padding: '8px 12px', background: saved ? '#eff6ff' : '#f8fafc', border: `1px solid ${saved ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          {saved ? <Bookmark size={16} color="#2563eb" fill="#2563eb" /> : <Bookmark size={16} color="#94a3b8" />}
        </button>
      </div>
    </div>
  );
}

interface Props {
  onApplyToJob?: (jobId: string) => void;
  // Optional override — by default "View Details" opens the full job
  // in-place via JobViewModal (fetching the complete record on click).
  // Pass this only if a parent wants to navigate elsewhere instead.
  onViewJob?: (jobId: string) => void;
}

const PersonalizedFeed: React.FC<Props> = ({ onApplyToJob, onViewJob }) => {
  const { token } = useAuth();
  const [jobs, setJobs]           = useState<FeedJob[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [coldStart, setColdStart] = useState(false);
  const [total, setTotal]         = useState(0);
  const [savedIds, setSavedIds]   = useState<Set<string>>(new Set());
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);
  const [detailsJob, setDetailsJob] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadFeed = useCallback(async (pg = 1, append = false) => {
    pg === 1 ? setLoading(true) : setRefresh(true);
    setError(null);
    try {
      const r = await fetch(`${API}/feed?page=${pg}&top_n=10`, { headers });
      const d = await r.json();
      if (!d.success) throw new Error(d.message || 'Failed to load feed');
      const data: FeedResponse = d.data;
      setJobs(prev => append ? [...prev, ...data.jobs] : data.jobs);
      setTotal(data.total);
      setColdStart(data.cold_start);
      setPage(pg);
      setHasMore(data.jobs.length === 10 && pg * 10 < data.total);

      // Load saved jobs to mark saved state
      const sv = await fetch(`${API}/feed/saved`, { headers });
      const svd = await sv.json();
      if (svd.success) setSavedIds(new Set((svd.data as any[]).map(j => j.id)));
    } catch (e: any) {
      setError(e.message || 'Could not load your feed');
    } finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [token]);

  useEffect(() => { loadFeed(1); }, [loadFeed]);

  const handleView = (jobId: string) => {
    fetch(`${API}/feed/view/${jobId}`, { method: 'POST', headers, body: JSON.stringify({ seconds_spent: 5 }) }).catch(() => {});
  };

  // Explicit click is a stronger, immediate signal than the passive 5s-dwell
  // timer above — job_views upserts on (user_id, job_id) so firing both is
  // safe, it just refreshes the same row's timestamp.
  // Opens the full job in-place (JobViewModal), same as the main Job Feed
  // tab, instead of navigating away — this feed's own FeedJob objects are
  // too thin (no description/requirements/benefits) for the modal, so the
  // complete job record is fetched fresh on click.
  const handleViewDetails = async (jobId: string) => {
    handleView(jobId);
    if (onViewJob) { onViewJob(jobId); return; }
    setDetailsLoading(jobId);
    try {
      const response = await getJob(jobId);
      const jobData = (response as any)?.data?.data || (response as any)?.data || response;
      setDetailsJob(jobData);
      setDetailsOpen(true);
    } catch {
      // fall back to a full navigation if the fetch fails for any reason
      window.location.href = `/jobs/${jobId}`;
    } finally {
      setDetailsLoading(null);
    }
  };

  const handleIgnore = (jobId: string) => {
    fetch(`${API}/feed/ignore/${jobId}`, { method: 'POST', headers }).catch(() => {});
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  const handleSave = (jobId: string) => {
    const isSaved = savedIds.has(jobId);
    if (isSaved) {
      fetch(`${API}/feed/save/${jobId}`, { method: 'DELETE', headers }).catch(() => {});
      setSavedIds(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    } else {
      fetch(`${API}/feed/save/${jobId}`, { method: 'POST', headers }).catch(() => {});
      setSavedIds(prev => new Set([...prev, jobId]));
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: '#64748b' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>Building your personalized feed…</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <AlertCircle size={32} color="#ef4444" style={{ marginBottom: 8 }} />
        <p style={{ color: '#64748b', fontSize: 14 }}>{error}</p>
        <button onClick={() => loadFeed(1)} style={{ marginTop: 12, padding: '8px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="#7c3aed" /> For You
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            {coldStart ? 'Trending jobs in your field — keep applying to improve your feed'
              : `${total} jobs ranked by match · click scores to see breakdown`}
          </p>
        </div>
        <button onClick={() => loadFeed(1)} disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#475569' }}>
          <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          Refresh
        </button>
      </div>

      {coldStart && (
        <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#1d4ed8', display: 'flex', gap: 8 }}>
          <Zap size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Your feed improves as you apply, view, and save jobs. The AI learns your preferences over time.</span>
        </div>
      )}

      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <Briefcase size={36} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14 }}>No jobs in your feed right now.</p>
          <p style={{ fontSize: 12 }}>Make sure your profile has skills and preferred locations set.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              saved={savedIds.has(job.id)}
              onView={() => handleView(job.id)}
              onIgnore={() => handleIgnore(job.id)}
              onSave={() => handleSave(job.id)}
              onApply={() => onApplyToJob?.(job.id)}
              onViewDetails={() => handleViewDetails(job.id)}
              viewLoading={detailsLoading === job.id}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={() => loadFeed(page + 1, true)} disabled={refreshing}
            style={{ padding: '10px 28px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, cursor: 'pointer', color: '#475569', fontWeight: 500 }}>
            {refreshing ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <JobViewModal
        isOpen={detailsOpen}
        onClose={() => { setDetailsOpen(false); setDetailsJob(null); }}
        job={detailsJob}
        matchScore={detailsJob ? jobs.find(j => j.id === (detailsJob.id))?.score : undefined}
      />
    </div>
  );
};

export default PersonalizedFeed;
