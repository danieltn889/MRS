import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Deliberately OUTSIDE backend/uploads, which app.ts serves publicly via
// express.static   identity documents are sensitive PII and must never be
// reachable by guessing a URL. Only the authenticated, ownership-checked
// serve endpoint in candidate.routes.ts may read from here.
export const PRIVATE_UPLOADS_ROOT = path.join(__dirname, '../../private-uploads');
export const IDENTITY_DOCUMENTS_DIR = path.join(PRIVATE_UPLOADS_ROOT, 'identity-documents');
export const IDENTITY_DOCUMENTS_STAGING_DIR = path.join(IDENTITY_DOCUMENTS_DIR, '_staging');

[PRIVATE_UPLOADS_ROOT, IDENTITY_DOCUMENTS_DIR, IDENTITY_DOCUMENTS_STAGING_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

export type DocumentSide = 'front'| 'back';

// Moves a staged upload (saved before the candidate's user id existed) into
// its final per-user location. Returns a relative storage key   never a
// public URL or absolute path   for candidate_documents.document_front/back.
export const finalizeIdentityDocumentFile = (
  stagingPath: string,
  userId: string,
  side: DocumentSide
): string => {
  const userDir = path.join(IDENTITY_DOCUMENTS_DIR, userId);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const ext = path.extname(stagingPath);
  const finalFileName = `${side}-${Date.now()}${ext}`;
  const finalPath = path.join(userDir, finalFileName);
  fs.renameSync(stagingPath, finalPath);

  return `${userId}/${finalFileName}`;
};

export const deleteStagedFile = (stagingPath: string): void => {
  fs.unlink(stagingPath, () => {});
};

// Resolves a stored relative key back to an absolute path, refusing to
// escape IDENTITY_DOCUMENTS_DIR (defense against a malformed/tampered key).
export const resolveIdentityDocumentPath = (relativeKey: string): string | null => {
  const resolved = path.resolve(IDENTITY_DOCUMENTS_DIR, relativeKey);
  if (!resolved.startsWith(path.resolve(IDENTITY_DOCUMENTS_DIR) + path.sep)) {
    return null;
  }
  return resolved;
};
