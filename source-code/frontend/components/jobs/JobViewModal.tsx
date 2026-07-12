import React, { useState, useEffect } from 'react';
import {
  X, MapPin, Clock, Users, Briefcase, Building2, Target,
  CheckCircle, DollarSign, Star, Globe, FileText, Languages,
  GraduationCap, Layers, Eye, Calendar, AlertCircle, Info,
  ThumbsUp, User, ChevronRight, Heart, Tag, Link as LinkIcon,
  Code, Award, MessageSquare, List, Shield, TrendingUp, Zap,
  BookOpen, Briefcase as WorkIcon, Home, Sparkles, AlertTriangle
} from 'lucide-react';
import { useFeedTracker } from '../../hooks/useFeedTracker';

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
  if (!s) return '';
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object') {
    return s?.name || s?.skill_name || s?.title || '';
  }
  return '';
};

const skillProficiency = (s: any): string | null => {
  if (s && typeof s === 'object') {
    if (s.proficiency) return s.proficiency;
    if (s.proficiency_level) {
      const levels: Record<number, string> = { 1: 'Beginner', 2: 'Basic', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert'};
      return levels[s.proficiency_level] || null;
    }
  }
  return null;
};

const requirementText = (req: any): string => {
  if (!req) return '';
  if (typeof req === 'string') return req;
  if (req && typeof req === 'object') {
    if (req.title) return `${req.title}${req.years ? ` (${req.years} years)` : ''}`;
    if (req.description) return req.description;
    return req.name || req.text || '';
  }
  return '';
};

const fmtNum = (n: number): string => n.toLocaleString();

const Pill = ({ text, color = 'gray'}: { text: string; color?: string }) => {
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

const FactorRow = ({
  label, score, weight, pts, colour, excluded, excludedNote, children
}: {
  label: string; score: number; weight: string; pts: number; colour: string;
  excluded?: boolean; excludedNote?: string; children?: React.ReactNode
}) => (
  <div className="mb-4 border-b border-gray-100 pb-3 last:border-0">
    <div className="flex items-center justify-between text-sm mb-1">
      <span className="font-semibold text-gray-700">{label}</span>
      <div className="flex items-center gap-3 text-xs">
        {excluded ? (
          <span className="font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Excluded</span>
        ) : (
          <span className={`font-bold px-2 py-0.5 rounded-full ${
            score >= 80 ? 'bg-green-100 text-green-800':
            score >= 60 ? 'bg-yellow-100 text-yellow-800':
            'bg-red-100 text-red-800'
          }`}>{score.toFixed(0)}%</span>
        )}
        <span className="text-gray-400">× {weight} = <strong className="text-gray-700">{pts.toFixed(1)} pts</strong></span>
      </div>
    </div>
    {excluded ? (
      <p className="text-[11px] text-gray-400 italic">
        {excludedNote || 'Not required by this job -- excluded from scoring, its weight redistributed to the other factors.'}
      </p>
    ) : (
      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div className={`${colour} h-2 rounded-full transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
    )}
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
  id: 'match'| 'job';
  label: string;
  currentTab: string;
  setTab: (id: 'match'| 'job') => void
}) => (
  <button
    type="button"
    onClick={() => setTab(id)}
    className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
      currentTab === id ? 'border-blue-600 text-blue-600': 'border-transparent text-gray-500 hover:text-gray-800'
    }`}
  >
    {label}
  </button>
);

const JobViewModal: React.FC<JobViewModalProps> = ({
  isOpen, onClose, job, matchScore: userMatchScore, criteria_scores,
  matchData, candidateInfo,
}) => {
  const [currentTab, setCurrentTab] = useState<'match'| 'job'>('job');
  const { trackView } = useFeedTracker();

  // Tracked here (not by each caller) so every place that opens this modal
  // records a view consistently. Keyed on the job id, not the isOpen
  // boolean or the job object reference, so closing and reopening for the
  // SAME job fires again (each open is a real, separately-weighted view  
  // the backend upserts job_views on (user_id, job_id), refreshing
  // viewed_at rather than stacking duplicate rows, so repeat views are
  // safe to keep sending).
  const viewedJobId: string | null = isOpen && job ? ((job.rawJob || job)?.id || null) : null;
  useEffect(() => {
    if (viewedJobId) trackView(viewedJobId, 0);
  }, [viewedJobId]);

  if (!isOpen || !job) return null;

  const rawJob = job.rawJob || job;

  // ========== JOB BASIC INFO ==========
  const jobId: string = rawJob.id || job.id || '';
  const jobTitle: string = rawJob.title || job.title || 'Untitled Position';
  const department: string = rawJob.department || job.department || '';
  const jobType: string = rawJob.job_type || job.job_type || job.type || '';
  const workArrangement: string = rawJob.work_arrangement || job.work_arrangement || job.workArrangement || '';
  const status: string = rawJob.status || job.status || 'active';
  const visibility: string = rawJob.visibility || job.visibility || 'public';

  // ========== COMPANY INFO ==========
  const companyName: string = rawJob.company_name || job.company_name || '';
  const companyLogo: string = rawJob.company_logo_url || job.company_logo_url || '';
  const companyVerified: boolean = rawJob.company_verified || job.company_verified || false;
  const companyIndustry: string = rawJob.company_industry || job.company_industry || '';
  const companySize: string = rawJob.company_size || job.company_size || '';
  const companyWebsite: string = rawJob.company_website || job.company_website || '';
  const companyDescription: string = rawJob.company_description || job.company_description || '';
  const companyBanner: string = rawJob.company_banner_url || job.company_banner_url || '';

  // ========== LOCATION ==========
  const locations: any[] = toArr(rawJob.locations || job.locations);
  const locationDisplay: string = (() => {
    if (job.location) return job.location;
    if (!locations.length) return 'Not specified';
    return locations.map((l: any) => {
      if (typeof l === 'string') return l;
      if (l?.is_remote) return '🌍 Remote';
      return [l?.city, l?.country].filter(Boolean).join(', ') || null;
    }).filter(Boolean).join('· ') || 'Not specified';
  })();

  // ========== SALARY ==========
  const salaryMin: number = parseFloat(rawJob.salary_min ?? job.salary_min ?? 0);
  const salaryMax: number = parseFloat(rawJob.salary_max ?? job.salary_max ?? 0);
  const salaryCurrency: string = rawJob.salary_currency || job.salary_currency || 'Rwf';
  const salaryPeriod: string = rawJob.salary_period || job.salary_period || 'month';
  const salaryVisible: boolean = rawJob.salary_visible ?? job.salary_visible ?? true;

  const salaryDisplay: string | null = (() => {
    if (!salaryVisible) return 'Not disclosed';
    if (salaryMin && salaryMax && salaryMin !== salaryMax) {
      return `${salaryCurrency} ${fmtNum(salaryMin)} – ${fmtNum(salaryMax)} ${salaryPeriod === 'year'? '/year': '/month'}`;
    }
    if (salaryMin) return `${salaryCurrency} ${fmtNum(salaryMin)}+ ${salaryPeriod === 'year'? '/year': '/month'}`;
    if (salaryMax) return `Up to ${salaryCurrency} ${fmtNum(salaryMax)} ${salaryPeriod === 'year'? '/year': '/month'}`;
    return 'Not specified';
  })();

  // ========== DATES ==========
  const publishedAt: string = rawJob.published_at || job.published_at || rawJob.created_at || job.created_at;
  const expiresAt: string = rawJob.expires_at || job.expires_at;
  const createdAt: string = rawJob.created_at || job.created_at;
  const updatedAt: string = rawJob.updated_at || job.updated_at;
  const postedDate: string | null = fmtDate(publishedAt || createdAt);
  const expiryDate: string | null = fmtDate(expiresAt);
  const createdDate: string | null = fmtDate(createdAt);
  const updatedDate: string | null = fmtDate(updatedAt);

  // ========== COUNTS ==========
  const applicationCount: number = safe(rawJob.applications_count ?? job.applications_count ?? 0);
  const viewCount: number = safe(rawJob.view_count ?? job.view_count ?? 0);

  // ========== CONTENT ==========
  const description: string = rawJob.description || job.description || '';
  const experienceLevel: string = rawJob.experience_level || job.experience_level || '';
  const educationRequired: any = rawJob.education_required || job.education_required || {};

  const responsibilities: string[] = toStrArr(rawJob.responsibilities || job.responsibilities);
  const requirementsList: any[] = toArr(rawJob.requirements || job.requirements);
  const benefits: string[] = toStrArr(rawJob.benefits || job.benefits);
  const tags: string[] = toStrArr(rawJob.tags || job.tags);
  const requiredSkills: any[] = toArr(rawJob.skills_required || job.skills_required);
  const preferredSkills: any[] = toArr(rawJob.skills_preferred || job.skills_preferred);

  // ========== MATCH DATA ==========
  const hasMatch = matchData || userMatchScore !== undefined;
  const matchScore = matchData?.matchScore ?? safe(userMatchScore, -1);
  const matchLevel = matchData?.matchLevel || '';
  const criteria = matchData?.criteriaScores || {};
  // The 4-factor breakdown only exists when the profile matcher actually
  // scored this job (score_source "matcher+hybrid" or "matcher-only")   for
  // "hybrid-only" jobs criteria_scores is null, and showing 0% next to a
  // real total score would be misleading, so we hide the section instead.
  const hasBreakdown = criteria.skills_match != null || criteria.qualifications_match != null;
  const skillsScore = criteria.skills_match ?? safe(criteria_scores?.skillsScore, 0);
  const qualsScore = criteria.qualifications_match ?? safe(criteria_scores?.qualificationsScore, 0);
  const expScore = criteria.experience_match ?? safe(criteria_scores?.experienceScore, 0);
  const prefsScore = criteria.preferences_match ?? safe(criteria_scores?.preferencesScore, 0);

  const matchedSkills: string[] = toStrArr(matchData?.matchedSkills || matchData?.skillsBreakdown?.matched_skills);
  const missingSkills: string[] = toStrArr(matchData?.missingSkills || matchData?.skillsBreakdown?.missing_skills);
  const reasons = matchData?.matchReasons || matchData?.reasons || [];

  const ringColor = matchScore >= 80 ? '#22c55e': matchScore >= 60 ? '#3b82f6': matchScore >= 40 ? '#f59e0b': '#ef4444';

  // Extract detailed match breakdowns
  const qualsBD = matchData?.qualificationsBreakdown || {};
  const expBD = matchData?.experienceBreakdown || {};
  const prefsBD = matchData?.preferencesBreakdown || {};
  const skillsBD = matchData?.skillsBreakdown || {};
  // Behavior/Collaborative/Freshness/Popularity/Business-rules breakdown from
  // the hybrid recommender   null when scoreSource is "matcher-only".
  const hybridDetail = matchData?.hybridDetail || null;
  const contentDetail = hybridDetail?.content || null;

  // Actual weights applied to each of the matcher's 4 factors AFTER
  // redistribution, and to the outer matcher/hybrid blend   the real math
  // behind every point shown above, not the nominal 40/25/20/15 / 70/30
  // defaults. Fall back to the nominal defaults only when the backend
  // didn't send this (older cached response shape).
  const factorWeightsUsed = matchData?.factorWeightsUsed || null;
  const excludedFactorsList: string[] = matchData?.excludedFactors || [];
  const skillsWeightPct = Math.round((factorWeightsUsed?.skills ?? 0.40) * 100);
  const qualsWeightPct = Math.round((factorWeightsUsed?.qualifications ?? 0.25) * 100);
  const expWeightPct = Math.round((factorWeightsUsed?.experience ?? 0.20) * 100);
  const prefsWeightPct = Math.round((factorWeightsUsed?.preferences ?? 0.15) * 100);
  const hybridContentIncluded = matchData?.hybridContentIncluded;
  const outerWeightsUsed = matchData?.outerWeightsUsed || null;
  const outerMatcherPct = outerWeightsUsed ? Math.round(outerWeightsUsed.matcher * 100) : null;
  const outerHybridPct = outerWeightsUsed ? Math.round(outerWeightsUsed.hybrid * 100) : null;

  const candidateDegrees = qualsBD.candidate_degrees || [];
  const candidateFields = qualsBD.candidate_fields || [];
  const jobDegreeRequired = qualsBD.job_degree_required || '';
  const jobAllowedFields = qualsBD.job_allowed_fields || [];
  const bestSimilarity = qualsBD.best_similarity || 0;
  const bestMatchedField = qualsBD.best_matched_field || '';
  const matchType = qualsBD.match_type || 'none';

  const experienceMatches = expBD.specific_matches || [];
  const totalExperienceYears = expBD.total_years || 0;
  const requiredExperienceYears = expBD.required_years || 0;
  const experienceGap = expBD.gap_years || 0;
  const matchedRequirements = expBD.matched_requirements || 0;
  const totalRequirements = expBD.total_requirements || 0;

  const preferenceMatches = {
    type_match: prefsBD.type_match || 0,
    remote_match: prefsBD.remote_match || 0,
    location_match: prefsBD.location_match || 0,
    industry_match: prefsBD.industry_match || 0,
    salary_match: prefsBD.salary_match || 0,
    language_match: prefsBD.language_match || 0,
  };

  // ─── renderEducation ────────────────────────────────────────────────────────
  const renderEducation = (edu: any) => {
    if (!edu) return null;
    if (typeof edu === 'string') {
      return <p className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">{edu}</p>;
    }

    return (
      <div className="space-y-3">
        {edu.minimum_degree && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Minimum Degree:</strong>
            <p>{edu.minimum_degree}</p>
          </div>
        )}

        {edu.fields_of_study && edu.fields_of_study.length > 0 && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Fields of Study:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {edu.fields_of_study.map((field: any, idx: number) => {
                const label = typeof field === 'string'? field : field?.name || '';
                return label ? (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    {label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {edu.languages && edu.languages.length > 0 && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Languages Required:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {edu.languages.map((lang: any, idx: number) => {
                const langName = typeof lang === 'string'? lang : lang?.name || '';
                const langProf = typeof lang === 'object'&& lang?.proficiency ? lang.proficiency : null;
                return langName ? (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    {langName}{langProf ? ` (${langProf})` : ''}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {edu.certifications && edu.certifications.length > 0 && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1">📜 Certifications Required:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {edu.certifications.map((cert: any, idx: number) => {
                const label = typeof cert === 'string'? cert : cert?.name || cert?.title || '';
                return label ? (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    {label}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {edu.experience_requirements && (
          Array.isArray(edu.experience_requirements)
            ? edu.experience_requirements.length > 0
            : !!edu.experience_requirements
        ) && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Experience Requirements:</strong>
            {Array.isArray(edu.experience_requirements) ? (
              <ul className="mt-1 space-y-1">
                {edu.experience_requirements.map((exp: any, idx: number) => {
                  const text = typeof exp === 'string'
                    ? exp
                    : [
                        exp?.title,
                        exp?.years ? `${exp.years} yr${Number(exp.years) !== 1 ? 's': ''}` : null,
                        exp?.description,
                      ].filter(Boolean).join('  ');
                  return text ? (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      <span>{text}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="mt-1 whitespace-pre-line">{String(edu.experience_requirements)}</p>
            )}
          </div>
        )}

        {edu.additional_requirements && (
          Array.isArray(edu.additional_requirements)
            ? edu.additional_requirements.length > 0
            : !!edu.additional_requirements
        ) && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Additional Requirements:</strong>
            {Array.isArray(edu.additional_requirements) ? (
              <ul className="mt-1 space-y-1">
                {edu.additional_requirements.map((req: any, idx: number) => {
                  const text = typeof req === 'string'? req : req?.text || req?.description || req?.name || '';
                  return text ? (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      <span>{text}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="mt-1 whitespace-pre-line">{String(edu.additional_requirements)}</p>
            )}
          </div>
        )}

        {edu.age_requirement && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1"> Age Requirement:</strong>
            <p>{edu.age_requirement}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {edu.is_degree_required === false && (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
              Degree Not Required
            </span>
          )}
          {edu.no_documents_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              📄 No Documents Needed
            </span>
          )}
          {edu.no_languages_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              No Language Requirements
            </span>
          )}
          {edu.no_experience_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              Entry Level - No Experience Required
            </span>
          )}
          {edu.no_certifications_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              No Certifications Required
            </span>
          )}
        </div>
      </div>
    );
  };

  // ─── renderSkill ────────────────────────────────────────────────────────────
  const renderSkill = (skill: any, idx: number) => {
    const name = skillLabel(skill);
    if (!name) return null;

    const proficiency = skillProficiency(skill);
    const isRequired = typeof skill === 'object'? skill?.is_required ?? skill?.importance === 'required': false;
    const isMatched = matchedSkills.some(m =>
      m.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(m.toLowerCase())
    );

    return (
      <div
        key={idx}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
          isMatched && hasMatch
            ? 'bg-green-100 text-green-800 border border-green-200'
            : 'bg-gray-100 text-gray-700 border border-gray-200'
        }`}
      >
        {isMatched && hasMatch && <CheckCircle size={12} className="text-green-600" />}
        <span>{name}</span>
        {proficiency && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            proficiency === 'Expert'? 'bg-purple-100 text-purple-700':
            proficiency === 'Advanced'? 'bg-blue-100 text-blue-700':
            proficiency === 'Intermediate'? 'bg-yellow-100 text-yellow-700':
            'bg-gray-100 text-gray-500'
          }`}>
            {proficiency}
          </span>
        )}
      </div>
    );
  };

  // ─── renderRequirement ──────────────────────────────────────────────────────
  const renderRequirement = (req: any, idx: number) => {
    const text = requirementText(req);
    if (!text) return null;

    const isExperience = req && typeof req === 'object'&& req.years !== undefined;

    return (
      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
        {isExperience ? (
          <Briefcase size={13} className="text-purple-400 shrink-0 mt-0.5" />
        ) : (
          <ChevronRight size={13} className="text-blue-400 shrink-0 mt-0.5" />
        )}
        <span>{text}</span>
      </li>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 pt-5 pb-3 rounded-t-2xl flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-2xl font-bold text-gray-900">{jobTitle}</h2>
                {companyVerified && <Shield size={16} className="text-green-600" />}
              </div>

              {companyName && (
                <div className="flex items-center gap-2 text-gray-500 mb-3">
                  <Building2 size={14} />
                  <span className="text-sm">{companyName}</span>
                  {companyIndustry && <span className="text-xs text-gray-400">• {companyIndustry}</span>}
                  {companySize && <span className="text-xs text-gray-400">• {companySize}</span>}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Pill text={status.charAt(0).toUpperCase() + status.slice(1)} color={status === 'active'? 'active': 'draft'} />
                {visibility === 'public' && <Pill text="Public"  color="blue" />}
                {visibility === 'private'&& <Pill text="Private" color="gray" />}
                {jobType          && <Pill text={jobType.replace('-', '')} color="blue" />}
                {workArrangement  && <Pill text={workArrangement}            color="purple" />}
                {experienceLevel  && <Pill text={experienceLevel + 'level'} color="orange" />}
                {department       && <Pill text={department}                 color="gray" />}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500 mt-4 pt-2 border-t border-gray-50">
            {locationDisplay && (
              <span className="flex items-center gap-1.5"><MapPin size={14} />{locationDisplay}</span>
            )}
            {salaryDisplay && salaryVisible && (
              <span className="flex items-center gap-1.5"><DollarSign size={14} />{salaryDisplay}</span>
            )}
            {postedDate && (
              <span className="flex items-center gap-1.5"><Clock size={14} />Posted {postedDate}</span>
            )}
            {expiryDate && (
              <span className="flex items-center gap-1.5"><Calendar size={14} />Closes {expiryDate}</span>
            )}
            <span className="flex items-center gap-1.5">
              <Users size={14} />{applicationCount} applicant{applicationCount !== 1 ? 's': ''}
            </span>
            {viewCount > 0 && (
              <span className="flex items-center gap-1.5"><Eye size={14} />{viewCount} views</span>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="sticky top-[73px] bg-white border-b border-gray-100 px-6 flex-shrink-0">
          <div className="flex">
            <TabBtn id="job" label="Job Details" currentTab={currentTab} setTab={setCurrentTab} />
            {hasMatch && matchScore >= 0 && (
              <TabBtn id="match" label="Match Analysis" currentTab={currentTab} setTab={setCurrentTab} />
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ════ JOB DETAILS TAB ════ */}
          {currentTab === 'job'&& (
            <div>
              {companyBanner && (
                <div className="mb-6 rounded-xl overflow-hidden">
                  <img src={companyBanner} alt={companyName || 'Company banner'} className="w-full h-32 object-cover" />
                </div>
              )}

              {(companyLogo || companyName) && (
                <Section title={`About ${companyName || 'the Company'}`} icon={Building2}>
                  <div className="flex items-start gap-4">
                    {companyLogo && (
                      <img src={companyLogo} alt={companyName} className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                    )}
                    <div className="flex-1">
                      {companyDescription && (
                        <p className="text-sm text-gray-700 whitespace-pre-line mb-3">{companyDescription}</p>
                      )}
                      {companyWebsite && (
                        <a href={companyWebsite} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                          <LinkIcon size={14} /> {companyWebsite}
                        </a>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {description && (
                <Section title="Job Description" icon={FileText}>
                  <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{description}</p>
                </Section>
              )}

              {responsibilities.length > 0 && (
                <Section title="Key Responsibilities" icon={List}>
                  <ul className="space-y-2">
                    {responsibilities.map((r, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle size={13} className="text-purple-400 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {requirementsList.length > 0 && (
                <Section title="Requirements" icon={Briefcase}>
                  <ul className="space-y-2">
                    {requirementsList.map((req, idx) => renderRequirement(req, idx))}
                  </ul>
                </Section>
              )}

              {requiredSkills.length > 0 && (
                <Section title="Required Skills" icon={Code}>
                  <div className="flex flex-wrap gap-2">
                    {requiredSkills.map((skill, idx) => renderSkill(skill, idx))}
                  </div>
                </Section>
              )}

              {preferredSkills.length > 0 && (
                <Section title="Preferred Skills" icon={Star}>
                  <div className="flex flex-wrap gap-2">
                    {preferredSkills.map((skill, idx) => renderSkill(skill, idx))}
                  </div>
                </Section>
              )}

              {educationRequired && Object.keys(educationRequired).length > 0 && (
                <Section title="Education Requirements" icon={GraduationCap}>
                  {renderEducation(educationRequired)}
                </Section>
              )}

              {experienceLevel && (
                <Section title="Experience Level" icon={TrendingUp}>
                  <Pill text={experienceLevel} color="orange" />
                </Section>
              )}

              {benefits.length > 0 && (
                <Section title="Benefits & Perks" icon={Heart}>
                  <div className="flex flex-wrap gap-2">
                    {benefits.map((b, idx) => (
                      <span key={idx} className="px-3 py-1.5 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-full text-sm">
                         {b}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {tags.map((t, idx) => (
                    <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">#{t}</span>
                  ))}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                  <div><span className="font-medium">Job ID:</span> {jobId}</div>
                  <div><span className="font-medium">Created:</span> {createdDate || 'N/A'}</div>
                  <div><span className="font-medium">Last Updated:</span> {updatedDate || 'N/A'}</div>
                  <div><span className="font-medium">Visibility:</span> {visibility}</div>
                </div>
              </div>
            </div>
          )}

          {/* ════ MATCH ANALYSIS TAB ════ */}
          {currentTab === 'match'&& hasMatch && matchScore >= 0 && (
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
                      <span className="text-lg font-extrabold" style={{ color: ringColor }}>
                        {matchScore.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xl font-extrabold text-gray-900">{matchLevel || 'AI Match Analysis'}</p>
                    {hasBreakdown ? (
                      <div className="flex gap-3 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Sparkles size={10} /> Skills: {skillsScore.toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><GraduationCap size={10} /> Education: {qualsScore.toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><WorkIcon size={10} /> Experience: {expScore.toFixed(0)}%</span>
                        <span className="flex items-center gap-1"><Heart size={10} /> Preferences: {prefsScore.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-semibold text-gray-700">{matchScore.toFixed(0)}%</span> from the AI hybrid recommender (content, behavior, collaborative, freshness, popularity)   the profile matcher hasn't scored this specific job yet.
                      </p>
                    )}
                    {/* How this total was actually calculated */}
                    <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1">
                      <Info size={11} className="shrink-0" />
                      {hasBreakdown && outerWeightsUsed
                        ? `Profile matcher ${outerMatcherPct}% + hybrid recommender ${outerHybridPct}%` +
                          (hybridContentIncluded === false ? ' (hybrid excludes Content here -- already covered by the matcher\'s own profile fit)' : '')
                        : hasBreakdown
                        ? 'Profile matcher only -- hybrid recommender had no data for this job.'
                        : hybridContentIncluded
                        ? 'Hybrid recommender only (all 5 signals, Content included) -- profile matcher had no data for this job.'
                        : 'Hybrid recommender only -- profile matcher had no data for this job.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4-Factor breakdown   only when the profile matcher actually scored this job */}
              {hasBreakdown && (
                <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Target size={15} className="text-blue-600" /> 4-Factor Score Breakdown
                  </h3>
                  {excludedFactorsList.length > 0 && (
                    <p className="text-[11px] text-gray-500 mb-3 -mt-1">
                      Weights below are the ACTUAL weights used after redistribution -- {excludedFactorsList.join(', ')} excluded (job stated no requirement), their share moved to the remaining factors.
                    </p>
                  )}
                  <FactorRow label="🔧 Skills"          score={skillsScore} weight={`${skillsWeightPct}%`} pts={skillsScore * (skillsWeightPct / 100)} colour="bg-green-500"
                    excluded={excludedFactorsList.includes('skills')} excludedNote={skillsBD.note || undefined} />
                  <FactorRow label=" Qualifications"  score={qualsScore}  weight={`${qualsWeightPct}%`}  pts={qualsScore  * (qualsWeightPct / 100)}  colour="bg-blue-500"
                    excluded={excludedFactorsList.includes('qualifications')}>
                    {qualsBD.excluded_dimensions?.length > 0 && !excludedFactorsList.includes('qualifications') && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Within Qualifications: {qualsBD.excluded_dimensions.join(', ')} not required by this job, redistributed to
                        {' '}{Object.entries(qualsBD.redistributed_weights || {}).filter(([, w]: any) => w > 0).map(([k]: any) => k).join(', ')}.
                      </p>
                    )}
                  </FactorRow>
                  <FactorRow label="📅 Experience"      score={expScore}    weight={`${expWeightPct}%`}    pts={expScore    * (expWeightPct / 100)}    colour="bg-purple-500" />
                  <FactorRow label="⚙️ Preferences"     score={prefsScore}  weight={`${prefsWeightPct}%`}  pts={prefsScore  * (prefsWeightPct / 100)}  colour="bg-yellow-500"
                    excluded={excludedFactorsList.includes('preferences')}>
                    {prefsBD.excluded_dimensions?.length > 0 && !excludedFactorsList.includes('preferences') && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        Within Preferences: {prefsBD.excluded_dimensions.join(', ')} not specified by this job, redistributed to
                        {' '}{Object.entries(prefsBD.redistributed_weights || {}).filter(([, w]: any) => w > 0).map(([k]: any) => k).join(', ')}.
                      </p>
                    )}
                  </FactorRow>
                </div>
              )}
              
              
              {/* Hybrid Recommendation Signals   Behavior/Collaborative/
                  Freshness/Popularity/Business rules from
                  hybrid_job_recommender.py. Absent (null) when scoreSource is
                  "matcher-only", i.e. hybrid had no data for this job. */}
              {hybridDetail && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-500" /> Hybrid Recommendation Signals
                  </h4>
                  <p className="text-[11px] text-gray-500 -mt-2 mb-3">
                    5 signals blended: Content 35% · Behavior 30% · Collaborative 20% · Freshness 10% · Popularity 5%
                    {hybridContentIncluded === false && ' (Content excluded here -- see note above)'}.
                  </p>
                  <div className="space-y-3">
                    {/* Content */}
                    {contentDetail && (
                      <div className={`bg-white rounded-xl p-3 ${hybridContentIncluded === false ? 'opacity-60' : ''}`}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="flex items-center gap-1 font-medium text-gray-700"><Layers size={13} className="text-fuchsia-600" /> Content
                            {hybridContentIncluded === false && <span className="text-[10px] text-gray-400 font-normal">(excluded from total)</span>}
                          </span>
                          <span className="font-semibold">{Math.round((contentDetail.final_score ?? 0) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div className="bg-fuchsia-500 h-2 rounded-full transition-all duration-500" style={{ width: `${(contentDetail.final_score ?? 0) * 100}%` }} />
                        </div>
                        {/* Per-pair TF-IDF cosine scores -- skills/fields/location/title/languages/certifications/experience_text */}
                        {contentDetail.tfidf_score_by_pair && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px] text-gray-500 mb-1">
                            {Object.entries(contentDetail.tfidf_score_by_pair).map(([pair, val]: any) => (
                              <span key={pair} className="flex justify-between bg-gray-50 rounded px-1.5 py-0.5">
                                <span className="capitalize">{pair.replace(/_/g, ' ')}</span>
                                <span className="font-medium">{Math.round((val || 0) * 100)}%</span>
                              </span>
                            ))}
                          </div>
                        )}
                        {contentDetail.semantic_score != null && (
                          <p className="text-[10px] text-gray-400">Semantic embedding similarity: {Math.round(contentDetail.semantic_score * 100)}%</p>
                        )}
                        {(() => {
                          const matched = Object.values(contentDetail.matched_terms_by_pair || {}).flat() as string[];
                          return matched.length > 0 && (
                            <p className="text-xs text-fuchsia-700 mt-1"> Matched terms: {matched.slice(0, 6).join(', ')}</p>
                          );
                        })()}
                      </div>
                    )}

                    {/* Behavior */}
                    <div className="bg-white rounded-xl p-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 font-medium text-gray-700"><Users size={13} className="text-indigo-600" /> Behavior</span>
                        <span className="font-semibold">
                          {hybridDetail.behavior?.content_similarity_score != null
                            ? `${Math.round(hybridDetail.behavior.content_similarity_score * 100)}%`
                            : 'No history yet'}
                        </span>
                      </div>
                      {hybridDetail.behavior?.content_similarity_score != null && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                          <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${hybridDetail.behavior.content_similarity_score * 100}%` }} />
                        </div>
                      )}
                      {(() => {
                        const matched = [
                          ...(hybridDetail.behavior?.matched_skills || []),
                          ...(hybridDetail.behavior?.matched_title || []),
                          ...(hybridDetail.behavior?.matched_location || []),
                          ...(hybridDetail.behavior?.matched_languages || []),
                        ];
                        return matched.length > 0 && (
                          <p className="text-xs text-indigo-700">
                             Matches your usual {matched.slice(0, 3).join(', ')}
                          </p>
                        );
                      })()}
                      {hybridDetail.behavior?.top_interacted_jobs?.length > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Similar to jobs you engaged with: {hybridDetail.behavior.top_interacted_jobs.slice(0, 2).map((j: any) => j.title).join(', ')}
                        </p>
                      )}
                    </div>

                    {/* Collaborative */}
                    <div className="bg-white rounded-xl p-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1 font-medium text-gray-700"><Users size={13} className="text-pink-600" /> Collaborative</span>
                        <span className="font-semibold">
                          {hybridDetail.collaborative?.has_learned_embedding
                            ? `${Math.round(hybridDetail.collaborative.raw_score * 100)}%`
                            : 'No history yet'}
                        </span>
                      </div>
                      {hybridDetail.collaborative?.has_learned_embedding && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                          <div className="bg-pink-500 h-2 rounded-full transition-all duration-500" style={{ width: `${hybridDetail.collaborative.raw_score * 100}%` }} />
                        </div>
                      )}
                      {hybridDetail.collaborative?.similar_candidates_engaged && (
                        <p className="text-xs text-pink-700"> Candidates with similar interests engaged with this job.</p>
                      )}
                    </div>

                    {/* Freshness & Popularity */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-xl p-3">
                        <span className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1"><Clock size={13} className="text-teal-600" /> Freshness</span>
                        <p className="text-xs text-gray-600">
                          {hybridDetail.freshness?.days_old != null ? `Posted ${Number(hybridDetail.freshness.days_old).toFixed(0)} day(s) ago` : 'Unknown'}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3">
                        <span className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1"><TrendingUp size={13} className="text-orange-600" /> Popularity</span>
                        <p className="text-xs text-gray-600">
                          {hybridDetail.popularity?.application_count ?? 0} application(s), {hybridDetail.popularity?.view_count ?? 0} view(s)
                        </p>
                      </div>
                    </div>

                    {/* Business rules */}
                    {hybridDetail.business_rules?.reasons?.length > 0 && (
                      <div className="bg-white rounded-xl p-3">
                        <span className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1"><Shield size={13} className="text-green-700" /> Business rules</span>
                        {hybridDetail.business_rules.reasons.map((r: string, idx: number) => (
                          <p key={idx} className="text-xs text-green-700"> {r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              

              {/* Education Qualification Match Section */}
              {(candidateDegrees.length > 0 || jobDegreeRequired) && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                    <GraduationCap size={14} /> Education Qualification Match
                  </h4>
                  
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-blue-600 font-medium mb-2"> Your Education:</p>
                      <div className="space-y-2">
                        {candidateDegrees.map((deg: string, idx: number) => (
                          <div key={idx} className="bg-white rounded-lg p-2">
                            <span className="text-blue-900 font-medium"> {deg}</span>
                          </div>
                        ))}
                        {candidateFields.map((field: string, idx: number) => (
                          <div key={idx} className="bg-white rounded-lg p-2">
                            <span className="text-blue-700 text-xs"> {field}</span>
                          </div>
                        ))}
                        {candidateDegrees.length === 0 && candidateFields.length === 0 && (
                          <div className="bg-white rounded-lg p-2 text-orange-600 text-xs">
                             No education information provided
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs text-blue-600 font-medium mb-2">📋 Job Requirements:</p>
                      <div className="bg-white rounded-lg p-2 mb-2">
                        <p className="text-blue-900"> {jobDegreeRequired || 'Not specified'}</p>
                      </div>
                      {jobAllowedFields.length > 0 && (
                        <div>
                          <p className="text-xs text-blue-600 mt-2 mb-1">Allowed Fields of Study:</p>
                          <div className="flex flex-wrap gap-1">
                            {jobAllowedFields.map((field: string, idx: number) => (
                              <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">
                                {field}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {bestSimilarity > 0 && bestMatchedField && (
                    <div className="mt-3 pt-2 border-t border-blue-200 text-xs text-blue-700">
                      ''Best match: <strong>{bestMatchedField}</strong> (Similarity: {(bestSimilarity * 100).toFixed(0)}%) - Match type: <strong>{matchType}</strong>
                    </div>
                  )}
                </div>
              )}
              
              

              {/* Experience Match Section -- shown whenever the job states a
                  required years/requirements, even at 0 matched, so a 0%
                  Experience score always comes with "here's what the job
                  wants vs what you have" instead of a bare percentage. */}
              {(experienceMatches.length > 0 || totalExperienceYears > 0 || requiredExperienceYears > 0 || totalRequirements > 0) && (
                <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
                  <h4 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
                    <Briefcase size={14} /> Experience Match Details
                  </h4>

                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div className="bg-white rounded-lg p-2 text-center">
                      <p className="text-xs text-purple-600">Your Total Experience</p>
                      <p className="text-lg font-bold text-purple-900">{totalExperienceYears.toFixed(1)} years</p>
                    </div>
                    {requiredExperienceYears > 0 && (
                      <div className="bg-white rounded-lg p-2 text-center">
                        <p className="text-xs text-purple-600">Job Requires</p>
                        <p className="text-lg font-bold text-purple-900">{requiredExperienceYears}+ years</p>
                      </div>
                    )}
                  </div>
                  {experienceMatches.length === 0 && totalRequirements > 0 && (
                    <p className="text-xs text-gray-500 mb-3">None of this job's {totalRequirements} specific experience requirement{totalRequirements === 1 ? '': 's'} matched your work history.</p>
                  )}

                  {matchedRequirements > 0 && totalRequirements > 0 && (
                    <div className="bg-white rounded-lg p-2 text-center mb-3">
                      <p className="text-xs text-purple-600">Requirements Met</p>
                      <p className="text-lg font-bold text-purple-900">{matchedRequirements} / {totalRequirements}</p>
                    </div>
                  )}
                  
                  {experienceGap > 0 && (
                    <div className="bg-amber-100 text-amber-800 rounded-lg p-2 text-xs mb-3 flex items-center gap-2">
                      <AlertTriangle size={14} /> Experience gap: {experienceGap.toFixed(1)} years
                    </div>
                  )}
                  
                  {experienceMatches.map((match: any, idx: number) => (
                    <div key={idx} className="bg-white rounded-lg p-3 mb-2">
                      <p className="font-semibold text-purple-800 text-sm">{match.requirement_title}</p>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-purple-600">Your experience: {match.candidate_years} years</span>
                        <span className="text-purple-600">Required: {match.requirement_years} years</span>
                      </div>
                      <div className="w-full bg-purple-100 rounded-full h-1.5 mt-2">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${match.years_score * 100}%` }} />
                      </div>
                      <p className="text-xs text-purple-500 mt-1">Match quality: {(match.combined_score * 100).toFixed(0)}%</p>
                    </div>
                  ))}

                  {/* Requirements with nothing in the candidate's work history
                      relevant enough to compare against -- previously these
                      just vanished from the list; now each one still shows
                      what the job wanted. */}
                  {(expBD.unmatched_requirements || []).map((req: any, idx: number) => {
                    const title = typeof req === 'string'? req : req.title;
                    const years = typeof req === 'string'? null : req.years_required;
                    return (
                      <div key={`unmatched-${idx}`} className="bg-white rounded-lg p-3 mb-2 opacity-70">
                        <p className="font-semibold text-gray-700 text-sm">{title}</p>
                        <div className="flex justify-between text-xs mt-1">
                          <span className="text-gray-500">Your experience: none relevant on file</span>
                          {years != null && <span className="text-gray-500">Required: {years} years</span>}
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                          <div className="bg-gray-300 h-1.5 rounded-full" style={{ width: '0%'}} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Not met</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Skills Analysis Section -- shown whenever the job states
                  skill requirements, even if the candidate matched none, so
                  a 0% Skills score always comes with "here's what the job
                  wants" instead of a bare percentage. */}
              {(matchedSkills.length > 0 || missingSkills.length > 0 || skillsBD.total_required > 0) && (
                <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <h4 className="text-sm font-bold text-green-800 mb-3 flex items-center gap-2">
                    <Code size={14} /> Skills Analysis
                  </h4>

                  {skillsBD.total_required > 0 && (
                    <div className="bg-white rounded-lg p-2 text-center mb-3">
                      <p className="text-xs text-green-600">Skills Match Rate</p>
                      <p className="text-lg font-bold text-green-900">{skillsBD.total_matched || 0} / {skillsBD.total_required} matched</p>
                    </div>
                  )}
                  {matchedSkills.length === 0 && missingSkills.length === 0 && skillsBD.total_required > 0 && (
                    <p className="text-xs text-gray-500 mb-2">You have no skills on file that match this job's requirements.</p>
                  )}

                  {matchedSkills.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-green-700 font-medium mb-2"> Matched Skills ({matchedSkills.length}):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {matchedSkills.map((skill: string, idx: number) => (
                          <span key={idx} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {missingSkills.length > 0 && (
                    <div>
                      <p className="text-xs text-orange-700 font-medium mb-2"> Missing Skills ({missingSkills.length}):</p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingSkills.map((skill: string, idx: number) => (
                          <span key={idx} className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Preferences Breakdown -- always shown when any dimension is
                  applicable (not just when a dimension scored > 0), each
                  with what the candidate has vs what the job wants, or a
                  plain-language note when there's nothing to compare. */}
              {(prefsBD.applicable ?? true) && (
                <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
                  <h4 className="text-sm font-bold text-yellow-800 mb-3 flex items-center gap-2">
                    <Heart size={14} /> Preferences Match
                  </h4>
                  <div className="grid gap-3 text-sm">
                    {!prefsBD.excluded_dimensions?.includes('type') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Job Type</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.type_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.type_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.type_match_note}</p>
                        ) : (
                          <p className="text-xs text-gray-600">
                            You want: <strong>{(prefsBD.candidate_job_types || []).join(', ') || 'Not specified'}</strong> · Job is: <strong>{job?.job_type || 'Not specified'}</strong>
                          </p>
                        )}
                      </div>
                    )}
                    {!prefsBD.excluded_dimensions?.includes('remote') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Remote Work</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.remote_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.remote_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.remote_match_note}</p>
                        ) : (
                          <p className="text-xs text-gray-600">
                            You prefer: <strong>{prefsBD.candidate_remote_preference || 'Not specified'}</strong> · Job is: <strong>{job?.work_arrangement || 'Not specified'}</strong>
                          </p>
                        )}
                      </div>
                    )}
                    {!prefsBD.excluded_dimensions?.includes('location') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Location</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.location_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.location_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.location_match_note}</p>
                        ) : prefsBD.location_match_details ? (
                          <p className="text-xs text-gray-600">
                            You: <strong>{prefsBD.location_match_details.candidate_location}</strong> · Job: <strong>{prefsBD.location_match_details.job_location}</strong>
                          </p>
                        ) : null}
                      </div>
                    )}
                    {!prefsBD.excluded_dimensions?.includes('industry') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Industry</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.industry_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.industry_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.industry_match_note}</p>
                        ) : (prefsBD.industry_match_details?.length > 0) ? (
                          <p className="text-xs text-gray-600">
                            You: <strong>{(prefsBD.candidate_industries || []).join(', ')}</strong> · Job: <strong>{prefsBD.industry_match_details[0].job_value}</strong>
                          </p>
                        ) : null}
                      </div>
                    )}
                    {!prefsBD.excluded_dimensions?.includes('salary') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Salary</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.salary_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.salary_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.salary_match_note}</p>
                        ) : prefsBD.salary_match_details ? (
                          <p className="text-xs text-gray-600">
                            You want: <strong>{prefsBD.salary_match_details.candidate_min?.toLocaleString()} - {prefsBD.salary_match_details.candidate_max?.toLocaleString()}</strong> · Job offers: <strong>{prefsBD.salary_match_details.job_min?.toLocaleString()} - {prefsBD.salary_match_details.job_max?.toLocaleString()}</strong>
                          </p>
                        ) : null}
                      </div>
                    )}
                    {!prefsBD.excluded_dimensions?.includes('language') && (
                      <div className="bg-white rounded-lg p-2.5">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-xs text-gray-500 font-medium">Languages</p>
                          <p className="font-semibold text-gray-800">{(preferenceMatches.language_match * 100).toFixed(0)}%</p>
                        </div>
                        {prefsBD.language_match_note ? (
                          <p className="text-xs text-gray-400">{prefsBD.language_match_note}</p>
                        ) : (prefsBD.language_match_details?.length > 0) ? (
                          <p className="text-xs text-gray-600">
                            {prefsBD.language_match_details.map((l: any, i: number) => (
                              <span key={i}>{l.required}{l.matched_with ? ' ': ' ✗'}{i < prefsBD.language_match_details.length - 1 ? ', ': ''}</span>
                            ))}
                            {' '}(you have: {(prefsBD.candidate_languages || []).join(', ') || 'none on file'})
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {prefsBD.missing_job_data && prefsBD.missing_job_data.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-yellow-200 text-xs text-yellow-700">
                      ℹ️ Missing job data: {prefsBD.missing_job_data.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Match reasons   hybrid_job_recommender.py's `reasons` is a list of
                  plain explanation strings (see RECOMMENDATION_ENGINE.md), not
                  {type, text} objects, so normalize both shapes here. */}
              {reasons.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Match Insights</h4>
                  {reasons.map((r: any, idx: number) => {
                    const text = typeof r === 'string'? r : r.text;
                    const type = typeof r === 'string'? undefined : r.type;
                    if (!text) return null;
                    return (
                      <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm ${
                        type === 'positive'? 'bg-green-50 text-green-800':
                        type === 'warning' ? 'bg-amber-50 text-amber-800':
                                                'bg-blue-50 text-blue-800'
                      }`}>
                        {type === 'positive'? <ThumbsUp   size={13} className="mt-0.5 shrink-0" /> :
                         type === 'warning' ? <AlertCircle size={13} className="mt-0.5 shrink-0" /> :
                                                 <Info        size={13} className="mt-0.5 shrink-0" />}
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              

              {/* Candidate Preferences Info */}
              {candidateInfo && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <User size={14} /> Your Candidate Profile
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-lg p-2">
                      <span className="text-gray-500">Name:</span>
                      <p className="font-medium text-gray-800">{candidateInfo.name || 'Not provided'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <span className="text-gray-500">Level:</span>
                      <p className="font-medium text-gray-800">{candidateInfo.level || 'Not specified'}</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <span className="text-gray-500">Experience:</span>
                      <p className="font-medium text-gray-800">{candidateInfo.total_experience_years || 0} years</p>
                    </div>
                    <div className="bg-white rounded-lg p-2">
                      <span className="text-gray-500">Top Skills:</span>
                      <p className="font-medium text-gray-800">{candidateInfo.skills?.slice(0, 3).join(', ') || 'None'}</p>
                    </div>
                  </div>
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