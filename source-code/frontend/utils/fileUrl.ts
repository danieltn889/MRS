// utils/fileUrl.ts
//
// The backend deliberately returns file URLs as relative paths
// ("/uploads/...", see backend/src/utils/fileUrl.ts) so they resolve
// correctly in production, where Nginx serves the frontend AND
// backend/uploads under the same origin. In local dev there is no such
// reverse proxy: the frontend runs on Vite (localhost:3000) and the API
// on Express (localhost:3001), so a relative "/uploads/..." URL rendered
// directly in an <img src> or <a href> resolves against the WRONG origin
// (3000, which doesn't serve /uploads at all) and silently 404s -- this is
// why profile photos/attachments/portfolio files "don't show up" locally
// while working fine once deployed. Prefix relative URLs with the API's
// origin (not its /api/v1 path) so they work in both environments.

const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1';
const API_ORIGIN = apiBase.replace(/\/api\/v1\/?$/, '');

export const resolveFileUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '': '/'}${url}`;
};

export const resolveFileKeyUrl = (fileKey: string | null | undefined): string => {
  if (!fileKey) return '';
  return `${API_ORIGIN}/uploads/${fileKey}`;
};
