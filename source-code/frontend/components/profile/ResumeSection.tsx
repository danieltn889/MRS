import React, { useState, useRef, ChangeEvent } from 'react';
import {
  Upload, FileText, Download, Trash2, Star, StarOff,
  Eye, CheckCircle, AlertCircle, X, BookOpen, Copy, Check,
} from 'lucide-react';
import JSZip from 'jszip';
import { uploadResume, deleteResume, setPrimaryResume, downloadResume } from '../../services/candidateAPI';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Resume {
  id: string;
  file_name: string;
  file_url: string;
  file_key?: string;
  file_size: number;
  is_primary: boolean;
  version?: number;
  uploaded_at: string;
  created_at?: string;
  mime_type?: string;
}

interface ResumeSectionProps {
  profile: { resumes?: Resume[] } | null;
  onUpdate: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatFileSize = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatDate = (d: string): string => {
  try { return new Date(d).toLocaleDateString('en-GB'); }
  catch { return '—'; }
};

const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf')               return '📄';
  if (ext === 'doc' || ext === 'docx') return '📝';
  return '📎';
};

const isWordDoc = (name: string) =>
  /\.(doc|docx)$/i.test(name);

// ── Delete Confirmation Modal ──────────────────────────────────────────────────

const DeleteModal = ({
  name, onConfirm, onCancel,
}: { name: string; onConfirm: () => void; onCancel: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
      <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Trash2 className="w-7 h-7 text-red-600" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Resume?</h3>
      <p className="text-sm text-gray-500 mb-6">
        Are you sure you want to permanently delete{' '}
        <span className="font-semibold text-gray-700">"{name}"</span>?
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors">
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ── Upload Success Modal ───────────────────────────────────────────────────────

const UploadSuccessModal = ({
  name, size, onClose,
}: { name: string; size: number; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle className="w-11 h-11 text-green-600" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Resume Uploaded!</h2>
      <p className="text-sm text-gray-500 mb-5">Your resume has been saved to your profile.</p>
      <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6 flex items-center gap-3 text-left">
        <span className="text-2xl">{fileIcon(name)}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{name}</p>
          <p className="text-xs text-gray-400">{formatFileSize(size)}</p>
        </div>
      </div>
      <button onClick={onClose}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all">
        Done
      </button>
    </div>
  </div>
);

// ── DOCX text extractor (uses jszip — no extra package needed) ─────────────────

async function extractDocxText(blob: Blob): Promise<string> {
  const zip  = await JSZip.loadAsync(blob);
  const xml  = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '';

  const doc        = new DOMParser().parseFromString(xml, 'text/xml');
  const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));

  return paragraphs
    .map(p => {
      const runs = Array.from(p.getElementsByTagNameNS('*', 't'));
      return runs.map(t => t.textContent ?? '').join('');
    })
    .filter(Boolean)
    .join('\n');
}

// ── Content Viewer Modal ───────────────────────────────────────────────────────

interface ContentModalProps {
  resume: Resume;
  content: string;
  onClose: () => void;
}

const ContentModal: React.FC<ContentModalProps> = ({ resume, content, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 text-xl">
              {fileIcon(resume.file_name)}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{resume.file_name}</h2>
              <p className="text-xs text-gray-400">
                {formatFileSize(resume.file_size)} · Uploaded {formatDate(resume.uploaded_at || resume.created_at || '')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
            >
              {copied ? <><Check size={13} className="text-green-600" /> Copied</> : <><Copy size={13} /> Copy all</>}
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {content.trim() ? (
            <pre className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans">
              {content}
            </pre>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <FileText size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No readable text could be extracted from this file.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────────

const ResumeSection: React.FC<ResumeSectionProps> = ({ profile, onUpdate }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [successModal, setSuccessModal] = useState<{ name: string; size: number } | null>(null);

  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Resume | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [primaryError, setPrimaryError] = useState('');
  // previewNote is keyed by resume id so the notice shows on the specific card
  const [previewNote, setPreviewNote]   = useState<{ id: string; message: string } | null>(null);

  const [contentModal, setContentModal] = useState<{ resume: Resume; content: string } | null>(null);
  const [reading, setReading]           = useState<string | null>(null); // resume id currently being read
  const [readError, setReadError]       = useState('');

  const resumes: Resume[] = profile?.resumes || [];

  // ── URL resolver ─────────────────────────────────────────────────────────────

  const resolveUrl = (resume: Resume): string => {
    const apiBase   = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';
    const apiOrigin = apiBase.replace(/\/api\/v1\/?$/, '');
    if (resume.file_url) {
      if (/^https?:\/\//.test(resume.file_url)) return resume.file_url;
      return `${apiOrigin}${resume.file_url.startsWith('/') ? '' : '/'}${resume.file_url}`;
    }
    if (resume.file_key) return `${apiOrigin}/uploads/${resume.file_key}`;
    return '';
  };

  // ── Upload ───────────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      setUploadError('Only PDF, DOC and DOCX files are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File must be under 10 MB.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');

    const timer = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 200);

    try {
      await uploadResume(file, resumes.length === 0);
      clearInterval(timer);
      setUploadProgress(100);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUpdate();
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setSuccessModal({ name: file.name, size: file.size });
      }, 600);
    } catch (err: any) {
      clearInterval(timer);
      setUploadError(err?.message || 'Upload failed. Please try again.');
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────

  const handleDownload = async (resume: Resume) => {
    setDownloadError('');
    setDownloading(resume.id);
    try {
      const blob = await downloadResume(resume.id);
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = resume.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err?.message || 'Download failed. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  // ── Read Content ─────────────────────────────────────────────────────────────

  const handleReadContent = async (resume: Resume) => {
    if (!isWordDoc(resume.file_name || '') && !/\.pdf$/i.test(resume.file_name || '')) {
      setReadError('Content extraction is only supported for PDF and Word documents.');
      return;
    }
    setReadError('');
    setReading(resume.id);
    try {
      const blob = await downloadResume(resume.id);
      let text   = '';

      if (isWordDoc(resume.file_name || '')) {
        text = await extractDocxText(blob);
      } else {
        // PDF: extraction requires pdf.js — inform the user
        text = '[PDF text extraction is not yet supported in this view.\nUse the Download button to open the file locally.]';
      }

      setContentModal({ resume, content: text });
    } catch (err: any) {
      setReadError(err?.message || 'Could not read the file content.');
    } finally {
      setReading(null);
    }
  };

  // ── Preview ───────────────────────────────────────────────────────────────────

  // Google Docs Viewer is a remote service — it cannot reach localhost or 127.x.
  const isLocalUrl = (url: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url);

  const handlePreview = (resume: Resume) => {
    setPreviewNote(null);
    const url = resolveUrl(resume);
    if (!url) {
      setPreviewNote({ id: resume.id, message: 'No file URL is available for this resume.' });
      return;
    }

    const isPDF  = resume.mime_type === 'application/pdf' || /\.pdf$/i.test(resume.file_name || '');
    const isWord = isWordDoc(resume.file_name || '');

    if (isPDF) {
      window.open(url, '_blank');
      return;
    }

    if (isWord) {
      if (isLocalUrl(url)) {
        // Google Docs Viewer is a remote service — it cannot reach localhost.
        // Trigger the download and show the explanation on this specific card.
        setPreviewNote({
          id: resume.id,
          message:
            'Word documents cannot be previewed while running on localhost — ' +
            'Google Docs Viewer is a remote service and cannot access local files. ' +
            'The file has been downloaded so you can open it directly.',
        });
        handleDownload(resume);
      } else {
        window.open(
          `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`,
          '_blank'
        );
      }
      return;
    }

    window.open(url, '_blank');
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteResume(deleteTarget.id);
      onUpdate();
      setDeleteTarget(null);
      setDeleteError('');
    } catch (err: any) {
      setDeleteError(err?.message || 'Delete failed. Please try again.');
    }
  };

  // ── Set Primary ───────────────────────────────────────────────────────────────

  const handleSetPrimary = async (id: string) => {
    setPrimaryError('');
    try {
      await setPrimaryResume(id);
      onUpdate();
    } catch (err: any) {
      setPrimaryError(err?.message || 'Could not set primary resume.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Upload Success Modal */}
      {successModal && (
        <UploadSuccessModal
          name={successModal.name}
          size={successModal.size}
          onClose={() => setSuccessModal(null)}
        />
      )}

      {/* Content Viewer Modal */}
      {contentModal && (
        <ContentModal
          resume={contentModal.resume}
          content={contentModal.content}
          onClose={() => setContentModal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <>
          <DeleteModal
            name={deleteTarget.file_name}
            onConfirm={confirmDelete}
            onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
          />
          {deleteError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
              <AlertCircle size={16} />{deleteError}
              <button onClick={() => setDeleteError('')}><X size={14} /></button>
            </div>
          )}
        </>
      )}

      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Resume Management</h2>
            <p className="text-sm text-gray-500">Upload and manage your resume files</p>
          </div>
          <button
            onClick={() => { setUploadError(''); fileInputRef.current?.click(); }}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Upload size={18} />
            {uploading ? 'Uploading…' : 'Upload Resume'}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <Upload size={18} className="text-blue-600 animate-pulse" />
              <span className="text-sm font-semibold text-blue-900">Uploading resume…</span>
              <span className="ml-auto text-sm font-bold text-blue-700">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            <AlertCircle size={16} />{uploadError}
            <button className="ml-auto" onClick={() => setUploadError('')}><X size={14} /></button>
          </div>
        )}

        {/* Download / primary error */}
        {(downloadError || primaryError) && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            <AlertCircle size={16} />{downloadError || primaryError}
            <button className="ml-auto" onClick={() => { setDownloadError(''); setPrimaryError(''); }}><X size={14} /></button>
          </div>
        )}

        {/* Read content error */}
        {readError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            <AlertCircle size={16} />{readError}
            <button className="ml-auto" onClick={() => setReadError('')}><X size={14} /></button>
          </div>
        )}

        {/* Resume List */}
        {resumes.length === 0 ? (
          <div className="text-center py-14 border-2 border-dashed border-gray-200 rounded-2xl">
            <FileText size={52} className="mx-auto mb-3 text-gray-300" />
            <p className="font-semibold text-gray-500">No resumes uploaded yet</p>
            <p className="text-sm text-gray-400 mt-1">Upload your resume to complete your profile</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload size={16} /> Upload Resume
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {resumes.map(resume => (
              <div key={resume.id}
                className="bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-blue-100 transition-all">

                {/* Top row: icon + info */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                    {fileIcon(resume.file_name)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-gray-900 truncate">{resume.file_name}</h3>
                      {resume.is_primary && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-full shrink-0">
                          <Star size={11} fill="currentColor" /> Primary
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{formatFileSize(resume.file_size)}</span>
                      <span>Uploaded {formatDate(resume.uploaded_at || resume.created_at || '')}</span>
                      {resume.version && <span>Version {resume.version}</span>}
                    </div>
                  </div>
                </div>

                {/* Action buttons row */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {/* Preview */}
                  <button
                    onClick={() => handlePreview(resume)}
                    type="button"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Eye size={15} /> Preview
                  </button>

                  {/* Download */}
                  <button
                    onClick={() => handleDownload(resume)}
                    disabled={downloading === resume.id}
                    type="button"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {downloading === resume.id
                      ? <><div className="w-3.5 h-3.5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" /> Downloading…</>
                      : <><Download size={15} /> Download</>
                    }
                  </button>

                  {/* Read Content */}
                  {isWordDoc(resume.file_name || '') && (
                    <button
                      onClick={() => handleReadContent(resume)}
                      disabled={reading === resume.id}
                      type="button"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {reading === resume.id
                        ? <><div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /> Reading…</>
                        : <><BookOpen size={15} /> Read Content</>
                      }
                    </button>
                  )}

                  {/* Set as Primary */}
                  {!resume.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(resume.id)}
                      type="button"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-sm font-semibold rounded-lg transition-colors"
                    >
                      <StarOff size={15} /> Set as Primary
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteTarget(resume)}
                    type="button"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-lg transition-colors ml-auto"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>

                {/* Inline preview note — only shown on this specific card */}
                {previewNote?.id === resume.id && (
                  <div className="mt-3 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-500" />
                    <p className="flex-1 text-xs text-amber-800 leading-relaxed">{previewNote.message}</p>
                    <button
                      onClick={() => setPreviewNote(null)}
                      className="shrink-0 text-amber-400 hover:text-amber-700 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Guidelines */}
        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
          <p className="text-sm font-semibold text-gray-700 mb-2">Resume Upload Guidelines</p>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li>• Supported formats: <strong>PDF, DOC, DOCX</strong></li>
            <li>• Maximum file size: <strong>10 MB</strong></li>
            <li>• Keep your resume up to date with your latest experience</li>
            <li>• Mark one resume as <strong>Primary</strong> — it's used by default for job applications</li>
            <li>• Upload multiple versions for different job types</li>
            <li>• Use <strong>Preview</strong> to view your file · <strong>Download</strong> to save a copy</li>
          </ul>
        </div>
      </div>
    </>
  );
};

export default ResumeSection;
