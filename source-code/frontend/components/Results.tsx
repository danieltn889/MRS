import { useState, useEffect } from 'react';
import {
  TrendingUp, Award, Clock, Target, CheckCircle, XCircle, AlertCircle,
  BarChart3, Calendar, Download, Filter, ChevronDown, ChevronUp,
  Shield, ShieldCheck, ShieldAlert, Loader2, GitBranch, FileText, Cpu, History,
} from 'lucide-react';
import simulationAPI from '../services/simulationAPI';
import { verifyChain as verifyAuditChain } from '../services/blockchainAPI';

interface SimResult {
  id: string;
  sessionId: string;
  simulationId: string;
  simulationName: string;
  simulationType: string;
  difficulty: string;
  duration: number;          // minutes allowed
  status: string;            // completed / in_progress / not_started
  score?: number;
  startedAt?: string;
  completedAt?: string;
  timeSpent?: number;        // seconds
  companyName: string;
  jobTitle: string;
  applicationId?: string;
}

type VerifyState = 'idle' | 'loading' | 'verified' | 'failed';
interface VerifyHistoryItem {
  date: string;
  verifiedBy: string;
  result: 'verified' | 'failed';
  txId: string | null;
  sessionId: string;
}

const PASS_MARK = 70;
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleString() : '—');
const fmtDur = (secs?: number) => {
  if (!secs && secs !== 0) return '—';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
};

const Results = ({ onBack }: { onBack: () => void }) => {
  const [results, setResults] = useState<SimResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});
  const [verify, setVerify] = useState<Record<string, { state: VerifyState; report?: any }>>({});
  const [history, setHistory] = useState<VerifyHistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('verificationHistory') || '[]'); } catch { return []; }
  });

  const currentUserName = (() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'You';
    } catch { return 'You'; }
  })();

  useEffect(() => { loadResults(); }, []);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: any = await simulationAPI.getMySimulationSessions({ page: 1, limit: 100 });
      let list: any[] = [];
      if (response?.data?.data && Array.isArray(response.data.data)) list = response.data.data;
      else if (Array.isArray(response?.data)) list = response.data;
      else if (response?.data?.results && Array.isArray(response.data.results)) list = response.data.results;
      else if (Array.isArray(response)) list = response;

      const mapped: SimResult[] = list.map((item: any) => ({
        id: item.session_id || item.id,
        sessionId: item.session_id || item.id,
        simulationId: item.simulation_id,
        simulationName: item.simulation_name || 'Simulation',
        simulationType: item.simulation_type || 'technical',
        difficulty: item.difficulty || 'intermediate',
        duration: item.duration_minutes || 30,
        status: item.session_status || item.status || 'not_started',
        score: item.overall_score ?? item.session_score ?? item.score,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        timeSpent: item.time_spent,
        companyName: item.company_name || 'Company',
        jobTitle: item.job_title || 'Position',
        applicationId: item.application_id,
      }));
      // Only completed results have an assessment to display.
      setResults(mapped.filter((r) => r.status === 'completed'));
    } catch (e: any) {
      setError(e?.message || 'Failed to load your results');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const isPassed = (r: SimResult) => (r.score ?? 0) >= PASS_MARK;

  const toggleExpand = async (r: SimResult) => {
    const next = expandedId === r.id ? null : r.id;
    setExpandedId(next);
    if (next && !details[r.id] && !detailsLoading[r.id]) {
      setDetailsLoading((p) => ({ ...p, [r.id]: true }));
      try {
        const res: any = await simulationAPI.getSubmissionResults(r.sessionId);
        setDetails((p) => ({ ...p, [r.id]: res?.data || res || null }));
      } catch {
        setDetails((p) => ({ ...p, [r.id]: null }));
      } finally {
        setDetailsLoading((p) => ({ ...p, [r.id]: false }));
      }
    }
  };

  const handleVerify = async (r: SimResult) => {
    setVerify((p) => ({ ...p, [r.id]: { state: 'loading' } }));
    try {
      const report = await verifyAuditChain();
      const ok = !!report.valid;
      setVerify((p) => ({ ...p, [r.id]: { state: ok ? 'verified' : 'failed', report } }));
      const sub = details[r.id];
      const entry: VerifyHistoryItem = {
        date: new Date().toISOString(),
        verifiedBy: currentUserName,
        result: ok ? 'verified' : 'failed',
        txId: sub?.blockchain?.txHash || null,
        sessionId: r.sessionId,
      };
      const nextHistory = [entry, ...history].slice(0, 50);
      setHistory(nextHistory);
      try { localStorage.setItem('verificationHistory', JSON.stringify(nextHistory)); } catch { /* ignore */ }
    } catch {
      setVerify((p) => ({ ...p, [r.id]: { state: 'failed' } }));
    }
  };

  const downloadCertificate = (r: SimResult) => {
    const sub = details[r.id] || {};
    const v = verify[r.id];
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Verification Certificate</title>
<style>
@page { size: A4; margin: 18mm; }
body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#111}
.card{border:2px solid #7c3aed;border-radius:16px;padding:32px}
h1{color:#7c3aed;margin:0 0 4px} .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;font-size:14px}
.k{color:#6b7280} .badge{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:700;color:#fff;background:${v?.state === 'verified' ? '#16a34a' : '#9ca3af'}}
@media print { .hint { display:none } }
</style></head>
<body>
<p class="hint" style="text-align:center;color:#6b7280;font-size:13px">Choose <b>"Save as PDF"</b> as the destination in the print dialog.</p>
<div class="card">
<h1>Assessment Verification Certificate</h1>
<p style="color:#6b7280">This document attests that the assessment below is recorded and verifiable.</p>
<div class="row"><span class="k">Candidate</span><span>${currentUserName}</span></div>
<div class="row"><span class="k">Simulation</span><span>${r.simulationName}</span></div>
<div class="row"><span class="k">Final Score</span><span>${r.score ?? '—'}%</span></div>
<div class="row"><span class="k">Submission ID</span><span>${r.sessionId}</span></div>
<div class="row"><span class="k">Blockchain Tx</span><span>${sub?.blockchain?.txHash || '—'}</span></div>
<div class="row"><span class="k">Block hash</span><span>${sub?.blockchain?.blockHash || sub?.blockchain?.credentialHash || '—'}</span></div>
<div class="row"><span class="k">Verified at</span><span>${new Date().toLocaleString()}</span></div>
<div class="row"><span class="k">Status</span><span class="badge">${v?.state === 'verified' ? 'VERIFIED' : 'NOT VERIFIED'}</span></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`;
    // Open the certificate in a print window so the browser's print dialog can
    // "Save as PDF" (no extra dependency). Fall back to an HTML download if the
    // popup is blocked.
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      return;
    }
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `verification-certificate-${r.sessionId}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const filtered = results.filter((r) => filter === 'all' || (filter === 'passed' ? isPassed(r) : !isPassed(r)));
  const stats = {
    total: results.length,
    passed: results.filter(isPassed).length,
    failed: results.filter((r) => !isPassed(r)).length,
    averageScore: results.length ? Math.round(results.reduce((s, r) => s + (r.score ?? 0), 0) / results.length) : 0,
  };
  const scoreColor = (s: number) => (s >= 90 ? 'text-green-600' : s >= 80 ? 'text-blue-600' : s >= 70 ? 'text-yellow-600' : 'text-red-600');

  if (loading) {
    return <div className="p-6"><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Results</h1>
          <p className="text-gray-600">Simulation performance, evaluation details, and blockchain verification</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Back to Dashboard</button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <BarChart3 className="w-8 h-8 text-blue-600 mr-3" />, label: 'Total', val: stats.total, cls: 'text-gray-900' },
          { icon: <CheckCircle className="w-8 h-8 text-green-600 mr-3" />, label: 'Passed', val: stats.passed, cls: 'text-green-600' },
          { icon: <XCircle className="w-8 h-8 text-red-600 mr-3" />, label: 'Failed', val: stats.failed, cls: 'text-red-600' },
          { icon: <Award className="w-8 h-8 text-purple-600 mr-3" />, label: 'Average Score', val: `${stats.averageScore}%`, cls: scoreColor(stats.averageScore) },
        ].map((s, i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="flex items-center">{s.icon}<div><p className="text-sm text-gray-600">{s.label}</p><p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p></div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <Filter className="w-5 h-5 text-gray-500" />
        <div className="flex gap-2">
          {(['all', 'passed', 'failed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-sm capitalize ${filter === f ? (f === 'passed' ? 'bg-green-600 text-white' : f === 'failed' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'bg-gray-100 text-gray-600'}`}>
              {f} ({f === 'all' ? stats.total : f === 'passed' ? stats.passed : stats.failed})
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-4">
        {filtered.map((r) => {
          const sub = details[r.id];
          const v = verify[r.id] || { state: 'idle' as VerifyState };
          const expanded = expandedId === r.id;
          const passed = isPassed(r);
          const myHistory = history.filter((h) => h.sessionId === r.sessionId);
          return (
            <div key={r.id} className="bg-white rounded-lg shadow-sm border">
              {/* Summary row */}
              <div className="p-6 flex items-start justify-between cursor-pointer" onClick={() => toggleExpand(r)}>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900">{r.simulationName}</h3>
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${passed ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                      {passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-2">{r.companyName} · {r.jobTitle}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{fmtDate(r.completedAt)}</span>
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{fmtDur(r.timeSpent)}</span>
                    <span className="flex items-center gap-1"><Target className="w-4 h-4" />Score: <span className={`font-semibold ${scoreColor(r.score ?? 0)}`}>{r.score ?? 0}%</span></span>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-700 ml-3">{expanded ? <ChevronUp /> : <ChevronDown />}</button>
              </div>

              {/* Detail */}
              {expanded && (
                <div className="border-t border-gray-100 p-6 space-y-6 bg-gray-50/50">
                  {detailsLoading[r.id] ? (
                    <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading details…</div>
                  ) : (
                    <>
                      {/* Simulation Information */}
                      <Section title="Simulation Information" icon={<FileText className="w-4 h-4 text-blue-600" />}>
                        <Grid items={[
                          ['Title', r.simulationName],
                          ['Category', r.simulationType],
                          ['Difficulty', r.difficulty],
                          ['Position', r.jobTitle],
                          ['Recruiter', sub?.recruiter_name || '—'],
                          ['Mentor', sub?.mentor_name || '—'],
                          ['Start', fmtDate(r.startedAt)],
                          ['Submission', fmtDate(r.completedAt)],
                          ['Duration allowed', `${r.duration} min`],
                          ['Time spent', fmtDur(r.timeSpent)],
                          ['Time used', sub?.timeTracking?.timeUsedPercent != null ? `${sub.timeTracking.timeUsedPercent}%` : '—'],
                          ['Completion', sub?.summary?.completion_rate != null ? `${Math.round(sub.summary.completion_rate)}%` : '—'],
                        ]} />
                        {Array.isArray(sub?.taskAnalysis) && sub.taskAnalysis.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">Tasks ({sub.summary?.completed_tasks ?? '—'}/{sub.summary?.total_tasks ?? sub.taskAnalysis.length})</p>
                            <div className="space-y-1.5">
                              {sub.taskAnalysis.map((t: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-sm bg-white border border-gray-200 rounded px-3 py-1.5">
                                  <span className="text-gray-700 truncate">{t.task_name || t.title || `Task ${t.task_index ?? i}`}</span>
                                  <span className="text-gray-500">{t.status || '—'} · {t.score != null ? `${Math.round(t.score)}%` : '—'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Section>

                      {/* Submission Information */}
                      <Section title="Submission Information" icon={<GitBranch className="w-4 h-4 text-purple-600" />}>
                        <Grid items={[
                          ['Submission ID', r.sessionId],
                          ['Status', 'Submitted'],
                          ['Submitted at', fmtDate(sub?.submittedAt || r.completedAt)],
                          ['Repository', sub?.githubAnalysis?.repo_info?.repoUrl || '—'],
                          ['Branch', sub?.githubAnalysis?.repo_info?.branchName || '—'],
                          ['Confirmation email', sub?.emailSent ? 'Sent' : '—'],
                        ]} />
                      </Section>

                      {/* Evaluation Information */}
                      <Section title="Evaluation Information" icon={<Cpu className="w-4 h-4 text-emerald-600" />}>
                        <Grid items={[
                          ['Evaluation ID', sub?.simulationRecordId || '—'],
                          ['Evaluation date', fmtDate(sub?.submittedAt || r.completedAt)],
                          ['Status', sub ? 'Completed' : '—'],
                          ['Passing score', `${sub?.passingScore ?? PASS_MARK}%`],
                        ]} />
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            ['Submission received', !!sub],
                            ['GitHub analyzed', !!sub?.githubAnalysis?.has_repo],
                            ['Source code analyzed', !!sub?.scoreBreakdown],
                            ['AI evaluation completed', !!sub?.feedback],
                            ['Final score generated', sub?.score != null],
                            ['Blockchain record created', !!sub?.blockchain],
                          ].map(([label, done], i) => (
                            <span key={i} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${done ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              {done ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />} {label as string}
                            </span>
                          ))}
                        </div>
                      </Section>

                      {/* Result Verification */}
                      <Section title="Result Verification" icon={<Shield className="w-4 h-4 text-indigo-600" />}>
                        <p className="text-sm text-gray-600 mb-3">
                          This platform records assessments on a tamper-evident blockchain audit chain. Use the button below to verify that the
                          results have not been modified since they were recorded.
                        </p>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => handleVerify(r)} disabled={v.state === 'loading'}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                            {v.state === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            {v.state === 'loading' ? 'Verifying…' : 'Verify Results'}
                          </button>
                          <button onClick={() => downloadCertificate(r)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                            <Download className="w-4 h-4" /> Download Certificate (PDF)
                          </button>
                        </div>

                        {v.state === 'verified' && (
                          <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-start gap-2">
                            <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                            <span><strong>🟢 Verified.</strong> This assessment has been successfully verified. The evaluation results have not been modified since they were recorded on the blockchain. ({v.report?.verifiedCount}/{v.report?.totalBlocks} blocks)</span>
                          </div>
                        )}
                        {v.state === 'failed' && (
                          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
                            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                            <span><strong>🔴 Verification Failed.</strong> The current assessment data does not match the blockchain record. This may indicate that the data has been modified after evaluation.</span>
                          </div>
                        )}

                        {/* Verified data + blockchain record */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">Verified data (protected by blockchain)</p>
                            <Grid small items={[
                              ['Candidate ID', sub?.candidateId || '—'],
                              ['Simulation ID', r.simulationId || '—'],
                              ['Overall score', sub?.score != null ? `${sub.score}%` : `${r.score ?? '—'}%`],
                              ['Technical', sub?.scoreBreakdown?.technical != null ? `${sub.scoreBreakdown.technical}%` : '—'],
                              ['Communication', sub?.scoreBreakdown?.communication != null ? `${sub.scoreBreakdown.communication}%` : '—'],
                              ['GitHub', sub?.scoreBreakdown?.github != null ? `${sub.scoreBreakdown.github}%` : '—'],
                              ['Recommendation', sub?.hiringRecommendation?.label || sub?.feedback?.hiring_recommendation?.label || '—'],
                              ['Submitted', fmtDate(sub?.submittedAt || r.completedAt)],
                            ]} />
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">Blockchain record</p>
                            <Grid small items={[
                              ['Integrity', v.state === 'verified' ? 'Valid' : v.state === 'failed' ? 'Invalid' : 'Not checked'],
                              ['Transaction ID', sub?.blockchain?.txHash || '—'],
                              ['Block number', sub?.blockchain?.blockNumber != null ? String(sub.blockchain.blockNumber) : '—'],
                              ['Block hash', sub?.blockchain?.blockHash || '—'],
                              ['Credential hash', sub?.blockchain?.credentialHash || '—'],
                              ['Verified at', v.state !== 'idle' && v.state !== 'loading' ? new Date().toLocaleString() : '—'],
                            ]} />
                          </div>
                        </div>

                        {/* Verification history */}
                        {myHistory.length > 0 && (
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><History className="w-3.5 h-3.5" /> Verification history</p>
                            <div className="space-y-1.5">
                              {myHistory.map((h, i) => (
                                <div key={i} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                                  <span className="text-gray-600">{new Date(h.date).toLocaleString()} · {h.verifiedBy}</span>
                                  <span className={h.result === 'verified' ? 'text-green-600' : 'text-red-600'}>
                                    {h.result === 'verified' ? '🟢 Verified' : '🔴 Failed'}{h.txId ? ` · ${h.txId.slice(0, 10)}…` : ''}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Section>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">Complete a simulation to see your assessment and verification here.</p>
        </div>
      )}
    </div>
  );
};

// ── small presentational helpers ──────────────────────────────────────────────
const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4">
    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">{icon} {title}</h4>
    {children}
  </div>
);

const Grid = ({ items, small }: { items: Array<[string, any]>; small?: boolean }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 ${small ? '' : 'lg:grid-cols-3'} gap-x-6 gap-y-2`}>
    {items.map(([k, val], i) => (
      <div key={i} className="flex justify-between gap-3 border-b border-gray-50 py-1">
        <span className="text-xs text-gray-400">{k}</span>
        <span className="text-xs text-gray-800 text-right break-all max-w-[60%]">{val ?? '—'}</span>
      </div>
    ))}
  </div>
);

export default Results;
