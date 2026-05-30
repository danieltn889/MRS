import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Trash2, Save, X, Code, CheckCircle, AlertCircle, Star } from 'lucide-react';
import { addSkill, updateSkill, deleteSkill, getSkillsList } from '../../services/candidateAPI';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Skill {
  id: string;
  name: string;
  category?: string;
  skill_type?: string;
}

interface UserSkill {
  skill_id: string;
  name: string;
  proficiency_level: number;
  years_experience?: number;
  is_primary?: boolean;
  last_used?: string;
  skill_context?: string;
}

interface SkillsSectionProps {
  profile: { skills?: UserSkill[] } | null;
  onUpdate: () => void;
}

interface FormData {
  skillName: string;
  proficiencyLevel: number;
  yearsExperience: number;
  isPrimary: boolean;
  lastUsed: string;
  skillContext: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROFICIENCY: Record<number, { label: string; color: string; bar: string }> = {
  1: { label: 'Beginner',     color: 'bg-red-100 text-red-800',     bar: 'bg-red-400'    },
  2: { label: 'Intermediate', color: 'bg-orange-100 text-orange-800', bar: 'bg-orange-400' },
  3: { label: 'Advanced',     color: 'bg-yellow-100 text-yellow-800', bar: 'bg-yellow-400' },
  4: { label: 'Expert',       color: 'bg-blue-100 text-blue-800',   bar: 'bg-blue-500'   },
  5: { label: 'Master',       color: 'bg-green-100 text-green-800', bar: 'bg-green-500'  },
};

const profLabel = (n: number) => PROFICIENCY[n]?.label || 'Unknown';
const profColor = (n: number) => PROFICIENCY[n]?.color || 'bg-gray-100 text-gray-800';
const profBar   = (n: number) => PROFICIENCY[n]?.bar   || 'bg-gray-400';

// ── Delete Confirmation Modal ──────────────────────────────────────────────────

const DeleteModal = ({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
      <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Trash2 className="w-7 h-7 text-red-600" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">Remove Skill?</h3>
      <p className="text-sm text-gray-500 mb-6">
        Are you sure you want to remove <span className="font-semibold text-gray-700">"{name}"</span> from your profile?
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors">
          Remove
        </button>
      </div>
    </div>
  </div>
);

// ── Save Success Modal ─────────────────────────────────────────────────────────

const SaveSuccessModal = ({ skillName, isEdit, onClose }: { skillName: string; isEdit: boolean; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle className="w-11 h-11 text-green-600" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
        {isEdit ? 'Skill Updated!' : 'Skill Added!'}
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        <span className="font-semibold text-gray-700">"{skillName}"</span> has been saved to your profile.
      </p>
      <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 flex items-center justify-center gap-2">
        <Code size={16} className="text-purple-600" />
        <span className="text-sm font-medium text-gray-700">{skillName}</span>
      </div>
      <button onClick={onClose}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all">
        Done
      </button>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────

const SkillsSection: React.FC<SkillsSectionProps> = ({ profile, onUpdate }) => {
  const [isAdding, setIsAdding]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const [availableSkills, setAvailable] = useState<Skill[]>([]);
  const [skillsMap, setSkillsMap]       = useState<Map<string, string>>(new Map());

  // modal state
  const [successModal, setSuccessModal] = useState<{ name: string; isEdit: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserSkill | null>(null);
  const [deleteError, setDeleteError]   = useState('');

  // form state
  const [formData, setFormData] = useState<FormData>({
    skillName: '', proficiencyLevel: 3, yearsExperience: 0,
    isPrimary: false, lastUsed: '', skillContext: '',
  });
  const [fieldError, setFieldError]   = useState('');  // skill name inline error
  const [formError, setFormError]     = useState('');  // submit-level error

  const skills: UserSkill[] = profile?.skills || [];

  useEffect(() => { loadAvailableSkills(); }, []);

  useEffect(() => {
    const map = new Map<string, string>();
    availableSkills.forEach(s => map.set(s.id, s.name));
    setSkillsMap(map);
  }, [availableSkills]);

  const loadAvailableSkills = async () => {
    try {
      const res = await getSkillsList();
      const data = res.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(data)) setAvailable(data);
    } catch { /* non-critical */ }
  };

  const resetForm = () => {
    setFormData({ skillName: '', proficiencyLevel: 3, yearsExperience: 0, isPrimary: false, lastUsed: '', skillContext: '' });
    setFieldError('');
    setFormError('');
  };

  const getSkillName = (skill: UserSkill): string => {
    if (skill.name && skill.name !== 'undefined' && skill.name.trim()) return skill.name;
    const mapped = skillsMap.get(skill.skill_id);
    if (mapped) return mapped;
    const found = availableSkills.find(s => s.id === skill.skill_id);
    if (found?.name) return found.name;
    return `Skill ${skill.skill_id?.slice(0, 8) || 'unknown'}`;
  };

  const isDuplicate = (name: string, excludeId?: string) =>
    skills.some(s => s.name?.toLowerCase() === name.toLowerCase() && s.skill_id !== excludeId);

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateSkillName = (value: string): string => {
    const v = value.trim();
    if (!v) return 'Skill name is required';
    if (v.length < 2) return 'Must be at least 2 characters';
    if (v.length > 80) return 'Must be 80 characters or fewer';
    if (isDuplicate(v, editingId || undefined)) return 'This skill is already in your profile';
    return '';
  };

  const handleSkillNameChange = (val: string) => {
    setFormData(p => ({ ...p, skillName: val }));
    setFieldError(validateSkillName(val));
    if (formError) setFormError('');
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const err = validateSkillName(formData.skillName);
    if (err) { setFieldError(err); return; }

    setLoading(true);
    setFormError('');

    try {
      const payload = {
        skillName: formData.skillName.trim(),
        proficiencyLevel: formData.proficiencyLevel,
        yearsExperience: formData.yearsExperience,
        isPrimary: formData.isPrimary,
        lastUsed: formData.lastUsed || null,
        skillContext: formData.skillContext,
      };

      if (editingId) {
        await updateSkill(editingId, payload);
      } else {
        await addSkill(payload);
      }

      const savedName = formData.skillName.trim();
      const wasEdit   = !!editingId;

      onUpdate();
      setIsAdding(false);
      setEditingId(null);
      resetForm();
      setSuccessModal({ name: savedName, isEdit: wasEdit });
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save skill. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────

  const handleEdit = (skill: UserSkill) => {
    setFormData({
      skillName: getSkillName(skill),
      proficiencyLevel: skill.proficiency_level || 3,
      yearsExperience: skill.years_experience || 0,
      isPrimary: skill.is_primary || false,
      lastUsed: skill.last_used ? skill.last_used.split('T')[0] : '',
      skillContext: skill.skill_context || '',
    });
    setFieldError('');
    setFormError('');
    setEditingId(skill.skill_id);
    setIsAdding(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill(deleteTarget.skill_id);
      onUpdate();
      setDeleteTarget(null);
      setDeleteError('');
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to remove skill. Please try again.');
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Success Modal */}
      {successModal && (
        <SaveSuccessModal
          skillName={successModal.name}
          isEdit={successModal.isEdit}
          onClose={() => setSuccessModal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <>
          <DeleteModal
            name={getSkillName(deleteTarget)}
            onConfirm={confirmDelete}
            onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
          />
          {deleteError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
              <AlertCircle size={16} />{deleteError}
            </div>
          )}
        </>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Skills</h2>
            <p className="text-sm text-gray-500">Showcase your technical and professional skills</p>
          </div>
          {!isAdding && (
            <button onClick={() => { resetForm(); setIsAdding(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus size={18} /> Add Skill
            </button>
          )}
        </div>

        {/* ── Add / Edit Form ── */}
        {isAdding && (
          <div ref={formRef} className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-5">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Skill' : 'Add New Skill'}
            </h3>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Skill Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Skill Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.skillName}
                  onChange={e => handleSkillNameChange(e.target.value)}
                  list="skillSuggestions"
                  placeholder="e.g. JavaScript, Python, Project Management"
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                    fieldError ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
                  }`}
                />
                <datalist id="skillSuggestions">
                  {availableSkills.slice(0, 30).map(s => <option key={s.id} value={s.name} />)}
                </datalist>
                {fieldError && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle size={12} />{fieldError}
                  </p>
                )}

                {/* Existing skills hint */}
                {skills.length > 0 && !editingId && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">Already in your profile:</p>
                    <div className="flex flex-wrap gap-1">
                      {skills.slice(0, 12).map(s => (
                        <span key={s.skill_id} className="px-2 py-0.5 bg-white border border-gray-200 text-gray-600 text-xs rounded-full">
                          {getSkillName(s)}
                        </span>
                      ))}
                      {skills.length > 12 && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                          +{skills.length - 12} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Proficiency Level */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Proficiency Level
                </label>
                <div className="flex items-center gap-4">
                  <input type="range" min="1" max="5" step="1"
                    value={formData.proficiencyLevel}
                    onChange={e => setFormData(p => ({ ...p, proficiencyLevel: +e.target.value }))}
                    className="flex-1 accent-blue-600"
                  />
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${profColor(formData.proficiencyLevel)}`}>
                    {profLabel(formData.proficiencyLevel)}
                  </span>
                </div>
                {/* Proficiency bar */}
                <div className="flex gap-1 mt-2">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className={`flex-1 h-1.5 rounded-full transition-colors ${n <= formData.proficiencyLevel ? profBar(formData.proficiencyLevel) : 'bg-gray-200'}`} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Beginner</span><span>Intermediate</span><span>Advanced</span><span>Expert</span><span>Master</span>
                </div>
              </div>

              {/* Years + Last Used */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Years of Experience</label>
                  <input type="number" min="0" max="50" step="0.5"
                    value={formData.yearsExperience}
                    onChange={e => setFormData(p => ({ ...p, yearsExperience: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Last Used</label>
                  <input type="date"
                    value={formData.lastUsed}
                    onChange={e => setFormData(p => ({ ...p, lastUsed: e.target.value }))}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2.5 border border-gray-300 bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Primary */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" id="isPrimary"
                  checked={formData.isPrimary}
                  onChange={e => setFormData(p => ({ ...p, isPrimary: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Mark as Primary Skill</span>
                  <p className="text-xs text-gray-400">Primary skills appear first and are highlighted on your profile</p>
                </div>
              </label>

              {/* Context */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Skill Context <span className="font-normal text-gray-400">(optional)</span></label>
                <textarea
                  value={formData.skillContext}
                  onChange={e => setFormData(p => ({ ...p, skillContext: e.target.value }))}
                  rows={3}
                  maxLength={400}
                  className="w-full px-3 py-2.5 border border-gray-300 bg-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g. Used daily for frontend development at Company X"
                />
                <p className="text-xs text-gray-400 text-right mt-0.5">{formData.skillContext.length}/400</p>
              </div>

              {/* Form-level error */}
              {formError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
                  <AlertCircle size={16} />{formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={loading || !!fieldError}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                    : <><Save size={16} />{editingId ? 'Update Skill' : 'Save Skill'}</>
                  }
                </button>
                <button type="button" onClick={handleCancel}
                  className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
                  <X size={16} /> Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Skills Grid ── */}
        <div className="space-y-4">
          {skills.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
              <Code size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-500">No skills added yet</p>
              <p className="text-sm text-gray-400 mt-1">Add your technical and professional skills to complete your profile</p>
              <button onClick={() => { resetForm(); setIsAdding(true); }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                <Plus size={16} /> Add Your First Skill
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.map(skill => (
                <div key={skill.skill_id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-blue-100 transition-all group">
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                        <Code size={16} className="text-purple-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{getSkillName(skill)}</h3>
                        {skill.is_primary && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            <Star size={10} fill="currentColor" /> Primary
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(skill)} type="button" title="Edit"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit size={15} />
                      </button>
                      <button onClick={() => setDeleteTarget(skill)} type="button" title="Remove"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Proficiency bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-500">Proficiency</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${profColor(skill.proficiency_level)}`}>
                        {profLabel(skill.proficiency_level)}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(n => (
                        <div key={n} className={`flex-1 h-1.5 rounded-full ${n <= skill.proficiency_level ? profBar(skill.proficiency_level) : 'bg-gray-100'}`} />
                      ))}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="space-y-1.5 text-xs text-gray-500">
                    {skill.years_experience != null && skill.years_experience > 0 && (
                      <div className="flex justify-between">
                        <span>Experience</span>
                        <span className="font-semibold text-gray-700">{skill.years_experience} yrs</span>
                      </div>
                    )}
                    {skill.last_used && (
                      <div className="flex justify-between">
                        <span>Last used</span>
                        <span className="font-semibold text-gray-700">{new Date(skill.last_used).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {skill.skill_context && (
                    <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 line-clamp-2">
                      {skill.skill_context}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips */}
        {skills.length > 0 && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-blue-800 mb-2">Tips for Skills</p>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Add skills relevant to the roles you're targeting</li>
              <li>• Mark your strongest skills as <strong>Primary</strong></li>
              <li>• Include context to show how you've applied each skill</li>
              <li>• Keep skills up to date as you grow</li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
};

export default SkillsSection;
