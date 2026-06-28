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
import { verifyChain as verifyAuditChain } from '../services/blockchainAPI';

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
  s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';

const scoreBg = (s: number) =>
  s >= 80 ? '#f0fdf4' : s >= 60 ? '#fffbeb' : '#fef2f2';

const scoreBorder = (s: number) =>
  s >= 80 ? '#bbf7d0' : s >= 60 ? '#fde68a' : '#fecaca';

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
  if (status === 'completed') return <CheckCircle size={15} style={{ color: '#16a34a' }} />;
  if (status === 'in_progress' && !started_at) return <Lock size={15} style={{ color: '#9ca3af' }} />;
  if (status === 'in_progress') return <Play size={15} style={{ color: '#2563eb' }} />;
  return <Lock size={15} style={{ color: '#9ca3af' }} />;
};

const taskBg = (status: string, started_at?: string | null) => {
  if (status === 'completed') return { background: '#f0fdf4', borderColor: '#bbf7d0' };
  if (status === 'in_progress' && !started_at) return { background: '#f9fafb', borderColor: '#e5e7eb' };
  if (status === 'in_progress') return { background: '#eff6ff', borderColor: '#bfdbfe' };
  return { background: '#f9fafb', borderColor: '#e5e7eb' };
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
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
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
    { label: 'Poor', min: 0, max: 40, color: '#dc2626' },
    { label: 'Fair', min: 40, max: 60, color: '#d97706' },
    { label: 'Good', min: 60, max: 80, color: '#2563eb' },
    { label: 'Excellent', min: 80, max: 100, color: '#16a34a' },
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
            <div style={{ fontWeight: 700, fontSize: 17, color: '#111827' }}>Set Score — Task {task.task_index}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{task.task_title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
        </div>

        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <ScoreRing score={local} size={100} stroke={8} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(local) }}>{local}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>/ 100</div>
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 12px', borderRadius: 20, background: scoreBg(local), color: scoreColor(local), fontWeight: 600, fontSize: 13 }}>
            {currentGrade.label}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input type="range" min={0} max={100} step={5} value={local} onChange={e => setLocal(Number(e.target.value))} style={{ width: '100%', accentColor: scoreColor(local) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
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
          <input type="number" min={0} max={100} value={local} onChange={e => setLocal(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} style={{ width: 80, padding: '6px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 16, fontWeight: 700, color: scoreColor(local), textAlign: 'center' }} />
          <span style={{ fontSize: 13, color: '#9ca3af' }}>%</span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onSave(local)} disabled={saving} style={{ flex: 1, padding: '10px 0', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer', background: '#7c3aed', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}{saving ? 'Saving…' : 'Save Score'}
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
    <div style={{ background: '#1e293b', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Terminal size={12} style={{ color: '#34d399' }} />
        <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>{language || 'javascript'}</span>
      </div>
      <button onClick={onCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><Copy size={11} /> Copy</button>
    </div>
    <pre style={{ background: '#0f172a', padding: 14, margin: 0, overflowX: 'auto', maxHeight: 320, overflowY: 'auto', fontSize: 12, color: '#e2e8f0', fontFamily: 'monospace', lineHeight: 1.6 }}>
      <code>{code.split('\n').slice(0, 40).join('\n')}{code.split('\n').length > 40 ? '\n\n// … truncated' : ''}</code>
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
  const [activeTab, setActiveTab] = useState<'report' | 'submission'>('report');
  const [chainReport, setChainReport] = useState<{ valid: boolean; totalBlocks: number; verifiedCount: number; failedCount: number } | null>(null);
  const [chainVerifying, setChainVerifying] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  const verifyResultsOnChain = async () => {
    setChainVerifying(true);
    setChainError(null);
    try {
      const report = await verifyAuditChain();
      setChainReport(report);
    } catch (e: any) {
      setChainError(e?.message || 'Verification failed');
    } finally {
      setChainVerifying(false);
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

      // Extract submission_results from the session data
      if (data?.submission_results) {
        console.log('✅ Submission results found in session data');
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
          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
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
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `session_report_${sessionId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, border: '3px solid #e5e7eb', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ color: '#6b7280', fontSize: 14 }}>Loading session report…</div>
      </div>
    </div>
  );

  if (error || !sessionData) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32, background: '#fff', borderRadius: 20 }}>
        <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
        <h2 style={{ margin: '0 0 8px', color: '#111827' }}>Session Not Found</h2>
        <p style={{ color: '#6b7280', marginBottom: 20 }}>{error || 'Session does not exist.'}</p>
        <code style={{ display: 'block', padding: '8px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 11, marginBottom: 20 }}>Session ID: {sessionId}</code>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
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
  const inProgressTasks = taskProgress.filter(t => t.status === 'in_progress' && t.started_at).length;
  const notStartedTasks = taskProgress.filter(t => !t.started_at || (t.status === 'in_progress' && !t.started_at)).length;
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
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, padding: '12px 20px', borderRadius: 12, background: toast.ok ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 600, fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', animation: 'fadeUp 0.25s ease' }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="no-print" style={{ background: '#fff', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBack} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#374151', fontWeight: 600, fontSize: 13 }}>
              <ArrowLeft size={15} /> Back
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>Session Report</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>{sessionId?.substring(0, 8)}…{sessionId?.substring(sessionId.length - 4)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setActiveTab('report')} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === 'report' ? '#fff' : 'transparent', color: activeTab === 'report' ? '#7c3aed' : '#6b7280', border: 'none', cursor: 'pointer', boxShadow: activeTab === 'report' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Report</button>
              <button onClick={() => setActiveTab('submission')} style={{ padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === 'submission' ? '#fff' : 'transparent', color: activeTab === 'submission' ? '#7c3aed' : '#6b7280', border: 'none', cursor: 'pointer', boxShadow: activeTab === 'submission' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>Submission Results</button>
            </div>
            <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Printer size={14} /> Print / PDF</button>
            <button onClick={downloadReport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Download size={14} /> Download JSON</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ============================================ */}
        {/* SUBMISSION RESULTS TAB                       */}
        {/* ============================================ */}
        {activeTab === 'submission' && submissionResults && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Header Card */}
            <div style={{ borderRadius: 16, padding: 24, border: `2px solid ${passed ? '#bbf7d0' : '#fecaca'}`, background: passed ? '#f0fdf4' : '#fef2f2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {passed ? <Trophy size={48} style={{ color: '#16a34a' }} /> : <AlertTriangle size={48} style={{ color: '#dc2626' }} />}
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: passed ? '#16a34a' : '#dc2626' }}>{passed ? '✓ Simulation Passed!' : '✗ Simulation Not Passed'}</h2>
                    <p style={{ margin: '8px 0 0', color: '#374151' }}>{submissionResults.message || `Score: ${submissionResults.score}%`}</p>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                      <span>Submitted: {submissionResults.submittedAt ? new Date(submissionResults.submittedAt).toLocaleString() : formatDate(session.completed_at)}</span>
                      <span>•</span>
                      <span>Version: {submissionResults.version || '1.0'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: '#7c3aed' }}>{submissionResults.score || overallScore}%</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>Final Score</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Passing: {submissionResults.passingScore || 70}%</div>
                </div>
              </div>
            </div>

            {/* Hiring Recommendation Card */}
            {(() => {
              const rec = submissionResults.hiringRecommendation || submissionResults.feedback?.hiring_recommendation;
              if (!rec) return null;
              const palette: Record<string, { fg: string; bg: string; border: string }> = {
                strong_hire: { fg: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                hire: { fg: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
                borderline: { fg: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                needs_improvement: { fg: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
                not_recommended: { fg: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
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
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><BarChart size={18} style={{ color: '#7c3aed' }} /> Summary Statistics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{submissionResults.summary.completion_rate || 0}%</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Completion Rate</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>{submissionResults.summary.completed_tasks || 0}/{submissionResults.summary.total_tasks || totalTasks}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Tasks Completed</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{submissionResults.summary.total_time_formatted || formatTime(session.time_spent)}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Total Time</div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{submissionResults.completionAngle || 0}°</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Completion Angle</div>
                  </div>
                </div>
                {submissionResults.summary.completion_rate && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Overall Progress</span><span>{submissionResults.summary.completion_rate}%</span></div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${submissionResults.summary.completion_rate}%`, background: '#16a34a', borderRadius: 3 }} /></div>
                  </div>
                )}
              </div>
            )}

            {/* Score Breakdown */}
            {submissionResults.scoreBreakdown && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={18} style={{ color: '#7c3aed' }} /> Score Breakdown</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <div style={{ background: '#faf5ff', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{submissionResults.scoreBreakdown.quality || 0}%</div><div style={{ fontSize: 12, color: '#6b7280' }}>Quality</div></div>
                  <div style={{ background: '#eff6ff', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>{submissionResults.scoreBreakdown.speed || 0}%</div><div style={{ fontSize: 12, color: '#6b7280' }}>Speed</div></div>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{submissionResults.scoreBreakdown.technical || 0}%</div><div style={{ fontSize: 12, color: '#6b7280' }}>Technical</div></div>
                  <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{submissionResults.scoreBreakdown.github || 0}%</div><div style={{ fontSize: 12, color: '#6b7280' }}>GitHub</div></div>
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
                          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .4s' }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Feedback Card */}
            {submissionResults.feedback && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={18} style={{ color: '#7c3aed' }} /> Feedback</h3>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a' }}>Summary</div>
                  <p style={{ margin: 0, color: '#374151' }}>{submissionResults.feedback.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a' }}>✓ Strengths</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {submissionResults.feedback.strengths?.map((s: string, i: number) => <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s}</li>)}
                    </ul>
                  </div>
                  {submissionResults.feedback.improvements?.length > 0 && (
                    <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: '#d97706' }}>⚠ Areas for Improvement</div>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {submissionResults.feedback.improvements.map((s: string, i: number) => <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Detailed Feedback</div>
                  <p style={{ margin: 0, color: '#374151' }}>{submissionResults.feedback.detailed_feedback}</p>
                </div>
              </div>
            )}

            {/* Data Quality Card */}
            {submissionResults.dataQuality && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={18} style={{ color: '#7c3aed' }} /> Data Quality</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, background: submissionResults.dataQuality.grade === 'A' ? '#f0fdf4' : '#eff6ff', color: submissionResults.dataQuality.grade === 'A' ? '#16a34a' : '#2563eb' }}>{submissionResults.dataQuality.grade}</div>
                  <div><div style={{ fontWeight: 600 }}>{submissionResults.dataQuality.description}</div><div style={{ fontSize: 13, color: '#6b7280' }}>Average Answer Quality: {submissionResults.dataQuality.average_answer_quality}%</div></div>
                </div>
              </div>
            )}

            {/* Time Tracking Card */}
            {submissionResults.timeTracking && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} style={{ color: '#7c3aed' }} /> Time Tracking</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Started At</div><div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(submissionResults.timeTracking.sessionStartedAt).toLocaleString()}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Completed At</div><div style={{ fontWeight: 600, fontSize: 13 }}>{new Date(submissionResults.timeTracking.sessionCompletedAt).toLocaleString()}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Total Time</div><div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{submissionResults.timeTracking.sessionTotalFormatted}</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Time Limit</div><div style={{ fontWeight: 600 }}>{submissionResults.timeTracking.timeLimitFormatted}</div></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span>Time Used</span><span style={{ color: (submissionResults.timeTracking.timeUsedPercent || 0) > 100 ? '#dc2626' : '#16a34a' }}>{submissionResults.timeTracking.timeUsedPercent || 0}%</span></div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, submissionResults.timeTracking.timeUsedPercent || 0)}%`, background: (submissionResults.timeTracking.timeUsedPercent || 0) > 100 ? '#dc2626' : '#16a34a', borderRadius: 3 }} /></div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>{submissionResults.timeTracking.submittedOnTime ? '✓ Submitted on time' : '⚠ Submitted after time limit'}</div>
                </div>
              </div>
            )}

            {/* Data Quantity Card */}
            {submissionResults.dataQuantity && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Database size={18} style={{ color: '#7c3aed' }} /> Data Quantity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{submissionResults.dataQuantity.answers_submitted || 0}</div><div style={{ fontSize: 11, color: '#6b7280' }}>Answers Submitted</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{submissionResults.dataQuantity.tasks_attempted || 0}</div><div style={{ fontSize: 11, color: '#6b7280' }}>Tasks Attempted</div></div>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb' }}>{submissionResults.dataQuantity.data_completeness_percent || 0}%</div><div style={{ fontSize: 11, color: '#6b7280' }}>Completeness</div></div>
                </div>
              </div>
            )}

            {/* Timeline */}
            {(() => {
              const events: Array<{ label: string; time: string }> = [];
              const push = (label: string, time?: string | null) => { if (time) events.push({ label, time }); };
              push('Simulation assigned', session.created_at || sessionData.application?.created_at);
              push('Simulation started', session.started_at);
              push('Final submission', session.completed_at || submissionResults.submittedAt);
              push('AI evaluation completed', submissionResults.timeTracking?.sessionCompletedAt || submissionResults.generatedAt);
              push('Results published', submissionResults.submittedAt || session.completed_at);
              const sorted = events
                .filter(e => !isNaN(new Date(e.time).getTime()))
                .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
              if (sorted.length === 0) return null;
              return (
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} style={{ color: '#7c3aed' }} /> Timeline</h3>
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    {sorted.map((e, i) => (
                      <div key={i} style={{ position: 'relative', paddingBottom: i === sorted.length - 1 ? 0 : 18 }}>
                        <div style={{ position: 'absolute', left: -16, top: 2, width: 10, height: 10, borderRadius: '50%', background: '#7c3aed' }} />
                        {i !== sorted.length - 1 && <div style={{ position: 'absolute', left: -12, top: 12, width: 2, bottom: -6, background: '#e9d5ff' }} />}
                        <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{e.label}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{new Date(e.time).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Evidence & Attachments */}
            {(() => {
              const repoUrl = submissionResults.githubAnalysis?.repo_info?.repoUrl;
              const codeTasks = (taskProgress || []).filter((t: any) => t?.answer && (typeof t.answer === 'string' ? t.answer : t.answer.code));
              if (!repoUrl && codeTasks.length === 0) return null;
              const downloadText = (filename: string, content: string) => {
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
              };
              return (
                <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><FolderOpen size={18} style={{ color: '#7c3aed' }} /> Evidence & Attachments</h3>
                  {repoUrl && (
                    <a href={repoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 10, color: '#2563eb', textDecoration: 'none', fontSize: 14 }}>
                      <GitBranch size={16} /> Repository — {repoUrl}
                    </a>
                  )}
                  {codeTasks.map((t: any, i: number) => {
                    const code = typeof t.answer === 'string' ? t.answer : (t.answer.code || '');
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: '#f8fafc', borderRadius: 10, marginBottom: 8 }}>
                        <FileCode size={16} style={{ color: '#6b7280' }} />
                        <span style={{ flex: 1, fontSize: 14, color: '#374151' }}>Task {t.task_index} submission</span>
                        <button onClick={() => downloadText(`task-${t.task_index}-submission.txt`, code)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}><Download size={13} /> Download</button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Evaluation Metadata */}
            {(evaluation?.id || submissionResults.simulationRecordId) && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} style={{ color: '#7c3aed' }} /> Evaluation Metadata</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: 13 }}>
                  {(evaluation?.id || submissionResults.simulationRecordId) && <div><div style={{ fontSize: 11, color: '#9ca3af' }}>Evaluation ID</div><code style={{ fontSize: 12 }}>{evaluation?.id || submissionResults.simulationRecordId}</code></div>}
                  <div><div style={{ fontSize: 11, color: '#9ca3af' }}>Evaluation Date</div><div>{submissionResults.submittedAt ? new Date(submissionResults.submittedAt).toLocaleString() : '—'}</div></div>
                  <div><div style={{ fontSize: 11, color: '#9ca3af' }}>Passing Score</div><div>{submissionResults.passingScore || 70}%</div></div>
                  <div><div style={{ fontSize: 11, color: '#9ca3af' }}>Confirmation Email</div><div>{submissionResults.emailSent ? '✓ Sent' : '—'}</div></div>
                </div>
              </div>
            )}

            {/* Verify Results on the audit chain */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={18} style={{ color: '#7c3aed' }} /> Integrity Verification</h3>
                <button onClick={verifyResultsOnChain} disabled={chainVerifying} className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: chainVerifying ? 0.6 : 1 }}>
                  <ShieldCheck size={14} /> {chainVerifying ? 'Verifying…' : 'Verify Results'}
                </button>
              </div>
              {chainError && <div style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{chainError}</div>}
              {chainReport && (
                <div style={{ marginTop: 16 }}>
                  {chainReport.valid ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontWeight: 700 }}><ShieldCheck size={18} /> 🟢 Verified — The assessment has not been modified since it was recorded.</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700 }}><ShieldAlert size={18} /> 🔴 Verification Failed — The assessment data does not match the blockchain record.</div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{chainReport.verifiedCount}/{chainReport.totalBlocks} blocks verified · {chainReport.failedCount} failed</div>
                </div>
              )}
            </div>

            {/* Blockchain Card */}
            {submissionResults.blockchain && (
              <div style={{ background: 'linear-gradient(135deg, #faf5ff, #eff6ff)', borderRadius: 16, padding: 24, border: '1px solid #e9d5ff' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Database size={18} style={{ color: '#7c3aed' }} /> Blockchain Verification</h3>
                <div><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Transaction Hash</div><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{submissionResults.blockchain.txHash}</code></div>
                <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Block Number</div><div style={{ fontWeight: 600 }}>{submissionResults.blockchain.blockNumber}</div></div>
                {submissionResults.blockchain.credentialHash && (
                  <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Credential Hash</div><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{submissionResults.blockchain.credentialHash}</code></div>
                )}
                <div style={{ marginTop: 12, color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle size={14} /> {submissionResults.blockchain.message}</div>
                {submissionResults.blockchain.credentialHash && (
                  <a
                    href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'}/simulations/verify/${submissionResults.blockchain.credentialHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, padding: '8px 16px', borderRadius: 10, background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                  >
                    <CheckCircle size={14} /> Verify on blockchain
                  </a>
                )}
              </div>
            )}

            {/* No results fallback */}
            {!submissionResults && session.status === 'completed' && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
                <h3 style={{ margin: 0, color: '#374151' }}>No Submission Results Available</h3>
                <p style={{ color: '#6b7280', marginTop: 8 }}>The simulation has been completed but detailed results are not yet available.</p>
              </div>
            )}
          </div>
        )}

        {/* ============================================ */}
        {/* REPORT TAB - WITH SUBMISSION RESULTS INTEGRATED */}
        {/* ============================================ */}
        {activeTab === 'report' && (
          <>
            {/* ── Submission result banner (shown when data is available) ── */}
            {submissionResults && (
              <div style={{
                borderRadius: 16, padding: '18px 24px',
                border: `1.5px solid ${passed ? '#bbf7d0' : '#fecaca'}`,
                background: passed ? '#f0fdf4' : '#fef2f2',
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                  {passed
                    ? <Trophy size={36} style={{ color: '#16a34a', flexShrink: 0 }} />
                    : <AlertTriangle size={36} style={{ color: '#dc2626', flexShrink: 0 }} />
                  }
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: passed ? '#16a34a' : '#dc2626' }}>
                      {passed ? 'Simulation Passed' : 'Simulation Not Passed'}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                      {submissionResults.message || `Score: ${submissionResults.score}%`}
                    </div>
                  </div>
                </div>
                {sb && (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Quality', val: sb.quality, color: '#7c3aed' },
                      { label: 'Speed', val: sb.speed, color: '#2563eb' },
                      { label: 'Technical', val: sb.technical, color: '#16a34a' },
                      { label: 'GitHub', val: sb.github, color: '#d97706' },
                      { label: 'Behavioral', val: sb.behavioral, color: '#0891b2' },
                      { label: 'Communication', val: sb.communication, color: '#9333ea' },
                    ].filter(s => s.val !== undefined && s.val !== null).map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{Math.round(s.val)}%</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Candidate Hero */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                {candidate.profile_photo_url ? (
                  <img src={candidate.profile_photo_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22 }}>{initials || '?'}</div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 22, color: '#111827' }}>{candidate.full_name || candidate.name || 'Candidate'}</div>
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
                <div style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}><ScoreRing score={overallScore} size={84} stroke={7} /><div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(overallScore) }}>{Math.round(overallScore)}</div><div style={{ fontSize: 9, color: '#9ca3af' }}>/ 100</div></div></div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Overall Score</div>
                  <div style={{ marginTop: 6 }}>{passed ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><CheckCircle size={11} />Passed</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><XCircle size={11} />Failed</span>}</div>
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
              {[
                { icon: <CheckCircle size={20} style={{ color: '#16a34a' }} />, label: 'Completed', val: completedTasks, bg: '#f0fdf4' },
                { icon: <Play size={20} style={{ color: '#2563eb' }} />, label: 'In Progress', val: inProgressTasks, bg: '#eff6ff' },
                { icon: <Lock size={20} style={{ color: '#9ca3af' }} />, label: 'Not Started', val: notStartedTasks, bg: '#f9fafb' },
                { icon: <AwardIcon size={20} style={{ color: '#7c3aed' }} />, label: 'Graded', val: gradedTasks.length, bg: '#faf5ff' },
                ...(avgTaskScore !== null ? [{ icon: <BarChart2 size={20} style={{ color: '#d97706' }} />, label: 'Avg Task Score', val: `${avgTaskScore}%`, bg: '#fffbeb' }] : []),
              ].map((s, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 14px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{s.val}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Score Dimensions from evaluation */}
            {dimensions.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={17} style={{ color: '#7c3aed' }} /> Score Dimensions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {dimensions.map(d => (
                    <div key={d.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{d.label}</span><span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(d.val) }}>{d.val}%</span></div>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: `${d.val}%`, background: scoreColor(d.val), borderRadius: 3 }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score Breakdown from submissionResults */}
            {sb && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={17} style={{ color: '#7c3aed' }} /> Detailed Score Breakdown
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
                    <div key={d.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{d.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(Math.round(d.val)) }}>{Math.round(d.val)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(d.val)}%`, background: scoreColor(Math.round(d.val)), borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How this score is calculated (collapsible) */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setShowCalc(s => !s)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#7c3aed' }}
              >
                <Brain size={17} /> {showCalc ? '▲ Hide how this score is calculated' : '▼ How this score is calculated'}
              </button>
              {showCalc && (
                <div style={{ marginTop: 14, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                  <div><strong>1. Each task (0–100):</strong> (Completion + Time + Quality + Answer-quality) ÷ 4.</div>
                  <div><strong>2. Competencies (0–100):</strong> Punctuality, Speed, Technical, Adaptability, Communication, Collaboration, Initiative, Attention to Detail, GitHub — each scored by the AI from the candidate's work, chat, time and GitHub repo.</div>
                  <div><strong>3. Composites:</strong> Quality = (Technical + Punctuality + Adaptability) ÷ 3 · Behavioral = (Adaptability + Communication) ÷ 2.</div>
                  <div style={{ marginTop: 4, color: '#0f172a' }}><strong>4. Overall Score = Quality×0.60 + Speed×0.15 + Behavioral×0.10 + GitHub×0.15</strong> (weights from the simulation rubric; defaults shown). Pass mark default 70%.</div>
                  <div style={{ marginTop: 8, padding: '10px 12px', background: '#faf5ff', borderRadius: 8 }}>
                    <strong>Recruiter task marks:</strong> admin/recruiter can set a 0–100% score and comment on each completed task above. Where used, the final blends 70% AI + 30% recruiter task average.
                  </div>
                </div>
              )}
            </div>

            {/* Task Breakdown */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}><CheckSquare size={17} style={{ color: '#7c3aed' }} /> Tasks Breakdown <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>({completedTasks}/{totalTasks} completed)</span></div>
              <div style={{ marginBottom: 20 }}><div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}><div style={{ height: '100%', width: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%`, background: '#16a34a', borderRadius: 3 }} /></div></div>
              <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: canGrade ? '#eff6ff' : '#faf5ff', border: `1px solid ${canGrade ? '#bfdbfe' : '#e9d5ff'}`, fontSize: 12, color: canGrade ? '#1d4ed8' : '#7c3aed', fontWeight: 600 }}>{canGrade ? '🎯 Recruiter view — you can set scores on any task' : '👤 Candidate view — scores set by your recruiter appear below'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {taskProgress.map(task => {
                  const isExpanded = expandedTask === task.task_index;
                  const hasScore = task.score !== null;
                  const roundedScore = hasScore ? Math.round(task.score!) : null;
                  return (
                    <div key={task.task_id} className="task-card" style={{ borderRadius: 12, border: `1.5px solid ${taskBg(task.status, task.started_at).borderColor}`, background: taskBg(task.status, task.started_at).background, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                            <div style={{ marginTop: 2 }}>{statusIcon(task.status, task.started_at)}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Task {task.task_index}: {task.task_title}</span>
                                {task.status === 'completed' && <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><CheckCircle size={11} /> Completed</span>}
                                {task.status === 'in_progress' && task.started_at && <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><Play size={11} /> In Progress</span>}
                                {(!task.started_at || (task.status === 'in_progress' && !task.started_at)) && <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, fontSize: 11, fontWeight: 600 }}><Lock size={11} /> Not Started</span>}
                                {hasScore && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: scoreBg(roundedScore!), color: scoreColor(roundedScore!), border: `1px solid ${scoreBorder(roundedScore!)}` }}>Score: {roundedScore}%</span>}
                                {!hasScore && task.status === 'completed' && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>Pending Grade</span>}
                                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: task.task_type === 'technical' ? '#dbeafe' : '#f3e8ff', color: task.task_type === 'technical' ? '#1d4ed8' : '#7c3aed' }}>{task.task_type}</span>
                              </div>
                              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{task.task_description}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={12} /> {task.task_duration}m</span>
                            {canGrade && <button className="btn-score" onClick={() => setShowScoreModal(task.task_index)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: hasScore ? scoreBg(roundedScore!) : '#7c3aed', color: hasScore ? scoreColor(roundedScore!) : '#fff', border: hasScore ? `1.5px solid ${scoreBorder(roundedScore!)}` : 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><AwardIcon size={13} />{hasScore ? `Update (${roundedScore}%)` : 'Set Score'}</button>}
                            <button onClick={() => setExpandedTask(isExpanded ? null : task.task_index)} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#9ca3af' }}>{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                          {task.status === 'completed' && <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={12} /> Completed</span>}
                          {task.status === 'in_progress' && task.started_at && <span style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> In Progress</span>}
                          {(!task.started_at || (task.status === 'in_progress' && !task.started_at)) && <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}><Lock size={12} /> Not Started</span>}
                          {task.github_commit_url && <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }} onClick={e => e.stopPropagation()}><GitBranch size={12} /> View GitHub <ExternalLink size={10} /></a>}
                          {task.time_spent > 0 && <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {formatTime(task.time_spent)}</span>}
                          {task.answer?.code && <span style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}><Terminal size={12} /> Code Submitted</span>}
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {hasScore && (
                            <div style={{ background: scoreBg(roundedScore!), border: `1.5px solid ${scoreBorder(roundedScore!)}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                              <div style={{ position: 'relative', flexShrink: 0 }}><ScoreRing score={roundedScore!} size={56} stroke={5} /><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(roundedScore!) }}>{roundedScore}</span></div></div>
                              <div><div style={{ fontWeight: 700, color: scoreColor(roundedScore!), fontSize: 15 }}>Task Score: {roundedScore}%</div><div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{roundedScore! >= 80 ? 'Excellent performance' : roundedScore! >= 60 ? 'Good performance' : roundedScore! >= 40 ? 'Fair performance' : 'Needs improvement'}</div></div>
                              {canGrade && <button onClick={() => setShowScoreModal(task.task_index)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff', border: `1px solid ${scoreBorder(roundedScore!)}`, color: scoreColor(roundedScore!), borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}><Edit2 size={12} /> Edit</button>}
                            </div>
                          )}
                          <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '14px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>Recruiter Feedback</span>{canGrade && editingFeedback !== task.task_index && <button onClick={() => { setTempFeedback(task.feedback || ''); setEditingFeedback(task.task_index); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><Edit2 size={12} /> Edit</button>}</div>
                            {editingFeedback === task.task_index && canGrade ? (
                              <div>
                                <textarea value={tempFeedback} onChange={e => setTempFeedback(e.target.value)} rows={4} placeholder="Add feedback for this task…" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #bae6fd', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                  <button onClick={() => handleSaveFeedback(task.task_index)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Save size={13} /> Save</button>
                                  <button onClick={() => setEditingFeedback(null)} style={{ padding: '7px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 13, color: task.feedback ? '#374151' : '#9ca3af', fontStyle: task.feedback ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>{task.feedback || 'No feedback provided yet.'}</div>
                            )}
                          </div>
                          {task.github_commit_url && (
                            <div style={{ background: '#faf5ff', borderRadius: 10, padding: '12px 14px' }}>
                              <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13, marginBottom: 6 }}>GitHub Repository</div>
                              <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all', textDecoration: 'none' }}><GitBranch size={13} /> {task.github_commit_url} <ExternalLink size={11} /></a>
                            </div>
                          )}
                          {task.answer?.code && (
                            <div>
                              <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><FileCode size={14} style={{ color: '#7c3aed' }} /> Code Submission</div>
                              <CodeBlock code={task.answer.code} language="javascript" onCopy={() => copyCode(task.answer.code, task.task_index)} />
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                            {[
                              { label: 'Started', val: formatDate(task.started_at) },
                              { label: 'Completed', val: formatDate(task.completed_at) },
                              { label: 'Time Spent', val: formatTime(task.time_spent) },
                            ].map(it => (
                              <div key={it.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>{it.label}</div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>{it.val}</div>
                              </div>
                            ))}
                          </div>
                          {task.template_task?.instructions && (
                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                              <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 6 }}>Task Instructions</div>
                              <pre style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{task.template_task.instructions}</pre>
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
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MessageSquare size={17} style={{ color: '#7c3aed' }} /> AI Feedback
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>{submissionResults.feedback.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: submissionResults.feedback.improvements?.length > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
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
                      <div style={{ fontWeight: 600, marginBottom: 10, color: '#d97706', fontSize: 13 }}>⚠ Areas for Improvement</div>
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
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#374151' }}>Detailed Feedback</div>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.6 }}>{submissionResults.feedback.detailed_feedback}</p>
                  </div>
                )}
              </div>
            )}

            {/* Simulation Info */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={17} style={{ color: '#7c3aed' }} /> Simulation Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Simulation', val: template.name },
                  { label: 'Job Title', val: job.title },
                  { label: 'Company', val: company.name },
                  { label: 'Difficulty', val: template.difficulty },
                  { label: 'Duration', val: template.duration_minutes ? `${template.duration_minutes} min` : undefined },
                  { label: 'Total Tasks', val: template.total_tasks || totalTasks },
                  { label: 'Time Spent', val: formatTime(session.time_spent) },
                  { label: 'Session Status', val: session.status },
                ].filter(r => r.val !== undefined && r.val !== null).map(row => (
                  <div key={row.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', textTransform: 'capitalize' }}>{String(row.val)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>

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