import React, { useState } from 'react';
import {
  X, MapPin, Clock, Users, Briefcase, Building2, Target,
  CheckCircle, DollarSign, Star, Globe, FileText, Languages,
  GraduationCap, Layers, Eye, Calendar, AlertCircle, Info,
  ThumbsUp, User, ChevronRight, Heart, Tag, Link as LinkIcon,
  Code, Award, MessageSquare, List, Shield, TrendingUp, Zap,
  BookOpen, Briefcase as WorkIcon, Home, Sparkles
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
  matchData?: any;
  candidateInfo?: any;
}

const safe = (v: any, fallback: number = 0): number => { 
  const n = Number(v); 
  return isNaN(n) ? fallback : n; 
};

const toArr = (v: any): any[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string') {
    try { 
      const p = JSON.parse(v); 
      return Array.isArray(p) ? p.filter(Boolean) : []; 
    } catch { 
      return v.trim() ? [v] : []; 
    }
  }
  return [];
};

const toStrArr = (v: any): string[] => {
  const arr = toArr(v);
  return arr.filter((item): item is string => typeof item === 'string');
};

const fmtDate = (d: any): string | null => {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt.toLocaleDateString('en-GB', { 
    day: 'numeric', month: 'short', year: 'numeric' 
  });
};

const skillLabel = (s: any): string => {
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') {
    return s?.name || s?.skill_name || s?.title || '';
  }
  return '';
};

const fmtNum = (n: number): string => n.toLocaleString();

const Pill = ({ text, color = 'gray' }: { text: string; color?: string }) => {
  const c: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-800', 
    green: 'bg-green-100 text-green-800',
    purple: 'bg-purple-100 text-purple-800', 
    orange: 'bg-orange-100 text-orange-800',
    gray: 'bg-gray-100 text-gray-700', 
    active: 'bg-green-100 text-green-800', 
    draft: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800'
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

const ComparisonCard = ({ 
  title, 
  icon: Icon, 
  candidateData, 
  jobData, 
  matchPercentage,
  bgColor = 'bg-gray-50'
}: { 
  title: string; 
  icon?: any; 
  candidateData: React.ReactNode; 
  jobData: React.ReactNode; 
  matchPercentage?: number;
  bgColor?: string;
}) => (
  <div className={`${bgColor} rounded-xl p-3 mb-3`}>
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
        {Icon && <Icon size={14} />} {title}
      </h4>
      {matchPercentage !== undefined && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          matchPercentage >= 80 ? 'bg-green-100 text-green-700' :
          matchPercentage >= 60 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {matchPercentage.toFixed(0)}% Match
        </span>
      )}
    </div>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="space-y-1">
        <p className="font-medium text-blue-600 flex items-center gap-1">
          <User size={12} /> You Have
        </p>
        {candidateData}
      </div>
      <div className="space-y-1">
        <p className="font-medium text-orange-600 flex items-center gap-1">
          <Briefcase size={12} /> Job Requires
        </p>
        {jobData}
      </div>
    </div>
  </div>
);

const FactorRow = ({ 
  label, score, weight, pts, colour, children 
}: { 
  label: string; score: number; weight: string; pts: number; colour: string; children?: React.ReactNode 
}) => (
  <div className="mb-4 border-b border-gray-100 pb-3 last:border-0">
    <div className="flex items-center justify-between text-sm mb-1">
      <span className="font-semibold text-gray-700">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        <span className={`font-bold px-2 py-0.5 rounded-full ${
          score >= 80 ? 'bg-green-100 text-green-800' : 
          score >= 60 ? 'bg-yellow-100 text-yellow-800' : 
          'bg-red-100 text-red-800'
        }`}>{score.toFixed(0)}%</span>
        <span className="text-gray-400">× {weight} = <strong className="text-gray-700">{pts.toFixed(1)} pts</strong></span>
      </div>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
      <div className={`${colour} h-2 rounded-full transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
    </div>
    {children}
  </div>
);

const matchLevelBg = (level: string): string => {
  if (level?.includes('Excellent')) return 'bg-green-50 border-green-200 text-green-900';
  if (level?.includes('Strong'))    return 'bg-blue-50 border-blue-200 text-blue-900';
  if (level?.includes('Good'))      return 'bg-yellow-50 border-yellow-200 text-yellow-900';
  if (level?.includes('Partial'))   return 'bg-orange-50 border-orange-200 text-orange-900';
  return 'bg-gray-50 border-gray-200 text-gray-900';
};

const TabBtn = ({ id, label, currentTab, setTab }: { 
  id: 'match' | 'job'; 
  label: string; 
  currentTab: string; 
  setTab: (id: 'match' | 'job') => void 
}) => (
  <button
    type="button"
    onClick={() => setTab(id)}
    className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
      currentTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`}
  >
    {label}
  </button>
);

const JobViewModal: React.FC<JobViewModalProps> = ({
  isOpen, onClose, job, matchScore: userMatchScore, criteria_scores,
  matchData, candidateInfo,
}) => {
  const [currentTab, setCurrentTab] = useState<'match' | 'job'>('match');
  if (!isOpen || !job) return null;

  const rawJob = job.rawJob || job;
  const company = rawJob.company || {};
  
  // Company details
  const companyName: string = rawJob.company_name || company.name || job.company_name || '';
  const companyLogo: string = rawJob.company_logo_url || company.logo_url || '';
  const companyVerified: boolean = rawJob.company_verified || company.verified || false;
  const companyIndustry: string = rawJob.company_industry || company.industry || '';
  const companySize: string = rawJob.company_size || company.size || '';
  const companyWebsite: string = rawJob.company_website || company.website || '';
  const companyDescription: string = rawJob.company_description || company.description || '';
  const companyBanner: string = rawJob.company_banner_url || company.banner_url || '';
  
  // Job basic info
  const jobTitle: string = rawJob.title || job.title || '';
  const department: string = rawJob.department || job.department || '';
  const jobType: string = rawJob.job_type || job.job_type || job.type || '';
  const workArrangement: string = rawJob.work_arrangement || job.work_arrangement || job.workArrangement || '';
  
  // Location
  const locations: any[] = toArr(rawJob.locations || job.locations);
  const locationDisplay: string = (() => {
    if (job.location) return job.location;
    if (!locations.length) return '';
    return locations.map((l: any) => {
      if (typeof l === 'string') return l;
      if (l?.is_remote) return 'Remote';
      return [l?.city, l?.country].filter(Boolean).join(', ') || null;
    }).filter(Boolean).join(' · ') || '';
  })();
  
  // Salary
  const salaryMin: number = rawJob.salary_min ?? job.salary_min ?? 0;
  const salaryMax: number = rawJob.salary_max ?? job.salary_max ?? 0;
  const salaryCurrency: string = rawJob.salary_currency || job.salary_currency || 'Rwf';
  const salaryPeriod: string = rawJob.salary_period || job.salary_period || 'month';
  
  const salaryDisplay: string | null = (() => {
    if (salaryMin && salaryMax) {
      return `${salaryCurrency} ${fmtNum(salaryMin)} – ${fmtNum(salaryMax)} ${salaryPeriod === 'year' ? '/year' : '/month'}`;
    }
    if (salaryMin) return `${salaryCurrency} ${fmtNum(salaryMin)}+ ${salaryPeriod === 'year' ? '/year' : '/month'}`;
    if (salaryMax) return `Up to ${salaryCurrency} ${fmtNum(salaryMax)} ${salaryPeriod === 'year' ? '/year' : '/month'}`;
    return null;
  })();
  
  // Dates
  const publishedAt: string = rawJob.published_at || job.published_at;
  const expiresAt: string = rawJob.expires_at || job.expires_at;
  const postedDate: string | null = fmtDate(publishedAt);
  const expiryDate: string | null = fmtDate(expiresAt);
  
  // Counts
  const applicationCount: number = safe(rawJob.application_count ?? job.application_count);
  const viewCount: number = safe(rawJob.view_count ?? job.view_count);
  
  // Status
  const status: string = rawJob.status || job.status || 'active';
  const expLevel: string = rawJob.experience_level || job.experience_level || '';
  
  // Education
  const educationRequired: any = (() => {
    let edu = rawJob.education_required || job.education_required || {};
    if (typeof edu === 'string') {
      try { edu = JSON.parse(edu); } catch { edu = {}; }
    }
    return edu;
  })();
  const minDegree: string = educationRequired.minimum_degree || '';
  const fieldsOfStudy: string[] = toStrArr(educationRequired.fields_of_study);
  
  // Skills
  const requiredSkills: any[] = toArr(rawJob.skills_required || job.skills_required);
  
  // Content arrays
  const responsibilities: string[] = toStrArr(rawJob.responsibilities || job.responsibilities);
  const requirementsList: string[] = toStrArr(rawJob.requirements || job.requirements);
  const benefits: string[] = toStrArr(rawJob.benefits || job.benefits);
  const tags: string[] = toStrArr(rawJob.tags || job.tags);
  
  // ── Match data ──
  const hasMatch = matchData || userMatchScore !== undefined;
  const matchScore = matchData?.matchScore ?? safe(userMatchScore, -1);
  const matchLevel = matchData?.matchLevel || '';
  const matchStars = matchData?.matchStars || '';
  const matchRec = matchData?.matchRecommendation || matchData?.recommendation || '';
  const criteria = matchData?.criteriaScores || {};
  const skillsScore = criteria.skills_match ?? safe(criteria_scores?.skillsScore, 0);
  const qualsScore = criteria.qualifications_match ?? safe(criteria_scores?.qualificationsScore, 0);
  const expScore = criteria.experience_match ?? safe(criteria_scores?.experienceScore, 0);
  const prefsScore = criteria.preferences_match ?? safe(criteria_scores?.preferencesScore, 0);
  
  // Detailed breakdowns
  const matchedSkills: string[] = toStrArr(matchData?.matchedSkills);
  const missingSkills: string[] = toStrArr(matchData?.missingSkills);
  const skillsBD = matchData?.skillsBreakdown || null;
  const expBD = matchData?.experienceBreakdown || null;
  const qualsBD = matchData?.qualificationsBreakdown || null;
  const prefsBD = matchData?.preferencesBreakdown || null;
  const reasons = matchData?.matchReasons || [];
  
  // Candidate info - FULL DETAILS
  const candName = candidateInfo?.name || '';
  const candEmail = candidateInfo?.email || '';
  const candYears = candidateInfo?.total_experience_years ?? expBD?.candidate_years;
  const candSkills: string[] = toStrArr(candidateInfo?.skills);
  const candDegrees: string[] = (qualsBD?.candidate_degrees || []).filter((item: unknown): item is string => typeof item === 'string');
  const candFields: string[] = (qualsBD?.candidate_fields || []).filter((item: unknown): item is string => typeof item === 'string');
  const candCombined: string[] = (qualsBD?.candidate_combined || []).filter((item: unknown): item is string => typeof item === 'string');
  
  // Candidate preferences from AI
  const candJobTypes: string[] = prefsBD?.candidate_job_types || [];
  const candLocations: string[] = prefsBD?.candidate_locations || [];
  const candIndustries: string[] = prefsBD?.candidate_industries || [];
  const candLanguages: string[] = prefsBD?.candidate_languages || [];
  const candSalaryMin = prefsBD?.candidate_salary_min || 0;
  const candSalaryMax = prefsBD?.candidate_salary_max || 0;
  
  const ringColor = matchScore >= 80 ? '#22c55e' : matchScore >= 60 ? '#3b82f6' : matchScore >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-4 pb-0 rounded-t-2xl flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{jobTitle || '—'}</h2>
                {companyVerified && <Shield size={16} className="text-green-600" />}
              </div>
              {companyName && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Building2 size={13} />{companyName}
                  {companyIndustry && <span className="text-xs text-gray-400">• {companyIndustry}</span>}
                  {companySize && <span className="text-xs text-gray-400">• {companySize}</span>}
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Candidate Summary Banner */}
          {candName && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{candName}</p>
                  <p className="text-xs text-gray-500">{candEmail || 'Candidate'}</p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1 text-gray-600">
                  <WorkIcon size={12} /> {candYears?.toFixed(1) || 0} years exp
                </span>
                <span className="flex items-center gap-1 text-gray-600">
                  <BookOpen size={12} /> {candDegrees.length} degrees
                </span>
                <span className="flex items-center gap-1 text-gray-600">
                  <Code size={12} /> {candSkills.length} skills
                </span>
              </div>
            </div>
          )}

          <div className="flex">
            {hasMatch && <TabBtn id="match" label="Match Analysis" currentTab={currentTab} setTab={setCurrentTab} />}
            <TabBtn id="job" label="Job Details" currentTab={currentTab} setTab={setCurrentTab} />
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* TAB: MATCH ANALYSIS */}
          {currentTab === 'match' && hasMatch && (
            <div className="space-y-5">
              {/* Overall score card */}
              <div className={`rounded-2xl border p-5 ${matchLevelBg(matchLevel)}`}>
                <div className="flex items-center gap-5">
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
                    {matchRec && <p className="text-sm font-medium mt-1">{matchRec}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Sparkles size={10} /> Skills: {skillsScore.toFixed(0)}%</span>
                      <span className="flex items-center gap-1"><GraduationCap size={10} /> Education: {qualsScore.toFixed(0)}%</span>
                      <span className="flex items-center gap-1"><WorkIcon size={10} /> Experience: {expScore.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Factor breakdown with FULL candidate vs job comparison */}
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Target size={15} className="text-blue-600" /> 4-Factor ML Score Breakdown
                </h3>

                {/* FACTOR 1: SKILLS - FULL COMPARISON */}
                <FactorRow label="🔧 Skills" score={skillsScore} weight="40%" pts={skillsScore * 0.40} colour="bg-green-500">
                  <ComparisonCard
                    title="Skills Match"
                    icon={Code}
                    matchPercentage={skillsScore}
                    candidateData={
                      <div>
                        {candSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {candSkills.map((s: string, idx: number) => (
                              <span key={idx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px]">
                                <CheckCircle size={8} />{s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-400 italic">No skills added</p>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">Total: {candSkills.length} skills</p>
                      </div>
                    }
                    jobData={
                      <div>
                        {skillsBD?.total_required > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {[...(skillsBD.matched_skills || []), ...(skillsBD.missing_skills || [])].map((s: string, idx: number) => {
                              const isMatched = matchedSkills.includes(s);
                              return (
                                <span key={idx} className={`px-1.5 py-0.5 rounded-full text-[10px] ${isMatched ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                                  {isMatched ? '✓' : '•'} {s}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          requiredSkills.map((s: any, idx: number) => (
                            <span key={idx} className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full text-[10px]">
                              • {skillLabel(s)}
                            </span>
                          ))
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">
                          Matched: {matchedSkills.length}/{skillsBD?.total_required || requiredSkills.length}
                        </p>
                      </div>
                    }
                  />
                  {missingSkills.length > 0 && (
                    <div className="mt-2 bg-orange-50 rounded-lg p-2">
                      <p className="text-[10px] font-semibold text-orange-700">Missing skills to acquire:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {missingSkills.map((s: string, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px]">
                            ✗ {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </FactorRow>

                {/* FACTOR 2: QUALIFICATIONS - FULL COMPARISON */}
                <FactorRow label="🎓 Qualifications" score={qualsScore} weight="25%" pts={qualsScore * 0.25} colour="bg-blue-500">
                  <ComparisonCard
                    title="Education & Qualifications"
                    icon={GraduationCap}
                    matchPercentage={qualsScore}
                    candidateData={
                      <div>
                        {candDegrees.length > 0 ? (
                          candDegrees.map((l: string, idx: number) => (
                            <p key={idx} className="text-green-700 text-xs font-medium">✓ {l}</p>
                          ))
                        ) : (
                          <p className="text-gray-400 italic">No degrees recorded</p>
                        )}
                        {candFields.length > 0 && (
                          <div className="mt-1">
                            <p className="text-[10px] text-gray-500">Fields:</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {candFields.map((f: string, idx: number) => (
                                <span key={idx} className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px]">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {candCombined.length > 0 && (
                          <p className="text-[10px] text-green-600 mt-1">Combined: {candCombined[0]}</p>
                        )}
                      </div>
                    }
                    jobData={
                      <div>
                        {minDegree && <p className="text-orange-700 text-xs font-medium">✓ {minDegree}</p>}
                        {fieldsOfStudy.length > 0 && (
                          <div className="mt-1">
                            <p className="text-[10px] text-gray-500">Preferred fields:</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {fieldsOfStudy.map((f: string, idx: number) => (
                                <span key={idx} className="px-1 py-0.5 bg-gray-200 text-gray-600 rounded-full text-[9px]">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {qualsBD?.best_matched_field && (
                          <p className="text-[10px] text-green-600 mt-1">Best match: {qualsBD.best_matched_field}</p>
                        )}
                      </div>
                    }
                  />
                </FactorRow>

                {/* FACTOR 3: EXPERIENCE - FULL COMPARISON */}
                <FactorRow label="📅 Experience" score={expScore} weight="20%" pts={expScore * 0.20} colour="bg-purple-500">
                  <ComparisonCard
                    title="Work Experience"
                    icon={WorkIcon}
                    matchPercentage={expScore}
                    candidateData={
                      <div>
                        <p className="text-lg font-bold text-gray-800">{candYears?.toFixed(1) || 0} <span className="text-xs font-normal">years</span></p>
                        {expBD?.specific_matches && expBD.specific_matches.filter((m: any) => m.candidate_years).length > 0 && (
                          <div className="mt-1">
                            <p className="text-[10px] text-green-600">Matched roles:</p>
                            {expBD.specific_matches.filter((m: any) => m.candidate_years).map((m: any, idx: number) => (
                              <p key={idx} className="text-[10px] text-green-600">• {m.matched_title} ({m.candidate_years} yrs)</p>
                            ))}
                          </div>
                        )}
                      </div>
                    }
                    jobData={
                      <div>
                        <p className="text-lg font-bold text-gray-800">
                          {expBD?.required_min_years || expBD?.required_years || 0}+ <span className="text-xs font-normal">years minimum</span>
                        </p>
                        {expBD?.specific_matches && expBD.specific_matches.length > 0 && (
                          <div className="mt-1">
                            <p className="text-[10px] text-gray-500">Required roles:</p>
                            {expBD.specific_matches.map((m: any, idx: number) => (
                              <p key={idx} className={`text-[10px] ${m.candidate_years ? 'text-green-600' : 'text-gray-500'}`}>
                                {m.candidate_years ? '✓' : '•'} {m.requirement_title} ({m.requirement_years} yrs)
                              </p>
                            ))}
                          </div>
                        )}
                        {expBD?.gap_years > 0 && (
                          <p className="text-[10px] text-orange-600 mt-1">Gap: {expBD.gap_years.toFixed(1)} years</p>
                        )}
                      </div>
                    }
                  />
                </FactorRow>

                {/* FACTOR 4: PREFERENCES - FULL COMPARISON */}
                <FactorRow label="⚙️ Preferences" score={prefsScore} weight="15%" pts={prefsScore * 0.15} colour="bg-yellow-500">
                  <ComparisonCard
                    title="Job Preferences"
                    icon={Home}
                    matchPercentage={prefsScore}
                    candidateData={
                      <div className="space-y-1">
                        <p><span className="text-gray-500">Job types:</span> {candJobTypes.length > 0 ? candJobTypes.join(', ') : 'Not specified'}</p>
                        <p><span className="text-gray-500">Locations:</span> {candLocations.length > 0 ? candLocations.join(', ') : 'Not specified'}</p>
                        <p><span className="text-gray-500">Industries:</span> {candIndustries.length > 0 ? candIndustries.join(', ') : 'Not specified'}</p>
                        <p><span className="text-gray-500">Languages:</span> {candLanguages.length > 0 ? candLanguages.join(', ') : 'Not specified'}</p>
                        {(candSalaryMin > 0 || candSalaryMax > 0) && (
                          <p><span className="text-gray-500">Salary:</span> {candSalaryMin.toLocaleString()} - {candSalaryMax.toLocaleString()}</p>
                        )}
                      </div>
                    }
                    jobData={
                      <div className="space-y-1">
                        <p><span className="text-gray-500">Job type:</span> {jobType || 'Not specified'}</p>
                        <p><span className="text-gray-500">Remote:</span> {workArrangement || 'Not specified'}</p>
                        <p><span className="text-gray-500">Location:</span> {locationDisplay || 'Not specified'}</p>
                        <p><span className="text-gray-500">Industry:</span> {companyIndustry || 'Not specified'}</p>
                        {salaryDisplay && <p><span className="text-gray-500">Salary:</span> {salaryDisplay}</p>}
                      </div>
                    }
                  />
                  {prefsBD?.type_match !== undefined && (
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-center mt-2">
                      <div className="bg-white rounded p-1">
                        <p className="text-gray-500">Type</p>
                        <p className="font-bold">{(prefsBD.type_match * 100).toFixed(0)}%</p>
                      </div>
                      <div className="bg-white rounded p-1">
                        <p className="text-gray-500">Remote</p>
                        <p className="font-bold">{(prefsBD.remote_match * 100).toFixed(0)}%</p>
                      </div>
                      <div className="bg-white rounded p-1">
                        <p className="text-gray-500">Location</p>
                        <p className="font-bold">{(prefsBD.location_match * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  )}
                </FactorRow>

                {/* Total Score with detailed breakdown */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm font-bold text-gray-900 mb-1">
                    <span>Total Score</span>
                    <span style={{ color: ringColor }}>{matchScore.toFixed(1)} / 100 pts</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${matchScore}%`, background: ringColor }} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-[10px] mt-3">
                    <div>
                      <p className="text-gray-500">Skills</p>
                      <p className="font-bold">{(skillsScore * 0.4).toFixed(1)} pts</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Qualif.</p>
                      <p className="font-bold">{(qualsScore * 0.25).toFixed(1)} pts</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Experience</p>
                      <p className="font-bold">{(expScore * 0.20).toFixed(1)} pts</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Pref.</p>
                      <p className="font-bold">{(prefsScore * 0.15).toFixed(1)} pts</p>
                    </div>
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-2">
                    {matchScore >= 80 ? '🎉 Excellent match! Strongly recommend applying.' :
                     matchScore >= 65 ? '👍 Good match! Consider applying.' :
                     matchScore >= 50 ? '⚠️ Partial match. Update your profile to improve.' :
                     '📝 Low match. Focus on skill development.'}
                  </p>
                </div>
              </div>

              {/* Skills gap section */}
              {missingSkills.length > 0 && (
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <h4 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
                    <Zap size={14} /> Skills Gap Analysis
                  </h4>
                  <p className="text-xs text-orange-700 mb-2">
                    You're missing {missingSkills.length} skill{missingSkills.length !== 1 ? 's' : ''} that the job requires:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSkills.map((s: string, idx: number) => (
                      <span key={idx} className="px-2.5 py-1 bg-white border border-orange-200 text-orange-800 text-xs font-medium rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-orange-600 mt-2">
                    💡 Consider learning these skills to increase your match score.
                  </p>
                </div>
              )}

              {/* Match reasons */}
              {reasons.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Match Insights</h4>
                  {reasons.map((r: any, idx: number) => (
                    <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm ${
                      r.type === 'positive' ? 'bg-green-50 text-green-800' :
                      r.type === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                    }`}>
                      {r.type === 'positive' ? <ThumbsUp size={13} className="mt-0.5 shrink-0" /> :
                       r.type === 'warning' ? <AlertCircle size={13} className="mt-0.5 shrink-0" /> : 
                       <Info size={13} className="mt-0.5 shrink-0" />}
                      {r.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: JOB DETAILS */}
          {currentTab === 'job' && (
            <div>
              {/* Status pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Pill text={status.charAt(0).toUpperCase() + status.slice(1)} color={status === 'active' ? 'active' : 'draft'} />
                {jobType && <Pill text={jobType.replace('-', ' ')} color="blue" />}
                {workArrangement && <Pill text={workArrangement} color="purple" />}
                {expLevel && <Pill text={expLevel + ' level'} color="orange" />}
                {department && <Pill text={department} color="gray" />}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
                {locationDisplay && <span className="flex items-center gap-1.5"><MapPin size={14} />{locationDisplay}</span>}
                {postedDate && <span className="flex items-center gap-1.5"><Clock size={14} />Posted {postedDate}</span>}
                {expiryDate && <span className="flex items-center gap-1.5"><Calendar size={14} />Closes {expiryDate}</span>}
                <span className="flex items-center gap-1.5"><Users size={14} />{applicationCount} applicants</span>
                {viewCount > 0 && <span className="flex items-center gap-1.5"><Eye size={14} />{viewCount} views</span>}
              </div>

              {/* Salary */}
              {salaryDisplay && (
                <div className="mb-5 flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                  <DollarSign size={20} className="text-green-600 shrink-0" />
                  <p className="text-lg font-bold text-green-700">{salaryDisplay}</p>
                </div>
              )}

              {/* Company Banner */}
              {companyBanner && (
                <div className="mb-5 rounded-xl overflow-hidden">
                  <img src={companyBanner} alt={companyName || 'Company banner'} className="w-full h-32 object-cover" />
                </div>
              )}

              {/* Company Description */}
              {companyDescription && (
                <Section title={`About ${companyName || 'the Company'}`} icon={Building2}>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{companyDescription}</p>
                  {companyWebsite && (
                    <a href={companyWebsite} target="_blank" rel="noopener noreferrer" 
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-3">
                      <LinkIcon size={14} /> {companyWebsite}
                    </a>
                  )}
                </Section>
              )}

              {/* Job Description */}
              {rawJob.description && (
                <Section title="Job Description" icon={FileText}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{rawJob.description}</p>
                </Section>
              )}

              {/* Responsibilities */}
              {responsibilities.length > 0 && (
                <Section title="Key Responsibilities" icon={List}>
                  <ul className="space-y-1.5">
                    {responsibilities.map((r: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle size={13} className="text-purple-400 shrink-0 mt-0.5" />{r}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Requirements */}
              {requirementsList.length > 0 && (
                <Section title="Requirements" icon={Briefcase}>
                  <ul className="space-y-1.5">
                    {requirementsList.map((r: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <ChevronRight size={13} className="text-blue-400 shrink-0 mt-0.5" />{r}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Required Skills */}
              {requiredSkills.length > 0 && (
                <Section title="Required Skills" icon={Code}>
                  <div className="flex flex-wrap gap-2">
                    {requiredSkills.map((s: any, idx: number) => {
                      const name = skillLabel(s);
                      const isMatched = matchedSkills.some(m => m.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(m.toLowerCase()));
                      return (
                        <span key={idx} className={`px-3 py-1 rounded-full text-xs font-medium ${isMatched ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {isMatched && '✓ '}{name}
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Benefits */}
              {benefits.length > 0 && (
                <Section title="Benefits" icon={Heart}>
                  <div className="flex flex-wrap gap-2">
                    {benefits.map((b: string, idx: number) => (
                      <span key={idx} className="px-3 py-1 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-full text-xs">{b}</span>
                    ))}
                  </div>
                </Section>
              )}

              {/* Education */}
              {(minDegree || fieldsOfStudy.length > 0) && (
                <Section title="Education" icon={GraduationCap}>
                  {minDegree && <p className="text-sm font-medium text-gray-800">{minDegree}</p>}
                  {fieldsOfStudy.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fieldsOfStudy.map((f: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">{f}</span>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t: string, idx: number) => (
                    <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">#{t}</span>
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