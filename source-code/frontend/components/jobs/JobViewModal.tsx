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
      const levels: Record<number, string> = { 1: 'beginner', 2: 'basic', 3: 'intermediate', 4: 'advanced', 5: 'expert' };
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
  const [currentTab, setCurrentTab] = useState<'match' | 'job'>('job');
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
    }).filter(Boolean).join(' · ') || 'Not specified';
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
      return `${salaryCurrency} ${fmtNum(salaryMin)} – ${fmtNum(salaryMax)} ${salaryPeriod === 'year' ? '/year' : '/month'}`;
    }
    if (salaryMin) return `${salaryCurrency} ${fmtNum(salaryMin)}+ ${salaryPeriod === 'year' ? '/year' : '/month'}`;
    if (salaryMax) return `Up to ${salaryCurrency} ${fmtNum(salaryMax)} ${salaryPeriod === 'year' ? '/year' : '/month'}`;
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
  const matchStars = matchData?.matchStars || '';
  const matchRec = matchData?.matchRecommendation || matchData?.recommendation || '';
  const criteria = matchData?.criteriaScores || {};
  const skillsScore = criteria.skills_match ?? safe(criteria_scores?.skillsScore, 0);
  const qualsScore = criteria.qualifications_match ?? safe(criteria_scores?.qualificationsScore, 0);
  const expScore = criteria.experience_match ?? safe(criteria_scores?.experienceScore, 0);
  const prefsScore = criteria.preferences_match ?? safe(criteria_scores?.preferencesScore, 0);

  const matchedSkills: string[] = toStrArr(matchData?.matchedSkills);
  const missingSkills: string[] = toStrArr(matchData?.missingSkills);
  const reasons = matchData?.matchReasons || [];

  const ringColor = matchScore >= 80 ? '#22c55e' : matchScore >= 60 ? '#3b82f6' : matchScore >= 40 ? '#f59e0b' : '#ef4444';

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
            <strong className="block text-blue-800 mb-1">🎓 Minimum Degree:</strong>
            <p>{edu.minimum_degree}</p>
          </div>
        )}

        {edu.fields_of_study && edu.fields_of_study.length > 0 && (
          <div className="text-sm text-gray-700 bg-blue-50 rounded-lg px-4 py-3">
            <strong className="block text-blue-800 mb-1">📚 Fields of Study:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {edu.fields_of_study.map((field: any, idx: number) => {
                const label = typeof field === 'string' ? field : field?.name || '';
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
            <strong className="block text-blue-800 mb-1">🌐 Languages Required:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {edu.languages.map((lang: any, idx: number) => {
                const langName = typeof lang === 'string' ? lang : lang?.name || '';
                const langProf = typeof lang === 'object' && lang?.proficiency ? lang.proficiency : null;
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
                const label = typeof cert === 'string' ? cert : cert?.name || cert?.title || '';
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
            <strong className="block text-blue-800 mb-1">💼 Experience Requirements:</strong>
            {Array.isArray(edu.experience_requirements) ? (
              <ul className="mt-1 space-y-1">
                {edu.experience_requirements.map((exp: any, idx: number) => {
                  const text = typeof exp === 'string'
                    ? exp
                    : [
                        exp?.title,
                        exp?.years ? `${exp.years} yr${Number(exp.years) !== 1 ? 's' : ''}` : null,
                        exp?.description,
                      ].filter(Boolean).join(' — ');
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
            <strong className="block text-blue-800 mb-1">✨ Additional Requirements:</strong>
            {Array.isArray(edu.additional_requirements) ? (
              <ul className="mt-1 space-y-1">
                {edu.additional_requirements.map((req: any, idx: number) => {
                  const text = typeof req === 'string' ? req : req?.text || req?.description || req?.name || '';
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
            <strong className="block text-blue-800 mb-1">🎂 Age Requirement:</strong>
            <p>{edu.age_requirement}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {edu.is_degree_required === false && (
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
              ⚠️ Degree Not Required
            </span>
          )}
          {edu.no_documents_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              📄 No Documents Needed
            </span>
          )}
          {edu.no_languages_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              🌍 No Language Requirements
            </span>
          )}
          {edu.no_experience_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              🚀 Entry Level - No Experience Required
            </span>
          )}
          {edu.no_certifications_needed && (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs">
              📜 No Certifications Required
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
    const isRequired = typeof skill === 'object' ? skill?.is_required ?? skill?.importance === 'required' : false;
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
            proficiency === 'expert'        ? 'bg-purple-100 text-purple-700' :
            proficiency === 'advanced'      ? 'bg-blue-100 text-blue-700' :
            proficiency === 'intermediate'  ? 'bg-yellow-100 text-yellow-700' :
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

    const isExperience = req && typeof req === 'object' && req.years !== undefined;

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
                <Pill text={status.charAt(0).toUpperCase() + status.slice(1)} color={status === 'active' ? 'active' : 'draft'} />
                {visibility === 'public'  && <Pill text="Public"  color="blue" />}
                {visibility === 'private' && <Pill text="Private" color="gray" />}
                {jobType          && <Pill text={jobType.replace('-', ' ')} color="blue" />}
                {workArrangement  && <Pill text={workArrangement}            color="purple" />}
                {experienceLevel  && <Pill text={experienceLevel + ' level'} color="orange" />}
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
              <Users size={14} />{applicationCount} applicant{applicationCount !== 1 ? 's' : ''}
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
          {currentTab === 'job' && (
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
                        🎁 {b}
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
          {currentTab === 'match' && hasMatch && matchScore >= 0 && (
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
                    {matchStars && <p className="text-base mt-0.5">{matchStars}</p>}
                    {matchRec   && <p className="text-sm font-medium mt-1">{matchRec}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Sparkles size={10} /> Skills: {skillsScore.toFixed(0)}%</span>
                      <span className="flex items-center gap-1"><GraduationCap size={10} /> Education: {qualsScore.toFixed(0)}%</span>
                      <span className="flex items-center gap-1"><WorkIcon size={10} /> Experience: {expScore.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Factor breakdown */}
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Target size={15} className="text-blue-600" /> 4-Factor Score Breakdown
                </h3>
                <FactorRow label="🔧 Skills"          score={skillsScore} weight="40%" pts={skillsScore * 0.40} colour="bg-green-500" />
                <FactorRow label="🎓 Qualifications"  score={qualsScore}  weight="25%" pts={qualsScore  * 0.25} colour="bg-blue-500" />
                <FactorRow label="📅 Experience"      score={expScore}    weight="20%" pts={expScore    * 0.20} colour="bg-purple-500" />
                <FactorRow label="⚙️ Preferences"     score={prefsScore}  weight="15%" pts={prefsScore  * 0.15} colour="bg-yellow-500" />
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm font-bold text-gray-900 mb-1">
                    <span>Total Score</span>
                    <span style={{ color: ringColor }}>{matchScore.toFixed(1)} / 100 pts</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full" style={{ width: `${matchScore}%`, background: ringColor }} />
                  </div>
                  <p className="text-center text-xs text-gray-500 mt-3">
                    {matchScore >= 80 ? '🎉 Excellent match! Strongly recommend applying.' :
                     matchScore >= 65 ? '👍 Good match! Consider applying.' :
                     matchScore >= 50 ? '⚠️ Partial match. Update your profile to improve.' :
                                        '📝 Low match. Focus on skill development.'}
                  </p>
                </div>
              </div>

              {/* Skills gap */}
              {missingSkills.length > 0 && (
                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                  <h4 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2">
                    <Zap size={14} /> Skills Gap Analysis
                  </h4>
                  <p className="text-xs text-orange-700 mb-2">
                    You're missing {missingSkills.length} skill{missingSkills.length !== 1 ? 's' : ''} that the job requires:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {missingSkills.map((s, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-white border border-orange-200 text-orange-800 text-xs font-medium rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Match reasons */}
              {reasons.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700">Match Insights</h4>
                  {reasons.map((r: any, idx: number) => (
                    <div key={idx} className={`flex items-start gap-2 px-3 py-2 rounded-xl text-sm ${
                      r.type === 'positive' ? 'bg-green-50 text-green-800' :
                      r.type === 'warning'  ? 'bg-amber-50 text-amber-800' :
                                              'bg-blue-50 text-blue-800'
                    }`}>
                      {r.type === 'positive' ? <ThumbsUp   size={13} className="mt-0.5 shrink-0" /> :
                       r.type === 'warning'  ? <AlertCircle size={13} className="mt-0.5 shrink-0" /> :
                                               <Info        size={13} className="mt-0.5 shrink-0" />}
                      {r.text}
                    </div>
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