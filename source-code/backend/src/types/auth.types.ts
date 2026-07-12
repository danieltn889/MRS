import { Request } from 'express';

export interface User {
  id: string;
  email: string;
  user_type: 'candidate'| 'recruiter'| 'company_admin'| 'system_admin';
  status: 'verified'| 'unverified'| 'active'| 'locked'| 'suspended'| 'deleted';
  company_id?: string;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user: User;
}