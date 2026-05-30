import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const sanitizedName = file.originalname
      .replace(/\s/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed.'));
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)
  },
  fileFilter: fileFilter
});

export const getFileUrl = (fileKey: string): string => {
  const baseUrl = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${baseUrl}/uploads/${fileKey}`;
};

export const deleteFile = (fileKey: string): boolean => {
  try {
    const filePath = path.join(uploadDir, fileKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', (error as Error).message);
    return false;
  }
};

export const getFileInfo = (fileKey: string) => {
  try {
    const filePath = path.join(uploadDir, fileKey);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    }
    return { exists: false };
  } catch (error) {
    console.error('Error getting file info:', (error as Error).message);
    return { exists: false, error: (error as Error).message };
  }
};