import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Users, TrendingUp, Clock, Award, CheckCircle, XCircle,
  AlertCircle, Eye, Mail, Activity, ExternalLink, GitBranch, Star,
  Filter, Search, RefreshCw, Shield, Download, History, Calendar,
  Briefcase, MapPin, DollarSign, Target, Zap, MessageCircle
} from 'lucide-react';
import simulationAPI from '../services/simulationAPI';
import ChatPanel from './SimulationExecutor/ChatPanel';
import { useChat } from './SimulationExecutor/hooks/useChat';

// API Response Interface
interface ApiCandidateResponse {
  session: {
    id: string;
    candidate_id: string;
    session_type: string;
    status: string;
    started_at: string;
    completed_at: string;
    time_limit: number;
    time_remaining: number | null;
    time_spent: number;
    current_task: number;
    score: number | null;
    github_links: Record<string, string>;
    created_at: string;
    updated_at: string;
  };
  candidate: {
    id: string;
    email: string;
    user_type: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone: string;
    country: string;
    city: string;
    profile_photo_url: string | null;
    headline: string;
    summary: string;
    linkedin_url: string | null;
    github_url: string | null;
    profile_completion: number;
  };
  simulation_record: {
    id: string;
    status: string;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string;
    time_limit: number | null;
    time_spent: number | null;
    current_task: number;
    overall_score: string | number;
    punctuality_score: number | null;
    communication_score: number | null;
    problem_solving_score: number | null;
    adaptability_score: number | null;
    collaboration_score: number | null;
    attention_score: number | null;
    initiative_score: number | null;
    feedback: string | null;
    strengths: string[] | null;
    improvements: string[] | null;
    blockchain_tx_id: string | null;
    metadata: any;
  };
  evaluation: {
    id: string;
    overall_score: number;
    punctuality_score: number;
    communication_score: number;
    problem_solving_score: number;
    adaptability_score: number;
    collaboration_score: number;
    attention_to_detail_score: number;
    initiative_score: number;
    status: string;
    completed_at: string;
    reviewed_at: string | null;
    reviewer_id: string | null;
    sections: any[];
    behavioral_metrics: any[];
    skill_assessments: any[];
    ai_feedback: any;
    benchmarks: any;
    qualitative_feedback: any;
    interview_questions: any[];
  } | null;
  application: {
    id: string;
    number: string;
    status: string;
    applied_at: string;
    match_score: number;
    rating: number | null;
  };
  job: {
    id: string;
    title: string;
    type: string;
    work_arrangement: string;
    locations: any[];
    department: string;
    salary_min: string;
    salary_max: string;
    experience_level: string;
  };
  company: {
    id: string;
    name: string;
    logo_url: string | null;
    industry: string;
  };
  simulation_template: {
    id: string;
    name: string;
    description: string;
    type: string;
    difficulty: string;
    duration_minutes: number;
    tasks: any[];
    scoring_rubric: any;
    pass_fail_criteria: any;
  };
  overall_score: number;
  has_evaluation: boolean;
  passed: boolean;
  status: string;
  completed_at: string;
}

interface GroupedCandidate {
  candidateId: string;
  candidateInfo: ApiCandidateResponse['candidate'];
  bestSession: ApiCandidateResponse;
  allSessions: ApiCandidateResponse[];
  bestScore: number;
  bestPassed: boolean;
  bestCompletedAt: string;
  job?: ApiCandidateResponse['job'];
  company?: ApiCandidateResponse['company'];
  simulation_template?: ApiCandidateResponse['simulation_template'];
  application?: ApiCandidateResponse['application'];
}

interface CandidatePerformanceProps {
  simulation: { id: string; title: string; jobRole?: string } | null;
  onBack: () => void;
  onViewReport?: (sessionId: string) => void;
}

/* ── Helpers ── */
const getScoreColor = (v: number) => v >= 80 ? '#16a34a' : v >= 60 ? '#d97706' : '#dc2626';
const getScoreBg = (v: number) => v >= 80 ? '#dcfce7' : v >= 60 ? '#fef9c3' : '#fee2e2';

const formatDate = (d?: string) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatTime = (s?: number) => {
  if (!s) return 'N/A';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

/* ── Score Arc ── */
const ScoreArc: React.FC<{ score: number; size?: number }> = ({ score, size = 80 }) => {
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const off = circ - (score / 100) * circ;
  const color = getScoreColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 9, color: '#94a3b8' }}>/100</span>
      </div>
    </div>
  );
};

/* ── Metric Bar ── */
const MetricBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: getScoreColor(value) }}>{Math.round(value)}%</span>
    </div>
    <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, background: getScoreColor(value), borderRadius: 3, transition: 'width .5s ease' }} />
    </div>
  </div>
);

/* ── Session Card ── */
const SessionCard: React.FC<{ session: ApiCandidateResponse; onViewReport?: (id: string) => void }> = ({ session, onViewReport }) => {
  const score = Math.round(session.overall_score || 0);
  const sessionId = session.session?.id || session.simulation_record?.id;
  const isCompleted = session.session?.status === 'completed';
  
  const handleClick = () => {
    if (onViewReport && sessionId) {
      onViewReport(sessionId);
    } else if (sessionId) {
      window.open(`/dashboard?view=session-report&sessionId=${sessionId}`, '_blank');
    }
  };
  
  return (
    <div style={{
      padding: '14px 16px',
      background: '#f8fafc',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: isCompleted ? '#dcfce7' : '#fef3c7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14,
            color: isCompleted ? '#15803d' : '#b45309',
          }}>
            {score}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
              Session {sessionId?.slice(0, 8)}...
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {formatTime(session.session?.time_spent)}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={11} /> {formatDate(session.completed_at || session.session?.completed_at)}
              </span>
              <span style={{
                padding: '2px 8px',
                borderRadius: 12,
                background: isCompleted ? '#dcfce7' : '#fef3c7',
                color: isCompleted ? '#15803d' : '#b45309',
                fontSize: 10,
                fontWeight: 600,
              }}>
                {session.session?.status || session.status}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: '1px solid #c7d2fe',
            background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            color: '#6366f1',
          }}
        >
          <Eye size={12} /> View Session Report
        </button>
      </div>
    </div>
  );
};

/* ── Chat Modal Component ── */
interface ChatModalProps {
  simulationRecordId: string;
  sessionId: string;
  candidateName: string;
  onClose: () => void;
  currentUser: { id: string; email: string };
}

const ChatModal: React.FC<ChatModalProps> = ({ simulationRecordId, sessionId, candidateName, onClose, currentUser }) => {
  const {
    messages,
    unreadCount,
    socketConnected,
    replyingTo,
    cancelReply,
    startReply,
    sendMessage,
    loadMoreMessages,
    hasMore,
    editingMessage,
    editContent,
    setEditContent,
    saveEdit,
    cancelEdit,
    startEdit,
    deleteMessage,
  } = useChat(simulationRecordId, currentUser.id, sessionId);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: '90%',
        maxWidth: 600,
        height: '80vh',
        backgroundColor: '#1f2937',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#111827',
          borderBottom: '1px solid #374151',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h3 style={{ color: 'white', margin: 0, fontSize: 16, fontWeight: 600 }}>
              Chat with {candidateName}
            </h3>
            <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 12 }}>
              Simulation: {simulationRecordId.slice(0, 8)}...
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 20,
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatPanel
            messages={messages}
            unreadCount={unreadCount}
            socketConnected={socketConnected}
            replyingTo={replyingTo}
            onReplyCancel={cancelReply}
            onStartReply={startReply}
            onSendMessage={sendMessage}
            onLoadMore={loadMoreMessages}
            hasMoreMessages={hasMore}
            editingMessage={editingMessage}
            editContent={editContent}
            onEditChange={setEditContent}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onStartEdit={startEdit}
            onDeleteMessage={deleteMessage}
            currentUserId={currentUser.id}
            currentUserEmail={currentUser.email}
          />
        </div>
      </div>
    </div>
  );
};

/* ── Main Candidate Card - WITH CHAT BUTTON ── */
const CandidateCard: React.FC<{ 
  candidate: GroupedCandidate; 
  rank: number; 
  onViewReport?: (id: string) => void;
  onOpenChat?: (simulationRecordId: string, sessionId: string, candidateName: string) => void;
}> = ({ candidate, rank, onViewReport, onOpenChat }) => {
  const bestSession = candidate.bestSession;
  const evaluation = bestSession.evaluation;
  const job = candidate.job || bestSession.job;
  const company = candidate.company || bestSession.company;
  const allSessions = candidate.allSessions;
  const score = Math.round(candidate.bestScore);
  const [showCalc, setShowCalc] = useState(false);

  const metrics = [
    { label: 'Punctuality', value: evaluation?.punctuality_score || 0 },
    { label: 'Communication', value: evaluation?.communication_score || 0 },
    { label: 'Problem Solving', value: evaluation?.problem_solving_score || 0 },
    { label: 'Adaptability', value: evaluation?.adaptability_score || 0 },
    { label: 'Collaboration', value: evaluation?.collaboration_score || 0 },
    { label: 'Attention to Detail', value: evaluation?.attention_to_detail_score || 0 },
    { label: 'Initiative', value: evaluation?.initiative_score || 0 },
  ];

  const handleViewReport = (sessionId?: string) => {
    const id = sessionId || bestSession.session?.id || bestSession.simulation_record?.id;
    if (onViewReport && id) {
      onViewReport(id);
    } else if (id) {
      window.open(`/dashboard?view=session-report&sessionId=${id}`, '_blank');
    }
  };

  const candidateName = candidate.candidateInfo?.full_name || candidate.candidateInfo?.first_name || 'Anonymous';
  const simulationRecordId = bestSession.simulation_record?.id;
  const sessionId = bestSession.session?.id;

  return (
    <div style={{
      background: '#fff',
      borderRadius: 20,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      marginBottom: 24,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      
      {/* Header Section */}
      <div style={{
        padding: '20px 24px',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: rank === 1 ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' :
                        rank === 2 ? 'linear-gradient(135deg,#94a3b8,#64748b)' :
                        rank === 3 ? 'linear-gradient(135deg,#cd7f32,#a0522d)' : '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20,
            color: rank <= 3 ? '#fff' : '#475569',
          }}>
            {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
          </div>

          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: candidate.bestPassed ? '#6366f1' : '#ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 22, color: '#fff',
          }}>
            {(candidate.candidateInfo?.first_name?.[0] || candidate.candidateInfo?.full_name?.[0] || '?').toUpperCase()}
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {candidateName}
            </h2>
            <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Mail size={12} /> {candidate.candidateInfo?.email || 'No email'}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Briefcase size={12} /> {candidate.candidateInfo?.headline || 'No headline'}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={12} /> {candidate.candidateInfo?.city}, {candidate.candidateInfo?.country}
              </span>
            </div>
          </div>

          <ScoreArc score={score} size={80} />

          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 16px', borderRadius: 30, fontSize: 13, fontWeight: 700,
              background: candidate.bestPassed ? '#dcfce7' : '#fee2e2',
              color: candidate.bestPassed ? '#15803d' : '#dc2626',
            }}>
              {candidate.bestPassed ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {candidate.bestPassed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        </div>
      </div>

      {/* Body Section */}
      <div style={{ padding: '24px' }}>
        
        {/* Job & Company Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 20,
          marginBottom: 28,
          padding: '16px',
          background: '#f8fafc',
          borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>POSITION</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{job?.title || 'N/A'}</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{company?.name || 'N/A'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>JOB DETAILS</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>
              <span style={{ fontWeight: 500 }}>Type:</span> {job?.type || 'N/A'}
            </div>
            <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
              <span style={{ fontWeight: 500 }}>Work:</span> {job?.work_arrangement || 'N/A'}
            </div>
            <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
              <span style={{ fontWeight: 500 }}>Level:</span> {job?.experience_level || 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>COMPENSATION</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>
              <DollarSign size={12} style={{ display: 'inline', marginRight: 4 }} />
              {job?.salary_min && job?.salary_max ? `$${job.salary_min} - $${job.salary_max}` : 'Not specified'}
            </div>
            <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
              <Target size={12} style={{ display: 'inline', marginRight: 4 }} />
              Match Score: {bestSession.application?.match_score || 0}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>APPLICATION</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>#{bestSession.application?.number || 'N/A'}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Applied: {formatDate(bestSession.application?.applied_at)}
            </div>
          </div>
        </div>

        {/* Session History Section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <History size={18} color="#6366f1" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Session History ({allSessions.length} sessions)
            </h3>
          </div>
          <div>
            {allSessions.map((session, idx) => (
              <SessionCard 
                key={session.session?.id || session.simulation_record?.id || idx} 
                session={session} 
                onViewReport={onViewReport}
              />
            ))}
          </div>
        </div>

        {/* Performance Metrics */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Performance Metrics</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {metrics.map(m => m.value > 0 && <MetricBar key={m.label} label={m.label} value={m.value} />)}
          </div>
        </div>

        {/* How this score is calculated (collapsible) */}
        <div style={{ marginBottom: 28, padding: 16, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
          <button
            onClick={() => setShowCalc(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#5b21b6' }}
          >
            {showCalc ? '▲ Hide how this score is calculated' : '▼ How this score is calculated'}
          </button>
          {showCalc && (
            <div style={{ marginTop: 10 }}>
              <div><strong>1. Each task (0–100):</strong> (Completion + Time + Quality + Answer-quality) ÷ 4.</div>
              <div><strong>2. Competencies (0–100):</strong> Punctuality, Speed, Technical, Adaptability, Communication, Collaboration, Initiative, Attention to Detail — each scored by the AI from the candidate's work, chat, time and GitHub.</div>
              <div><strong>3. Composites:</strong> Quality = (Technical + Punctuality + Adaptability) ÷ 3 · Behavioral = (Adaptability + Communication) ÷ 2.</div>
              <div style={{ marginTop: 4, color: '#0f172a' }}><strong>4. Overall Score = Quality×0.60 + Speed×0.15 + Behavioral×0.10 + GitHub×0.15</strong> (weights from the simulation rubric; defaults shown). Pass mark default 70%.</div>
            </div>
          )}
        </div>

        {/* Footer Summary with CHAT BUTTON */}
        <div style={{
          padding: '14px 20px',
          background: getScoreBg(score),
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shield size={20} color={getScoreColor(score)} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: getScoreColor(score) }}>
                Overall Score: {score}% — {score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Improvement'}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {candidate.bestPassed ? '✓ Candidate met the passing threshold' : '✗ Candidate did not meet the passing threshold'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {/* ✅ CHAT BUTTON - NOW USING simulationRecordId */}
            <button
              onClick={() => simulationRecordId && sessionId && onOpenChat?.(simulationRecordId, sessionId, candidateName)}
              style={{
                padding: '8px 20px',
                borderRadius: 10,
                border: '1.5px solid #10b981',
                background: '#10b981',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <MessageCircle size={14} /> Chat
            </button>
            <button
              onClick={() => handleViewReport()}
              style={{
                padding: '8px 20px',
                borderRadius: 10,
                border: `1.5px solid ${getScoreColor(score)}`,
                background: '#fff',
                color: getScoreColor(score),
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Eye size={14} /> View Complete Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════ */
const CandidatePerformance: React.FC<CandidatePerformanceProps> = ({ simulation, onBack, onViewReport }) => {
  const [groupedCandidates, setGroupedCandidates] = useState<GroupedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'date' | 'name'>('score');
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chatModal, setChatModal] = useState<{ simulationRecordId: string; sessionId: string; candidateName: string } | null>(null);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const currentUser = {
    id: storedUser.id || localStorage.getItem('userId') || '',
    email: storedUser.email || localStorage.getItem('userEmail') || '',
  };

  useEffect(() => { if (simulation) fetchCandidates(); }, [simulation]);

  const fetchCandidates = async () => {
    if (!simulation) return;
    try {
      setLoading(true);
      setError(null);
      const response = await simulationAPI.getSimulationCandidates(simulation.id, { page: 1, limit: 100, status: 'all' });
      
      let data: ApiCandidateResponse[] = [];
      if (response?.data && Array.isArray(response.data)) data = response.data;
      else if (response?.data?.data && Array.isArray(response.data.data)) data = response.data.data;
      else if (Array.isArray(response)) data = response;
      
      const candidateMap = new Map<string, ApiCandidateResponse[]>();
      for (const item of data) {
        const candidateId = item.candidate?.id || item.session?.candidate_id;
        if (!candidateId) continue;
        if (!candidateMap.has(candidateId)) candidateMap.set(candidateId, []);
        candidateMap.get(candidateId)!.push(item);
      }
      
      const grouped: GroupedCandidate[] = [];
      for (const [candidateId, sessions] of candidateMap.entries()) {
        const bestSession = sessions.reduce((best, current) => {
          const bestScore = best.overall_score || 0;
          const currentScore = current.overall_score || 0;
          if (currentScore > bestScore) return current;
          if (currentScore === bestScore) {
            const bestDate = new Date(best.completed_at || best.session?.completed_at || 0);
            const currentDate = new Date(current.completed_at || current.session?.completed_at || 0);
            if (currentDate > bestDate) return current;
          }
          return best;
        }, sessions[0]);
        
        grouped.push({
          candidateId,
          candidateInfo: bestSession.candidate,
          bestSession,
          allSessions: sessions.sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0)),
          bestScore: bestSession.overall_score || 0,
          bestPassed: bestSession.passed || false,
          bestCompletedAt: bestSession.completed_at || bestSession.session?.completed_at || '',
          job: bestSession.job,
          company: bestSession.company,
          simulation_template: bestSession.simulation_template,
          application: bestSession.application,
        });
      }
      setGroupedCandidates(grouped);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to fetch candidates');
      setGroupedCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = (simulationRecordId: string, sessionId: string, candidateName: string) => {
    setChatModal({ simulationRecordId, sessionId, candidateName });
  };

  const handleCloseChat = () => {
    setChatModal(null);
  };

  const displayed = groupedCandidates
    .filter(g => filter === 'all' ? true : filter === 'passed' ? g.bestPassed : !g.bestPassed)
    .filter(g => {
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      return (g.candidateInfo?.full_name || '').toLowerCase().includes(t) ||
             (g.candidateInfo?.email || '').toLowerCase().includes(t) ||
             (g.job?.title || '').toLowerCase().includes(t);
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.bestScore - a.bestScore;
      if (sortBy === 'date') return new Date(b.bestCompletedAt).getTime() - new Date(a.bestCompletedAt).getTime();
      return (a.candidateInfo?.full_name || '').localeCompare(b.candidateInfo?.full_name || '');
    });

  const stats = {
    total: groupedCandidates.length,
    sessions: groupedCandidates.reduce((s, g) => s + g.allSessions.length, 0),
    passed: groupedCandidates.filter(g => g.bestPassed).length,
    avgScore: groupedCandidates.length ? Math.round(groupedCandidates.reduce((s, g) => s + g.bestScore, 0) / groupedCandidates.length) : 0,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Chat Modal */}
      {chatModal && (
        <ChatModal
          simulationRecordId={chatModal.simulationRecordId}
          sessionId={chatModal.sessionId}
          candidateName={chatModal.candidateName}
          onClose={handleCloseChat}
          currentUser={currentUser}
        />
      )}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, marginBottom: 20 }}>
            <ArrowLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>Candidate Performance</h1>
          <p style={{ color: '#a5b4fc', fontSize: 14, marginTop: 6 }}>{simulation?.title}</p>
          
          <div style={{ display: 'flex', gap: 24, marginTop: 20 }}>
            <div><span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{stats.total}</span><span style={{ color: '#94a3b8', marginLeft: 6 }}>Candidates</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{stats.sessions}</span><span style={{ color: '#94a3b8', marginLeft: 6 }}>Sessions</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{stats.passed}</span><span style={{ color: '#94a3b8', marginLeft: 6 }}>Passed</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{stats.avgScore}%</span><span style={{ color: '#94a3b8', marginLeft: 6 }}>Avg Score</span></div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 32px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." style={{ width: '100%', padding: '7px 12px 7px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all','passed','failed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: filter === f ? '#6366f1' : '#f1f5f9', color: filter === f ? '#fff' : '#64748b' }}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}>
            <option value="score">Sort by Score</option>
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
          </select>
          <button onClick={fetchCandidates} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer' }}><RefreshCw size={14} /></button>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>{displayed.length} candidates</span>
        </div>
      </div>

      {/* Results */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px' }}>
        {loading && <div style={{ textAlign: 'center', padding: 60 }}>Loading...</div>}
        {error && <div style={{ textAlign: 'center', padding: 60, color: '#dc2626' }}>{error}</div>}
        {!loading && !error && displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 16 }}>
            <Users size={48} color="#cbd5e1" />
            <p style={{ marginTop: 12, color: '#64748b' }}>No candidates found</p>
          </div>
        )}
        {displayed.map((candidate, i) => (
          <CandidateCard 
            key={candidate.candidateId} 
            candidate={candidate} 
            rank={i + 1} 
            onViewReport={onViewReport}
            onOpenChat={handleOpenChat}
          />
        ))}
      </div>
    </div>
  );
};

export default CandidatePerformance;
