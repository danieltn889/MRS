import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Users, BarChart3, TrendingUp, Award, CheckCircle,
  Medal, Eye, XCircle, Clock, Star, Target, Brain, Code,
  MessageSquare, Zap, Activity, PieChart, Filter, Heart
} from 'lucide-react';
import { getJobCandidatesComplete } from '../../services/jobAPI';

interface CandidatesResultsScreenProps {
  jobId: string;
  jobTitle: string;
  onBack: () => void;
}

const CandidatesResultsScreen: React.FC<CandidatesResultsScreenProps> = ({ jobId, jobTitle, onBack }) => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({});
  const [sortBy, setSortBy] = useState('overall_score');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCalc, setShowCalc] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Email ONE candidate their full results breakdown (passed=true marks them as
  // chosen). Reuses the existing email service via POST /applications/:id/send-results
  // — no new schema. Returns true on success.
  const postResults = async (candidate: any, passed: boolean): Promise<boolean> => {
    if (!candidate?.application_id) return false;
    const token = localStorage.getItem('authToken');
    const w = computeWeighted(candidate);
    const competencies = [
      { label: 'Punctuality', score: parseFloat(candidate.punctuality_score) || 0 },
      { label: 'Communication', score: parseFloat(candidate.communication_score) || 0 },
      { label: 'Problem Solving', score: parseFloat(candidate.problem_solving_score) || 0 },
      { label: 'Adaptability', score: parseFloat(candidate.adaptability_score) || 0 },
      { label: 'Collaboration', score: parseFloat(candidate.collaboration_score) || 0 },
      { label: 'Initiative', score: parseFloat(candidate.initiative_score) || 0 },
    ];
    // task_progress may arrive as an array or a JSON string — normalize both.
    let tp: any = candidate.task_progress;
    if (typeof tp === 'string') { try { tp = JSON.parse(tp); } catch { tp = []; } }
    const tasks = (Array.isArray(tp) ? tp : []).map((t: any, i: number) => ({
      name: t.task_name || t.task_title || `Task ${i + 1}`,
      score: Number(t.score) || 0,
      comment: t.feedback || '',
    }));
    try {
      const res = await fetch(`${API_BASE}/applications/${candidate.application_id}/send-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ finalScore: w.weighted, aiScore: w.aiScore, recruiterAvg: w.recruiterAvg, passed, competencies, tasks }),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok && data.success;
    } catch {
      return false;
    }
  };

  // Email all the selected candidates with a pass/fail decision. The decision is
  // persisted (pass → hired, fail → rejected) so it shows on reload; refresh after.
  const sendResultsToSelected = async (passed: boolean) => {
    if (selectedIds.size === 0) { alert('Select at least one candidate first.'); return; }
    if (!window.confirm(`Email ${selectedIds.size} selected candidate(s) and mark them as ${passed ? 'PASSED (hired)' : 'FAILED (rejected)'}?`)) return;
    setSending(true);
    let ok = 0, fail = 0;
    for (const id of Array.from(selectedIds)) {
      const candidate = candidates.find((c) => c.application_id === id);
      if (await postResults(candidate, passed)) ok++; else fail++;
    }
    setSending(false);
    setSelectedIds(new Set());
    alert(`Results sent: ${ok} succeeded${fail ? `, ${fail} failed` : ''}.`);
    loadCandidates(); // refresh so the persisted pass/fail status shows
  };

  // Send results to the single candidate open in the details modal.
  const sendResultsForOne = async (candidate: any, passed: boolean) => {
    if (!window.confirm(`Email this candidate and mark as ${passed ? 'PASSED (hired)' : 'FAILED (rejected)'}?`)) return;
    setSending(true);
    const ok = await postResults(candidate, passed);
    setSending(false);
    alert(ok ? 'Results sent to the candidate.' : 'Failed to send results.');
    loadCandidates();
  };

  useEffect(() => {
    if (jobId) {
      loadCandidates();
    }
  }, [jobId, sortBy, sortOrder, filterStatus]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const result = await getJobCandidatesComplete(jobId, {
        sortBy,
        sortOrder,
        status: filterStatus === 'all' ? undefined : filterStatus,
        limit: 100
      });
      
      if (result.success) {
        setCandidates(result.data.candidates || []);
        setStats(result.data.stats || {});
      }
    } catch (error) {
      console.error('Error loading candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Expert';
    if (score >= 75) return 'Advanced';
    if (score >= 60) return 'Intermediate';
    if (score >= 40) return 'Beginner';
    return 'Needs Work';
  };

  // Final = ALWAYS 70% AI + 30% recruiter task average. Reuses existing data:
  // simulation_overall_score (AI) and per-task recruiter scores (simulation_tasks.score).
  // The recruiter average is over EVERY task in the simulation — a task that has not
  // been scored counts as 0 (the recruiter is expected to score every task).
  const computeWeighted = (candidate: any) => {
    const aiScore = parseFloat(candidate.simulation_overall_score) || 0;
    const tasks: any[] = candidate.task_progress || candidate.tasks || [];
    const totalTasks = parseInt(candidate.total_tasks_count) || tasks.length || 0;
    const scoredCount = tasks.filter((t) => Number.isFinite(Number(t?.score)) && Number(t?.score) > 0).length;
    // Sum across all tasks; unscored/incomplete tasks contribute 0.
    const sum = tasks.reduce((acc, t) => acc + (Number(t?.score) || 0), 0);
    const recruiterAvg = totalTasks > 0 ? sum / totalTasks : 0;
    // Always weight 70% AI + 30% recruiter.
    const weighted = aiScore * 0.7 + recruiterAvg * 0.3;
    return { aiScore, recruiterAvg, totalTasks, scoredCount, weighted };
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Medal size={24} color="#fbbf24" fill="#fbbf24" />;
    if (rank === 2) return <Medal size={24} color="#94a3b8" fill="#94a3b8" />;
    if (rank === 3) return <Medal size={24} color="#cd7f32" fill="#cd7f32" />;
    return null;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #e2e8f0', borderTopColor: '#2563eb',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ color: '#64748b' }}>Loading candidate results...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with back button */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '16px 24px',
        marginBottom: 24,
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onBack}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#f1f5f9', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, color: '#475569',
              padding: '8px 16px', borderRadius: 10,
            }}
          >
            <ArrowLeft size={18} /> Back to Jobs
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {jobTitle}
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>
              Candidate Results & Performance Analysis
            </p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Users size={20} color="#2563eb" />
            <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{stats.total_applicants || 0}</span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Total Candidates</p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <BarChart3 size={20} color="#8b5cf6" />
            <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{stats.simulations?.with_simulation || 0}</span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Completed Practical Assessments</p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <TrendingUp size={20} color="#22c55e" />
            <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{Math.round(stats.scores?.average || 0)}%</span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Average Score</p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, padding: '20px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Award size={20} color="#fbbf24" />
            <span style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>{Math.round(stats.scores?.max || 0)}%</span>
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Top Score</p>
        </div>
      </div>

      {/* Filters and Sort */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '16px 20px',
        marginBottom: 20, border: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Filter size={16} color="#64748b" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 14, background: '#fff'
            }}
          >
            <option value="all">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 14, background: '#fff'
            }}
          >
            <option value="overall_score">Overall Score</option>
            <option value="applied_at">Application Date</option>
            <option value="completion_rate">Completion Rate</option>
            <option value="name">Candidate Name</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{
              padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
              fontSize: 14, background: '#fff'
            }}
          >
            <option value="DESC">Highest First</option>
            <option value="ASC">Lowest First</option>
          </select>
        </div>
      </div>

      {/* Candidates Table */}
      {candidates.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64, background: '#fff',
          borderRadius: 16, border: '1px solid #e2e8f0'
        }}>
          <Users size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>No candidates yet</p>
          <p style={{ color: '#64748b' }}>Candidates who apply to this job will appear here.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Select candidates and email them their results */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {selectedIds.size > 0 ? `${selectedIds.size} candidate(s) selected` : 'Tick candidates, then Pass or Fail them (emails + saves the decision)'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => sendResultsToSelected(true)}
                disabled={sending || selectedIds.size === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: (sending || selectedIds.size === 0) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, color: '#fff', background: selectedIds.size === 0 ? '#cbd5e1' : '#16a34a' }}
              >
                <Award size={16} /> {sending ? 'Sending…' : `Pass & Email (${selectedIds.size})`}
              </button>
              <button
                onClick={() => sendResultsToSelected(false)}
                disabled={sending || selectedIds.size === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: (sending || selectedIds.size === 0) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, color: '#fff', background: selectedIds.size === 0 ? '#cbd5e1' : '#dc2626' }}
              >
                {sending ? 'Sending…' : `Fail & Email (${selectedIds.size})`}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '14px 8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={candidates.length > 0 && selectedIds.size === candidates.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? new Set(candidates.map((c) => c.application_id)) : new Set())}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Rank</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Candidate</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Tasks Score (100%)</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Recruiter (30%)</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Practical Assessment Score (100%)</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>AI (70%)</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Overall Score</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Applied</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...candidates]
                  .sort((a, b) => computeWeighted(b).weighted - computeWeighted(a).weighted)
                  .map((candidate, idx) => {
                  const w = computeWeighted(candidate);
                  const overallScore = w.weighted; // 70% AI + 30% recruiter task avg
                  const simScore = parseFloat(candidate.simulation_overall_score) || 0;
                  const taskCount = parseInt(candidate.tasks_completed_count) || 0;
                  const totalTasks = parseInt(candidate.total_tasks_count) || 0;
                  const appliedDate = candidate.applied_at ? new Date(candidate.applied_at).toLocaleDateString() : 'N/A';
                  
                  return (
                    <tr key={candidate.candidate_id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(candidate.application_id)}
                          onChange={() => toggleSelect(candidate.application_id)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {idx < 3 ? (
                          getRankIcon(idx + 1)
                        ) : (
                          <span style={{
                            width: 28, height: 28, borderRadius: 14, display: 'inline-block',
                            background: '#f1f5f9', lineHeight: '28px', textAlign: 'center',
                            fontSize: 13, fontWeight: 600, color: '#64748b'
                          }}>
                            {idx + 1}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setSelectedCandidate(candidate)} title="View candidate details">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${getScoreColor(overallScore)}30, ${getScoreColor(overallScore)}15)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 600, fontSize: 16, color: getScoreColor(overallScore)
                          }}>
                            {candidate.first_name?.[0] || candidate.candidate_name?.[0] || 'C'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {candidate.candidate_name || `${candidate.first_name} ${candidate.last_name}`}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{candidate.candidate_email}</div>
                            {candidate.headline && (
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{candidate.headline}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                          {candidate.task_progress && candidate.task_progress.map((task: any, i: number) => (
                            <div
                              key={i}
                              title={`Task ${i + 1}: ${task.score || 0}% - ${task.status}`}
                              style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: task.status === 'completed' ? getScoreColor(task.score || 0) : '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 600,
                                color: task.status === 'completed' ? '#fff' : '#94a3b8'
                              }}
                            >
                              {task.score ? Math.round(task.score) : i + 1}
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 4, color: '#64748b' }}>
                          {taskCount}/{totalTasks} Tasks
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: getScoreColor(w.recruiterAvg) }}>
                          {w.recruiterAvg.toFixed(2)}%
                          {w.scoredCount < w.totalTasks && (
                            <span style={{ fontWeight: 500, color: '#f59e0b' }}> · {w.scoredCount}/{w.totalTasks} scored</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: getScoreColor(w.recruiterAvg) }}>
                          {(w.recruiterAvg * 0.30).toFixed(1)}
                        </span>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{Math.round(w.recruiterAvg)}% × 30%</div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {candidate.simulation_status === 'completed' ? (
                          <div>
                            <span style={{
                              fontSize: 20, fontWeight: 600, color: getScoreColor(simScore)
                            }}>
                              {Math.round(simScore)}%
                            </span>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              {taskCount}/{totalTasks} tasks
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>Not started</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: getScoreColor(w.aiScore) }}>
                          {(w.aiScore * 0.70).toFixed(1)}
                        </span>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{Math.round(w.aiScore)}% × 70%</div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div>
                          <span style={{
                            fontSize: 28, fontWeight: 700, color: getScoreColor(overallScore)
                          }}>
                            {Math.round(overallScore)}%
                          </span>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            {getScoreLabel(overallScore)}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            70% AI · 30% Recruiter
                            {w.scoredCount < w.totalTasks && (
                              <span style={{ color: '#f59e0b' }}> · {w.scoredCount}/{w.totalTasks} scored</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                        {appliedDate}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                          fontSize: 11, fontWeight: 500,
                          background: candidate.application_status === 'hired' ? '#dcfce7' :
                                     candidate.application_status === 'under_review' ? '#fff3e3' :
                                     candidate.application_status === 'shortlisted' ? '#e0e7ff' :
                                     candidate.application_status === 'interview' ? '#fef3c7' :
                                     candidate.application_status === 'offer' ? '#dcfce7' :
                                     candidate.application_status === 'rejected' ? '#fee2e2' : '#f1f5f9',
                          color: candidate.application_status === 'hired' ? '#15803d' :
                                 candidate.application_status === 'under_review' ? '#b45309' :
                                 candidate.application_status === 'shortlisted' ? '#4338ca' :
                                 candidate.application_status === 'interview' ? '#92400e' :
                                 candidate.application_status === 'offer' ? '#15803d' :
                                 candidate.application_status === 'rejected' ? '#b91c1c' : '#475569'
                        }}>
                          {candidate.application_status === 'under_review' ? 'Review' :
                           candidate.application_status === 'shortlisted' ? 'Shortlisted' :
                           candidate.application_status === 'interview' ? 'Interview' :
                           candidate.application_status === 'offer' ? 'Offer' :
                           candidate.application_status === 'hired' ? 'Hired' :
                           candidate.application_status === 'rejected' ? 'Rejected' :
                           candidate.application_status || 'Applied'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedCandidate(candidate)}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
                            background: '#fff', fontSize: 12, cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <Eye size={14} /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Candidate Detail Modal */}
      {selectedCandidate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }} onClick={() => setSelectedCandidate(null)}>
          <div style={{
            background: '#fff', borderRadius: 24, width: '90%', maxWidth: 700,
            maxHeight: '85vh', overflow: 'auto', padding: 0,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }} onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '24px 24px 0 0'
            }}>
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: 20 }}>Candidate Details</h3>
                <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                  Practical Assessment Performance & Analysis
                </p>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff'
                }}
              >
                <XCircle size={20} />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {/* Candidate Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${getScoreColor(parseFloat(selectedCandidate.candidate_overall_score))}40, ${getScoreColor(parseFloat(selectedCandidate.candidate_overall_score))}20)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32, fontWeight: 700, color: getScoreColor(parseFloat(selectedCandidate.candidate_overall_score))
                }}>
                  {selectedCandidate.first_name?.[0] || selectedCandidate.candidate_name?.[0] || 'C'}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
                    {selectedCandidate.candidate_name || `${selectedCandidate.first_name} ${selectedCandidate.last_name}`}
                  </h4>
                  <p style={{ margin: '4px 0 0', color: '#64748b' }}>{selectedCandidate.candidate_email}</p>
                  {selectedCandidate.headline && (
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569' }}>{selectedCandidate.headline}</p>
                  )}
                  {selectedCandidate.summary && (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>{selectedCandidate.summary.substring(0, 150)}...</p>
                  )}
                </div>
              </div>

              {/* Score Cards */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
                marginBottom: 24
              }}>
                <div style={{ textAlign: 'center', padding: 16, background: '#f8fafc', borderRadius: 16 }}>
                  <Star size={20} color="#fbbf24" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 28, fontWeight: 700, color: getScoreColor(computeWeighted(selectedCandidate).weighted) }}>
                    {Math.round(computeWeighted(selectedCandidate).weighted)}%
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Overall Score</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>70% AI · 30% Recruiter</div>
                </div>
                <div style={{ textAlign: 'center', padding: 16, background: '#f8fafc', borderRadius: 16 }}>
                  <Target size={20} color="#8b5cf6" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 28, fontWeight: 700, color: getScoreColor(parseFloat(selectedCandidate.simulation_overall_score)) }}>
                    {Math.round(parseFloat(selectedCandidate.simulation_overall_score))}%
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Practical Assessment Score</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {selectedCandidate.tasks_completed_count}/{selectedCandidate.total_tasks_count} tasks
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: 16, background: '#f8fafc', borderRadius: 16 }}>
                  <Activity size={20} color="#22c55e" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 28, fontWeight: 700, color: getScoreColor(parseFloat(selectedCandidate.candidate_completion_rate)) }}>
                    {Math.round(parseFloat(selectedCandidate.candidate_completion_rate))}%
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Completion Rate</div>
                </div>
              </div>

              {/* Send this candidate their results — pass/fail decision is saved and emailed */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Current decision: <strong style={{ color: selectedCandidate.application_status === 'hired' ? '#16a34a' : selectedCandidate.application_status === 'rejected' ? '#dc2626' : '#475569' }}>
                    {selectedCandidate.application_status === 'hired' ? 'Passed (hired)' : selectedCandidate.application_status === 'rejected' ? 'Failed (rejected)' : (selectedCandidate.application_status || '—')}
                  </strong> — you can change or resend.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => sendResultsForOne(selectedCandidate, true)}
                    disabled={sending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, color: '#fff', background: '#16a34a' }}
                  >
                    <Award size={16} /> {sending ? 'Sending…' : 'Pass & Email'}
                  </button>
                  <button
                    onClick={() => sendResultsForOne(selectedCandidate, false)}
                    disabled={sending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, color: '#fff', background: '#dc2626' }}
                  >
                    {sending ? 'Sending…' : 'Fail & Email'}
                  </button>
                </div>
              </div>

              {/* How the score is calculated */}
              <div style={{ marginBottom: 24, padding: 16, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12 }}>
                <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#5b21b6' }}>
                  <Brain size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  How this score is calculated
                </h5>
                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px', lineHeight: 1.6 }}>
                  The <strong>Practical Assessment</strong> score is generated automatically by AI when the candidate <strong>submits</strong> the practical assessment — a weighted blend of code/answer <strong>Quality</strong>, <strong>Speed</strong> (time efficiency), <strong>Behavioral</strong> competencies (communication, problem-solving, punctuality…) and <strong>GitHub</strong> practices.
                </p>
                <p style={{ fontSize: 13, color: '#475569', margin: '0 0 8px', lineHeight: 1.6 }}>
                  The <strong>Overall</strong> combines that AI score with the recruiter's task evaluation:
                </p>
                {(() => {
                  const w = computeWeighted(selectedCandidate);
                  return (
                    <div style={{ fontSize: 13, color: '#0f172a', background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                      AI Practical Assessment <strong>{Math.round(w.aiScore)}%</strong> × 70% = <strong>{(w.aiScore * 0.7).toFixed(1)}</strong>
                      &nbsp;+&nbsp;
                      Recruiter Tasks <strong>{Math.round(w.recruiterAvg)}%</strong> × 30% = <strong>{(w.recruiterAvg * 0.3).toFixed(1)}</strong>
                      &nbsp;=&nbsp;
                      <strong style={{ color: getScoreColor(w.weighted) }}>{Math.round(w.weighted)}%</strong>
                    </div>
                  );
                })()}

                <button
                  onClick={() => setShowCalc((s) => !s)}
                  style={{ marginTop: 10, background: 'none', border: 'none', color: '#7c3aed', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {showCalc ? '▲ Hide full calculation' : '▼ Show full calculation'}
                </button>

                {showCalc && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 0 — Trigger:</strong> When the candidate <strong>submits</strong> the session, the AI evaluation runs over their task progress, chat, time data and GitHub repo.
                    </p>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 1 — Each task (0–100):</strong> four sub-scores per task — <em>completion</em> (100 done / partial / 0), <em>time</em> (taken vs limit), <em>quality</em> (code/essay quality), <em>answer-quality</em> (code ≤50 + essay ≤50 + completeness ≤30, normalized).<br />
                      <span style={{ fontFamily: 'monospace' }}>Task overall = (completion + time + quality + answer-quality) ÷ 4</span>
                    </p>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 2 — Aggregate task metrics:</strong><br />
                      <span style={{ fontFamily: 'monospace' }}>completionRate = completed ÷ total × 100</span><br />
                      <span style={{ fontFamily: 'monospace' }}>averageTaskScore = Σ(task overall) ÷ total</span><br />
                      <span style={{ fontFamily: 'monospace' }}>overallTaskPercentage = pointsEarned ÷ (total×100) × 100</span>
                    </p>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 3 — Competency scores (0–100):</strong>
                      <br />• <strong>Punctuality</strong> — weighted on-time + partial credit across tasks ÷ total weight.
                      <br />• <strong>Speed</strong> — time-efficiency, weighted across tasks (fast within limit → high).
                      <br />• <strong>Technical</strong> — average quality of the technical tasks (default 50 if none).
                      <br />• <strong>Adaptability</strong> — base − abandonment penalty + creativity bonus (clamped 0–100).
                      <br />• <strong>Communication</strong> — from chat analysis.
                      <br />• <strong>Collaboration</strong> — volume (msgs) + balance (msg ratio × 30) + responsiveness (≤30), capped 100.
                      <br />• <strong>GitHub</strong> — repo analysis (commits, structure, practices).
                    </p>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 4 — Composites:</strong><br />
                      <span style={{ fontFamily: 'monospace' }}>Quality = (Technical + Punctuality + Adaptability) ÷ 3</span><br />
                      <span style={{ fontFamily: 'monospace' }}>Behavioral = (Adaptability + Communication) ÷ 2</span>
                    </p>
                    <div style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 5 — AI Practical Assessment Overall</strong> (weights from the rubric; defaults):
                      <table style={{ borderCollapse: 'collapse', margin: '4px 0', fontSize: 12 }}>
                        <tbody>
                          <tr><td style={{ padding: '1px 16px 1px 0' }}>Quality</td><td><strong>0.60</strong></td></tr>
                          <tr><td style={{ padding: '1px 16px 1px 0' }}>Speed</td><td><strong>0.15</strong></td></tr>
                          <tr><td style={{ padding: '1px 16px 1px 0' }}>Behavioral</td><td><strong>0.10</strong></td></tr>
                          <tr><td style={{ padding: '1px 16px 1px 0' }}>GitHub</td><td><strong>0.15</strong></td></tr>
                        </tbody>
                      </table>
                      <span style={{ fontFamily: 'monospace' }}>AI Overall = Quality×0.60 + Speed×0.15 + Behavioral×0.10 + GitHub×0.15</span>
                      <div style={{ marginTop: 2 }}>This is the <strong>Practical Assessment Score</strong> column.</div>
                    </div>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 6 — Pass / Fail:</strong> passed = AI Overall ≥ passingScore (rubric's passingScore, default 70).
                    </p>
                    <div style={{ margin: '0 0 6px', padding: 8, background: '#fff', borderRadius: 8, border: '1px solid #ddd6fe' }}>
                      <strong style={{ color: '#7c3aed' }}>How the recruiter marks tasks (the 30%):</strong>
                      <br />• The recruiter reviews each <strong>submitted task</strong> only — not the AI competencies.
                      <br />• Each task gets a score from <strong>0–100%</strong> plus an optional comment (saved per task).
                      <br />• The system <strong>auto-averages</strong> all task scores — a task left unscored counts as <strong>0</strong>.
                      <br /><span style={{ fontFamily: 'monospace' }}>Recruiter Task Avg = Σ(task scores) ÷ total tasks</span>
                      <br />• That average is the recruiter's contribution; the AI provides the other 70%. The recruiter always has the final decision.
                    </div>
                    <p style={{ margin: '0 0 6px' }}>
                      <strong style={{ color: '#7c3aed' }}>Step 7 — Final platform Overall (the table):</strong><br />
                      <span style={{ fontFamily: 'monospace' }}>Final = AI Practical Assessment × 70% + Recruiter Task Avg × 30%</span> — recruiter avg = Σ(per-task recruiter scores) ÷ total (unscored = 0).
                    </p>
                    <div style={{ margin: '6px 0', padding: 8, background: '#fff', borderRadius: 8 }}>
                      <strong>Worked example</strong> — Quality 85, Speed 70, Behavioral 60, GitHub 50:<br />
                      AI = 85×.60 + 70×.15 + 60×.10 + 50×.15 = 51 + 10.5 + 6 + 7.5 = <strong>75%</strong><br />
                      Recruiter avg 80% → 80×.30 = <strong>24</strong> · AI 75×.70 = <strong>52.5</strong> → Final = <strong>76.5%</strong>
                    </div>
                    <div style={{ marginTop: 8, padding: 10, background: '#fff', borderRadius: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>This candidate's competency scores (AI):</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                        <span>Punctuality: <strong>{Math.round(parseFloat(selectedCandidate.punctuality_score) || 0)}%</strong></span>
                        <span>Communication: <strong>{Math.round(parseFloat(selectedCandidate.communication_score) || 0)}%</strong></span>
                        <span>Problem Solving: <strong>{Math.round(parseFloat(selectedCandidate.problem_solving_score) || 0)}%</strong></span>
                        <span>Adaptability: <strong>{Math.round(parseFloat(selectedCandidate.adaptability_score) || 0)}%</strong></span>
                        <span>Collaboration: <strong>{Math.round(parseFloat(selectedCandidate.collaboration_score) || 0)}%</strong></span>
                        <span>Initiative: <strong>{Math.round(parseFloat(selectedCandidate.initiative_score) || 0)}%</strong></span>
                      </div>
                    </div>

                    {/* AI score composition (Quality/Speed/Behavioral/GitHub) — read from the
                        stored evaluation result if present; reuses submission_results, no new data. */}
                    {(() => {
                      const sr = selectedCandidate.submission_results || {};
                      const wb = sr.weighted_breakdown || sr.weightedScores || (sr.scores && sr.scores.weighted_breakdown) || null;
                      const comps = [
                        { key: 'quality', label: 'Quality' },
                        { key: 'speed', label: 'Speed' },
                        { key: 'behavioral', label: 'Behavioral' },
                        { key: 'github', label: 'GitHub' },
                      ];
                      const rows = wb ? comps.filter((c) => wb[c.key]) : [];
                      if (!rows.length) return null;
                      return (
                        <div style={{ marginTop: 8, padding: 10, background: '#fff', borderRadius: 8 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4, color: '#0f172a' }}>AI Practical Assessment composition:</div>
                          {rows.map((c) => (
                            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{c.label}</span>
                              <span><strong>{Math.round(Number(wb[c.key].score))}%</strong> × {wb[c.key].weight} = <strong>{wb[c.key].contribution}</strong></span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Sub-scores */}
              <div style={{ marginBottom: 24 }}>
                <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>
                  <PieChart size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  Performance Metrics
                </h5>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <Clock size={12} style={{ display: 'inline', marginRight: 4 }} /> Punctuality
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.punctuality_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.punctuality_score))}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <MessageSquare size={12} style={{ display: 'inline', marginRight: 4 }} /> Communication
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.communication_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.communication_score))}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <Code size={12} style={{ display: 'inline', marginRight: 4 }} /> Problem Solving
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.problem_solving_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.problem_solving_score))}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <Zap size={12} style={{ display: 'inline', marginRight: 4 }} /> Adaptability
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.adaptability_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.adaptability_score))}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <Heart size={12} style={{ display: 'inline', marginRight: 4 }} /> Collaboration
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.collaboration_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.collaboration_score))}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 12 }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>
                      <Zap size={12} style={{ display: 'inline', marginRight: 4 }} /> Initiative
                    </span>
                    <span style={{ fontWeight: 600, color: getScoreColor(parseFloat(selectedCandidate.initiative_score)) }}>
                      {Math.round(parseFloat(selectedCandidate.initiative_score))}%
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Feedback */}
              {selectedCandidate.ai_feedback && (
                <div style={{
                  padding: 16, background: '#fef3c7', borderRadius: 16,
                  marginBottom: 16, border: '1px solid #fde68a'
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#92400e' }}>
                    <Brain size={14} style={{ display: 'inline', marginRight: 6 }} /> AI Assessment
                  </div>
                  <p style={{ fontSize: 13, margin: 0, color: '#78350f', lineHeight: 1.5 }}>
                    {typeof selectedCandidate.ai_feedback.summary === 'string' 
                      ? selectedCandidate.ai_feedback.summary.replace(/"/g, '')
                      : 'AI feedback available'}
                  </p>
                  {selectedCandidate.ai_feedback.strengths && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#92400e', marginBottom: 4 }}>Strengths:</div>
                      <div style={{ fontSize: 12, color: '#78350f' }}>{selectedCandidate.ai_feedback.strengths}</div>
                    </div>
                  )}
                  {selectedCandidate.ai_feedback.recommendations && selectedCandidate.ai_feedback.recommendations.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#92400e', marginBottom: 4 }}>Recommendations:</div>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#78350f' }}>
                        {selectedCandidate.ai_feedback.recommendations.slice(0, 3).map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Behavioral Metrics */}
              {selectedCandidate.behavioral_metrics && selectedCandidate.behavioral_metrics.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>
                    <MessageSquare size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    Behavioral Metrics
                  </h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedCandidate.behavioral_metrics.map((metric: any, i: number) => (
                      <div key={i} style={{
                        padding: '8px 12px', background: '#f8fafc', borderRadius: 12,
                        flex: '1 1 auto', minWidth: 150
                      }}>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{metric.metric}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: getScoreColor(metric.score) }}>
                          {Math.round(metric.score)}%
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                          {typeof metric.description === 'string' 
                            ? metric.description.replace(/"/g, '').substring(0, 60)
                            : ''}...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Task Details */}
              {selectedCandidate.task_progress && selectedCandidate.task_progress.length > 0 && (
                <div>
                  <h5 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>
                    <CheckCircle size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    Task Performance
                  </h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {selectedCandidate.task_progress.map((task: any, i: number) => (
                      <div key={i} style={{
                        padding: 12, background: '#f8fafc', borderRadius: 12,
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>Task {i + 1}: {task.task_title}</span>
                          <span style={{
                            padding: '2px 8px', borderRadius: 12,
                            background: task.status === 'completed' ? '#dcfce7' : '#fef3c7',
                            fontSize: 11, fontWeight: 500,
                            color: task.status === 'completed' ? '#15803d' : '#92400e'
                          }}>
                            {task.status === 'completed' ? '✓ Completed' : task.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
                          <span>Score: <strong style={{ color: getScoreColor(task.score) }}>{task.score || 0}%</strong></span>
                          <span>Time: {task.time_spent_formatted || `${Math.floor(task.time_spent_seconds / 60)}m`}</span>
                        </div>
                        {task.feedback && (
                          <div style={{ fontSize: 12, color: '#475569', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
                            {task.feedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidatesResultsScreen;