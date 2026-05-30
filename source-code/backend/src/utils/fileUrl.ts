import path from 'path';

export const generateFileUrl = (fileKey: string): string => {
  // For local development with static serving
  return `/uploads/${fileKey}`;
};

export const getFullFileUrl = (fileKey: string): string => {
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${baseUrl}/uploads/${fileKey}`;
};