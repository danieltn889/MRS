import React, { useState, useRef } from 'react';
import { Plus, Edit, Trash2, Save, X, ExternalLink, Globe, Github, Linkedin, Briefcase, Upload, FileText, Download, Eye, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { addPortfolioLink, updatePortfolioLink, deletePortfolioLink, uploadCandidateDocument } from '../../services/candidateAPI';
import { resolveFileUrl } from '../../utils/fileUrl';
import ConfirmDialog from './ConfirmDialog';

// =====================================================
// TYPESCRIPT INTERFACES
// =====================================================
interface PortfolioFile {
  file_name: string;
  file_url?: string;
  file_key?: string;
  file_size?: number;
  file_type?: string;
  uploaded_at?: string;
}

interface PortfolioLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  platform: string;
  display_order?: number;
  is_primary?: boolean;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
  metadata?: { files?: PortfolioFile[] } & Record<string, any>;
}

interface PortfolioSectionProps {
  profile: { 
    portfolioLinks?: PortfolioLink[];
    portfolio?: PortfolioLink[];
  } | null;
  onUpdate: () => void;
}

interface PortfolioFormData {
  title: string;
  url: string;
  description: string;
  platform: string;
  displayOrder: number;
  isPrimary: boolean;
  attachedFiles: File[];
  existingFiles: PortfolioFile[];
}

const ALLOWED_PORTFOLIO_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_PORTFOLIO_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const isImageFile = (name?: string): boolean => /\.(jpg|jpeg|png|gif|webp)$/i.test(name || '');
const isPdfFile = (name?: string): boolean => /\.pdf$/i.test(name || '');

// =====================================================
// COMPONENT
// =====================================================
const PortfolioSection: React.FC<PortfolioSectionProps> = ({ profile, onUpdate }) => {
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PortfolioFormData>({
    title: '',
    url: '',
    description: '',
    platform: 'personal',
    displayOrder: 0,
    isPrimary: false,
    attachedFiles: [],
    existingFiles: []
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<PortfolioFile | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FIX: Use portfolioLinks from the correct field
  const portfolioLinks = profile?.portfolioLinks || profile?.portfolio || [];

  const resetForm = (): void => {
    setFormData({
      title: '',
      url: '',
      description: '',
      platform: 'personal',
      displayOrder: 0,
      isPrimary: false,
      attachedFiles: [],
      existingFiles: []
    });
    setUrlError('');
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setFileError('');
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    for (const file of files) {
      if (!ALLOWED_PORTFOLIO_TYPES.includes(file.type)) {
        setFileError(`"${file.name}" is not a supported type. Use PDF, Word, or images (JPG, PNG, GIF, WEBP).`);
        continue;
      }
      if (file.size > MAX_PORTFOLIO_FILE_SIZE) {
        setFileError(`"${file.name}" is larger than 10MB.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setFormData(prev => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, ...validFiles].slice(0, 5)
      }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedFile = (index: number): void => {
    setFormData(prev => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((_, i) => i !== index)
    }));
  };

  const removeExistingFile = (index: number): void => {
    setFormData(prev => ({
      ...prev,
      existingFiles: prev.existingFiles.filter((_, i) => i !== index)
    }));
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('Please enter a title');
      return;
    }
    
    if (!formData.url.trim()) {
      alert('Please enter a URL');
      return;
    }

    if (!validateUrl(formData.url)) {
      setUrlError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setUrlError('');
    setLoading(true);

    try {
      // Upload any newly attached project files so they persist and stay
      // viewable/downloadable, then keep their references in metadata.files.
      const uploadedFiles: PortfolioFile[] = [];
      for (const file of formData.attachedFiles) {
        const res = await uploadCandidateDocument(file, 'portfolio');
        const data = res?.data || {};
        uploadedFiles.push({
          file_name: data.file_name || file.name,
          file_url: data.file_url,
          file_key: data.file_key,
          file_size: data.file_size ?? file.size,
          file_type: data.mime_type || file.type,
          uploaded_at: data.uploaded_at || new Date().toISOString(),
        });
      }

      const allFiles = [...formData.existingFiles, ...uploadedFiles];

      const submitData = {
        title: formData.title,
        url: formData.url,
        description: formData.description,
        platform: formData.platform || 'personal',
        displayOrder: formData.displayOrder,
        isPrimary: formData.isPrimary,
        metadata: { files: allFiles }
      };

      if (editingId) {
        await updatePortfolioLink(editingId, submitData);
      } else {
        await addPortfolioLink(submitData);
      }

      onUpdate();
      setIsAdding(false);
      setEditingId(null);
      resetForm();
    } catch (error: any) {
      alert('Error saving portfolio link: '+ (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (link: PortfolioLink): void => {
    setFormData({
      title: link.title || '',
      url: link.url || '',
      description: link.description || '',
      platform: link.platform || 'personal',
      displayOrder: link.display_order || 0,
      isPrimary: link.is_primary || false,
      attachedFiles: [],
      existingFiles: Array.isArray(link.metadata?.files) ? link.metadata!.files! : []
    });
    setEditingId(link.id);
    setIsAdding(true);
    setUrlError('');
    setFileError('');
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deletePortfolioLink(deleteId);
      setDeleteId(null);
      onUpdate();
    } catch (error: any) {
      alert('Error removing portfolio link: '+ (error.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  const handleCancel = (): void => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const getTypeIcon = (type: string): React.ElementType => {
    const icons: Record<string, React.ElementType> = {
      personal: Globe,
      github: Github,
      linkedin: Linkedin,
      professional: Briefcase,
      portfolio: Globe,
      behance: ExternalLink,
      dribbble: ExternalLink,
      medium: ExternalLink,
      other: ExternalLink
    };
    return icons[type] || ExternalLink;
  };

  const getTypeLabel = (platform: string): string => {
    const labels: Record<string, string> = {
      personal: 'Personal Website',
      github: 'GitHub',
      linkedin: 'LinkedIn',
      professional: 'Professional',
      portfolio: 'Portfolio',
      behance: 'Behance',
      dribbble: 'Dribbble',
      medium: 'Medium',
      other: 'Other'
    };
    return labels[platform] || 'Other';
  };

  const getTypeColor = (platform: string): string => {
    const colors: Record<string, string> = {
      personal: 'bg-blue-100 text-blue-800',
      github: 'bg-gray-100 text-gray-800',
      linkedin: 'bg-blue-100 text-blue-800',
      professional: 'bg-green-100 text-green-800',
      portfolio: 'bg-purple-100 text-purple-800',
      behance: 'bg-indigo-100 text-indigo-800',
      dribbble: 'bg-pink-100 text-pink-800',
      medium: 'bg-yellow-100 text-yellow-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[platform] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Portfolio & Links</h2>
          <p className="text-sm text-gray-600">Showcase your work and connect your online presence</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            Add Link
          </button>
        )}
      </div>

      {/* Portfolio Form */}
      {isAdding && (
        <div className="bg-gray-50 p-6 rounded-lg border">
          <h3 className="text-lg font-medium mb-4">
            {editingId ? 'Edit Portfolio Link': 'Add Portfolio Link'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., My Portfolio Website"
                required
              />
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL *
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => {
                  setFormData({...formData, url: e.target.value});
                  setUrlError('');
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  urlError ? 'border-red-500': 'border-gray-300'
                }`}
                placeholder="https://example.com"
                required
              />
              {urlError && (
                <p className="mt-1 text-sm text-red-600">{urlError}</p>
              )}
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Platform
              </label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({...formData, platform: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="personal">Personal Website</option>
                <option value="github">GitHub</option>
                <option value="linkedin">LinkedIn</option>
                <option value="professional">Professional Portfolio</option>
                <option value="portfolio">Portfolio</option>
                <option value="behance">Behance</option>
                <option value="dribbble">Dribbble</option>
                <option value="medium">Medium</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Brief description of this link..."
              />
            </div>

            {/* Project Files (images / documents) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Files <span className="text-gray-400 font-normal">(optional   images or documents)</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="portfolioFiles"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label htmlFor="portfolioFiles" className="cursor-pointer flex flex-col items-center gap-1">
                  <Upload size={22} className="text-gray-400" />
                  <span className="text-sm text-gray-600">Click to upload images or documents</span>
                  <span className="text-xs text-gray-400">PDF, Word, JPG, PNG, GIF, WEBP · up to 10MB · max 5 files</span>
                </label>
              </div>
              {fileError && <p className="mt-1 text-sm text-red-600">{fileError}</p>}

              {/* Already-saved files */}
              {formData.existingFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-gray-500">Saved files</p>
                  {formData.existingFiles.map((file, index) => (
                    <div key={`${file.file_name}-${index}`} className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      {isImageFile(file.file_name) ? <ImageIcon size={16} /> : isPdfFile(file.file_name) ? <FileText size={16} /> : <FileIcon size={16} />}
                      <span className="flex-1 truncate">{file.file_name}</span>
                      {file.file_size && <span className="text-xs text-green-600">{formatFileSize(file.file_size)}</span>}
                      <button type="button" onClick={() => setPreviewFile(file)} className="text-blue-600 hover:text-blue-800" title="Preview">
                        <Eye size={16} />
                      </button>
                      <button type="button" onClick={() => removeExistingFile(index)} className="text-gray-400 hover:text-red-600" title="Remove">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Newly-selected files (not yet uploaded) */}
              {formData.attachedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {formData.attachedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      {file.type.startsWith('image/') ? <ImageIcon size={16} /> : file.type === 'application/pdf'? <FileText size={16} /> : <FileIcon size={16} />}
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                      <button type="button" onClick={() => removeAttachedFile(index)} className="text-gray-400 hover:text-red-600" title="Remove">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Primary Link */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={formData.isPrimary}
                onChange={(e) => setFormData({...formData, isPrimary: e.target.checked})}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isPrimary" className="text-sm text-gray-700">
                This is my primary portfolio link
              </label>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={18} />
                {loading ? 'Saving...': 'Save'}
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

      {/* Portfolio Links List */}
      <div className="space-y-4">
        {portfolioLinks.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Globe size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No portfolio links added yet</p>
            <p className="text-sm">Add links to your portfolio, GitHub, LinkedIn, or other professional profiles</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {portfolioLinks.map((link) => {
              const IconComponent = getTypeIcon(link.platform);
              return (
                <div key={link.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <IconComponent size={20} className="text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{link.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(link.platform)}`}>
                            {getTypeLabel(link.platform)}
                          </span>
                          {link.is_primary && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                              Primary
                            </span>
                          )}
                          {link.is_verified && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                              ✓ Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEdit(link)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteId(link.id)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium break-all"
                    >
                      <ExternalLink size={14} />
                      {link.url.length > 50 ? link.url.substring(0, 50) + '...': link.url}
                    </a>

                    {link.description && (
                      <p className="text-sm text-gray-700 mt-2">{link.description}</p>
                    )}

                    {Array.isArray(link.metadata?.files) && link.metadata!.files!.length > 0 && (
                      <div className="mt-3 space-y-1.5 pt-2 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500">Project files</p>
                        {link.metadata!.files!.map((file, index) => (
                          <div key={`${file.file_name}-${index}`} className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                            {isImageFile(file.file_name) ? <ImageIcon size={14} className="text-gray-500" /> : isPdfFile(file.file_name) ? <FileText size={14} className="text-red-400" /> : <FileIcon size={14} className="text-gray-500" />}
                            <span className="flex-1 truncate text-gray-700">{file.file_name}</span>
                            <button onClick={() => setPreviewFile(file)} className="text-blue-600 hover:text-blue-800" title="Preview">
                              <Eye size={15} />
                            </button>
                            {file.file_url && (
                              <a href={resolveFileUrl(file.file_url)} download={file.file_name} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800" title="Download">
                                <Download size={15} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        title="Remove portfolio link?"
        message="This will permanently remove this portfolio link and its attached files from your profile."
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
              <span className="font-medium text-gray-900 truncate">{previewFile.file_name}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {previewFile.file_url && (
                  <a href={resolveFileUrl(previewFile.file_url)} download={previewFile.file_name} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    <Download size={16} /> Download
                  </a>
                )}
                <button onClick={() => setPreviewFile(null)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-72px)] bg-gray-50">
              {!previewFile.file_url ? (
                <p className="text-center text-gray-500 py-12">Preview unavailable.</p>
              ) : isImageFile(previewFile.file_name) ? (
                <div className="flex items-center justify-center min-h-[300px] bg-white rounded-lg shadow-inner overflow-auto">
                  <img src={resolveFileUrl(previewFile.file_url)} alt={previewFile.file_name} className="max-w-full max-h-[70vh] object-contain rounded-lg" />
                </div>
              ) : isPdfFile(previewFile.file_name) ? (
                <iframe src={resolveFileUrl(previewFile.file_url)} title={previewFile.file_name} className="w-full h-[70vh] rounded-lg bg-white shadow-inner" />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
                  <FileIcon size={64} className="text-gray-300 mb-4" />
                  <p className="text-gray-600">This file type can't be previewed inline.</p>
                  <a href={resolveFileUrl(previewFile.file_url)} download={previewFile.file_name} target="_blank" rel="noopener noreferrer" className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                    <Download size={16} /> Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioSection;