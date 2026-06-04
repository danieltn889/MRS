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
  BarChart2, Percent
} from 'lucide-react';
import simulationAPI from '../services/simulationAPI';

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

// Fixed statusIcon - handles 'in_progress' without started_at as 'not_started'
const statusIcon = (status: string, started_at?: string | null) => {
  if (status === 'completed') return <CheckCircle size={15} style={{ color: '#16a34a' }} />;
  // If status is 'in_progress' but no started_at, treat as 'not_started'
  if (status === 'in_progress' && !started_at) {
    return <Lock size={15} style={{ color: '#9ca3af' }} />;
  }
  if (status === 'in_progress') return <Play size={15} style={{ color: '#2563eb' }} />;
  return <Lock size={15} style={{ color: '#9ca3af' }} />;
};

// Fixed taskBg - handles 'in_progress' without started_at as 'not_started'
const taskBg = (status: string, started_at?: string | null) => {
  if (status === 'completed') return { background: '#f0fdf4', borderColor: '#bbf7d0' };
  // If 'in_progress' but no started_at, treat as 'not_started'
  if (status === 'in_progress' && !started_at) {
    return { background: '#f9fafb', borderColor: '#e5e7eb' };
  }
  if (status === 'in_progress') return { background: '#eff6ff', borderColor: '#bfdbfe' };
  return { background: '#f9fafb', borderColor: '#e5e7eb' };
};

// Helper to get effective status
const getEffectiveStatus = (task: TaskProgressItem): string => {
  if (task.status === 'completed') return 'completed';
  if (task.status === 'in_progress' && !task.started_at) return 'not_started';
  if (task.status === 'in_progress') return 'in_progress';
  return 'not_started';
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
  const [local, setLocal] = useState<number>(
    task.score !== null ? Math.round(task.score) : 70
  );

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
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#111827' }}>
              Set Score — Task {task.task_index}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{task.task_title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
            <X size={20} />
          </button>
        </div>

        {/* Score display */}
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <ScoreRing score={local} size={100} stroke={8} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: scoreColor(local) }}>{local}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>/ 100</div>
            </div>
          </div>
          <div style={{
            marginTop: 8, display: 'inline-block', padding: '3px 12px',
            borderRadius: 20, background: scoreBg(local),
            color: scoreColor(local), fontWeight: 600, fontSize: 13
          }}>
            {currentGrade.label}
          </div>
        </div>

        {/* Slider */}
        <div style={{ marginBottom: 16 }}>
          <input
            type="range" min={0} max={100} step={5} value={local}
            onChange={e => setLocal(Number(e.target.value))}
            style={{ width: '100%', accentColor: scoreColor(local) }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
          </div>
        </div>

        {/* Quick pick buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Poor', val: 20 },
            { label: 'Fair', val: 50 },
            { label: 'Good', val: 70 },
            { label: 'Excellent', val: 90 },
          ].map(g => (
            <button
              key={g.label}
              onClick={() => setLocal(g.val)}
              style={{
                flex: 1, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${local === g.val ? scoreColor(g.val) : '#e5e7eb'}`,
                background: local === g.val ? scoreBg(g.val) : '#fff',
                color: local === g.val ? scoreColor(g.val) : '#6b7280',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s'
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Number input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 13, color: '#374151', flexShrink: 0 }}>Exact score:</span>
          <input
            type="number" min={0} max={100} value={local}
            onChange={e => setLocal(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            style={{
              width: 80, padding: '6px 10px', border: '1.5px solid #e5e7eb',
              borderRadius: 8, fontSize: 16, fontWeight: 700,
              color: scoreColor(local), textAlign: 'center'
            }}
          />
          <span style={{ fontSize: 13, color: '#9ca3af' }}>%</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => onSave(local)}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, cursor: saving ? 'not-allowed' : 'pointer',
              background: '#7c3aed', color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6, opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Score'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: '#f3f4f6', color: '#374151', border: 'none', fontWeight: 600
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Code Block ───────────────────────────────────────────────────────────────

const CodeBlock: React.FC<{ code: string; language: string; onCopy: () => void }> = ({ code, language, onCopy }) => (
  <div style={{ borderRadius: 10, overflow: 'hidden', marginTop: 12 }}>
    <div style={{
      background: '#1e293b', padding: '8px 14px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Terminal size={12} style={{ color: '#34d399' }} />
        <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace' }}>{language || 'javascript'}</span>
      </div>
      <button
        onClick={onCopy}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
      >
        <Copy size={11} /> Copy
      </button>
    </div>
    <pre style={{
      background: '#0f172a', padding: 14, margin: 0, overflowX: 'auto',
      maxHeight: 320, overflowY: 'auto', fontSize: 12, color: '#e2e8f0',
      fontFamily: 'monospace', lineHeight: 1.6
    }}>
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
  const [error, setError] = useState<string | null>(null);
  const [taskProgress, setTaskProgress] = useState<TaskProgressItem[]>([]);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [editingFeedback, setEditingFeedback] = useState<number | null>(null);
  const [tempFeedback, setTempFeedback] = useState('');
  const [showScoreModal, setShowScoreModal] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [apiResponseData, setApiResponseData] = useState<any>(null);

  // ── Toast helper ──
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load user ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ── Can grade? recruiters/admins only ──
  const canGrade = (() => {
    if (!currentUser) return false;
    const t = currentUser.user_type || currentUser.role || currentUser.type || '';
    return ['recruiter', 'company_admin', 'Company Admin', 'admin', 'system_admin'].includes(t);
  })();

  // ── Fetch session ──
  useEffect(() => {
    if (sessionId) fetchSession();
    else { setError('No session ID provided'); setLoading(false); }
  }, [sessionId]);

  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      console.log('🔍 Fetching session data for ID:', sessionId);
      
      const response = await simulationAPI.getSessionById(sessionId);
      console.log('📡 Raw API response:', response);
      
      // The API returns { success: true, data: {...} }
      const data = response?.data || response;
      setApiResponseData(data);
      
      if (!data) {
        throw new Error('No data returned from API');
      }
      
      // Check if the response has the expected structure
      if (data.session || data.candidate || data.simulation_template) {
        setSessionData(data);
        if (data?.task_progress) setTaskProgress(data.task_progress);
        setError(null);
      } else if (data.message === 'Session not found' || !data.session) {
        throw new Error('Session not found. The session ID may be invalid or you do not have access.');
      } else {
        // Maybe the data is directly the session object
        setSessionData({ session: data, task_progress: data.task_progress || [] });
        if (data.task_progress) setTaskProgress(data.task_progress);
        setError(null);
      }
    } catch (e: any) {
      console.error('❌ Error fetching session:', e);
      setError(e?.message || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  // ── Save score to session_task_progress ──
  const handleSaveScore = async (taskIndex: number, score: number) => {
    const task = taskProgress.find(t => t.task_index === taskIndex);
    if (!task) return;

    try {
      setSaving(true);

      const sessionRecord = sessionData?.session;
      const sessionRecordId = sessionRecord?.id || sessionId;

      if (sessionRecordId && simulationAPI.updateTaskScore) {
        await simulationAPI.updateTaskScore(sessionRecordId, taskIndex, score);
      } else {
        const token = localStorage.getItem('authToken');
        const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
        const response = await fetch(`${apiBase}/simulations/sessions/${sessionRecordId}/tasks/${taskIndex}/score`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ score }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      setTaskProgress(prev =>
        prev.map(t => t.task_index === taskIndex ? { ...t, score } : t)
      );
      setShowScoreModal(null);
      showToast(`✓ Score ${score}% saved for Task ${taskIndex}`);
    } catch (e: any) {
      showToast(`✗ Failed to save score: ${e?.message || 'Unknown error'}`, false);
    } finally {
      setSaving(false);
    }
  };

  // ── Save feedback ──
  const handleSaveFeedback = async (taskIndex: number) => {
    const task = taskProgress.find(t => t.task_index === taskIndex);
    if (!task) return;
    try {
      setSaving(true);
      const sessionRecordId = sessionData?.session?.id || sessionId;
      const token = localStorage.getItem('authToken');
      const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';

      if (sessionRecordId) {
        const response = await fetch(`${apiBase}/simulations/sessions/${sessionRecordId}/tasks/${taskIndex}/feedback`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ feedback: tempFeedback }),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      }

      setTaskProgress(prev =>
        prev.map(t => t.task_index === taskIndex ? { ...t, feedback: tempFeedback } : t)
      );
      setEditingFeedback(null);
      showToast(`✓ Feedback saved for Task ${taskIndex}`);
    } catch (e: any) {
      showToast(`✗ Failed to save feedback: ${e?.message || 'Unknown error'}`, false);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => (onBack ? onBack() : navigate(-1));

  const copyCode = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    showToast(`Task ${idx} code copied!`);
  };

  const downloadReport = () => {
    if (!sessionData) return;
    const blob = new Blob([JSON.stringify({ ...sessionData, task_progress: taskProgress }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `session_report_${sessionId}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Loading ───────────────────────────────────────────────────────────────

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
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32, background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
        <h2 style={{ margin: '0 0 8px', color: '#111827' }}>Session Not Found</h2>
        <p style={{ color: '#6b7280', marginBottom: 20 }}>{error || 'Session does not exist.'}</p>
        
        {/* Show debug info if available */}
        {apiResponseData && (
          <details style={{ marginBottom: 20, textAlign: 'left', fontSize: 11 }}>
            <summary style={{ cursor: 'pointer', color: '#7c3aed' }}>Debug Info</summary>
            <pre style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>
              {JSON.stringify(apiResponseData, null, 2)}
            </pre>
          </details>
        )}
        
        <code style={{ display: 'block', padding: '8px 12px', background: '#f3f4f6', borderRadius: 8, fontSize: 11, color: '#374151', wordBreak: 'break-all', marginBottom: 20 }}>
          Session ID: {sessionId}
        </code>
        
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={handleBack} style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>← Go Back</button>
          <button onClick={fetchSession} style={{ padding: '10px 24px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>⟳ Retry</button>
        </div>
      </div>
    </div>
  );

  // ─── Data extraction ───────────────────────────────────────────────────────

  const candidate = sessionData.candidate || {};
  const session = sessionData.session || {};
  const evaluation = sessionData.evaluation || {};
  const template = sessionData.simulation_template || {};
  const job = sessionData.job || {};
  const company = sessionData.company || {};
  const overallScore = sessionData.total_score || session.score || evaluation.overall_score || 0;
  const passed = sessionData.passed || (overallScore >= 70);
  
  // Fixed counts using effective status
  const completedTasks = taskProgress.filter(t => t.status === 'completed').length;
  const inProgressTasks = taskProgress.filter(t => t.status === 'in_progress' && t.started_at).length;
  const notStartedTasks = taskProgress.filter(t => !t.started_at || (t.status === 'in_progress' && !t.started_at)).length;
  const totalTasks = taskProgress.length;
  const gradedTasks = taskProgress.filter(t => t.score !== null);
  const avgTaskScore = gradedTasks.length
    ? Math.round(gradedTasks.reduce((s, t) => s + (t.score || 0), 0) / gradedTasks.length)
    : null;

  // Score dimensions from evaluation
  const dimensions = [
    { label: 'Communication', val: evaluation.communication_score },
    { label: 'Problem Solving', val: evaluation.problem_solving_score },
    { label: 'Adaptability', val: evaluation.adaptability_score },
    { label: 'Collaboration', val: evaluation.collaboration_score },
    { label: 'Attention', val: evaluation.attention_to_detail_score },
    { label: 'Initiative', val: evaluation.initiative_score },
  ].filter(d => d.val !== undefined && d.val !== null);

  const initials = `${candidate.first_name?.charAt(0) || ''}${candidate.last_name?.charAt(0) || ''}`;

  // If no task progress, show message
  if (taskProgress.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: 32, background: '#fff', borderRadius: 20 }}>
          <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
          <h2>No Tasks Found</h2>
          <p>No task progress data available for this session.</p>
          <button onClick={handleBack} style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', marginTop: 16 }}>Go Back</button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Keyframes (injected once) ── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .task-card { transition: box-shadow 0.15s; }
        .task-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
        .btn-score { transition: all 0.15s; }
        .btn-score:hover { filter: brightness(1.08); transform: translateY(-1px); }
      `}</style>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '12px 20px', borderRadius: 12,
          background: toast.ok ? '#16a34a' : '#dc2626',
          color: '#fff', fontWeight: 600, fontSize: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'fadeUp 0.25s ease'
        }}>{toast.msg}</div>
      )}

      {/* ── Header ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #f1f5f9',
        position: 'sticky', top: 0, zIndex: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
      }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleBack} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#374151', fontWeight: 600, fontSize: 13 }}>
              <ArrowLeft size={15} /> Back
            </button>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>Session Report</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                {sessionId?.substring(0, 8)}…{sessionId?.substring(sessionId.length - 4)}
              </div>
            </div>
          </div>
          <button
            onClick={downloadReport}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
          >
            <Download size={14} /> Download JSON
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── 1. Candidate Hero ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 22
            }}>{initials || '?'}</div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: '#111827' }}>{candidate.full_name || candidate.name || 'Candidate'}</div>
              <div style={{ color: '#6b7280', fontSize: 14 }}>{candidate.email}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                {candidate.headline && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Briefcase size={13} />{candidate.headline}</span>}
                {candidate.city && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Building size={13} />{candidate.city}, {candidate.country}</span>}
                {company.name && <span style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}><Target size={13} />{company.name}</span>}
              </div>
            </div>

            {/* Overall score */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <ScoreRing score={overallScore} size={84} stroke={7} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: scoreColor(overallScore) }}>{Math.round(overallScore)}</div>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>/ 100</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Overall Score</div>
              <div style={{ marginTop: 6 }}>
                {passed
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><CheckCircle size={11} />Passed</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 20, fontSize: 12, fontWeight: 700 }}><XCircle size={11} />Failed</span>
                }
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Stats bar (fixed counts) ── */}
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

        {/* ── 3. Score Dimensions (if evaluation exists) ── */}
        {dimensions.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={17} style={{ color: '#7c3aed' }} /> Score Dimensions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {dimensions.map(d => (
                <div key={d.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{d.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: scoreColor(d.val) }}>{d.val}%</span>
                  </div>
                  <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.val}%`, background: scoreColor(d.val), borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 4. Task Breakdown ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckSquare size={17} style={{ color: '#7c3aed' }} />
            Tasks Breakdown
            <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>({completedTasks}/{totalTasks} completed)</span>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ height: '100%', width: `${totalTasks ? (completedTasks / totalTasks) * 100 : 0}%`, background: '#16a34a', borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
          </div>

          {/* Role indicator */}
          <div style={{
            marginBottom: 16, padding: '8px 12px', borderRadius: 8,
            background: canGrade ? '#eff6ff' : '#faf5ff',
            border: `1px solid ${canGrade ? '#bfdbfe' : '#e9d5ff'}`,
            fontSize: 12, color: canGrade ? '#1d4ed8' : '#7c3aed', fontWeight: 600
          }}>
            {canGrade
              ? '🎯 Recruiter view — you can set scores on completed tasks'
              : '👤 Candidate view — scores set by your recruiter appear below'}
          </div>

          {/* Task list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {taskProgress.map(task => {
              const isExpanded = expandedTask === task.task_index;
              const hasScore = task.score !== null;
              const roundedScore = hasScore ? Math.round(task.score!) : null;
              const effectiveStatus = getEffectiveStatus(task);

              return (
                <div
                  key={task.task_id}
                  className="task-card"
                  style={{
                    borderRadius: 12, 
                    border: `1.5px solid ${taskBg(task.status, task.started_at).borderColor}`,
                    background: taskBg(task.status, task.started_at).background, 
                    overflow: 'hidden'
                  }}
                >
                  {/* Task header */}
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      {/* Left: title + meta */}
                      <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                        <div style={{ marginTop: 2 }}>{statusIcon(task.status, task.started_at)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                              Task {task.task_index}: {task.task_title}
                            </span>

                            {/* ── Status Badge (fixed) ── */}
                            {task.status === 'completed' && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f0fdf4', color: '#16a34a', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                                <CheckCircle size={11} /> Completed
                              </span>
                            )}
                            {task.status === 'in_progress' && task.started_at && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#eff6ff', color: '#2563eb', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                                <Play size={11} /> In Progress
                              </span>
                            )}
                            {(!task.started_at || (task.status === 'in_progress' && !task.started_at)) && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                                <Lock size={11} /> Not Started
                              </span>
                            )}

                            {/* ── Score badge (visible to everyone) ── */}
                            {hasScore && (
                              <span style={{
                                padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                background: scoreBg(roundedScore!),
                                color: scoreColor(roundedScore!),
                                border: `1px solid ${scoreBorder(roundedScore!)}`
                              }}>
                                Score: {roundedScore}%
                              </span>
                            )}

                            {!hasScore && task.status === 'completed' && (
                              <span style={{
                                padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a'
                              }}>
                                Pending Grade
                              </span>
                            )}

                            {/* Type badge */}
                            <span style={{
                              padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              background: task.task_type === 'technical' ? '#dbeafe' : '#f3e8ff',
                              color: task.task_type === 'technical' ? '#1d4ed8' : '#7c3aed'
                            }}>
                              {task.task_type}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{task.task_description}</div>
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={12} /> {task.task_duration}m
                        </span>

                        {/* ── SET SCORE (recruiters only, completed tasks) ── */}
                        {canGrade && task.status === 'completed' && (
                          <button
                            className="btn-score"
                            onClick={() => setShowScoreModal(task.task_index)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                              background: hasScore ? scoreBg(roundedScore!) : '#7c3aed',
                              color: hasScore ? scoreColor(roundedScore!) : '#fff',
                              border: hasScore ? `1.5px solid ${scoreBorder(roundedScore!)}` : 'none',
                              borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13
                            }}
                          >
                            <AwardIcon size={13} />
                            {hasScore ? `Update (${roundedScore}%)` : 'Set Score'}
                          </button>
                        )}

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedTask(isExpanded ? null : task.task_index)}
                          style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: '#9ca3af' }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Quick indicators (fixed) */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                      {task.status === 'completed' && (
                        <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle size={12} /> Completed
                        </span>
                      )}
                      {task.status === 'in_progress' && task.started_at && (
                        <span style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Play size={12} /> In Progress
                        </span>
                      )}
                      {(!task.started_at || (task.status === 'in_progress' && !task.started_at)) && (
                        <span style={{ fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Lock size={12} /> Not Started
                        </span>
                      )}
                      {task.github_commit_url && (
                        <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}>
                          <GitBranch size={12} /> View GitHub <ExternalLink size={10} />
                        </a>
                      )}
                      {task.time_spent > 0 && (
                        <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> {formatTime(task.time_spent)}
                        </span>
                      )}
                      {task.answer?.code && (
                        <span style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Terminal size={12} /> Code Submitted
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Expanded details ── */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Score display (always visible when set) */}
                      {hasScore && (
                        <div style={{
                          background: scoreBg(roundedScore!), border: `1.5px solid ${scoreBorder(roundedScore!)}`,
                          borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16
                        }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <ScoreRing score={roundedScore!} size={56} stroke={5} />
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(roundedScore!) }}>{roundedScore}</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: scoreColor(roundedScore!), fontSize: 15 }}>
                              Task Score: {roundedScore}%
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                              {roundedScore! >= 80 ? 'Excellent performance' : roundedScore! >= 60 ? 'Good performance' : roundedScore! >= 40 ? 'Fair performance' : 'Needs improvement'}
                            </div>
                          </div>
                          {canGrade && (
                            <button
                              onClick={() => setShowScoreModal(task.task_index)}
                              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff', border: `1px solid ${scoreBorder(roundedScore!)}`, color: scoreColor(roundedScore!), borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          )}
                        </div>
                      )}

                      {/* Feedback */}
                      <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, color: '#0369a1', fontSize: 13 }}>Recruiter Feedback</span>
                          {canGrade && editingFeedback !== task.task_index && (
                            <button
                              onClick={() => { setTempFeedback(task.feedback || ''); setEditingFeedback(task.task_index); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          )}
                        </div>

                        {editingFeedback === task.task_index && canGrade ? (
                          <div>
                            <textarea
                              value={tempFeedback}
                              onChange={e => setTempFeedback(e.target.value)}
                              rows={4} placeholder="Add feedback for this task…"
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #bae6fd', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                onClick={() => handleSaveFeedback(task.task_index)}
                                disabled={saving}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
                              >
                                <Save size={13} /> Save
                              </button>
                              <button onClick={() => setEditingFeedback(null)} style={{ padding: '7px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: 13, color: task.feedback ? '#374151' : '#9ca3af', fontStyle: task.feedback ? 'normal' : 'italic', whiteSpace: 'pre-wrap' }}>
                            {task.feedback || 'No feedback provided yet.'}
                          </div>
                        )}
                      </div>

                      {/* GitHub */}
                      {task.github_commit_url && (
                        <div style={{ background: '#faf5ff', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 13, marginBottom: 6 }}>GitHub Repository</div>
                          <a href={task.github_commit_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#7c3aed', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, wordBreak: 'break-all', textDecoration: 'none' }}>
                            <GitBranch size={13} /> {task.github_commit_url} <ExternalLink size={11} />
                          </a>
                        </div>
                      )}

                      {/* Code submission */}
                      {task.answer?.code && (
                        <div>
                          <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileCode size={14} style={{ color: '#7c3aed' }} /> Code Submission
                          </div>
                          <CodeBlock
                            code={task.answer.code}
                            language="javascript"
                            onCopy={() => copyCode(task.answer.code, task.task_index)}
                          />
                        </div>
                      )}

                      {/* Timestamps */}
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

                      {/* Instructions */}
                      {task.template_task?.instructions && (
                        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#374151', fontSize: 13, marginBottom: 6 }}>Task Instructions</div>
                          <pre style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                            {task.template_task.instructions}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 5. Simulation Info ── */}
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
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

      </div>{/* end content */}

      {/* ── Score Modal ── */}
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