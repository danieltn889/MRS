import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase, Plus, Edit3, Trash2, Upload, X,
  ExternalLink, Calendar, Award, Loader2, AlertCircle,
  Globe, Github, Users, TrendingUp, Tag, Image as ImageIcon,
  CheckCircle2, FolderOpen
} from 'lucide-react';
import type { NotifyFn } from './CompanyProfile';
import {
  getCompanyProjects, addCompanyProject, updateCompanyProject,
  deleteCompanyProject, uploadProjectMedia, deleteProjectMedia
} from '../../services/companyAPI';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  client?: string;
  industry?: string;
  description: string;
  startDate?: string;
  endDate?: string;
  projectType: 'internal'| 'client'| 'open_source'| 'research'| 'product';
  teamSize?: number;
  technologies: string[];
  results?: string;
  impact?: string;
  awards?: string[];
  media?: Array<{ url: string; key: string; type: string; uploaded_at: string }>;
  websiteUrl?: string;
  githubUrl?: string;
  featured: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  timeframe?: { start: string; end?: string };
  client_industry?: string;
  challenge?: string;
  solution?: string;
}

interface FormErrors {
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  teamSize?: string;
  websiteUrl?: string;
  githubUrl?: string;
}

const PROJECT_TYPES = [
  { value: 'internal',    label: 'Internal Project',    color: 'bg-slate-100 text-slate-700' },
  { value: 'client',      label: 'Client Project',      color: 'bg-blue-100  text-blue-700'  },
  { value: 'open_source', label: 'Open Source',         color: 'bg-green-100 text-green-700' },
  { value: 'research',    label: 'Research',            color: 'bg-purple-100 text-purple-700'},
  { value: 'product',     label: 'Product Development', color: 'bg-orange-100 text-orange-700'},
];

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Consulting', 'Media', 'Real Estate', 'Transportation',
  'Energy', 'Agriculture', 'Construction', 'Hospitality', 'Other',
];

const TODAY = new Date().toISOString().split('T')[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(url: string) {
  try { new URL(url.startsWith('http') ? url : `https://${url}`); return true; }
  catch { return false; }
}

function typeLabel(type: string) {
  return PROJECT_TYPES.find(t => t.value === type)?.label ?? type;
}

function typeColor(type: string) {
  return PROJECT_TYPES.find(t => t.value === type)?.color ?? 'bg-gray-100 text-gray-700';
}

// ─── FieldError ───────────────────────────────────────────────────────────────

const FieldError: React.FC<{ msg?: string }> = ({ msg }) =>
  msg ? (
    <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
      <AlertCircle className="h-3 w-3 flex-shrink-0" /> {msg}
    </p>
  ) : null;

const Label: React.FC<{ text: string; required?: boolean }> = ({ text, required }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1.5">
    {text} {required && <span className="text-red-500">*</span>}
  </label>
);

const inputCls = (err?: string) =>
  `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
    err ? 'border-red-400 bg-red-50': 'border-gray-300'
  }`;

// ─── Main component ───────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', client: '', industry: '', description: '',
  startDate: '', endDate: '', projectType: 'internal'as Project['projectType'],
  teamSize: '', technologies: [] as string[], results: '', impact: '',
  awards: [] as string[], websiteUrl: '', githubUrl: '',
  featured: false, displayOrder: 0,
};

const CompanyProjects: React.FC<{ onNotify?: NotifyFn }> = ({ onNotify }) => {
  const [projects, setProjects]           = useState<Project[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [viewingProject, setViewingProject] = useState<Project | null>(null);
  const [formData, setFormData]           = useState({ ...EMPTY_FORM });
  const [fieldErrors, setFieldErrors]     = useState<FormErrors>({});
  const [mediaFiles, setMediaFiles]       = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [saving, setSaving]               = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [newTech, setNewTech]             = useState('');
  const [newAward, setNewAward]           = useState('');

  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProjects(); }, []);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadProjects = async () => {
    try {
      setLoading(true);
      const res = await getCompanyProjects();
      setProjects(res.data || []);
    } catch (err: any) {
      onNotify?.('error', 'Load Failed', err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────

  const set = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (fieldErrors[field as keyof FormErrors]) {
      setFieldErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setMediaFiles([]);
    setMediaPreviews([]);
    setFieldErrors({});
    setNewTech('');
    setNewAward('');
  };

  const openAdd = () => { resetForm(); setEditingProject(null); setShowModal(true); };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name:         project.name,
      client:       project.client || '',
      industry:     project.industry || project.client_industry || '',
      description:  project.description,
      startDate:    (project as any).timeframe?.start || project.startDate || '',
      endDate:      (project as any).timeframe?.end   || project.endDate   || '',
      projectType:  project.projectType,
      teamSize:     project.teamSize?.toString() || '',
      technologies: project.technologies || [],
      results:      (project as any).results?.impact || project.results || '',
      impact:       (project as any).results?.impact || project.impact  || '',
      awards:       (project as any).results?.awards || project.awards  || [],
      websiteUrl:   project.websiteUrl || '',
      githubUrl:    project.githubUrl  || '',
      featured:     project.featured,
      displayOrder: project.displayOrder || 0,
    });
    setMediaFiles([]);
    setMediaPreviews([]);
    setFieldErrors({});
    setNewTech('');
    setNewAward('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingProject(null); resetForm(); };

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: FormErrors = {};

    if (!formData.name.trim())
      errs.name = 'Project name is required';
    else if (formData.name.trim().length < 2)
      errs.name = 'Name must be at least 2 characters';
    else if (formData.name.trim().length > 150)
      errs.name = 'Name must be 150 characters or less';

    if (!formData.description.trim())
      errs.description = 'Description is required';
    else if (formData.description.trim().length < 10)
      errs.description = 'Description must be at least 10 characters';
    else if (formData.description.trim().length > 3000)
      errs.description = 'Description must be 3 000 characters or less';

    if (!formData.startDate)
      errs.startDate = 'Start date is required';
    else if (formData.startDate > TODAY)
      errs.startDate = 'Start date cannot be in the future';

    if (formData.endDate) {
      if (formData.startDate && formData.endDate < formData.startDate)
        errs.endDate = 'End date must be on or after start date';
    }

    if (formData.teamSize) {
      const n = parseInt(formData.teamSize);
      if (isNaN(n) || n < 1)  errs.teamSize = 'Team size must be a positive number';
      if (n > 100000)          errs.teamSize = 'Team size seems too large';
    }

    if (formData.websiteUrl && !isValidUrl(formData.websiteUrl))
      errs.websiteUrl = 'Enter a valid URL (e.g. https://project.com)';

    if (formData.githubUrl && !isValidUrl(formData.githubUrl))
      errs.githubUrl = 'Enter a valid GitHub / repository URL';

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);

      const projectData: any = {
        name:        formData.name.trim(),
        description: formData.description.trim(),
        projectType: formData.projectType,
        startDate:   formData.startDate,
        endDate:     formData.endDate || undefined,
        featured:    formData.featured,
        displayOrder: formData.displayOrder,
        technologies: formData.technologies.filter(t => t.trim()),
        awards:      formData.awards.filter(a => a.trim()),
      };

      if (formData.client.trim())    projectData.client    = formData.client.trim();
      if (formData.industry)         projectData.industry  = formData.industry;
      if (formData.teamSize)         projectData.teamSize  = parseInt(formData.teamSize);
      if (formData.results.trim())   projectData.results   = formData.results.trim();
      if (formData.impact.trim())    projectData.impact    = formData.impact.trim();
      if (formData.websiteUrl.trim()) projectData.websiteUrl = formData.websiteUrl.trim();
      if (formData.githubUrl.trim())  projectData.githubUrl  = formData.githubUrl.trim();

      let projectId: string;

      if (editingProject) {
        await updateCompanyProject(editingProject.id, projectData);
        projectId = editingProject.id;
        onNotify?.('success', 'Project Updated', `"${projectData.name}" updated.`,
          formData.technologies.length ? `Tech: ${formData.technologies.join(', ')}` : undefined);
      } else {
        const res = await addCompanyProject(projectData);
        projectId = res.data.id;
        onNotify?.('success', 'Project Added', `"${projectData.name}" added to your portfolio.`,
          formData.technologies.length ? `Tech: ${formData.technologies.join(', ')}` : undefined);
      }

      if (mediaFiles.length > 0) {
        setUploadingMedia(true);
        try {
          for (const file of mediaFiles) await uploadProjectMedia(projectId, file);
        } catch (mediaErr: any) {
          onNotify?.('error', 'Media Upload Failed', mediaErr.message || 'Some files failed to upload');
        } finally {
          setUploadingMedia(false);
        }
      }

      await loadProjects();
      closeModal();
    } catch (err: any) {
      const msg = err.message || 'Failed to save project';
      onNotify?.('error', 'Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) return;
    try {
      await deleteCompanyProject(projectId);
      onNotify?.('info', 'Project Deleted', `"${projectName}" has been removed.`);
      await loadProjects();
    } catch (err: any) {
      onNotify?.('error', 'Delete Failed', err.message || 'Failed to delete project');
    }
  };

  const handleDeleteMedia = async (projectId: string, mediaKey: string) => {
    if (!confirm('Delete this media file?')) return;
    try {
      await deleteProjectMedia(projectId, mediaKey);
      await loadProjects();
      // re-open with refreshed data
      const updated = projects.find(p => p.id === projectId);
      if (updated && editingProject) openEdit({ ...updated, media: updated.media?.filter(m => m.key !== mediaKey) });
    } catch (err: any) {
      onNotify?.('error', 'Media Delete Failed', err.message || 'Failed to delete media');
    }
  };

  // ── Media select ──────────────────────────────────────────────────────────

  const handleMediaSelect = (files: FileList) => {
    const valid = Array.from(files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { onNotify?.('error', 'File Too Large', `"${f.name}" exceeds 10 MB`); return false; }
      return true;
    });
    setMediaFiles(prev => [...prev, ...valid]);
    valid.forEach(file => {
      const reader = new FileReader();
      reader.onload = e => setMediaPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(file);
    });
  };

  // ── Tags (tech / awards) ──────────────────────────────────────────────────

  const addTech = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (!formData.technologies.map(x => x.toLowerCase()).includes(t.toLowerCase()))
      setFormData(prev => ({ ...prev, technologies: [...prev.technologies, t] }));
    setNewTech('');
  };

  const addAward = (v: string) => {
    const t = v.trim();
    if (!t) return;
    setFormData(prev => ({ ...prev, awards: [...prev.awards, t] }));
    setNewAward('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center min-h-[300px]">
        <div className="text-center">
          <div className="relative h-10 w-10 mx-auto mb-3">
            <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin" />
          </div>
          <p className="text-sm text-gray-500">Loading projects…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Company Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">Showcase your work and achievements</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
          <Plus className="h-4 w-4" /> Add Project
        </button>
      </div>

      {/* ── Empty state ── */}
      {projects.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No projects yet</h3>
          <p className="text-sm text-gray-400 mb-5">Add your first project to showcase your work</p>
          <button onClick={openAdd}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            Add First Project
          </button>
        </div>
      )}

      {/* ── Project cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {projects.map(project => (
          <motion.div key={project.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white border rounded-xl p-5 hover:shadow-md transition-shadow">
            {/* card header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-base font-semibold text-gray-900 truncate">{project.name}</h3>
                  {project.featured && <Award className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(project.projectType)}`}>
                    {typeLabel(project.projectType)}
                  </span>
                  {project.client && <span className="text-xs text-gray-500">• {project.client}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button onClick={() => setViewingProject(project)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View">
                  <Briefcase className="h-4 w-4" />
                </button>
                <button onClick={() => openEdit(project)}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(project.id, project.name)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
              {typeof project.description === 'string'? project.description : ' '}
            </p>

            <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {project.startDate ? new Date(project.startDate).getFullYear() : ' '}
                {project.endDate ? ` – ${new Date(project.endDate).getFullYear()}` : '– Present'}
              </span>
              {project.teamSize && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {project.teamSize} people
                </span>
              )}
            </div>

            {project.technologies?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {project.technologies.slice(0, 4).map((tech, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-100">{tech}</span>
                ))}
                {project.technologies.length > 4 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">+{project.technologies.length - 4}</span>
                )}
              </div>
            )}

            {(project.websiteUrl || project.githubUrl) && (
              <div className="flex gap-3 mt-2">
                {project.websiteUrl && (
                  <a href={project.websiteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Website
                  </a>
                )}
                {project.githubUrl && (
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-600 hover:underline">
                    <ExternalLink className="h-3 w-3" /> GitHub
                  </a>
                )}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
           ADD / EDIT MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div key="modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <motion.div key="modal-panel"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.96, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* ── Modal header ── */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-white/20 rounded-lg flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      {editingProject ? 'Edit Project': 'Add New Project'}
                    </h3>
                    <p className="text-xs text-blue-200">
                      {editingProject ? `Editing: ${editingProject.name}` : 'Fill in the project details below'}
                    </p>
                  </div>
                </div>
                <button onClick={closeModal}
                  className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ── Scrollable body ── */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">

                  {/* Section: Basic Info */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Tag className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Name */}
                      <div className="sm:col-span-2">
                        <Label text="Project Name" required />
                        <input type="text" value={formData.name} onChange={e => set('name', e.target.value)}
                          className={inputCls(fieldErrors.name)} placeholder="e.g., Customer Portal Redesign" maxLength={150} />
                        <FieldError msg={fieldErrors.name} />
                      </div>

                      {/* Project type */}
                      <div>
                        <Label text="Project Type" required />
                        <select value={formData.projectType} onChange={e => set('projectType', e.target.value)}
                          className={inputCls()}>
                          {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      {/* Industry */}
                      <div>
                        <Label text="Industry" />
                        <select value={formData.industry} onChange={e => set('industry', e.target.value)}
                          className={inputCls()}>
                          <option value="">Select industry</option>
                          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>

                      {/* Client */}
                      <div>
                        <Label text="Client" />
                        <input type="text" value={formData.client} onChange={e => set('client', e.target.value)}
                          className={inputCls()} placeholder="Client name (if applicable)" maxLength={150} />
                      </div>

                      {/* Team size */}
                      <div>
                        <Label text="Team Size" />
                        <div className="relative">
                          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input type="number" value={formData.teamSize} onChange={e => set('teamSize', e.target.value)}
                            className={`${inputCls(fieldErrors.teamSize)} pl-9`} placeholder="Number of people" min="1" />
                        </div>
                        <FieldError msg={fieldErrors.teamSize} />
                      </div>

                      {/* Start date */}
                      <div>
                        <Label text="Start Date" required />
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input type="date" value={formData.startDate} max={TODAY}
                            onChange={e => set('startDate', e.target.value)}
                            className={`${inputCls(fieldErrors.startDate)} pl-9`} />
                        </div>
                        <FieldError msg={fieldErrors.startDate} />
                      </div>

                      {/* End date */}
                      <div>
                        <Label text="End Date" />
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input type="date" value={formData.endDate}
                            min={formData.startDate || undefined}
                            onChange={e => set('endDate', e.target.value)}
                            className={`${inputCls(fieldErrors.endDate)} pl-9`} />
                        </div>
                        <FieldError msg={fieldErrors.endDate} />
                        <p className="text-xs text-gray-400 mt-1">Leave blank if project is ongoing</p>
                      </div>

                      {/* Featured */}
                      <div className="sm:col-span-2 flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <input type="checkbox" id="featured" checked={formData.featured}
                          onChange={e => set('featured', e.target.checked)}
                          className="h-4 w-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400" />
                        <label htmlFor="featured" className="flex items-center gap-2 text-sm text-yellow-800 font-medium cursor-pointer">
                          <Award className="h-4 w-4 text-yellow-500" /> Mark as Featured Project
                        </label>
                      </div>
                    </div>
                  </section>

                  <hr className="border-gray-100" />

                  {/* Section: Description */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Briefcase className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Description</h4>
                    </div>
                    <div>
                      <Label text="Project Description" required />
                      <textarea value={formData.description} onChange={e => set('description', e.target.value)}
                        rows={4} maxLength={3050}
                        className={`${inputCls(fieldErrors.description)} resize-none`}
                        placeholder="Describe the project goals, challenges you solved, and how your team delivered it…" />
                      <div className="flex items-center justify-between mt-1">
                        <FieldError msg={fieldErrors.description} />
                        <span className={`text-xs ml-auto ${formData.description.length > 2800 ? 'text-orange-500 font-medium': 'text-gray-400'}`}>
                          {formData.description.length}/3 000
                        </span>
                      </div>
                    </div>
                  </section>

                  <hr className="border-gray-100" />

                  {/* Section: Technologies */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Tag className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Technologies Used</h4>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <input type="text" value={newTech} onChange={e => setNewTech(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(newTech); } }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="React, Node.js, Python… press Enter or click +" />
                      <button type="button" onClick={() => addTech(newTech)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {formData.technologies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {formData.technologies.map((tech, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-blue-50 text-blue-800 border border-blue-100">
                            {tech}
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, technologies: prev.technologies.filter((_, j) => j !== i) }))}
                              className="text-blue-400 hover:text-blue-700 transition-colors"><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">No technologies added yet.</p>
                    )}
                  </section>

                  <hr className="border-gray-100" />

                  {/* Section: Results & Impact */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Results &amp; Impact</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label text="Results & Metrics" />
                        <textarea value={formData.results} onChange={e => set('results', e.target.value)}
                          rows={3} maxLength={600}
                          className={`${inputCls()} resize-none`}
                          placeholder="40% faster load time, 2× revenue, 10k new users…" />
                        <p className={`text-xs mt-1 text-right ${formData.results.length > 540 ? 'text-orange-500': 'text-gray-400'}`}>
                          {formData.results.length}/600
                        </p>
                      </div>
                      <div>
                        <Label text="Impact & Value" />
                        <textarea value={formData.impact} onChange={e => set('impact', e.target.value)}
                          rows={3} maxLength={600}
                          className={`${inputCls()} resize-none`}
                          placeholder="Improved employee satisfaction, reduced churn by 15%…" />
                        <p className={`text-xs mt-1 text-right ${formData.impact.length > 540 ? 'text-orange-500': 'text-gray-400'}`}>
                          {formData.impact.length}/600
                        </p>
                      </div>
                    </div>

                    {/* Awards */}
                    <div className="mt-4">
                      <Label text="Awards & Recognition" />
                      <div className="flex gap-2 mb-2">
                        <input type="text" value={newAward} onChange={e => setNewAward(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAward(newAward); } }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Best Innovation Award 2024   press Enter to add" />
                        <button type="button" onClick={() => addAward(newAward)}
                          className="px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex-shrink-0">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      {formData.awards.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {formData.awards.map((award, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
                              <Award className="h-3 w-3" /> {award}
                              <button type="button" onClick={() => setFormData(prev => ({ ...prev, awards: prev.awards.filter((_, j) => j !== i) }))}
                                className="text-yellow-500 hover:text-yellow-700 transition-colors"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <hr className="border-gray-100" />

                  {/* Section: Links */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <Globe className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Links</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label text="Website URL" />
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input type="text" value={formData.websiteUrl} onChange={e => set('websiteUrl', e.target.value)}
                            className={`${inputCls(fieldErrors.websiteUrl)} pl-9`}
                            placeholder="https://project.com" />
                        </div>
                        <FieldError msg={fieldErrors.websiteUrl} />
                      </div>
                      <div>
                        <Label text="GitHub / Repository URL" />
                        <div className="relative">
                          <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                          <input type="text" value={formData.githubUrl} onChange={e => set('githubUrl', e.target.value)}
                            className={`${inputCls(fieldErrors.githubUrl)} pl-9`}
                            placeholder="https://github.com/org/repo" />
                        </div>
                        <FieldError msg={fieldErrors.githubUrl} />
                      </div>
                    </div>
                  </section>

                  <hr className="border-gray-100" />

                  {/* Section: Media */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <ImageIcon className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Project Media</h4>
                    </div>

                    {/* Existing media (edit mode) */}
                    {editingProject?.media && editingProject.media.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">Current media:</p>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {editingProject.media.map((m, i) => (
                            <div key={i} className="relative group">
                              {m.type === 'image'
                                ? <img src={m.url} alt="" className="w-full h-20 object-cover rounded-lg border" />
                                : <div className="w-full h-20 bg-gray-100 rounded-lg border flex items-center justify-center text-xs text-gray-500">Video</div>}
                              <button type="button" onClick={() => handleDeleteMedia(editingProject.id, m.key)}
                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* New previews */}
                    {mediaPreviews.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-500 mb-2">New files to upload ({mediaPreviews.length}):</p>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {mediaPreviews.map((src, i) => (
                            <div key={i} className="relative group">
                              <img src={src} alt="" className="w-full h-20 object-cover rounded-lg border" />
                              <button type="button" onClick={() => {
                                setMediaFiles(prev => prev.filter((_, j) => j !== i));
                                setMediaPreviews(prev => prev.filter((_, j) => j !== i));
                              }} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple
                      onChange={e => e.target.files && handleMediaSelect(e.target.files)} className="hidden" />
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors">
                      <Upload className="h-4 w-4" /> Upload Images or Videos
                    </button>
                    <p className="text-xs text-gray-400 mt-1.5">Max 10 MB per file. Images and videos supported.</p>
                  </section>

                </div>

                {/* ── Sticky footer ── */}
                <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0">
                  <p className="text-xs text-gray-400">
                    <span className="text-red-400">*</span> Required fields
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={closeModal}
                      className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving || uploadingMedia}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm min-w-[140px] justify-center">
                      {saving || uploadingMedia
                        ? <><Loader2 className="h-4 w-4 animate-spin" />{uploadingMedia ? 'Uploading…': 'Saving…'}</>
                        : <><CheckCircle2 className="h-4 w-4" />{editingProject ? 'Update Project': 'Save Project'}</>}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════
           VIEW DETAILS MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewingProject && (
          <motion.div key="view-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setViewingProject(null)}
          >
            <motion.div key="view-panel"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.96, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* view header */}
              <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-white/20 rounded-lg flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                      {viewingProject.name}
                      {viewingProject.featured && <Award className="h-4 w-4 text-yellow-400" />}
                    </h3>
                    <p className="text-xs text-slate-300">{typeLabel(viewingProject.projectType)}</p>
                  </div>
                </div>
                <button onClick={() => setViewingProject(null)}
                  className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Type',     value: typeLabel(viewingProject.projectType) },
                    { label: 'Duration', value: `${viewingProject.startDate ? new Date(viewingProject.startDate).getFullYear() : '?'} – ${viewingProject.endDate ? new Date(viewingProject.endDate).getFullYear() : 'Present'}` },
                    { label: 'Client',   value: viewingProject.client   || ' '},
                    { label: 'Team',     value: viewingProject.teamSize ? `${viewingProject.teamSize} people` : ' '},
                  ].map(item => (
                    <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                      <p className="text-sm font-medium text-gray-800">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* description */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-1.5">Description</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{viewingProject.description}</p>
                </div>

                {/* technologies */}
                {viewingProject.technologies?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Technologies</h4>
                    <div className="flex flex-wrap gap-2">
                      {viewingProject.technologies.map((t, i) => (
                        <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-100">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* results */}
                {(viewingProject.results || viewingProject.impact) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {viewingProject.results && typeof viewingProject.results === 'string'&& (
                      <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                        <p className="text-xs font-semibold text-green-700 mb-1">Results &amp; Metrics</p>
                        <p className="text-sm text-green-800">{viewingProject.results}</p>
                      </div>
                    )}
                    {viewingProject.impact && (
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Impact &amp; Value</p>
                        <p className="text-sm text-blue-800">{viewingProject.impact}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* awards */}
                {viewingProject.awards && viewingProject.awards.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Awards &amp; Recognition</h4>
                    <div className="space-y-1.5">
                      {viewingProject.awards.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Award className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          <span className="text-gray-700">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* links */}
                {(viewingProject.websiteUrl || viewingProject.githubUrl) && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Links</h4>
                    <div className="flex gap-4">
                      {viewingProject.websiteUrl && (
                        <a href={viewingProject.websiteUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                          <Globe className="h-4 w-4" /> View Project
                        </a>
                      )}
                      {viewingProject.githubUrl && (
                        <a href={viewingProject.githubUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-gray-700 hover:underline">
                          <ExternalLink className="h-4 w-4" /> GitHub Repo
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* media */}
                {viewingProject.media && viewingProject.media.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Media</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {viewingProject.media.map((m, i) => (
                        m.type === 'image'
                          ? <img key={i} src={m.url} alt="" className="w-full h-28 object-cover rounded-lg border cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.open(m.url, '_blank')} />
                          : <div key={i} className="w-full h-28 bg-gray-100 rounded-lg border flex items-center justify-center text-sm text-gray-500">Video</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t px-6 py-4 flex justify-between items-center flex-shrink-0">
                <button onClick={() => { setViewingProject(null); openEdit(viewingProject); }}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                  <Edit3 className="h-4 w-4" /> Edit Project
                </button>
                <button onClick={() => setViewingProject(null)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompanyProjects;
