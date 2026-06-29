import { useState, useEffect, useRef } from 'react';
import {
  Mail,
  User,
  GraduationCap,
  Briefcase,
  Code,
  Link,
  FileText,
  Settings,
  Eye,
  CheckCircle,
  AlertCircle,
  Save,
  Phone,
  MessageSquare,
  Edit,
  Camera,
  Trash2,
  Loader,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getCandidateProfile, completeProfile, getProfileCompletionStatus, updateCandidateProfile, uploadProfilePhoto, deleteProfilePhoto } from '../services/candidateAPI';
import { updateProfile } from '../services/authAPI';
import { useAuth } from '../context/AuthContext';
import EducationSection from './profile/EducationSection';
import WorkExperienceSection from './profile/WorkExperienceSection';
import SkillsSection from './profile/SkillsSection';
import PortfolioSection from './profile/PortfolioSection';
import ResumeSection from './profile/ResumeSection';
import PreferencesSection from './profile/PreferencesSection';
import PrivacySection from './profile/PrivacySection';

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  userType?: string;
}

interface ProfileData {
  profile: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    city?: string;
    summary?: string;
    metadata?: { years_experience?: number };
    location?: string;
    bio?: string;
    headline?: string;
    years_experience?: number;
    availability_status?: string;
    job_preferences?: {
      preferred_job_types?: string[];
      preferred_industries?: string[];
      preferred_locations?: string[];
      salary_min?: number | null;
      salary_max?: number | null;
      salary_currency?: string;
      remote_work_preference?: string;
      willing_to_relocate?: boolean;
      availability_status?: string;
      availability_date?: string | null;
      job_level?: string;
      keywords?: string;
    };
    privacy_settings?: {
      profile_visibility?: string;
      show_education?: boolean;
      show_work_experience?: boolean;
      show_skills?: boolean;
      show_portfolio?: boolean;
      show_resume?: boolean;
      allow_contact_from_employers?: boolean;
      allow_data_analytics?: boolean;
      allow_marketing_emails?: boolean;
      data_retention_period?: string;
    };
  };
  education: any[];
  experience: any[];
  skills: any[];
  resumes: any[];
  portfolioLinks?: any[];
}

interface CompletionStatus {
  isComplete: boolean;
  completionPercentage?: number;
  sections: {
    basicInfo?: boolean;
    education?: boolean;
    experience?: boolean;
    skills?: boolean;
    resume?: boolean;
    portfolio?: boolean;
    preferences?: boolean;
    privacy?: boolean;
  };
  counts: {
    education: number;
    experience: number;
    skills: number;
    resume: number;
    portfolio: number;
  };
}

interface ProfileManagementProps {
  onNavigate: (view: string) => void;
}

interface RecruiterProfile {
  firstName: string;
  lastName: string;
  phone: string;
  bio: string;
}

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
}

// ── Main ProfileManagement ─────────────────────────────────────────────────────

const ProfileManagement = ({ onNavigate }: ProfileManagementProps) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus | null>(null);
  const [completingProfile, setCompletingProfile] = useState<boolean>(false);

  useEffect(() => {
    if (user?.userType === 'candidate') {
      loadCandidateProfile();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadCandidateProfile = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await getCandidateProfile();
      if (response.success) setProfile(response.data);
      const completionResponse = await getProfileCompletionStatus();
      if (completionResponse.success) setCompletionStatus(completionResponse.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (): Promise<void> => {
    try {
      setCompletingProfile(true);
      const response = await completeProfile();
      if (response.success) {
        await loadCandidateProfile();
        alert('Profile completed successfully! 🎉');
      }
    } catch (err: unknown) {
      alert(`Failed to complete profile: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCompletingProfile(false);
    }
  };

  const getTabs = (): Tab[] => {
    if (user?.userType === 'candidate') {
      return [
        { id: 'overview',   label: 'Overview',    icon: User },
        { id: 'basic-info', label: 'Basic Info',  icon: User },
        { id: 'education',  label: 'Education',   icon: GraduationCap },
        { id: 'experience', label: 'Experience',  icon: Briefcase },
        { id: 'skills',     label: 'Skills',      icon: Code },
        { id: 'portfolio',  label: 'Portfolio',   icon: Link },
        { id: 'resume',     label: 'Resume',      icon: FileText },
        { id: 'preferences',label: 'Preferences', icon: Settings },
        { id: 'privacy',    label: 'Privacy',     icon: Eye },
      ];
    }
    return [
      { id: 'basic',    label: 'Basic Information', icon: User },
      { id: 'security', label: 'Security Settings', icon: Settings },
    ];
  };

  const tabs: Tab[] = getTabs();

  const renderTabContent = (): JSX.Element => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      );
    }

    if (error && user?.userType === 'candidate') {
      return (
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">Error loading profile</div>
          <button onClick={loadCandidateProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Try Again
          </button>
        </div>
      );
    }

    if (user?.userType !== 'candidate') {
      switch (activeTab) {
        case 'basic':
          return <RecruiterBasicInfoForm user={user} />;
        case 'security':
          return (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Security Settings</h2>
              <p className="text-gray-600 mb-4">Security settings are managed through the Security Settings page in the sidebar.</p>
              <button onClick={() => onNavigate('security')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Go to Security Settings
              </button>
            </div>
          );
        default:
          return <RecruiterBasicInfoForm user={user} />;
      }
    }

    switch (activeTab) {
      case 'overview':
        return (
          <ProfileOverview
            profile={profile}
            completionStatus={completionStatus}
            onCompleteProfile={handleCompleteProfile}
            completingProfile={completingProfile}
            onNavigateToTab={setActiveTab}
          />
        );
      case 'basic-info':
        return <CandidateBasicInfoSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'education':
        return <EducationSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'experience':
        return <WorkExperienceSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'skills':
        return <SkillsSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'portfolio':
        return <PortfolioSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'resume':
        return <ResumeSection profile={profile} onUpdate={loadCandidateProfile} />;
      case 'preferences':
        return (
          <PreferencesSection
            profile={profile}
            onUpdate={loadCandidateProfile}
            completionStatus={completionStatus || undefined}
            onCompletionUpdate={loadCandidateProfile}
          />
        );
      case 'privacy':
        return <PrivacySection profile={profile} onUpdate={loadCandidateProfile} />;
      default:
        return (
          <ProfileOverview
            profile={profile}
            completionStatus={completionStatus}
            onCompleteProfile={handleCompleteProfile}
            completingProfile={completingProfile}
            onNavigateToTab={setActiveTab}
          />
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
        <p className="text-gray-600">
          {user?.userType === 'candidate'
            ? 'Manage your candidate profile and preferences'
            : 'Manage your account information and settings'}
        </p>
      </div>

      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8 overflow-x-auto">
          {tabs.map((tab: Tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {renderTabContent()}
      </div>
    </div>
  );
};

// ── Shared inline feedback banner ──────────────────────────────────────────────

const SaveBanner = ({ status, message }: { status: 'success' | 'error'; message: string }) => (
  <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
    status === 'success'
      ? 'bg-green-50 border border-green-200 text-green-800'
      : 'bg-red-50 border border-red-200 text-red-800'
  }`}>
    {status === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
    {message}
  </div>
);

const FieldError = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertCircle size={12} />{msg}
    </p>
  ) : null;

// ── Save Success Modal ─────────────────────────────────────────────────────────

interface SaveSuccessModalProps {
  fields: { label: string; value: string }[];
  onClose: () => void;
}

const SaveSuccessModal = ({ fields, onClose }: SaveSuccessModalProps) => {
  const visible = fields.filter(f => f.value.trim());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Animated check */}
        <div className="flex justify-center mb-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-11 h-11 text-green-600" strokeWidth={1.5} />
          </div>
        </div>

        <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-1">Profile Saved!</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Your changes have been stored successfully.
        </p>

        {/* Saved fields summary */}
        {visible.length > 0 && (
          <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 mb-6 overflow-hidden">
            {visible.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">{label}</span>
                <span className="text-sm font-medium text-gray-800 text-right ml-4 truncate max-w-[55%]">{value}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
};

// ── Recruiter Basic Info Form ──────────────────────────────────────────────────

interface RecruiterBasicInfoFormProps {
  user: User | null;
}

const RecruiterBasicInfoForm = ({ user }: RecruiterBasicInfoFormProps): JSX.Element => {
  const [formData, setFormData] = useState<RecruiterProfile>({
    firstName: user?.firstName || '',
    lastName:  user?.lastName  || '',
    phone: '',
    bio:   '',
  });
  const [errors,      setErrors]      = useState<Partial<Record<keyof RecruiterProfile, string>>>({});
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [showModal,   setShowModal]   = useState(false);

  const validate = (name: keyof RecruiterProfile, value: string): string => {
    switch (name) {
      case 'firstName':
      case 'lastName': {
        const label = name === 'firstName' ? 'First name' : 'Last name';
        if (!value.trim()) return `${label} is required`;
        if (value.trim().length < 2) return 'Must be at least 2 characters';
        if (value.trim().length > 50) return 'Must be 50 characters or fewer';
        if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(value.trim())) return 'Only letters, spaces, hyphens and apostrophes';
        return '';
      }
      case 'phone':
        if (value && !/^[+]?[\d\s\-().]{7,20}$/.test(value.trim()))
          return 'Enter a valid phone number (e.g. +250 788 000 000)';
        return '';
      case 'bio':
        if (value.length > 600) return 'Must be 600 characters or fewer';
        return '';
      default:
        return '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validate(name as keyof RecruiterProfile, value) }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof RecruiterProfile, string>> = {};
    (Object.keys(formData) as (keyof RecruiterProfile)[]).forEach(k => {
      const err = validate(k, formData[k]);
      if (err) next[k] = err;
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setSaveStatus('error');
      setSaveMessage('Please fix the errors above before saving.');
      return;
    }
    try {
      setSaving(true);
      setSaveStatus('idle');
      const response = await updateProfile(formData);
      if (response.success) {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...stored, ...formData }));
        setShowModal(true);
      }
    } catch (err: unknown) {
      setSaveStatus('error');
      setSaveMessage(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const inputClass = (field: keyof RecruiterProfile) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <>
      {showModal && (
        <SaveSuccessModal
          onClose={() => setShowModal(false)}
          fields={[
            { label: 'First Name', value: formData.firstName },
            { label: 'Last Name',  value: formData.lastName  },
            { label: 'Phone',      value: formData.phone     },
            { label: 'Bio',        value: formData.bio.length > 60 ? formData.bio.slice(0, 60) + '…' : formData.bio },
          ]}
        />
      )}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange}
                className={inputClass('firstName')} placeholder="Your first name" />
              <FieldError msg={errors.firstName} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange}
                className={inputClass('lastName')} placeholder="Your last name" />
              <FieldError msg={errors.lastName} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                className={`pl-10 ${inputClass('phone')}`} placeholder="+250 788 000 000" />
            </div>
            <FieldError msg={errors.phone} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 text-gray-400 w-4 h-4" />
              <textarea name="bio" value={formData.bio} onChange={handleChange} rows={4} maxLength={600}
                className={`pl-10 ${inputClass('bio')}`} placeholder="Tell us about yourself..." />
            </div>
            <div className="flex justify-between items-center mt-1">
              <FieldError msg={errors.bio} />
              <span className="text-xs text-gray-400 ml-auto">{formData.bio.length}/600</span>
            </div>
          </div>

          {saveStatus === 'error' && <SaveBanner status="error" message={saveMessage} />}

          <div className="flex justify-end">
            <button type="submit" disabled={saving || hasErrors}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

// ── Candidate Basic Info Section ───────────────────────────────────────────────

interface CandidateBasicInfoSectionProps {
  profile: ProfileData | null;
  onUpdate: () => void;
}

interface CandidateBasicInfoFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  yearsExperience: string;
  bio: string;
  dateOfBirth: string;
  gender: string;
}

const CandidateBasicInfoSection = ({ profile, onUpdate }: CandidateBasicInfoSectionProps): JSX.Element => {
  const [saving, setSaving] = useState<boolean>(false);
  const [formData, setFormData] = useState<CandidateBasicInfoFormData>({
    firstName: '', lastName: '', email: '', phone: '',
    location: '', headline: '', yearsExperience: '', bio: '',
    dateOfBirth: '', gender: '',
  });
  const [errors,      setErrors]      = useState<Partial<Record<keyof CandidateBasicInfoFormData, string>>>({});
  const [saveStatus,  setSaveStatus]  = useState<'idle' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [showModal,   setShowModal]   = useState(false);

  // Profile picture
  const [photoUrl,     setPhotoUrl]     = useState<string | null>(null);
  const [photoBusy,    setPhotoBusy]    = useState(false);
  const [photoError,   setPhotoError]   = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

  // Notify the rest of the app (header avatar, etc.) and persist for quick reads.
  const broadcastPhoto = (url: string | null) => {
    try {
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.profile_photo_url = url;
      localStorage.setItem('user', JSON.stringify(stored));
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('profile-photo-updated', { detail: { url } }));
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Please use a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Image must be 5MB or smaller.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoUrl(previewUrl);          // optimistic preview
    setPhotoBusy(true);
    try {
      const res = await uploadProfilePhoto(file);
      const url = res?.data?.photoUrl || res?.photoUrl || previewUrl;
      setPhotoUrl(url);
      broadcastPhoto(url);
      await onUpdate();
    } catch (err: any) {
      setPhotoError(`Upload failed: ${err?.message || 'Unknown error'}`);
      setPhotoUrl((profile?.profile as any)?.profile_photo_url || null); // revert
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoError('');
    setPhotoBusy(true);
    try {
      await deleteProfilePhoto();
      setPhotoUrl(null);
      broadcastPhoto(null);
      await onUpdate();
    } catch (err: any) {
      setPhotoError(`Remove failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  useEffect(() => {
    if (profile?.profile) {
      setFormData({
        firstName:       profile.profile.first_name || '',
        lastName:        profile.profile.last_name  || '',
        email:           profile.profile.email      || '',
        phone:           profile.profile.phone      || '',
        location:        profile.profile.location   || profile.profile.city || '',
        headline:        profile.profile.headline   || '',
        yearsExperience: profile.profile.years_experience?.toString()
                         || profile.profile.metadata?.years_experience?.toString()
                         || '',
        bio:             profile.profile.bio || profile.profile.summary || '',
        dateOfBirth:     profile.profile.date_of_birth ? String(profile.profile.date_of_birth).split('T')[0] : '',
        gender:          profile.profile.gender || '',
      });
      setPhotoUrl((profile.profile as any).profile_photo_url || null);
    }
  }, [profile]);

  const validate = (name: keyof CandidateBasicInfoFormData, value: string): string => {
    switch (name) {
      case 'firstName':
      case 'lastName': {
        const label = name === 'firstName' ? 'First name' : 'Last name';
        if (!value.trim()) return `${label} is required`;
        if (value.trim().length < 2) return 'Must be at least 2 characters';
        if (value.trim().length > 50) return 'Must be 50 characters or fewer';
        if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(value.trim())) return 'Only letters, spaces, hyphens and apostrophes';
        return '';
      }
      case 'phone':
        if (value && !/^[+]?[\d\s\-().]{7,20}$/.test(value.trim()))
          return 'Enter a valid phone number (e.g. +250 788 000 000)';
        return '';
      case 'location':
        if (value.length > 100) return 'Must be 100 characters or fewer';
        return '';
      case 'headline':
        if (value.length > 120) return 'Must be 120 characters or fewer';
        return '';
      case 'yearsExperience':
        if (value) {
          const n = Number(value);
          if (!Number.isInteger(n) || n < 0 || n > 50) return 'Enter a whole number between 0 and 50';
        }
        return '';
      case 'bio':
        if (value.length > 600) return 'Must be 600 characters or fewer';
        return '';
      case 'dateOfBirth': {
        if (value) {
          const d = new Date(value);
          if (isNaN(d.getTime())) return 'Enter a valid date';
          const ageYears = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
          if (ageYears < 12)  return 'You must be at least 12 years old';
          if (ageYears > 100) return 'Enter a valid date of birth';
        }
        return '';
      }
      default:
        return '';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validate(name as keyof CandidateBasicInfoFormData, value) }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const next: Partial<Record<keyof CandidateBasicInfoFormData, string>> = {};
    (Object.keys(formData) as (keyof CandidateBasicInfoFormData)[]).forEach(k => {
      if (k === 'email') return;
      const err = validate(k, formData[k]);
      if (err) next[k] = err;
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setSaveStatus('error');
      setSaveMessage('Please fix the errors above before saving.');
      return;
    }
    try {
      setSaving(true);
      setSaveStatus('idle');
      await updateCandidateProfile({
        firstName:       formData.firstName.trim(),
        lastName:        formData.lastName.trim(),
        phone:           formData.phone.trim()    || undefined,
        location:        formData.location.trim() || undefined,
        headline:        formData.headline.trim() || undefined,
        yearsExperience: formData.yearsExperience ? parseInt(formData.yearsExperience, 10) : undefined,
        bio:             formData.bio.trim()      || undefined,
        dateOfBirth:     formData.dateOfBirth     || undefined,
        gender:          formData.gender          || undefined,
      });
      await onUpdate();
      setShowModal(true);
    } catch (error: unknown) {
      setSaveStatus('error');
      setSaveMessage(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const hasErrors = Object.values(errors).some(Boolean);

  const inputClass = (field: keyof CandidateBasicInfoFormData) =>
    `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
      errors[field] ? 'border-red-400 bg-red-50' : 'border-gray-300'
    }`;

  return (
    <>
      {showModal && (
        <SaveSuccessModal
          onClose={() => setShowModal(false)}
          fields={[
            { label: 'First Name',   value: formData.firstName },
            { label: 'Last Name',    value: formData.lastName  },
            { label: 'Phone',        value: formData.phone     },
            { label: 'Location',     value: formData.location  },
            { label: 'Date of Birth', value: formData.dateOfBirth },
            { label: 'Gender',       value: formData.gender    },
            { label: 'Headline',     value: formData.headline  },
            { label: 'Experience',   value: formData.yearsExperience ? `${formData.yearsExperience} yrs` : '' },
            { label: 'Bio',          value: formData.bio.length > 60 ? formData.bio.slice(0, 60) + '…' : formData.bio },
          ]}
        />
      )}
      <div className="bg-white rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>

      {/* Profile picture */}
      <div className="flex items-center gap-5 mb-8">
        <div className="relative">
          {photoUrl ? (
            <img src={photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border border-gray-200" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold">
              {`${formData.firstName.charAt(0) || ''}${formData.lastName.charAt(0) || ''}`.toUpperCase() || <User size={28} />}
            </div>
          )}
          {photoBusy && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <Loader size={20} className="text-white animate-spin" />
            </div>
          )}
        </div>
        <div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handlePhotoSelect}
            className="hidden"
            id="profile-photo-input"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Camera size={15} /> {photoUrl ? 'Change Photo' : 'Upload Photo'}
            </button>
            {photoUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={photoBusy}
                className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">JPG, PNG or WebP · up to 5MB</p>
          {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Name row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              First Name <span className="text-red-500">*</span>
            </label>
            <input type="text" name="firstName" value={formData.firstName} onChange={handleChange}
              className={inputClass('firstName')} placeholder="Your first name" />
            <FieldError msg={errors.firstName} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input type="text" name="lastName" value={formData.lastName} onChange={handleChange}
              className={inputClass('lastName')} placeholder="Your last name" />
            <FieldError msg={errors.lastName} />
          </div>
        </div>

        {/* Email — read-only */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email (read-only)</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="email" value={formData.email} disabled
              className="w-full pl-10 pr-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg cursor-not-allowed" />
          </div>
        </div>

        {/* Phone + Location */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                className={`pl-10 ${inputClass('phone')}`} placeholder="+250 788 000 000" />
            </div>
            <FieldError msg={errors.phone} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
            <input type="text" name="location" value={formData.location} onChange={handleChange}
              className={inputClass('location')} placeholder="e.g. Kigali, Rwanda" maxLength={100} />
            <FieldError msg={errors.location} />
          </div>
        </div>
        {/* Date of Birth + Gender */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
            <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 12)).toISOString().split('T')[0]}
              className={inputClass('dateOfBirth')} />
            <FieldError msg={errors.dateOfBirth} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
            <select name="gender" value={formData.gender} onChange={handleChange}
              className={inputClass('gender')}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
          <textarea name="bio" rows={4} value={formData.bio} onChange={handleChange}
            className={inputClass('bio')} maxLength={600}
            placeholder="Tell recruiters about your background and strengths..." />
          <div className="flex justify-between items-center mt-1">
            <FieldError msg={errors.bio} />
            <span className="text-xs text-gray-400 ml-auto">{formData.bio.length}/600</span>
          </div>
        </div>

        {saveStatus === 'error' && <SaveBanner status="error" message={saveMessage} />}

        <div className="flex justify-end">
          <button type="submit" disabled={saving || hasErrors}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Save className="w-4 h-4" />}
            Save Basic Info
          </button>
        </div>
      </form>
      </div>
    </>
  );
};

// ── Profile Overview ───────────────────────────────────────────────────────────

interface ProfileOverviewProps {
  profile: ProfileData | null;
  completionStatus: CompletionStatus | null;
  onCompleteProfile: () => void;
  completingProfile: boolean;
  onNavigateToTab: (tabId: string) => void;
}

const ProfileOverview = ({ profile, completionStatus, onCompleteProfile, completingProfile, onNavigateToTab }: ProfileOverviewProps) => {
  if (!profile) return <div className="text-center py-8">No profile data available</div>;

  const { profile: profileData, education = [], experience = [], skills = [], resumes = [] } = profile;
  const isProfileComplete   = completionStatus?.isComplete          || false;
  const completionSections  = completionStatus?.sections            || {};
  const completionCounts    = completionStatus?.counts              || { education: 0, experience: 0, skills: 0, resume: 0, portfolio: 0 };
  const completionPercentage = completionStatus?.completionPercentage || 0;

  return (
    <div className="space-y-8">
      {/* Completion card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            {isProfileComplete
              ? <CheckCircle className="text-green-600" size={24} />
              : <AlertCircle className="text-orange-600" size={24} />}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {isProfileComplete ? 'Profile Complete!' : 'Complete Your Profile'}
              </h3>
              <p className="text-sm text-gray-600">
                {isProfileComplete
                  ? 'Your profile is ready for job applications'
                  : `Profile is ${completionPercentage}% complete — fill in all sections`}
              </p>
            </div>
          </div>
          {!isProfileComplete && (
            <button onClick={onCompleteProfile} disabled={completingProfile}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {completingProfile
                ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Completing…</>
                : <><CheckCircle size={16} />Complete Profile</>}
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Profile Completion</span><span>{completionPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${completionPercentage}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { key: 'basicInfo',   tab: 'basic-info',  label: 'Basic Info',  icon: User,          count: null },
            { key: 'education',   tab: 'education',   label: 'Education',   icon: GraduationCap, count: completionCounts.education },
            { key: 'experience',  tab: 'experience',  label: 'Experience',  icon: Briefcase,     count: completionCounts.experience },
            { key: 'skills',      tab: 'skills',      label: 'Skills',      icon: Code,          count: completionCounts.skills },
            { key: 'resume',      tab: 'resume',      label: 'Resume',      icon: FileText,      count: completionCounts.resume },
            { key: 'portfolio',   tab: 'portfolio',   label: 'Portfolio',   icon: Link,          count: completionCounts.portfolio },
            { key: 'preferences', tab: 'preferences', label: 'Preferences', icon: Settings,      count: null },
            { key: 'privacy',     tab: 'privacy',     label: 'Privacy',     icon: Eye,           count: null },
          ] as const).map(({ key, tab, label, icon: Icon, count }) => {
            const done = (completionSections as any)[key] === true;
            return (
              <button key={key} onClick={() => onNavigateToTab(tab)}
                className={`group p-4 rounded-xl border-2 text-left transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  done ? 'border-green-200 bg-green-50 hover:border-green-400' : 'border-dashed border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
                }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${done ? 'bg-green-100' : 'bg-gray-100 group-hover:bg-blue-100'}`}>
                    <Icon size={16} className={done ? 'text-green-600' : 'text-gray-400 group-hover:text-blue-600'} />
                  </div>
                  {done
                    ? <CheckCircle size={14} className="text-green-500 mt-1" />
                    : <span className="text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Fill in →</span>}
                </div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                {count !== null && <p className="text-xs text-gray-500 mt-0.5">{count} {count === 1 ? 'entry' : 'entries'}</p>}
                {!done && <p className="text-xs text-orange-500 font-medium mt-1">Incomplete</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Snapshot */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Profile Snapshot</h2>
          <button onClick={() => onNavigateToTab('basic-info')}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <Edit size={12} /> Edit Basic Info
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {[
            { label: 'Full Name',  value: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Not set' },
            { label: 'Email',      value: profileData.email || 'Not set' },
            { label: 'Phone',      value: profileData.phone || 'Not set' },
            { label: 'Location',   value: profileData.location || profileData.city || 'Not set' },
            { label: 'Headline',   value: profileData.headline || 'Not set' },
            { label: 'Experience', value: profileData.years_experience != null ? `${profileData.years_experience} years` : 'Not set' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
              <span className={`text-sm font-medium text-right ${value === 'Not set' ? 'text-gray-400 italic' : 'text-gray-800'}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { tab: 'education',  count: education.length,  label: 'Education',  icon: GraduationCap, color: 'blue'   },
          { tab: 'experience', count: experience.length, label: 'Experience', icon: Briefcase,     color: 'green'  },
          { tab: 'skills',     count: skills.length,     label: 'Skills',     icon: Code,          color: 'purple' },
          { tab: 'resume',     count: resumes.length,    label: 'Resumes',    icon: FileText,      color: 'orange' },
        ] as const).map(({ tab, count, label, icon: Icon, color }) => (
          <button key={tab} onClick={() => onNavigateToTab(tab)}
            className={`p-4 rounded-xl text-left bg-${color}-50 hover:bg-${color}-100 border border-${color}-100 hover:border-${color}-300 transition-all hover:shadow-sm group`}>
            <div className="flex items-center justify-between mb-1">
              <span className={`text-2xl font-bold text-${color}-600`}>{count}</span>
              <Icon size={16} className={`text-${color}-400 group-hover:text-${color}-600 transition-colors`} />
            </div>
            <div className={`text-sm font-medium text-${color}-700`}>{label}</div>
            <div className={`text-xs text-${color}-500 mt-0.5`}>{count === 0 ? 'Click to add' : 'Click to edit'}</div>
          </button>
        ))}
      </div>

      {/* Recent entries */}
      {(education.length > 0 || experience.length > 0) && (
        <div>
          <h3 className="text-base font-semibold text-gray-800 mb-3">Recent Entries</h3>
          <div className="space-y-2">
            {education.slice(0, 2).map((edu: any, i: number) => (
              <button key={i} onClick={() => onNavigateToTab('education')}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-200 transition-all text-left">
                <GraduationCap size={18} className="text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{edu.degree} {edu.field_of_study ? `in ${edu.field_of_study}` : ''}</p>
                  <p className="text-xs text-gray-500 truncate">{edu.institution}</p>
                </div>
                <span className="text-xs text-blue-500 shrink-0">Edit →</span>
              </button>
            ))}
            {experience.slice(0, 2).map((exp: any, i: number) => (
              <button key={i} onClick={() => onNavigateToTab('experience')}
                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-green-50 rounded-xl border border-transparent hover:border-green-200 transition-all text-left">
                <Briefcase size={18} className="text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{exp.title}</p>
                  <p className="text-xs text-gray-500 truncate">{exp.company}</p>
                </div>
                <span className="text-xs text-green-500 shrink-0">Edit →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileManagement;
