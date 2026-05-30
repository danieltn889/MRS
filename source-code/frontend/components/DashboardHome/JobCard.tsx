// components/DashboardHome/JobCard.tsx
import React, { useState } from 'react';
import {
  MapPin, DollarSign, Clock, Briefcase, Building2, Shield, Star,
  ExternalLink, Bookmark, CheckCircle, Users, Timer,
  GraduationCap, Layers, Tag, Eye, ChevronDown, ChevronUp,
  ThumbsUp, AlertCircle, Info, X,
} from 'lucide-react';

interface JobCardProps {
  job: any;
  isAiMatch?: number;
  isApplied?: boolean;
  isSaved?: boolean;
  getMatchColor?: (score: number) => string;
  getScoreColor?: (score: number) => string;
  onViewDetails?: (job: any) => void;
  onSaveJob?: (jobId: string, isSaved: boolean) => void;
  onViewApplication?: (job: any) => void;
  onWithdrawApplication?: (job: any) => void;
  onApplyNow?: (job: any) => void;
  formatFullDate?: (date: string) => string;
}

// ── Match level → colour ──────────────────────────────────────────────────────
const matchLevelStyle = (level: string) => {
  if (level.includes('Excellent')) return 'bg-green-100 text-green-800 border-green-200';
  if (level.includes('Strong'))    return 'bg-blue-100 text-blue-800 border-blue-200';
  if (level.includes('Good'))      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (level.includes('Partial'))   return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

// ── Thin progress bar ─────────────────────────────────────────────────────────
const FactorBar = ({ label, score, colour, weight }: { label: string; score: number; colour: string; weight: string }) => (
  <div className="mb-1.5">
    <div className="flex justify-between text-[11px] mb-0.5">
      <span className="text-gray-600">{label} <span className="text-gray-400">({weight})</span></span>
      <span className="font-semibold text-gray-800">{score.toFixed(0)}%</span>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`${colour} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
    </div>
  </div>
);

const JobCard: React.FC<JobCardProps> = ({
  job,
  isAiMatch,
  isApplied = false,
  isSaved   = false,
  getMatchColor = () => 'bg-green-100 text-green-800',
  getScoreColor = () => 'bg-green-600',
  onViewDetails          = () => {},
  onSaveJob              = () => {},
  onViewApplication      = () => {},
  onWithdrawApplication  = () => {},
  onApplyNow             = () => {},
  formatFullDate         = (d) => d,
}) => {
  const [expanded, setExpanded] = useState(false);

  const matchScore   = job.matchScore    || 0;
  const matchLevel   = job.matchLevel    || '';
  const matchStars   = job.matchStars    || '';
  const matchRec     = job.matchRecommendation || job.recommendation || '';
  const criteria     = job.criteriaScores || {};

  const skillsScore  = criteria.skills_match        ?? 0;
  const qualsScore   = criteria.qualifications_match ?? 0;
  const expScore     = criteria.experience_match     ?? 0;
  const prefsScore   = criteria.preferences_match    ?? 0;

  const matched  : string[] = job.matchedSkills || [];
  const missing  : string[] = job.missingSkills  || [];
  const expBD                = job.experienceBreakdown    || null;
  const qualsBD              = job.qualificationsBreakdown || null;
  const skillsBD             = job.skillsBreakdown        || null;

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden border border-gray-100">
      {/* Score colour strip */}
      {isAiMatch && <div className={`h-1.5 ${getScoreColor(matchScore)}`} />}

      <div className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">

          {/* ── Left: content ─────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Header row */}
            <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-gray-900 truncate">{job.title}</h3>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
                  {job.companyLogo
                    ? <img src={job.companyLogo} alt={job.company} className="w-4 h-4 rounded" />
                    : <Building2 size={14} />}
                  <span>{job.company}</span>
                  {job.companyVerificationBadge && <Shield size={12} className="text-green-600" title="Verified" />}
                </div>
              </div>

              {isAiMatch && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${getMatchColor(matchScore)}`}>
                    <Star size={13} fill="currentColor" />{matchScore.toFixed(1)}% Match
                  </span>
                  {matchLevel && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${matchLevelStyle(matchLevel)}`}>
                      {matchLevel}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1"><MapPin size={12} />{job.location}</span>
              <span className="flex items-center gap-1"><DollarSign size={12} />{job.salary}</span>
              <span className="flex items-center gap-1"><Clock size={12} />{job.postedDate}</span>
              <span className="flex items-center gap-1"><Briefcase size={12} />{job.type}{job.workArrangement && ` · ${job.workArrangement}`}</span>
              {job.applications > 0 && <span className="flex items-center gap-1"><Users size={12} />{job.applications} applicants</span>}
            </div>

            {/* Expiry banner */}
            {job.expiresAt && (
              <div className={`mb-3 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${job.expiryStatusColor}`}>
                <Timer size={13} />
                {job.isExpired
                  ? `Closed on ${formatFullDate(job.expiresAt)}`
                  : `Closing ${job.daysRemaining} · ${formatFullDate(job.expiresAt)}`}
              </div>
            )}

            <p className="text-sm text-gray-600 line-clamp-2 mb-3">{job.description}</p>

            {/* ── 4-Factor ML breakdown ───────────────────────── */}
            {isAiMatch && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setExpanded(p => !p)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <CheckCircle size={13} /> 4-Factor AI Match Analysis
                    {matchStars && <span className="ml-1">{matchStars}</span>}
                  </span>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {expanded && (
                  <div className="mt-2 px-3 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl space-y-1">
                    <FactorBar label="🔧 Skills"         score={skillsScore} colour="bg-green-500"  weight="40%" />
                    <FactorBar label="🎓 Qualifications" score={qualsScore}  colour="bg-blue-500"   weight="25%" />
                    <FactorBar label="📅 Experience"     score={expScore}    colour="bg-purple-500" weight="20%" />
                    <FactorBar label="⚙️ Preferences"    score={prefsScore}  colour="bg-yellow-500" weight="15%" />

                    {/* Total */}
                    <div className="pt-2 mt-2 border-t border-blue-200">
                      <div className="flex justify-between text-xs font-bold text-blue-900 mb-1">
                        <span>Total Match Score</span>
                        <span>{matchScore.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${getScoreColor(matchScore)}`} style={{ width: `${matchScore}%` }} />
                      </div>
                    </div>

                    {/* Recommendation */}
                    {matchRec && (
                      <p className="text-[11px] text-center text-blue-700 font-medium pt-1">{matchRec}</p>
                    )}

                    {/* Skills detail */}
                    {(matched.length > 0 || missing.length > 0) && (
                      <div className="pt-2 mt-2 border-t border-blue-200 space-y-1.5">
                        {skillsBD && (
                          <p className="text-[11px] text-gray-500">
                            Skills: {skillsBD.total_matched}/{skillsBD.total_required} required matched
                          </p>
                        )}
                        {matched.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {matched.slice(0, 6).map(s => (
                              <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded-full">
                                <CheckCircle size={9} />{s}
                              </span>
                            ))}
                          </div>
                        )}
                        {missing.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {missing.slice(0, 4).map(s => (
                              <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-medium rounded-full border border-red-100">
                                <X size={9} />{s}
                              </span>
                            ))}
                            {missing.length > 4 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                                +{missing.length - 4} more gaps
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Experience breakdown */}
                    {expBD && (
                      <div className="pt-2 mt-1.5 border-t border-blue-200 text-[11px] text-gray-600 flex gap-4">
                        <span>Your exp: <strong>{expBD.candidate_years?.toFixed(1)} yrs</strong></span>
                        <span>Required: <strong>{expBD.job_min_years}+ yrs</strong></span>
                        {expBD.gap_years > 0 && (
                          <span className="text-orange-600 font-semibold">Gap: {expBD.gap_years.toFixed(1)} yrs</span>
                        )}
                      </div>
                    )}

                    {/* Qualifications breakdown */}
                    {qualsBD && (qualsBD.candidate_degrees?.length > 0 || qualsBD.job_degree_required) && (
                      <div className="pt-1.5 text-[11px] text-gray-600">
                        <span className="flex items-center gap-1"><GraduationCap size={11} />
                          {qualsBD.candidate_degrees?.join(', ') || '—'}
                          {qualsBD.job_degree_required && <span className="text-gray-400"> · Required: {qualsBD.job_degree_required}</span>}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Match reasons (compact, always visible) */}
            {isAiMatch && job.matchReasons?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {job.matchReasons.slice(0, 3).map((r: any, i: number) => (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    r.type === 'positive'    ? 'bg-green-50 text-green-700'  :
                    r.type === 'warning'     ? 'bg-amber-50 text-amber-700'  :
                                               'bg-blue-50 text-blue-700'
                  }`}>
                    {r.type === 'positive' ? <ThumbsUp size={9} /> : r.type === 'warning' ? <AlertCircle size={9} /> : <Info size={9} />}
                    {r.text}
                  </span>
                ))}
              </div>
            )}

            {/* Required skills pills (non-AI or compact fallback) */}
            {!isAiMatch && job.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {job.skills.slice(0, 6).map((s: any, i: number) => {
                  const name = typeof s === 'string' ? s : s.name;
                  return (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{name}</span>
                  );
                })}
              </div>
            )}

            {/* Footer meta */}
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mt-1">
              {(job.experienceMin || job.experienceMax) && (
                <span className="flex items-center gap-1"><Briefcase size={11} />
                  {job.experienceMin && job.experienceMax ? `${job.experienceMin}-${job.experienceMax} yrs` : job.experienceMin ? `${job.experienceMin}+ yrs` : `Up to ${job.experienceMax} yrs`}
                </span>
              )}
              {job.department && <span className="flex items-center gap-1"><Layers size={11} />{job.department}</span>}
              {job.tags?.length > 0 && <span className="flex items-center gap-1"><Tag size={11} />{job.tags.slice(0, 3).join(', ')}</span>}
              {job.viewCount > 0 && <span className="flex items-center gap-1"><Eye size={11} />{job.viewCount} views</span>}
            </div>
          </div>

          {/* ── Right: action buttons ──────────────────────────── */}
          <div className="flex flex-col gap-2 lg:w-44 shrink-0">
            <button type="button" onClick={() => onViewDetails(job)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              <ExternalLink size={15} /> View Details
            </button>

            <button type="button" onClick={() => onSaveJob(job.id, isSaved)}
              className="w-full px-4 py-2 border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-50 text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
              <Bookmark size={15} fill={isSaved ? 'currentColor' : 'none'} />
              {isSaved ? 'Saved' : 'Save Job'}
            </button>

            {isApplied ? (
              <>
                <button type="button" onClick={() => onViewApplication(job)}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold transition-colors">
                  View Application
                </button>
                {!job.isExpired && (
                  <button type="button" onClick={() => onWithdrawApplication(job)}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold transition-colors">
                    Withdraw
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => onApplyNow(job)} disabled={job.isExpired}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {job.isExpired ? 'Expired' : <><CheckCircle size={15} /> Apply Now</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCard;
