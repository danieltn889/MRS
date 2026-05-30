import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Users, Search, Star, Calendar, Award,
  AlertCircle, Activity, Target, CheckCircle, Download, Filter, Eye
} from 'lucide-react';
import { getJobCandidatesWithMatches } from '../../services/jobAPI';

interface JobCandidatesViewProps {
  jobId: string;
  jobTitle: string;
  onBack: () => void;
  onViewCandidate: (candidate: Candidate) => void;
}

export interface Simulation {
  simulation_id: string;
  template_id: string;
  simulation_status: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  time_limit: number | null;
  time_remaining: number | null;
  time_spent: number | null;
  current_task: number;
  overall_score: string;
  punctuality_score: number | null;
  communication_score: number | null;
  problem_solving_score: number | null;
  adaptability_score: number | null;
  collaboration_score: number | null;
  attention_score: number | null;
  initiative_score: number | null;
  feedback: string | null;
  strengths: string | null;
  improvements: string | null;
  evaluator_notes: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  blockchain_tx_id: string | null;
  simulation_name: string;
  simulation_description: string;
  simulation_type: string;
  difficulty: string;
  duration_minutes: number;
  total_tasks: number;
  completed_tasks: number;
  avg_task_score: number;
  scoring_rubric: any;
  pass_fail_criteria: any;
  evaluation_id: string;
  evaluation_overall_score: number;
  evaluation_punctuality_score: number;
  evaluation_communication_score: number;
  evaluation_problem_solving_score: number;
  evaluation_adaptability_score: number;
  evaluation_collaboration_score: number;
  attention_to_detail_score: number;
  evaluation_initiative_score: number;
  evaluation_status: string;
  evaluation_completed_at: string;
  reviewed_at: string | null;
  session_id: string;
  session_status: string;
  session_started_at: string;
  session_completed_at: string;
  session_time_spent: number;
  session_current_task: number;
  session_score: number | null;
  github_links: Record<string, string>;
  task_progress: Array<{
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
    started_at: string | null;
    completed_at: string | null;
    time_spent: number;
    github_commit_url: string | null;
    answer: any;
    template_task: any;
  }>;
  evaluation_sections: any[];
  behavioral_metrics: any[];
  skill_assessments: any[];
  ai_feedback: any;
  qualitative_feedback: any;
  interview_questions: any[];
}

export interface Candidate {
  application_id: string;
  application_number: string;
  application_status: string;
  applied_at: string;
  ai_match_score: number;
  full_name: string;
  first_name: string;
  last_name: string;
  candidate_email: string;
  candidate_id: string;
  headline?: string;
  summary?: string;
  phone?: string;
  country?: string;
  city?: string;
  profile_photo_url?: string;
  profile_completion?: number;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  website_url?: string;
  willing_to_relocate?: boolean;
  notice_period_days?: number;
  languages?: any[];
  availability?: any;
  candidate_skills?: Array<{
    skill_name: string;
    proficiency_level: number;
    proficiency_label: string;
    years_experience: string;
    category: string;
  }>;
  work_experience?: Array<{
    id: string;
    company: string;
    title: string;
    employment_type: string;
    location: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
    description: string;
    achievements: string[];
    industry: string;
  }>;
  current_experience?: any[];
  education?: Array<{
    id: string;
    institution: string;
    degree: string;
    field_of_study: string;
    start_date: string;
    end_date: string;
    grade: string;
    verified: boolean;
  }>;
  certifications?: Array<{
    name: string;
    issuer: string;
    issue_date: string;
    verified: boolean;
  }>;
  primary_resume?: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_size: number;
  }>;
  all_resumes?: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_size: number;
  }>;
  portfolio_links?: Array<{
    platform: string;
    url: string;
    title: string;
  }>;
  simulations?: Simulation[];
  application_timeline?: Array<{
    id: string;
    event_type: string;
    event_data: any;
    created_at: string;
    ip_address?: string;
    created_by_email?: string;
  }>;
  screening_answers?: any;
  feedback?: string;
  recruiter_rating?: number;
  match_details?: any;
  ai_score?: any;
  notes?: any[];
  internal_notes?: any[];
  application_tags?: any[];
  interview_date?: string | null;
  withdrawn_at?: string | null;
  withdrawn_reason?: string | null;
  rejection_reason?: string | null;
  source?: string | null;
  user_type?: string;
  user_status?: string;
  user_created_at?: string;
  last_login_at?: string;
  timezone?: string;
  current_salary?: number | null;
  expected_salary?: number | null;
  job_preferences?: any;
  privacy_settings?: any;
  ai_analysis?: any;
  upcoming_interviews?: any[];
  assigned_to?: any[];
}

interface Stats {
  total_applications: number;
  avg_match_score: number;
  max_match_score: number;
  min_match_score: number;
  high_match_count: number;
  medium_match_count: number;
  low_match_count: number;
  by_status: {
    submitted: number;
    under_review: number;
    shortlisted: number;
    interview: number;
    assessment: number;
    offer: number;
    hired: number;
    rejected: number;
  };
}

const JobCandidatesView: React.FC<JobCandidatesViewProps> = ({
  jobId,
  jobTitle,
  onBack,
  onViewCandidate,
}) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total_applications: 0,
    avg_match_score: 0,
    max_match_score: 0,
    min_match_score: 0,
    high_match_count: 0,
    medium_match_count: 0,
    low_match_count: 0,
    by_status: { submitted: 0, under_review: 0, shortlisted: 0, interview: 0, assessment: 0, offer: 0, hired: 0, rejected: 0 },
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('match_score');

  useEffect(() => {
    if (jobId) loadCandidates();
  }, [jobId]);

  const loadCandidates = async () => {
    try {
      setLoading(true);
      const result = await getJobCandidatesWithMatches(jobId, { page: 1, limit: 100, sortBy: 'match_score', sortOrder: 'DESC' });
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

  const getMatchColor = (score: number) => {
    if (score >= 80) return '#22c55e';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const getMatchBg = (score: number) => {
    if (score >= 80) return '#dcfce7';
    if (score >= 60) return '#fef9c3';
    return '#fee2e2';
  };

  const getMatchLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Low';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      submitted: { bg: '#f1f5f9', text: '#475569' },
      under_review: { bg: '#eff6ff', text: '#2563eb' },
      shortlisted: { bg: '#f5f3ff', text: '#7c3aed' },
      interview: { bg: '#ecfdf5', text: '#059669' },
      assessment: { bg: '#fff7ed', text: '#c2410c' },
      offer: { bg: '#fdf4ff', text: '#a21caf' },
      hired: { bg: '#dcfce7', text: '#15803d' },
      rejected: { bg: '#fee2e2', text: '#dc2626' },
    };
    return colors[status] || { bg: '#f1f5f9', text: '#475569' };
  };

  const formatDate = (d?: string) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={14} color="#22c55e" />;
      case 'expired': return <AlertCircle size={14} color="#ef4444" />;
      default: return <AlertCircle size={14} color="#94a3b8" />;
    }
  };

  const downloadCandidateReport = (candidate: Candidate) => {
    const report = {
      candidate: {
        name: candidate.full_name,
        email: candidate.candidate_email,
        match_score: candidate.ai_match_score,
        skills: candidate.candidate_skills,
        work_experience: candidate.work_experience,
        education: candidate.education,
      },
      application: {
        id: candidate.application_id,
        number: candidate.application_number,
        status: candidate.application_status,
        applied_at: candidate.applied_at,
      },
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate_${candidate.full_name?.replace(/\s/g, '_')}_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCandidates = candidates
    .filter(c => {
      const matchesSearch =
        !searchTerm ||
        c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.candidate_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.headline?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.application_status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'match_score') return (b.ai_match_score || 0) - (a.ai_match_score || 0);
      if (sortBy === 'applied_at') return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
      if (sortBy === 'name') return (a.full_name || '').localeCompare(b.full_name || '');
      return 0;
    });

  const statCards = [
    { label: 'Total Applications', value: stats.total_applications, color: '#8b5cf6', icon: Users },
    { label: 'Avg Match Score', value: `${stats.avg_match_score}%`, color: '#8b5cf6', icon: Star },
    { label: 'High Match (80%+)', value: stats.high_match_count, color: '#22c55e', icon: Award },
    { label: 'Medium (60-79%)', value: stats.medium_match_count, color: '#f59e0b', icon: Activity },
    { label: 'Low (<60%)', value: stats.low_match_count, color: '#ef4444', icon: AlertCircle },
    { label: 'In Interview', value: stats.by_status?.interview || 0, color: '#2563eb', icon: Calendar },
    { label: 'Shortlisted', value: stats.by_status?.shortlisted || 0, color: '#7c3aed', icon: Target },
    { label: 'Hired', value: stats.by_status?.hired || 0, color: '#10b981', icon: CheckCircle },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' }}>
            <ArrowLeft size={16} /> Back to Jobs
          </button>
          <div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Candidates — {jobTitle}</span>
            <span style={{ fontSize: 13, color: '#64748b', marginLeft: 12 }}>{stats.total_applications} applicant{stats.total_applications !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          {statCards.map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>{s.label}</span>
                <s.icon size={18} color={s.color} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by name, email, headline..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer' }}>
            <option value="all">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff', cursor: 'pointer' }}>
            <option value="match_score">Sort: Match Score</option>
            <option value="applied_at">Sort: Applied Date</option>
            <option value="name">Sort: Name</option>
          </select>
          <span style={{ fontSize: 13, color: '#64748b' }}>{filteredCandidates.length} result{filteredCandidates.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Candidates Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#8b5cf6', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <p style={{ color: '#64748b' }}>Loading candidates...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <Users size={48} color="#cbd5e1" />
            <p style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: '#0f172a' }}>No candidates found</p>
            <p style={{ fontSize: 14, color: '#64748b' }}>{searchTerm ? 'Try a different search.' : 'Applications will appear here once candidates apply.'}</p>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Candidate', 'Match', 'Status', 'Applied', 'Top Skills', 'Current Role', 'Simulation', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map(c => {
                  const statusStyle = getStatusColor(c.application_status);
                  const topSim = c.simulations?.find(s => s.session_status === 'completed') || c.simulations?.[0];
                  const overallScore = topSim ? (topSim.overall_score ? parseFloat(topSim.overall_score) : topSim.evaluation_overall_score || 0) : 0;
                  const avgTaskScore = topSim?.avg_task_score || 0;

                  return (
                    <tr
                      key={c.application_id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Candidate */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                            {(c.first_name?.[0] || c.full_name?.[0] || '?').toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{c.full_name || 'Unknown'}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{c.candidate_email}</div>
                            {c.headline && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.headline}</div>}
                          </div>
                        </div>
                      </td>

                      {/* Match */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: getMatchBg(c.ai_match_score || 0), color: getMatchColor(c.ai_match_score || 0), fontWeight: 700, fontSize: 14 }}>
                          <Star size={12} fill={getMatchColor(c.ai_match_score || 0)} />
                          {c.ai_match_score || 0}%
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{getMatchLabel(c.ai_match_score || 0)}</div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: statusStyle.bg, color: statusStyle.text }}>
                          {c.application_status?.replace('_', ' ') || 'submitted'}
                        </span>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>#{c.application_number}</div>
                      </td>

                      {/* Applied */}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#64748b' }}>{formatDate(c.applied_at)}</td>

                      {/* Skills */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {(c.candidate_skills || []).slice(0, 3).map((s, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f1f5f9', color: '#475569' }}>{s.skill_name}</span>
                          ))}
                          {(c.candidate_skills?.length || 0) > 3 && (
                            <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 500 }}>+{(c.candidate_skills?.length || 0) - 3}</span>
                          )}
                        </div>
                      </td>

                      {/* Current Role */}
                      <td style={{ padding: '14px 16px', fontSize: 13, color: '#475569' }}>
                        {c.work_experience?.[0] ? (
                          <div>
                            <div style={{ fontWeight: 500 }}>{c.work_experience[0].title}</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{c.work_experience[0].company}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>No experience</span>
                        )}
                      </td>

                      {/* Simulation */}
                      <td style={{ padding: '14px 16px' }}>
                        {topSim ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                              <div>
                                <span style={{ fontSize: 20, fontWeight: 700, color: overallScore >= 70 ? '#22c55e' : overallScore >= 50 ? '#f59e0b' : '#ef4444' }}>{Math.round(overallScore)}%</span>
                                <span style={{ fontSize: 10, color: '#64748b', marginLeft: 2 }}>overall</span>
                              </div>
                              {avgTaskScore > 0 && (
                                <div style={{ paddingLeft: 8, borderLeft: '1px solid #e2e8f0' }}>
                                  <span style={{ fontSize: 16, fontWeight: 600, color: avgTaskScore >= 70 ? '#22c55e' : avgTaskScore >= 50 ? '#f59e0b' : '#ef4444' }}>{Math.round(avgTaskScore)}%</span>
                                  <span style={{ fontSize: 10, color: '#64748b', marginLeft: 2 }}>avg tasks</span>
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {getStatusIcon(topSim.session_status)}
                              <span style={{ color: topSim.session_status === 'completed' ? '#22c55e' : '#f59e0b' }}>{topSim.session_status}</span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#cbd5e1' }}>No simulation</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => onViewCandidate(c)}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #8b5cf6', background: '#f5f3ff', fontSize: 13, cursor: 'pointer', fontWeight: 500, color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={14} /> View
                          </button>
                          <button
                            onClick={() => downloadCandidateReport(c)}
                            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Download size={14} /> Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobCandidatesView;