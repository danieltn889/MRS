import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Save, Globe, Linkedin, Twitter, Github, Facebook, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { NotifyFn } from './CompanyProfile';
import { updateCompanyProfile, uploadCompanyLogo, uploadCompanyBanner } from '../../services/companyAPI';

const API_BASE_URL = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.origin).origin : 'http://localhost:3001';

interface CompanyProfileFormProps {
  companyData: any;
  onUpdate: () => void;
  onNotify?: NotifyFn;
}

interface ValidationErrors {
  name?: string;
  website?: string;
  foundedYear?: string;
  shortDescription?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  facebookUrl?: string;
}

const CURRENT_YEAR = new Date().getFullYear();

const companySizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10000+'];
const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Manufacturing',
  'Retail', 'Consulting', 'Media', 'Real Estate', 'Transportation',
  'Energy', 'Agriculture', 'Construction', 'Hospitality', 'Other',
];

function isValidUrl(url: string): boolean {
  if (!url) return true;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.protocol === 'http:'|| u.protocol === 'https:';
  } catch {
    return false;
  }
}

const InputField: React.FC<{
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}> = ({ label, required, error, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error && (
      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
        <AlertCircle className="h-3 w-3 flex-shrink-0" /> {error}
      </p>
    )}
  </div>
);

const CompanyProfileForm: React.FC<CompanyProfileFormProps> = ({ companyData, onUpdate, onNotify }) => {
  const [formData, setFormData] = useState({
    name: companyData?.name || '',
    legalName: companyData?.legal_name || companyData?.legalName || '',
    industry: companyData?.industry || '',
    size: companyData?.size || '',
    foundedYear: companyData?.founded_year || companyData?.foundedYear || '',
    website: companyData?.website || '',
    description: companyData?.description || '',
    shortDescription: companyData?.short_description || companyData?.shortDescription || '',
    mission: companyData?.mission || '',
    vision: companyData?.vision || '',
    socialLinks: {
      linkedin: companyData?.social_links?.linkedin || companyData?.socialLinks?.linkedin || '',
      twitter: companyData?.social_links?.twitter || companyData?.socialLinks?.twitter || '',
      github: companyData?.social_links?.github || companyData?.socialLinks?.github || '',
      facebook: companyData?.social_links?.facebook || companyData?.socialLinks?.facebook || '',
    },
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    companyData?.logo_url ? `${API_BASE_URL}${companyData.logo_url}` : null
  );
  const [bannerPreview, setBannerPreview] = useState<string | null>(
    companyData?.banner_url ? `${API_BASE_URL}${companyData.banner_url}` : null
  );
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [notification, setNotification] = useState<{ type: 'success'| 'error'; message: string } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (companyData?.logo_url && !logoFile) setLogoPreview(`${API_BASE_URL}${companyData.logo_url}`);
    if (companyData?.banner_url && !bannerFile) setBannerPreview(`${API_BASE_URL}${companyData.banner_url}`);
  }, [companyData, logoFile, bannerFile]);

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const set = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof ValidationErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const setSocial = (platform: string, value: string) => {
    setFormData(prev => ({ ...prev, socialLinks: { ...prev.socialLinks, [platform]: value } }));
    const errKey = `${platform}Url` as keyof ValidationErrors;
    if (errors[errKey]) setErrors(prev => ({ ...prev, [errKey]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: ValidationErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Company name is required';
    else if (formData.name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';
    else if (formData.name.trim().length > 100) newErrors.name = 'Name must be 100 characters or less';

    if (formData.website && !isValidUrl(formData.website)) newErrors.website = 'Enter a valid URL (e.g. https://company.com)';
    if (formData.foundedYear) {
      const yr = parseInt(formData.foundedYear);
      if (isNaN(yr) || yr < 1800 || yr > CURRENT_YEAR) newErrors.foundedYear = `Year must be between 1800 and ${CURRENT_YEAR}`;
    }
    if (formData.shortDescription.length > 300) newErrors.shortDescription = 'Maximum 300 characters';
    if (formData.socialLinks.linkedin && !isValidUrl(formData.socialLinks.linkedin)) newErrors.linkedinUrl = 'Enter a valid LinkedIn URL';
    if (formData.socialLinks.twitter && !isValidUrl(formData.socialLinks.twitter)) newErrors.twitterUrl = 'Enter a valid Twitter/X URL';
    if (formData.socialLinks.github && !isValidUrl(formData.socialLinks.github)) newErrors.githubUrl = 'Enter a valid GitHub URL';
    if (formData.socialLinks.facebook && !isValidUrl(formData.socialLinks.facebook)) newErrors.facebookUrl = 'Enter a valid Facebook URL';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileSelect = (type: 'logo'| 'banner', file: File) => {
    if (file.size > 5 * 1024 * 1024) { setNotification({ type: 'error', message: 'File must be under 5 MB'}); return; }
    if (!file.type.startsWith('image/')) { setNotification({ type: 'error', message: 'Please select an image file'}); return; }
    if (type === 'logo') { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
    else { setBannerFile(file); setBannerPreview(URL.createObjectURL(file)); }
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    const response = await uploadCompanyLogo(file);
    setLogoPreview(`${API_BASE_URL}${response.data.logoUrl}`);
    setUploadingLogo(false);
  };

  const handleBannerUpload = async (file: File) => {
    setUploadingBanner(true);
    const response = await uploadCompanyBanner(file);
    setBannerPreview(`${API_BASE_URL}${response.data.bannerUrl}`);
    setUploadingBanner(false);
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      if (logoFile) await handleLogoUpload(logoFile);
      if (bannerFile) await handleBannerUpload(bannerFile);

      const updateData: any = {};
      if (formData.name) updateData.name = formData.name.trim();
      if (formData.legalName !== undefined) updateData.legalName = formData.legalName || null;
      if (formData.industry) updateData.industry = formData.industry;
      if (formData.size) updateData.size = formData.size;
      if (formData.foundedYear !== undefined) updateData.foundedYear = formData.foundedYear ? parseInt(formData.foundedYear) : null;
      if (formData.website !== undefined) updateData.website = formData.website || null;
      if (formData.description) updateData.description = formData.description;
      if (formData.shortDescription !== undefined) updateData.shortDescription = formData.shortDescription || null;
      if (formData.mission !== undefined) updateData.mission = formData.mission || null;
      if (formData.vision !== undefined) updateData.vision = formData.vision || null;

      const socialLinksObj: any = {};
      if (formData.socialLinks.linkedin) socialLinksObj.linkedin = formData.socialLinks.linkedin;
      if (formData.socialLinks.twitter) socialLinksObj.twitter = formData.socialLinks.twitter;
      if (formData.socialLinks.github) socialLinksObj.github = formData.socialLinks.github;
      if (formData.socialLinks.facebook) socialLinksObj.facebook = formData.socialLinks.facebook;
      if (Object.keys(socialLinksObj).length > 0) updateData.socialLinks = socialLinksObj;

      await updateCompanyProfile(updateData);
      setNotification({ type: 'success', message: 'Company profile updated successfully!'});
      onNotify?.('success', 'Profile Saved', 'Company profile updated successfully.', `Fields saved: ${Object.keys(updateData).join(', ')}`);
      setLogoFile(null);
      setBannerFile(null);
      onUpdate();
    } catch (err: any) {
      const msg = err.message || 'Failed to update profile';
      setNotification({ type: 'error', message: msg });
      onNotify?.('error', 'Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold text-gray-900">Company Profile</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage your company's basic information and branding</p>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`flex items-start gap-3 p-4 rounded-lg border ${
          notification.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {notification.type === 'success'
            ? <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />}
          <span className="text-sm font-medium">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Branding */}
      <section className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6 border border-blue-100">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Branding</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {logoPreview ? (
                  <>
                    <img src={logoPreview} alt="Logo" className="h-20 w-20 object-cover rounded-xl border-2 border-white shadow-md" />
                    <button
                      onClick={() => { setLogoPreview(null); setLogoFile(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <div className="h-20 w-20 border-2 border-dashed border-blue-300 rounded-xl bg-white flex items-center justify-center">
                    <Upload className="h-6 w-6 text-blue-400" />
                  </div>
                )}
              </div>
              <div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleFileSelect('logo', e.target.files[0])} className="hidden" />
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1">
                  <Upload className="h-4 w-4" /> {uploadingLogo ? 'Uploading…': logoPreview ? 'Change Logo': 'Upload Logo'}
                </button>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG up to 5 MB</p>
              </div>
            </div>
          </div>

          {/* Banner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Company Banner</label>
            <div className="space-y-2">
              {bannerPreview ? (
                <div className="relative inline-block">
                  <img src={bannerPreview} alt="Banner" className="h-20 w-52 object-cover rounded-xl border-2 border-white shadow-md" />
                  <button
                    onClick={() => { setBannerPreview(null); setBannerFile(null); }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow hover:bg-red-600 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-20 w-52 border-2 border-dashed border-blue-300 rounded-xl bg-white flex items-center justify-center">
                  <Upload className="h-6 w-6 text-blue-400" />
                </div>
              )}
              <input ref={bannerInputRef} type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleFileSelect('banner', e.target.files[0])} className="hidden" />
              <button onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 flex items-center gap-1">
                <Upload className="h-4 w-4" /> {uploadingBanner ? 'Uploading…': bannerPreview ? 'Change Banner': 'Upload Banner'}
              </button>
              <p className="text-xs text-gray-400">Recommended: 1200 × 300 px</p>
            </div>
          </div>
        </div>
      </section>

      {/* Basic Information */}
      <section className="bg-white rounded-xl border p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InputField label="Company Name" required error={errors.name}>
            <input type="text" value={formData.name} onChange={e => set('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${errors.name ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
              placeholder="Acme Corp" />
          </InputField>

          <InputField label="Legal Name">
            <input type="text" value={formData.legalName} onChange={e => set('legalName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Acme Corporation Ltd." />
          </InputField>

          <InputField label="Industry">
            <select value={formData.industry} onChange={e => set('industry', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
              <option value="">Select industry</option>
              {industries.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </InputField>

          <InputField label="Company Size">
            <select value={formData.size} onChange={e => set('size', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
              <option value="">Select size</option>
              {companySizes.map(s => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </InputField>

          <InputField label="Founded Year" error={errors.foundedYear}>
            <input type="number" value={formData.foundedYear} onChange={e => set('foundedYear', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.foundedYear ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
              placeholder={String(CURRENT_YEAR)} min="1800" max={CURRENT_YEAR} />
          </InputField>

          <InputField label="Website" error={errors.website}>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" value={formData.website} onChange={e => set('website', e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.website ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
                placeholder="https://company.com" />
            </div>
          </InputField>
        </div>
      </section>

      {/* Company Description */}
      <section className="bg-white rounded-xl border p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Description & Vision</h3>
        <div className="space-y-5">
          <InputField label="Short Description" error={errors.shortDescription}>
            <textarea value={formData.shortDescription} onChange={e => set('shortDescription', e.target.value)}
              rows={2} maxLength={300}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none ${errors.shortDescription ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
              placeholder="One-line summary shown on job listings and search results" />
            <p className={`text-xs mt-1 text-right ${formData.shortDescription.length > 270 ? 'text-orange-500 font-medium': 'text-gray-400'}`}>
              {formData.shortDescription.length}/300
            </p>
          </InputField>

          <InputField label="Full Description">
            <textarea value={formData.description} onChange={e => set('description', e.target.value)}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Tell candidates about your company, what you do, and what makes you unique…" />
          </InputField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Mission Statement">
              <textarea value={formData.mission} onChange={e => set('mission', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Why does your company exist?" />
            </InputField>

            <InputField label="Vision Statement">
              <textarea value={formData.vision} onChange={e => set('vision', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Where is your company heading?" />
            </InputField>
          </div>
        </div>
      </section>

      {/* Social Links */}
      <section className="bg-white rounded-xl border p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Social Links</h3>
        <p className="text-sm text-gray-500 mb-4">Connect your company's social profiles</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <InputField label="LinkedIn" error={errors.linkedinUrl}>
            <div className="relative">
              <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0077B5]" />
              <input type="text" value={formData.socialLinks.linkedin} onChange={e => setSocial('linkedin', e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.linkedinUrl ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
                placeholder="https://linkedin.com/company/acme" />
            </div>
          </InputField>

          <InputField label="Twitter / X" error={errors.twitterUrl}>
            <div className="relative">
              <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input type="text" value={formData.socialLinks.twitter} onChange={e => setSocial('twitter', e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.twitterUrl ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
                placeholder="https://twitter.com/acmecorp" />
            </div>
          </InputField>

          <InputField label="GitHub" error={errors.githubUrl}>
            <div className="relative">
              <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-700" />
              <input type="text" value={formData.socialLinks.github} onChange={e => setSocial('github', e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.githubUrl ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
                placeholder="https://github.com/acmecorp" />
            </div>
          </InputField>

          <InputField label="Facebook" error={errors.facebookUrl}>
            <div className="relative">
              <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#1877F2]" />
              <input type="text" value={formData.socialLinks.facebook} onChange={e => setSocial('facebook', e.target.value)}
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.facebookUrl ? 'border-red-400 bg-red-50': 'border-gray-300'}`}
                placeholder="https://facebook.com/acmecorp" />
            </div>
          </InputField>
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors font-medium shadow-sm min-w-[140px] justify-center">
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            : <><Save className="h-4 w-4" /> Save Changes</>}
        </button>
      </div>
    </div>
  );
};

export default CompanyProfileForm;
