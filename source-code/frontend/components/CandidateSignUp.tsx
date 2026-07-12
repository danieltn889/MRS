import React, { useState, useCallback, useEffect } from 'react';
import { Eye, EyeOff, CheckCircle, AlertCircle, Mail, Loader, User, MapPin, CreditCard, Zap, Target, ArrowLeft, Sliders, BarChart3, Globe } from 'lucide-react';
import { checkEmailExists, registerCandidate, resendVerificationEmail } from '../services/authAPI';
import { getCountries, getProvinces, getDistricts, getSectors, getCells, getVillages, Country } from '../services/locationsAPI';
import Combobox, { ComboboxOption } from './common/Combobox';
import IdentityDocumentUpload from './common/IdentityDocumentUpload';

interface SuccessState {
  email: string;
  message: string;
  accountCreated?: boolean;
}

const toOptions = (values: string[]): ComboboxOption[] => values.map(v => ({ label: v, value: v }));

const todayISO = () => new Date().toISOString().split('T')[0];

// Mirrors the format rules in backend/src/validators/identityDocument.ts  
// shown so candidates see the expected format before submitting, not just
// after a rejection.
const documentNumberHint = (documentType: string, isRwandan: boolean): string => {
  if (documentType === 'national_id') {
    return isRwandan
      ? 'Rwanda National ID: exactly 16 digits, starting with 1 or 2 (e.g. 1199012345678901)'
      : 'Letters and/or numbers, 6-20 characters';
  }
  if (documentType === 'passport') {
    return 'Passport number: 6-9 letters/numbers only, no spaces (e.g. PC1234567)';
  }
  return '';
};

// Same brand panel as Login.tsx's left half   kept in sync so signup and
// login present a consistent split-screen identity on large screens.
// Only kicks in at xl (1280px+): this form has nested 2-column sub-grids
// that need real room, and a 50/50 split at lg (1024px) squeezed them
// enough to clip input placeholders   below xl the form gets full width.
const BrandPanel = () => (
  <div className="hidden xl:flex xl:fixed xl:inset-y-0 xl:left-0 xl:w-5/12 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 relative overflow-hidden flex-col justify-center px-16 text-white">
    <div className="absolute top-0 left-1/3 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
    <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-white/10 rounded-full blur-3xl" />

    <div className="relative z-10 max-w-md">
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <span className="font-extrabold text-xl tracking-tight">SimuHire Rwanda</span>
      </div>

      <h1 className="text-4xl font-extrabold leading-tight mb-4 tracking-tight">
        MIFOTRA Recruitment System
      </h1>
      <p className="text-blue-100 text-lg leading-relaxed mb-10">
        Empower smarter hiring decisions with an explainable AI matching engine designed to
        connect organisations with skilled and qualified talent.
      </p>

      <div className="space-y-4">
        {[
          { icon: Sliders, text: 'Customisable cultural fit parameters for your organisation'},
          { icon: Target, text: 'Transparent, explainable match scoring for every candidate'},
          { icon: BarChart3, text: 'Analytics dashboard with predictive insights'},
          { icon: Globe, text: "Support for Rwanda's NICI III digital economy goals"},
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center backdrop-blur-sm flex-shrink-0">
              <Icon className="w-4 h-4 text-white" />
            </div>
            <span className="text-blue-50">{text}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/**
 * CandidateSignUp - Full-page candidate registration: account credentials,
 * personal info, Rwanda location hierarchy (or country/city for non-Rwandans),
 * and identity document verification. Replaces the old SignUp.tsx modal.
 */
const CandidateSignUp = ({ onSignupSuccess }: { onSignupSuccess?: (result: any) => void }) => {
  const [formData, setFormData] = useState({
    email: '', password: '', passwordConfirm: '',
    firstName: '', lastName: '', gender: '', dateOfBirth: '', phone: '',
    isRwandan: '', // ''| 'yes'| 'no'
    province: '', district: '', sector: '', cell: '', village: '',
    country: '', city: '',
    documentType: '', documentNumber: '',
    agreeTerms: false,
  });
  const [documentFront, setDocumentFront] = useState<File | null>(null);
  const [documentBack, setDocumentBack] = useState<File | null>(null);

  const [countries, setCountries] = useState<Country[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [cells, setCells] = useState<string[]>([]);
  const [villages, setVillages] = useState<string[]>([]);
  const [loadingLevel, setLoadingLevel] = useState<Record<string, boolean>>({});

  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showRateLimitError, setShowRateLimitError] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [showEmailSendError, setShowEmailSendError] = useState(false);

  // ---- Cascading Rwanda location data ----
  useEffect(() => {
    if (formData.isRwandan === 'yes'&& provinces.length === 0) {
      setLoadingLevel(s => ({ ...s, provinces: true }));
      getProvinces().then(setProvinces).catch(() => {}).finally(() => setLoadingLevel(s => ({ ...s, provinces: false })));
    }
    if (formData.isRwandan === 'no'&& countries.length === 0) {
      getCountries().then(setCountries).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.isRwandan]);

  useEffect(() => {
    if (!formData.province) { setDistricts([]); return; }
    setLoadingLevel(s => ({ ...s, districts: true }));
    getDistricts(formData.province).then(setDistricts).catch(() => setDistricts([]))
      .finally(() => setLoadingLevel(s => ({ ...s, districts: false })));
  }, [formData.province]);

  useEffect(() => {
    if (!formData.district) { setSectors([]); return; }
    setLoadingLevel(s => ({ ...s, sectors: true }));
    getSectors(formData.district).then(setSectors).catch(() => setSectors([]))
      .finally(() => setLoadingLevel(s => ({ ...s, sectors: false })));
  }, [formData.district]);

  useEffect(() => {
    if (!formData.district || !formData.sector) { setCells([]); return; }
    setLoadingLevel(s => ({ ...s, cells: true }));
    getCells(formData.district, formData.sector).then(setCells).catch(() => setCells([]))
      .finally(() => setLoadingLevel(s => ({ ...s, cells: false })));
  }, [formData.district, formData.sector]);

  useEffect(() => {
    if (!formData.district || !formData.sector || !formData.cell) { setVillages([]); return; }
    setLoadingLevel(s => ({ ...s, villages: true }));
    getVillages(formData.district, formData.sector, formData.cell).then(setVillages).catch(() => setVillages([]))
      .finally(() => setLoadingLevel(s => ({ ...s, villages: false })));
  }, [formData.district, formData.sector, formData.cell]);

  // ---- Password strength (same rules as backend validatePasswordStrength) ----
  const validatePasswordStrength = useCallback((password: string) => {
    let strength = 0;
    const requirements = {
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      hasMinLength: password.length >= 8,
    };
    Object.values(requirements).forEach((met) => { if (met) strength += 20; });
    return { strength, requirements };
  }, []);

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
    return emailRegex.test(email) && email.length <= 254;
  };

  const isValidPhone = (phone: string) => /^\+?[\d\s\-()]{10,}$/.test(phone);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;
    const newValue = type === 'checkbox'? checked : value;
    const newFormData = { ...formData, [name]: newValue };
    setFormData(newFormData);

    const newErrors = { ...errors };

    if (name === 'email') {
      if (!value) {
        newErrors.email = '';
      } else if (!isValidEmail(value)) {
        newErrors.email = 'Please enter a valid email address (e.g., name@example.com)';
      } else {
        try {
          const { exists } = await checkEmailExists(value);
          if (exists) {
            newErrors.email = 'This email is already registered. Try logging in or use a different email.';
          } else {
            delete newErrors.email;
          }
        } catch {
          delete newErrors.email;
        }
      }
    }

    if (name === 'password') {
      const { strength, requirements } = validatePasswordStrength(value);
      setPasswordStrength(strength);
      if (!value) {
        newErrors.password = '';
      } else if (!requirements.hasMinLength || !requirements.hasUppercase || !requirements.hasLowercase || !requirements.hasNumber || !requirements.hasSpecial) {
        newErrors.password = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
      } else {
        delete newErrors.password;
      }
      if (newFormData.passwordConfirm && value !== newFormData.passwordConfirm) {
        newErrors.passwordConfirm = 'Passwords do not match';
      } else if (newFormData.passwordConfirm) {
        delete newErrors.passwordConfirm;
      }
    }

    if (name === 'passwordConfirm') {
      if (!value) newErrors.passwordConfirm = '';
      else if (value !== newFormData.password) newErrors.passwordConfirm = 'Passwords do not match';
      else delete newErrors.passwordConfirm;
    }

    if (name === 'dateOfBirth') {
      if (!value) newErrors.dateOfBirth = '';
      else if (value > todayISO()) newErrors.dateOfBirth = 'Date of Birth cannot be in the future';
      else delete newErrors.dateOfBirth;
    }

    if (name === 'phone') {
      if (!value) newErrors.phone = '';
      else if (!isValidPhone(value)) newErrors.phone = 'Please enter a valid phone number';
      else delete newErrors.phone;
    }

    if (name === 'agreeTerms') {
      if (!checked) newErrors.agreeTerms = 'You must accept the Terms & Conditions to continue';
      else delete newErrors.agreeTerms;
    }

    setErrors(newErrors);
  };

  const handleIsRwandanChange = (value: 'yes'| 'no') => {
    setFormData(prev => ({
      ...prev,
      isRwandan: value,
      province: '', district: '', sector: '', cell: '', village: '',
      country: '', city: '',
    }));
  };

  const handleProvinceChange = (value: string) =>
    setFormData(prev => ({ ...prev, province: value, district: '', sector: '', cell: '', village: ''}));
  const handleDistrictChange = (value: string) =>
    setFormData(prev => ({ ...prev, district: value, sector: '', cell: '', village: ''}));
  const handleSectorChange = (value: string) =>
    setFormData(prev => ({ ...prev, sector: value, cell: '', village: ''}));
  const handleCellChange = (value: string) =>
    setFormData(prev => ({ ...prev, cell: value, village: ''}));
  const handleVillageChange = (value: string) =>
    setFormData(prev => ({ ...prev, village: value }));

  const getPasswordStrengthDisplay = () => {
    if (passwordStrength === 0) return { color: 'bg-gray-300', label: '', width: '0%'};
    if (passwordStrength <= 40) return { color: 'bg-red-500', label: 'Weak', width: '25%'};
    if (passwordStrength <= 60) return { color: 'bg-yellow-500', label: 'Fair', width: '50%'};
    if (passwordStrength <= 80) return { color: 'bg-blue-500', label: 'Good', width: '75%'};
    return { color: 'bg-green-500', label: 'Strong', width: '100%'};
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.email) newErrors.email = 'Email is required';
    else if (!isValidEmail(formData.email)) newErrors.email = 'Please enter a valid email address';

    if (!formData.firstName) newErrors.firstName = 'First name is required';
    if (!formData.lastName) newErrors.lastName = 'Last name is required';
    if (!formData.gender) newErrors.gender = 'Gender is required';

    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of Birth is required';
    else if (formData.dateOfBirth > todayISO()) newErrors.dateOfBirth = 'Date of Birth cannot be in the future';

    if (!formData.phone) newErrors.phone = 'Phone number is required';
    else if (!isValidPhone(formData.phone)) newErrors.phone = 'Please enter a valid phone number';

    if (!formData.password) newErrors.password = 'Password is required';
    else {
      const { requirements } = validatePasswordStrength(formData.password);
      if (!requirements.hasMinLength || !requirements.hasUppercase || !requirements.hasLowercase || !requirements.hasNumber || !requirements.hasSpecial) {
        newErrors.password = 'Password must be at least 8 characters with uppercase, lowercase, number, and special character';
      }
    }
    if (!formData.passwordConfirm) newErrors.passwordConfirm = 'Password confirmation is required';
    else if (formData.password !== formData.passwordConfirm) newErrors.passwordConfirm = 'Passwords do not match';

    if (!formData.isRwandan) {
      newErrors.isRwandan = 'Please answer whether you are a Rwandan citizen';
    } else if (formData.isRwandan === 'yes') {
      if (!formData.province) newErrors.province = 'Province is required';
      if (!formData.district) newErrors.district = 'District is required';
      if (!formData.sector) newErrors.sector = 'Sector is required';
      if (!formData.cell) newErrors.cell = 'Cell is required';
      if (!formData.village) newErrors.village = 'Village is required';
    } else {
      if (!formData.country) newErrors.country = 'Country is required';
      if (!formData.city) newErrors.city = 'City is required';
    }

    if (!formData.documentType) newErrors.documentType = 'Document type is required';
    if (!formData.documentNumber) {
      newErrors.documentNumber = 'Document number is required';
    } else if (formData.documentType === 'passport'&& !/^[A-Za-z0-9]{6,9}$/.test(formData.documentNumber.trim())) {
      newErrors.documentNumber = 'Passport number must be 6-9 letters/numbers only (no spaces or symbols)';
    } else if (formData.documentType === 'national_id'&& formData.isRwandan === 'yes'&& !/^\d{16}$/.test(formData.documentNumber.trim())) {
      newErrors.documentNumber = 'Rwanda National ID must be exactly 16 digits';
    }
    if (!documentFront) newErrors.documentFront = 'Identity document upload is required';

    if (!formData.agreeTerms) newErrors.agreeTerms = 'You must accept the Terms & Conditions to continue';

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setIsSubmitting(true);
    setSubmitError('');
    setShowEmailSendError(false);

    try {
      const result = await registerCandidate({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        gender: formData.gender as 'male'| 'female'| 'other',
        dateOfBirth: formData.dateOfBirth,
        phone: formData.phone,
        isRwandan: formData.isRwandan === 'yes',
        province: formData.province, district: formData.district, sector: formData.sector,
        cell: formData.cell, village: formData.village,
        country: formData.isRwandan === 'yes'? 'Rwanda': formData.country,
        city: formData.city,
        documentType: formData.documentType as 'national_id'| 'passport',
        documentNumber: formData.documentNumber,
        documentFront: documentFront!,
        documentBack,
      });

      setSuccessState({ email: formData.email, message: 'Check your email to verify your account'});
      if (onSignupSuccess) onSignupSuccess({ ...result, email: formData.email });
    } catch (error: any) {
      if (error.message?.includes('Too many attempts')) {
        setShowRateLimitError(true);
        let countdown = 300;
        const timer = setInterval(() => {
          countdown--;
          setRetryCountdown(countdown);
          if (countdown <= 0) {
            clearInterval(timer);
            setShowRateLimitError(false);
            setRetryCountdown(0);
          }
        }, 1000);
      } else if (error.message?.includes('verification email failed')) {
        setShowEmailSendError(true);
        setSuccessState({ email: formData.email, accountCreated: true, message: ''});
      } else {
        setSubmitError(error.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async () => {
    try {
      await resendVerificationEmail(formData.email);
      setShowEmailSendError(false);
      setSuccessState(prev => prev && ({ ...prev, message: 'Verification email sent! Check your inbox.'}));
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to resend verification email');
    }
  };

  if (successState) {
    return (
      <div className="lg:flex">
        <BrandPanel />
        <div className="w-full xl:w-7/12 xl:ml-auto min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow sm:rounded-lg sm:px-10 text-center">
            <a href="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </a>
            <div className="mb-4 flex justify-center">
              <div className="bg-green-100 rounded-full p-3">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
            <p className="text-gray-600 mb-4">We've sent a verification link to <strong>{successState.email}</strong></p>
            <p className="text-gray-700 mb-6 text-sm">{successState.message}</p>

            {showEmailSendError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-left">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-800 font-semibold">Verification email failed to send</p>
                    <p className="text-xs text-yellow-700 mt-1">Your account has been created, but we couldn't send the verification email.</p>
                  </div>
                </div>
              </div>
            )}

            {showEmailSendError && (
              <button onClick={handleResendEmail} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                <Mail className="w-4 h-4 inline mr-2" />
                Resend Verification Email
              </button>
            )}

            <p className="text-xs text-gray-500 mt-4">
              The verification link will expire in 24 hours. If you don't see the email, check your spam folder.
            </p>
          </div>
        </div>
        </div>
      </div>
    );
  }

  const { color: strengthColor, label: strengthLabel, width: strengthWidth } = getPasswordStrengthDisplay();
  const countryOptions: ComboboxOption[] = countries.map(c => ({ label: c.name, value: c.name }));

  return (
    <div className="lg:flex">
      <BrandPanel />
      <div className="w-full xl:w-7/12 xl:ml-auto min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <a href="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </a>
          <div className="text-center mb-8">
            <User className="mx-auto h-12 w-12 text-blue-600" />
            <h2 className="mt-6 text-3xl font-bold text-gray-900">Create Your Candidate Account</h2>
            <p className="mt-2 text-sm text-gray-600">Sign up to start applying for jobs on SimuHire</p>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">{submitError}</div>
            </div>
          )}

          {showRateLimitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Too many attempts</p>
                <p className="text-xs text-red-700 mt-1">
                  Please try again in {Math.floor(retryCountdown / 60)}:{String(retryCountdown % 60).padStart(2, '0')}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Account Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Account</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address *</label>
                  <input
                    id="email" name="email" type="email" value={formData.email} onChange={handleInputChange}
                    disabled={showRateLimitError}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.email ? 'border-red-300': 'border-gray-300'}`}
                    placeholder="you@example.com"
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.email}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password *</label>
                  <div className="relative mt-1">
                    <input
                      id="password" name="password" type={showPassword ? 'text': 'password'} value={formData.password} onChange={handleInputChange}
                      disabled={showRateLimitError}
                      className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.password ? 'border-red-300': 'border-gray-300'}`}
                      placeholder="Create a strong password"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {formData.password && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-600">Strength:</span>
                        <span className="text-xs font-bold">{strengthLabel}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all duration-300 ${strengthColor}`} style={{ width: strengthWidth }} />
                      </div>
                    </div>
                  )}
                  {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
                </div>

                <div>
                  <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700">Confirm Password *</label>
                  <div className="relative mt-1">
                    <input
                      id="passwordConfirm" name="passwordConfirm" type={showPasswordConfirm ? 'text': 'password'} value={formData.passwordConfirm} onChange={handleInputChange}
                      disabled={showRateLimitError}
                      className={`block w-full px-3 py-2 pr-10 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.passwordConfirm ? 'border-red-300': 'border-gray-300'}`}
                      placeholder="Confirm your password"
                    />
                    <button type="button" onClick={() => setShowPasswordConfirm(!showPasswordConfirm)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700">
                      {showPasswordConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.passwordConfirm && <p className="mt-1 text-sm text-red-600">{errors.passwordConfirm}</p>}
                </div>
              </div>
            </div>

            {/* Personal Information Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <User className="h-5 w-5 mr-2" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">First Name *</label>
                  <input
                    id="firstName" name="firstName" type="text" value={formData.firstName} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.firstName ? 'border-red-300': 'border-gray-300'}`}
                    placeholder="John"
                  />
                  {errors.firstName && <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>}
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">Last Name *</label>
                  <input
                    id="lastName" name="lastName" type="text" value={formData.lastName} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.lastName ? 'border-red-300': 'border-gray-300'}`}
                    placeholder="Doe"
                  />
                  {errors.lastName && <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>}
                </div>

                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700">Gender *</label>
                  <select
                    id="gender" name="gender" value={formData.gender} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.gender ? 'border-red-300': 'border-gray-300'}`}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                  {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender}</p>}
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">Date of Birth *</label>
                  <input
                    id="dateOfBirth" name="dateOfBirth" type="date" max={todayISO()} value={formData.dateOfBirth} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.dateOfBirth ? 'border-red-300': 'border-gray-300'}`}
                  />
                  {errors.dateOfBirth && <p className="mt-1 text-sm text-red-600">{errors.dateOfBirth}</p>}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number *</label>
                  <input
                    id="phone" name="phone" type="tel" value={formData.phone} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.phone ? 'border-red-300': 'border-gray-300'}`}
                    placeholder="+250 7XX XXX XXX"
                  />
                  {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <MapPin className="h-5 w-5 mr-2" />
                Location Information
              </h3>

              <div className="mb-4">
                <p className="block text-sm font-medium text-gray-700 mb-2">Are you a Rwandan citizen? *</p>
                <div className="flex gap-3">
                  {(['yes', 'no'] as const).map(opt => (
                    <button
                      key={opt} type="button"
                      onClick={() => handleIsRwandanChange(opt)}
                      className={`px-4 py-2 rounded-md border text-sm font-medium ${
                        formData.isRwandan === opt ? 'bg-blue-600 text-white border-blue-600': 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {opt === 'yes'? 'Yes': 'No'}
                    </button>
                  ))}
                </div>
                {errors.isRwandan && <p className="mt-1 text-sm text-red-600">{errors.isRwandan}</p>}
              </div>

              {formData.isRwandan === 'yes'&& (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Province *</label>
                    <Combobox
                      value={formData.province} onChange={handleProvinceChange}
                      options={toOptions(provinces)} placeholder="Select province" required
                      loading={loadingLevel.provinces} allowFreeText={false}
                    />
                    {errors.province && <p className="mt-1 text-sm text-red-600">{errors.province}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
                    <Combobox
                      value={formData.district} onChange={handleDistrictChange}
                      options={toOptions(districts)} placeholder="Select district" required
                      disabled={!formData.province} loading={loadingLevel.districts} allowFreeText={false}
                    />
                    {errors.district && <p className="mt-1 text-sm text-red-600">{errors.district}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sector *</label>
                    <Combobox
                      value={formData.sector} onChange={handleSectorChange}
                      options={toOptions(sectors)} placeholder="Select sector" required
                      disabled={!formData.district} loading={loadingLevel.sectors} allowFreeText={false}
                    />
                    {errors.sector && <p className="mt-1 text-sm text-red-600">{errors.sector}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cell *</label>
                    <Combobox
                      value={formData.cell} onChange={handleCellChange}
                      options={toOptions(cells)} placeholder="Select cell" required
                      disabled={!formData.sector} loading={loadingLevel.cells} allowFreeText={false}
                    />
                    {errors.cell && <p className="mt-1 text-sm text-red-600">{errors.cell}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Village (Umudugudu) *</label>
                    <Combobox
                      value={formData.village} onChange={handleVillageChange}
                      options={toOptions(villages)} placeholder="Select village" required
                      disabled={!formData.cell} loading={loadingLevel.villages} allowFreeText={false}
                    />
                    {errors.village && <p className="mt-1 text-sm text-red-600">{errors.village}</p>}
                  </div>
                </div>
              )}

              {formData.isRwandan === 'no'&& (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                    <Combobox
                      value={formData.country} onChange={(v) => setFormData(prev => ({ ...prev, country: v }))}
                      options={countryOptions} placeholder="Search or type your country" required allowFreeText
                    />
                    {errors.country && <p className="mt-1 text-sm text-red-600">{errors.country}</p>}
                  </div>
                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                    <input
                      id="city" name="city" type="text" value={formData.city} onChange={handleInputChange}
                      className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.city ? 'border-red-300': 'border-gray-300'}`}
                      placeholder="e.g. Nairobi"
                    />
                    {errors.city && <p className="mt-1 text-sm text-red-600">{errors.city}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Identity Verification Section */}
            <div className="bg-gray-50 p-6 rounded-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <CreditCard className="h-5 w-5 mr-2" />
                Identity Verification
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
                <div>
                  <label htmlFor="documentType" className="block text-sm font-medium text-gray-700">Document Type *</label>
                  <select
                    id="documentType" name="documentType" value={formData.documentType} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.documentType ? 'border-red-300': 'border-gray-300'}`}
                  >
                    <option value="">Select document type</option>
                    <option value="national_id">National ID</option>
                    <option value="passport">Passport</option>
                  </select>
                  {errors.documentType && <p className="mt-1 text-sm text-red-600">{errors.documentType}</p>}
                </div>
                <div>
                  <label htmlFor="documentNumber" className="block text-sm font-medium text-gray-700">Document Number *</label>
                  <input
                    id="documentNumber" name="documentNumber" type="text" value={formData.documentNumber} onChange={handleInputChange}
                    className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${errors.documentNumber ? 'border-red-300': 'border-gray-300'}`}
                    placeholder={formData.documentType === 'national_id'? '16-digit National ID': 'Passport number'}
                  />
                  {errors.documentNumber
                    ? <p className="mt-1 text-sm text-red-600">{errors.documentNumber}</p>
                    : formData.documentType && (
                        <p className="mt-1 text-xs text-gray-500">
                          {documentNumberHint(formData.documentType, formData.isRwandan === 'yes')}
                        </p>
                      )}
                </div>
              </div>

              {formData.documentType && (
                <IdentityDocumentUpload
                  documentType={formData.documentType as 'national_id'| 'passport'}
                  documentFront={documentFront}
                  documentBack={documentBack}
                  onFrontChange={setDocumentFront}
                  onBackChange={setDocumentBack}
                />
              )}
              {errors.documentFront && <p className="mt-2 text-sm text-red-600">{errors.documentFront}</p>}
            </div>

            {/* Terms */}
            <div className="bg-gray-50 rounded-md p-4">
              <label className="flex items-start cursor-pointer">
                <input
                  type="checkbox" name="agreeTerms" checked={formData.agreeTerms} onChange={handleInputChange}
                  className={`mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${errors.agreeTerms ? 'border-red-500': ''}`}
                />
                <span className="ml-3 text-sm text-gray-700">
                  I agree to the{''}
                  <a href="#" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">Terms & Conditions</a>
                </span>
              </label>
              {errors.agreeTerms && <p className="mt-2 text-sm text-red-600 ml-6">{errors.agreeTerms}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || showRateLimitError || !formData.agreeTerms}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all duration-300 flex items-center justify-center ${
                isSubmitting || showRateLimitError || !formData.agreeTerms ? 'bg-gray-400 cursor-not-allowed': 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {isSubmitting ? (<><Loader className="w-5 h-5 animate-spin mr-2" />Creating Account...</>) : 'Create Account'}
            </button>

            <p className="text-center text-sm text-gray-600">
              Already have an account?{''}
              <a href="/login" className="text-blue-600 hover:underline font-semibold">Sign in</a>
            </p>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};

export default CandidateSignUp;
