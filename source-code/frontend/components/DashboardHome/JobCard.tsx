// components/DashboardHome/JobCard.tsx
import React, { useState } from 'react';
import {
  MapPin, DollarSign, Clock, Briefcase, Building2, Shield, Star,
  ExternalLink, Bookmark, CheckCircle, Users, Timer,
  GraduationCap, Layers, Tag, Eye, ChevronDown, ChevronUp,
  ThumbsUp, AlertCircle, Info, X, Calendar, Globe, Link as LinkIcon,
  Award, FileText, MessageSquare, List, Heart, Briefcase as BriefcaseIcon,
  Code, Server, Database, Cloud, Smartphone, PenTool, BarChart, TrendingUp
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
  getDaysRemaining?: (expiresAt: string) => string | null;
}

const matchLevelStyle = (level: string) => {
  if (level?.includes('Excellent')) return 'bg-green-100 text-green-800 border-green-200';
  if (level?.includes('Strong'))    return 'bg-blue-100 text-blue-800 border-blue-200';
  if (level?.includes('Good'))      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (level?.includes('Partial'))   return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

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
  getDaysRemaining: getDaysRemainingProp = (expiresAt) => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Last day today!';
    if (diffDays === 1) return '1 day left';
    return `${diffDays} days left`;
  }
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

  const matchScore   = job.matchScore    || 0;
  const matchLevel   = job.matchLevel    || '';
  const matchStars   = job.matchStars    || '';
  const criteria     = job.criteriaScores || {};

  const skillsScore  = criteria.skills_match        ?? 0;
  const qualsScore   = criteria.qualifications_match ?? 0;
  const expScore     = criteria.experience_match     ?? 0;
  const prefsScore   = criteria.preferences_match    ?? 0;

  // Extract ALL job details from the response
  const rawJob = job.rawJob || job.job || job;
  
  // Company details
  const company = rawJob.company || {};
  const companyName = rawJob.company_name || company.name || job.company || 'Unknown Company';
  const companyLogo = rawJob.company_logo_url || company.logo_url;
  const companyVerified = rawJob.company_verified || company.verified || false;
  const companyIndustry = rawJob.company_industry || company.industry || rawJob.industry;
  const companySize = rawJob.company_size || company.size;
  const companyWebsite = rawJob.company_website || company.website;
  const companyDescription = rawJob.company_description || company.description;
  
  // Job details
  const jobType = rawJob.job_type || job.type || 'Full-time';
  const workArrangement = rawJob.work_arrangement || job.workArrangement || 'Onsite';
  const locations = rawJob.locations || [];
  const locationDisplay = locations.map((l: any) => 
    typeof l === 'string' ? l : `${l.city || ''} ${l.country || ''}`.trim()
  ).filter(Boolean).join(', ') || job.location || 'Location not specified';
  
  // Salary details
  const salaryMin = rawJob.salary_min || job.salary_min;
  const salaryMax = rawJob.salary_max || job.salary_max;
  const salaryCurrency = rawJob.salary_currency || job.salary_currency || 'Rwf';
  const salaryPeriod = rawJob.salary_period || 'month';
  let salaryDisplay = job.salary;
  if (!salaryDisplay && salaryMin && salaryMax) {
    salaryDisplay = `${salaryCurrency} ${salaryMin.toLocaleString()} - ${salaryMax.toLocaleString()} ${salaryPeriod === 'year' ? '/year' : salaryPeriod === 'month' ? '/month' : ''}`;
  } else if (!salaryDisplay && salaryMin) {
    salaryDisplay = `${salaryCurrency} ${salaryMin.toLocaleString()}+ ${salaryPeriod === 'year' ? '/year' : '/month'}`;
  }
  
  // Experience details
  const expMin = rawJob.experience_min || job.experience_min;
  const expMax = rawJob.experience_max || job.experience_max;
  const expLevel = rawJob.experience_level || job.experience_level;
  
  // Education details
  const eduRequired = rawJob.education_required || {};
  const minDegree = eduRequired.minimum_degree;
  const fieldsOfStudy = eduRequired.fields_of_study || [];
  const isDegreeRequired = eduRequired.is_degree_required;
  
  // Arrays
  const responsibilities = rawJob.responsibilities || job.responsibilities || [];
  const requirements = rawJob.requirements || job.requirements || [];
  const benefits = rawJob.benefits || job.benefits || [];
  const skillsRequired = rawJob.skills_required || job.skills_required || [];
  const skillsPreferred = rawJob.skills_preferred || job.skills_preferred || [];
  const tags = rawJob.tags || job.tags || [];
  const screeningQuestions = rawJob.screening_questions || job.screeningQuestions || [];
  const languageRequirements = rawJob.language_requirements || [];
  
  // Dates
  const publishedAt = rawJob.published_at || job.publishedAt;
  const expiresAt = rawJob.expires_at || job.expiresAt;
  const createdAt = rawJob.created_at || job.createdAt;
  const updatedAt = rawJob.updated_at || job.updatedAt;
  
  // Counts
  const viewCount = rawJob.view_count || job.viewCount || 0;
  const applicationCount = rawJob.application_count || job.applications || 0;
  
  // Status
  const status = rawJob.status || job.status || 'active';
  const daysRemaining = job.daysRemaining || getDaysRemainingProp(expiresAt);
  const isExpired = daysRemaining === 'Expired' || (expiresAt ? new Date(expiresAt) < new Date() : false);
  
  // Matched/Missing skills - DECLARE BEFORE USING
  const skillsBD = job.skillsBreakdown;
  const expBD = job.experienceBreakdown;
  const qualsBD = job.qualificationsBreakdown;
  const prefsBD = job.preferencesBreakdown;
  
  const matchedSkills = job.matchedSkills || skillsBD?.matched_skills || [];
  const missingSkills = job.missingSkills || skillsBD?.missing_skills || [];

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden border border-gray-100">
      {isAiMatch && <div className={`h-1.5 ${getScoreColor(matchScore)}`} />}

      <div className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">

          {/* ── Left: ALL JOB CONTENT ─────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Header row */}
            <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-gray-900 truncate">{rawJob.title || job.title}</h3>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5 flex-wrap">
                  {companyLogo
                    ? <img src={companyLogo} alt={companyName} className="w-4 h-4 rounded" />
                    : <Building2 size={14} />}
                  <span>{companyName}</span>
                  {companyVerified && <Shield size={12} className="text-green-600" />}
                  {companyIndustry && <span className="text-xs text-gray-400">• {companyIndustry}</span>}
                  {companySize && <span className="text-xs text-gray-400">• {companySize} employees</span>}
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

            {/* Meta row - ALL job metadata */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1"><MapPin size={12} />{locationDisplay}</span>
              <span className="flex items-center gap-1"><DollarSign size={12} />{salaryDisplay || 'Salary not specified'}</span>
              <span className="flex items-center gap-1"><Briefcase size={12} />{jobType}{workArrangement && ` · ${workArrangement}`}</span>
              {expLevel && <span className="flex items-center gap-1"><TrendingUp size={12} />{expLevel}</span>}
              {expMin && expMax && <span className="flex items-center gap-1"><Clock size={12} />{expMin}-{expMax} years</span>}
              {expMin && !expMax && <span className="flex items-center gap-1"><Clock size={12} />{expMin}+ years</span>}
              {publishedAt && <span className="flex items-center gap-1"><Calendar size={12} />Posted: {formatFullDate(publishedAt)}</span>}
              {applicationCount > 0 && <span className="flex items-center gap-1"><Users size={12} />{applicationCount} applicants</span>}
              {viewCount > 0 && <span className="flex items-center gap-1"><Eye size={12} />{viewCount} views</span>}
            </div>

            {/* Expiry banner */}
            {expiresAt && (
              <div className={`mb-3 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 ${isExpired ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                <Timer size={13} />
                {isExpired
                  ? `Closed on ${formatFullDate(expiresAt)}`
                  : `Closing ${daysRemaining} · ${formatFullDate(expiresAt)}`}
              </div>
            )}

            {/* Description */}
            <p className="text-sm text-gray-600 line-clamp-2 mb-3">{rawJob.description || job.description}</p>

            {/* ── Company Description (if available) ── */}
            {companyDescription && (
              <div className="mb-3 p-2 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 flex items-center gap-1"><Building2 size={12} /> About {companyName}:</p>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{companyDescription}</p>
              </div>
            )}

            {/* ── 4-Factor ML breakdown ── */}
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

                    <div className="pt-2 mt-2 border-t border-blue-200">
                      <div className="flex justify-between text-xs font-bold text-blue-900 mb-1">
                        <span>Total Match Score</span>
                        <span>{matchScore.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div className={`h-2 rounded-full ${getScoreColor(matchScore)}`} style={{ width: `${matchScore}%` }} />
                      </div>
                    </div>

                    {job.matchRecommendation && (
                      <p className="text-[11px] text-center text-blue-700 font-medium pt-1">{job.matchRecommendation}</p>
                    )}

                    {/* Skills detail */}
                    {(matchedSkills.length > 0 || missingSkills.length > 0) && (
                      <div className="pt-2 mt-2 border-t border-blue-200 space-y-1.5">
                        {skillsBD && (
                          <p className="text-[11px] text-gray-500">
                            Skills: {skillsBD.total_matched}/{skillsBD.total_required} required matched
                          </p>
                        )}
                        {matchedSkills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {matchedSkills.slice(0, 8).map((s: string) => (
                              <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-800 text-[10px] font-medium rounded-full">
                                <CheckCircle size={9} />{s}
                              </span>
                            ))}
                            {matchedSkills.length > 8 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                                +{matchedSkills.length - 8}
                              </span>
                            )}
                          </div>
                        )}
                        {missingSkills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {missingSkills.slice(0, 5).map((s: string) => (
                              <span key={s} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-medium rounded-full border border-red-100">
                                <X size={9} />{s}
                              </span>
                            ))}
                            {missingSkills.length > 5 && (
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                                +{missingSkills.length - 5} more gaps
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Experience breakdown */}
                    {expBD && (
                      <div className="pt-2 mt-1.5 border-t border-blue-200 text-[11px] text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Total experience: <strong>{Number(expBD.total_years ?? 0).toFixed(1)} yrs</strong></span>
                          {expBD.relevant_years != null && (
                            <span>Relevant: <strong className="text-purple-700">{Number(expBD.relevant_years).toFixed(1)} yrs</strong></span>
                          )}
                        </div>
                        {(expBD.required_years || expBD.job_min_years) > 0 && (
                          <div className="flex justify-between">
                            <span>Required: <strong>{expBD.required_years || expBD.job_min_years || 0}+ yrs</strong></span>
                          </div>
                        )}
                        {expBD.gap_years > 0 && (
                          <span className="text-orange-600 font-semibold block">⚠️ Experience gap: {expBD.gap_years.toFixed(1)} years</span>
                        )}
                        {expBD.specific_matches?.length > 0 && (
                          <div className="mt-1">
                            <p className="font-semibold text-gray-700">Matched requirements:</p>
                            {expBD.specific_matches.slice(0, 2).map((m: any, i: number) => (
                              <div key={i} className="text-[10px] text-gray-500">• {m.requirement_title} ({m.candidate_years} yrs)</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Qualifications breakdown */}
                    {qualsBD && (qualsBD.candidate_degrees?.length > 0 || qualsBD.job_degree_required) && (
                      <div className="pt-1.5 text-[11px] text-gray-600 space-y-1">
                        <span className="flex items-center gap-1"><GraduationCap size={11} />
                          Your degrees: {qualsBD.candidate_degrees?.join(', ') || 'None'}
                        </span>
                        {qualsBD.job_degree_required && (
                          <span className="flex items-center gap-1 text-amber-700">
                            <AlertCircle size={11} /> Required: {qualsBD.job_degree_required}
                          </span>
                        )}
                        {qualsBD.best_matched_field && (
                          <span className="text-green-700 text-[10px]">✓ Best match: {qualsBD.best_matched_field}</span>
                        )}
                      </div>
                    )}

                    {/* Preferences breakdown */}
                    {prefsBD && prefsBD.missing_job_data?.length > 0 && (
                      <div className="pt-1.5 text-[10px] text-gray-400">
                        ℹ️ Missing job data: {prefsBD.missing_job_data.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── ALL JOB DETAILS SECTION (Expandable) ── */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setShowAllSkills(!showAllSkills)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                {showAllSkills ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showAllSkills ? 'Hide' : 'Show'} All Job Details
              </button>

              {showAllSkills && (
                <div className="mt-3 space-y-3 text-xs">
                  {/* Responsibilities */}
                  {responsibilities.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><List size={12} /> Responsibilities</h4>
                      <ul className="list-disc list-inside text-gray-600 space-y-0.5 ml-2">
                        {responsibilities.slice(0, 5).map((r: string, i: number) => (
                          <li key={i} className="text-[11px]">{r}</li>
                        ))}
                        {responsibilities.length > 5 && (
                          <li className="text-[11px] text-gray-400">+{responsibilities.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Requirements */}
                  {requirements.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><FileText size={12} /> Requirements</h4>
                      <ul className="list-disc list-inside text-gray-600 space-y-0.5 ml-2">
                        {requirements.slice(0, 5).map((r: string, i: number) => (
                          <li key={i} className="text-[11px]">{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Required Skills */}
                  {skillsRequired.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><Code size={12} /> Required Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {skillsRequired.slice(0, 10).map((s: any, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px]">
                            {typeof s === 'string' ? s : s.name}
                          </span>
                        ))}
                        {skillsRequired.length > 10 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                            +{skillsRequired.length - 10}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preferred Skills */}
                  {skillsPreferred.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><Star size={12} /> Preferred Skills</h4>
                      <div className="flex flex-wrap gap-1">
                        {skillsPreferred.slice(0, 8).map((s: any, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded-full text-[10px]">
                            {typeof s === 'string' ? s : s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Benefits */}
                  {benefits.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><Heart size={12} /> Benefits</h4>
                      <div className="flex flex-wrap gap-1">
                        {benefits.slice(0, 8).map((b: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full text-[10px]">{b}</span>
                        ))}
                        {benefits.length > 8 && <span className="text-gray-400 text-[10px]">+{benefits.length - 8} more</span>}
                      </div>
                    </div>
                  )}

                  {/* Education Requirements */}
                  {(minDegree || fieldsOfStudy.length > 0) && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><GraduationCap size={12} /> Education</h4>
                      {minDegree && <p className="text-gray-600 text-[11px]">• {minDegree}</p>}
                      {fieldsOfStudy.length > 0 && (
                        <p className="text-gray-600 text-[11px]">• Fields: {fieldsOfStudy.join(', ')}</p>
                      )}
                      {isDegreeRequired === false && <p className="text-gray-500 text-[10px]">• Degree not strictly required</p>}
                    </div>
                  )}

                  {/* Language Requirements */}
                  {languageRequirements.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><Globe size={12} /> Languages</h4>
                      <div className="flex flex-wrap gap-1">
                        {languageRequirements.map((l: any, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[10px]">
                            {typeof l === 'string' ? l : l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  {tags.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-700 flex items-center gap-1 mb-1"><Tag size={12} /> Tags</h4>
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 10).map((t: string, i: number) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[10px]">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Screening Questions Count */}
                  {screeningQuestions.length > 0 && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <MessageSquare size={11} />
                      <span className="text-[11px]">{screeningQuestions.length} screening question(s)</span>
                    </div>
                  )}

                  {/* Department & Team */}
                  {(rawJob.department || rawJob.team) && (
                    <div className="flex items-center gap-3 text-gray-500">
                      {rawJob.department && <span className="flex items-center gap-1 text-[11px]"><Layers size={11} />{rawJob.department}</span>}
                      {rawJob.team && <span className="flex items-center gap-1 text-[11px]"><Users size={11} />{rawJob.team}</span>}
                    </div>
                  )}

                  {/* Company Website */}
                  {companyWebsite && (
                    <div className="flex items-center gap-1">
                      <LinkIcon size={11} className="text-gray-400" />
                      <a href={companyWebsite} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-[11px] hover:underline">
                        {companyWebsite}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer meta */}
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mt-3 pt-2 border-t border-gray-50">
              {rawJob.department && <span className="flex items-center gap-1"><Layers size={11} />{rawJob.department}</span>}
              {rawJob.team && <span className="flex items-center gap-1"><Users size={11} />{rawJob.team}</span>}
              {rawJob.visibility && <span className="flex items-center gap-1"><Eye size={11} />{rawJob.visibility}</span>}
              {status && <span className="flex items-center gap-1"><CheckCircle size={11} />{status}</span>}
              {createdAt && <span className="flex items-center gap-1"><Calendar size={11} />Created: {formatFullDate(createdAt)}</span>}
              {updatedAt && updatedAt !== createdAt && <span className="flex items-center gap-1"><Clock size={11} />Updated: {formatFullDate(updatedAt)}</span>}
            </div>
          </div>

          {/* ── Right: action buttons ── */}
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
                {!isExpired && (
                  <button type="button" onClick={() => onWithdrawApplication(job)}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold transition-colors">
                    Withdraw
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => onApplyNow(job)} disabled={isExpired}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isExpired ? 'Expired' : <><CheckCircle size={15} /> Apply Now</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobCard;