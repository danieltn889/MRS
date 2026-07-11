// services/githubAPI.ts
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
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }
  const data = await response.json();
  return data;
};

const githubAPI = {
  // Get everything from repository (structure + file contents)
  getEverything: async (owner: string, repo: string, includeContent: boolean = true, maxFiles: number = 500) => {
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/everything?includeContent=${includeContent}&maxFiles=${maxFiles}`;
    console.log('[GitHubAPI] Fetching repo structure:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Get file content from repository
  getFileContent: async (owner: string, repo: string, path: string, ref?: string) => {
    const encodedPath = encodeURIComponent(path);
    let url = `${API_BASE_URL}/github/repo/${owner}/${repo}/contents/${encodedPath}`;
    if (ref) {
      url += `?ref=${encodeURIComponent(ref)}`;
    }
    console.log('[GitHubAPI] Fetching file content:', url);
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Get repository tree
  getTree: async (owner: string, repo: string, treeSha: string, recursive: boolean = false) => {
    const url = `${API_BASE_URL}/github/repo/${owner}/${repo}/git/trees/${treeSha}${recursive ? '?recursive=true': ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },

  // Get README
  getReadme: async (owner: string, repo: string, ref?: string) => {
    let url = `${API_BASE_URL}/github/repo/${owner}/${repo}/readme`;
    if (ref) {
      url += `?ref=${encodeURIComponent(ref)}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return handleResponse(response);
  },
};

export default githubAPI;