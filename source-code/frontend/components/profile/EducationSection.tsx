import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Save, X, GraduationCap, Calendar, ChevronDown, 
  Upload, FileText, CheckCircle, AlertCircle, Loader, Eye, 
  BookOpen, Brain, Sparkles, FileSearch, Image, File
} from 'lucide-react';
import { addEducation, updateEducation, deleteEducation } from '../../services/candidateAPI';
import { extractTextFromFile } from '../../utils/documentTextExtractor';

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
  transcript?: {
    file_name: string;
    file_url: string;
    file_size: number;
    uploaded_at: string;
    extracted_text?: string;
    modules?: string[];
    skills?: string[];
    extraction_method?: 'ocr' | 'text' | 'mixed';
    page_count?: number;
  } | null;
  attachments?: Array<{
    file_name: string;
    file_url: string;
    file_size: number;
    uploaded_at: string;
    extracted_text?: string;
    modules?: string[];
    skills?: string[];
    extraction_method?: 'ocr' | 'text' | 'mixed';
    page_count?: number;
  }> | null;
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
  transcriptFile: File | null;
  extractedModules: string[];
  extractedSkills: string[];
  extractedText: string;
  extractionMethod: 'ocr' | 'text' | 'mixed' | 'none';
}

// Degree options
const DEGREE_OPTIONS = [
  "Bachelor's Degree",
  "Master's Degree",
  "PhD / Doctorate",
  "Associate Degree",
  "High School Diploma",
  "Professional Certificate",
  "Vocational Training",
  "No Degree Required",
  "Bachelor of Science (BSc)",
  "Bachelor of Arts (BA)",
  "Bachelor of Business Administration (BBA)",
  "Bachelor of Commerce (BCom)",
  "Bachelor of Engineering (BEng)",
  "Bachelor of Laws (LLB)",
  "Bachelor of Education (BEd)",
  "Bachelor of Architecture (BArch)",
  "Bachelor of Fine Arts (BFA)",
  "Bachelor of Social Work (BSW)",
  "Master of Business Administration (MBA)",
  "Master of Science (MSc)",
  "Master of Arts (MA)",
  "Master of Engineering (MEng)",
  "Master of Laws (LLM)",
  "Master of Education (MEd)",
  "Master of Public Administration (MPA)",
  "Master of Public Health (MPH)",
  "Master of Social Work (MSW)",
  "Master of Fine Arts (MFA)",
  "Doctor of Philosophy (PhD)",
  "Doctor of Medicine (MD)",
  "Doctor of Dental Surgery (DDS)",
  "Doctor of Pharmacy (PharmD)",
  "Doctor of Psychology (PsyD)",
  "Doctor of Education (EdD)",
  "Doctor of Business Administration (DBA)",
  "Doctor of Juridical Science (JSD)",
  "Postgraduate Diploma",
  "Advanced Certificate",
  "Executive Education",
  "Certificate Program",
  "Diploma Program",
  "Foundation Degree",
  "Trade School Certificate",
  "Bootcamp Graduate",
  "Self-taught"
];

// Custom Combobox Component
interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}

const Combobox: React.FC<ComboboxProps> = ({ value, onChange, options, placeholder, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [filteredOptions, setFilteredOptions] = useState<string[]>(options);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    const filtered = options.filter(opt => 
      opt.toLowerCase().includes(newValue.toLowerCase())
    );
    setFilteredOptions(filtered);
    setIsOpen(true);
  };

  const handleSelectOption = (option: string) => {
    setInputValue(option);
    onChange(option);
    setIsOpen(false);
  };

  const handleFocus = () => {
    setFilteredOptions(options);
    setIsOpen(true);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          required={required}
          className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <ChevronDown size={16} />
        </button>
      </div>
      
      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
          {filteredOptions.map((option, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectOption(option)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
            >
              {option}
            </button>
          ))}
        </div>
      )}
      
      {isOpen && filteredOptions.length === 0 && inputValue && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500">
          Press Enter to use "{inputValue}"
        </div>
      )}
    </div>
  );
};

// Text Extraction Utility
class TranscriptExtractor {
  static async extractTextFromFile(file: File): Promise<{ text: string; method: 'text' | 'ocr' | 'mixed'; pageCount?: number }> {
    try {
      return await extractTextFromFile(file, file.name);
    } catch (error) {
      console.error('Error extracting text:', error);
      throw error;
    }
  }

  // Extract modules from text
  static extractModulesFromText(text: string): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const modules: string[] = [];
    
    const modulePatterns = [
      /module\s*[:.]?\s*([^\n,]+)/gi,
      /unit\s*[:.]?\s*([^\n,]+)/gi,
      /chapter\s*[:.]?\s*([^\n,]+)/gi,
      /course\s*[:.]?\s*([^\n,]+)/gi,
      /subject\s*[:.]?\s*([^\n,]+)/gi,
      /topic\s*[:.]?\s*([^\n,]+)/gi,
    ];

    for (const line of lines) {
      for (const pattern of modulePatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 2 && match[1].length < 100) {
            modules.push(match[1].trim());
          }
        }
      }
    }

    // Numbered lists
    const numberedPattern = /^\s*\d+[\.\)]\s*(.+)$/;
    for (const line of lines) {
      const match = line.match(numberedPattern);
      if (match && match[1] && match[1].length > 2 && match[1].length < 100) {
        modules.push(match[1].trim());
      }
    }

    // Course codes
    const courseCodePattern = /\b[A-Z]{2,}\s*\d{3,4}\b/g;
    for (const line of lines) {
      const matches = line.match(courseCodePattern);
      if (matches) {
        modules.push(...matches);
      }
    }

    return [...new Set(modules)];
  }

  // Extract skills from text
  static extractSkillsFromText(text: string): string[] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const skills: string[] = [];
    
    const skillPatterns = [
      /skill\s*[:.]?\s*([^\n,]+)/gi,
      /proficient in\s*([^\n,]+)/gi,
      /knowledge of\s*([^\n,]+)/gi,
      /experienced in\s*([^\n,]+)/gi,
      /expertise in\s*([^\n,]+)/gi,
      /competency in\s*([^\n,]+)/gi,
      /ability to\s*([^\n,]+)/gi,
      /familiar with\s*([^\n,]+)/gi,
      /skilled in\s*([^\n,]+)/gi,
    ];

    for (const line of lines) {
      for (const pattern of skillPatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > 2 && match[1].length < 50) {
            skills.push(match[1].trim());
          }
        }
      }
    }

    return [...new Set(skills)];
  }

  // Parse transcript
  static parseTranscript(text: string): { modules: string[]; skills: string[] } {
    const modules = this.extractModulesFromText(text);
    const skills = this.extractSkillsFromText(text);
    
    if (modules.length === 0) {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 10 && line.length < 100);
      for (const line of lines) {
        if (/[A-Z]{2,}\s*\d{3}/.test(line) || /course/i.test(line) || /class/i.test(line) || /lecture/i.test(line)) {
          modules.push(line);
        }
      }
    }

    return { modules, skills };
  }
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
    description: '',
    transcriptFile: null,
    extractedModules: [],
    extractedSkills: [],
    extractedText: '',
    extractionMethod: 'none'
  });
  const [loading, setLoading] = useState(false);
  const [dateError, setDateError] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [extractionStatus, setExtractionStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [showExtractedData, setShowExtractedData] = useState(false);
  const [showExtractedText, setShowExtractedText] = useState(false);
  const [expandedTranscriptTextId, setExpandedTranscriptTextId] = useState<string | number | null>(null);
  const [processingMessage, setProcessingMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      description: '',
      transcriptFile: null,
      extractedModules: [],
      extractedSkills: [],
      extractedText: '',
      extractionMethod: 'none'
    });
    setDateError('');
    setUploadStatus('idle');
    setExtractionStatus('idle');
    setUploadProgress(0);
    setShowExtractedData(false);
    setShowExtractedText(false);
    setProcessingMessage('');
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
      return 'Please provide a valid end date.';
    }

    if (end < start) {
      return 'End date cannot be before start date.';
    }

    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (endDay > todayDay) {
      return 'End date cannot be in the future.';
    }

    return null;
  };

  const processTranscript = async (file: File) => {
    setUploadStatus('uploading');
    setExtractionStatus('processing');
    setUploadProgress(0);
    setProcessingMessage('Starting extraction...');
    setShowExtractedData(false);
    setShowExtractedText(false);
    setFormData(prev => ({
      ...prev,
      transcriptFile: file,
      extractedText: '',
      extractedModules: [],
      extractedSkills: [],
      extractionMethod: 'none'
    }));

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    try {
      let progress = 0;
      progressInterval = setInterval(() => {
        progress += 10;
        if (progress <= 80) {
          setUploadProgress(progress);
          if (progress < 30) setProcessingMessage('Reading file...');
          else if (progress < 60) setProcessingMessage('Extracting text...');
          else setProcessingMessage('Analyzing content...');
        }
      }, 300);

      const result = await TranscriptExtractor.extractTextFromFile(file);
      
      clearInterval(progressInterval);
      setUploadProgress(90);
      setProcessingMessage('Parsing modules and skills...');

      const { modules, skills } = TranscriptExtractor.parseTranscript(result.text);
      
      setUploadProgress(100);
      setUploadStatus('success');
      setExtractionStatus('success');
      setProcessingMessage('Extraction complete!');

      setFormData(prev => ({
        ...prev,
        transcriptFile: file,
        extractedText: result.text,
        extractedModules: modules,
        extractedSkills: skills,
        extractionMethod: result.method
      }));

      setShowExtractedData(true);

    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      console.error('Error processing transcript:', error);
      setUploadStatus('error');
      setExtractionStatus('error');
      setProcessingMessage('Error processing transcript');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to process transcript: ${errorMessage}\n\nTip: For best results, upload a clear image (JPG/PNG) or a text-based PDF.`);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a PDF or image file (JPEG, PNG)');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      e.target.value = '';
      return;
    }

    await processTranscript(file);
  };

  const removeFile = () => {
    setFormData(prev => ({
      ...prev,
      transcriptFile: null,
      extractedText: '',
      extractedModules: [],
      extractedSkills: [],
      extractionMethod: 'none'
    }));
    setUploadStatus('idle');
    setExtractionStatus('idle');
    setShowExtractedData(false);
    setShowExtractedText(false);
    setUploadProgress(0);
    setProcessingMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      const attachments = formData.transcriptFile ? [{
          file_name: formData.transcriptFile.name,
          file_url: URL.createObjectURL(formData.transcriptFile),
          file_size: formData.transcriptFile.size,
          uploaded_at: new Date().toISOString(),
          extracted_text: formData.extractedText,
          modules: formData.extractedModules,
          skills: formData.extractedSkills,
          extraction_method: formData.extractionMethod,
        }] : undefined;

      const submissionData = {
        institution: formData.institution,
        degree: formData.degree,
        fieldOfStudy: formData.fieldOfStudy,
        startDate: formData.startDate,
        endDate: formData.isCurrent ? null : formData.endDate || null,
        isCurrent: formData.isCurrent,
        grade: formData.grade || undefined,
        gradeScale: formData.gradeScale || undefined,
        description: formData.description || undefined,
        skills: formData.extractedSkills,
        ...(attachments ? { attachments } : {})
      };

      if (editingId) {
        await updateEducation(editingId, submissionData);
      } else {
        await addEducation(submissionData);
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

  const getTranscript = (edu: EducationItem) => edu.transcript || edu.attachments?.[0] || null;

  const handleEdit = (edu: EducationItem) => {
    const transcript = getTranscript(edu);

    setFormData({
      institution: edu.institution || '',
      degree: edu.degree || '',
      fieldOfStudy: edu.field_of_study || '',
      startDate: edu.start_date ? edu.start_date.split('T')[0] : '',
      endDate: edu.end_date ? edu.end_date.split('T')[0] : '',
      isCurrent: edu.is_current || false,
      grade: edu.grade || '',
      gradeScale: edu.grade_scale || '',
      description: edu.description || '',
      transcriptFile: null,
      extractedText: transcript?.extracted_text || '',
      extractedModules: transcript?.modules || [],
      extractedSkills: transcript?.skills || [],
      extractionMethod: (transcript?.extraction_method as 'ocr' | 'text' | 'mixed' | 'none') || 'none'
    });
    setEditingId(String(edu.id));
    setIsAdding(true);
    setUploadStatus('idle');
    setExtractionStatus('idle');
    setShowExtractedData(Boolean(transcript?.extracted_text || transcript?.modules?.length || transcript?.skills?.length));
    setShowExtractedText(false);
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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getExtractionMethodLabel = (method: string): string => {
    switch (method) {
      case 'text': return 'Text Extraction';
      case 'ocr': return 'OCR (Image)';
      case 'mixed': return 'Mixed Method';
      default: return 'Unknown';
    }
  };

  const getExtractionMethodIcon = (method: string) => {
    switch (method) {
      case 'text': return <FileText size={14} className="text-green-600" />;
      case 'ocr': return <Image size={14} className="text-blue-600" />;
      case 'mixed': return <File size={14} className="text-purple-600" />;
      default: return null;
    }
  };

  const renderExtractedTextPanel = (text: string, label = 'Full Extracted Text') => (
    <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <FileText size={15} className="text-blue-600" />
          {label}
        </div>
        <span className="text-xs text-gray-500">{text.length.toLocaleString()} characters</span>
      </div>
      <div className="max-h-96 overflow-auto p-3">
        <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-gray-800 font-mono">
          {text}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Education</h2>
          <p className="text-sm text-gray-600">Add your educational background and transcripts</p>
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
                <Combobox
                  value={formData.degree}
                  onChange={(value) => setFormData({...formData, degree: value})}
                  options={DEGREE_OPTIONS}
                  placeholder="Select or type your degree"
                  required
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
                {formData.isCurrent && (
                  <p className="text-xs text-gray-500 mt-1">End date disabled while currently studying</p>
                )}
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

            {/* Transcript Upload Section */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transcript / Certificate <span className="text-xs text-gray-500">(PDF, PNG, JPG - Max 10MB)</span>
              </label>
              
              {!formData.transcriptFile ? (
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FileSearch size={32} className="text-gray-400 mb-2" />
                      <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-400">
                        We'll automatically extract modules and skills
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Supports: Text-based PDFs, Images (JPG, PNG)
                      </p>
                      <p className="text-xs text-blue-500 mt-1">
                        💡 For scanned PDFs, upload as image instead
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
                    />
                  </label>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText size={24} className="text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {formData.transcriptFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(formData.transcriptFile.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(uploadStatus === 'uploading' || extractionStatus === 'processing') && (
                        <div className="flex items-center gap-2">
                          <Loader size={18} className="text-blue-600 animate-spin" />
                          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-600 transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{uploadProgress}%</span>
                        </div>
                      )}
                      {uploadStatus === 'success' && extractionStatus === 'success' && (
                        <CheckCircle size={20} className="text-green-600" />
                      )}
                      {uploadStatus === 'error' && (
                        <AlertCircle size={20} className="text-red-600" />
                      )}
                      <button
                        type="button"
                        onClick={removeFile}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        disabled={uploadStatus === 'uploading' || extractionStatus === 'processing'}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {processingMessage && uploadStatus !== 'success' && (
                    <div className="text-sm text-gray-600 flex items-center gap-2">
                      <Loader size={14} className="animate-spin" />
                      {processingMessage}
                    </div>
                  )}

                  {showExtractedData && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Sparkles size={16} />
                        <span>Successfully extracted content from transcript</span>
                        {formData.extractionMethod !== 'none' && (
                          <span className="text-xs text-gray-500 ml-2 flex items-center gap-1">
                            {getExtractionMethodIcon(formData.extractionMethod)}
                            {getExtractionMethodLabel(formData.extractionMethod)}
                          </span>
                        )}
                      </div>
                      
                      {formData.extractedModules.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                            <BookOpen size={16} />
                            Modules/Courses Found ({formData.extractedModules.length})
                          </h4>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {formData.extractedModules.map((module, index) => (
                              <span key={index} className="bg-white px-3 py-1 rounded-full text-xs border border-blue-200 text-blue-700">
                                {module}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {formData.extractedSkills.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                            <Brain size={16} />
                            Skills Extracted ({formData.extractedSkills.length})
                          </h4>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {formData.extractedSkills.map((skill, index) => (
                              <span key={index} className="bg-white px-3 py-1 rounded-full text-xs border border-purple-200 text-purple-700">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowExtractedText(prev => !prev)}
                        disabled={!formData.extractedText}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        <Eye size={14} />
                        {showExtractedText ? 'Hide extracted text' : 'View full extracted text'}
                      </button>

                      {showExtractedText && formData.extractedText && (
                        renderExtractedTextPanel(
                          formData.extractedText,
                          `Full Extracted Text (${getExtractionMethodLabel(formData.extractionMethod)})`
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
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
          education.map((edu) => {
            const transcript = getTranscript(edu);

            return (
            <div key={edu.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <GraduationCap size={20} className="text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">
                      {edu.degree} {edu.field_of_study && `in ${edu.field_of_study}`}
                    </h3>
                  </div>

                  <p className="text-gray-600 mb-2">{edu.institution}</p>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar size={16} />
                      {getYear(edu.start_date)} - {
                        edu.is_current ? 'Present' : getYear(edu.end_date)
                      }
                    </div>
                    {edu.grade && (
                      <span>Grade: {edu.grade}{edu.grade_scale && `/${edu.grade_scale}`}</span>
                    )}
                    {transcript && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle size={14} />
                        Transcript uploaded
                      </span>
                    )}
                    {transcript?.extraction_method && (
                      <span className="flex items-center gap-1 text-gray-500">
                        {getExtractionMethodIcon(transcript.extraction_method)}
                        <span className="text-xs">{getExtractionMethodLabel(transcript.extraction_method)}</span>
                      </span>
                    )}
                    {transcript?.modules && transcript.modules.length > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <BookOpen size={14} />
                        {transcript.modules.length} modules
                      </span>
                    )}
                    {transcript?.skills && transcript.skills.length > 0 && (
                      <span className="flex items-center gap-1 text-purple-600">
                        <Brain size={14} />
                        {transcript.skills.length} skills
                      </span>
                    )}
                  </div>

                  {edu.description && (
                    <p className="text-gray-700 text-sm">{edu.description}</p>
                  )}

                  {transcript && (
                    <div className="mt-3 space-y-3">
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-blue-600" />
                          <span className="text-sm text-gray-700">{transcript.file_name}</span>
                          <span className="text-xs text-gray-400">({formatFileSize(transcript.file_size)})</span>
                          <a
                            href={transcript.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            View Transcript
                          </a>
                          {transcript.extracted_text && (
                            <button
                              type="button"
                              onClick={() => setExpandedTranscriptTextId(
                                expandedTranscriptTextId === edu.id ? null : edu.id
                              )}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                            >
                              <Eye size={14} />
                              {expandedTranscriptTextId === edu.id ? 'Hide Text' : 'View Text'}
                            </button>
                          )}
                        </div>
                      </div>

                      {expandedTranscriptTextId === edu.id && transcript.extracted_text && (
                        renderExtractedTextPanel(
                          transcript.extracted_text,
                          `Full Extracted Text${transcript.extraction_method ? ` (${getExtractionMethodLabel(transcript.extraction_method)})` : ''}`
                        )
                      )}

                      {transcript.modules && transcript.modules.length > 0 && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <h4 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                            <BookOpen size={14} />
                            Modules & Courses
                          </h4>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {transcript.modules.slice(0, 10).map((module, index) => (
                              <span key={index} className="bg-white px-2 py-1 rounded-full text-xs border border-blue-200 text-blue-700">
                                {module}
                              </span>
                            ))}
                            {transcript.modules.length > 10 && (
                              <span className="text-xs text-blue-600">+{transcript.modules.length - 10} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {transcript.skills && transcript.skills.length > 0 && (
                        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                            <Brain size={14} />
                            Skills
                          </h4>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {transcript.skills.slice(0, 10).map((skill, index) => (
                              <span key={index} className="bg-white px-2 py-1 rounded-full text-xs border border-purple-200 text-purple-700">
                                {skill}
                              </span>
                            ))}
                            {transcript.skills.length > 10 && (
                              <span className="text-xs text-purple-600">+{transcript.skills.length - 10} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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
            );
          })
        )}
      </div>
    </div>
  );
};

export default EducationSection;
