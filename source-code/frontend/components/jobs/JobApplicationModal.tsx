// JobApplicationModal.jsx - COMPLETE VERSION WITH PAGE RELOAD ON SUCCESS
import React, { useState, useEffect } from 'react';
import {
  X, CheckCircle, AlertCircle, Upload, FileText, User, Briefcase,
  MapPin, DollarSign, Calendar, Clock, Star, TrendingUp, Award, Shield,
  Send, ChevronRight, ChevronLeft, Plus, Trash2, Eye, Download,
  MessageSquare, HelpCircle, Building2, Info, AlertTriangle, Edit3,
  Check, ThumbsUp, ThumbsDown, Code, GraduationCap, Link, Globe,
  Twitter, Linkedin, Github, ExternalLink, Heart
} from 'lucide-react';
import { submitApplication } from '../../services/applicationAPI';

// ============================================
// COMPLETE PROFILE NORMALIZER - HANDLES ALL DATA SHAPES
// ============================================

const JobApplicationModal = ({
  isOpen,
  onClose,
  job,
  candidateProfile: candidateProfileProp,
  matchScore: matchScoreProp = 78.7,
  requiredDocuments = ['Resume', 'Cover Letter'],
  onSuccess, // NEW: Callback for successful submission
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [answers, setAnswers] = useState({});
  const [documents, setDocuments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [reviewMode, setReviewMode] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [showAllEducation, setShowAllEducation] = useState(false);
  const [showAllExperience, setShowAllExperience] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null); // NEW: Success message state

  // Normalize profile data - HANDLES ALL THREE SHAPES
  const profile = normaliseProfile(candidateProfileProp);
  const matchScore = matchScoreProp ?? 78.7;
  const screeningQuestions = job?.screening_questions || job?.screeningQuestions || [];
  const totalSteps = 4;

  // ─── COMPLETE PROFILE NORMALISER ─────────────────────────────────────────
  function normaliseProfile(raw) {
    if (!raw) return null;

    const personalInfo = 
      raw?.profile?.personal_info ||
      raw?.profile ||
      raw ||
      {};

    const firstName = personalInfo?.first_name || raw?.firstName || '';
    const lastName = personalInfo?.last_name || raw?.lastName || '';
    const email = personalInfo?.email || raw?.email || '';
    const phone = personalInfo?.phone || raw?.phone || '';
    const city = personalInfo?.city || raw?.city || '';
    const country = personalInfo?.country || raw?.country || '';
    const headline = personalInfo?.headline || raw?.headline || '';
    const summary = personalInfo?.summary || raw?.summary || '';
    const dateOfBirth = personalInfo?.date_of_birth || raw?.dateOfBirth || null;
    const gender = personalInfo?.gender || raw?.gender || '';
    const profilePhotoUrl = personalInfo?.profile_photo_url || raw?.profilePhotoUrl || '';
    const timezone = personalInfo?.timezone || raw?.timezone || '';

    const workPreferences = raw?.profile?.work_preferences || raw?.work_preferences || {};
    const jobPreferences = raw?.profile?.job_preferences || raw?.job_preferences || {};
    const availability = raw?.profile?.availability || raw?.availability || {};

    const rawSkills = raw?.skills || raw?.profile?.skills || [];
    const skills = rawSkills.map(extractSkillName).filter(Boolean);
    
    const skillDetails = rawSkills.map(skill => ({
      name: extractSkillName(skill),
      proficiency_level: skill?.proficiency_level || skill?.proficiencyLevel || 3,
      proficiency_label: skill?.proficiency_label || skill?.proficiencyLabel || 'Advanced',
      years_experience: skill?.years_experience || skill?.yearsExperience || 0,
      is_primary: skill?.is_primary || skill?.isPrimary || false,
      category: skill?.category || '',
      skill_type: skill?.skill_type || skill?.skillType || 'technical'
    })).filter(s => s.name);

    const rawEducation = raw?.education || [];
    const education = rawEducation.map(edu => ({
      id: edu?.id,
      institution: edu?.institution || '',
      degree: edu?.degree || '',
      field_of_study: edu?.field_of_study || edu?.fieldOfStudy || '',
      start_date: edu?.start_date || edu?.startDate,
      end_date: edu?.end_date || edu?.endDate,
      is_current: edu?.is_current || edu?.isCurrent || false,
      grade: edu?.grade || '',
      grade_scale: edu?.grade_scale || edu?.gradeScale || '4',
      description: edu?.description || '',
      activities: edu?.activities || '',
      verified: edu?.verified || false
    }));

    const rawWork = raw?.workExperience || raw?.work_experience || [];
    const workExperience = rawWork.map(exp => ({
      id: exp?.id,
      company: exp?.company || '',
      title: exp?.title || '',
      employment_type: exp?.employment_type || exp?.employmentType || 'full-time',
      location: exp?.location || '',
      location_type: exp?.location_type || exp?.locationType || 'onsite',
      start_date: exp?.start_date || exp?.startDate,
      end_date: exp?.end_date || exp?.endDate,
      is_current: exp?.is_current || exp?.isCurrent || false,
      description: exp?.description || '',
      achievements: exp?.achievements || [],
      skills: exp?.skills || [],
      industry: exp?.industry || '',
      team_size: exp?.team_size || exp?.teamSize,
      reports_to: exp?.reports_to || exp?.reportsTo
    }));

    const rawPortfolio = raw?.portfolio_links || raw?.portfolioLinks || [];
    const portfolioLinks = rawPortfolio.map(link => ({
      id: link?.id,
      platform: link?.platform || '',
      url: link?.url || '',
      title: link?.title || '',
      description: link?.description || '',
      is_verified: link?.is_verified || link?.isVerified || false
    }));

    const rawResumes = raw?.resumes || [];
    const resumes = rawResumes.map(resume => ({
      id: resume?.id,
      file_name: resume?.file_name || resume?.fileName || '',
      file_url: resume?.file_url || resume?.fileUrl || '',
      file_size: resume?.file_size || resume?.fileSize || 0,
      is_primary: resume?.is_primary || resume?.isPrimary || false,
      uploaded_at: resume?.uploaded_at || resume?.uploadedAt
    }));

    const languages = raw?.profile?.languages || raw?.languages || [];
    const socialLinks = raw?.profile?.links || raw?.socialLinks || {};
    const statistics = raw?.statistics || {};

    return {
      firstName, lastName, email, phone, city, country, headline, summary,
      dateOfBirth, gender, profilePhotoUrl, timezone,
      workPreferences, jobPreferences, availability,
      skills, skillDetails,
      education, workExperience,
      portfolioLinks, resumes,
      languages, socialLinks, statistics
    };
  }

  function extractSkillName(skill) {
    if (!skill) return '';
    if (typeof skill === 'string') return skill;
    if (typeof skill === 'object') {
      return skill.skill_name || skill.name || skill.skillName || 
             skill.title || skill.skill || '';
    }
    return '';
  }

  function safeStr(value, fallback = 'Not specified') {
    if (!value) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  }

  function formatDate(dateString) {
    if (!dateString) return 'Present';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  function formatFullDate(dateString) {
    if (!dateString) return 'Not specified';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric' 
    });
  }

  function calculateExperienceYears(workExperiences) {
    let totalYears = 0;
    workExperiences.forEach(exp => {
      if (exp.start_date) {
        const start = new Date(exp.start_date);
        const end = exp.is_current ? new Date() : (exp.end_date ? new Date(exp.end_date) : new Date());
        const years = (end - start) / (1000 * 60 * 60 * 24 * 365);
        totalYears += years;
      }
    });
    return Math.round(totalYears * 10) / 10;
  }

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setAnswers({});
      setDocuments([]);
      setErrors({});
      setReviewMode(false);
      setShowAllSkills(false);
      setShowAllEducation(false);
      setShowAllExperience(false);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  // Auto-close success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  if (!isOpen || !job) return null;

  const documentTemplates = requiredDocuments.map(doc => ({
    name: doc,
    required: true,
    acceptedTypes: ['.pdf', '.doc', '.docx'],
    maxSize: 5 * 1024 * 1024,
    description: doc === 'Resume' ? 'Upload your CV/Resume' : 
                  doc === 'Cover Letter' ? 'Write a cover letter' : 
                  `Upload your ${doc.toLowerCase()}`
  }));

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (errors[questionId]) setErrors(prev => ({ ...prev, [questionId]: null }));
  };

  const handleFileUpload = (docIndex, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name} exceeds 5 MB limit`);
      return;
    }
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
          preview: reader.result,
          documentType: documentTemplates[docIndex]?.name,
          uploaded: true,
        };
        return newDocs;
      });
    };
    reader.readAsDataURL(file);
  };

  const removeDocument = (docIndex) => {
    setDocuments(prev => {
      const newDocs = [...prev];
      newDocs[docIndex] = null;
      return newDocs;
    });
  };

  const validateStep = () => {
    const newErrors = {};
    if (currentStep === 3 && screeningQuestions.length > 0) {
      screeningQuestions.forEach((q, idx) => {
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

  // UPDATED handleSubmit with success message and auto-reload
  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    setSuccessMessage(null);
    
    try {
      // IMPORTANT: Convert matchScore to integer to avoid PostgreSQL error
      const applicationData = {
        jobId: job.id,
        additionalInfo: {
          screeningAnswers: answers,
          documents: documents.map((doc, idx) => ({
            type: documentTemplates[idx]?.name,
            name: doc?.name || '',
            size: doc?.size || 0,
            uploaded: !!doc,
          })),
          // Round matchScore to nearest integer
          matchScore: Math.round(matchScore),
          submittedAt: new Date().toISOString(),
        },
      };

      console.log('📤 Submitting application:', applicationData);
      const result = await submitApplication(applicationData);
      
      if (result?.success) {
        // Show success message
        setSuccessMessage('✅ Application submitted successfully! Redirecting...');
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess(result.data);
        }
        
        // Close the modal after a short delay
        setTimeout(() => {
          onClose();
          // RELOAD THE PAGE to refresh the dashboard
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(result?.message || 'Failed to submit application');
      }
    } catch (error) {
      console.error('Submission error:', error);
      setSuccessMessage(null);
      alert('Failed to submit application: ' + (error?.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Low match score screen
  if (matchScore < 40) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl max-w-md w-full m-4">
          <div className="border-b p-4 flex justify-between items-center">
            <h2 className="text-xl font-bold">Application Not Recommended</h2>
            <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          <div className="p-6 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <p className="text-gray-700 mb-4">Your match score is <strong className="text-red-600">{matchScore}%</strong>, below 40%.</p>
            <div className="bg-yellow-50 p-4 rounded-lg text-left mb-4">
              <h3 className="font-semibold text-yellow-800 mb-2">To improve:</h3>
              <ul className="space-y-1 text-sm text-yellow-700">
                <li>• Update your profile with more skills</li>
                <li>• Add relevant work experience</li>
                <li>• Complete your education details</li>
              </ul>
            </div>
            <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg">Close</button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // STEP 1: COMPLETE PROFILE REVIEW
  // ============================================
  const renderStep1 = () => {
    if (!profile) {
      return (
        <div className="text-center py-8 text-gray-500">
          <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Profile data not available. Please complete your profile first.</p>
        </div>
      );
    }

    const totalExperience = calculateExperienceYears(profile.workExperience);
    const skillsToShow = showAllSkills ? profile.skills : profile.skills.slice(0, 10);
    const educationToShow = showAllEducation ? profile.education : profile.education.slice(0, 3);
    const experienceToShow = showAllExperience ? profile.workExperience : profile.workExperience.slice(0, 3);

    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            Complete Profile Review
          </h2>
          <p className="text-sm text-gray-500">Review all your information before applying</p>
        </div>

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
              <p className="text-sm text-gray-700 mt-1">{profile.summary}</p>
            </div>
          )}
        </div>

        {profile.skills.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-600" />
              Skills & Competencies ({profile.skills.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {skillsToShow.map((skillName, idx) => {
                const skillDetail = profile.skillDetails.find(s => s.name === skillName);
                return (
                  <div key={idx} className="group relative">
                    <span className={`px-3 py-1.5 text-sm rounded-full flex items-center gap-1 ${
                      skillDetail?.proficiency_level >= 4 ? 'bg-green-100 text-green-800 border border-green-300' :
                      skillDetail?.proficiency_level >= 3 ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                      'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                      {skillName}
                      {skillDetail?.proficiency_level >= 4 && <Star className="w-3 h-3 text-green-600" />}
                    </span>
                  </div>
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

        {profile.workExperience.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              Work Experience ({profile.workExperience.length} positions)
            </h3>
            {experienceToShow.map((exp, idx) => (
              <div key={idx} className="mb-4 last:mb-0 pb-3 last:pb-0 border-b last:border-b-0 border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{exp.title}</p>
                    <p className="text-gray-600 text-sm">{exp.company}</p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(exp.start_date)} – {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                  </span>
                </div>
                {exp.description && <p className="text-sm text-gray-600 mt-2">{exp.description}</p>}
              </div>
            ))}
            {profile.workExperience.length > 3 && (
              <button onClick={() => setShowAllExperience(!showAllExperience)} className="text-xs text-blue-600 hover:underline mt-2">
                {showAllExperience ? 'Show less' : `Show all ${profile.workExperience.length} positions`}
              </button>
            )}
          </div>
        )}

        {profile.education.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              Education ({profile.education.length} entries)
            </h3>
            {educationToShow.map((edu, idx) => (
              <div key={idx} className="mb-3 last:mb-0 pb-2 last:pb-0 border-b last:border-b-0 border-gray-200">
                <p className="font-semibold text-gray-900">
                  {edu.degree}{edu.field_of_study ? ` in ${edu.field_of_study}` : ''}
                </p>
                <p className="text-gray-600 text-sm">{edu.institution}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-gray-500">
                    {formatDate(edu.start_date)} – {edu.is_current ? 'Present' : formatDate(edu.end_date)}
                  </span>
                  {edu.grade && <span className="text-xs text-gray-500">Grade: {edu.grade}/{edu.grade_scale}</span>}
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
      </div>
    );
  };

  // ============================================
  // STEP 2: COMPLETE JOB DETAILS
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
    const postedDate = publishedAt ? new Date(publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Recently';
    
    const companyLogo = job.company_logo || job.companyLogo || job.company?.logo_url;
    const companyIndustry = job.company_industry || job.companyIndustry || job.company?.industry;
    const companySize = job.company_size || job.companySize || job.company?.size;
    const companyDescription = job.company_description || job.companyDescription || job.company?.description;
    const isVerified = job.company_verified || job.company?.verification_badge;
    
    const applicationCount = job.application_count || job.applications || 0;
    const viewCount = job.view_count || job.views || 0;

    return (
      <div className="space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            Complete Job Details
          </h2>
        </div>

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
                {isVerified && (
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <Shield className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-sm">
                <span className="flex items-center gap-1 text-gray-600"><MapPin className="w-4 h-4" />{location}</span>
                <span className="flex items-center gap-1 text-gray-600"><DollarSign className="w-4 h-4" />{salaryRange}</span>
                <span className="flex items-center gap-1 text-gray-600"><Briefcase className="w-4 h-4" />{jobType} • {workArrangement}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${matchScore >= 70 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${matchScore >= 70 ? 'bg-green-200' : 'bg-yellow-200'}`}>
              <Star className={`w-7 h-7 ${matchScore >= 70 ? 'text-green-600' : 'text-yellow-600'}`} />
            </div>
            <div>
              <h3 className="font-bold text-lg">AI Match Score: {Math.round(matchScore)}%</h3>
              <p className="text-sm">
                {matchScore >= 90 ? '🏆 Excellent match! You are highly qualified.' :
                 matchScore >= 75 ? '✅ Good match. You meet many requirements.' :
                 matchScore >= 60 ? '📈 Fair match. Consider highlighting relevant skills.' :
                 '⚠️ Low match. Update your profile for better matches.'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Posted on</p>
              <p className="text-sm font-medium">{postedDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <div>
              <p className="text-xs text-gray-500">Applications close</p>
              <p className="text-sm font-medium">{expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Not specified'}</p>
            </div>
          </div>
        </div>

        {(viewCount > 0 || applicationCount > 0) && (
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Eye className="w-5 h-5 text-gray-500 mx-auto mb-1" />
              <p className="text-xl font-bold">{viewCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Views</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <Users className="w-5 h-5 text-gray-500 mx-auto mb-1" />
              <p className="text-xl font-bold">{applicationCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Applicants</p>
            </div>
          </div>
        )}

        <div>
          <h3 className="font-semibold text-lg mb-2">Job Description</h3>
          <div className="text-gray-700 text-sm whitespace-pre-wrap">{description}</div>
        </div>

        {responsibilities.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Key Responsibilities
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {responsibilities.map((resp, idx) => <li key={idx}>{resp}</li>)}
            </ul>
          </div>
        )}

        {requirements.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              Requirements
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
              {requirements.map((req, idx) => <li key={idx}>{req}</li>)}
            </ul>
          </div>
        )}

        {skillsRequired.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-600" />
              Required Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {skillsRequired.map((skill, idx) => {
                const skillName = typeof skill === 'string' ? skill : skill.name || skill.skill_name;
                const isMatched = profile?.skills?.includes(skillName);
                return (
                  <span key={idx} className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1 ${
                    isMatched ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}>
                    {skillName}
                    {isMatched && <CheckCircle className="w-3 h-3 text-green-600" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {benefits.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-600" />
              Benefits & Perks
            </h3>
            <div className="flex flex-wrap gap-2">
              {benefits.map((benefit, idx) => (
                <span key={idx} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">{benefit}</span>
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div>
            <h3 className="font-semibold text-lg mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, idx) => (
                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">#{tag}</span>
              ))}
            </div>
          </div>
        )}

        {companyDescription && (
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-600" />
              About {companyName}
            </h3>
            <p className="text-sm text-gray-600">{companyDescription}</p>
            <div className="flex flex-wrap gap-3 mt-3 text-sm">
              {companyIndustry && <span className="text-gray-500">Industry: {companyIndustry}</span>}
              {companySize && <span className="text-gray-500">• Size: {companySize}</span>}
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
        screeningQuestions.map((q, idx) => (
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
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors[idx] ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Type your answer here..."
              />
            )}

            {q.type === 'number' && (
              <input
                type="number"
                value={answers[idx] || ''}
                onChange={(e) => handleAnswerChange(idx, e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg ${
                  errors[idx] ? 'border-red-500' : 'border-gray-300'
                }`}
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
                {q.options.map((opt, oIdx) => (
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
        <p className="text-sm text-gray-500">Upload the following documents (Max 5 MB each)</p>
      </div>

      {documentTemplates.map((doc, idx) => (
        <div key={idx} className="border rounded-lg p-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">{doc.name}</h3>
              <p className="text-sm text-gray-500">{doc.description}</p>
              {doc.required && <span className="text-xs text-red-500">Required</span>}
            </div>

            {documents[idx] ? (
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600 truncate max-w-[140px]">{documents[idx].name}</span>
                <button onClick={() => removeDocument(idx)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ) : (
              <label className="cursor-pointer px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload
                <input type="file" accept={doc.acceptedTypes.join(',')} onChange={(e) => e.target.files?.[0] && handleFileUpload(idx, e.target.files[0])} className="hidden" />
              </label>
            )}
          </div>
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
        <h3 className="font-semibold mb-2">Candidate Information</h3>
        {profile ? (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p><span className="text-gray-500">Name:</span> {profile.firstName} {profile.lastName}</p>
            <p><span className="text-gray-500">Email:</span> {profile.email || 'Not provided'}</p>
            <p><span className="text-gray-500">Location:</span> {profile.city}, {profile.country}</p>
            <p><span className="text-gray-500">Experience:</span> {profile.workExperience.length} positions</p>
          </div>
        ) : <p className="text-sm text-gray-500">Profile data not available</p>}
      </div>

      {profile?.skills.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Your Skills</h3>
          <div className="flex flex-wrap gap-2">
            {profile.skills.slice(0, 10).map((skill, idx) => (
              <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{skill}</span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Job Details</h3>
        <p><span className="text-gray-500">Position:</span> {job.title}</p>
        <p><span className="text-gray-500">Company:</span> {job.company_name}</p>
        <p><span className="text-gray-500">Match Score:</span> <strong className="text-blue-600">{Math.round(matchScore)}%</strong></p>
      </div>

      {screeningQuestions.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Your Answers</h3>
          {screeningQuestions.map((q, idx) => (
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
              {doc.name} {documents[idx] ? `— ${documents[idx].name}` : '— Not uploaded'}
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
  // MAIN RENDER
  // ============================================
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold">Apply for {safeStr(job.title)}</h2>
            <p className="text-xs text-gray-500">{reviewMode ? 'Review & Submit' : `Step ${currentStep} of ${totalSteps}`}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        {/* Success Message Banner */}
        {successMessage && (
          <div className="mx-4 mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg flex items-center gap-2 animate-pulse">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium">{successMessage}</span>
          </div>
        )}

        {/* Step Indicator */}
        {!reviewMode && (
          <div className="px-6 pt-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step === currentStep ? 'bg-blue-600 text-white' :
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
          {reviewMode ? renderReview() : (
            <>
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
            </>
          )}
        </div>

        {/* Footer */}
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
            <button onClick={onClose} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50" disabled={submitting}>Cancel</button>
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
                {submitting ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit Application</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobApplicationModal;