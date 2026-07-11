import React, { useRef } from 'react';
import { AlertCircle, CheckCircle, Upload, X } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export const validateDocumentFile = (file: File): string | null => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG and PDF files are supported.';
  }
  if (file.size > MAX_SIZE) {
    return 'File must be under 10 MB.';
  }
  return null;
};

interface FileSlotProps {
  label: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  required?: boolean;
}

const FileSlot: React.FC<FileSlotProps> = ({ label, file, onSelect, required }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) {
      onSelect(null);
      return;
    }
    const validationError = validateDocumentFile(selected);
    if (validationError) {
      setError(validationError);
      onSelect(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setError('');
    onSelect(selected);
  };

  const handleRemove = () => {
    onSelect(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label} {required && '*'}
      </label>
      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Upload className="w-4 h-4 mr-2" />
          Choose file (JPG, PNG or PDF, max 10MB)
        </button>
      ) : (
        <div className="flex items-center justify-between px-4 py-3 border border-gray-300 rounded-lg bg-gray-50">
          <div className="flex items-center text-sm text-gray-700 truncate">
            <CheckCircle className="w-4 h-4 text-green-600 mr-2 flex-shrink-0" />
            <span className="truncate">{file.name}</span>
          </div>
          <button type="button" onClick={handleRemove} className="text-gray-400 hover:text-red-600 ml-2 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleChange}
        className="hidden"
      />
      {error && (
        <div className="mt-1 text-sm text-red-600 flex items-center">
          <AlertCircle className="w-4 h-4 mr-1" />
          {error}
        </div>
      )}
    </div>
  );
};

interface IdentityDocumentUploadProps {
  documentType: 'national_id'| 'passport';
  documentFront: File | null;
  documentBack: File | null;
  onFrontChange: (file: File | null) => void;
  onBackChange: (file: File | null) => void;
}

// National ID needs a front (required) and back (optional) image; a
// passport only needs its single information page.
const IdentityDocumentUpload: React.FC<IdentityDocumentUploadProps> = ({
  documentType, documentFront, documentBack, onFrontChange, onBackChange
}) => {
  if (documentType === 'passport') {
    return (
      <FileSlot label="Passport Information Page" file={documentFront} onSelect={onFrontChange} required />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <FileSlot label="National ID - Front" file={documentFront} onSelect={onFrontChange} required />
      <FileSlot label="National ID - Back (optional)" file={documentBack} onSelect={onBackChange} />
    </div>
  );
};

export default IdentityDocumentUpload;
