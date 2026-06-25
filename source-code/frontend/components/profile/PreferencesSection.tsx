import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle, X, DollarSign, Info } from 'lucide-react';
import { updateCandidateProfile, updateJobPreferences } from '../../services/candidateAPI';

// =====================================================
// TYPE DEFINITIONS
// =====================================================
interface JobPreferences {
  preferred_job_types?: string[];
  preferred_industries?: string[];
  preferred_locations?: string[];
  preferred_languages?: string[];
  job_types?: string[];
  industries?: string[];
  locations?: string[];
  languages?: string[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  remote_work_preference?: string;
  willing_to_relocate?: boolean;
  availability_status?: string;
  availability_date?: string | null;
  job_level?: string;
  keywords?: string;
}

interface CompletionStatus {
  isComplete?: boolean;
  sections?: {
    preferences?: boolean;
    basicInfo?: boolean;
    education?: boolean;
    experience?: boolean;
    skills?: boolean;
    resume?: boolean;
    portfolio?: boolean;
  };
}

interface ProfileData {
  profile?: {
    job_preferences?: JobPreferences;
    first_name?: string;
    last_name?: string;
    email?: string;
    location?: string;
    headline?: string;
    years_experience?: number;
    availability_status?: string;
    languages?: string[];
  };
  job_preferences?: JobPreferences;
  education?: any[];
  experience?: any[];
  skills?: any[];
  resumes?: any[];
  portfolioLinks?: any[];
}

interface PreferencesSectionProps {
  profile: ProfileData | null;
  onUpdate: () => void;
  completionStatus?: any;
  onCompletionUpdate?: () => void;
}

interface FormData {
  preferredJobTypes: string[];
  preferredLocations: string[];
  preferredLanguages: string[];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  remoteWorkPreference: string;
  willingToRelocate: boolean;
  availabilityStatus: string;
  availabilityDate: string;
  jobLevel: string;
  keywords: string;
}

// =====================================================
// COMPONENT
// =====================================================
const PreferencesSection: React.FC<PreferencesSectionProps> = ({ 
  profile, 
  onUpdate, 
  completionStatus 
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<FormData>({
    preferredJobTypes: [],
    preferredLocations: [],
    preferredLanguages: [],
    salaryMin: '',
    salaryMax: '',
    salaryCurrency: 'USD',
    remoteWorkPreference: 'flexible',
    willingToRelocate: false,
    availabilityStatus: 'actively_looking',
    availabilityDate: '',
    jobLevel: 'entry',
    keywords: ''
  });

  const isProfileComplete = completionStatus?.isComplete || false;
  const completionSections = completionStatus?.sections || {};

  const [salaryErrors, setSalaryErrors] = useState<{ min: string; max: string; range: string }>({ min: '', max: '', range: '' });
  const [saveStatus,  setSaveStatus]    = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage]   = useState('');

  const [customInputs, setCustomInputs] = useState({
    location: '',
    language: ''
  });

  // Initialize form data from profile when it loads
  useEffect(() => {
    const prefs = profile?.profile?.job_preferences || profile?.job_preferences;
    if (prefs) {
      setFormData({
        preferredJobTypes: normalizeStringArray(prefs.preferred_job_types || prefs.job_types),
        preferredLocations: normalizeStringArray(prefs.preferred_locations || prefs.locations),
        preferredLanguages: normalizeStringArray(prefs.preferred_languages || prefs.languages || profile?.profile?.languages),
        salaryMin: prefs.salary_min?.toString() || '',
        salaryMax: prefs.salary_max?.toString() || '',
        salaryCurrency: prefs.salary_currency || 'USD',
        remoteWorkPreference: prefs.remote_work_preference || 'flexible',
        willingToRelocate: prefs.willing_to_relocate || false,
        availabilityStatus: prefs.availability_status || 'actively_looking',
        availabilityDate: prefs.availability_date || '',
        jobLevel: prefs.job_level || 'entry',
        keywords: prefs.keywords || ''
      });
    }
  }, [profile]);

  const normalizeStringArray = (value: any): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          return item?.name || item?.label || '';
        })
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      try {
        return normalizeStringArray(JSON.parse(value));
      } catch {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    if (typeof value === 'object') {
      return normalizeStringArray(Object.values(value));
    }
    return [];
  };

  const uniqueValues = (values: string[]) => Array.from(new Set(
    values.map((value) => value.trim()).filter(Boolean)
  ));

  // ✅ UPDATED: Validate salary - allow either min OR max independently
  const validateSalary = (min: string, max: string): { min: string; max: string; range: string } => {
    const errors = { min: '', max: '', range: '' };
    
    // If both are empty, it's valid (optional)
    if (!min && !max) {
      return errors;
    }

    const minVal = min ? parseInt(min) : null;
    const maxVal = max ? parseInt(max) : null;

    // Validate min if provided
    if (minVal !== null && minVal < 0) {
      errors.min = 'Minimum salary cannot be negative';
    }
    
    // Validate max if provided
    if (maxVal !== null && maxVal < 0) {
      errors.max = 'Maximum salary cannot be negative';
    }

    // Only validate range if BOTH are provided
    if (minVal !== null && maxVal !== null) {
      if (minVal > maxVal) {
        errors.max = 'Maximum must be greater than the minimum';
        errors.range = 'Range is inverted — the maximum is below the minimum';
      } else if (minVal === maxVal) {
        errors.range = 'Minimum equals maximum — a range gives employers more flexibility';
      }
    }
    
    return errors;
  };

  const handleSalaryChange = (field: 'salaryMin' | 'salaryMax', value: string) => {
    const next = { ...formData, [field]: value };
    setFormData(next);
    setSalaryErrors(validateSalary(next.salaryMin, next.salaryMax));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setSaveStatus('idle');

    // Validate salary before submit
    const errs = validateSalary(formData.salaryMin, formData.salaryMax);
    setSalaryErrors(errs);
    if (errs.min || errs.max || errs.range === 'Range is inverted — the maximum is below the minimum') {
      setSaveStatus('error');
      setSaveMessage('Please fix the salary range errors before saving.');
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        preferred_job_types: formData.preferredJobTypes,
        preferred_locations: uniqueValues(formData.preferredLocations),
        preferred_languages: uniqueValues(formData.preferredLanguages),
        locations: uniqueValues(formData.preferredLocations),
        languages: uniqueValues(formData.preferredLanguages),
        salary_min: formData.salaryMin ? parseInt(formData.salaryMin) : null,
        salary_max: formData.salaryMax ? parseInt(formData.salaryMax) : null,
        salary_currency: formData.salaryCurrency,
        remote_work_preference: formData.remoteWorkPreference,
        willing_to_relocate: formData.willingToRelocate,
        availability_status: formData.availabilityStatus,
        availability_date: formData.availabilityDate || null,
        job_level: formData.jobLevel,
        keywords: formData.keywords
      };

      await updateJobPreferences(submitData);
      await updateCandidateProfile({
        languages: uniqueValues(formData.preferredLanguages)
      });
      onUpdate();
      setSaveStatus('success');
      setSaveMessage(
        isProfileComplete
          ? 'Job preferences saved successfully!'
          : 'Preferences saved! Complete the remaining profile sections to improve your job matches.'
      );
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      setSaveStatus('error');
      setSaveMessage('Failed to save: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (
    field: keyof Pick<FormData, 'preferredJobTypes' | 'preferredLocations' | 'preferredLanguages'>, 
    value: string, 
    checked: boolean
  ): void => {
    const currentArray = [...(formData[field] as string[])];
    if (checked) {
      if (!currentArray.includes(value)) {
        setFormData({
          ...formData,
          [field]: [...currentArray, value]
        });
      }
    } else {
      setFormData({
        ...formData,
        [field]: currentArray.filter(item => item !== value)
      });
    }
  };

  const addCustomValue = (
    field: 'preferredLocations' | 'preferredLanguages',
    inputKey: 'location' | 'language'
  ): void => {
    const value = customInputs[inputKey].trim();
    if (!value) return;
    setFormData({
      ...formData,
      [field]: uniqueValues([...(formData[field] as string[]), value])
    });
    setCustomInputs({
      ...customInputs,
      [inputKey]: ''
    });
  };

  const removeValue = (
    field: 'preferredLocations' | 'preferredLanguages',
    value: string
  ): void => {
    setFormData({
      ...formData,
      [field]: (formData[field] as string[]).filter(item => item !== value)
    });
  };

  const renderTagInput = (
    label: string,
    field: 'preferredLocations' | 'preferredLanguages',
    inputKey: 'location' | 'language',
    placeholder: string,
    commonValues: string[] = []
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">{label}</label>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={customInputs[inputKey]}
          onChange={(e) => setCustomInputs({ ...customInputs, [inputKey]: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustomValue(field, inputKey);
            }
          }}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => addCustomValue(field, inputKey)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {commonValues.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {commonValues.map((value) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(formData[field] as string[]).includes(value)}
                onChange={(e) => handleCheckboxChange(field as any, value, e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{value}</span>
            </label>
          ))}
        </div>
      )}

      {(formData[field] as string[]).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(formData[field] as string[]).map((value) => (
            <span key={value} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              {value}
              <button
                type="button"
                onClick={() => removeValue(field, value)}
                className="text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const jobTypes = [
    'Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'
  ];

  const commonLocations = [
    'Kigali, Rwanda', 'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 
    'Chicago, IL', 'Austin, TX', 'Seattle, WA', 'Boston, MA', 'Denver, CO', 'Remote'
  ];

  const commonLanguages = [
    'English', 'Kinyarwanda', 'French', 'Swahili', 'Spanish', 'Arabic'
  ];

  return (
    <div className="space-y-6">
      {/* Profile Completion Warning */}
      {!isProfileComplete && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-yellow-600 mt-0.5">⚠️</div>
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Complete your profile first</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Your profile is incomplete. Complete the missing sections to get better job matches and improve your visibility to employers.
              </p>
              {!completionSections.preferences && (
                <p className="text-sm text-yellow-700 mt-2">
                  <strong>Tip:</strong> Setting your job preferences helps us match you with relevant opportunities.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-900">Job Preferences</h2>
          {completionSections.preferences ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
              ✓ Complete
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
              ⚠ Incomplete
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">Set your preferences to get better job matches</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Job Types */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Preferred Job Types
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {jobTypes.map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.preferredJobTypes.includes(type)}
                  onChange={(e) => handleCheckboxChange('preferredJobTypes', type, e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Locations - Using Tag Input */}
        {renderTagInput(
          'Preferred Locations',
          'preferredLocations',
          'location',
          'Type a location, e.g. Kigali, Rwanda or Remote',
          commonLocations
        )}

        {/* Languages - Using Tag Input */}
        {renderTagInput(
          'Preferred Languages',
          'preferredLanguages',
          'language',
          'Type a language, e.g. English, Kinyarwanda, French',
          commonLanguages
        )}

        {/* ✅ Salary Range - Now OPTIONAL - Can set either min OR max independently */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Salary Expectations <span className="text-xs font-normal text-gray-400">(Optional - set either minimum or maximum)</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Minimum */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Minimum (annual)</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="number"
                  value={formData.salaryMin}
                  onChange={e => handleSalaryChange('salaryMin', e.target.value)}
                  className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                    salaryErrors.min ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                  placeholder="Set minimum only"
                  min="0"
                  step="1000"
                />
              </div>
              {salaryErrors.min && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle size={12} />{salaryErrors.min}
                </p>
              )}
            </div>


            {/* Currency */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
              <select
                value={formData.salaryCurrency}
                onChange={e => setFormData({...formData, salaryCurrency: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD (C$)</option>
                <option value="AUD">AUD (A$)</option>
                <option value="RWF">Rwandan Franc (RWF)</option>
              </select>
            </div>
          </div>

          {/* Range status feedback */}
          {(() => {
            const min = formData.salaryMin ? parseInt(formData.salaryMin) : null;
            const max = formData.salaryMax ? parseInt(formData.salaryMax) : null;
            const cur = formData.salaryCurrency;
            const fmt = (n: number) => n.toLocaleString();

            // Not set at all - optional
            if (!formData.salaryMin && !formData.salaryMax) {
              return (
                <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
                  <Info size={15} className="text-gray-400 shrink-0" />
                  Salary not set — employers won't see a salary expectation on your profile.
                </div>
              );
            }

            // ✅ Only MINIMUM set
            if (min !== null && max === null) {
              return (
                <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  <Info size={15} className="shrink-0" />
                  Minimum set to <strong>{cur} {fmt(min)}</strong> — employers will see this as your minimum expectation.
                </div>
              );
            }

            // ✅ Only MAXIMUM set
            if (max !== null && min === null) {
              return (
                <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  <Info size={15} className="shrink-0" />
                  Maximum set to <strong>{cur} {fmt(max)}</strong> — employers will see this as your maximum expectation.
                </div>
              );
            }

            // Range warning/info
            if (salaryErrors.range) {
              const isError = salaryErrors.range.includes('inverted');
              return (
                <div className={`mt-3 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
                  isError ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-amber-50 border border-amber-200 text-amber-700'
                }`}>
                  <AlertCircle size={15} className="shrink-0" />
                  {salaryErrors.range}
                </div>
              );
            }

            // ✅ Both set - valid range
            if (min !== null && max !== null && min <= max) {
              return (
                <div className="mt-4 px-4 py-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex justify-between items-end mb-2">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Minimum</p>
                      <p className="text-sm font-bold text-green-800">{cur} {fmt(min)}</p>
                    </div>
                    <CheckCircle size={16} className="text-green-500 mb-1" />
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Maximum</p>
                      <p className="text-sm font-bold text-green-800">{cur} {fmt(max)}</p>
                    </div>
                  </div>
                  <div className="relative h-2 bg-green-200 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-green-600 rounded-full" />
                  </div>
                  <p className="text-xs text-green-600 text-center mt-2 font-medium">
                    Range: {cur} {fmt(max - min)} spread
                  </p>
                </div>
              );
            }

            return null;
          })()}
        </div>

        {/* Remote Work */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Remote Work Preference
          </label>
          <div className="space-y-2">
            {[
              { value: 'remote_only', label: 'Remote work only' },
              { value: 'office_only', label: 'Office work only' },
              { value: 'hybrid', label: 'Hybrid (mix of remote and office)' },
              { value: 'flexible', label: 'Flexible' }
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="remoteWork"
                  value={option.value}
                  checked={formData.remoteWorkPreference === option.value}
                  onChange={(e) => setFormData({...formData, remoteWorkPreference: e.target.value})}
                  className="border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Relocation */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="relocate"
            checked={formData.willingToRelocate}
            onChange={(e) => setFormData({...formData, willingToRelocate: e.target.checked})}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="relocate" className="text-sm text-gray-700 cursor-pointer">
            Willing to relocate for the right opportunity
          </label>
        </div>

        {/* Availability */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Current Availability
          </label>
          <div className="space-y-3">
            <select
              value={formData.availabilityStatus}
              onChange={(e) => setFormData({...formData, availabilityStatus: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="actively_looking">Actively looking for new opportunities</option>
              <option value="open_to_offers">Open to offers</option>
              <option value="not_looking">Not currently looking</option>
              <option value="available_soon">Available soon</option>
            </select>

            {formData.availabilityStatus === 'available_soon' && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">Available starting</label>
                <input
                  type="date"
                  value={formData.availabilityDate}
                  onChange={(e) => setFormData({...formData, availabilityDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}
          </div>
        </div>

        {/* Save status banner */}
        {saveStatus !== 'idle' && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
            saveStatus === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {saveStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span className="flex-1">{saveMessage}</span>
            <button onClick={() => setSaveStatus('idle')}><X size={14} /></button>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !!(salaryErrors.min || salaryErrors.max)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
              : <><Save size={18} />Save Preferences</>
            }
          </button>
        </div>
      </form>
    </div>
  );
};

export default PreferencesSection;