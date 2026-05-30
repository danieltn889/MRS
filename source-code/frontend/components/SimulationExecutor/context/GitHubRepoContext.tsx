// components/SimulationExecutor/context/GitHubRepoContext.tsx - WITH PER-TASK STORAGE AND BRANCH NAME
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import githubAPI from '../../../services/githubAPI';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

// GitHub Statistics Interface
export interface GitHubStats {
  social?: { 
    stars?: number; 
    forks?: number; 
    watchers?: number; 
    openIssues?: number 
  };
  commits?: { 
    total?: number; 
    averageCommitsPerWeek?: number; 
    recentCommits?: any[];
    commitFrequency?: number;
  };
  pullRequests?: { 
    total?: number; 
    open?: number; 
    merged?: number; 
    closed?: number;
    mergeRate?: number;
    averageTimeToMergeHours?: number;
    recentPRs?: any[];
  };
  issues?: { 
    total?: number; 
    open?: number; 
    closed?: number;
    averageResolutionTimeHours?: number;
    recentIssues?: any[];
  };
  contributors?: { 
    total?: number; 
    totalContributions?: number;
    topContributors?: any[];
  };
  scores?: { 
    overall?: number; 
    documentation?: number; 
    activity?: number; 
    community?: number;
    issueManagement?: number;
  };
  languages?: { 
    breakdown?: any[]; 
    primary?: string;
    percentages?: Record<string, number>;
  };
  participation?: {
    all?: number[];
    owner?: number[];
  };
  punchCard?: {
    byDay?: any[];
    summary?: any;
  };
}

export interface GitHubRepoState {
  owner: string;
  repo: string;
  repoUrl: string;
  branchName?: string;  // ✅ ADD BRANCH NAME
  fileStructure: FileNode[];
  files: Record<string, string>;
  lastLoaded: Date | null;
  isLoading: boolean;
  error: string | null;
  fullStats?: GitHubStats | null;
  statsLoading?: boolean;
}

// Per-task repository storage - ADD branchName
interface TaskRepository {
  owner: string;
  repo: string;
  repoUrl: string;
  branchName?: string;  // ✅ ADD BRANCH NAME
  fileStructure: FileNode[];
  files: Record<string, string>;
  fullStats?: GitHubStats | null;
  lastLoaded: Date | null;
}

interface GitHubRepoContextValue {
  currentRepo: GitHubRepoState | null;
  currentTaskIndex: number;
  setCurrentTaskIndex: (index: number) => void;
  loadRepository: (owner: string, repo: string, repoUrl?: string, branchName?: string) => Promise<void>;
  loadRepositoryFromUrl: (url: string) => Promise<void>;
  clearRepository: () => void;
  getFileContent: (path: string) => string | undefined;
  updateFileContent: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  renameFile: (oldPath: string, newPath: string) => void;
  createFile: (path: string, content: string) => void;
  getAllFiles: () => Record<string, string>;
  getFileStructure: () => FileNode[];
  isLoading: boolean;
  statsLoading: boolean;
  error: string | null;
  hasRepo: boolean;
  refreshStats: () => Promise<void>;
  // Per-task methods
  saveCurrentRepoForTask: () => void;
  loadRepoForTask: (taskIndex: number) => void;
  getReposForAllTasks: () => Record<number, TaskRepository>;
  clearAllTaskRepos: () => void;
  loadSessionGitHubRepo: (repoUrl: string, branchName?: string) => Promise<void>;
}

const GitHubRepoContext = createContext<GitHubRepoContextValue | undefined>(undefined);

export const useGitHubRepo = () => {
  const context = useContext(GitHubRepoContext);
  if (!context) {
    console.error('❌ useGitHubRepo: Context not found! Make sure component is wrapped with GitHubRepoProvider');
    throw new Error('useGitHubRepo must be used within GitHubRepoProvider');
  }
  // console.log('✅ useGitHubRepo: Context found, returning context');
  return context;
};

// Helper: Convert flat files to tree structure
const convertToFileNode = (files: Record<string, string>): FileNode[] => {
  const root: Map<string, FileNode> = new Map();
  const sortedPaths = Object.keys(files).sort();
  
  for (const filePath of sortedPaths) {
    const content = files[filePath];
    const parts = filePath.split('/');
    let currentPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const newPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (isLast) {
        if (!root.has(newPath)) {
          root.set(newPath, {
            name: part,
            path: newPath,
            type: 'file',
            content: content,
            language: getLanguageFromFileName(part)
          });
        }
      } else {
        if (!root.has(newPath)) {
          root.set(newPath, {
            name: part,
            path: newPath,
            type: 'folder',
            children: []
          });
        }
        currentPath = newPath;
      }
    }
  }
  
  const result: FileNode[] = [];
  const folderMap = new Map<string, FileNode>();
  
  Array.from(root.values()).forEach(node => {
    const pathParts = node.path.split('/');
    if (pathParts.length === 1) {
      result.push(node);
      if (node.type === 'folder') {
        folderMap.set(node.path, node);
      }
    }
  });
  
  Array.from(root.values()).forEach(node => {
    const pathParts = node.path.split('/');
    if (pathParts.length > 1) {
      const parentPath = pathParts.slice(0, -1).join('/');
      const parent = folderMap.get(parentPath);
      
      if (parent && parent.type === 'folder') {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
        if (node.type === 'folder') {
          folderMap.set(node.path, node);
        }
      }
    }
  });
  
  const sortChildren = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(node => {
      if (node.children) sortChildren(node.children);
    });
  };
  
  sortChildren(result);
  return result;
};

const getLanguageFromFileName = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
    'py': 'python', 'java': 'java', 'go': 'go', 'rs': 'rust', 'cpp': 'cpp', 'c': 'c',
    'html': 'html', 'css': 'css', 'json': 'json', 'md': 'markdown', 'txt': 'plaintext',
    'yml': 'yaml', 'yaml': 'yaml', 'xml': 'xml', 'sql': 'sql', 'sh': 'shell',
    'php': 'php', 'rb': 'ruby', 'swift': 'swift', 'kt': 'kotlin', 'scala': 'scala'
  };
  return languageMap[ext] || 'plaintext';
};

const safeBase64Decode = (content: string): string => {
  if (!content) return '';
  try {
    const isBase64 = /^[A-Za-z0-9+/]*=*$/.test(content.substring(0, 100));
    if (!isBase64) return content;
    const decoded = atob(content);
    try {
      decodeURIComponent(escape(decoded));
      return decoded;
    } catch {
      return content;
    }
  } catch {
    return content;
  }
};

const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
  if (!match) return null;
  
  const owner = match[1];
  let repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
  
  return { owner, repo };
};

// Load per-task repositories from localStorage
const loadTaskReposFromStorage = (): Record<string, Record<number, TaskRepository>> => {
  try {
    const saved = localStorage.getItem('task-repositories');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load task repositories from storage:', e);
  }
  return {};
};

const saveTaskReposToStorage = (repos: Record<string, Record<number, TaskRepository>>) => {
  try {
    localStorage.setItem('task-repositories', JSON.stringify(repos));
  } catch (e) {
    console.error('Failed to save task repositories to storage:', e);
  }
};

interface GitHubRepoProviderProps {
  children: ReactNode;
}

export const GitHubRepoProvider: React.FC<GitHubRepoProviderProps> = ({ children }) => {
  const [currentRepo, setCurrentRepo] = useState<GitHubRepoState | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Per-task repositories storage: { sessionId: { taskIndex: TaskRepository } }
  const [taskRepos, setTaskRepos] = useState<Record<string, Record<number, TaskRepository>>>(() => loadTaskReposFromStorage());
  
  const sessionId = 'current-session'; // You can pass actual session ID as prop
  
  console.log('📦 [GitHubRepoProvider] Initialized with taskRepos:', Object.keys(taskRepos || {}).length, 'sessions');

  // Save task repositories to localStorage whenever they change
  useEffect(() => {
    saveTaskReposToStorage(taskRepos);
  }, [taskRepos]);

  // Save current repository for the current task (INCLUDING BRANCH NAME)
  const saveCurrentRepoForTask = useCallback(() => {
    if (!currentRepo) return;
    
    const taskRepo: TaskRepository = {
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      repoUrl: currentRepo.repoUrl,
      branchName: currentRepo.branchName,  // ✅ SAVE BRANCH NAME
      fileStructure: currentRepo.fileStructure,
      files: currentRepo.files,
      fullStats: currentRepo.fullStats,
      lastLoaded: new Date(),
    };
    
    setTaskRepos(prev => {
      const sessionRepos = prev[sessionId] || {};
      return {
        ...prev,
        [sessionId]: {
          ...sessionRepos,
          [currentTaskIndex]: taskRepo
        }
      };
    });
    
    console.log(`💾 Saved repository for Task ${currentTaskIndex}:`, {
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      branchName: currentRepo.branchName
    });
  }, [currentRepo, currentTaskIndex, sessionId]);

  // Load repository for a specific task (INCLUDING BRANCH NAME)
  const loadRepoForTask = useCallback((taskIndex: number) => {
    const savedRepo = taskRepos[sessionId]?.[taskIndex];
    
    if (savedRepo) {
      console.log(`📁 Loading repository for Task ${taskIndex}:`, {
        owner: savedRepo.owner,
        repo: savedRepo.repo,
        branchName: savedRepo.branchName
      });
      
      const repoState: GitHubRepoState = {
        owner: savedRepo.owner,
        repo: savedRepo.repo,
        repoUrl: savedRepo.repoUrl,
        branchName: savedRepo.branchName,  // ✅ LOAD BRANCH NAME
        fileStructure: savedRepo.fileStructure,
        files: savedRepo.files,
        fullStats: savedRepo.fullStats,
        lastLoaded: savedRepo.lastLoaded,
        isLoading: false,
        error: null,
        statsLoading: false,
      };
      
      setCurrentRepo(repoState);
    } else {
      console.log(`📁 No saved repository for Task ${taskIndex}`);
      setCurrentRepo(null);
    }
  }, [taskRepos, sessionId]);

  // Get all repositories for all tasks
  const getReposForAllTasks = useCallback(() => {
    return taskRepos[sessionId] || {};
  }, [taskRepos, sessionId]);

  // Fetch all statistics for the repository
  const fetchAllStats = useCallback(async (owner: string, repo: string) => {
    setStatsLoading(true);
    
    try {
      console.log('Fetching stats for:', owner, repo);
      
      const everythingResult = await githubAPI.getEverything(owner, repo, false, 50);
      
      let fullStats: GitHubStats = {};
      
      if (everythingResult?.data || everythingResult) {
        const statsData = everythingResult?.data || everythingResult;
        const fileCount = currentRepo?.files ? Object.keys(currentRepo.files).length : 0;
        
        fullStats = {
          social: {
            stars: statsData.social?.stars || statsData.stars || 0,
            forks: statsData.social?.forks || statsData.forks || 0,
            watchers: statsData.social?.watchers || statsData.watchers || 0,
            openIssues: statsData.social?.openIssues || statsData.openIssues || 0,
          },
          commits: {
            total: statsData.commits?.total || statsData.totalCommits || fileCount || 6,
            averageCommitsPerWeek: statsData.commits?.averageCommitsPerWeek || 0,
            recentCommits: statsData.commits?.recentCommits || [],
            commitFrequency: statsData.commits?.commitFrequency || 0,
          },
          pullRequests: statsData.pullRequests || { total: 0, open: 0, merged: 0, closed: 0, mergeRate: 0 },
          issues: statsData.issues || { total: 0, open: 0, closed: 0 },
          contributors: statsData.contributors || { total: 1, totalContributions: 0, topContributors: [] },
          scores: statsData.scores || { overall: fileCount > 0 ? 65 : 0, documentation: 50, activity: 50, community: 50 },
          languages: statsData.languages || { breakdown: [], primary: 'unknown' },
        };
      }
      
      setCurrentRepo(prev => prev ? { ...prev, fullStats, lastLoaded: new Date() } : prev);
      console.log('Stats fetched successfully');
      
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      const fileCount = currentRepo?.files ? Object.keys(currentRepo.files).length : 0;
      setCurrentRepo(prev => prev ? {
        ...prev,
        fullStats: {
          social: { stars: 0, forks: 0, watchers: 0, openIssues: 0 },
          commits: { total: fileCount || 6, averageCommitsPerWeek: 0 },
          contributors: { total: 1 },
          scores: { overall: fileCount > 0 ? 65 : 0, documentation: 50, activity: 50, community: 50 },
        },
        lastLoaded: new Date(),
      } : prev);
    } finally {
      setStatsLoading(false);
    }
  }, [currentRepo]);

  const refreshStats = useCallback(async () => {
    if (currentRepo) {
      await fetchAllStats(currentRepo.owner, currentRepo.repo);
    }
  }, [currentRepo, fetchAllStats]);

  // ✅ UPDATE loadRepository to accept branchName
  const loadRepository = useCallback(async (owner: string, repo: string, repoUrl?: string, branchName?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log(`Loading GitHub repo: ${owner}/${repo}`, { branchName });
      
      const response = await githubAPI.getEverything(owner, repo, true, 500);
      
      if (!response?.data?.code?.structure && !response?.data?.files) {
        throw new Error('No files found in repository');
      }
      
      const files = response.data.code?.structure || response.data.files || [];
      const fileMap: Record<string, string> = {};
      const fileItems = files.filter((file: any) => file.type !== 'tree');
      
      console.log(`Found ${fileItems.length} files in repository`);
      
      for (let i = 0; i < fileItems.length; i++) {
        const file = fileItems[i];
        
        try {
          let content = '';
          
          if (file.content) {
            content = file.content;
          } else if (file.encoding === 'base64' && file.content) {
            content = safeBase64Decode(file.content);
          } else {
            try {
              const contentResponse = await githubAPI.getFileContent(owner, repo, file.path);
              if (contentResponse?.data?.content) {
                content = safeBase64Decode(contentResponse.data.content);
              } else if (contentResponse?.content) {
                content = safeBase64Decode(contentResponse.content);
              }
            } catch (fetchErr) {
              console.warn(`Could not fetch content for ${file.path}:`, fetchErr);
              content = `// Could not load content for ${file.path}\n// ${fetchErr instanceof Error ? fetchErr.message : 'Unknown error'}`;
            }
          }
          
          if (content && content.length > 5 * 1024 * 1024) {
            content = content.substring(0, 5 * 1024 * 1024) + '\n\n// Content truncated...';
          }
          
          fileMap[file.path] = content || `// Empty file: ${file.path}`;
        } catch (err) {
          console.error(`Failed to load ${file.path}:`, err);
          fileMap[file.path] = `// Error loading ${file.path}\n// ${err instanceof Error ? err.message : String(err)}`;
        }
      }
      
      const fileStructure = convertToFileNode(fileMap);
      
      const newRepo: GitHubRepoState = {
        owner,
        repo,
        repoUrl: repoUrl || `https://github.com/${owner}/${repo}`,
        branchName: branchName || 'main',  // ✅ STORE BRANCH NAME
        fileStructure,
        files: fileMap,
        lastLoaded: new Date(),
        isLoading: false,
        error: null,
        fullStats: null,
        statsLoading: false,
      };
      
      setCurrentRepo(newRepo);
      console.log(`Successfully loaded ${Object.keys(fileMap).length} files from ${owner}/${repo}`, { branchName: newRepo.branchName });
      
      await fetchAllStats(owner, repo);
      
      // Auto-save for current task after loading
      setTimeout(() => {
        saveCurrentRepoForTask();
      }, 500);
      
    } catch (err: any) {
      console.error('Failed to load repository:', err);
      setError(err?.message || 'Failed to load repository');
      setCurrentRepo(null);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAllStats, saveCurrentRepoForTask]);

  const loadRepositoryFromUrl = useCallback(async (url: string) => {
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      setError('Invalid GitHub URL. Use: https://github.com/owner/repo');
      return;
    }
    await loadRepository(parsed.owner, parsed.repo, url);
  }, [loadRepository]);

  const clearRepository = useCallback(() => {
    setCurrentRepo(null);
    setError(null);
  }, []);

  const getFileContent = useCallback((path: string): string | undefined => {
    return currentRepo?.files[path];
  }, [currentRepo]);

  const updateFileContent = useCallback((path: string, content: string) => {
    if (!currentRepo) return;
    
    const updatedFiles = { ...currentRepo.files, [path]: content };
    const updatedStructure = convertToFileNode(updatedFiles);
    
    setCurrentRepo({
      ...currentRepo,
      files: updatedFiles,
      fileStructure: updatedStructure,
      lastLoaded: new Date(),
    });
    
    // Auto-save after file change
    setTimeout(() => {
      saveCurrentRepoForTask();
    }, 1000);
  }, [currentRepo, saveCurrentRepoForTask]);

  const deleteFile = useCallback((path: string) => {
    if (!currentRepo) return;
    
    const updatedFiles = { ...currentRepo.files };
    delete updatedFiles[path];
    
    Object.keys(updatedFiles).forEach(filePath => {
      if (filePath.startsWith(path + '/')) {
        delete updatedFiles[filePath];
      }
    });
    
    const updatedStructure = convertToFileNode(updatedFiles);
    
    setCurrentRepo({
      ...currentRepo,
      files: updatedFiles,
      fileStructure: updatedStructure,
      lastLoaded: new Date(),
    });
    
    setTimeout(() => saveCurrentRepoForTask(), 1000);
  }, [currentRepo, saveCurrentRepoForTask]);

  const renameFile = useCallback((oldPath: string, newPath: string) => {
    if (!currentRepo) return;
    
    const content = currentRepo.files[oldPath];
    if (!content) return;
    
    const updatedFiles = { ...currentRepo.files };
    delete updatedFiles[oldPath];
    updatedFiles[newPath] = content;
    
    const updatedStructure = convertToFileNode(updatedFiles);
    
    setCurrentRepo({
      ...currentRepo,
      files: updatedFiles,
      fileStructure: updatedStructure,
      lastLoaded: new Date(),
    });
    
    setTimeout(() => saveCurrentRepoForTask(), 1000);
  }, [currentRepo, saveCurrentRepoForTask]);

  const createFile = useCallback((path: string, content: string) => {
    if (!currentRepo) return;
    
    const updatedFiles = { ...currentRepo.files, [path]: content };
    const updatedStructure = convertToFileNode(updatedFiles);
    
    setCurrentRepo({
      ...currentRepo,
      files: updatedFiles,
      fileStructure: updatedStructure,
      lastLoaded: new Date(),
    });
    
    setTimeout(() => saveCurrentRepoForTask(), 1000);
  }, [currentRepo, saveCurrentRepoForTask]);

  const getAllFiles = useCallback((): Record<string, string> => {
    return currentRepo?.files || {};
  }, [currentRepo]);

  const getFileStructure = useCallback((): FileNode[] => {
    return currentRepo?.fileStructure || [];
  }, [currentRepo]);

  // Clear all cached task repositories from localStorage
  const clearAllTaskRepos = useCallback(() => {
    console.log('🧹 Clearing all cached task repositories...');
    try {
      localStorage.removeItem('task-repositories');
      setTaskRepos({});
      setCurrentRepo(null);
      console.log('✅ All task repositories cleared');
    } catch (e) {
      console.error('Failed to clear task repositories:', e);
    }
  }, []);

  // ✅ UPDATE loadSessionGitHubRepo to accept branchName
  const loadSessionGitHubRepo = useCallback(async (repoUrl: string, branchName?: string) => {
    console.log('🔄 [loadSessionGitHubRepo] Loading from session:', { repoUrl, branchName });
    
    if (!repoUrl) {
      console.warn('⚠️ No repoUrl provided to loadSessionGitHubRepo');
      return;
    }

    // Parse URL to get owner/repo
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      console.error('❌ Failed to parse GitHub URL:', repoUrl);
      return;
    }

    console.log('🔍 Parsed GitHub URL:', parsed);

    // Load the repository directly, bypassing cache, with branch name
    try {
      await loadRepository(parsed.owner, parsed.repo, repoUrl, branchName);
      console.log('✅ Session GitHub repo loaded successfully with branch:', branchName);
    } catch (err) {
      console.error('❌ Failed to load session GitHub repo:', err);
    }
  }, [loadRepository]);

  const value: GitHubRepoContextValue = {
    currentRepo,
    currentTaskIndex,
    setCurrentTaskIndex,
    loadRepository,
    loadRepositoryFromUrl,
    clearRepository,
    getFileContent,
    updateFileContent,
    deleteFile,
    renameFile,
    createFile,
    getAllFiles,
    getFileStructure,
    isLoading,
    statsLoading,
    error,
    hasRepo: currentRepo !== null,
    refreshStats,
    saveCurrentRepoForTask,
    loadRepoForTask,
    getReposForAllTasks,
    clearAllTaskRepos,
    loadSessionGitHubRepo,
  };

  return (
    <GitHubRepoContext.Provider value={value}>
      {children}
    </GitHubRepoContext.Provider>
  );
};