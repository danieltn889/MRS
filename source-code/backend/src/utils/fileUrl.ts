import path from 'path';

export const generateFileUrl = (fileKey: string): string => {
  // For local development with static serving
  return `/uploads/${fileKey}`;
};

export const getFullFileUrl = (fileKey: string): string => {
  // Relative by default so the URL resolves against whatever host serves the app
  // (Nginx reverse proxy, SSH tunnel, IP, or domain)   an absolute localhost base
  // would break in the browser. Set API_BASE_URL only if you need absolute URLs.
  const baseUrl = process.env.API_BASE_URL || '';
  return `${baseUrl}/uploads/${fileKey}`;
};