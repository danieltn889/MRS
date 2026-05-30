import React, { useState } from 'react';
import { Plus, Edit, Trash2, Save, X, GraduationCap, Calendar } from 'lucide-react';
import { addEducation, updateEducation, deleteEducation } from '../../services/candidateAPI';

interface EducationItem {
  id: string | number;
  institution?: string;
  degree?: string;
  field_of_study?: string;
  start_date?: string;
  end_date?: string | null;
  is_current?: boolean;
  grade?: string;
  grade_scale?: string;
  description?: string;
}

interface EducationSectionProps {
  profile: {
    education?: EducationItem[];
  } | null;
  onUpdate: () => void;
}

interface EducationFormData {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  grade: string;
  gradeScale: string;
  description: string;
}

const EducationSection = ({ profile, onUpdate }: EducationSectionProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EducationFormData>({
    institution: '',
    degree: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    grade: '',
    gradeScale: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [dateError, setDateError] = useState<string>('');

  const education = profile?.education || [];

  const resetForm = () => {
    setFormData({
      institution: '',
      degree: '',
      fieldOfStudy: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      grade: '',
      gradeScale: '',
      description: ''
    });
    setDateError('');
  };

  const validateDateRange = (): string | null => {
    if (!formData.startDate) {
      return 'Start date is required.';
    }

    const today = new Date();
    const start = new Date(formData.startDate);

    if (Number.isNaN(start.getTime())) {
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
      return 'End date is required when not currently studying.';
    }

    const end = new Date(formData.endDate);

    if (Number.isNaN(end.getTime())) {
      return 'Please provide valid start and end dates.';
    }

    if (end <= start) {
      return 'End date must be after start date.';
    }

    const minDurationMs = 365 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() <= minDurationMs) {
      return 'Study duration must be greater than 1 year.';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationError = validateDateRange();
    if (validationError) {
      setDateError(validationError);
      return;
    }

    setDateError('');
    setLoading(true);

    try {
      if (editingId) {
        await updateEducation(editingId, formData);
      } else {
        await addEducation(formData);
      }

      onUpdate();
      setIsAdding(false);
      setEditingId(null);
      resetForm();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Error saving education: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (edu: EducationItem) => {
    setFormData({
      institution: edu.institution || '',
      degree: edu.degree || '',
      fieldOfStudy: edu.field_of_study || '',
      startDate: edu.start_date ? edu.start_date.split('T')[0] : '',
      endDate: edu.end_date ? edu.end_date.split('T')[0] : '',
      isCurrent: edu.is_current || false,
      grade: edu.grade || '',
      gradeScale: edu.grade_scale || '',
      description: edu.description || ''
    });
    setEditingId(String(edu.id));
    setIsAdding(true);
  };

  const handleDelete = async (id: string | number) => {
    if (!confirm('Are you sure you want to delete this education entry?')) return;

    try {
      await deleteEducation(String(id));
      onUpdate();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Error deleting education: ' + errorMessage);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const getYear = (dateValue?: string | null): string => {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? 'N/A' : String(date.getFullYear());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Education</h2>
          <p className="text-sm text-gray-600">Add your educational background</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add Education
          </button>
        )}
      </div>

      {/* Education Form */}
      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">
            {editingId ? 'Edit Education' : 'Add Education'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution *
                </label>
                <input
                  type="text"
                  required
                  value={formData.institution}
                  onChange={(e) => setFormData({...formData, institution: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., University of Example"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Degree *
                </label>
                <input
                  type="text"
                  required
                  value={formData.degree}
                  onChange={(e) => setFormData({...formData, degree: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Bachelor of Science"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Field of Study
              </label>
              <input
                type="text"
                value={formData.fieldOfStudy}
                onChange={(e) => setFormData({...formData, fieldOfStudy: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Computer Science"
              />
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
              <label htmlFor="isCurrent" className="text-sm text-gray-700">
                I am currently studying here
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grade
                </label>
                <input
                  type="text"
                  value={formData.grade}
                  onChange={(e) => setFormData({...formData, grade: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 3.8"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grade Scale
                </label>
                <input
                  type="text"
                  value={formData.gradeScale}
                  onChange={(e) => setFormData({...formData, gradeScale: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., 4.0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Describe your studies, achievements, or relevant coursework..."
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={18} />
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                <X size={18} />
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Education List */}
      <div className="space-y-4">
        {education.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <GraduationCap size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No education added yet</p>
            <p className="text-sm">Add your educational background to complete your profile</p>
          </div>
        ) : (
          education.map((edu) => (
            <div key={edu.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <GraduationCap size={20} className="text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {edu.degree} in {edu.field_of_study}
                    </h3>
                  </div>

                  <p className="text-gray-600 mb-2">{edu.institution}</p>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar size={16} />
                      {getYear(edu.start_date)} - {
                        edu.is_current ? 'Present' : getYear(edu.end_date)
                      }
                    </div>
                    {edu.grade && (
                      <span>Grade: {edu.grade}{edu.grade_scale && `/${edu.grade_scale}`}</span>
                    )}
                  </div>

                  {edu.description && (
                    <p className="text-gray-700 text-sm">{edu.description}</p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(edu)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(edu.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
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

export default EducationSection;