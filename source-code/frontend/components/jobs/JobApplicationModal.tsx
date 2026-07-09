// JobApplicationModal.tsx - FIXED VERSION

import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle, AlertCircle, Upload, FileText, User, Briefcase,
  MapPin, DollarSign, Calendar, Clock, Star, TrendingUp, Award, Shield,
  Send, ChevronRight, ChevronLeft, Plus, Trash2, Eye, Download,
  MessageSquare, HelpCircle, Building2, Info, AlertTriangle, Edit3,
  Check, ThumbsUp, ThumbsDown, Code, GraduationCap, Link, Globe,
  Linkedin, Github, ExternalLink, Target, Zap, Sparkles,
  Play, Rocket, BarChart3, Users
} from 'lucide-react';
import { submitApplication } from '../../services/applicationAPI';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface UploadProgressType {
  [key: number]: number;
}

interface AnswersType {
  [key: number]: string;
}

interface ErrorsType {
  [key: number | string]: string | null;
}

interface DocumentType {
  id: number;
  file: File;
  name: string;
  size: number;
  type: string;
  preview: string;
  documentType: string;
  uploaded: boolean;
}

interface ProfileType {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  headline: string;
  summary: string;
  dateOfBirth: string | null;
  profilePhotoUrl: string;
  skills: string[];
  skillDetails: Array<{ name: string; proficiency_level: number; proficiency_label: string }>;
  education: any[];
  workExperience: any[];
  resumes: any[];
  languages: any[];
  portfolioLinks: any[];
}

interface MatchDetailsType {
  criteria_scores?: {
    skills_match?: number | null;
    qualifications_match?: number | null;
    experience_match?: number | null;
    preferences_match?: number | null;
  };
  skills_breakdown?: {
    matched_skills?: string[];
    missing_skills?: string[];
    total_required?: number;
    total_matched?: number;
    individual_scores?: number[];
  };
  qualifications_breakdown?: {
    candidate_degrees?: string[];
    candidate_fields?: string[];
    candidate_combined?: string[];
    job_degree_required?: string;
    job_allowed_fields?: string[];
    best_similarity?: number;
    best_matched_field?: string | null;
    match_type?: string;
    match_quality?: string;
    explanation?: string;
    qualification_entries?: Array<{
      degree: string;
      fields_of_study: string[];
    }>;
  };
  experience_breakdown?: {
    total_years?: number;
    candidate_years?: number;
    required_years?: number;
    gap_years?: number;
    match_type?: string;
    total_requirements?: number;
    matched_requirements?: number;
    specific_matches?: Array<{
      requirement_title?: string;
      requirement_years?: number;
      matched_title?: string;
      candidate_years?: number;
      similarity?: number;
      years_score?: number;
      combined_score?: number;
    }>;
    unmatched_requirements?: string[];
  };
  preferences_breakdown?: any;
  // Combined feed (matcher 70% + hybrid 30%, see hybrid_job_recommender.py::combined_score_candidate)
  matcher_score?: number | null;
  hybrid_score?: number | null;
  score_source?: 'matcher+hybrid' | 'matcher-only' | 'hybrid-only';
  reasons?: string[];
  // Full behavior/collaborative/freshness/popularity/business-rule breakdown
  // from hybrid_job_recommender.py's score_candidate() — null when
  // score_source is "matcher-only" (hybrid had no data for this job).
  hybrid_detail?: {
    content: {
      matched_skills: string[];
      matched_education: string[];
      matched_languages: string[];
      semantic_encoder_available: boolean;
      candidate_age: number | null;
      job_age_requirement: string | null;
      age_fit_score: number;
      matched_terms_by_pair: Record<string, string[]>;
      tfidf_score_by_pair: Record<string, number>;
      semantic_score: number | null;
      final_score: number;
    };
    behavior: {
      matched_attributes: Array<{ attribute: string; value: string; weight: number }>;
      content_similarity_score: number | null;
      content_similarity_tfidf: number | null;
      content_similarity_semantic: number | null;
      top_interacted_jobs: Array<{ title: string; company: string; weight: number }>;
      has_search_history: boolean;
      final_score: number;
    };
    collaborative: {
      trained: boolean;
      has_learned_embedding: boolean;
      raw_score: number;
      similar_candidates: Array<{ candidate_id: string; similarity: number }>;
      similar_candidates_engaged: boolean;
    };
    freshness: { score: number; days_old: number | null };
    popularity: { score: number; application_count: number; view_count: number };
    business_rules: { modifier: number; reasons: string[] };
  } | null;
}

interface JobApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  candidateProfile?: any;
  matchScore?: number;
  matchDetails?: MatchDetailsType | null;
  // Accepts plain names or the job-posting shape { name, is_required }.
  requiredDocuments?: Array<string | { name: string; is_required?: boolean }>;
  onSuccess?: (data?: any) => void;
}

// Mirrors JobViewModal.tsx's FactorRow exactly, so the 4-Factor Score
// Breakdown looks identical whether a candidate is viewing or applying.
const FactorRow = ({
  label, score, weight, pts, colour
}: {
  label: string; score: number; weight: string; pts: number; colour: string
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
  </div>
);

// ============================================
// JOB APPLICATION MODAL COMPONENT
// ============================================

const JobApplicationModal = ({
  isOpen,
  onClose,
  job,
  candidateProfile: candidateProfileProp,
  matchScore: matchScoreProp = 0,
  matchDetails: matchDetailsProp = null,
  // No job-level "required documents" field exists in the database — Resume
  // is the only document every job genuinely needs; Cover Letter defaults to
  // optional rather than being hardcoded as required for every job.
  requiredDocuments = [{ name: 'Resume', is_required: true }, { name: 'Cover Letter', is_required: false }],
  onSuccess,
}: JobApplicationModalProps) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [answers, setAnswers] = useState<AnswersType>({});
  const [documents, setDocuments] = useState<(DocumentType | null)[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<ErrorsType>({});
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  const [showAllSkills, setShowAllSkills] = useState<boolean>(false);
  const [showAllEducation, setShowAllEducation] = useState<boolean>(false);
  const [showAllExperience, setShowAllExperience] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressType>({});
  const [submissionResponse, setSubmissionResponse] = useState<any>(null);
  const [showSimulationPrompt, setShowSimulationPrompt] = useState<boolean>(false);

  // Normalize profile data
  const profile = normaliseProfile(candidateProfileProp);
  const matchScore = matchScoreProp ?? 0;
  const matchDetails = matchDetailsProp;
  const screeningQuestions = job?.screening_questions || job?.screeningQuestions || [];
  const totalSteps = 4;

  // ─── HELPER FUNCTIONS ─────────────────────────────────────────
  function normaliseProfile(raw: any): ProfileType | null {
    if (!raw) return null;

    const personalInfo = raw?.profile?.personal_info || raw?.profile || raw || {};

    const firstName = personalInfo?.first_name || raw?.firstName || '';
    const lastName = personalInfo?.last_name || raw?.lastName || '';
    const email = personalInfo?.email || raw?.email || '';
    const phone = personalInfo?.phone || raw?.phone || '';
    const city = personalInfo?.city || raw?.city || '';
    const country = personalInfo?.country || raw?.country || '';
    const headline = personalInfo?.headline || raw?.headline || '';
    const summary = personalInfo?.summary || raw?.summary || '';
    const dateOfBirth = personalInfo?.date_of_birth || raw?.dateOfBirth || null;
    const profilePhotoUrl = personalInfo?.profile_photo_url || raw?.profilePhotoUrl || '';

    const rawSkills = raw?.skills || raw?.profile?.skills || [];
    const skills = rawSkills.map((skill: any) => extractSkillName(skill)).filter(Boolean);

    const skillDetails = rawSkills.map((skill: any) => ({
      name: extractSkillName(skill),
      proficiency_level: skill?.proficiency_level || skill?.proficiencyLevel || 3,
      proficiency_label: skill?.proficiency_label || skill?.proficiencyLabel || 'Advanced',
    })).filter((s: any) => s.name);

    const rawEducation = raw?.education || [];
    const education = rawEducation.map((edu: any) => ({
      id: edu?.id,
      institution: edu?.institution || '',
      degree: edu?.degree || '',
      field_of_study: edu?.field_of_study || edu?.fieldOfStudy || '',
      start_date: edu?.start_date || edu?.startDate,
      end_date: edu?.end_date || edu?.endDate,
      is_current: edu?.is_current || edu?.isCurrent || false,
      grade: edu?.grade || '',
      description: edu?.description || '',
    }));

    const rawWork = raw?.workExperience || raw?.work_experience || [];
    const workExperience = rawWork.map((exp: any) => ({
      id: exp?.id,
      company: exp?.company || '',
      title: exp?.title || '',
      employment_type: exp?.employment_type || exp?.employmentType || 'full-time',
      location: exp?.location || '',
      start_date: exp?.start_date || exp?.startDate,
      end_date: exp?.end_date || exp?.endDate,
      is_current: exp?.is_current || exp?.isCurrent || false,
      description: exp?.description || '',
      achievements: exp?.achievements || [],
      skills: exp?.skills || [],
    }));

    const rawResumes = raw?.resumes || [];
    const resumes = rawResumes.map((resume: any) => ({
      id: resume?.id,
      file_name: resume?.file_name || resume?.fileName || '',
      file_url: resume?.file_url || resume?.fileUrl || '',
      is_primary: resume?.is_primary || resume?.isPrimary || false,
    }));

    const languages = raw?.profile?.languages || raw?.languages || [];
    const portfolioLinks = raw?.portfolio_links || raw?.portfolioLinks || [];

    return {
      firstName, lastName, email, phone, city, country, headline, summary,
      dateOfBirth, profilePhotoUrl,
      skills, skillDetails,
      education, workExperience,
      resumes, languages, portfolioLinks
    };
  }

  function extractSkillName(skill: any): string {
    if (!skill) return '';
    if (typeof skill === 'string') return skill;
    if (typeof skill === 'object') {
      return skill.skill_name || skill.name || skill.skillName || skill.title || '';
    }
    return '';
  }

  function safeStr(value: any, fallback: string = 'Not specified'): string {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return 'Present';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  function formatFullDate(dateString: string | null): string {
    if (!dateString) return 'Not specified';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function calculateExperienceYears(workExperiences: any[] | undefined): number {
    if (!workExperiences || workExperiences.length === 0) return 0;
    let totalYears = 0;
    workExperiences.forEach(exp => {
      if (exp && exp.start_date) {
        try {
          const start = new Date(exp.start_date);
          const end = exp.is_current ? new Date() : (exp.end_date ? new Date(exp.end_date) : new Date());
          const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (years > 0) totalYears += years;
        } catch (e) {
          console.error('Error calculating experience years:', e);
        }
      }
    });
    return Math.round(totalYears * 10) / 10;
  }

  function getDocumentType(documentName: string): string {
    const lowerName = documentName.toLowerCase();
    if (lowerName.includes('resume') || lowerName.includes('cv')) return 'resume';
    if (lowerName.includes('cover')) return 'cover_letter';
    if (lowerName.includes('portfolio')) return 'portfolio';
    if (lowerName.includes('certificate') || lowerName.includes('cert')) return 'certificate';
    return 'resume';
  }

  // ─── HANDLERS ────────────────────────────────────────────────
  const handleAnswerChange = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors(prev => ({ ...prev, [questionId]: null }));
  };

  const handleFileUpload = (docIndex: number, file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name} exceeds 5 MB limit`);
      return;
    }
    setUploadProgress(prev => ({ ...prev, [docIndex]: 0 }));
    const reader = new FileReader();
    reader.onloadend = () => {
      setDocuments(prev => {
        const newDocs = [...prev];
        newDocs[docIndex] = {
          id: Date.now() + Math.random(),
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          preview: reader.result as string,
          documentType: documentTemplates[docIndex]?.name || '',
          uploaded: true,
        };
        return newDocs;
      });
      setUploadProgress(prev => ({ ...prev, [docIndex]: 100 }));
    };
    reader.readAsDataURL(file);
  };

  const removeDocument = (docIndex: number) => {
    setDocuments(prev => {
      const newDocs = [...prev];
      newDocs[docIndex] = null;
      return newDocs;
    });
    setUploadProgress(prev => ({ ...prev, [docIndex]: 0 }));
  };

  const validateStep = (): boolean => {
    const newErrors: ErrorsType = {};
    if (currentStep === 3 && screeningQuestions.length > 0) {
      screeningQuestions.forEach((q: any, idx: number) => {
        if (q.required && (!answers[idx] || String(answers[idx]).trim() === '')) {
          newErrors[idx] = 'This question requires an answer';
        }
      });
    }
    if (currentStep === 4) {
      documentTemplates.forEach((doc, idx) => {
        if (doc.required && !documents[idx]) {
          newErrors[`doc_${idx}`] = `${doc.name} is required`;
        }
      });
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => { if (validateStep()) setCurrentStep(prev => prev + 1); };
  const handlePrevious = () => setCurrentStep(prev => prev - 1);
  const handleReview = () => { if (validateStep()) setReviewMode(true); };
  const handleBackFromReview = () => setReviewMode(false);

  // ─── DOCUMENT TEMPLATES ──────────────────────────────────────
  // Normalize the job's configured documents (strings OR { name, is_required }).
  const documentTemplates = (requiredDocuments || []).map((doc: any) => {
    const name: string = typeof doc === 'string' ? doc : (doc?.name || 'Document');
    // A plain string means the caller didn't specify — only Resume is
    // genuinely universal; everything else (Cover Letter, etc.) defaults to
    // optional rather than being silently marked required for every job.
    const required: boolean = typeof doc === 'string' ? name === 'Resume' : (doc?.is_required !== false);
    return {
      name,
      required,
      acceptedTypes: ['.pdf', '.doc', '.docx'],
      maxSize: 5 * 1024 * 1024,
      description: name === 'Resume' ? 'Upload your CV/Resume (PDF, DOC, DOCX)' :
        name === 'Cover Letter' ? 'Upload your cover letter' :
          `Upload your ${name.toLowerCase()}`,
    };
  });

  // ─── EFFECTS ──────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setAnswers({});
      // Pre-attach the candidate's existing primary resume so they don't re-upload it.
      const resumes: any[] = candidateProfileProp?.resumes || candidateProfileProp?.profile?.resumes || [];
      const primaryResume = resumes.find((r: any) => r.is_primary) || resumes[0];
      const initialDocs = documentTemplates.map((tpl: any) => {
        if (primaryResume && getDocumentType(tpl.name) === 'resume') {
          return {
            id: 'profile-resume',
            name: primaryResume.file_name || 'Resume',
            size: primaryResume.file_size || 0,
            type: primaryResume.mime_type || 'application/pdf',
            preview: primaryResume.file_url || '',
            documentType: tpl.name,
            uploaded: true,
            fromProfile: true,
          } as any;
        }
        return null;
      });
      setDocuments(initialDocs);
      setErrors({});
      setReviewMode(false);
      setSuccessMessage(null);
      setUploadProgress({});
      setSubmissionResponse(null);
      setShowSimulationPrompt(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ============================================
  // STEP 1: COMPLETE CANDIDATE PROFILE
  // ============================================
  const renderStep1 = () => {
    if (!profile) {
      return (
        <div className="text-center py-8 text-gray-500">
          <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Profile data not available. Please complete your profile first.</p>
          <button
            onClick={() => window.location.href = '/dashboard?view=profile'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Profile
          </button>
        </div>
      );
    }

    const totalExperience = calculateExperienceYears(profile.workExperience);
    const skillsToShow = showAllSkills ? profile.skills || [] : (profile.skills || []).slice(0, 10);
    const educationToShow = showAllEducation ? profile.education || [] : (profile.education || []).slice(0, 3);
    const experienceToShow = showAllExperience ? profile.workExperience || [] : (profile.workExperience || []).slice(0, 3);

    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Your Profile Summary
          </h2>
          <p className="text-sm text-gray-500">Review your information before applying</p>
        </div>

        {/* Personal Info */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Personal Information
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Name:</span> <span className="font-medium">{profile.firstName} {profile.lastName}</span></div>
            <div><span className="text-gray-500">Email:</span> <span className="font-medium">{profile.email || 'Not provided'}</span></div>
            <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{profile.phone || 'Not provided'}</span></div>
            <div><span className="text-gray-500">Location:</span> <span className="font-medium">{profile.city && profile.country ? `${profile.city}, ${profile.country}` : (profile.city || profile.country || 'Not provided')}</span></div>
            <div><span className="text-gray-500">Headline:</span> <span className="font-medium">{profile.headline || 'Not provided'}</span></div>
            <div><span className="text-gray-500">Total Experience:</span> <span className="font-medium">{totalExperience} years</span></div>
          </div>
          {profile.summary && (
            <div className="mt-3 pt-3 border-t border-blue-100">
              <span className="text-gray-500 text-sm">Summary:</span>
              <p className="text-sm text-gray-700 mt-1 line-clamp-3">{profile.summary}</p>
            </div>
          )}
        </div>

        {/* Skills */}
        {profile.skills && profile.skills.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-600" />
              Your Skills ({profile.skills.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {skillsToShow.map((skillName: string, idx: number) => {
                const skillDetail = profile.skillDetails?.find(s => s.name === skillName);
                return (
                  <span key={idx} className={`px-3 py-1.5 text-sm rounded-full ${(skillDetail?.proficiency_level ?? 3) >= 4 ? 'bg-green-100 text-green-800 border border-green-300' :
                    (skillDetail?.proficiency_level ?? 3) >= 3 ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                      'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                    {skillName}
                    {(skillDetail?.proficiency_level ?? 3) >= 4 && <Star className="w-3 h-3 inline ml-1 text-green-600" />}
                  </span>
                );
              })}
            </div>
            {profile.skills.length > 10 && (
              <button onClick={() => setShowAllSkills(!showAllSkills)} className="text-xs text-blue-600 hover:underline mt-3">
                {showAllSkills ? 'Show less' : `Show all ${profile.skills.length} skills`}
              </button>
            )}
          </div>
        )}

        {/* Work Experience */}
        {profile.workExperience && profile.workExperience.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              Work Experience ({profile.workExperience.length})
            </h3>
            {experienceToShow.map((exp: any, idx: number) => (
              <div key={idx} className="mb-4 last:mb-0 pb-3 last:pb-0 border-b last:border-b-0 border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{exp.title || 'Position not specified'}</p>
                    <p className="text-gray-600 text-sm">{exp.company || 'Company not specified'}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(exp.start_date)} – {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                  </span>
                </div>
                {exp.description && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{exp.description}</p>}
              </div>
            ))}
            {profile.workExperience.length > 3 && (
              <button onClick={() => setShowAllExperience(!showAllExperience)} className="text-xs text-blue-600 hover:underline mt-2">
                {showAllExperience ? 'Show less' : `Show all ${profile.workExperience.length} positions`}
              </button>
            )}
          </div>
        )}

        {/* Education */}
        {profile.education && profile.education.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              Education ({profile.education.length})
            </h3>
            {educationToShow.map((edu: any, idx: number) => (
              <div key={idx} className="mb-3 last:mb-0 pb-2 last:pb-0 border-b last:border-b-0 border-gray-200">
                <p className="font-semibold text-gray-900">
                  {edu.degree || 'Degree not specified'}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                </p>
                <p className="text-gray-600 text-sm">{edu.institution || 'Institution not specified'}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">
                    {formatDate(edu.start_date)} – {edu.is_current ? 'Present' : formatDate(edu.end_date)}
                  </span>
                  {edu.grade && <span className="text-xs text-gray-500">Grade: {edu.grade}</span>}
                </div>
              </div>
            ))}
            {profile.education.length > 3 && (
              <button onClick={() => setShowAllEducation(!showAllEducation)} className="text-xs text-blue-600 hover:underline mt-2">
                {showAllEducation ? 'Show less' : `Show all ${profile.education.length} education entries`}
              </button>
            )}
          </div>
        )}

        {/* Languages */}
        {profile.languages && profile.languages.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Languages
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.languages.map((lang: any, idx: number) => (
                <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">
                  {typeof lang === 'string' ? lang : lang.name || 'Language'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio Links */}
        {profile.portfolioLinks && profile.portfolioLinks.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Link className="w-4 h-4 text-blue-600" />
              Portfolio & Links
            </h3>
            <div className="space-y-2">
              {profile.portfolioLinks.slice(0, 5).map((link: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2">
                  {link.platform === 'github' && <Github className="w-4 h-4 text-gray-600" />}
                  {link.platform === 'linkedin' && <Linkedin className="w-4 h-4 text-blue-600" />}
                  {(!link.platform || link.platform === 'personal') && <Link className="w-4 h-4 text-gray-600" />}
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate">
                    {link.title || link.url}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // STEP 2: JOB DETAILS WITH MATCH INFO
  // ============================================
  const renderStep2 = () => {
    const jobTitle = job.title || job.job_title;
    const companyName = job.company_name || job.companyName || job.company?.name;
    const location = job.location || (job.locations?.[0]?.city) || 'Remote';
    const salaryRange = job.salary_range || (job.salary_min && job.salary_max ? `${job.salary_currency || 'USD'} ${job.salary_min?.toLocaleString()} - ${job.salary_max?.toLocaleString()}` : 'Competitive');
    const jobType = job.job_type || job.jobType;
    const workArrangement = job.work_arrangement || job.workArrangement;
    const description = job.description;
    const requirements = job.requirements || [];
    const responsibilities = job.responsibilities || [];
    const benefits = job.benefits || [];
    const skillsRequired = job.skills_required || job.skillsRequired || [];
    const tags = job.tags || [];
    const publishedAt = job.published_at || job.publishedAt;
    const expiresAt = job.expires_at || job.expiresAt;
    const postedDate = publishedAt ? formatFullDate(publishedAt) : 'Recently';
    const companyLogo = job.company_logo || job.companyLogo || job.company?.logo_url;
    const companyIndustry = job.company_industry || job.companyIndustry || job.company?.industry;
    const companySize = job.company_size || job.companySize || job.company?.size;
    const applicationCount = job.application_count || job.applications || 0;

    const criteria = matchDetails?.criteria_scores || {};
    const skillsBD = matchDetails?.skills_breakdown || {};
    // Behavior/Collaborative/Freshness/Popularity/Business-rules breakdown —
    // null when score_source is "matcher-only" (hybrid had no data for this job).
    const hybridDetail = matchDetails?.hybrid_detail || null;

    const skillsMatchScore = criteria.skills_match ?? 0;
    const qualsMatchScore = criteria.qualifications_match ?? 0;
    const expMatchScore = criteria.experience_match ?? 0;
    const prefsMatchScore = criteria.preferences_match ?? 0;
    // Only real when the profile matcher actually scored this job
    // (score_source "matcher+hybrid"/"matcher-only") — for "hybrid-only"
    // jobs criteria_scores is null, so 0% here would misleadingly sit next
    // to a real, non-zero total score from the hybrid recommender alone.
    const hasBreakdown = criteria.skills_match != null || criteria.qualifications_match != null;
    const ringColor = matchScore >= 80 ? '#22c55e' : matchScore >= 60 ? '#3b82f6' : matchScore >= 40 ? '#f59e0b' : '#ef4444';

    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Job Details & Match Analysis
          </h2>
        </div>

        {/* Job Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-5">
          <div className="flex items-start gap-4">
            {companyLogo ? (
              <img src={companyLogo} alt={companyName} className="w-16 h-16 rounded-lg object-cover" />
            ) : (
              <Building2 className="w-16 h-16 text-gray-400" />
            )}
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900">{jobTitle}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-gray-700">{companyName}</span>
                {companyIndustry && <span className="text-xs text-gray-500">• {companyIndustry}</span>}
                {companySize && <span className="text-xs text-gray-500">• {companySize}</span>}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-sm">
                <span className="flex items-center gap-1 text-gray-600"><MapPin className="w-4 h-4" />{location}</span>
                <span className="flex items-center gap-1 text-gray-600"><DollarSign className="w-4 h-4" />{salaryRange}</span>
                <span className="flex items-center gap-1 text-gray-600"><Briefcase className="w-4 h-4" />{jobType} • {workArrangement}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Match Score Card */}
        {matchScore > 0 && (
          <div className={`p-4 rounded-xl ${matchScore >= 80 ? 'bg-green-50 border border-green-200' : matchScore >= 70 ? 'bg-blue-50 border border-blue-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${matchScore >= 80 ? 'bg-green-200' : matchScore >= 70 ? 'bg-blue-200' : 'bg-yellow-200'}`}>
                <Target className={`w-7 h-7 ${matchScore >= 80 ? 'text-green-600' : matchScore >= 70 ? 'text-blue-600' : 'text-yellow-600'}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg">AI Match Score: {Math.round(matchScore)}%</h3>
                <p className="text-sm">
                  {matchScore >= 90 ? '🏆 Excellent match! You are highly qualified.' :
                    matchScore >= 80 ? '✅ Great match! You meet most requirements.' :
                      matchScore >= 70 ? '📈 Good match. You meet the minimum requirements.' :
                        '⚠️ Low match. Consider updating your profile.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4-Factor Score Breakdown — mirrors JobViewModal.tsx exactly (same
            FactorRow weighted score × weight = pts math and total-score
            line), so the numbers a candidate sees while viewing a job match
            what they see while applying to it. Only shown when the profile
            matcher actually scored this job. */}
        {matchScore > 0 && hasBreakdown && (
          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Target size={15} className="text-blue-600" /> 4-Factor Score Breakdown
            </h3>
            <FactorRow label="🔧 Skills"          score={skillsMatchScore} weight="40%" pts={skillsMatchScore * 0.40} colour="bg-green-500" />
            <FactorRow label="🎓 Qualifications"  score={qualsMatchScore}  weight="25%" pts={qualsMatchScore  * 0.25} colour="bg-blue-500" />
            <FactorRow label="📅 Experience"      score={expMatchScore}    weight="20%" pts={expMatchScore    * 0.20} colour="bg-purple-500" />
            <FactorRow label="⚙️ Preferences"     score={prefsMatchScore}  weight="15%" pts={prefsMatchScore  * 0.15} colour="bg-yellow-500" />
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
        )}

        {/* Hybrid Recommendation Signals — Behavior/Collaborative/Freshness/
            Popularity/Business rules from hybrid_job_recommender.py. Absent
            (null) when score_source is "matcher-only", i.e. hybrid had no
            data for this job. */}
        {hybridDetail && (
          <div className="bg-indigo-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Hybrid Recommendation Signals
            </h4>
            <div className="space-y-3">
              {/* Behavior */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3 text-indigo-600" /> Behavior</span>
                  <span className="font-semibold">
                    {hybridDetail.behavior.content_similarity_score != null
                      ? `${Math.round(hybridDetail.behavior.content_similarity_score * 100)}%`
                      : 'No history yet'}
                  </span>
                </div>
                {hybridDetail.behavior.content_similarity_score != null && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${hybridDetail.behavior.content_similarity_score * 100}%` }} />
                  </div>
                )}
                {hybridDetail.behavior.matched_attributes.length > 0 && (
                  <p className="text-xs text-indigo-600 mt-1">
                    ✓ Matches your usual {hybridDetail.behavior.matched_attributes.slice(0, 3).map(a => a.value).join(', ')}
                  </p>
                )}
                {hybridDetail.behavior.top_interacted_jobs.length > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Similar to jobs you engaged with: {hybridDetail.behavior.top_interacted_jobs.slice(0, 2).map(j => j.title).join(', ')}
                  </p>
                )}
                {hybridDetail.behavior.has_search_history && (
                  <p className="text-xs text-gray-500 mt-0.5">Matches terms you've searched for.</p>
                )}
              </div>

              {/* Collaborative */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3 text-pink-600" /> Collaborative</span>
                  <span className="font-semibold">
                    {hybridDetail.collaborative.has_learned_embedding
                      ? `${Math.round(hybridDetail.collaborative.raw_score * 100)}%`
                      : 'No history yet'}
                  </span>
                </div>
                {hybridDetail.collaborative.has_learned_embedding && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-pink-500 h-2 rounded-full transition-all duration-500" style={{ width: `${hybridDetail.collaborative.raw_score * 100}%` }} />
                  </div>
                )}
                {hybridDetail.collaborative.similar_candidates_engaged && (
                  <p className="text-xs text-pink-600 mt-1">✓ Candidates with similar interests engaged with this job.</p>
                )}
              </div>

              {/* Freshness & Popularity */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <span className="flex items-center gap-1 text-xs mb-1"><Clock className="w-3 h-3 text-teal-600" /> Freshness</span>
                  <p className="text-xs text-gray-600">
                    {hybridDetail.freshness.days_old != null ? `Posted ${hybridDetail.freshness.days_old.toFixed(0)} day(s) ago` : 'Unknown'}
                  </p>
                </div>
                <div className="flex-1">
                  <span className="flex items-center gap-1 text-xs mb-1"><TrendingUp className="w-3 h-3 text-orange-600" /> Popularity</span>
                  <p className="text-xs text-gray-600">
                    {hybridDetail.popularity.application_count} application(s), {hybridDetail.popularity.view_count} view(s)
                  </p>
                </div>
              </div>

              {/* Business rules */}
              {hybridDetail.business_rules.reasons.length > 0 && (
                <div>
                  <span className="flex items-center gap-1 text-xs mb-1"><Shield className="w-3 h-3 text-green-700" /> Business rules</span>
                  {hybridDetail.business_rules.reasons.map((r, idx) => (
                    <p key={idx} className="text-xs text-green-700">✓ {r}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Required Skills */}
        {skillsRequired.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-600" />
              Required Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {skillsRequired.map((skill: any, idx: number) => {
                const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill_name;
                const matchedSkillsList = skillsBD.matched_skills || [];
                const isMatched = matchedSkillsList.some((ms: string) =>
                  ms.toLowerCase() === skillName.toLowerCase() ||
                  skillName.toLowerCase().includes(ms.toLowerCase()) ||
                  ms.toLowerCase().includes(skillName.toLowerCase())
                );
                return (
                  <span key={idx} className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1 ${isMatched ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {skillName}
                    {isMatched ? <CheckCircle className="w-3 h-3 text-green-600" /> : <X className="w-3 h-3 text-red-500" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Missing Skills Warning */}
        {skillsBD.missing_skills && skillsBD.missing_skills.length > 0 && (
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-sm text-yellow-800 font-medium mb-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Skills you're missing ({skillsBD.missing_skills.length}):
            </p>
            <div className="flex flex-wrap gap-1">
              {skillsBD.missing_skills.slice(0, 5).map((skill: string, idx: number) => (
                <span key={idx} className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{skill}</span>
              ))}
              {skillsBD.missing_skills.length > 5 && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">+{skillsBD.missing_skills.length - 5} more</span>
              )}
            </div>
          </div>
        )}

        {/* Job Description */}
        {description && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Job Description</h3>
            <div className="text-gray-700 text-sm whitespace-pre-wrap line-clamp-4">{description}</div>
          </div>
        )}

        {/* Key Responsibilities */}
        {responsibilities.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Key Responsibilities ({responsibilities.length})
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {responsibilities.slice(0, 5).map((resp: string, idx: number) => (
                <li key={idx} className="text-sm">{resp}</li>
              ))}
              {responsibilities.length > 5 && <li className="text-gray-400 text-sm">+{responsibilities.length - 5} more</li>}
            </ul>
          </div>
        )}

        {/* Benefits */}
        {benefits.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-600" />
              Benefits & Perks
            </h3>
            <div className="flex flex-wrap gap-2">
              {benefits.slice(0, 6).map((benefit: string, idx: number) => (
                <span key={idx} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">{benefit}</span>
              ))}
              {benefits.length > 6 && <span className="text-xs text-gray-400">+{benefits.length - 6} more</span>}
            </div>
          </div>
        )}

        {/* Meta Info */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
          <div>
            <p className="text-xs text-gray-500">Posted on</p>
            <p className="text-sm font-medium">{postedDate}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Applications close</p>
            <p className="text-sm font-medium">{expiresAt ? formatFullDate(expiresAt) : 'Not specified'}</p>
          </div>
          {applicationCount > 0 && (
            <div>
              <p className="text-xs text-gray-500">Applicants</p>
              <p className="text-sm font-medium">{applicationCount}</p>
            </div>
          )}
          {job.department && (
            <div>
              <p className="text-xs text-gray-500">Department</p>
              <p className="text-sm font-medium">{job.department}</p>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: string, idx: number) => (
                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">#{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // STEP 3: SCREENING QUESTIONS
  // ============================================
  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-blue-600" />
          Screening Questions
        </h2>
        <p className="text-sm text-gray-500">Please answer these questions carefully</p>
      </div>

      {screeningQuestions.length > 0 ? (
        screeningQuestions.map((q: any, idx: number) => (
          <div key={idx} className="space-y-2">
            <label className="font-medium text-gray-700">
              {safeStr(q.question || q.text)}
              {q.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {q.type === 'text' && (
              <textarea
                value={answers[idx] || ''}
                onChange={(e) => handleAnswerChange(idx, e.target.value)}
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors[idx] ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Type your answer here..."
              />
            )}

            {q.type === 'number' && (
              <input
                type="number"
                value={answers[idx] || ''}
                onChange={(e) => handleAnswerChange(idx, e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${errors[idx] ? 'border-red-500' : 'border-gray-300'}`}
                placeholder="Enter number..."
              />
            )}

            {q.type === 'yes_no' && (
              <div className="flex gap-4">
                {['Yes', 'No'].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`q-${idx}`} value={opt} checked={answers[idx] === opt} onChange={(e) => handleAnswerChange(idx, e.target.value)} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === 'multiple_choice' && q.options?.length > 0 && (
              <div className="flex flex-col gap-2">
                {q.options.map((opt: string, oIdx: number) => (
                  <label key={oIdx} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`q-${idx}`} value={safeStr(opt)} checked={answers[idx] === safeStr(opt)} onChange={(e) => handleAnswerChange(idx, e.target.value)} />
                    <span>{safeStr(opt)}</span>
                  </label>
                ))}
              </div>
            )}

            {errors[idx] && <p className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors[idx]}</p>}
          </div>
        ))
      ) : (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <p>No screening questions for this position</p>
        </div>
      )}
    </div>
  );

  // ============================================
  // STEP 4: DOCUMENTS
  // ============================================
  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Required Documents
        </h2>
        <p className="text-sm text-gray-500">Upload the following documents (Max 5 MB each, PDF, DOC, DOCX)</p>
      </div>

      {documentTemplates.map((doc, idx) => (
        <div key={idx} className="border rounded-lg p-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{doc.name}</h3>
              <p className="text-sm text-gray-500">{doc.description}</p>
              {doc.required
                ? <span className="text-xs text-red-500">Required</span>
                : <span className="text-xs text-gray-400">Optional</span>}
            </div>
            {documents[idx] ? (
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600 truncate max-w-[150px]">{documents[idx]?.name}</span>
                {(documents[idx] as any)?.fromProfile && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">From your profile</span>
                )}
                <label className="cursor-pointer text-xs text-blue-600 hover:underline">
                  Replace
                  <input type="file" accept={doc.acceptedTypes.join(',')} onChange={(e) => e.target.files?.[0] && handleFileUpload(idx, e.target.files[0])} className="hidden" />
                </label>
                <button onClick={() => removeDocument(idx)} className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="cursor-pointer px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload
                <input type="file" accept={doc.acceptedTypes.join(',')} onChange={(e) => e.target.files?.[0] && handleFileUpload(idx, e.target.files[0])} className="hidden" />
              </label>
            )}
          </div>
          {uploadProgress[idx] > 0 && uploadProgress[idx] < 100 && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1">
                <div className="bg-blue-600 h-1 rounded-full" style={{ width: `${uploadProgress[idx]}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">Uploading... {uploadProgress[idx]}%</p>
            </div>
          )}
          {errors[`doc_${idx}`] && <p className="text-red-500 text-sm mt-2">{errors[`doc_${idx}`]}</p>}
        </div>
      ))}
    </div>
  );

  // ============================================
  // REVIEW SCREEN
  // ============================================
  const renderReview = () => (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          Review Your Application
        </h2>
        <p className="text-sm text-gray-500">Please review all information before submitting</p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><User className="w-4 h-4" /> Your Information</h3>
        {profile ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p><span className="text-gray-500">Name:</span> {profile.firstName} {profile.lastName}</p>
            <p><span className="text-gray-500">Email:</span> {profile.email || 'Not provided'}</p>
            <p><span className="text-gray-500">Location:</span> {profile.city}, {profile.country}</p>
            <p><span className="text-gray-500">Experience:</span> {profile.workExperience.length} positions</p>
          </div>
        ) : <p className="text-sm text-gray-500">Profile data not available</p>}
      </div>

      {profile?.skills && profile.skills.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Your Skills</h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.slice(0, 10).map((skill: string, idx: number) => (
              <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><Briefcase className="w-4 h-4" /> Job Details</h3>
        <p><span className="text-gray-500">Position:</span> {job.title}</p>
        <p><span className="text-gray-500">Company:</span> {job.company_name}</p>
        <p><span className="text-gray-500">Match Score:</span> <strong className="text-blue-600">{Math.round(matchScore)}%</strong></p>
      </div>

      {screeningQuestions.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Your Answers</h3>
          {screeningQuestions.slice(0, 3).map((q: any, idx: number) => (
            <div key={idx} className="mb-2">
              <p className="text-sm font-medium">{safeStr(q.question || q.text)}</p>
              <p className="text-sm text-gray-700 ml-2">Answer: {answers[idx] || <em className="text-gray-400">Not answered</em>}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Uploaded Documents</h3>
        {documentTemplates.map((doc, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm py-1">
            {documents[idx] ? <Check className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
            <span className={documents[idx] ? 'text-gray-800' : 'text-red-600'}>
              {doc.name} {documents[idx] ? `— ${documents[idx]?.name}` : '— Not uploaded'}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
        <p className="text-sm text-yellow-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          By submitting this application, you confirm that all information provided is accurate and complete.
        </p>
      </div>
    </div>
  );

  // ============================================
  // HANDLE SUBMIT
  // ============================================
  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);

    try {
      const formattedDocuments = documentTemplates.map((doc, idx) => {
        const uploadedDoc = documents[idx];
        return {
          name: doc.name,
          url: uploadedDoc?.preview || '',
          type: getDocumentType(doc.name) as 'resume' | 'cover_letter' | 'portfolio' | 'certificate'
        };
      }).filter(doc => doc.url);

      const applicationData = {
        jobId: job.id,
        additionalInfo: {
          screeningAnswers: answers,
          documents: formattedDocuments,
          matchScore: Math.round(matchScore),
          submittedAt: new Date().toISOString(),
        },
      };

      console.log('📤 Submitting application:', applicationData);
      const result = await submitApplication(applicationData);
      console.log('📥 Submit response:', result);

      if (result?.success) {
        const responseData = result.data as any;
        console.log('📊 Response data:', responseData);

        // ✅ Always show success message first
        setSuccessMessage('✅ Application submitted successfully!');

        // ✅ Store the full response
        setSubmissionResponse(responseData);

        // ✅ Check using simulationTemplates fields only
        const hasAnySimulation =
          responseData?.hasSimulationTemplates === true ||
          (Array.isArray(responseData?.simulationTemplates) && responseData.simulationTemplates.length > 0) ||
          (responseData?.totalTemplates && responseData.totalTemplates > 0);

        console.log('🎯 Has any simulation:', hasAnySimulation);

        // Always switch to the "next steps" screen. It shows the simulation details
        // when the job has one, or a "no simulation yet — you'll be notified" notice.
        console.log('🎯 Showing next-steps screen, hasSimulation =', hasAnySimulation);
        setShowSimulationPrompt(true);

        if (onSuccess) {
          onSuccess({
            applicationId: responseData?.applicationId,
            hasSimulation: hasAnySimulation,
            simulationInfo: hasAnySimulation ? {
              simulationTemplates: responseData.simulationTemplates || [],
              totalTemplates: responseData.totalTemplates || 0,
              hasSimulationTemplates: responseData.hasSimulationTemplates,
              nextStep: responseData.nextStep || 'view_simulations',
              message: responseData.message,
              action: responseData.action || null,
            } : null
          });
        }
      } else {
        throw new Error(result?.message || 'Failed to submit application');
      }
    } catch (error: any) {
      console.error('Submission error:', error);
      setSuccessMessage(null);
      alert('Failed to submit application: ' + (error?.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // SIMULATION INFO RENDERER - Navigate to /simulations/my
  // ============================================
  const renderSimulationInfo = () => {
    console.log('🔍 Rendering simulation info:', submissionResponse);

    if (!submissionResponse) return null;

    const simulationTemplates: any[] = submissionResponse?.simulationTemplates || [];
    const totalTemplates: number = submissionResponse?.totalTemplates || 0;
    const hasSimulationTemplates: boolean = submissionResponse?.hasSimulationTemplates || false;
    const action = submissionResponse?.action || null;
    const message: string = submissionResponse?.message || '';
    const applicationId: string = submissionResponse?.applicationId || '';

    const hasAnySimulation =
      hasSimulationTemplates ||
      simulationTemplates.length > 0 ||
      totalTemplates > 0;

    // No simulation set for this job yet → reassure the candidate they'll be notified.
    if (!hasAnySimulation) {
      return (
        <div className="text-center py-8 max-w-lg mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Application submitted! 🎉</h3>
          <p className="text-gray-600 mb-4">
            This job doesn&apos;t have a job practical assessment yet. <strong>As soon as the recruiter sets one,
            you&apos;ll be notified</strong> and it will appear under <em>My Practical Assessments</em>.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mb-6 text-left">
            💡 Tip: keep your profile up to date so you&apos;re ready the moment the practical assessment goes live.
          </div>
          <button
            onClick={() => { setShowSimulationPrompt(false); onClose(); }}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      );
    }

    // Helper to format date
    const formatAvailabilityDate = (dateStr: string | null | undefined): string => {
      if (!dateStr) return 'Not specified';
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Invalid date';
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch {
        return 'Invalid date';
      }
    };

    // Helper to format time
    const formatTime = (timeStr: string): string => {
      if (!timeStr) return 'Not specified';
      try {
        const [hours, minutes] = timeStr.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
      } catch {
        return timeStr;
      }
    };

    // Check if simulation is currently available
    const isSimulationAvailable = (availability: any): { available: boolean; message: string } => {
      if (!availability) return { available: true, message: 'Always available' };

      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      // Check start date
      if (availability.startDate) {
        const startDate = new Date(availability.startDate);
        if (now < startDate) {
          return {
            available: false,
            message: `📅 Available from ${formatAvailabilityDate(availability.startDate)}`
          };
        }
      }

      // Check end date
      if (availability.endDate) {
        const endDate = new Date(availability.endDate);
        if (now > endDate) {
          return {
            available: false,
            message: `❌ This practical assessment expired on ${formatAvailabilityDate(availability.endDate)}`
          };
        }
      }

      // Check daily windows
      if (availability.dailyWindows && availability.dailyWindows.length > 0) {
        const todayWindows = availability.dailyWindows.filter((w: any) => w.dayOfWeek === currentDay && w.enabled !== false);

        if (todayWindows.length === 0) {
          // Find next available day
          let daysToAdd = 1;
          let found = false;
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          let nextDayName = '';

          for (let i = 1; i <= 7; i++) {
            const checkDay = (currentDay + i) % 7;
            const hasWindow = availability.dailyWindows.some((w: any) => w.dayOfWeek === checkDay && w.enabled !== false);
            if (hasWindow) {
              nextDayName = days[checkDay];
              daysToAdd = i;
              found = true;
              break;
            }
          }

          if (found) {
            return {
              available: false,
              message: `📅 Next available: ${nextDayName} (in ${daysToAdd} day${daysToAdd > 1 ? 's' : ''})`
            };
          }
          return { available: false, message: '❌ No available time slots configured' };
        }

        // Check if current time is within any window
        let inWindow = false;
        let nextWindowTime: string | null = null;

        for (const window of todayWindows) {
          if (!window.enabled) continue;

          const startMinutes = window.startTime ?
            (parseInt(window.startTime.split(':')[0]) * 60 + parseInt(window.startTime.split(':')[1])) :
            9 * 60;
          const endMinutes = window.endTime ?
            (parseInt(window.endTime.split(':')[0]) * 60 + parseInt(window.endTime.split(':')[1])) :
            17 * 60;

          if (currentTime >= startMinutes && currentTime <= endMinutes) {
            inWindow = true;
            break;
          }

          if (currentTime < startMinutes) {
            if (!nextWindowTime || startMinutes < parseInt(nextWindowTime.split(':')[0]) * 60 + parseInt(nextWindowTime.split(':')[1])) {
              nextWindowTime = window.startTime;
            }
          }
        }

        if (!inWindow) {
          if (nextWindowTime) {
            return {
              available: false,
              message: `⏰ Available from ${formatTime(nextWindowTime)} today`
            };
          }
          return { available: false, message: '⏰ Outside of available hours' };
        }
      }

      return { available: true, message: '✅ Available now!' };
    };

    // Get availability info from metadata
    const getAvailabilityInfo = (metadata: any) => {
      if (!metadata?.availability) return null;
      const avail = metadata.availability;
      return {
        startDate: avail.startDate,
        endDate: avail.endDate,
        timezone: avail.timezone || 'UTC',
        dailyWindows: avail.dailyWindows || [],
        noticePeriod: avail.noticePeriod || 24,
        allowRescheduling: avail.allowRescheduling !== false,
        maxReschedules: avail.maxReschedules || 2,
        maxConcurrentCandidates: avail.maxConcurrentCandidates || 10
      };
    };

    // ✅ Get sorted daily windows
    const getSortedWindows = (windows: any[]) => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return windows
        .filter((w: any) => w.enabled !== false)
        .sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
        .map((w: any) => ({
          ...w,
          dayName: days[w.dayOfWeek] || `Day ${w.dayOfWeek}`
        }));
    };

    // ✅ Handle Start Simulation - Navigate to simulation view using onViewChange
    const handleStartSimulation = () => {
      console.log('🚀 Navigating to Job Simulation page');
      console.log('📋 Application ID:', applicationId);

      // ✅ Close the modal first
      setShowSimulationPrompt(false);
      onClose();

      // ✅ Then navigate using the onSuccess callback or directly
      // The modal is closed and the parent component (DashboardHome) 
      // will handle the view change via onSuccess
      if (onSuccess) {
        onSuccess({
          action: 'start-simulation',
          view: 'simulation',
          applicationId: applicationId
        });
      }
    };

    // ✅ Handle Close
    const handleClose = () => {
      console.log('🔒 Closing simulation prompt');
      setShowSimulationPrompt(false);
      onClose();
    };

    return (
      <div className="space-y-4">
        {/* Success message */}
        {successMessage && (
          <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <span className="font-semibold text-base">{successMessage}</span>
          </div>
        )}

        {/* Header Banner */}
        <div className="p-4 rounded-xl border-2 bg-blue-50 border-blue-300">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-blue-100">
              <Rocket className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-blue-800 text-base">🎯 Next Step: Complete the Practical Assessment</h4>
              <p className="text-sm mt-1 text-blue-700">
                {message || `This job requires ${totalTemplates} practical assessment${totalTemplates > 1 ? 's' : ''} to evaluate your skills.`}
              </p>
            </div>
          </div>
        </div>

        {/* Simulation Cards */}
        {simulationTemplates.length > 0 && (
          <div className="space-y-4">
            {simulationTemplates.map((sim: any) => {
              const availability = getAvailabilityInfo(sim.metadata);
              const availabilityStatus = availability ? isSimulationAvailable(availability) : { available: true, message: 'Always available' };
              const isAvailable = availabilityStatus.available;
              const sortedWindows = availability ? getSortedWindows(availability.dailyWindows) : [];

              return (
                <div key={sim.id} className={`bg-white rounded-xl border p-5 transition-shadow ${isAvailable ? 'border-green-300 hover:shadow-md' : 'border-gray-200'}`}>

                  {/* Simulation Name */}
                  <h4 className="font-bold text-gray-900 text-lg">{sim.name}</h4>

                  {/* Duration & Difficulty */}
                  <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" /> {sim.durationMinutes} minutes
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> {sim.difficulty || 'intermediate'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Code className="w-4 h-4" /> {sim.type || 'technical'}
                    </span>
                    {sim.tasks?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-4 h-4" /> {sim.tasks.length} tasks
                      </span>
                    )}
                  </div>

                  {/* Availability Status */}
                  <div className={`mt-4 p-4 rounded-lg border-2 ${isAvailable ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'
                    }`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full flex-shrink-0 ${isAvailable ? 'bg-green-200' : 'bg-yellow-200'
                        }`}>
                        {isAvailable ? (
                          <CheckCircle className="w-6 h-6 text-green-700" />
                        ) : (
                          <Clock className="w-6 h-6 text-yellow-700" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-base font-bold ${isAvailable ? 'text-green-800' : 'text-yellow-800'}`}>
                          {isAvailable ? '✅ Available Now!' : '⏳ Not Currently Available'}
                        </p>
                        <p className={`text-sm mt-1 ${isAvailable ? 'text-green-700' : 'text-yellow-700'}`}>
                          {availabilityStatus.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ✅ FULL AVAILABILITY DETAILS */}
                  {availability && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        Availability Schedule
                      </h5>

                      <div className="space-y-2 text-sm">
                        {/* Date Range */}
                        <div className="flex flex-wrap gap-4">
                          {availability.startDate && (
                            <span className="text-gray-600">
                              📅 From: <strong>{formatAvailabilityDate(availability.startDate)}</strong>
                            </span>
                          )}
                          {availability.endDate && (
                            <span className="text-gray-600">
                              📅 Until: <strong>{formatAvailabilityDate(availability.endDate)}</strong>
                            </span>
                          )}
                        </div>

                        {/* Timezone */}
                        {availability.timezone && (
                          <div className="text-gray-600">
                            🌐 Timezone: <strong>{availability.timezone}</strong>
                          </div>
                        )}

                        {/* ✅ ALL Daily Windows - Show ALL days */}
                        {sortedWindows.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-gray-500 mb-2">Daily Windows:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {sortedWindows.map((window: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-gray-200 text-sm">
                                  <span className="font-medium text-gray-700">{window.dayName}</span>
                                  <span className="text-gray-600">
                                    {window.startTime || '09:00'} - {window.endTime || '17:00'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Additional Info */}
                        <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap gap-3 text-xs text-gray-500">
                          {availability.noticePeriod && (
                            <span>⏰ Notice: {availability.noticePeriod}h required</span>
                          )}
                          {availability.allowRescheduling && (
                            <span>🔄 Rescheduling allowed ({availability.maxReschedules} max)</span>
                          )}
                          {availability.maxConcurrentCandidates && (
                            <span>👥 Max candidates: {availability.maxConcurrentCandidates}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ✅ Action Button - Navigate to /simulations/my */}
                  <div className="mt-5 flex justify-center">
                    {isAvailable ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartSimulation();
                        }}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-base font-semibold rounded-lg hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Play className="w-5 h-5" />
                        Start Practical Assessment
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClose();
                        }}
                        className="w-full py-3 bg-gray-200 text-gray-700 text-base font-semibold rounded-lg hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
                      >
                        <X className="w-5 h-5" />
                        Close - Not Available Yet
                      </button>
                    )}
                  </div>

                  {/* Tasks count note */}
                  {sim.tasks && sim.tasks.length > 0 && (
                    <div className="mt-3 text-center">
                      <span className="text-xs text-gray-400">
                        📋 {sim.tasks.length} task{sim.tasks.length > 1 ? 's' : ''} • {sim.scoringRubric?.passingScore || 70}% passing score
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Skip/Close button at bottom */}
        <button
          onClick={handleClose}
          className="w-full px-4 py-2.5 text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm transition-colors"
        >
          {simulationTemplates.some((sim: any) => {
            const availability = getAvailabilityInfo(sim.metadata);
            const status = availability ? isSimulationAvailable(availability) : { available: true };
            return status.available;
          }) ? 'Skip for now — I\'ll start later' : 'Close'}
        </button>
      </div>
    );
  };

  // ============================================
  // EARLY RETURNS — must come before main return
  // ============================================
  if (!isOpen || !job) return null;

  if (matchScore < 60 && matchScore > 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl max-w-md w-full m-4">
          <div className="border-b p-4 flex justify-between items-center">
            <h2 className="text-xl font-bold">Application Not Available</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          <div className="p-6 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <p className="text-gray-700 mb-4">
              Your match score is <strong className="text-red-600">{matchScore}%</strong>, which is below the required <strong className="text-blue-600">70%</strong> minimum.
            </p>
            <div className="bg-yellow-50 p-4 rounded-lg text-left mb-4">
              <h3 className="font-semibold text-yellow-800 mb-2">To improve your match:</h3>
              <ul className="space-y-1 text-sm text-yellow-700">
                <li>• Update your profile with more relevant skills</li>
                <li>• Add work experience in this field</li>
                <li>• Complete your education details</li>
                <li>• Add certifications and portfolio links</li>
              </ul>
            </div>
            <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER — single return
  // ============================================
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col m-4">

        {/* Header */}
        <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold">Apply for {safeStr(job.title)}</h2>
            <p className="text-xs text-gray-500">
              {showSimulationPrompt ? '📋 Application Submitted — Next Steps' :
                reviewMode ? 'Review & Submit' :
                  `Step ${currentStep} of ${totalSteps}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success message — shown when NOT in simulation prompt (e.g. no simulation case) */}
        {successMessage && !showSimulationPrompt && (
          <div className="mx-4 mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            <span className="font-semibold text-base">{successMessage}</span>
          </div>
        )}

        {/* Step Indicator */}
        {!reviewMode && !showSimulationPrompt && (
          <div className="px-6 pt-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === currentStep ? 'bg-blue-600 text-white' :
                    step < currentStep ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                    {step < currentStep ? <CheckCircle className="w-5 h-5" /> : step}
                  </div>
                  {step < 4 && <div className={`flex-1 h-1 mx-2 rounded ${step < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Profile</span><span>Job</span><span>Questions</span><span>Documents</span>
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {showSimulationPrompt ? (
            renderSimulationInfo()
          ) : reviewMode ? (
            renderReview()
          ) : (
            <>
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
            </>
          )}
        </div>

        {/* Footer — hidden when simulation prompt is shown */}
        {!showSimulationPrompt && (
          <div className="border-t p-4 flex justify-between flex-shrink-0">
            <div>
              {!reviewMode && currentStep > 1 && (
                <button onClick={handlePrevious} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4 inline mr-1" /> Back
                </button>
              )}
              {reviewMode && (
                <button onClick={handleBackFromReview} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4 inline mr-1" /> Edit Application
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50" disabled={submitting}>
                Cancel
              </button>
              {!reviewMode ? (
                currentStep < totalSteps ? (
                  <button onClick={handleNext} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={handleReview} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    Review Application <Eye className="w-4 h-4" />
                  </button>
                )
              ) : (
                <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50">
                  {submitting
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
                    : <><Send className="w-4 h-4" /> Submit Application</>
                  }
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default JobApplicationModal;