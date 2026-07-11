import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Download, Clock, Award, CheckCircle, XCircle,
  Link as LinkIcon, User, Briefcase, Building, Target,
  Activity, Star, AlertTriangle, Brain,
  List, CheckSquare, Play, Lock, Terminal, GitBranch,
  ChevronDown, ChevronUp, Copy, ExternalLink,
  Save, Edit, Check, X, Trophy,
  FolderOpen, FileCode, Loader, Edit2, PlusCircle, Award as AwardIcon,
  BarChart2, Percent, Database, MessageSquare, TrendingUp, Settings, BarChart,
  Printer, Shield, ShieldCheck, ShieldAlert
} from 'lucide-react';
import simulationAPI from '../services/simulationAPI';
import { verifyChain as verifyAuditChain, browseChain, verifyBlock } from '../services/blockchainAPI';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskProgressItem {
  id: string | null;
  task_index: number;
  task_id: string;
  task_title: string;
  task_description: string;
  task_duration: number;
  task_type: string;
  status: string;
  score: number | null;
  feedback: string | null;
  answer: any;
  github_commit_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  time_spent: number;
  code_submission: any;
  template_task: any;
}

interface SessionReportProps {
  sessionId?: string;
  onBack?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (s: number) =>
  s >= 80 ? '#16a34a': s >= 60 ? '#d97706': '#dc2626';

const scoreBg = (s: number) =>
  s >= 80 ? '#f0fdf4': s >= 60 ? '#fffbeb': '#fef2f2';

const scoreBorder = (s: number) =>
  s >= 80 ? '#bbf7d0': s >= 60 ? '#fde68a': '#fecaca';

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString() : 'N/A';

const formatTime = (s?: number | null) => {
  if (!s) return 'N/A';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const statusIcon = (status: string, started_at?: string | null) => {
  if (status === 'completed') return <CheckCircle size={15} style={{ color: '#16a34a'}} />;
  if (status === 'in_progress'&& !started_at) return <Lock size={15} style={{ color: '#9ca3af'}} />;
  if (status === 'in_progress') return <Play size={15} style={{ color: '#2563eb'}} />;
  return <Lock size={15} style={{ color: '#9ca3af'}} />;
};

const taskBg = (status: string, started_at?: string | null) => {
  if (status === 'completed') return { background: '#f0fdf4', borderColor: '#bbf7d0'};
  if (status === 'in_progress'&& !started_at) return { background: '#f9fafb', borderColor: '#e5e7eb'};
  if (status === 'in_progress') return { background: '#eff6ff', borderColor: '#bfdbfe'};
  return { background: '#f9fafb', borderColor: '#e5e7eb'};
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

const ScoreRing: React.FC<{ score: number; size?: number; stroke?: number }> = ({
  score, size = 64, stroke = 6
}) => {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)'}}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease'}}
      />
    </svg>
  );
};

// ─── Score Modal ──────────────────────────────────────────────────────────────

const ScoreModal: React.FC<{
  task: TaskProgressItem;
  saving: boolean;
  onSave: (score: number) => void;
  onClose: () => void;
}> = ({ task, saving, onSave, onClose }) => {
  const [local, setLocal] = useState<number>(task.score !== null ? Math.round(task.score) : 70);
  const grades = [
    { label: 'Poor', min: 0, max: 40, color: '#dc2626'},
    { label: 'Fair', min: 40, max: 60, color: '#d97706'},
    { label: 'Good', min: 60, max: 80, color: '#2563eb'},
    { label: 'Excellent', min: 80, max: 100, color: '#16a34a'},
  ];
  const currentGrade = grades.find(g => local >= g.min && local < g.max) || grades[3];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 420,
        maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#111827'}}>Set Score   Task {task.task_index}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{task.task_title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af'}}><X size={20} /></button>
        </div>

        <div style={{ textAlign: 'center', margin: '20px 0'}}>
          <div style={{ position: 'relative', display: 'inline-block'}}>
            <ScoreRing score={local} size={100} stroke={8} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
              <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(local) }}>{local}</div>
              <div style={{ fontSize: 10, color: '#6b7280'}}>/ 100</div>
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 12px', borderRadius: 20, background: scoreBg(local), color: scoreColor(local), fontWeight: 600, fontSize: 13 }}>
            {currentGrade.label}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input type="range" min={0} max={100} step={5} value={local} onChange={e => setLocal(Number(e.target.value))} style={{ width: '100%', accentColor: scoreColor(local) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af'}}><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[{ label: 'Poor', val: 20 }, { label: 'Fair', val: 50 }, { label: 'Good', val: 70 }, { label: 'Excellent', val: 90 }].map(g => (
            <button key={g.label} onClick={() => setLocal(g.val)} style={{
              flex: 1, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${local === g.val ? scoreColor(g.val) : '#e5e7eb'}`,
              background: local === g.val ? scoreBg(g.val) : '#fff',
              color: local === g.val ? scoreColor(g.val) : '#6b7280',
              fontSize: 12, fontWeight: 600
            }}>{g.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: '#374151', flexShrink: 0 }}>Exact score:</span>
          <input type="number" min={0} max={100} value={local} onChange={e => setLocal(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} style={{ width: 80, padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 16, fontWeight: 700, color: scoreColor(local), textAlign: 'center'}} />
          <span style={{ fontSize: 13, color: '#9ca3af'}}>%</span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onSave(local)} disabled={saving} style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: saving ? 'not-allowed': 'pointer', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite'}} /> : <Save size={15} />}{saving ? 'Saving…': 'Save Score'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, cursor: 'pointer', background: '#f3f4f6', color: '#374151', border: 'none', fontWeight: 600 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ─── Code Block ───────────────────────────────────────────────────────────────

const CodeBlock: React.FC<{ code: string; language: string; onCopy: () => void }> = ({ code, language, onCopy }) => (
  <div style={{ borderRadius: 10, overflow: 'hidden', marginTop: 12 }}>
    <div style={{ background: '#1e293b', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Terminal size={12} style={{ color: '#34d399'}} />
        <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace'}}>{language || 'javascript'}</span>
      </div>
      <button onClick={onCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><Copy size={11} /> Copy</button>
    </div>
    <pre style={{ background: '#0f172a', padding: 14, margin: 0, overflowX: 'auto', maxHeight: 320, overflowY: 'auto', fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 1.6 }}>
      <code>{code.split('\n').slice(0, 40).join('\n')}{code.split('\n').length > 40 ? '\n\n// … truncated': ''}</code>
    </pre>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const SessionReport: React.FC<SessionReportProps> = ({ sessionId: propSessionId, onBack }) => {
  const navigate = useNavigate();
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
  const sessionId = propSessionId || paramSessionId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [submissionResults, setSubmissionResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<TaskProgressItem[]>([]);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<number | null>(null);
  const [tempFeedback, setTempFeedback] = useState('');
  const [showScoreModal, setShowScoreModal] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'report'| 'submission'>('report');
  const [chainReport, setChainReport] = useState<{ valid: boolean; totalBlocks: number; verifiedCount: number; failedCount: number } | null>(null);
  const [chainVerifying, setChainVerifying] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [auditBlocks, setAuditBlocks] = useState<any[]>([]);
  const [blockVerifications, setBlockVerifications] = useState<Record<string, { valid: boolean; reasons: string[] }>>({});
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState<'cancel'| 'reset'| 'reopen'| null>(null);
  const [adminConfirm, setAdminConfirm] = useState<'cancel'| 'reset'| 'reopen'| null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
  const authToken = () => localStorage.getItem('authToken') || '';

  const handleAdminCancel = async () => {
    const recordId = sessionData?.session?.id || sessionId;
    if (!recordId) return;
    setAdminActionLoading('cancel');
    try {
      const res = await fetch(`${apiBase}/simulations/sessions/${recordId}/admin-cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({ reason: cancelReason || 'Cancelled by recruiter/admin'}),
      });
      if (!res.ok) throw new Error('Failed to cancel');
      showToast('Session cancelled successfully');
      setAdminConfirm(null);
      fetchSession();
    } catch (e: any) {
      showToast('Failed to cancel session: '+ (e?.message || 'Unknown error'), false);
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleAdminReset = async () => {
    const recordId = sessionData?.session?.id || sessionId;
    if (!recordId) return;
    setAdminActionLoading('reset');
    try {
      const res = await fetch(`${apiBase}/simulations/sessions/${recordId}/admin-reset`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error('Failed to reset');
      showToast('Session reset   candidate can redo from scratch');
      setAdminConfirm(null);
      fetchSession();
    } catch (e: any) {
      showToast('Failed to reset session: '+ (e?.message || 'Unknown error'), false);
    } finally {
      setAdminActionLoading(null);
    }
  };

  const handleAdminReopen = async () => {
    const recordId = sessionData?.session?.id || sessionId;
    if (!recordId) return;
    setAdminActionLoading('reopen');
    try {
      const res = await fetch(`${apiBase}/simulations/sessions/${recordId}/admin-reopen`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
      });
      if (!res.ok) throw new Error('Failed to reopen');
      showToast('Session reopened   candidate can continue from where they left off');
      setAdminConfirm(null);
      fetchSession();
    } catch (e: any) {
      showToast('Failed to reopen session: '+ (e?.message || 'Unknown error'), false);
    } finally {
      setAdminActionLoading(null);
    }
  };

  const verifyResultsOnChain = async () => {
    setChainVerifying(true);
    setChainError(null);
    try {
      const report = await verifyAuditChain();
      setChainReport(report);
      // Also verify each individual block in this session
      const verifs: Record<string, { valid: boolean; reasons: string[] }> = {};
      await Promise.all(auditBlocks.map(async (b) => {
        try {
          const r = await verifyBlock(b.id);
          verifs[b.id] = { valid: r.valid, reasons: r.reasons || [] };
        } catch { verifs[b.id] = { valid: false, reasons: ['Verification request failed'] }; }
      }));
      setBlockVerifications(verifs);
    } catch (e: any) {
      setChainError(e?.message || 'Verification failed');
    } finally {
      setChainVerifying(false);
    }
  };

  const loadAuditBlocks = async (simId: string) => {
    setLoadingBlocks(true);
    try {
      const result = await browseChain({ simulationId: simId, limit: 20 });
      setAuditBlocks(result.blocks || []);
    } catch { /* ignore */ } finally {
      setLoadingBlocks(false);
    }
  };

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const canGrade = (() => {
    if (!currentUser) return false;
    const t = currentUser.user_type || currentUser.role || currentUser.type || '';
    return ['recruiter', 'company_admin', 'Company Admin', 'admin', 'system_admin'].includes(t);
  })();

  useEffect(() => {
    if (sessionId) {
      fetchSession();
    } else {
      setError('No session ID provided');
      setLoading(false);
    }
  }, [sessionId]);

  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const response = await simulationAPI.getSessionById(sessionId);
      const data = response?.data || response;
      setSessionData(data);

      if (data?.task_progress) setTaskProgress(data.task_progress);

      // Load audit chain blocks for this session's simulation
      const simId = data?.session?.simulation_id;
      if (simId) loadAuditBlocks(simId);

      // Extract submission_results from the session data
      if (data?.submission_results) {
        console.log('Submission results found in session data');
        setSubmissionResults(data.submission_results);
      } else {
        // Try to fetch from separate endpoint as fallback
        try {
          const subResponse = await simulationAPI.getSubmissionResults(sessionId);
          const subData = subResponse?.data || subResponse;
          if (subData && subData.hasResults !== false) {
            setSubmissionResults(subData);
          }
        } catch (subErr) {
          console.log('No separate submission results endpoint available');
        }
      }

      setError(null);
    } catch (e: any) {
      console.error('Error fetching session:', e);
      setError(e?.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveScore = async (taskIndex: number, score: number) => {
    const task = taskProgress.find(t => t.task_index === taskIndex);
    if (!task) return;
    try {
      setSaving(true);
      const sessionRecordId = sessionData?.session?.id || sessionId;
      if (sessionRecordId && simulationAPI.updateTaskScore) {
        await simulationAPI.updateTaskScore(sessionRecordId, taskIndex, score);
      }
      setTaskProgress(prev => prev.map(t => t.task_index === taskIndex ? { ...t, score } : t));
      setShowScoreModal(null);
      showToast(`✓ Score ${score}% saved for Task ${taskIndex}`);
    } catch (e: any) {
      showToast(`✗ Failed to save score: ${e?.message || 'Unknown error'}`, false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFeedback = async (taskIndex: number) => {
    const task = taskProgress.find(t => t.task_index === taskIndex);
    if (!task) return;
    try {
      setSaving(true);
      const sessionRecordId = sessionData?.session?.id || sessionId;
      const token = localStorage.getItem('authToken');
      const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
      if (sessionRecordId) {
        await fetch(`${apiBase}/simulations/sessions/${sessionRecordId}/tasks/${taskIndex}/feedback`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : ''},
          body: JSON.stringify({ feedback: tempFeedback }),
        });
      }
      setTaskProgress(prev => prev.map(t => t.task_index === taskIndex ? { ...t, feedback: tempFeedback } : t));
      setEditingFeedback(null);
      showToast(`✓ Feedback saved for Task ${taskIndex}`);
    } catch (e: any) {
      showToast(`✗ Failed to save feedback: ${e?.message || 'Unknown error'}`, false);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => (onBack ? onBack() : navigate(-1));
  const copyCode = (code: string, idx: number) => { navigator.clipboard.writeText(code); showToast(`Task ${idx} code copied!`); };

  const downloadReport = () => {
    const reportData = {
      session: sessionData,
      task_progress: taskProgress,
      submission_results: submissionResults,
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `session_report_${sessionId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc'}}>
      <div style={{ textAlign: 'center'}}>
        <div style={{ width: 44, height: 44, border: '3px solid #e5e7eb', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px'}} />
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading session report…</div>
      </div>
    </div>
  );

  if (error || !sessionData) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc'}}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32, background: '#fff', borderRadius: 20 }}>
        <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
        <h2 style={{ margin: '0 0 8px', color: '#111827'}}>Session Not Found</h2>
        <p style={{ color: '#6b7280', marginBottom: 20 }}>{error || 'Session does not exist.'}</p>
        <code style={{ display: 'block', padding: '8px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 11, marginBottom: 20 }}>Session ID: {sessionId}</code>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center'}}>
          <button onClick={handleBack} style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>← Go Back</button>
          <button onClick={fetchSession} style={{ padding: '10px 24px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>⟳ Retry</button>
        </div>
      </div>
    </div>
  );

  const candidate = sessionData.candidate || {};
  const session = sessionData.session || {};
  const evaluation = sessionData.evaluation || {};
  const template = sessionData.simulation_template || {};
  const job = sessionData.job || {};
  const company = sessionData.company || {};

  // Use submission_results data for scores when available
  const overallScore = submissionResults?.score || sessionData.total_score || session.score || evaluation.overall_score || 0;
  const passed = submissionResults?.passed || sessionData.passed || (overallScore >= 70);

  const completedTasks = taskProgress.filter(t => t.status === 'completed').length;
  const inProgressTasks = taskProgress.filter(t => t.status === 'in_progress'&& t.started_at).length;
  const notStartedTasks = taskProgress.filter(t => !t.started_at || (t.status === 'in_progress'&& !t.started_at)).length;
  const totalTasks = taskProgress.length;
  const gradedTasks = taskProgress.filter(t => t.score !== null);
  const avgTaskScore = gradedTasks.length ? Math.round(gradedTasks.reduce((s, t) => s + (t.score || 0), 0) / gradedTasks.length) : null;

  const dimensions = [
    { label: 'Communication', val: evaluation.communication_score },
    { label: 'Problem Solving', val: evaluation.problem_solving_score },
    { label: 'Adaptability', val: evaluation.adaptability_score },
    { label: 'Collaboration', val: evaluation.collaboration_score },
    { label: 'Attention', val: evaluation.attention_to_detail_score },
    { label: 'Initiative', val: evaluation.initiative_score },
  ].filter(d => d.val !== undefined && d.val !== null);

  const initials = `${candidate.first_name?.charAt(0) || ''}${candidate.last_name?.charAt(0) || ''}`;

  // Helper for score breakdown access
  const sb = submissionResults?.scoreBreakdown || submissionResults?.fullAnalysis?.scores || null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .task-card { transition: box-shadow 0.15s; }
        .task-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
        .btn-score { transition: all 0.15s; }
        .btn-score:hover { filter: brightness(1.08); transform: translateY(-1px); }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, padding: '12px 20px', borderRadius: 12, background: toast.ok ? '#16a34a': '#dc2626', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', animation: 'fadeUp 0.25s ease'}}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)'}}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBack} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#374151', fontWeight: 600, fontSize: 13 }}>
              <ArrowLeft size={15} /> Back
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#111827'}}>Session Report</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace'}}>{sessionId?.substring(0, 8)}…{sessionId?.substring(sessionId.length - 4)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setActiveTab('report')} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === 'report'? '#fff': 'transparent', color: activeTab === 'report'? '#7c3aed': '#6b7280', border: 'none', cursor: 'pointer', boxShadow: activeTab === 'report'? '0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Report</button>
              <button onClick={() => setActiveTab('submission')} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === 'submission'? '#fff': 'transparent', color: activeTab === 'submission'? '#7c3aed': '#6b7280', border: 'none', cursor: 'pointer', boxShadow: activeTab === 'submission'? '0 1px 3px rgba(0,0,0,0.1)': 'none'}}>Submission Results</button>
            </div>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Printer size={14} /> Print / PDF</button>
            <button onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Download size={14} /> Download JSON</button>
            {canGrade && (
              <>
                <button
                  onClick={() => setAdminConfirm('reopen')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                  title="Reopen session   candidate continues from where they left off"
                >
                  ▶ Reopen to Continue
                </button>
                <button
                  onClick={() => { setCancelReason(''); setAdminConfirm('reset'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                  title="Reset session   erase all progress so candidate starts fresh"
                >
                  🔄 Reset from Scratch
                </button>
                <button
                  onClick={() => { setCancelReason(''); setAdminConfirm('cancel'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                  title="Cancel and void this session permanently"
                >
                  ✕ Cancel Session
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ============================================ */}
        {/* SUBMISSION RESULTS TAB                       */}
        {/* ============================================ */}
        {activeTab === 'submission'&& submissionResults && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header Card */}
            <div style={{ borderRadius: 16, padding: 24, border: `2px solid ${passed ? '#bbf7d0': '#fecaca'}`, background: passed ? '#f0fdf4': '#fef2f2'}}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {passed ? <Trophy size={48} style={{ color: '#16a34a'}} /> : <AlertTriangle size={48} style={{ color: '#dc2626'}} />}
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: passed ? '#16a34a': '#dc2626'}}>{passed ? '✓ Practical Assessment Passed!': '✗ Practical Assessment Not Passed'}</h2>
                    <p style={{ margin: '8px 0 0', color: '#374151'}}>{submissionResults.message || `Score: ${submissionResults.score}%`}</p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#6b7280'}}>
                      <span>Submitted: {submissionResults.submittedAt ? new Date(submissionResults.submittedAt).toLocaleString() : formatDate(session.completed_at)}</span>
                      <span>•</span>
                      <span>Version: {submissionResults.version || '1.0'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'center'}}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: '#7c3aed'}}>{submissionResults.score || overallScore}%</div>
                  <div style={{ fontSize: 12, color: '#6b7280'}}>Final Score</div>
                  <div style={{ fontSize: 11, color: '#9ca3af'}}>Passing: {submissionResults.passingScore || 70}%</div>
                </div>
              </div>
            </div>

            {/* Hiring Recommendation Card */}
            {(() => {
              const rec = submissionResults.hiringRecommendation || submissionResults.feedback?.hiring_recommendation;
              if (!rec) return null;
              const palette: Record<string, { fg: string; bg: string; border: string }> = {
                strong_hire: { fg: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0'},
                hire: { fg: '#2563eb', bg: '#eff6ff', border: '#bfdbfe'},
                borderline: { fg: '#d97706', bg: '#fffbeb', border: '#fde68a'},
                needs_improvement: { fg: '#ea580c', bg: '#fff7ed', border: '#fed7aa'},
                not_recommended: { fg: '#dc2626', bg: '#fef2f2', border: '#fecaca'},
              };
              const c = palette[rec.level] || palette.borderline;
              return (
                <div style={{ background: c.bg, borderRadius: 16, padding: 24, border: `2px solid ${c.border}` }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Trophy size={18} style={{ color: c.fg }} /> Hiring Recommendation
                  </h3>
                  <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 999, background: c.fg, color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>
                    {rec.label}
                  </div>
                  <p style={{ margin: 0, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>{rec.reasoning}</p>
                </div>
              );
            })()}

            {/* Summary Stats */}
            {submissionResults.summary && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><BarChart size={18} style={{ color: '#7c3aed'}} /> Summary Statistics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a'}}>{submissionResults.summary.completion_rate || 0}%</div>
                    <div style={{ fontSize: 12, color: '#6b7280'}}>Completion Rate</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb'}}>{submissionResults.summary.completed_tasks || 0}/{submissionResults.summary.total_tasks || totalTasks}</div>
                    <div style={{ fontSize: 12, color: '#6b7280'}}>Tasks Completed</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706'}}>{submissionResults.summary.total_time_formatted || formatTime(session.time_spent)}</div>
                    <div style={{ fontSize: 12, color: '#6b7280'}}>Total Time</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed'}}>{submissionResults.completionAngle || 0}°</div>
                    <div style={{ fontSize: 12, color: '#6b7280'}}>Completion Angle</div>
                  </div>
                </div>
                {submissionResults.summary.completion_rate && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Overall Progress</span><span>{submissionResults.summary.completion_rate}%</span></div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden'}}><div style={{ height: '100%', width: `${submissionResults.summary.completion_rate}%`, background: '#16a34a', borderRadius: 3 }} /></div>
                  </div>
                )}
              </div>
            )}

            {/* Score Breakdown */}
            {submissionResults.scoreBreakdown && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={18} style={{ color: '#7c3aed'}} /> Score Breakdown</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: '#faf5ff', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed'}}>{submissionResults.scoreBreakdown.quality || 0}%</div><div style={{ fontSize: 12, color: '#6b7280'}}>Quality</div></div>
                  <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb'}}>{submissionResults.scoreBreakdown.speed || 0}%</div><div style={{ fontSize: 12, color: '#6b7280'}}>Speed</div></div>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a'}}>{submissionResults.scoreBreakdown.technical || 0}%</div><div style={{ fontSize: 12, color: '#6b7280'}}>Technical</div></div>
                  <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#d97706'}}>{submissionResults.scoreBreakdown.github || 0}%</div><div style={{ fontSize: 12, color: '#6b7280'}}>GitHub</div></div>
                </div>

                {/* All category scores as progress bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {([
                    ['Quality', submissionResults.scoreBreakdown.quality, '#7c3aed'],
                    ['Technical', submissionResults.scoreBreakdown.technical, '#16a34a'],
                    ['Communication', submissionResults.scoreBreakdown.communication, '#0ea5e9'],
                    ['Collaboration', submissionResults.scoreBreakdown.collaboration, '#8b5cf6'],
                    ['Adaptability', submissionResults.scoreBreakdown.adaptability, '#f59e0b'],
                    ['Punctuality', submissionResults.scoreBreakdown.punctuality, '#ef4444'],
                    ['Speed', submissionResults.scoreBreakdown.speed, '#2563eb'],
                    ['GitHub', submissionResults.scoreBreakdown.github, '#d97706'],
                  ] as Array<[string, number, string]>)
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([label, value, color]) => {
                      const pct = Math.max(0, Math.min(100, Math.round(value || 0)));
                      return (
                        <div key={label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: '#374151', fontWeight: 600 }}>{label}</span>
                            <span style={{ color }}>{pct}%</span>
                          </div>
                          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden'}}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .4s'}} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Feedback Card */}
            {submissionResults.feedback && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={18} style={{ color: '#7c3aed'}} /> Feedback</h3>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a'}}>Summary</div>
                  <p style={{ margin: 0, color: '#374151'}}>{submissionResults.feedback.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a'}}>✓ Strengths</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {submissionResults.feedback.strengths?.map((s: string, i: number) => <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s}</li>)}
                    </ul>
                  </div>
                  {submissionResults.feedback.improvements?.length > 0 && (
                    <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#d97706'}}> Areas for Improvement</div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {submissionResults.feedback.improvements.map((s: string, i: number) => <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Detailed Feedback</div>
                  <p style={{ margin: 0, color: '#374151'}}>{submissionResults.feedback.detailed_feedback}</p>
                </div>
              </div>
            )}

            {/* Data Quality Card */}
            {submissionResults.dataQuality && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={18} style={{ color: '#7c3aed'}} /> Data Quality</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, background: submissionResults.dataQuality.grade === 'A'? '#f0fdf4': '#eff6ff', color: submissionResults.dataQuality.grade === 'A'? '#16a34a': '#2563eb'}}>{submissionResults.dataQuality.grade}</div>
                  <div><div style={{ fontWeight: 600 }}>{submissionResults.dataQuality.description}</div><div style={{ fontSize: 13, color: '#6b7280'}}>Average Answer Quality: {submissionResults.dataQuality.average_answer_quality}%</div></div>
                </div>
              </div>
            )}

            {/* Time Tracking Card */}
            {submissionResults.timeTracking && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} style={{ color: '#7c3aed'}} /> Time Tracking</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af'}}>Started At</div><div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(submissionResults.timeTracking.sessionStartedAt).toLocaleString()}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af'}}>Completed At</div><div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(submissionResults.timeTracking.sessionCompletedAt).toLocaleString()}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af'}}>Total Time</div><div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed'}}>{submissionResults.timeTracking.sessionTotalFormatted}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af'}}>Time Limit</div><div style={{ fontWeight: 600 }}>{submissionResults.timeTracking.timeLimitFormatted}</div></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Time Used</span><span style={{ color: (submissionResults.timeTracking.timeUsedPercent || 0) > 100 ? '#dc2626': '#16a34a'}}>{submissionResults.timeTracking.timeUsedPercent || 0}%</span></div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden'}}><div style={{ height: '100%', width: `${Math.min(100, submissionResults.timeTracking.timeUsedPercent || 0)}%`, background: (submissionResults.timeTracking.timeUsedPercent || 0) > 100 ? '#dc2626': '#16a34a', borderRadius: 3 }} /></div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>{submissionResults.timeTracking.submittedOnTime ? '✓ Submitted on time': ' Submitted after time limit'}</div>
                </div>
              </div>
            )}

            {/* Data Quantity Card */}
            {submissionResults.dataQuantity && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Database size={18} style={{ color: '#7c3aed'}} /> Data Quantity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed'}}>{submissionResults.dataQuantity.answers_submitted || 0}</div><div style={{ fontSize: 11, color: '#6b7280'}}>Answers Submitted</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a'}}>{submissionResults.dataQuantity.tasks_attempted || 0}</div><div style={{ fontSize: 11, color: '#6b7280'}}>Tasks Attempted</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center'}}><div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb'}}>{submissionResults.dataQuantity.data_completeness_percent || 0}%</div><div style={{ fontSize: 11, color: '#6b7280'}}>Completeness</div></div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {(() => {
              const events: Array<{ label: string; time: string }> = [];
              const push = (label: string, time?: string | null) => { if (time) events.push({ label, time }); };
              push('Practical Assessment assigned', session.created_at || sessionData.application?.created_at);
              push('Practical Assessment started', session.started_at);
              push('Final submission', session.completed_at || submissionResults.submittedAt);
              push('AI evaluation completed', submissionResults.timeTracking?.sessionCompletedAt || submissionResults.generatedAt);
              push('Results published', submissionResults.submittedAt || session.completed_at);
              const sorted = events
                .filter(e => !isNaN(new Date(e.time).getTime()))
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
              if (sorted.length === 0) return null;
              return (
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} style={{ color: '#7c3aed'}} /> Timeline</h3>
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    {sorted.map((e, i) => (
                      <div key={i} style={{ position: 'relative', paddingBottom: i === sorted.length - 1 ? 0 : 18 }}>
                        <div style={{ position: 'absolute', left: -16, top: 2, width: 10, height: 10, borderRadius: '50%', background: '#7c3aed'}} />
                        {i !== sorted.length - 1 && <div style={{ position: 'absolute', left: -12, top: 12, width: 2, bottom: -6, background: '#e9d5ff'}} />}
                        <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{e.label}</div>
                        <div style={{ fontSize: 12, color: '#6b7280'}}>{new Date(e.time).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Evidence & Attachments */}
            {(() => {
              const repoUrl = submissionResults.githubAnalysis?.repo_info?.repoUrl;
              const codeTasks = (taskProgress || []).filter((t: any) => t?.answer && (typeof t.answer === 'string'? t.answer : t.answer.code));
              if (!repoUrl && codeTasks.length === 0) return null;
              const downloadText = (filename: string, content: string) => {
                const blob = new Blob([content], { type: 'text/plain'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
              };
              return (
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><FolderOpen size={18} style={{ color: '#7c3aed'}} /> Evidence & Attachments</h3>
                  {repoUrl && (
                    <a href={repoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 10, color: '#2563eb', textDecoration: 'none', fontSize: 14 }}>
                      <GitBranch size={16} /> Repository   {repoUrl}
                    </a>
                  )}
                  {codeTasks.map((t: any, i: number) => {
                    const code = typeof t.answer === 'string'? t.answer : (t.answer.code || '');
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 8 }}>
                        <FileCode size={16} style={{ color: '#6b7280'}} />
                        <span style={{ flex: 1, fontSize: 14, color: '#374151'}}>Task {t.task_index} submission</span>
                        <button onClick={() => downloadText(`task-${t.task_index}-submission.txt`, code)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer'}}><Download size={13} /> Download</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Evaluation Metadata */}
            {(evaluation?.id || submissionResults.simulationRecordId) && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} style={{ color: '#7c3aed'}} /> Evaluation Metadata</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
                  {(evaluation?.id || submissionResults.simulationRecordId) && <div><div style={{ fontSize: 11, color: '#9ca3af'}}>Evaluation ID</div><code style={{ fontSize: 12 }}>{evaluation?.id || submissionResults.simulationRecordId}</code></div>}
                  <div><div style={{ fontSize: 11, color: '#9ca3af'}}>Evaluation Date</div><div>{submissionResults.submittedAt ? new Date(submissionResults.submittedAt).toLocaleString() : ' '}</div></div>
                  <div><div style={{ fontSize: 11, color: '#9ca3af'}}>Passing Score</div><div>{submissionResults.passingScore || 70}%</div></div>
                  <div><div style={{ fontSize: 11, color: '#9ca3af'}}>Confirmation Email</div><div>{submissionResults.emailSent ? '✓ Sent': ' '}</div></div>
                </div>
              </div>
            )}

            {/* ── Unified Blockchain & Audit Trail Section ── */}
            <div style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #eff6ff 100%)', borderRadius: 16, border: '1px solid #e9d5ff', overflow: 'hidden'}}>
              {/* Header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Shield size={20} style={{ color: '#7c3aed'}} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1e1b4b'}}>Blockchain Audit Trail</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>Tamper-evident record of your assessment result</div>
                  </div>
                </div>
                <button
                  onClick={verifyResultsOnChain}
                  disabled={chainVerifying}
                  className="no-print"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: chainVerifying ? 0.7 : 1 }}
                >
                  <ShieldCheck size={14} />
                  {chainVerifying ? 'Verifying…': 'Verify Integrity'}
                </button>
              </div>

              <div style={{ padding: 24 }}>

                {/* ── STATUS OVERVIEW: 2 badges ── */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: auditBlocks.length > 0 ? '#f0fdf4': '#f9fafb', border: `1px solid ${auditBlocks.length > 0 ? '#bbf7d0': '#e5e7eb'}`, borderRadius: 999, fontSize: 12, fontWeight: 700, color: auditBlocks.length > 0 ? '#15803d': '#9ca3af'}}>
                    {auditBlocks.length > 0 ? <ShieldCheck size={14} /> : <Database size={14} />}
                    Local Audit Chain: {auditBlocks.length > 0 ? `${auditBlocks.length} block${auditBlocks.length > 1 ? 's': ''} secured` : 'No blocks yet'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: submissionResults?.blockchain?.txHash ? '#f0fdf4': '#fffbeb', border: `1px solid ${submissionResults?.blockchain?.txHash ? '#bbf7d0': '#fde68a'}`, borderRadius: 999, fontSize: 12, fontWeight: 700, color: submissionResults?.blockchain?.txHash ? '#15803d': '#b45309'}}>
                    {submissionResults?.blockchain?.txHash ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    Ethereum Sepolia: {submissionResults?.blockchain?.txHash ? 'Anchored ': 'Not anchored '}
                  </div>
                </div>

                {/* ── VERIFY RESULT BANNER ── */}
                {chainError && (
                  <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldAlert size={16} /> {chainError}
                  </div>
                )}
                {chainReport && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: chainReport.valid ? '#f0fdf4': '#fef2f2', borderRadius: 10, border: `1px solid ${chainReport.valid ? '#bbf7d0': '#fecaca'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: chainReport.valid ? '#15803d': '#dc2626'}}>
                      {chainReport.valid ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
                      {chainReport.valid
                        ? 'Your result has NOT been tampered with   all hashes match'
                        : ' Tampering detected   hash mismatch in audit chain'}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280'}}>
                      {chainReport.verifiedCount}/{chainReport.totalBlocks} blocks verified · {chainReport.failedCount} failed
                    </div>
                    {!chainReport.valid && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 8, border: '1px solid #fecaca'}}>
                         <strong>What this means:</strong> A block in the chain was modified after it was recorded. This could indicate the result was altered. Contact the platform administrator.
                      </div>
                    )}
                  </div>
                )}

                {/* ── LOCAL AUDIT CHAIN ── */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Database size={14} /> Local Audit Chain
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>  tamper-evident hash-linked ledger</span>
                    </div>
                    <a
                      href="/blockchain"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#7c3aed', textDecoration: 'none', fontWeight: 600, padding: '5px 12px', background: '#ede9fe', borderRadius: 8 }}
                    >
                      <ExternalLink size={12} /> Open blockchain explorer →
                    </a>
                  </div>

                  {loadingBlocks && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 13 }}>Loading audit blocks…</div>
                  )}
                  {!loadingBlocks && auditBlocks.length === 0 && (
                    <div style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, color: '#9ca3af', textAlign: 'center'}}>
                      No audit blocks found for this simulation. Submit an assessment to create your first block.
                    </div>
                  )}

                  {auditBlocks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {auditBlocks.map((block, idx) => {
                        const verif = blockVerifications[block.id];
                        const shortHash = (h: string) => h ? `${h.substring(0, 10)}…${h.substring(h.length - 8)}` : ' ';
                        const meta = block.metadata || {};
                        return (
                          <div key={block.id}>
                            <div style={{ background: '#fff', borderRadius: 12, border: `2px solid ${verif ? (verif.valid ? '#86efac': '#fca5a5') : '#c4b5fd'}`, overflow: 'hidden'}}>
                              {/* Block header */}
                              <div style={{ padding: '10px 14px', background: verif ? (verif.valid ? '#f0fdf4': '#fef2f2') : '#faf5ff', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 6, padding: '2px 9px', fontSize: 11, fontWeight: 800 }}>Block #{block.block_number}</span>
                                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, textTransform: 'capitalize'}}>{(block.event_type || '').replace(/_/g, '')}</span>
                                  {block.eth_tx_id
                                    ? <a href={`https://sepolia.etherscan.io/tx/${block.eth_tx_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none', background: '#eff6ff', padding: '2px 7px', borderRadius: 6 }}><ExternalLink size={10} /> Sepolia</a>
                                    : <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '2px 7px', borderRadius: 6 }}>Local only</span>
                                  }
                                </div>
                                {verif && (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: verif.valid ? '#16a34a': '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {verif.valid ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                                    {verif.valid ? 'Hash verified ': 'Hash mismatch '}
                                  </span>
                                )}
                              </div>

                              {/* What was captured */}
                              {(meta.score !== undefined || block.action) && (
                                <div style={{ padding: '10px 14px', background: '#faf5ff', borderBottom: '1px solid #ede9fe'}}>
                                  <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em'}}>What was captured in this block</div>
                                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap'}}>
                                    {block.action && <div style={{ fontSize: 12, color: '#374151'}}>📋 <strong>Event:</strong> {block.action}</div>}
                                    {meta.score !== undefined && <div style={{ fontSize: 12, color: '#374151'}}>🏆 <strong>Score:</strong> <span style={{ fontWeight: 800, color: meta.score >= 70 ? '#16a34a': '#dc2626'}}>{meta.score}%</span></div>}
                                    {meta.passed !== undefined && <div style={{ fontSize: 12, color: '#374151'}}>''<strong>Result:</strong> <span style={{ fontWeight: 700, color: meta.passed ? '#16a34a': '#dc2626'}}>{meta.passed ? 'PASSED': 'NOT PASSED'}</span></div>}
                                    {meta.completionRate !== undefined && <div style={{ fontSize: 12, color: '#374151'}}>📊 <strong>Completion:</strong> {meta.completionRate}%</div>}
                                  </div>
                                </div>
                              )}

                              {/* Hashes */}
                              <div style={{ padding: '10px 14px', display: 'flex', gap: 16, flexWrap: 'wrap'}}>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, fontWeight: 600 }}>CURRENT HASH (this block)</div>
                                  <code style={{ fontSize: 11, color: '#7c3aed', background: '#faf5ff', padding: '3px 8px', borderRadius: 5, display: 'block', wordBreak: 'break-all'}}>{shortHash(block.current_hash)}</code>
                                </div>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, fontWeight: 600 }}>PREV HASH (links to block above)</div>
                                  <code style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb', padding: '3px 8px', borderRadius: 5, display: 'block', wordBreak: 'break-all'}}>{shortHash(block.prev_hash)}</code>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, fontWeight: 600 }}>RECORDED AT</div>
                                  <span style={{ fontSize: 11, color: '#374151'}}>{new Date(block.timestamp).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                            {idx < auditBlocks.length - 1 && (
                              <div style={{ textAlign: 'center', padding: '3px 0', color: '#a78bfa', fontSize: 18, lineHeight: 1 }}>↕</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── ETHEREUM SEPOLIA ── */}
                <div style={{ borderTop: '1px solid #e9d5ff', paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Activity size={14} /> Ethereum Sepolia
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>  public blockchain anchor</span>
                  </div>

                  {submissionResults?.blockchain?.txHash ? (
                    <div style={{ background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', padding: '14px 16px'}}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#15803d', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                        <CheckCircle size={15} /> Anchored on Ethereum Sepolia Testnet
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>TRANSACTION HASH   proof your result is on the blockchain</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <code style={{ fontSize: 12, color: '#374151', wordBreak: 'break-all', flex: 1 }}>{submissionResults.blockchain.txHash}</code>
                            <a href={`https://sepolia.etherscan.io/tx/${submissionResults.blockchain.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', flexShrink: 0 }}><ExternalLink size={14} /></a>
                          </div>
                        </div>
                        {submissionResults.blockchain.blockNumber && (
                          <div><div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 600 }}>BLOCK NUMBER</div><span style={{ fontSize: 13, fontWeight: 700, color: '#374151'}}>#{submissionResults.blockchain.blockNumber}</span></div>
                        )}
                        {submissionResults.blockchain.credentialHash && (
                          <div><div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2, fontWeight: 600 }}>CREDENTIAL HASH</div><code style={{ fontSize: 11, color: '#374151', wordBreak: 'break-all'}}>{submissionResults.blockchain.credentialHash}</code></div>
                        )}
                      </div>
                      <div style={{ marginTop: 12 }}>
                        <a href={`https://sepolia.etherscan.io/tx/${submissionResults.blockchain.txHash}`} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none'}}>
                          <ExternalLink size={12} /> View my result on Etherscan
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#fffbeb', borderRadius: 12, border: '1px solid #fde68a', padding: '14px 16px'}}>
                      {/* What failed */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                        <AlertTriangle size={15} /> NOT anchored on Ethereum Sepolia
                      </div>

                      {/* Why it failed */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f', marginBottom: 6 }}> Why it failed:</div>
                        <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.7, background: '#fef3c7', padding: '8px 12px', borderRadius: 8 }}>
                          The blockchain wallet has <strong>0 ETH</strong>   Ethereum transactions require a small gas fee to write to the blockchain. Without ETH in the wallet, the anchoring transaction cannot be sent.
                        </div>
                      </div>

                      {/* What IS secured */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>''What IS secured:</div>
                        <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.7, background: '#f0fdf4', padding: '8px 12px', borderRadius: 8, border: '1px solid #bbf7d0'}}>
                          Your result <strong>IS recorded</strong> in the local audit chain above (tamper-evident, hash-linked). It cannot be altered without breaking the hash chain. The local chain is the primary security layer.
                        </div>
                      </div>

                      {/* How to fix */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>🔧 How to fix (for admin):</div>
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#1e40af', lineHeight: 1.9 }}>
                          <li>Go to <a href="https://sepoliafaucet.com" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>sepoliafaucet.com</a> or <a href="https://faucets.chain.link/sepolia" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>faucets.chain.link/sepolia</a></li>
                          <li>Enter the <strong>signing wallet address</strong> (NOT the contract address):<br/>
                            <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: 3, fontSize: 11, userSelect: 'all', display: 'inline-block', marginTop: 3 }}>0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266</code>
                          </li>
                          <li>Request free Sepolia ETH   next submission will automatically anchor on-chain</li>
                        </ol>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                        <a href="https://sepoliafaucet.com" target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#f59e0b', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none'}}>
                          <ExternalLink size={12} /> Get Sepolia ETH (faucet)
                        </a>
                        <a href="https://faucets.chain.link/sepolia" target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none'}}>
                          <ExternalLink size={12} /> Chainlink Faucet
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* No results fallback */}
            {!submissionResults && session.status === 'completed'&& (
              <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #f1f5f9'}}>
                <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
                <h3 style={{ margin: 0, color: '#374151'}}>No Submission Results Available</h3>
                <p style={{ color: '#6b7280', marginTop: 8 }}>The practical assessment has been completed but detailed results are not yet available.</p>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* REPORT TAB - WITH SUBMISSION RESULTS INTEGRATED */}
        {/* ============================================ */}
        {activeTab === 'report'&& (
          <>
            {/* ── Submission result banner (shown when data is available) ── */}
            {submissionResults && (
              <div style={{
                borderRadius: 16, padding: '18px 24px',
                border: `1.5px solid ${passed ? '#bbf7d0': '#fecaca'}`,
                background: passed ? '#f0fdf4': '#fef2f2',
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                  {passed
                    ? <Trophy size={36} style={{ color: '#16a34a', flexShrink: 0 }} />
                    : <AlertTriangle size={36} style={{ color: '#dc2626', flexShrink: 0 }} />
                  }
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: passed ? '#16a34a': '#dc2626'}}>
                      {passed ? 'Practical Assessment Passed': 'Practical Assessment Not Passed'}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      {submissionResults.message || `Score: ${submissionResults.score}%`}
                    </div>
                  </div>
                </div>
                {sb && (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap'}}>
                    {[
                      { label: 'Quality', val: sb.quality, color: '#7c3aed'},
                      { label: 'Speed', val: sb.speed, color: '#2563eb'},
                      { label: 'Technical', val: sb.technical, color: '#16a34a'},
                      { label: 'GitHub', val: sb.github, color: '#d97706'},
                      { label: 'Behavioral', val: sb.behavioral, color: '#0891b2'},
                      { label: 'Communication', val: sb.communication, color: '#9333ea'},
                    ].filter(s => s.val !== undefined && s.val !== null).map(s => (
                      <div key={s.label} style={{ textAlign: 'center'}}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{Math.round(s.val)}%</div>
                        <div style={{ fontSize: 11, color: '#6b7280'}}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Candidate Hero */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap'}}>
                {candidate.profile_photo_url ? (
                  <img src={candidate.profile_photo_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover'}} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>{initials || '?'}</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 22, color: '#111827'}}>{candidate.full_name || candidate.name || 'Candidate'}</div>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>{candidate.email}</div>
                  {(candidate.id || candidate.user_id) && <div style={{ color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}>ID: {candidate.id || candidate.user_id}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                    {(job.title || candidate.headline) && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Briefcase size={13} />{job.title || candidate.headline}</span>}
                    {candidate.city && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Building size={13} />{candidate.city}, {candidate.country}</span>}
                    {company.name && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Target size={13} />{company.name}</span>}
                    {(job.recruiter_name || sessionData.recruiter?.name) && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><User size={13} />Recruiter: {job.recruiter_name || sessionData.recruiter?.name}</span>}
                    {(sessionData.mentor?.name || sessionData.application?.mentor_name) && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><User size={13} />Mentor: {sessionData.mentor?.name || sessionData.application?.mentor_name}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center'}}>
                  <div style={{ position: 'relative', display: 'inline-block'}}><ScoreRing score={overallScore} size={84} stroke={7} /><div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}><div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(overallScore) }}>{Math.round(overallScore)}</div><div style={{ fontSize: 9, color: '#9ca3af'}}>/ 100</div></div></div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Overall Score</div>
                  <div style={{ marginTop: 6 }}>{passed ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><CheckCircle size={11} />Passed</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><XCircle size={11} />Failed</span>}</div>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
              {[
                { icon: <CheckCircle size={20} style={{ color: '#16a34a'}} />, label: 'Completed', val: completedTasks, bg: '#f0fdf4'},
                { icon: <Play size={20} style={{ color: '#2563eb'}} />, label: 'In Progress', val: inProgressTasks, bg: '#eff6ff'},
                { icon: <Lock size={20} style={{ color: '#9ca3af'}} />, label: 'Not Started', val: notStartedTasks, bg: '#f9fafb'},
                { icon: <AwardIcon size={20} style={{ color: '#7c3aed'}} />, label: 'Graded', val: gradedTasks.length, bg: '#faf5ff'},
                ...(avgTaskScore !== null ? [{ icon: <BarChart2 size={20} style={{ color: '#d97706'}} />, label: 'Avg Task Score', val: `${avgTaskScore}%`, bg: '#fffbeb'}] : []),
              ].map((s, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9'}}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#111827'}}>{s.val}</div>
                  <div style={{ fontSize: 12, color: '#6b7280'}}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Score Dimensions from evaluation */}
            {dimensions.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={17} style={{ color: '#7c3aed'}} /> Score Dimensions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {dimensions.map(d => (
                    <div key={d.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px'}}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{d.label}</span><span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(d.val) }}>{d.val}%</span></div>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden'}}><div style={{ height: '100%', width: `${d.val}%`, background: scoreColor(d.val), borderRadius: 3 }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score Breakdown from submissionResults */}
            {sb && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={17} style={{ color: '#7c3aed'}} /> Detailed Score Breakdown
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {[
                    { label: 'Quality', val: sb.quality },
                    { label: 'Speed', val: sb.speed },
                    { label: 'Technical', val: sb.technical },
                    { label: 'GitHub', val: sb.github },
                    { label: 'Behavioral', val: sb.behavioral },
                    { label: 'Communication', val: sb.communication },
                    { label: 'Punctuality', val: sb.punctuality },
                    { label: 'Adaptability', val: sb.adaptability },
                    { label: 'Collaboration', val: sb.collaboration },
                    { label: 'Completion Rate', val: sb.completion_rate },
                  ].filter(d => d.val !== undefined && d.val !== null).map(d => (
                    <div key={d.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px'}}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{d.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(Math.round(d.val)) }}>{Math.round(d.val)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden'}}>
                        <div style={{ height: '100%', width: `${Math.round(d.val)}%`, background: scoreColor(Math.round(d.val)), borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How this score is calculated (collapsible) */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
              <button
                onClick={() => setShowCalc(s => !s)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#7c3aed'}}
              >
                <Brain size={17} /> {showCalc ? '▲ Hide score calculation': '▼ How your score was calculated (full details)'}
              </button>
              {showCalc && (() => {
                const wb = sb?.weighted_breakdown || {};
                const qb = sb?.quality_breakdown || {};
                const bb = sb?.behavioral_breakdown || {};
                const fmtS = (v: any) => Math.round(Number(v ?? 0));
                const fmtW = (w: number) => `${(w * 100).toFixed(1)}%`;

                const tech = fmtS(sb?.technical);
                const punct = fmtS(sb?.punctuality);
                const adapt = fmtS(sb?.adaptability);
                const comm = fmtS(sb?.communication);
                const speed = fmtS(sb?.speed);
                const github = fmtS(sb?.github);
                const collab = fmtS(sb?.collaboration);
                const quality = fmtS(sb?.quality ?? qb?.total);
                const behavioral = fmtS(sb?.behavioral ?? bb?.total);
                const overall = fmtS(sb?.overall);
                const passingScore = submissionResults?.passingScore ?? submissionResults?.summary?.passing_score ?? 70;
                const passed = Boolean(submissionResults?.passed);

                const wQ = Number(wb.quality?.weight ?? 0);
                const wS = Number(wb.speed?.weight ?? 0);
                const wB = Number(wb.behavioral?.weight ?? 0);
                const wG = Number(wb.github?.weight ?? 0);
                const hasWeights = wQ + wS + wB + wG > 0;

                const cQ = (quality * wQ).toFixed(1);
                const cS = (speed * wS).toFixed(1);
                const cB = (behavioral * wB).toFixed(1);
                const cG = (github * wG).toFixed(1);

                const barRow = (label: string, val: number, color: string, desc: string) => (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 120, fontSize: 12, color: '#374151', fontWeight: 600, flexShrink: 0 }}>{label}</span>
                      <div style={{ flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden'}}>
                        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, val))}%`, background: color, borderRadius: 4, transition: 'width 0.5s'}} />
                      </div>
                      <span style={{ width: 36, textAlign: 'right', fontWeight: 700, fontSize: 13, color: val >= 80 ? '#16a34a': val >= 50 ? '#d97706': '#dc2626', flexShrink: 0 }}>{val}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', paddingLeft: 128, marginTop: 1 }}>{desc}</div>
                  </div>
                );

                const adaptBreakdown = (sb as any)?.adaptability_breakdown || {};
                const adaptPath = adaptBreakdown.path || (adaptBreakdown.events_count > 0 ? 'A': 'B');
                const adaptTasks: any[] = adaptBreakdown.tasks || [];
                const adaptMaxTime  = adaptTasks.length > 0 ? (adaptTasks[0].max_time  ?? Math.round(40 / Math.max(adaptTasks.length, 1))) : 40;
                const adaptMaxGit   = adaptTasks.length > 0 ? (adaptTasks[0].max_git   ?? Math.round(40 / Math.max(adaptTasks.length, 1))) : 40;
                const adaptMaxCode  = adaptTasks.length > 0 ? (adaptTasks[0].max_code  ?? Math.round(20 / Math.max(adaptTasks.length, 1))) : 20;
                const adaptMaxTotal = adaptTasks.length > 0 ? (adaptTasks[0].max_total ?? Math.round(100 / Math.max(adaptTasks.length, 1))) : 100;
                const adaptDesc = adaptPath === 'A'
                  ? 'Handling emergency / change-request tasks (quality + speed of unexpected tasks)'
                  : 'Per-task: on-time (40pts) + git commit found (40pts) + code written (20pts)';

                // ── per-metric breakdown helpers ─────────────────────────────
                const miniTbl = (bg: string, border: string, headBg: string, headColor: string, headers: string[], rows: (string|number|React.ReactNode)[][], keyPfx: string) => (
                  <div style={{ marginLeft: 128, marginTop: 4, marginBottom: 8 }}>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', background: bg, borderRadius: 8, overflow: 'hidden', border: `1px solid ${border}` }}>
                      <thead>
                        <tr style={{ background: headBg }}>
                          {headers.map((h, i) => <th key={i} style={{ textAlign: i === 0 ? 'left': 'center', padding: '4px 6px', fontWeight: 600, color: headColor, whiteSpace: 'pre-line'}}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={`${keyPfx}-${ri}`} style={{ borderTop: `1px solid ${border}` }}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{ textAlign: ci === 0 ? 'left': 'center', padding: '3px 6px', color: '#374151', maxWidth: ci === 0 ? 160 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: ci === 0 ? 'nowrap': undefined }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );

                const green = (v: boolean, yes: React.ReactNode, no: React.ReactNode) => <span style={{ color: v ? '#16a34a': '#dc2626', fontWeight: 700 }}>{v ? yes : no}</span>;

                // Derive session-level GitHub code presence as a fallback (candidate used external editor)
                const _ghData = submissionResults?.githubAnalysis || submissionResults?.github_analysis || null;
                const _ghFiles = (
                  _ghData?.detailed_marks?.codeFiles?.count ??
                  _ghData?.detailed_marks?.code_files?.count ??
                  _ghData?.detailedMarks?.codeFiles?.count ??
                  _ghData?.commit_statistics?.total_commits ??
                  0
                );
                const _ghScore = submissionResults?.scoreBreakdown?.github ?? sb?.github ?? 0;
                const _sessionHasGithubCode = !!(session.github_links) || _ghFiles > 0 || _ghScore > 0;

                // Technical   code submitted per task
                const techRows = taskProgress.map(t => {
                  const ans = t.answer;
                  const hasCode = !!(
                    t.github_commit_url ||
                    (t.status === 'completed'&& _sessionHasGithubCode) ||
                    (ans && (
                      (typeof ans === 'string'&& ans.trim().length > 10) ||
                      (ans.code && ans.code.trim().length > 10) ||
                      (ans.comment && ans.comment.trim().length > 10) ||
                      (ans.essay && ans.essay.trim().length > 10)
                    ))
                  );
                  return [t.task_title, green(t.status === 'completed', '✓ Done', '✗ Not done'), green(hasCode, '✓ Yes', '✗ No')];
                });

                // Speed & Punctuality   per task time
                const speedRows = taskProgress.map(t => {
                  let taken = 0, onTime = false;
                  if (t.started_at && t.completed_at) {
                    taken = (new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000;
                    // 5-minute grace period allowed   10m 02s rounds to 10 min and counts as on time; 11m is within grace of 10m limit
                    onTime = Math.round(taken) <= (t.task_duration || 30) + 5;
                  }
                  const done = t.status === 'completed';
                  return [
                    t.task_title,
                    done ? `${Math.round(taken)} min` : ' ',
                    `${t.task_duration || 30} min`,
                    green(done && onTime, '✓ On time', done ? '✗ Over limit': '✗ Not done'),
                  ];
                });

                // GitHub   from githubAnalysis
                const ghData = submissionResults?.githubAnalysis;
                const ghCommits = ghData?.detailed_marks?.commits?.count ?? ghData?.commit_statistics?.total_commits ?? ghData?.commits_count ?? 0;
                const ghReadme  = ghData?.detailed_marks?.readme?.present ?? ghData?.detailed_marks?.readme?.found ?? ghData?.readme_analysis?.present ?? ghData?.has_readme ?? false;
                const ghRepoUrl = ghData?.repo_info?.repoUrl ?? ghData?.full_analysis?.repoUrl ?? ghData?.repo_url ?? '';
                const ghFiles   = ghData?.detailed_marks?.codeFiles?.count ?? ghData?.detailed_marks?.code_files?.count ?? ghData?.code_files_count ?? 0;
                const ghBreakdown = ghData?.breakdown || null;
                const ghConfigFiles = ghBreakdown?.configFiles?.earned ?? ghData?.detailed_marks?.configFile?.earned ?? null;
                const ghConfigMax   = ghBreakdown?.configFiles?.max   ?? ghData?.detailed_marks?.configFile?.max   ?? 10;
                const ghGitignore   = ghBreakdown?.gitignore?.earned  ?? ghData?.detailed_marks?.gitignore?.earned ?? null;
                const ghGitignoreMax= ghBreakdown?.gitignore?.max     ?? ghData?.detailed_marks?.gitignore?.max    ?? 5;
                const ghCommitMatch = ghBreakdown?.commitMatching?.earned ?? ghData?.detailed_marks?.commitMatching?.earned ?? null;
                const ghCommitMatchMax = ghBreakdown?.commitMatching?.max ?? ghData?.detailed_marks?.commitMatching?.max ?? 30;
                const ghCommitsEarned = ghBreakdown?.commits?.earned ?? null;
                const ghCommitsMax    = ghBreakdown?.commits?.max    ?? 40;
                const ghReadmeEarned  = ghBreakdown?.readme?.earned  ?? null;
                const ghReadmeMax     = ghBreakdown?.readme?.max     ?? 15;
                const ghCodeEarned    = ghBreakdown?.codeFiles?.earned ?? null;
                const ghCodeMax       = ghBreakdown?.codeFiles?.max   ?? 20;
                const ghRows = [
                  ['Repository linked', green(!!ghRepoUrl, '✓ Yes', '✗ No')],
                  ['Commits pushed', green(ghCommits > 0, `✓ ${ghCommits} commits${ghCommitsEarned !== null ? ` (${ghCommitsEarned}/${ghCommitsMax} pts)` : ''}`, '✗ 0 commits')],
                  ['README file', green(ghReadme, `✓ Found${ghReadmeEarned !== null ? ` (${ghReadmeEarned}/${ghReadmeMax} pts)` : ''}`, '✗ Missing')],
                  ['Code files', green(ghFiles > 0, `✓ ${ghFiles} files${ghCodeEarned !== null ? ` (${ghCodeEarned}/${ghCodeMax} pts)` : ''}`, '✗ None detected')],
                  ['.gitignore', ghGitignore !== null ? green(ghGitignore > 0, `✓ Present (${ghGitignore}/${ghGitignoreMax} pts)`, `✗ Missing (0/${ghGitignoreMax} pts)`) : <span style={{ color: '#9ca3af'}}>N/A</span>],
                  ['Commit–task match', ghCommitMatch !== null ? green(ghCommitMatch >= ghCommitMatchMax * 0.5, `${ghCommitMatch}/${ghCommitMatchMax} pts`, `${ghCommitMatch}/${ghCommitMatchMax} pts   low`) : <span style={{ color: '#9ca3af'}}>N/A</span>],
                ];

                // Communication & Collaboration   from scoreBreakdown or analysis
                const commAnalysis = submissionResults?.communicationAnalysis || submissionResults?.communication_analysis || null;
                const chatCount = commAnalysis?.message_count ?? submissionResults?.chatAnalysis?.message_count ?? submissionResults?.conversation?.message_count ?? null;
                const candMsgs  = commAnalysis?.candidate_messages ?? submissionResults?.chatAnalysis?.candidate_messages ?? null;
                const aiMsgs    = commAnalysis?.recruiter_messages ?? submissionResults?.chatAnalysis?.ai_messages ?? null;
                const commRows = [
                  ['Messages sent', chatCount !== null ? green(chatCount > 0, `✓ ${chatCount} total`, '✗ No messages') : <span style={{ color: '#9ca3af'}}>N/A</span>],
                  ...(candMsgs !== null ? [['Your messages', green(candMsgs > 0, `✓ ${candMsgs}`, '✗ 0')]] : []),
                  ...(aiMsgs   !== null ? [['AI responses',  green(aiMsgs > 0,  `✓ ${aiMsgs}`,  '✗ 0')]] : []),
                  ['Score',           green(comm >= 50, `${comm}%   acceptable`, comm > 0 ? `${comm}%   low` : '0%   no chat detected')],
                ];

                const recruiterSent = (aiMsgs ?? 0) as number;
                const candidateSent = (candMsgs ?? 0) as number;
                const isTwoWay = recruiterSent > 0 && candidateSent > 0;
                const collabRows = [
                  ['Chat participation',  isTwoWay ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Two-way conversation</span> : candidateSent > 0 ? <span style={{ color: '#d97706', fontWeight: 700 }}>~ Candidate only (recruiter did not reply)</span> : <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ None</span>],
                  ['Message balance',     chatCount !== null ? (isTwoWay ? <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {chatCount} messages ({candidateSent} candidate / {recruiterSent} recruiter)</span> : <span style={{ color: '#d97706', fontWeight: 700 }}>~ {chatCount ?? 0} messages (one-sided)</span>) : <span style={{ color: '#9ca3af'}}>N/A</span>],
                  ['Score',               green(collab >= 50, `${collab}%   good`, collab > 0 ? `${collab}%   needs improvement` : '0%   no collaboration detected')],
                ];

                return (
                  <div style={{ marginTop: 16 }}>
                    {/* Step 1: Raw Scores */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', marginBottom: 10 }}>Step 1   Individual Metrics (Raw Scores)</div>

                      {barRow('Technical', tech, '#3b82f6', 'Code submission: completed + code written = full marks per task')}
                      {miniTbl('#eff6ff','#bfdbfe','#dbeafe','#1e40af',['Task','Completed','Code Written'], techRows, 'tech')}

                      {barRow('Speed', speed, '#10b981', 'Time efficiency: time taken vs time limit per task')}
                      {miniTbl('#f0fdf4','#bbf7d0','#dcfce7','#14532d',['Task','Time Taken','Limit','Status'], speedRows, 'spd')}

                      {barRow('Punctuality', punct, '#059669', 'On-time completion: same as speed, weighted by task')}
                      {miniTbl('#f0fdf4','#86efac','#dcfce7','#166534',['Task','Time Taken','Limit','On Time?'], speedRows, 'punc')}

                      {barRow('Adaptability', adapt, '#f59e0b', adaptDesc)}
                      {adaptPath === 'B'&& adaptTasks.length > 0 && (
                        <div style={{ marginLeft: 128, marginTop: 4, marginBottom: 8 }}>
                          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', background: '#fffbeb', borderRadius: 8, overflow: 'hidden', border: '1px solid #fde68a'}}>
                            <thead>
                              <tr style={{ background: '#fef3c7'}}>
                                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#92400e'}}>Task</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', color: '#92400e', fontWeight: 600 }}>On Time<br/>/{adaptMaxTime}</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', color: '#92400e', fontWeight: 600 }}>In Git<br/>/{adaptMaxGit}</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', color: '#92400e', fontWeight: 600 }}>Code<br/>/{adaptMaxCode}</th>
                                <th style={{ textAlign: 'center', padding: '4px 6px', color: '#92400e', fontWeight: 600 }}>Total<br/>/{adaptMaxTotal}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adaptTasks.map((t: any, idx: number) => {
                                // Cap scores at the proportional max (handles old sessions stored with fixed 40/40/20)
                                const dTime  = Math.min(t.time_score  ?? 0, adaptMaxTime);
                                const dGit   = Math.min(t.git_score   ?? 0, adaptMaxGit);
                                // If code is in git, the candidate wrote code   fix display for old sessions
                                const rawCode = t.code_score ?? 0;
                                const dCode  = rawCode > 0 ? Math.min(rawCode, adaptMaxCode) : (dGit > 0 ? adaptMaxCode : 0);
                                const dTotal = dTime + dGit + dCode;
                                return (
                                  <tr key={idx} style={{ borderTop: '1px solid #fde68a'}}>
                                    <td style={{ padding: '3px 8px', color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{t.task_title || `Task ${idx + 1}`}</td>
                                    <td style={{ textAlign: 'center', padding: '3px 6px', color: dTime > 0 ? '#16a34a': '#dc2626', fontWeight: 700 }}>{dTime}</td>
                                    <td style={{ textAlign: 'center', padding: '3px 6px', color: dGit  > 0 ? '#16a34a': '#dc2626', fontWeight: 700 }}>{dGit}</td>
                                    <td style={{ textAlign: 'center', padding: '3px 6px', color: dCode > 0 ? '#16a34a': '#dc2626', fontWeight: 700 }}>{dCode}</td>
                                    <td style={{ textAlign: 'center', padding: '3px 6px', fontWeight: 800, color: dTotal >= adaptMaxTotal * 0.7 ? '#16a34a': dTotal >= adaptMaxTotal * 0.4 ? '#d97706': '#dc2626'}}>{dTotal}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {barRow('Communication', comm, '#0ea5e9', 'Chat quality: tone, clarity, professionalism from AI analysis')}
                      {miniTbl('#f0f9ff','#bae6fd','#e0f2fe','#0c4a6e',['What was checked','Result'], commRows, 'comm')}

                      {barRow('GitHub', github, '#8b5cf6', 'Repository: commits, README, config files, code structure')}
                      {miniTbl('#faf5ff','#ddd6fe','#ede9fe','#4c1d95',['What was checked','Result'], ghRows, 'gh')}

                      {barRow('Collaboration', collab, '#ec4899', 'Message volume + conversation balance + responsiveness')}
                      {miniTbl('#fdf2f8','#f9a8d4','#fce7f3','#831843',['What was checked','Result'], collabRows, 'collab')}
                    </div>

                    {/* Step 2: Composite Scores */}
                    <div style={{ marginBottom: 16, padding: '12px 14px', background: '#faf5ff', borderRadius: 10, border: '1px solid #e9d5ff'}}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#7c3aed', marginBottom: 10 }}>Step 2   Composite Scores</div>

                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#374151'}}>
                          Quality = (Technical + Punctuality + Adaptability) ÷ 3
                        </div>
                        <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4, fontFamily: 'monospace', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb'}}>
                          = ({tech}% + {punct}% + {adapt}%) ÷ 3 = <strong style={{ color: '#7c3aed'}}>{quality}%</strong>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#374151'}}>
                          Behavioral = (Adaptability + Communication) ÷ 2
                        </div>
                        <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4, fontFamily: 'monospace', background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb'}}>
                          = ({adapt}% + {comm}%) ÷ 2 = <strong style={{ color: '#7c3aed'}}>{behavioral}%</strong>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Weighted Overall */}
                    {hasWeights && (
                      <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0'}}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#15803d', marginBottom: 10 }}>Step 3   Weighted Overall Score</div>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse'}}>
                          <thead>
                            <tr style={{ color: '#6b7280', fontSize: 11 }}>
                              <th style={{ textAlign: 'left', paddingBottom: 4, fontWeight: 600 }}>Component</th>
                              <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 600 }}>Score</th>
                              <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 600 }}>Weight</th>
                              <th style={{ textAlign: 'right', paddingBottom: 4, fontWeight: 600 }}>Contribution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: 'Quality', score: quality, w: wQ, c: cQ },
                              { label: 'Speed', score: speed, w: wS, c: cS },
                              { label: 'Behavioral', score: behavioral, w: wB, c: cB },
                              { label: 'GitHub', score: github, w: wG, c: cG },
                            ].map(({ label, score: s, w, c }) => (
                              <tr key={label} style={{ borderTop: '1px solid #dcfce7'}}>
                                <td style={{ padding: '5px 0', color: '#374151', fontWeight: 600 }}>{label}</td>
                                <td style={{ textAlign: 'right', color: s >= 70 ? '#16a34a': s >= 50 ? '#d97706': '#dc2626', fontWeight: 700 }}>{s}%</td>
                                <td style={{ textAlign: 'right', color: '#6b7280'}}>× {fmtW(w)}</td>
                                <td style={{ textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>= {c}</td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: '2px solid #16a34a', background: '#f0fdf4'}}>
                              <td colSpan={3} style={{ padding: '6px 0', fontWeight: 700, fontSize: 13, color: '#15803d'}}>
                                Overall Score ({fmtW(wQ)}+{fmtW(wS)}+{fmtW(wB)}+{fmtW(wG)} = 100%)
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: overall >= 70 ? '#16a34a': overall >= 50 ? '#d97706': '#dc2626'}}>
                                {overall}%
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Step 4: Pass/Fail */}
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: passed ? '#f0fdf4': '#fef2f2', border: `1px solid ${passed ? '#bbf7d0': '#fecaca'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: passed ? '#15803d': '#dc2626'}}>Step 4   Pass / Fail</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                          Your score {overall}% {passed ? '≥': '<'} {passingScore}% threshold → <strong>{passed ? 'PASSED': 'NOT PASSED'}</strong>
                        </div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: passed ? '#16a34a': '#dc2626'}}>
                        {passed ? '✓': '✗'}
                      </div>
                    </div>

                    {/* How recruiter scores work */}
                    <div style={{ marginTop: 14, padding: '10px 12px', background: '#faf5ff', borderRadius: 8, fontSize: 12, color: '#475569'}}>
                      <strong style={{ color: '#7c3aed'}}>How recruiter scores are added (Final Score):</strong>
                      <div style={{ marginTop: 6 }}>Final = AI Overall (above) × 70% + Recruiter Task Avg × 30%</div>
                      <div style={{ marginTop: 2 }}>Recruiter Task Avg = Σ(recruiter scores per task) ÷ total tasks (unscored = 0)</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Task Breakdown */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><CheckSquare size={17} style={{ color: '#7c3aed'}} /> Tasks Breakdown <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>({completedTasks}/{totalTasks} completed)</span></div>
              <div style={{ marginBottom: 20 }}><div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}><div style={{ height: '100%', width: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%`, background: '#16a34a', borderRadius: 3 }} /></div></div>
              <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: canGrade ? '#eff6ff': '#faf5ff', border: `1px solid ${canGrade ? '#bfdbfe': '#e9d5ff'}`, fontSize: 12, color: canGrade ? '#1d4ed8': '#7c3aed', fontWeight: 600 }}>{canGrade ? 'Recruiter view   you can set scores on any task': ' Candidate view   scores set by your recruiter appear below'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {taskProgress.map(task => {
                  const isExpanded = expandedTask === task.task_index;
                  const hasScore = task.score !== null;
                  const roundedScore = hasScore ? Math.round(task.score!) : null;
                  return (
                    <div key={task.task_id} className="task-card" style={{ borderRadius: 12, border: `1.5px solid ${taskBg(task.status, task.started_at).borderColor}`, background: taskBg(task.status, task.started_at).background, overflow: 'hidden'}}>
                      <div style={{ padding: '14px 16px'}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap'}}>
                          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                            <div style={{ marginTop: 2 }}>{statusIcon(task.status, task.started_at)}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#111827'}}>Task {task.task_index}: {task.task_title}</span>
                                {task.status === 'completed'&& <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><CheckCircle size={11} /> Completed</span>}
                                {task.status === 'in_progress'&& task.started_at && <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><Play size={11} /> In Progress</span>}
                                {(!task.started_at || (task.status === 'in_progress'&& !task.started_at)) && <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><Lock size={11} /> Not Started</span>}
                                {hasScore && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: scoreBg(roundedScore!), color: scoreColor(roundedScore!), border: `1px solid ${scoreBorder(roundedScore!)}` }}>Score: {roundedScore}%</span>}
                                {!hasScore && task.status === 'completed'&& <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a'}}>Pending Grade</span>}
                                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: task.task_type === 'technical'? '#dbeafe': '#f3e8ff', color: task.task_type === 'technical'? '#1d4ed8': '#7c3aed'}}>{task.task_type}</span>
                              </div>
                              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{task.task_description}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={12} /> {task.task_duration}m</span>
                            {canGrade && <button className="btn-score" onClick={() => setShowScoreModal(task.task_index)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: hasScore ? scoreBg(roundedScore!) : '#7c3aed', color: hasScore ? scoreColor(roundedScore!) : '#fff', border: hasScore ? `1.5px solid ${scoreBorder(roundedScore!)}` : 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><AwardIcon size={13} />{hasScore ? `Update (${roundedScore}%)` : 'Set Score'}</button>}
                            <button onClick={() => setExpandedTask(isExpanded ? null : task.task_index)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#9ca3af'}}>{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap'}}>
                          {task.status === 'completed'&& <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Completed</span>}
                          {task.status === 'in_progress'&& task.started_at && <span style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> In Progress</span>}
                          {(!task.started_at || (task.status === 'in_progress'&& !task.started_at)) && <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> Not Started</span>}
                          {task.github_commit_url && <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none'}} onClick={e => e.stopPropagation()}><GitBranch size={12} /> View GitHub <ExternalLink size={10} /></a>}
                          {task.time_spent > 0 && <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {formatTime(task.time_spent)}</span>}
                          {task.answer?.code && <span style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}><Terminal size={12} /> Code Submitted</span>}
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {hasScore && (
                            <div style={{ background: scoreBg(roundedScore!), border: `1.5px solid ${scoreBorder(roundedScore!)}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}><ScoreRing score={roundedScore!} size={56} stroke={5} /><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}><span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(roundedScore!) }}>{roundedScore}</span></div></div>
                              <div><div style={{ fontWeight: 700, color: scoreColor(roundedScore!), fontSize: 15 }}>Task Score: {roundedScore}%</div><div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{roundedScore! >= 80 ? 'Excellent performance': roundedScore! >= 60 ? 'Good performance': roundedScore! >= 40 ? 'Fair performance': 'Needs improvement'}</div></div>
                              {canGrade && <button onClick={() => setShowScoreModal(task.task_index)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff', border: `1px solid ${scoreBorder(roundedScore!)}`, color: scoreColor(roundedScore!), borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}><Edit2 size={12} /> Edit</button>}
                            </div>
                          )}
                          <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '14px 16px'}}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>Recruiter Feedback</span>{canGrade && editingFeedback !== task.task_index && <button onClick={() => { setTempFeedback(task.feedback || ''); setEditingFeedback(task.task_index); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Edit2 size={12} /> Edit</button>}</div>
                            {editingFeedback === task.task_index && canGrade ? (
                              <div>
                                <textarea value={tempFeedback} onChange={e => setTempFeedback(e.target.value)} rows={4} placeholder="Add feedback for this task…" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #bae6fd', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box'}} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                  <button onClick={() => handleSaveFeedback(task.task_index)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Save size={13} /> Save</button>
                                  <button onClick={() => setEditingFeedback(null)} style={{ padding: '7px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 13, color: task.feedback ? '#374151': '#9ca3af', fontStyle: task.feedback ? 'normal': 'italic', whiteSpace: 'pre-wrap'}}>{task.feedback || 'No feedback provided yet.'}</div>
                            )}
                          </div>
                          {task.github_commit_url && (
                            <div style={{ background: '#faf5ff', borderRadius: 10, padding: '12px 14px'}}>
                              <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13, marginBottom: 6 }}>GitHub Repository</div>
                              <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all', textDecoration: 'none'}}><GitBranch size={13} /> {task.github_commit_url} <ExternalLink size={11} /></a>
                            </div>
                          )}
                          {task.answer?.code && (
                            <div>
                              <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><FileCode size={14} style={{ color: '#7c3aed'}} /> Code Submission</div>
                              <CodeBlock code={task.answer.code} language="javascript" onCopy={() => copyCode(task.answer.code, task.task_index)} />
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                            {[
                              { label: 'Started', val: formatDate(task.started_at) },
                              { label: 'Completed', val: formatDate(task.completed_at) },
                              { label: 'Time Spent', val: formatTime(task.time_spent) },
                            ].map(it => (
                              <div key={it.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px'}}>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{it.label}</div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#374151'}}>{it.val}</div>
                              </div>
                            ))}
                          </div>
                          {task.template_task?.instructions && (
                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px'}}>
                              <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 6 }}>Task Instructions</div>
                              <pre style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit'}}>{task.template_task.instructions}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── AI Feedback from submission results ── */}
            {submissionResults?.feedback && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={17} style={{ color: '#7c3aed'}} /> AI Feedback
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>{submissionResults.feedback.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: submissionResults.feedback.improvements?.length > 0 ? '1fr 1fr': '1fr', gap: 16 }}>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 10, color: '#16a34a', fontSize: 13 }}>✓ Strengths</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {submissionResults.feedback.strengths?.map((s: string, i: number) => (
                        <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  {submissionResults.feedback.improvements?.length > 0 && (
                    <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 10, color: '#d97706', fontSize: 13 }}> Areas for Improvement</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {submissionResults.feedback.improvements.map((s: string, i: number) => (
                          <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 1.5 }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {submissionResults.feedback.detailed_feedback && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginTop: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#374151'}}>Detailed Feedback</div>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>{submissionResults.feedback.detailed_feedback}</p>
                  </div>
                )}
              </div>
            )}

            {/* Simulation Info */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9'}}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={17} style={{ color: '#7c3aed'}} /> Practical Assessment Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Practical Assessment', val: template.name },
                  { label: 'Job Title', val: job.title },
                  { label: 'Company', val: company.name },
                  { label: 'Difficulty', val: template.difficulty },
                  { label: 'Duration', val: template.duration_minutes ? `${template.duration_minutes} min` : undefined },
                  { label: 'Total Tasks', val: template.total_tasks || totalTasks },
                  { label: 'Time Spent', val: formatTime(session.time_spent) },
                  { label: 'Session Status', val: session.status },
                ].filter(r => r.val !== undefined && r.val !== null).map(row => (
                  <div key={row.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px'}}>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', textTransform: 'capitalize'}}>{String(row.val)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>

      {/* Admin Confirm Modal */}
      {adminConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, maxWidth: 440, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)'}}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: adminConfirm === 'cancel'? '#dc2626': adminConfirm === 'reset'? '#c2410c': '#15803d'}}>
              {adminConfirm === 'cancel'? '✕ Cancel Session': adminConfirm === 'reset'? '🔄 Reset from Scratch': '▶ Reopen to Continue'}
            </div>
            <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: 20 }}>
              {adminConfirm === 'cancel'
                ? 'This will void the session permanently. The candidate will not be able to continue. This action cannot be undone.'
                : adminConfirm === 'reset'
                ? 'This will erase ALL task progress and scores. The candidate starts completely fresh. This action cannot be undone.'
                : 'The session will be reopened as in-progress. All previous task answers and progress are kept. The candidate can log in and continue from where they left off.'}
            </p>
            {adminConfirm === 'cancel'&& (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Reason (optional)</label>
                <input
                  type="text"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Technical issue, candidate withdrew..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box'}}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
              <button
                onClick={() => setAdminConfirm(null)}
                disabled={!!adminActionLoading}
                style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151'}}
              >
                Back
              </button>
              <button
                onClick={adminConfirm === 'cancel'? handleAdminCancel : adminConfirm === 'reset'? handleAdminReset : handleAdminReopen}
                disabled={!!adminActionLoading}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: adminConfirm === 'cancel'? '#dc2626': adminConfirm === 'reset'? '#ea580c': '#16a34a', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#fff', opacity: adminActionLoading ? 0.6 : 1 }}
              >
                {adminActionLoading ? 'Processing…': adminConfirm === 'cancel'? 'Yes, Cancel Session': adminConfirm === 'reset'? 'Yes, Reset from Scratch': 'Yes, Reopen Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score Modal */}
      {showScoreModal !== null && (() => {
        const task = taskProgress.find(t => t.task_index === showScoreModal);
        if (!task) return null;
        return (
          <ScoreModal
            task={task}
            saving={saving}
            onSave={(score) => handleSaveScore(showScoreModal, score)}
            onClose={() => setShowScoreModal(null)}
          />
        );
      })()}

    </div>
  );
};

export default SessionReport;