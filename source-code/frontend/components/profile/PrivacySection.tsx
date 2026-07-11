import React, { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Shield, Users, Lock } from 'lucide-react';
import { updatePrivacySettings } from '../../services/candidateAPI';

// =====================================================
// TYPESCRIPT INTERFACES
// =====================================================
interface PrivacySettings {
  profile_visibility?: string;
  profileVisibility?: string;
  show_education?: boolean;
  showEducation?: boolean;
  show_work_experience?: boolean;
  showWorkExperience?: boolean;
  show_skills?: boolean;
  showSkills?: boolean;
  show_portfolio?: boolean;
  showPortfolio?: boolean;
  show_resume?: boolean;
  showResume?: boolean;
  allow_contact_from_employers?: boolean;
  allowContactFromEmployers?: boolean;
  allow_data_analytics?: boolean;
  allowDataAnalytics?: boolean;
  allow_marketing_emails?: boolean;
  allowMarketingEmails?: boolean;
  data_retention_period?: string;
  dataRetentionPeriod?: string;
}

interface PrivacyProfileData {
  profile?: {
    privacy_settings?: PrivacySettings;
    first_name?: string;
    last_name?: string;
    email?: string;
    location?: string;
    headline?: string;
    years_experience?: number;
    availability_status?: string;
  };
  education?: any[];
  experience?: any[];
  skills?: any[];
  resumes?: any[];
  portfolioLinks?: any[];
}

interface PrivacySectionProps {
  profile: PrivacyProfileData | null;
  onUpdate: () => void;
}

type ProfileVisibility = 'public'| 'connections_only'| 'private';

interface PrivacyFormData {
  profileVisibility: ProfileVisibility;
  showEducation: boolean;
  showWorkExperience: boolean;
  showSkills: boolean;
  showPortfolio: boolean;
  showResume: boolean;
  allowContactFromEmployers: boolean;
  allowDataAnalytics: boolean;
  allowMarketingEmails: boolean;
  dataRetentionPeriod: string;
}

type SectionVisibilityKey =
  | 'showEducation'
  | 'showWorkExperience'
  | 'showSkills'
  | 'showPortfolio'
  | 'showResume';

// =====================================================
// HELPER FUNCTIONS
// =====================================================
const toProfileVisibility = (value: string | undefined): ProfileVisibility => {
  if (value === 'public'|| value === 'connections_only'|| value === 'private') {
    return value;
  }
  return 'public';
};

const getVisibilityIcon = (visibility: ProfileVisibility): React.ReactElement => {
  switch (visibility) {
    case 'public':
      return <Eye className="text-green-600" size={18} />;
    case 'private':
      return <Lock className="text-red-600" size={18} />;
    case 'connections_only':
      return <Users className="text-blue-600" size={18} />;
    default:
      return <EyeOff className="text-gray-600" size={18} />;
  }
};

// =====================================================
// COMPONENT
// =====================================================
const PrivacySection: React.FC<PrivacySectionProps> = ({ profile, onUpdate }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<PrivacyFormData>({
    profileVisibility: 'public',
    showEducation: true,
    showWorkExperience: true,
    showSkills: true,
    showPortfolio: true,
    showResume: true,
    allowContactFromEmployers: true,
    allowDataAnalytics: true,
    allowMarketingEmails: true,
    dataRetentionPeriod: 'indefinite'
  });

  // Initialize form data from profile when it loads
  useEffect((): void => {
    if (profile?.profile?.privacy_settings) {
      const settings = profile.profile.privacy_settings;
      setFormData({
        profileVisibility: toProfileVisibility(settings.profile_visibility || settings.profileVisibility),
        showEducation: settings.show_education ?? settings.showEducation ?? true,
        showWorkExperience: settings.show_work_experience ?? settings.showWorkExperience ?? true,
        showSkills: settings.show_skills ?? settings.showSkills ?? true,
        showPortfolio: settings.show_portfolio ?? settings.showPortfolio ?? true,
        showResume: settings.show_resume ?? settings.showResume ?? true,
        allowContactFromEmployers: settings.allow_contact_from_employers ?? settings.allowContactFromEmployers ?? true,
        allowDataAnalytics: settings.allow_data_analytics ?? settings.allowDataAnalytics ?? true,
        allowMarketingEmails: settings.allow_marketing_emails ?? settings.allowMarketingEmails ?? true,
        dataRetentionPeriod: settings.data_retention_period || settings.dataRetentionPeriod || 'indefinite'
      });
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        profile_visibility: formData.profileVisibility,
        show_education: formData.showEducation,
        show_work_experience: formData.showWorkExperience,
        show_skills: formData.showSkills,
        show_portfolio: formData.showPortfolio,
        show_resume: formData.showResume,
        allow_contact_from_employers: formData.allowContactFromEmployers,
        allow_data_analytics: formData.allowDataAnalytics,
        allow_marketing_emails: formData.allowMarketingEmails,
        data_retention_period: formData.dataRetentionPeriod
      };

      await updatePrivacySettings(submitData);
      onUpdate();
      alert('Privacy settings updated successfully!');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error updating privacy settings:', error);
      alert('Error updating privacy settings: '+ errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Privacy & Data Settings</h2>
        <p className="text-sm text-gray-600">Control who can see your information and how your data is used</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Profile Visibility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Profile Visibility
          </label>
          <div className="space-y-3">
            {[
              { value: 'public'as const, label: 'Public', description: 'Anyone can view your profile'},
              { value: 'connections_only'as const, label: 'Connections Only', description: 'Only approved connections can view your profile'},
              { value: 'private'as const, label: 'Private', description: 'Only you can view your profile'}
            ].map((option) => (
              <label key={option.value} className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="profileVisibility"
                  value={option.value}
                  checked={formData.profileVisibility === option.value}
                  onChange={(e) => setFormData({...formData, profileVisibility: toProfileVisibility(e.target.value)})}
                  className="mt-1 border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getVisibilityIcon(option.value)}
                    <span className="font-medium text-gray-900">{option.label}</span>
                  </div>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Section Visibility */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Section Visibility
          </label>
          <p className="text-sm text-gray-600 mb-4">
            Choose which sections of your profile are visible to others
          </p>

          <div className="space-y-3">
            {[
              { key: 'showEducation'as SectionVisibilityKey, label: 'Education', description: 'Your educational background and qualifications'},
              { key: 'showWorkExperience'as SectionVisibilityKey, label: 'Work Experience', description: 'Your professional experience and career history'},
              { key: 'showSkills'as SectionVisibilityKey, label: 'Skills', description: 'Your technical and professional skills'},
              { key: 'showPortfolio'as SectionVisibilityKey, label: 'Portfolio & Links', description: 'Your portfolio websites and professional links'},
              { key: 'showResume'as SectionVisibilityKey, label: 'Resume', description: 'Your uploaded resume files'}
            ].map((section) => (
              <div key={section.key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={section.key}
                    checked={formData[section.key]}
                    onChange={(e) => setFormData({...formData, [section.key]: e.target.checked})}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <label htmlFor={section.key} className="font-medium text-gray-900 cursor-pointer">
                      {section.label}
                    </label>
                    <p className="text-sm text-gray-600">{section.description}</p>
                  </div>
                </div>
                {formData[section.key] ? (
                  <Eye size={18} className="text-green-600" />
                ) : (
                  <EyeOff size={18} className="text-gray-400" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Preferences */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Contact Preferences
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <label className="font-medium text-gray-900 flex items-center gap-2">
                  <Shield size={18} className="text-blue-600" />
                  Allow contact from employers
                </label>
                <p className="text-sm text-gray-600">Employers can send you messages and job opportunities</p>
              </div>
              <input
                type="checkbox"
                checked={formData.allowContactFromEmployers}
                onChange={(e) => setFormData({...formData, allowContactFromEmployers: e.target.checked})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Data Usage */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Data Usage & Analytics
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <label className="font-medium text-gray-900">
                  Allow data analytics
                </label>
                <p className="text-sm text-gray-600">Help us improve our services by analyzing usage patterns</p>
              </div>
              <input
                type="checkbox"
                checked={formData.allowDataAnalytics}
                onChange={(e) => setFormData({...formData, allowDataAnalytics: e.target.checked})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <label className="font-medium text-gray-900">
                  Marketing emails
                </label>
                <p className="text-sm text-gray-600">Receive emails about new features and job opportunities</p>
              </div>
              <input
                type="checkbox"
                checked={formData.allowMarketingEmails}
                onChange={(e) => setFormData({...formData, allowMarketingEmails: e.target.checked})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Data Retention */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Data Retention Period
          </label>
          <select
            value={formData.dataRetentionPeriod}
            onChange={(e) => setFormData({...formData, dataRetentionPeriod: e.target.value})}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="indefinite">Keep indefinitely</option>
            <option value="7_years">7 years</option>
            <option value="5_years">5 years</option>
            <option value="3_years">3 years</option>
            <option value="1_year">1 year</option>
          </select>
          <p className="text-sm text-gray-600 mt-1">
            How long to keep your data after account deactivation
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-1">Privacy Information</h4>
              <p className="text-sm text-blue-800">
                Your privacy settings control how your information is shared and used.
                You can change these settings at any time. For more information,
                please review our Privacy Policy.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={18} />
            {loading ? 'Saving...': 'Save Privacy Settings'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PrivacySection;