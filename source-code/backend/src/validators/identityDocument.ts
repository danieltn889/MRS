import { query } from '../config/database.js';

export type DocumentType = 'national_id'| 'passport';

export interface DocumentValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

type DocumentValidator = (documentNumber: string, dateOfBirth?: string | null) => DocumentValidationResult;

// Rwanda National ID: 16 numeric digits.
//
// ASSUMPTION (not verified against an official NIDA specification   flagged
// so it can be corrected if the real rule differs): first digit is commonly
// cited as 1 = Rwandan citizen by birth, 2 = naturalized citizen, followed by
// a 4-digit birth year. Because this encoding isn't independently confirmed,
// a birth-year mismatch is surfaced as a `warning`, not a hard `error`   flip
// the branch below to populate `error` instead once the exact rule is
// confirmed against an authoritative source.
const validateRwandaNationalId: DocumentValidator = (documentNumber, dateOfBirth) => {
  const cleaned = documentNumber.trim();

  if (!/^\d{16}$/.test(cleaned)) {
    return { valid: false, error: 'Invalid National ID format. Must be exactly 16 digits (numbers only), e.g. 1199012345678901.'};
  }
  if (cleaned[0] !== '1'&& cleaned[0] !== '2') {
    return { valid: false, error: 'Invalid National ID format. The first digit must be 1 (Rwandan by birth) or 2 (naturalized).'};
  }

  const result: DocumentValidationResult = { valid: true };
  if (dateOfBirth) {
    const encodedYear = parseInt(cleaned.slice(1, 5), 10);
    const dobYear = new Date(dateOfBirth).getFullYear();
    if (!Number.isNaN(encodedYear) && !Number.isNaN(dobYear) && encodedYear !== dobYear) {
      result.warning = 'Date of Birth does not match identity information.';
    }
  }

  return result;
};

// Common ICAO-style passport format: 6-9 alphanumeric characters.
const validatePassportFormat: DocumentValidator = (documentNumber) => {
  const cleaned = documentNumber.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,9}$/.test(cleaned)) {
    return { valid: false, error: 'Invalid passport format. Must be 6-9 letters/numbers only (no spaces or symbols), e.g. PC1234567.'};
  }
  return { valid: true };
};

// Permissive fallback for countries without a dedicated validator below.
const validateInternationalDocument: DocumentValidator = (documentNumber) => {
  const cleaned = documentNumber.trim();
  if (!/^[A-Za-z0-9-]{6,20}$/.test(cleaned)) {
    return { valid: false, error: 'Invalid document number format. Must be 6-20 letters, numbers or hyphens.'};
  }
  return { valid: true };
};

// Keyed by uppercased country name (matches candidate_profiles.country) so
// new country-specific rules can be dropped in without touching call sites.
const registry: Record<string, Partial<Record<DocumentType, DocumentValidator>>> = {
  RWANDA: {
    national_id: validateRwandaNationalId,
    passport: validatePassportFormat,
  },
};

const defaultValidators: Record<DocumentType, DocumentValidator> = {
  national_id: validateInternationalDocument,
  passport: validatePassportFormat,
};

export const validateIdentityDocument = (
  country: string | null | undefined,
  documentType: DocumentType,
  documentNumber: string,
  dateOfBirth?: string | null
): DocumentValidationResult => {
  if (!documentNumber || !documentNumber.trim()) {
    return { valid: false, error: 'Document number is required.'};
  }

  const countryKey = country?.trim().toUpperCase();
  const validator = (countryKey && registry[countryKey]?.[documentType]) || defaultValidators[documentType];
  return validator(documentNumber, dateOfBirth);
};

// Defense-in-depth alongside the DB unique index on
// candidate_documents(document_type, document_number)   lets the controller
// return a clear "already exists" error instead of a raw constraint violation.
export const isDuplicateDocument = async (
  documentType: DocumentType,
  documentNumber: string
): Promise<boolean> => {
  const result = await query(
    'SELECT 1 FROM candidate_documents WHERE document_type = $1 AND document_number = $2 LIMIT 1',
    [documentType, documentNumber.trim()]
  );
  return (result.rowCount ?? 0) > 0;
};
