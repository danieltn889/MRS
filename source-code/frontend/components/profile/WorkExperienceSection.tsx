import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, Briefcase, Calendar, MapPin, Building } from 'lucide-react';
import { addWorkExperience, updateWorkExperience, deleteWorkExperience } from '../../services/candidateAPI';

// =====================================================
// TYPE DEFINITIONS
// =====================================================
interface WorkExperienceItem {
  id: string | number;
  company?: string;
  company_id?: string;
  title?: string;
  employment_type?: string;
  location?: string;
  location_type?: string;
  start_date?: string;
  end_date?: string | null;
  is_current?: boolean;
  description?: string;
  achievements?: string[] | null;
  skills?: string[] | null;
  industry?: string;
  team_size?: number | string | null;
  reports_to?: string;
  reason_for_leaving?: string;
  display_order?: number;
}

interface WorkExperienceSectionProps {
  profile: {
    workExperience?: WorkExperienceItem[];
    experience?: WorkExperienceItem[];
  } | null;
  onUpdate: () => void;
}

interface FormData {
  company: string;
  companyId: string;
  title: string;
  employmentType: string;
  location: string;
  locationType: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  achievements: string[];
  skills: string[];
  industry: string;
  teamSize: string;
  reportsTo: string;
  reasonForLeaving: string;
  displayOrder: number;
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
const getEmploymentTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    'contract': 'Contract',
    'internship': 'Internship',
    'freelance': 'Freelance',
    'self-employed': 'Self-employed'
  };
  return labels[type] || type;
};

const getLocationTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'onsite': 'On-site',
    'remote': 'Remote',
    'hybrid': 'Hybrid'
  };
  return labels[type] || type;
};

// =====================================================
// COMPONENT
// =====================================================
const WorkExperienceSection: React.FC<WorkExperienceSectionProps> = ({ profile, onUpdate }) => {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    company: '',
    companyId: '',
    title: '',
    employmentType: 'full-time',
    location: '',
    locationType: 'onsite',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
    achievements: [''],
    skills: [''],
    industry: '',
    teamSize: '',
    reportsTo: '',
    reasonForLeaving: '',
    displayOrder: 0
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string>('');

  const experience = profile?.workExperience || profile?.experience || [];

  const resetForm = (): void => {
    setFormData({
      company: '',
      companyId: '',
      title: '',
      employmentType: 'full-time',
      location: '',
      locationType: 'onsite',
      startDate: '',
      endDate: '',
      isCurrent: false,
      description: '',
      achievements: [''],
      skills: [''],
      industry: '',
      teamSize: '',
      reportsTo: '',
      reasonForLeaving: '',
      displayOrder: 0
    });
    setDateError('');
  };

  const validateDateRange = (): string | null => {
    if (!formData.startDate) {
      return 'Start date is required.';
    }

    const today = new Date();
    const start = new Date(formData.startDate);

    if (isNaN(start.getTime())) {
      return 'Please provide a valid start date.';
    }

    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (startDay > todayDay) {
      return 'Start date cannot be in the future.';
    }

    if (formData.isCurrent) {
      return null;
    }

    if (!formData.endDate) {
      return 'End date is required when this is not a current position.';
    }

    const end = new Date(formData.endDate);
    if (isNaN(end.getTime())) {
      return 'Please provide a valid end date.';
    }

    if (end <= start) {
      return 'End date must be after start date.';
    }

    // Removed the 1-year minimum requirement - allows short-term positions
    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    const validationError = validateDateRange();
    if (validationError) {
      setDateError(validationError);
      return;
    }

    setDateError('');
    setLoading(true);

    try {
      const submitData = {
        company: formData.company,
        company_id: formData.companyId || undefined,
        title: formData.title,
        employmentType: formData.employmentType,
        location: formData.location || undefined,
        locationType: formData.locationType,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate || null,
        isCurrent: formData.isCurrent,
        description: formData.description || undefined,
        achievements: formData.achievements.filter(a => a && a.trim()),
        skills: formData.skills.filter(s => s && s.trim()),
        industry: formData.industry || undefined,
        teamSize: formData.teamSize ? parseInt(formData.teamSize) : undefined,
        reportsTo: formData.reportsTo || undefined,
        reasonForLeaving: formData.reasonForLeaving || undefined,
        displayOrder: formData.displayOrder
      };

      if (editingId) {
        await updateWorkExperience(editingId, submitData);
      } else {
        await addWorkExperience(submitData);
      }

      onUpdate();
      setIsAdding(false);
      setEditingId(null);
      resetForm();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error saving work experience:', error);
      alert('Error saving work experience: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (exp: WorkExperienceItem): void => {
    setFormData({
      company: exp.company || '',
      companyId: exp.company_id || '',
      title: exp.title || '',
      employmentType: exp.employment_type || 'full-time',
      location: exp.location || '',
      locationType: exp.location_type || 'onsite',
      startDate: exp.start_date ? exp.start_date.split('T')[0] : '',
      endDate: exp.end_date ? exp.end_date.split('T')[0] : '',
      isCurrent: exp.is_current || false,
      description: exp.description || '',
      achievements: Array.isArray(exp.achievements) && exp.achievements.length ? exp.achievements : [''],
      skills: Array.isArray(exp.skills) && exp.skills.length ? exp.skills : [''],
      industry: exp.industry || '',
      teamSize: exp.team_size?.toString() || '',
      reportsTo: exp.reports_to || '',
      reasonForLeaving: exp.reason_for_leaving || '',
      displayOrder: exp.display_order || 0
    });
    setEditingId(String(exp.id));
    setIsAdding(true);
  };

  const handleDelete = async (id: string | number): Promise<void> => {
    if (!confirm('Are you sure you want to delete this work experience?')) return;

    try {
      await deleteWorkExperience(String(id));
      onUpdate();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error deleting work experience:', error);
      alert('Error deleting work experience: ' + errorMessage);
    }
  };

  const handleCancel = (): void => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const addAchievement = (): void => {
    setFormData({
      ...formData,
      achievements: [...formData.achievements, '']
    });
  };

  const updateAchievement = (index: number, value: string): void => {
    const newAchievements = [...formData.achievements];
    newAchievements[index] = value;
    setFormData({
      ...formData,
      achievements: newAchievements
    });
  };

  const removeAchievement = (index: number): void => {
    setFormData({
      ...formData,
      achievements: formData.achievements.filter((_, i) => i !== index)
    });
  };

  const addSkill = (): void => {
    setFormData({
      ...formData,
      skills: [...formData.skills, '']
    });
  };

  const updateSkill = (index: number, value: string): void => {
    const newSkills = [...formData.skills];
    newSkills[index] = value;
    setFormData({
      ...formData,
      skills: newSkills
    });
  };

  const removeSkill = (index: number): void => {
    setFormData({
      ...formData,
      skills: formData.skills.filter((_, i) => i !== index)
    });
  };

  const getYear = (dateValue?: string | null): string => {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? 'N/A' : date.getFullYear().toString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Work Experience</h2>
          <p className="text-sm text-gray-600">Add your professional experience</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add Experience
          </button>
        )}
      </div>

      {/* Experience Form */}
      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">
            {editingId ? 'Edit Work Experience' : 'Add Work Experience'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company *
                </label>
                <input
                  type="text"
                  required
                  value={formData.company}
                  onChange={(e) => setFormData({...formData, company: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Tech Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Software Engineer"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employment Type
                </label>
                <select
                  value={formData.employmentType}
                  onChange={(e) => setFormData({...formData, employmentType: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                  <option value="self-employed">Self-employed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location Type
                </label>
                <select
                  value={formData.locationType}
                  onChange={(e) => setFormData({...formData, locationType: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="onsite">On-site</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Kigali, Rwanda"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  value={formData.industry}
                  onChange={(e) => setFormData({...formData, industry: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Technology"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  disabled={formData.isCurrent}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  min={formData.startDate || undefined}
                />
              </div>
            </div>

            {dateError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {dateError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCurrent"
                checked={formData.isCurrent}
                onChange={(e) => setFormData({...formData, isCurrent: e.target.checked, endDate: e.target.checked ? '' : formData.endDate})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isCurrent" className="text-sm text-gray-700 cursor-pointer">
                I currently work here
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe your role, responsibilities, and impact..."
              />
            </div>

            {/* Achievements */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Key Achievements
                </label>
                <button
                  type="button"
                  onClick={addAchievement}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Achievement
                </button>
              </div>
              {formData.achievements.map((achievement, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={achievement}
                    onChange={(e) => updateAchievement(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Increased team productivity by 30%"
                  />
                  {formData.achievements.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAchievement(index)}
                      className="p-2 text-red-500 hover:text-red-700"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Skills Used */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Skills Used
                </label>
                <button
                  type="button"
                  onClick={addSkill}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Skill
                </button>
              </div>
              {formData.skills.map((skill, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={skill}
                    onChange={(e) => updateSkill(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., React, Node.js, Project Management"
                  />
                  {formData.skills.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSkill(index)}
                      className="p-2 text-red-500 hover:text-red-700"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team Size
                </label>
                <input
                  type="number"
                  value={formData.teamSize}
                  onChange={(e) => setFormData({...formData, teamSize: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 5"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reports To
                </label>
                <input
                  type="text"
                  value={formData.reportsTo}
                  onChange={(e) => setFormData({...formData, reportsTo: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Engineering Manager"
                />
              </div>
            </div>

            {!formData.isCurrent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Leaving (Optional)
                </label>
                <textarea
                  value={formData.reasonForLeaving}
                  onChange={(e) => setFormData({...formData, reasonForLeaving: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Career growth, relocation, company restructuring..."
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                <X size={18} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Experience List */}
      <div className="space-y-4">
        {experience.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Briefcase size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No work experience added yet</p>
            <p className="text-sm">Add your professional experience to complete your profile</p>
          </div>
        ) : (
          experience.map((exp) => (
            <div key={exp.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <Briefcase size={20} className="text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">{exp.title}</h3>
                    {exp.is_current && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-gray-600 mb-2 flex-wrap">
                    <Building size={16} />
                    <span className="font-medium">{exp.company}</span>
                    {exp.industry && <span>• {exp.industry}</span>}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar size={16} />
                      {getYear(exp.start_date)} - {exp.is_current ? 'Present' : getYear(exp.end_date)}
                    </div>
                    {exp.location && (
                      <div className="flex items-center gap-1">
                        <MapPin size={16} />
                        {exp.location}
                      </div>
                    )}
                    <span className="capitalize">{getEmploymentTypeLabel(exp.employment_type || '')}</span>
                    {exp.location_type && (
                      <span className="capitalize">{getLocationTypeLabel(exp.location_type)}</span>
                    )}
                  </div>

                  {exp.description && (
                    <p className="text-gray-700 text-sm mb-3 whitespace-pre-line">{exp.description}</p>
                  )}

                  {exp.achievements && exp.achievements.length > 0 && exp.achievements[0] && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Key Achievements:</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {exp.achievements.map((achievement, idx) => (
                          achievement && achievement.trim() && (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-green-500 mt-1">•</span>
                              {achievement}
                            </li>
                          )
                        ))}
                      </ul>
                    </div>
                  )}

                  {exp.skills && exp.skills.length > 0 && exp.skills.some(s => s && s.trim()) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {exp.skills.map((skill, idx) => (
                        skill && skill.trim() && (
                          <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {skill}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(exp)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                    type="button"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(exp.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                    type="button"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WorkExperienceSection;