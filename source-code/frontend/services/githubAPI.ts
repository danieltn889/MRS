const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
};

const githubAPI = {
  // ============================================
  // CANDIDATE GITHUB CONNECTION
  // ============================================

  connectGitHub: async (githubUsername: string, githubToken?: string) => {
    const response = await fetch(`${API_BASE_URL}/github/connect`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ githubUsername, githubToken }),
    });
    return handleResponse(response);
  },

  getGitHubStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/github/status`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // SIMULATION REPOSITORY MANAGEMENT (Recruiter)
  // ============================================

  createSimulationRepo: async (data: {
    candidateId: string;
    simulationId?: string;
    taskId?: string;
    candidateGitHubUsername: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/github/simulation/repo`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  addCollaborator: async (data: {
    repoName: string;
    candidateGitHubUsername: string;
    permission?: 'pull' | 'push' | 'admin' | 'maintain' | 'triage';
  }) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/add-collaborator`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  // ============================================
  // REPOSITORY ANALYSIS
  // ============================================

  analyzeCandidateRepo: async (data: {
    repoUrl: string;
    candidateId?: string;
    simulationId?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/github/analyze-repo`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getCommitStats: async (owner: string, repo: string, author?: string) => {
    const params = new URLSearchParams();
    if (author) params.append('author', author);
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/commits/stats${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    return handleResponse(response);
  },

  getPRStats: async (owner: string, repo: string, author?: string) => {
    const params = new URLSearchParams();
    if (author) params.append('author', author);
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/prs/stats${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    return handleResponse(response);
  },

  // ============================================
  // CANDIDATE SUBMISSIONS
  // ============================================

  submitRepoForTask: async (data: {
    repoUrl: string;
    taskId: string;
    simulationId?: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/github/submit`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getSubmissionStatus: async (submissionId: string) => {
    const response = await fetch(`${API_BASE_URL}/github/submissions/${submissionId}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // UTILITY ENDPOINTS
  // ============================================

  getUserRepos: async (githubUsername: string) => {
    const response = await fetch(`${API_BASE_URL}/github/user/repos?githubUsername=${encodeURIComponent(githubUsername)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  verifyOwnership: async (repoUrl: string, candidateGitHubUsername: string) => {
    const response = await fetch(`${API_BASE_URL}/github/verify-ownership`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ repoUrl, candidateGitHubUsername }),
    });
    return handleResponse(response);
  },

  // ============================================
  // FULL REPOSITORY STATISTICS
  // ============================================

  getFullRepoStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/full-stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getContributorStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/contributors/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getIssueStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/issues/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // CODE RETRIEVAL ENDPOINTS
  // ============================================

  getFileContent: async (owner: string, repo: string, path: string, ref?: string) => {
    const params = new URLSearchParams();
    if (ref) params.append('ref', ref);
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/contents/${encodeURIComponent(path)}${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    return handleResponse(response);
  },

  getTree: async (owner: string, repo: string, treeSha: string, recursive?: boolean) => {
    const params = new URLSearchParams();
    if (recursive) params.append('recursive', 'true');
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/git/trees/${treeSha}${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    return handleResponse(response);
  },

  getCommitDetails: async (owner: string, repo: string, commitSha: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/commits/${commitSha}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getReadme: async (owner: string, repo: string, ref?: string) => {
    const params = new URLSearchParams();
    if (ref) params.append('ref', ref);
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/readme${params.toString() ? `?${params}` : ''}`;
    const response = await fetch(url, { method: 'GET', headers: getAuthHeaders() });
    return handleResponse(response);
  },

  searchCode: async (query: string, perPage: number = 30, page: number = 1) => {
    const params = new URLSearchParams({ q: query, per_page: perPage.toString(), page: page.toString() });
    const response = await fetch(`${API_BASE_URL}/github/search/code?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  compareCommits: async (owner: string, repo: string, base: string, head: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/compare/${base}...${head}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // COMPLETE REPOSITORY DATA (CODE + STATS)
  // ============================================

  getEverything: async (owner: string, repo: string, includeContent: boolean = true, maxFiles: number = 100) => {
    const params = new URLSearchParams({
      includeContent: includeContent.toString(),
      maxFiles: maxFiles.toString(),
    });
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/everything?${params}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // GitHub Stats API Endpoints
  // ============================================

  getContributorWeeklyStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/contributors`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getParticipationStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/participation`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getCodeFrequencyStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/code-frequency`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getPunchCardStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/punch-card`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  getCommitActivityStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/commit-activity`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // TRAFFIC STATISTICS (requires push access)
  // ============================================

  getTrafficStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/traffic`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // ACTIONS / CI-CD STATISTICS
  // ============================================

  getActionsStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/actions/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // RELEASE STATISTICS
  // ============================================

  getReleaseStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/releases/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // MILESTONE STATISTICS
  // ============================================

  getMilestoneStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/milestones/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // DEPLOYMENT STATISTICS
  // ============================================

  getDeploymentStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/deployments/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // USER / CANDIDATE PROFILE STATS
  // ============================================

  getUserProfileStats: async (username: string) => {
    const response = await fetch(`${API_BASE_URL}/github/user/${username}/stats`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // DEPENDENCY GRAPH / SBOM
  // ============================================

  getDependencyStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/dependencies`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // COLLABORATOR PERMISSIONS
  // ============================================

  getCollaboratorStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/collaborators`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // ============================================
  // AGGREGATE: ALL STATS IN ONE CALL
  // ============================================

  getAllStats: async (owner: string, repo: string) => {
    const response = await fetch(`${API_BASE_URL}/github/repo/${owner}/${repo}/stats/all`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  calculateGitHubScore: async (data: { repoUrl?: string; owner?: string; repo?: string }) => {
    const response = await fetch(`${API_BASE_URL}/simulations/github-score`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
  
};



export default githubAPI;
