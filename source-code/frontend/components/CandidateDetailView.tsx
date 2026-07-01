import React, { useState } from 'react';
import {
  ArrowLeft, Mail, Phone, MapPin, Globe, Linkedin, Github,
  FileText, ExternalLink, CheckCircle, XCircle, Clock, AlertCircle,
  Star, Calendar, Download, ChevronDown, ChevronUp, Award, Briefcase,
  GraduationCap, Code, Activity, Target, MessageSquare, User, BookOpen,
  Layers, GitBranch
} from 'lucide-react';
import type { Candidate, Simulation } from './jobs/JobCandidatesView';

interface CandidateDetailViewProps {
  candidate: Candidate;
  onBack: () => void;
}

type TabId = 'overview' | 'experience' | 'education' | 'skills' | 'simulations' | 'timeline';

const TAB_CONFIG: { id: TabId; label: string; icon: React.FC<any> }[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'experience', label: 'Experience', icon: Briefcase },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: Code },
  { id: 'simulations', label: 'Practical Assessments', icon: Activity },
  { id: 'timeline', label: 'Timeline', icon: Calendar },
];

const CandidateDetailView: React.FC<CandidateDetailViewProps> = ({ candidate: c, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [expandedSimulation, setExpandedSimulation] = useState<string | null>(null);

  /* ── helpers ── */
  const formatDate = (d?: string) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (d?: string) => {
    if (!d) return 'N/A';
    return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return 'N/A';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatTimeSpent = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getMatchColor = (score: number) => score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const getMatchBg   = (score: number) => score >= 80 ? '#dcfce7' : score >= 60 ? '#fef9c3' : '#fee2e2';
  const getMatchLabel = (score: number) => score >= 80 ? 'Excellent Match' : score >= 60 ? 'Good Match' : 'Low Match';

  const getScoreColor = (score: number) => score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  const getScoreBg   = (score: number) => score >= 80 ? '#dcfce7' : score >= 60 ? '#fef9c3' : score >= 40 ? '#ffedd5' : '#fee2e2';

  const getStatusColor = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      submitted:    { bg: '#f1f5f9', text: '#475569' },
      under_review: { bg: '#eff6ff', text: '#2563eb' },
      shortlisted:  { bg: '#f5f3ff', text: '#7c3aed' },
      interview:    { bg: '#ecfdf5', text: '#059669' },
      assessment:   { bg: '#fff7ed', text: '#c2410c' },
      offer:        { bg: '#fdf4ff', text: '#a21caf' },
      hired:        { bg: '#dcfce7', text: '#15803d' },
      rejected:     { bg: '#fee2e2', text: '#dc2626' },
    };
    return map[status] || { bg: '#f1f5f9', text: '#475569' };
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircle size={14} color="#22c55e" />;
    if (status === 'expired')   return <XCircle size={14} color="#ef4444" />;
    if (status === 'in_progress') return <Clock size={14} color="#f59e0b" />;
    return <AlertCircle size={14} color="#94a3b8" />;
  };

  const downloadReport = () => {
    const report = {
      candidate: {
        name: c.full_name, email: c.candidate_email, phone: c.phone,
        match_score: c.ai_match_score, skills: c.candidate_skills,
        work_experience: c.work_experience, education: c.education,
      },
      application: { id: c.application_id, number: c.application_number, status: c.application_status, applied_at: c.applied_at },
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate_${c.full_name?.replace(/\s/g, '_')}_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusStyle = getStatusColor(c.application_status);
  const topSim = c.simulations?.find(s => s.session_status === 'completed') || c.simulations?.[0];

  /* ── layout ── */
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>

      {/* ── sticky top bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'transparent', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' }}
        >
          <ArrowLeft size={16} /> Back to Candidates
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={downloadReport}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' }}
          >
            <Download size={15} /> Download Report
          </button>
          <button
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            <Mail size={15} /> Contact Candidate
          </button>
        </div>
      </div>

      {/* ── hero card ── */}
      <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', padding: '36px 40px 0', color: '#fff' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, color: '#fff', flexShrink: 0, border: '3px solid rgba(255,255,255,0.15)' }}>
              {(c.first_name?.[0] || c.full_name?.[0] || '?').toUpperCase()}
            </div>

            {/* Identity */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{c.full_name}</h1>
                <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: statusStyle.bg, color: statusStyle.text }}>
                  {c.application_status?.replace('_', ' ') || 'submitted'}
                </span>
              </div>
              {c.headline && <p style={{ margin: '6px 0 0', fontSize: 16, color: '#a5b4fc', fontWeight: 500 }}>{c.headline}</p>}
              <div style={{ marginTop: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {c.candidate_email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                    <Mail size={14} color="#6366f1" /> {c.candidate_email}
                  </span>
                )}
                {c.phone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                    <Phone size={14} color="#6366f1" /> {c.phone}
                  </span>
                )}
                {(c.city || c.country) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                    <MapPin size={14} color="#6366f1" /> {[c.city, c.country].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Score badges */}
            <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
              <div style={{ background: getMatchBg(c.ai_match_score || 0), borderRadius: 14, padding: '14px 20px', textAlign: 'center', minWidth: 90 }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: getMatchColor(c.ai_match_score || 0), lineHeight: 1 }}>{c.ai_match_score || 0}%</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{getMatchLabel(c.ai_match_score || 0)}</div>
              </div>
              {topSim && (
                <div style={{ background: getScoreBg(topSim.avg_task_score || 0), borderRadius: 14, padding: '14px 20px', textAlign: 'center', minWidth: 90 }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: getScoreColor(topSim.avg_task_score || 0), lineHeight: 1 }}>{Math.round(topSim.avg_task_score || 0)}%</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Sim Score</div>
                </div>
              )}
            </div>
          </div>

          {/* Links row */}
          {(c.linkedin_url || c.github_url || c.portfolio_url || c.website_url) && (
            <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a5b4fc', textDecoration: 'none' }}><Linkedin size={14} /> LinkedIn</a>}
              {c.github_url && <a href={c.github_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a5b4fc', textDecoration: 'none' }}><Github size={14} /> GitHub</a>}
              {c.portfolio_url && <a href={c.portfolio_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a5b4fc', textDecoration: 'none' }}><Globe size={14} /> Portfolio</a>}
              {c.website_url && <a href={c.website_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#a5b4fc', textDecoration: 'none' }}><ExternalLink size={14} /> Website</a>}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: 'flex', marginTop: 28, gap: 4, overflowX: 'auto' }}>
            {TAB_CONFIG.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.5)',
                  borderBottom: activeTab === tab.id ? '2px solid #818cf8' : '2px solid transparent',
                  whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}
              >
                <tab.icon size={15} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── main content ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 40px' }}>

        {/* ======= OVERVIEW ======= */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Contact */}
            <Card title="Contact Information">
              <InfoRow icon={<Mail size={15} color="#8b5cf6" />} label="Email" value={c.candidate_email} />
              {c.phone && <InfoRow icon={<Phone size={15} color="#8b5cf6" />} label="Phone" value={c.phone} />}
              {(c.city || c.country) && <InfoRow icon={<MapPin size={15} color="#8b5cf6" />} label="Location" value={[c.city, c.country].filter(Boolean).join(', ')} />}
              {c.languages && c.languages.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Languages</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(c.languages as string[]).map((l, i) => (
                      <span key={i} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: '#ede9fe', color: '#7c3aed' }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Application */}
            <Card title="Application Details">
              <InfoRow label="Application #" value={`#${c.application_number}`} />
              <InfoRow label="Applied" value={formatDate(c.applied_at)} />
              <InfoRow label="Profile Completion" value={`${c.profile_completion || 0}%`} highlight />
              {c.willing_to_relocate && <div style={{ marginTop: 8, fontSize: 13, color: '#22c55e', fontWeight: 500 }}>✓ Willing to relocate</div>}
              {c.notice_period_days != null && <InfoRow label="Notice Period" value={`${c.notice_period_days} days`} />}
              {c.availability?.status && <InfoRow label="Availability" value={c.availability.status.replace('_', ' ')} />}
            </Card>

            {/* Summary */}
            {c.summary && (
              <div style={{ gridColumn: '1/-1' }}>
                <Card title="Professional Summary">
                  <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.75, margin: 0 }}>{c.summary}</p>
                </Card>
              </div>
            )}

            {/* Resume */}
            {c.primary_resume && c.primary_resume.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <Card title="Resume">
                  {c.primary_resume.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <FileText size={20} color="#8b5cf6" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{r.file_name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatFileSize(r.file_size)}</div>
                      </div>
                      {r.file_url && (
                        <a href={r.file_url} target="_blank" rel="noreferrer" style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', textDecoration: 'none', fontSize: 13, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <ExternalLink size={13} /> Open
                        </a>
                      )}
                    </div>
                  ))}
                </Card>
              </div>
            )}

            {/* Portfolio links */}
            {c.portfolio_links && c.portfolio_links.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <Card title="Portfolio & Links">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {c.portfolio_links.map((pl, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <Globe size={16} color="#8b5cf6" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{pl.title}</div>
                          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{pl.platform}</div>
                        </div>
                        <a href={pl.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                          Visit <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Screening answers */}
            {c.screening_answers && Object.keys(c.screening_answers).length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <Card title="Screening Answers">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {Object.entries(c.screening_answers).map(([key, val], i) => (
                      <div key={i} style={{ paddingBottom: 16, borderBottom: i < Object.keys(c.screening_answers!).length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6', marginBottom: 6 }}>QUESTION {parseInt(key) + 1}</div>
                        <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{String(val)}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ======= EXPERIENCE ======= */}
        {activeTab === 'experience' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!c.work_experience?.length ? (
              <EmptyState icon={<Briefcase size={48} color="#cbd5e1" />} message="No work experience listed" />
            ) : (
              c.work_experience.map((exp, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '20px 24px', borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{exp.title}</div>
                        <div style={{ fontSize: 15, color: '#8b5cf6', fontWeight: 600, marginTop: 2 }}>{exp.company}</div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                          {exp.employment_type} · {exp.location}{exp.industry ? ` · ${exp.industry}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>
                          {formatDate(exp.start_date)} — {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                        </div>
                        {exp.is_current && <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginTop: 4 }}>● Current</div>}
                      </div>
                    </div>
                    {exp.description && <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, marginBottom: 16 }}>{exp.description}</p>}
                    {exp.achievements?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key Achievements</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {exp.achievements.map((a, j) => (
                            <div key={j} style={{ display: 'flex', gap: 10, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
                              <span style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 2 }}>▸</span> {a}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ======= EDUCATION ======= */}
        {activeTab === 'education' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!c.education?.length ? (
              <EmptyState icon={<GraduationCap size={48} color="#cbd5e1" />} message="No education listed" />
            ) : (
              c.education.map((edu, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ padding: '20px 24px', borderLeft: '4px solid #6366f1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{edu.degree}</div>
                        <div style={{ fontSize: 15, color: '#6366f1', fontWeight: 600, marginTop: 2 }}>{edu.institution}</div>
                        <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{edu.field_of_study}</div>
                        {edu.grade && <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}>Grade: <strong>{edu.grade}</strong></div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>
                          {formatDate(edu.start_date)} — {edu.end_date ? formatDate(edu.end_date) : 'Present'}
                        </div>
                        {edu.verified && <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, marginTop: 4 }}>✓ Verified</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {c.certifications && c.certifications.length > 0 && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>Certifications</h3>
                {c.certifications.map((cert, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 10, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{cert.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{cert.issuer}</div>
                    </div>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>Issued {formatDate(cert.issue_date)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======= SKILLS ======= */}
        {activeTab === 'skills' && (
          <div>
            {!c.candidate_skills?.length ? (
              <EmptyState icon={<Code size={48} color="#cbd5e1" />} message="No skills listed" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {c.candidate_skills.map((s, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{s.skill_name}</span>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#ede9fe', color: '#7c3aed', fontWeight: 600 }}>{s.proficiency_label}</span>
                    </div>
                    <div style={{ background: '#e2e8f0', borderRadius: 999, height: 8, overflow: 'hidden', marginBottom: 10 }}>
                      <div style={{ background: 'linear-gradient(90deg, #8b5cf6, #6366f1)', height: '100%', width: `${(s.proficiency_level / 5) * 100}%`, borderRadius: 999, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                      <span>{s.category}</span>
                      {s.years_experience && parseFloat(s.years_experience) > 0 && <span>{parseFloat(s.years_experience).toFixed(1)} yrs exp</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======= SIMULATIONS ======= */}
        {activeTab === 'simulations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {!c.simulations?.length ? (
              <EmptyState icon={<Activity size={48} color="#cbd5e1" />} message="No practical assessments taken" />
            ) : (
              c.simulations.map((sim, idx) => {
                const overallScore = sim.overall_score ? parseFloat(sim.overall_score) : sim.evaluation_overall_score || 0;
                const avgTaskScore = sim.avg_task_score || 0;
                const completedTasks = sim.task_progress?.filter(t => t.status === 'completed').length || 0;
                const totalTasks = sim.total_tasks || sim.task_progress?.length || 0;
                const isExpanded = expandedSimulation === sim.session_id;

                return (
                  <div key={idx} style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                    {/* Sim header */}
                    <div style={{ background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', padding: '24px 28px', borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{sim.simulation_name}</h3>
                            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#ede9fe', color: '#7c3aed' }}>{sim.simulation_type}</span>
                            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>{sim.difficulty}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: sim.session_status === 'completed' ? '#22c55e' : '#f59e0b' }}>
                              {getStatusIcon(sim.session_status)} {sim.session_status}
                            </div>
                          </div>
                          <p style={{ fontSize: 13, color: '#64748b', margin: 0, lineHeight: 1.6, maxWidth: 600 }}>{sim.simulation_description?.slice(0, 220)}...</p>
                        </div>

                        {/* Score pair */}
                        <div style={{ display: 'flex', gap: 16 }}>
                          <div style={{ textAlign: 'center', background: getScoreBg(overallScore), borderRadius: 14, padding: '14px 20px', minWidth: 90 }}>
                            <div style={{ fontSize: 32, fontWeight: 800, color: getScoreColor(overallScore), lineHeight: 1 }}>{Math.round(overallScore)}%</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Overall</div>
                          </div>
                          {avgTaskScore > 0 && (
                            <div style={{ textAlign: 'center', background: getScoreBg(avgTaskScore), borderRadius: 14, padding: '14px 20px', minWidth: 90 }}>
                              <div style={{ fontSize: 32, fontWeight: 800, color: getScoreColor(avgTaskScore), lineHeight: 1 }}>{Math.round(avgTaskScore)}%</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Task Avg</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sim body */}
                    <div style={{ padding: '24px 28px' }}>
                      {/* Quick stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f1f5f9' }}>
                        <QuickStat label="Duration" value={formatDuration(sim.duration_minutes)} />
                        <QuickStat label="Time Spent" value={formatTimeSpent(sim.session_time_spent)} />
                        <QuickStat label="Tasks Completed" value={`${completedTasks} / ${totalTasks}`} color="#22c55e" />
                        {sim.session_started_at && <QuickStat label="Started" value={formatDateTime(sim.session_started_at)} small />}
                        {sim.evaluation_completed_at && <QuickStat label="Evaluated" value={formatDateTime(sim.evaluation_completed_at)} small />}
                      </div>

                      {/* Evaluation metrics */}
                      {(sim.evaluation_punctuality_score > 0 || sim.evaluation_communication_score > 0 || sim.evaluation_problem_solving_score > 0) && (
                        <div style={{ marginBottom: 24 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evaluation Metrics</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                            {[
                              { label: 'Punctuality', val: sim.evaluation_punctuality_score },
                              { label: 'Communication', val: sim.evaluation_communication_score },
                              { label: 'Problem Solving', val: sim.evaluation_problem_solving_score },
                              { label: 'Adaptability', val: sim.evaluation_adaptability_score },
                              { label: 'Collaboration', val: sim.evaluation_collaboration_score },
                              { label: 'Attention to Detail', val: sim.attention_to_detail_score },
                              { label: 'Initiative', val: sim.evaluation_initiative_score },
                            ].filter(m => m.val > 0).map((m, i) => (
                              <div key={i} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{m.label}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                                    <div style={{ background: getScoreColor(m.val), height: '100%', width: `${m.val}%`, borderRadius: 999 }} />
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: getScoreColor(m.val), minWidth: 36 }}>{m.val}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Task progress */}
                      {sim.task_progress && sim.task_progress.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task Progress</div>
                            <button
                              onClick={() => setExpandedSimulation(isExpanded ? null : sim.session_id)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12, background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, color: '#374151' }}
                            >
                              {isExpanded ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show All</>}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {sim.task_progress.slice(0, isExpanded ? undefined : 3).map((task, tIdx) => {
                              const taskScore = task.score != null ? parseFloat(task.score as any) : null;
                              return (
                                <div key={tIdx} style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                  <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                      <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        background: task.status === 'completed' ? '#dcfce7' : task.status === 'in_progress' ? '#fef3c7' : '#f1f5f9',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: 13,
                                        color: task.status === 'completed' ? '#15803d' : task.status === 'in_progress' ? '#92400e' : '#94a3b8',
                                      }}>
                                        {task.status === 'completed' ? <CheckCircle size={16} /> : task.task_index + 1}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{task.task_title}</div>
                                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                          {task.task_type} · {formatDuration(task.task_duration)}
                                          {task.time_spent > 0 && ` · spent ${formatTimeSpent(task.time_spent)}`}
                                        </div>
                                      </div>
                                    </div>
                                    {taskScore !== null ? (
                                      <div style={{ padding: '6px 16px', borderRadius: 20, background: getScoreBg(taskScore) }}>
                                        <span style={{ fontSize: 18, fontWeight: 800, color: getScoreColor(taskScore) }}>{Math.round(taskScore)}%</span>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 12, color: '#94a3b8', padding: '4px 12px', background: '#f1f5f9', borderRadius: 20 }}>
                                        {task.status === 'completed' ? 'Pending Grade' : task.status}
                                      </span>
                                    )}
                                  </div>
                                  {task.feedback && (
                                    <div style={{ padding: '10px 18px', background: '#fefce8', borderTop: '1px solid #fef08a' }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>Feedback: </span>
                                      <span style={{ fontSize: 13, color: '#78350f' }}>{task.feedback}</span>
                                    </div>
                                  )}
                                  {task.github_commit_url && (
                                    <div style={{ padding: '8px 18px', background: '#faf5ff', borderTop: '1px solid #e9d5ff' }}>
                                      <a href={task.github_commit_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <GitBranch size={12} /> View GitHub Commit
                                      </a>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* GitHub links */}
                      {sim.github_links && Object.keys(sim.github_links).length > 0 && (
                        <div style={{ marginTop: 20, padding: '14px 18px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10 }}>GitHub Repository Links</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {Object.entries(sim.github_links).map(([taskIdx, url], i) => (
                              <a key={i} href={url as string} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7c3aed', textDecoration: 'none', padding: '5px 14px', background: '#ede9fe', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                <Github size={12} /> Task {parseInt(taskIdx) + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pass/fail */}
                      {sim.pass_fail_criteria && (
                        <div style={{ marginTop: 16, padding: '12px 16px', background: '#fef3c7', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Target size={16} color="#d97706" />
                          <div style={{ fontSize: 13, color: '#92400e' }}>
                            <strong>Passing Criteria:</strong> {sim.pass_fail_criteria.overallScore?.minimum || 70}% or higher required
                            {sim.pass_fail_criteria.criticalTasks?.length > 0 && ` · ${sim.pass_fail_criteria.criticalTasks.length} critical task(s)`}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ======= TIMELINE ======= */}
        {activeTab === 'timeline' && (
          <div>
            {!c.application_timeline?.length ? (
              <EmptyState icon={<Calendar size={48} color="#cbd5e1" />} message="No timeline events yet" />
            ) : (
              <div style={{ position: 'relative', paddingLeft: 32 }}>
                <div style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, background: '#e2e8f0', borderRadius: 1 }} />
                {c.application_timeline.map((event, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 24 }}>
                    <div style={{ position: 'absolute', left: -21, top: 14, width: 14, height: 14, borderRadius: '50%', background: '#8b5cf6', border: '3px solid #fff', boxShadow: '0 0 0 2px #e2e8f0' }} />
                    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{event.event_type?.replace(/_/g, ' ').toUpperCase()}</div>
                          {event.event_data?.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{event.event_data.description}</div>}
                          {event.event_data?.new_status && (
                            <div style={{ fontSize: 12, color: '#8b5cf6', marginTop: 4, fontWeight: 500 }}>→ {event.event_data.new_status}</div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatDateTime(event.created_at)}</div>
                          {event.created_by_email && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>by {event.created_by_email}</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── small reusable sub-components ── */

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
    <h4 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>{title}</h4>
    {children}
  </div>
);

const InfoRow: React.FC<{ icon?: React.ReactNode; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #f8fafc' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b' }}>
      {icon}{label}
    </div>
    <span style={{ fontSize: 13, fontWeight: highlight ? 700 : 500, color: highlight ? '#8b5cf6' : '#0f172a' }}>{value}</span>
  </div>
);

const QuickStat: React.FC<{ label: string; value: string; color?: string; small?: boolean }> = ({ label, value, color, small }) => (
  <div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: small ? 13 : 15, fontWeight: 600, color: color || '#0f172a' }}>{value}</div>
  </div>
);

const EmptyState: React.FC<{ icon: React.ReactNode; message: string }> = ({ icon, message }) => (
  <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
    {icon}
    <p style={{ marginTop: 16, fontSize: 14, color: '#64748b' }}>{message}</p>
  </div>
);

export default CandidateDetailView;