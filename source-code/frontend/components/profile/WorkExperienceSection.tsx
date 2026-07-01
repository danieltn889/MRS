import React, { useRef, useState, useEffect } from 'react';
import {
  Plus, Edit, Trash2, Save, X, Briefcase, Calendar, MapPin, Building,
  Upload, FileText, CheckCircle, Loader, AlertCircle, Eye, Download,
  File, Image, FileArchive, Search
} from 'lucide-react';
import { addWorkExperience, updateWorkExperience, deleteWorkExperience, uploadCandidateDocument, getSkillsList } from '../../services/candidateAPI';
import ConfirmDialog from './ConfirmDialog';
import { extractDocxText } from '../../utils/documentTextExtractor';

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
  verification_method?: string;
  attachments?: ProofFile[];
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
  industry: string;
  reasonForLeaving: string;
  skills: string[];
  proofFiles: File[];
  existingProofFiles: ProofFile[];
  displayOrder: number;
}

interface ProofFile {
  file_name: string;
  file_size?: number;
  file_type?: string;
  uploaded_at?: string;
  file_url?: string;
  file_key?: string;
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

const getFileIcon = (fileName: string): React.ReactNode => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  switch (extension) {
    case 'pdf': return <FileText size={16} className="text-red-500" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp': return <Image size={16} className="text-green-500" />;
    case 'doc':
    case 'docx': return <FileText size={16} className="text-blue-500" />;
    case 'zip':
    case 'rar':
    case '7z': return <FileArchive size={16} className="text-yellow-500" />;
    default: return <File size={16} className="text-gray-500" />;
  }
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
    industry: '',
    reasonForLeaving: '',
    skills: [],
    proofFiles: [],
    existingProofFiles: [],
    displayOrder: 0
  });
  const [loading, setLoading] = useState<boolean>(false);
  // Skills used in this role + autocomplete suggestions from the skills catalog.
  const [skillCatalog, setSkillCatalog] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState<string>('');
  const [showSkillSuggest, setShowSkillSuggest] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string>('');
  const [proofUploadStatus, setProofUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [proofUploadProgress, setProofUploadProgress] = useState<number>(0);
  const [proofUploadMessage, setProofUploadMessage] = useState<string>('');
  const [viewingProofFile, setViewingProofFile] = useState<ProofFile | null>(null);
  const [isProofModalOpen, setIsProofModalOpen] = useState<boolean>(false);
  const [docxPreviewText, setDocxPreviewText] = useState<string | null>(null);
  const [docxPreviewLoading, setDocxPreviewLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | number | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

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
      industry: '',
      reasonForLeaving: '',
      skills: [],
      proofFiles: [],
      existingProofFiles: [],
      displayOrder: 0
    });
    setSkillQuery('');
    setShowSkillSuggest(false);
    setDateError('');
    setProofUploadStatus('idle');
    setProofUploadProgress(0);
    setProofUploadMessage('');
  };

  // Load the skills catalog once for autocomplete suggestions.
  useEffect(() => {
    (async () => {
      try {
        const res: any = await getSkillsList();
        const list = res?.data || (Array.isArray(res) ? res : []);
        const names = Array.from(new Set(
          list.map((s: any) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
        )) as string[];
        setSkillCatalog(names);
      } catch { /* suggestions are optional */ }
    })();
  }, []);

  const addExpSkill = (name: string): void => {
    const clean = name.trim();
    if (!clean) return;
    setFormData(prev =>
      prev.skills.some(s => s.toLowerCase() === clean.toLowerCase())
        ? prev
        : { ...prev, skills: [...prev.skills, clean] }
    );
    setSkillQuery('');
    setShowSkillSuggest(false);
  };

  const removeExpSkill = (name: string): void => {
    setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== name) }));
  };

  const skillSuggestions = skillQuery.trim()
    ? skillCatalog
        .filter(s =>
          s.toLowerCase().includes(skillQuery.trim().toLowerCase()) &&
          !formData.skills.some(sel => sel.toLowerCase() === s.toLowerCase())
        )
        .slice(0, 8)
    : [];

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

    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  };

  const handleProofSelect = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setProofUploadStatus('uploading');
    setProofUploadProgress(25);
    setProofUploadMessage('Checking proof files...');
    await new Promise(resolve => setTimeout(resolve, 150));

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const validFiles = files.filter(file => allowedTypes.includes(file.type) && file.size <= 10 * 1024 * 1024);

    if (validFiles.length !== files.length) {
      setProofUploadStatus('error');
      setProofUploadProgress(0);
      setProofUploadMessage('Some files were skipped. Only PDF, Word, JPG and PNG files under 10MB are supported.');
      alert('Only PDF, Word, JPG and PNG proof files under 10MB are supported.');
    }

    if (validFiles.length === 0) {
      if (proofInputRef.current) proofInputRef.current.value = '';
      return;
    }

    setProofUploadProgress(70);
    setProofUploadMessage('Preparing proof files...');
    await new Promise(resolve => setTimeout(resolve, 150));
    setFormData(prev => ({
      ...prev,
      proofFiles: [...prev.proofFiles, ...validFiles].slice(0, 3)
    }));
    setProofUploadProgress(100);
    setProofUploadStatus('success');
    setProofUploadMessage('Proof files ready. Save to add them to your experience.');

    if (proofInputRef.current) proofInputRef.current.value = '';
  };

  const removeProofFile = (index: number): void => {
    setFormData(prev => ({
      ...prev,
      proofFiles: prev.proofFiles.filter((_, fileIndex) => fileIndex !== index)
    }));
    if (formData.proofFiles.length <= 1) {
      setProofUploadStatus('idle');
      setProofUploadProgress(0);
      setProofUploadMessage('');
    }
  };

  const removeExistingProofFile = (index: number): void => {
    setFormData(prev => ({
      ...prev,
      existingProofFiles: prev.existingProofFiles.filter((_, fileIndex) => fileIndex !== index)
    }));
  };

  const truncateTitle = (title: string): string => {
    if (title && title.length > 100) {
      return title.substring(0, 100);
    }
    return title;
  };

  // =====================================================
  // ✅ UPDATED: handleSubmit - only sends the fields you want
  // =====================================================
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
      const truncatedTitle = truncateTitle(formData.title);
      
      if (formData.title.length > 100) {
        console.warn(`⚠️ Title truncated from ${formData.title.length} to 100 characters: ${truncatedTitle}`);
      }

      // ✅ Build submit data with only the fields you want
      const submitData: any = {
        company: formData.company,
        title: truncatedTitle,
        employmentType: formData.employmentType,
        locationType: formData.locationType,
        startDate: formData.startDate,
        isCurrent: formData.isCurrent,
      };

      // ✅ Add optional fields only if they have values
      if (formData.companyId) submitData.company_id = formData.companyId;
      if (formData.location) submitData.location = formData.location;
      if (formData.endDate && !formData.isCurrent) submitData.endDate = formData.endDate;
      if (formData.industry) submitData.industry = formData.industry;
      if (formData.reasonForLeaving) submitData.reasonForLeaving = formData.reasonForLeaving;
      if (formData.skills.length) submitData.skills = formData.skills;
      if (formData.displayOrder) submitData.displayOrder = formData.displayOrder;

      // ✅ Upload proof files for real so they persist and can be viewed/downloaded,
      // then store their references in the `attachments` JSONB column.
      const uploadedProofFiles: ProofFile[] = [];
      for (const file of formData.proofFiles) {
        const res = await uploadCandidateDocument(file, 'work_proof');
        const data = res?.data || {};
        uploadedProofFiles.push({
          file_name: data.file_name || file.name,
          file_size: data.file_size ?? file.size,
          file_type: data.mime_type || file.type,
          uploaded_at: data.uploaded_at || new Date().toISOString(),
          file_url: data.file_url,
          file_key: data.file_key,
        });
      }

      // Keep previously-saved proof files and append the newly uploaded ones.
      submitData.attachments = [...formData.existingProofFiles, ...uploadedProofFiles];
      // Short label kept in the (VARCHAR) verification_method column for context.
      submitData.verificationMethod = submitData.attachments.length > 0 ? 'work_proof' : '';

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

  // =====================================================
  // ✅ UPDATED: handleEdit - only loads the fields you want
  // =====================================================
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
      industry: exp.industry || '',
      reasonForLeaving: exp.reason_for_leaving || '',
      skills: Array.isArray((exp as any).skills) ? (exp as any).skills : [],
      proofFiles: [],
      existingProofFiles: getProofFiles(exp),
      displayOrder: exp.display_order || 0
    });
    setEditingId(String(exp.id));
    setIsAdding(true);
  };

  const confirmDelete = async (): Promise<void> => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      await deleteWorkExperience(String(deleteId));
      setDeleteId(null);
      onUpdate();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error deleting work experience:', error);
      alert('Error deleting work experience: ' + errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = (): void => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const getYear = (dateValue?: string | null): string => {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? 'N/A' : date.getFullYear().toString();
  };

  // Proof files now live in the `attachments` JSONB column. Older entries may
  // still keep them inside the legacy `verification_method` JSON string, so we
  // read both for backward compatibility.
  const getProofFiles = (exp?: { attachments?: ProofFile[]; verification_method?: string } | null): ProofFile[] => {
    if (!exp) return [];

    if (Array.isArray(exp.attachments) && exp.attachments.length > 0) {
      return exp.attachments;
    }

    if (exp.verification_method) {
      try {
        const parsed = JSON.parse(exp.verification_method);
        if (Array.isArray(parsed?.files)) return parsed.files;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }

    return [];
  };

  const openProofViewer = (file: ProofFile): void => {
    setViewingProofFile(file);
    setIsProofModalOpen(true);
    setDocxPreviewText(null);

    const isOffice = /\.(docx?)$/i.test(file.file_name || '');
    if (!isOffice) return;

    const url = file.file_url
      || (() => { const f = formData.proofFiles.find(pf => pf.name === file.file_name); return f ? URL.createObjectURL(f) : null; })();
    if (!url) return;

    setDocxPreviewLoading(true);
    fetch(url)
      .then(r => r.blob())
      .then(blob => extractDocxText(blob))
      .then(result => setDocxPreviewText(result.text || ''))
      .catch(() => setDocxPreviewText(''))
      .finally(() => setDocxPreviewLoading(false));
  };

  const closeProofViewer = (): void => {
    setIsProofModalOpen(false);
    setViewingProofFile(null);
    setDocxPreviewText(null);
  };

  const downloadProofFile = async (file: ProofFile): Promise<void> => {
    if (!file.file_name) {
      alert('File name not available');
      return;
    }

    try {
      // File just selected in this session but not saved yet: serve from memory.
      const uploadedFile = formData.proofFiles.find(f => f.name === file.file_name);
      if (uploadedFile) {
        const url = URL.createObjectURL(uploadedFile);
        const link = document.createElement('a');
        link.href = url;
        link.download = uploadedFile.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Persisted file: download directly from its stored URL.
      if (file.file_url) {
        const link = document.createElement('a');
        link.href = file.file_url;
        link.download = file.file_name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      alert('This file is no longer available for download.');
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  // Build a previewable URL for the file (persisted URL, or an in-memory object URL).
  const getProofPreviewUrl = (file: ProofFile): string | null => {
    if (file.file_url) return file.file_url;
    const uploadedFile = formData.proofFiles.find(f => f.name === file.file_name);
    return uploadedFile ? URL.createObjectURL(uploadedFile) : null;
  };

  const renderProofModal = (): React.ReactNode => {
    if (!isProofModalOpen || !viewingProofFile) return null;

    const isImage = viewingProofFile.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPDF = viewingProofFile.file_name?.match(/\.pdf$/i);
    const isDocx = viewingProofFile.file_name?.match(/\.(docx?)$/i);
    const fileExtension = viewingProofFile.file_name?.split('.').pop()?.toUpperCase() || 'FILE';
    const previewUrl = getProofPreviewUrl(viewingProofFile);

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeProofViewer}>
        <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3 min-w-0">
              {getFileIcon(viewingProofFile.file_name || '')}
              <span className="font-medium text-gray-900 truncate max-w-md">{viewingProofFile.file_name}</span>
              {viewingProofFile.file_size && (
                <span className="text-xs text-gray-500 whitespace-nowrap">({formatFileSize(viewingProofFile.file_size)})</span>
              )}
              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{fileExtension}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => downloadProofFile(viewingProofFile)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                <Download size={16} /> Download
              </button>
              <button onClick={closeProofViewer} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
          
          <div className="p-6 overflow-auto max-h-[calc(90vh-80px)] bg-gray-50">
            {isImage && previewUrl ? (
              <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner overflow-auto">
                <img src={previewUrl} alt={viewingProofFile.file_name} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
              </div>
            ) : isPDF && previewUrl ? (
              <iframe src={previewUrl} title={viewingProofFile.file_name} className="w-full h-[70vh] rounded-lg bg-white shadow-inner" />
            ) : isDocx ? (
              docxPreviewLoading ? (
                <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                  <div className="text-center">
                    <Loader size={40} className="text-blue-500 animate-spin mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Reading document…</p>
                  </div>
                </div>
              ) : docxPreviewText ? (
                <div className="bg-white rounded-lg shadow-inner h-[70vh] overflow-auto">
                  <pre className="p-6 text-sm text-gray-800 font-sans leading-relaxed whitespace-pre-wrap break-words">
                    {docxPreviewText}
                  </pre>
                </div>
              ) : (
                <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                  <div className="text-center p-8">
                    <FileText size={60} className="text-blue-200 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium mb-1">Could not read document text</p>
                    <p className="text-sm text-gray-400">Download the file to open it in Microsoft Word</p>
                    <button onClick={() => downloadProofFile(viewingProofFile)} className="mt-5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto">
                      <Download size={16} /> Download File
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                <div className="text-center p-8">
                  <File size={80} className="text-gray-300 mx-auto mb-6" />
                  <p className="text-gray-600 font-medium">Cannot preview this file type</p>
                  <p className="text-sm text-gray-400 mt-1">{viewingProofFile.file_name}</p>
                  <button onClick={() => downloadProofFile(viewingProofFile)} className="mt-5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto">
                    <Download size={16} /> Download File
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderProofModal()}

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete work experience?"
        message="This will permanently remove this work experience entry and its proof files from your profile."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Work Experience</h2>
          <p className="text-sm text-gray-600">Add your professional experience</p>
        </div>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={18} /> Add Experience
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">{editingId ? 'Edit Work Experience' : 'Add Work Experience'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Senior Software Engineer"
                  maxLength={250}
                />
                <p className={`text-xs mt-1 ${formData.title.length > 100 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {formData.title.length}/100 characters {formData.title.length > 100 && '⚠️ Will be shortened'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Kigali, Rwanda"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
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
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{dateError}</div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isCurrent"
                checked={formData.isCurrent}
                onChange={(e) => setFormData({...formData, isCurrent: e.target.checked, endDate: e.target.checked ? '' : formData.endDate})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isCurrent" className="text-sm text-gray-700 cursor-pointer">I currently work here</label>
            </div>

            {!formData.isCurrent && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Leaving (Optional)</label>
                <textarea
                  value={formData.reasonForLeaving}
                  onChange={(e) => setFormData({...formData, reasonForLeaving: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Career growth, relocation, company restructuring..."
                />
              </div>
            )}

            {/* Skills used in this role — auto-search + suggestions from the catalog */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skills used in this role</label>
              {formData.skills.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.skills.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-sm border border-blue-200">
                      {s}
                      <button type="button" onClick={() => removeExpSkill(s)} className="text-blue-500 hover:text-blue-700" aria-label={`Remove ${s}`}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={skillQuery}
                  onChange={(e) => { setSkillQuery(e.target.value); setShowSkillSuggest(true); }}
                  onFocus={() => setShowSkillSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSkillSuggest(false), 150)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExpSkill(skillQuery); } }}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search a skill (e.g. React) and press Enter to add"
                />
                {showSkillSuggest && skillSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-auto">
                    {skillSuggestions.map((s) => (
                      <li key={s}>
                        <button type="button" onMouseDown={(e) => { e.preventDefault(); addExpSkill(s); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50">
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">Pick from the suggestions or type your own and press Enter.</p>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Work Proof or Certificate</label>
              <input
                ref={proofInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleProofSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => proofInputRef.current?.click()}
                disabled={proofUploadStatus === 'uploading'}
                className="inline-flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {proofUploadStatus === 'uploading' ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                {proofUploadStatus === 'uploading' ? 'Uploading proof...' : 'Upload proof'}
              </button>
              <p className="mt-1 text-xs text-gray-500">Employment letter, contract, recommendation, payslip, or certificate. Max 3 files, 10MB each.</p>

              {proofUploadStatus !== 'idle' && (
                <div className={`mt-3 rounded-lg border px-3 py-2 ${
                  proofUploadStatus === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
                  proofUploadStatus === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
                  'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  <div className="flex items-center gap-2 text-sm">
                    {proofUploadStatus === 'uploading' && <Loader size={16} className="animate-spin" />}
                    {proofUploadStatus === 'success' && <CheckCircle size={16} />}
                    {proofUploadStatus === 'error' && <AlertCircle size={16} />}
                    <span className="flex-1">{proofUploadMessage}</span>
                    {proofUploadStatus === 'uploading' && <span className="text-xs font-medium">{proofUploadProgress}%</span>}
                  </div>
                  {proofUploadStatus === 'uploading' && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${proofUploadProgress}%` }} />
                    </div>
                  )}
                </div>
              )}

              {formData.existingProofFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500">Saved proof files</p>
                  {formData.existingProofFiles.map((file, index) => (
                    <div key={`${file.file_name}-${index}`} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      {getFileIcon(file.file_name)}
                      <span className="flex-1 truncate">{file.file_name}</span>
                      {file.file_size && <span className="text-xs text-green-600">{formatFileSize(file.file_size)}</span>}
                      <button type="button" onClick={() => openProofViewer(file)} className="text-blue-600 hover:text-blue-800 transition-colors" title="View file">
                        <Eye size={16} />
                      </button>
                      <button type="button" onClick={() => removeExistingProofFile(index)} className="text-gray-400 hover:text-red-600 transition-colors" title="Remove file">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {formData.proofFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {formData.proofFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      {getFileIcon(file.name)}
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                      <button onClick={() => openProofViewer({ file_name: file.name, file_size: file.size, file_type: file.type })} className="text-blue-600 hover:text-blue-800 transition-colors" title="View file">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => removeProofFile(index)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Save size={18} /> {loading ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors">
                <X size={18} /> Cancel
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
          experience.map((exp) => {
            const proofFiles = getProofFiles(exp);
            return (
              <div key={exp.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <Briefcase size={20} className="text-green-600" />
                      <h3 className="text-lg font-semibold text-gray-900">{exp.title}</h3>
                      {exp.is_current && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Current</span>
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
                          <MapPin size={16} /> {exp.location}
                        </div>
                      )}
                      <span className="capitalize">{getEmploymentTypeLabel(exp.employment_type || '')}</span>
                      {exp.location_type && (
                        <span className="capitalize">{getLocationTypeLabel(exp.location_type)}</span>
                      )}
                    </div>

                    {proofFiles.length > 0 && (
                      <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                          <CheckCircle size={15} /> Proof Files ({proofFiles.length})
                        </h4>
                        <div className="space-y-1">
                          {proofFiles.map((file, index) => (
                            <div key={`${file.file_name}-${index}`} className="flex items-center gap-2 text-xs text-green-700 bg-white/70 rounded-lg px-3 py-2 border border-green-100">
                              {getFileIcon(file.file_name)}
                              <span className="flex-1 truncate font-medium">{file.file_name}</span>
                              {file.file_size && (
                                <span className="text-green-600 whitespace-nowrap">({formatFileSize(file.file_size)})</span>
                              )}
                              <div className="flex items-center gap-1 ml-2">
                                <button onClick={() => openProofViewer(file)} className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors" title="View file">
                                  <Eye size={14} />
                                </button>
                                <button onClick={() => downloadProofFile(file)} className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors" title="Download file">
                                  <Download size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button onClick={() => handleEdit(exp)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit" type="button">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => setDeleteId(exp.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete" type="button">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WorkExperienceSection;