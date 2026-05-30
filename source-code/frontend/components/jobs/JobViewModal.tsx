import React, { useState } from 'react';
import {
  X, MapPin, Clock, Users, Briefcase, Building2, Target,
  CheckCircle, DollarSign, Star, Globe, FileText, Languages,
  GraduationCap, Layers, Eye, Calendar, AlertCircle, Info,
  ThumbsUp, User, ChevronRight,
} from 'lucide-react';

interface JobViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  matchScore?: number;
  criteria_scores?: {
    skillsScore?: number;
    qualificationsScore?: number;
    experienceScore?: number;
    preferencesScore?: number;
  };
  // full transformed match object from jobHelpers.transformMatchData
  matchData?: any;
  // candidate summary from AI response
  candidateInfo?: any;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const safe = (v: any, fallback = 0): number => { const n = Number(v); return isNaN(n) ? fallback : n; };
const toArr = (v: any): any[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return v.trim() ? [v] : []; }
  }
  return [];
};
const fmtDate = (d: any) => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const skillLabel = (s: any) => typeof s === 'string' ? s : (s?.name || s?.title || '');
const fmtNum = (n: number) => n.toLocaleString();

// ── Sub-components ─────────────────────────────────────────────────────────────

const Pill = ({ text, color = 'gray' }: { text: string; color?: string }) => {
  const c: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800', orange: 'bg-orange-100 text-orange-800',
    gray: 'bg-gray-100 text-gray-700', active: 'bg-green-100 text-green-800', draft: 'bg-yellow-100 text-yellow-800',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c[color] || c.gray}`}>{text}</span>;
};

const Section = ({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) => (
  <div className="mb-6">
    <h3 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-100">
      {Icon && <Icon size={16} className="text-purple-500" />}{title}
    </h3>
    {children}
  </div>
);

const FactorRow = ({
  label, score, weight, pts, colour, children,
}: { label: string; score: number; weight: string; pts: number; colour: string; children?: React.ReactNode }) => (
  <div className="mb-3">
    <div className="flex items-center justify-between text-sm mb-1">
      <span className="font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className={`font-bold px-2 py-0.5 rounded-full ${
          score >= 80 ? 'bg-green-100 text-green-800' : score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
        }`}>{score.toFixed(0)}%</span>
        <span className="text-gray-400">× {weight} = <strong className="text-gray-700">{pts.toFixed(1)} pts</strong></span>
      </div>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${colour} h-2 rounded-full transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
    </div>
    {children}
  </div>
);

// ── Match level colour ─────────────────────────────────────────────────────────
const matchLevelBg = (level: string) => {
  if (level.includes('Excellent')) return 'bg-green-50 border-green-200 text-green-900';
  if (level.includes('Strong'))    return 'bg-blue-50 border-blue-200 text-blue-900';
  if (level.includes('Good'))      return 'bg-yellow-50 border-yellow-200 text-yellow-900';
  if (level.includes('Partial'))   return 'bg-orange-50 border-orange-200 text-orange-900';
  return 'bg-gray-50 border-gray-200 text-gray-900';
};

// ── Main Modal ─────────────────────────────────────────────────────────────────

const JobViewModal: React.FC<JobViewModalProps> = ({
  isOpen, onClose, job, matchScore: userMatchScore, criteria_scores,
  matchData, candidateInfo,
}) => {
  const [tab, setTab] = useState<'match' | 'job'>('match');
  if (!isOpen || !job) return null;

  // ── Derived job values ─────────────────────────────────────────────────────
  const fmtSalary = () => {
    const min = safe(job.salary_min); const max = safe(job.salary_max);
    const cur = job.salary_currency || 'USD'; const per = job.salary_period ? `/ ${job.salary_period}` : '';
    if (!min && !max) return null;
    if (min && max) return `${cur} ${fmtNum(min)} – ${fmtNum(max)} ${per}`.trim();
    if (min) return `${cur} ${fmtNum(min)}+ ${per}`.trim();
    return `Up to ${cur} ${fmtNum(max)} ${per}`.trim();
  };
  const fmtLocation = () => {
    if (job.location) return job.location;
    const locs = toArr(job.locations);
    if (!locs.length) return null;
    return locs.map((l: any) => {
      if (typeof l === 'string') return l;
      if (l?.is_remote) return 'Remote';
      return [l?.city, l?.country].filter(Boolean).join(', ') || null;
    }).filter(Boolean).join(' · ');
  };

  const salary         = fmtSalary();
  const location       = fmtLocation();
  const postedDate     = fmtDate(job.published_at || job.created_at);
  const expiryDate     = fmtDate(job.expires_at);
  const companyName    = job.company_name || job.companyName || null;
  const status         = job.status || 'active';
  const jobType        = job.job_type || job.jobType || null;
  const arrangement    = job.work_arrangement || job.workArrangement || null;
  const expLevel       = job.experience_level || job.experienceLevel || null;
  const department     = job.department || null;
  const appCount       = safe(job.application_count);
  const viewCount      = safe(job.view_count);
  const expMin         = safe(job.experience_min);
  const expMax         = safe(job.experience_max);
  const aiMinScore     = job.ai_match_required_score != null ? safe(job.ai_match_required_score) : null;
  const education      = job.education_required?.minimum_degree || null;
  const requiredSkills = toArr(job.skills_required);
  const preferredSkills = toArr(job.skills_preferred);
  const responsibilities = toArr(job.responsibilities);
  const requirements   = toArr(job.requirements);
  const benefits       = toArr(job.benefits);
  const languages      = toArr(job.language_requirements || job.education_required?.languages);
  const expReqs        = toArr(job.experience_requirements || job.education_required?.experience_requirements);
  const certifications = toArr(job.education_required?.certifications);
  const screeningQs    = toArr(job.screening_questions || job.screeningQuestions);

  // ── Derived match values ───────────────────────────────────────────────────
  const hasMatch   = matchData || userMatchScore !== undefined;
  const matchScore = matchData?.matchScore ?? safe(userMatchScore, -1);
  const matchLevel = matchData?.matchLevel || '';
  const matchStars = matchData?.matchStars || '';
  const matchRec   = matchData?.matchRecommendation || matchData?.recommendation || '';
  const criteria   = matchData?.criteriaScores || {};
  const skillsScore  = criteria.skills_match        ?? safe(criteria_scores?.skillsScore, 0);
  const qualsScore   = criteria.qualifications_match ?? safe(criteria_scores?.qualificationsScore, 0);
  const expScore     = criteria.experience_match     ?? safe(criteria_scores?.experienceScore, 0);
  const prefsScore   = criteria.preferences_match    ?? safe(criteria_scores?.preferencesScore, 0);

  const matchedSkills : string[] = matchData?.matchedSkills  || [];
  const missingSkills : string[] = matchData?.missingSkills   || [];
  const skillsBD                 = matchData?.skillsBreakdown || null;
  const expBD                    = matchData?.experienceBreakdown || null;
  const qualsBD                  = matchData?.qualificationsBreakdown || null;
  const reasons                  = matchData?.matchReasons || [];

  // candidate info from AI
  const candName   = candidateInfo?.name            || '';
  const candYears  = candidateInfo?.total_experience_years ?? expBD?.candidate_years;
  const candSkills : string[] = candidateInfo?.skills || [];

  // Deduplicate and pair degrees with their fields of study
  const rawDegrees: string[] = qualsBD?.candidate_degrees || [];
  const rawFields : string[] = qualsBD?.candidate_fields  || [];
  // unique degrees
  const candDegrees = [...new Set(rawDegrees.filter(Boolean))];
  // unique fields
  const candFields  = [...new Set(rawFields.filter(Boolean))];
  // build combined "Degree in Field" labels (pair by index, deduplicate result)
  const candEduLabels: string[] = [];
  const maxEdu = Math.max(candDegrees.length, candFields.length);
  for (let i = 0; i < maxEdu; i++) {
    const deg = candDegrees[i] || '';
    const fld = candFields[i]  || '';
    const label = deg && fld ? `${deg} in ${fld}` : deg || fld;
    if (label && !candEduLabels.includes(label)) candEduLabels.push(label);
  }
  // if no pairs, add lone degrees/fields
  if (candEduLabels.length === 0) {
    candDegrees.forEach(d => { if (!candEduLabels.includes(d)) candEduLabels.push(d); });
    candFields.forEach(f => { if (!candEduLabels.includes(f)) candEduLabels.push(f); });
  }

  // job-required fields of study (from education_required JSON)
  const jobEduRequired = (() => {
    let edu = job.education_required;
    if (typeof edu === 'string') { try { edu = JSON.parse(edu); } catch { edu = {}; } }
    return edu || {};
  })();
  const jobRequiredFields: string[] = toArr(jobEduRequired.fields_of_study);
  const jobMinDegree: string = education || jobEduRequired.minimum_degree || '';
  const degSimilarity: number = qualsBD?.degree_similarity ?? null;
  const fieldSimilarity: number = qualsBD?.field_similarity ?? null;

  // ── Score ring colour ──────────────────────────────────────────────────────
  const ringColor = matchScore >= 80 ? '#22c55e' : matchScore >= 60 ? '#3b82f6' : matchScore >= 40 ? '#f59e0b' : '#ef4444';

  // ── Tab label helper ───────────────────────────────────────────────────────
  const TabBtn = ({ id, label }: { id: 'match' | 'job'; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
        tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-4 pb-0 rounded-t-2xl flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{job.title || '—'}</h2>
              {companyName && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Building2 size={13} />{companyName}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Tabs — only show Match tab when we have match data */}
          <div className="flex">
            {hasMatch && <TabBtn id="match" label="Match Analysis" />}
            <TabBtn id="job"   label="Job Details" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ════════════════════════════════════════════════════ */}
          {/* TAB: MATCH ANALYSIS                                  */}
          {/* ════════════════════════════════════════════════════ */}
          {tab === 'match' && hasMatch && (
            <div className="space-y-5">

              {/* ── Overall score card ── */}
              <div className={`rounded-2xl border p-5 ${matchLevelBg(matchLevel)}`}>
                <div className="flex items-center gap-5">
                  {/* Circular score */}
                  <div className="relative w-20 h-20 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.2" />
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke={ringColor} strokeWidth="3.2"
                        strokeDasharray={`${matchScore} ${100 - matchScore}`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-extrabold text-gray-900" style={{ color: ringColor }}>
                        {matchScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex-1">
                    <p className="text-xl font-extrabold text-gray-900">{matchLevel || 'AI Match'}</p>
                    {matchStars && <p className="text-base mt-0.5">{matchStars}</p>}
                    {matchRec && (
                      <p className="text-sm font-medium mt-1">{matchRec}</p>
                    )}
                    {candName && (
                      <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                        <User size={11} /> Analysed for: <strong>{candName}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 4-Factor breakdown ── */}
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Target size={15} className="text-blue-600" /> 4-Factor ML Score Breakdown
                </h3>

                <FactorRow label="🔧 Skills"         score={skillsScore} weight="40%" pts={skillsScore * 0.40} colour="bg-green-500">
                  {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {matchedSkills.slice(0, 5).map(s => (
                        <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded-full">
                          <CheckCircle size={9} />{s}
                        </span>
                      ))}
                      {missingSkills.slice(0, 3).map(s => (
                        <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-medium rounded-full border border-red-100">
                          ✗ {s}
                        </span>
                      ))}
                    </div>
                  )}
                </FactorRow>

                <FactorRow label="🎓 Qualifications" score={qualsScore} weight="25%" pts={qualsScore * 0.25} colour="bg-blue-500">
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    {/* Candidate side */}
                    <div className="bg-blue-50 rounded-lg px-2.5 py-2">
                      <p className="font-semibold text-blue-700 mb-1">You have</p>
                      {candEduLabels.length > 0
                        ? candEduLabels.map(l => <p key={l} className="text-blue-900">{l}</p>)
                        : <p className="text-gray-400 italic">Not specified</p>
                      }
                      {degSimilarity !== null && (
                        <p className="text-blue-500 mt-1">Degree match: {(degSimilarity * 100).toFixed(0)}%</p>
                      )}
                    </div>
                    {/* Job side */}
                    <div className="bg-gray-100 rounded-lg px-2.5 py-2">
                      <p className="font-semibold text-gray-600 mb-1">Job requires</p>
                      {jobMinDegree && <p className="text-gray-800 font-medium">{jobMinDegree}</p>}
                      {jobRequiredFields.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {jobRequiredFields.map(f => (
                            <span key={f} className="px-1.5 py-0.5 bg-white border border-gray-300 text-gray-700 rounded-full">{f}</span>
                          ))}
                        </div>
                      )}
                      {fieldSimilarity !== null && jobRequiredFields.length > 0 && (
                        <p className="text-gray-500 mt-1">Field match: {(fieldSimilarity * 100).toFixed(0)}%</p>
                      )}
                    </div>
                  </div>
                </FactorRow>

                <FactorRow label="📅 Experience"     score={expScore}   weight="20%" pts={expScore   * 0.20} colour="bg-purple-500">
                  {expBD && (
                    <div className="flex gap-4 text-[11px] text-gray-500 mt-1">
                      <span>You: <strong>{expBD.candidate_years?.toFixed(1)} yrs</strong></span>
                      <span>Required: <strong>{expBD.job_min_years}+ yrs</strong></span>
                      {expBD.gap_years > 0
                        ? <span className="text-orange-600 font-semibold">Gap: {expBD.gap_years.toFixed(1)} yrs</span>
                        : <span className="text-green-600 font-semibold">✓ Met</span>
                      }
                    </div>
                  )}
                </FactorRow>

                <FactorRow label="⚙️ Preferences"   score={prefsScore} weight="15%" pts={prefsScore * 0.15} colour="bg-yellow-500" />

                {/* Total */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm font-bold text-gray-900 mb-1">
                    <span>Total Score</span>
                    <span style={{ color: ringColor }}>{matchScore.toFixed(1)} / 100 pts</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${matchScore}%`, background: ringColor }} />
                  </div>
                </div>
              </div>

              {/* ── Candidate vs Job side-by-side ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Left: what YOU have */}
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <User size={14} /> Your Profile
                  </h4>

                  {/* Skills */}
                  {(candSkills.length > 0 || matchedSkills.length > 0) && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1.5">Skills you have</p>
                      <div className="flex flex-wrap gap-1">
                        {(candSkills.length > 0 ? candSkills : matchedSkills).slice(0, 10).map(s => (
                          <span key={s} className="px-2 py-0.5 bg-white border border-blue-200 text-blue-800 text-[11px] font-medium rounded-full">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experience */}
                  {(candYears != null) && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Experience</p>
                      <p className="text-sm font-bold text-blue-900">{Number(candYears).toFixed(1)} years</p>
                    </div>
                  )}

                  {/* Education */}
                  {candEduLabels.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-700 mb-1">Education</p>
                      {candEduLabels.map(l => (
                        <p key={l} className="text-sm text-blue-900 font-medium">{l}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: what the JOB requires */}
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <Briefcase size={14} /> Job Requires
                  </h4>

                  {/* Required skills */}
                  {requiredSkills.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">Required skills</p>
                      <div className="flex flex-wrap gap-1">
                        {requiredSkills.slice(0, 10).map((s: any) => {
                          const name = skillLabel(s);
                          const isMatched = matchedSkills.some(m => m.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(m.toLowerCase()));
                          return (
                            <span key={name} className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${
                              isMatched ? 'bg-green-100 border-green-200 text-green-800' : 'bg-white border-gray-200 text-gray-700'
                            }`}>
                              {isMatched && '✓ '}{name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Experience */}
                  {(expMin > 0 || expMax > 0) && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1">Experience required</p>
                      <p className="text-sm font-bold text-gray-900">
                        {expMin && expMax ? `${expMin}–${expMax} years` : expMin ? `${expMin}+ years` : `Up to ${expMax} years`}
                      </p>
                    </div>
                  )}

                  {/* Education */}
                  {(jobMinDegree || jobRequiredFields.length > 0) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">Education required</p>
                      {jobMinDegree && <p className="text-sm font-bold text-gray-900">{jobMinDegree}</p>}
                      {jobRequiredFields.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {jobRequiredFields.map(f => (
                            <span key={f} className="px-2 py-0.5 bg-purple-100 text-purple-800 text-[11px] font-medium rounded-full">{f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Skills gap full list ── */}
              {missingSkills.length > 0 && (
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <h4 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
                    <AlertCircle size={14} /> Skills Gap — Consider Learning These
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSkills.map(s => (
                      <span key={s} className="px-2.5 py-1 bg-white border border-orange-200 text-orange-800 text-xs font-medium rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-orange-600 mt-2">
                    Gaining {missingSkills.length} skill{missingSkills.length !== 1 ? 's' : ''} could significantly improve your match score.
                  </p>
                </div>
              )}

              {/* ── Match reasons ── */}
              {reasons.length > 0 && (
                <div className="space-y-2">
                  {reasons.map((r: any, i: number) => (
                    <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm ${
                      r.type === 'positive'    ? 'bg-green-50 text-green-800' :
                      r.type === 'warning'     ? 'bg-amber-50 text-amber-800' :
                                                 'bg-blue-50 text-blue-800'
                    }`}>
                      {r.type === 'positive' ? <ThumbsUp size={13} className="mt-0.5 shrink-0" /> :
                       r.type === 'warning'  ? <AlertCircle size={13} className="mt-0.5 shrink-0" /> :
                                               <Info size={13} className="mt-0.5 shrink-0" />}
                      {r.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* TAB: JOB DETAILS                                     */}
          {/* ════════════════════════════════════════════════════ */}
          {tab === 'job' && (
            <div>
              {/* Meta chips */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Pill text={status.charAt(0).toUpperCase() + status.slice(1)} color={status === 'active' ? 'active' : 'draft'} />
                {jobType     && <Pill text={jobType.replace('-', ' ')}  color="blue"   />}
                {arrangement && <Pill text={arrangement}                color="purple" />}
                {expLevel    && <Pill text={expLevel + ' level'}        color="orange" />}
                {department  && <Pill text={department}                 color="gray"   />}
              </div>

              {/* Info row */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
                {location    && <span className="flex items-center gap-1.5"><MapPin size={14} />{location}</span>}
                {postedDate  && <span className="flex items-center gap-1.5"><Clock size={14} />Posted {postedDate}</span>}
                {expiryDate  && <span className="flex items-center gap-1.5"><Calendar size={14} />Closes {expiryDate}</span>}
                <span className="flex items-center gap-1.5"><Users size={14} />{appCount} applicants</span>
                {viewCount > 0 && <span className="flex items-center gap-1.5"><Eye size={14} />{viewCount} views</span>}
              </div>

              {/* Salary */}
              {salary && (
                <div className="mb-5 flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                  <DollarSign size={20} className="text-green-600 shrink-0" />
                  <p className="text-lg font-bold text-green-700">{salary}</p>
                </div>
              )}

              {/* AI min score */}
              {aiMinScore !== null && aiMinScore > 0 && (
                <div className="mb-5 p-4 bg-purple-50 border border-purple-100 rounded-xl flex items-center gap-3">
                  <Target size={18} className="text-purple-600 shrink-0" />
                  <p className="text-sm text-purple-800">
                    Requires minimum <strong>{aiMinScore}% AI match score</strong> to be considered.
                  </p>
                </div>
              )}

              {/* Description */}
              {job.description && (
                <Section title="Job Description" icon={FileText}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{job.description}</p>
                </Section>
              )}

              {responsibilities.length > 0 && (
                <Section title="Key Responsibilities" icon={Layers}>
                  <ul className="space-y-1.5">
                    {responsibilities.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle size={13} className="text-purple-400 shrink-0 mt-0.5" />{r}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {requirements.length > 0 && (
                <Section title="Requirements" icon={Briefcase}>
                  <ul className="space-y-1.5">
                    {requirements.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <ChevronRight size={13} className="text-blue-400 shrink-0 mt-0.5" />{r}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {requiredSkills.length > 0 && (
                <Section title="Required Skills">
                  <div className="flex flex-wrap gap-2">
                    {requiredSkills.map((s: any, i: number) => {
                      const name = skillLabel(s);
                      const matched = matchedSkills.some(m => m.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(m.toLowerCase()));
                      return (
                        <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium ${matched ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                          {matched && '✓ '}{name}
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}

              {preferredSkills.length > 0 && (
                <Section title="Nice-to-Have Skills">
                  <div className="flex flex-wrap gap-2">
                    {preferredSkills.map((s: any, i: number) => (
                      <span key={i} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">{skillLabel(s)}</span>
                    ))}
                  </div>
                </Section>
              )}

              {expReqs.length > 0 && (
                <Section title="Experience Required">
                  <ul className="space-y-1.5">
                    {expReqs.map((e: any, i: number) => (
                      <li key={i} className="text-sm text-gray-700">
                        {typeof e === 'string' ? e : `${e.title || e.field || ''}${e.years ? ` — ${e.years} yr${e.years !== '1' ? 's' : ''}` : ''}${e.description ? ` (${e.description})` : ''}`}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {education && (
                <Section title="Education" icon={GraduationCap}>
                  <p className="text-sm text-gray-700">{education}</p>
                  {certifications.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {certifications.map((c: string, i: number) => (
                        <span key={i} className="px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">{c}</span>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {languages.length > 0 && (
                <Section title="Language Requirements" icon={Languages}>
                  <div className="flex flex-wrap gap-2">
                    {languages.map((l: any, i: number) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` — ${l.proficiency}` : ''}${l.is_required ? ' ✓' : ''}`}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {benefits.length > 0 && (
                <Section title="Benefits" icon={Star}>
                  <div className="flex flex-wrap gap-2">
                    {benefits.map((b: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-full text-xs">{b}</span>
                    ))}
                  </div>
                </Section>
              )}

              {screeningQs.length > 0 && (
                <Section title="Screening Questions">
                  <ol className="space-y-2">
                    {screeningQs.map((q: any, i: number) => (
                      <li key={i} className="text-sm text-gray-700">
                        <span className="font-medium">{i + 1}.</span>{' '}
                        {typeof q === 'string' ? q : q.question}
                        {q?.required && <span className="ml-1.5 text-xs text-red-500">(required)</span>}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {toArr(job.tags).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {toArr(job.tags).map((t: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobViewModal;
