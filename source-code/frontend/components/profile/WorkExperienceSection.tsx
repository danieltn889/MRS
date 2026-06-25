import React, { useRef, useState } from 'react';
import { 
  Plus, Edit, Trash2, Save, X, Briefcase, Calendar, MapPin, Building, 
  Upload, FileText, CheckCircle, Loader, AlertCircle, Eye, Download, 
  File, Image, FileArchive
} from 'lucide-react';
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
  verification_method?: string;
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
  proofFiles: File[];
  existingProof: string;
  displayOrder: number;
}

interface ProofFile {
  file_name: string;
  file_size?: number;
  file_type?: string;
  uploaded_at?: string;
  file_url?: string;
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
    proofFiles: [],
    existingProof: '',
    displayOrder: 0
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string>('');
  const [proofUploadStatus, setProofUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [proofUploadProgress, setProofUploadProgress] = useState<number>(0);
  const [proofUploadMessage, setProofUploadMessage] = useState<string>('');
  const [viewingProofFile, setViewingProofFile] = useState<ProofFile | null>(null);
  const [isProofModalOpen, setIsProofModalOpen] = useState<boolean>(false);
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
      proofFiles: [],
      existingProof: '',
      displayOrder: 0
    });
    setDateError('');
    setProofUploadStatus('idle');
    setProofUploadProgress(0);
    setProofUploadMessage('');
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
      if (formData.displayOrder) submitData.displayOrder = formData.displayOrder;

      // ✅ Handle verification method
      if (formData.proofFiles.length > 0) {
        submitData.verificationMethod = JSON.stringify({
          type: 'work_proof',
          files: formData.proofFiles.map(file => ({
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
            uploaded_at: new Date().toISOString()
          }))
        });
      } else if (formData.existingProof) {
        submitData.verificationMethod = formData.existingProof;
      }

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
      proofFiles: [],
      existingProof: exp.verification_method || '',
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

  const getYear = (dateValue?: string | null): string => {
    if (!dateValue) return 'N/A';
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? 'N/A' : date.getFullYear().toString();
  };

  const getProofFiles = (value?: string): ProofFile[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed?.files) ? parsed.files : [];
    } catch {
      return [];
    }
  };

  const openProofViewer = (file: ProofFile): void => {
    setViewingProofFile(file);
    setIsProofModalOpen(true);
  };

  const closeProofViewer = (): void => {
    setIsProofModalOpen(false);
    setViewingProofFile(null);
  };

  const downloadProofFile = async (file: ProofFile): Promise<void> => {
    if (!file.file_name) {
      alert('File name not available');
      return;
    }

    try {
      const uploadedFile = formData.proofFiles.find(f => f.name === file.file_name);
      
      if (uploadedFile) {
        const url = URL.createObjectURL(uploadedFile);
        if (uploadedFile.type === 'application/pdf') {
          window.open(url, '_blank');
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = uploadedFile.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in to download files');
        return;
      }

      const isPDF = file.file_name.toLowerCase().endsWith('.pdf');
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.file_name);

      if (isPDF || isImage) {
        const viewUrl = `/api/v1/candidates/proof/view/${encodeURIComponent(file.file_name)}`;
        window.open(viewUrl, '_blank');
      } else {
        const downloadUrl = `/api/v1/candidates/proof/download/${encodeURIComponent(file.file_name)}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = file.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file. Please try again.');
    }
  };

  const renderProofModal = (): React.ReactNode => {
    if (!isProofModalOpen || !viewingProofFile) return null;

    const isImage = viewingProofFile.file_name?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPDF = viewingProofFile.file_name?.match(/\.pdf$/i);
    const fileExtension = viewingProofFile.file_name?.split('.').pop()?.toUpperCase() || 'FILE';

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
            {isImage ? (
              <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                <div className="text-center p-8">
                  <Image size={80} className="text-gray-300 mx-auto mb-6" />
                  <p className="text-gray-600 font-medium">Image Preview</p>
                  <p className="text-sm text-gray-400 mt-1">{viewingProofFile.file_name}</p>
                  <div className="mt-6 flex gap-3 justify-center">
                    <button onClick={() => downloadProofFile(viewingProofFile)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                      <Download size={16} /> Download Image
                    </button>
                    <button onClick={closeProofViewer} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Close</button>
                  </div>
                </div>
              </div>
            ) : isPDF ? (
              <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                <div className="text-center p-8">
                  <FileText size={80} className="text-red-400 mx-auto mb-6" />
                  <p className="text-gray-600 font-medium">PDF Document</p>
                  <p className="text-sm text-gray-400 mt-1">{viewingProofFile.file_name}</p>
                  <div className="mt-6 flex gap-3 justify-center">
                    <button onClick={() => downloadProofFile(viewingProofFile)} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                      <Download size={16} /> Download PDF
                    </button>
                    <button onClick={closeProofViewer} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Close</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner">
                <div className="text-center p-8">
                  <File size={80} className="text-gray-300 mx-auto mb-6" />
                  <p className="text-gray-600 font-medium">Document</p>
                  <p className="text-sm text-gray-400 mt-1">{viewingProofFile.file_name}</p>
                  <div className="mt-6 flex gap-3 justify-center">
                    <button onClick={() => downloadProofFile(viewingProofFile)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
                      <Download size={16} /> Download File
                    </button>
                    <button onClick={closeProofViewer} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Close</button>
                  </div>
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

              {formData.existingProof && formData.proofFiles.length === 0 && getProofFiles(formData.existingProof).length > 0 && (
                <div className="mt-3 space-y-2">
                  {getProofFiles(formData.existingProof).map((file, index) => (
                    <div key={`${file.file_name}-${index}`} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      {getFileIcon(file.file_name)}
                      <span className="flex-1 truncate">{file.file_name}</span>
                      {file.file_size && <span className="text-xs text-green-600">{formatFileSize(file.file_size)}</span>}
                      <button onClick={() => openProofViewer(file)} className="text-blue-600 hover:text-blue-800 transition-colors" title="View file">
                        <Eye size={16} />
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
            const proofFiles = getProofFiles(exp.verification_method);
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
                    <button onClick={() => handleDelete(exp.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete" type="button">
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