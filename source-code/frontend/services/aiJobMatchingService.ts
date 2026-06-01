// services/aiJobMatchingService.ts
const API_GATEWAY_URL = 'http://localhost:8000';

interface JobMatch {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type?: string;
  workArrangement?: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  screeningQuestions?: any[];
  expiresAt?: string;
  matchScore?: number;
  [key: string]: any;
}

interface CandidateInfo {
  name: string;
  level: string;
  total_experience_years: number;
  skills?: string[];
  [key: string]: any;
}

interface AIMatchResponse {
  success: boolean;
  error?: string;
  matches: JobMatch[];
  total_jobs_matched: number;
  candidate?: CandidateInfo;
}

export const getJobMatchesFromAI = async (candidateId: string): Promise<AIMatchResponse> => {
  console.log('🔍 AI Job Match Request Started for:', candidateId);
  
  if (!candidateId) {
    console.error('❌ Candidate ID is required');
    return {
      success: false,
      error: 'Candidate ID is required',
      matches: [],
      total_jobs_matched: 0
    };
  }
  
  try {
    const response = await fetch(`${API_GATEWAY_URL}/match`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ candidate_id: candidateId }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data: AIMatchResponse = await response.json();
    
    if (data.success && data.matches && data.matches.length > 0) {
      console.log(`✅ Found ${data.matches.length} job matches for candidate ${candidateId}`);
    } else {
      console.log(`⚠️ No job matches found for candidate ${candidateId}`);
    }
    
    return data;
    
  } catch (error: any) {
    console.error('❌ AI Job Match Failed:', error.message);
    
    return {
      success: false,
      error: error.message,
      matches: [],
      total_jobs_matched: 0
    };
  }
};