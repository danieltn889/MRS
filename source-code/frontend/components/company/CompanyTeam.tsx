import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Edit3, Trash2, X, Mail, Phone, Linkedin, Crown, Upload, Loader2 } from 'lucide-react';
import type { NotifyFn } from './CompanyProfile';
import { getCompanyTeam, addTeamMember, updateTeamMember, deleteTeamMember, uploadTeamMemberPhoto } from '../../services/companyAPI';

const API_BASE_URL = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : 'http://localhost:3001';

interface TeamMember {
  id: string;
  name: string;
  title: string;
  department?: string;
  email?: string;
  phone?: string;
  bio?: string;
  expertise?: string[];
  linkedinUrl?: string;
  role: 'admin' | 'recruiter' | 'reviewer' | 'viewer';
  displayOnProfile: boolean;
  isLeadership: boolean;
  displayOrder: number;
  photo_url?: string;
  photoUrl?: string;
  joined_at: string;
  updated_at: string;
}

const CompanyTeam: React.FC<{ onNotify?: NotifyFn }> = ({ onNotify }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    department: '',
    email: '',
    phone: '',
    bio: '',
    expertise: [] as string[],
    linkedinUrl: '',
    role: 'viewer' as TeamMember['role'],
    displayOnProfile: true,
    isLeadership: false,
    displayOrder: 0,
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTeam();
  }, []);

  const loadTeam = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getCompanyTeam();
      const members = (response.data || []).map((member: any) => ({
        ...member,
        photoUrl: member.photo_url || member.photoUrl,
        joinedAt: member.joined_at || member.joinedAt,
        updatedAt: member.updated_at || member.updatedAt,
      }));
      setTeamMembers(members);
    } catch (err: any) {
      console.error('Error loading team:', err);
      setError(err.message || 'Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      title: '',
      department: '',
      email: '',
      phone: '',
      bio: '',
      expertise: [],
      linkedinUrl: '',
      role: 'viewer',
      displayOnProfile: true,
      isLeadership: false,
      displayOrder: 0,
    });
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Full name is required';
    if (formData.name.trim().length < 2) return 'Name must be at least 2 characters';
    if (!formData.title.trim()) return 'Job title is required';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) return 'Enter a valid email address';
    if (formData.phone && !/^[+\d\s\-().]{7,20}$/.test(formData.phone.trim())) return 'Enter a valid phone number';
    if (formData.linkedinUrl && formData.linkedinUrl.trim()) {
      try { new URL(formData.linkedinUrl.startsWith('http') ? formData.linkedinUrl : `https://${formData.linkedinUrl}`); }
      catch { return 'Enter a valid LinkedIn URL'; }
    }
    if (formData.bio && formData.bio.length > 500) return 'Bio must be 500 characters or less';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // ✅ FIX: Use undefined instead of null to avoid validation errors
      const memberData: any = {
        name: formData.name.trim(),
        title: formData.title.trim(),
        role: formData.role,
        displayOnProfile: formData.displayOnProfile,
        isLeadership: formData.isLeadership,
        displayOrder: formData.displayOrder || 0,
      };

      // Only add optional fields if they have values
      if (formData.department?.trim()) {
        memberData.department = formData.department.trim();
      }
      if (formData.email?.trim()) {
        memberData.email = formData.email.trim();
      }
      if (formData.phone?.trim()) {
        memberData.phone = formData.phone.trim();
      }
      if (formData.bio?.trim()) {
        memberData.bio = formData.bio.trim();
      }
      if (formData.expertise.length > 0) {
        memberData.expertise = formData.expertise;
      }
      if (formData.linkedinUrl?.trim()) {
        memberData.linkedinUrl = formData.linkedinUrl.trim();
      }

      console.log('📤 Sending member data:', memberData);

      let memberId: string;

      if (editingMember) {
        await updateTeamMember(editingMember.id, memberData);
        memberId = editingMember.id;
        setSuccess('Team member updated successfully!');
        onNotify?.('success', 'Member Updated', `${memberData.name} has been updated.`, `Role: ${memberData.role} · Title: ${memberData.title}`);
      } else {
        const response = await addTeamMember(memberData);
        memberId = response.data.id;
        setSuccess('Team member added successfully!');
        onNotify?.('success', 'Invitation Sent', `Invitation sent to ${memberData.email || memberData.name}.`, `Role: ${memberData.role} · Expires in 7 days`);
      }

      if (photoFile && memberId) {
        try {
          setUploadingPhoto(true);
          await uploadTeamMemberPhoto(memberId, photoFile);
        } catch (photoErr: any) {
          console.error('Error uploading photo:', photoErr);
          setError('Member saved but photo upload failed: ' + photoErr.message);
        } finally {
          setUploadingPhoto(false);
        }
      }

      await loadTeam();
      setShowAddForm(false);
      setEditingMember(null);
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error saving team member:', err);
      const msg = err.message || 'Failed to save team member';
      setError(msg);
      onNotify?.('error', 'Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      title: member.title,
      department: member.department || '',
      email: member.email || '',
      phone: member.phone || '',
      bio: member.bio || '',
      expertise: member.expertise || [],
      linkedinUrl: member.linkedinUrl || '',
      role: member.role || 'viewer',
      displayOnProfile: member.displayOnProfile !== false,
      isLeadership: member.isLeadership || false,
      displayOrder: member.displayOrder || 0,
    });
    const photoUrl = member.photo_url || member.photoUrl;
    if (photoUrl) {
      setPhotoPreview(photoUrl.startsWith('http') ? photoUrl : `${API_BASE_URL}${photoUrl}`);
    } else {
      setPhotoPreview(null);
    }
    setShowAddForm(true);
  };

  const handleDelete = async (memberId: string) => {
    if (!confirm('Are you sure you want to delete this team member?')) return;

    try {
      setError(null);
      await deleteTeamMember(memberId);
      setSuccess('Team member deleted successfully!');
      onNotify?.('info', 'Member Removed', 'Team member has been removed from your company.');
      await loadTeam();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error deleting team member:', err);
      const msg = err.message || 'Failed to delete team member';
      setError(msg);
      onNotify?.('error', 'Delete Failed', msg);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const addExpertise = (skill: string) => {
    if (skill.trim() && !formData.expertise.includes(skill.trim())) {
      setFormData(prev => ({
        ...prev,
        expertise: [...prev.expertise, skill.trim()]
      }));
    }
  };

  const removeExpertise = (skill: string) => {
    setFormData(prev => ({
      ...prev,
      expertise: prev.expertise.filter(s => s !== skill)
    }));
  };

  const roles = [
    { value: 'admin', label: 'Admin', description: 'Full access to company profile management' },
    { value: 'recruiter', label: 'Recruiter', description: 'Can view and manage job postings' },
    { value: 'reviewer', label: 'Reviewer', description: 'Can review applications and candidates' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access to company profile' },
  ];

  const sortedTeamMembers = [...teamMembers].sort((a, b) => {
    if (a.isLeadership && !b.isLeadership) return -1;
    if (!a.isLeadership && b.isLeadership) return 1;
    return (a.displayOrder || 0) - (b.displayOrder || 0);
  });

  const getPhotoUrl = (member: TeamMember) => {
    const photoUrl = member.photo_url || member.photoUrl;
    if (!photoUrl) return null;
    return photoUrl.startsWith('http') ? photoUrl : `${API_BASE_URL}${photoUrl}`;
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading team members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Members</h2>
          <p className="text-gray-600 mt-1">Manage your company team and leadership</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingMember(null);
            resetForm();
          }}
          className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-5 w-5" />
          <span>Add Member</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <X className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="mb-6 bg-green-50 border-l-4 border-green-500 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
          onClick={() => {
            setShowAddForm(false);
            setEditingMember(null);
            resetForm();
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingMember ? 'Edit Team Member' : 'Add Team Member'}
              </h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setEditingMember(null);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Photo Upload */}
              <div className="flex items-center space-x-6">
                <div className="flex-shrink-0">
                  {photoPreview ? (
                    <div className="relative">
                      <img
                        src={photoPreview}
                        alt="Team member"
                        className="h-24 w-24 object-cover rounded-lg border shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreview(null);
                          setPhotoFile(null);
                        }}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-sm"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-24 w-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                      <Users className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="inline-flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Upload className="h-4 w-4" />
                    <span>{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>
                  <p className="text-xs text-gray-500 mt-1">Max 5MB, JPG/PNG recommended</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Software Engineer"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Engineering"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as TeamMember['role'] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {roles.map(role => (
                      <option key={role.value} value={role.value}>
                        {role.label} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="john@company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">LinkedIn Profile</label>
                <input
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://linkedin.com/in/johndoe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                  rows={3}
                  maxLength={520}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${formData.bio.length > 500 ? 'border-orange-400' : 'border-gray-300'}`}
                  placeholder="Brief biography and background..."
                />
                <p className={`text-xs mt-1 text-right ${formData.bio.length > 480 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                  {formData.bio.length}/500
                </p>
              </div>

              {/* Expertise */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Expertise & Skills</label>
                <div className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    placeholder="Add a skill or expertise"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const input = e.target as HTMLInputElement;
                        addExpertise(input.value);
                        input.value = '';
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                      addExpertise(input.value);
                      input.value = '';
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {formData.expertise.map((skill, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeExpertise(skill)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Order</label>
                  <input
                    type="number"
                    value={formData.displayOrder}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="displayOnProfile"
                    checked={formData.displayOnProfile}
                    onChange={(e) => setFormData(prev => ({ ...prev, displayOnProfile: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="displayOnProfile" className="ml-2 text-sm text-gray-700">
                    Display on company profile
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isLeadership"
                    checked={formData.isLeadership}
                    onChange={(e) => setFormData(prev => ({ ...prev, isLeadership: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isLeadership" className="ml-2 text-sm text-gray-700">
                    Leadership team
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingMember(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingPhoto}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {saving || uploadingPhoto
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadingPhoto ? 'Uploading…' : 'Saving…'}</>
                  : editingMember ? 'Update Member' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sortedTeamMembers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No team members added yet</h3>
            <p className="text-gray-600 mb-4">Add your first team member to get started</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Add Team Member
            </button>
          </div>
        ) : (
          sortedTeamMembers.map((member) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border rounded-lg p-6 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 relative">
                  {getPhotoUrl(member) ? (
                    <img
                      src={getPhotoUrl(member)!}
                      alt={member.name}
                      className="h-16 w-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Users className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  {member.isLeadership && (
                    <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1 shadow-sm">
                      <Crown className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {member.name}
                    </h3>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEdit(member)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-blue-600 font-medium text-sm">{member.title}</p>
                  {member.department && (
                    <p className="text-sm text-gray-600">{member.department}</p>
                  )}

                  <div className="mt-3 space-y-1">
                    {member.email && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                    )}

                    {member.phone && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        <span>{member.phone}</span>
                      </div>
                    )}

                    {member.linkedinUrl && (
                      <div className="flex items-center space-x-2 text-sm">
                        <Linkedin className="h-3 w-3 flex-shrink-0 text-gray-600" />
                        <a
                          href={member.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline truncate"
                        >
                          LinkedIn
                        </a>
                      </div>
                    )}
                  </div>

                  {member.expertise && member.expertise.length > 0 && (
                    <div className="mt-3">
                      <div className="flex flex-wrap gap-1">
                        {member.expertise.slice(0, 3).map((skill, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800"
                          >
                            {skill.length > 20 ? skill.slice(0, 17) + '...' : skill}
                          </span>
                        ))}
                        {member.expertise.length > 3 && (
                          <span className="text-xs text-gray-500">
                            +{member.expertise.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {member.bio && (
                    <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                      {member.bio}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default CompanyTeam;