const API_GATEWAY_URL = import.meta.env.VITE_ML_GATEWAY_URL || 'http://localhost:8080/matcher';

export const getJobMatches = async (candidateId) => {
  const response = await fetch(`${API_GATEWAY_URL}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json'},
    body: JSON.stringify({ candidate_id: candidateId }),
  });
  return response.json();
};

export const getJobMatchById = async (candidateId, jobId) => {
  const response = await fetch(`${API_GATEWAY_URL}/match/specific`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json'},
    body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }),
  });
  return response.json();
};