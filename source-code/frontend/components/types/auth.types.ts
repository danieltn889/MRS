// In your AuthContext.tsx or types/auth.types.ts

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  user_type: 'candidate' | 'recruiter' | 'company_admin' | 'system_admin';
  githubUsername?: string;  // ADD THIS LINE
  githubToken?: string;     // Optional: if you also store token
  // ... other user properties
}