// stores/githubRepoStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import githubAPI from '../services/githubAPI';

export interface FileNode {
  name: string;
  path: string;
  type: 'file'| 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

export interface GitHubRepoState {
  owner: string;
  repo: string;
  repoUrl: string;
  fileStructure: FileNode[];
  files: Record<string, string>;
  lastLoaded: Date | null;
  isLoading: boolean;
  error: string | null;
}

interface GitHubRepoStore {
  // State
  currentRepo: GitHubRepoState | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadRepository: (owner: string, repo: string, repoUrl?: string) => Promise<void>;
  loadRepositoryFromUrl: (url: string) => Promise<void>;
  clearRepository: () => void;
  
  // File operations
  getFileContent: (path: string) => string | undefined;
  updateFileContent: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  renameFile: (oldPath: string, newPath: string) => void;
  createFile: (path: string, content: string) => void;
  getAllFiles: () => Record<string, string>;
  getFileStructure: () => FileNode[];
  
  // Status
  hasRepo: boolean;
}

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
  
  // Build hierarchy
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
  
  // Sort children (folders first, then files)
  const sortChildren = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.type === 'folder'&& b.type === 'file') return -1;
      if (a.type === 'file'&& b.type === 'folder') return 1;
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
  };
  return languageMap[ext] || 'plaintext';
};

const safeBase64Decode = (content: string): string => {
  if (!content) return '';
  try {
    const isBase64 = /^[A-Za-z0-9+/]*=*$/.test(content);
    if (!isBase64) return content;
    return atob(content);
  } catch {
    return content;
  }
};

const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '').replace(/[?#].*$/, '') };
};

export const useGitHubRepoStore = create<GitHubRepoStore>()(
  persist(
    (set, get) => ({
      currentRepo: null,
      isLoading: false,
      error: null,
      hasRepo: false,

      loadRepository: async (owner: string, repo: string, repoUrl?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await githubAPI.getEverything(owner, repo, true, 500);
          
          if (!response?.data?.code?.structure && !response?.data?.files) {
            throw new Error('No files found in repository');
          }
          
          const files = response.data.code?.structure || response.data.files || [];
          const fileMap: Record<string, string> = {};
          const fileItems = files.filter((file: any) => file.type !== 'tree');
          
          for (let i = 0; i < fileItems.length; i++) {
            const file = fileItems[i];
            
            try {
              let content = '';
              
              if (file.content) {
                content = file.content;
              } else if (file.encoding === 'base64'&& file.content) {
                content = safeBase64Decode(file.content);
              } else {
                const contentResponse = await githubAPI.getFileContent(owner, repo, file.path);
                if (contentResponse?.data?.content) {
                  content = safeBase64Decode(contentResponse.data.content);
                } else if (contentResponse?.content) {
                  content = safeBase64Decode(contentResponse.content);
                }
              }
              
              if (content && content.length > 5 * 1024 * 1024) {
                content = content.substring(0, 5 * 1024 * 1024) + '\n\n// Content truncated...';
              }
              
              fileMap[file.path] = content;
            } catch (err) {
              console.error(`Failed to load ${file.path}:`, err);
              fileMap[file.path] = `// Error loading ${file.path}\n// ${err instanceof Error ? err.message : String(err)}`;
            }
          }
          
          const fileStructure = convertToFileNode(fileMap);
          
          set({
            currentRepo: {
              owner,
              repo,
              repoUrl: repoUrl || `https://github.com/${owner}/${repo}`,
              fileStructure,
              files: fileMap,
              lastLoaded: new Date(),
              isLoading: false,
              error: null,
            },
            isLoading: false,
            hasRepo: true,
          });
          
        } catch (err: any) {
          set({ 
            error: err?.message || 'Failed to load repository', 
            isLoading: false,
            currentRepo: null,
            hasRepo: false,
          });
        }
      },

      loadRepositoryFromUrl: async (url: string) => {
        const parsed = parseGitHubUrl(url);
        if (!parsed) {
          set({ error: 'Invalid GitHub URL. Use: https://github.com/owner/repo'});
          return;
        }
        await get().loadRepository(parsed.owner, parsed.repo, url);
      },

      clearRepository: () => {
        set({ currentRepo: null, hasRepo: false, error: null });
      },

      getFileContent: (path: string) => {
        return get().currentRepo?.files[path];
      },

      updateFileContent: (path: string, content: string) => {
        const { currentRepo } = get();
        if (!currentRepo) return;
        
        const updatedFiles = { ...currentRepo.files, [path]: content };
        const updatedStructure = convertToFileNode(updatedFiles);
        
        set({
          currentRepo: {
            ...currentRepo,
            files: updatedFiles,
            fileStructure: updatedStructure,
          },
        });
      },

      deleteFile: (path: string) => {
        const { currentRepo } = get();
        if (!currentRepo) return;
        
        const updatedFiles = { ...currentRepo.files };
        delete updatedFiles[path];
        
        // Also delete any child files if it's a folder
        Object.keys(updatedFiles).forEach(filePath => {
          if (filePath.startsWith(path + '/')) {
            delete updatedFiles[filePath];
          }
        });
        
        const updatedStructure = convertToFileNode(updatedFiles);
        
        set({
          currentRepo: {
            ...currentRepo,
            files: updatedFiles,
            fileStructure: updatedStructure,
          },
        });
      },

      renameFile: (oldPath: string, newPath: string) => {
        const { currentRepo } = get();
        if (!currentRepo) return;
        
        const content = currentRepo.files[oldPath];
        if (!content) return;
        
        const updatedFiles = { ...currentRepo.files };
        delete updatedFiles[oldPath];
        updatedFiles[newPath] = content;
        
        const updatedStructure = convertToFileNode(updatedFiles);
        
        set({
          currentRepo: {
            ...currentRepo,
            files: updatedFiles,
            fileStructure: updatedStructure,
          },
        });
      },

      createFile: (path: string, content: string) => {
        const { currentRepo } = get();
        if (!currentRepo) return;
        
        const updatedFiles = { ...currentRepo.files, [path]: content };
        const updatedStructure = convertToFileNode(updatedFiles);
        
        set({
          currentRepo: {
            ...currentRepo,
            files: updatedFiles,
            fileStructure: updatedStructure,
          },
        });
      },

      getAllFiles: () => {
        return get().currentRepo?.files || {};
      },

      getFileStructure: () => {
        return get().currentRepo?.fileStructure || [];
      },
    }),
    {
      name: 'github-repo-storage', // persists across page refreshes
      partialize: (state) => ({
        currentRepo: state.currentRepo,
        hasRepo: state.hasRepo,
      }),
    }
  )
);