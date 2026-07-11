// hooks/useFileSystem.ts - CORRECTED VERSION (No JSX!)
import { useState, useEffect, useCallback } from 'react';
import { useGitHubRepo } from "../context/GitHubRepoContext";

export interface FileNode {
  name: string;
  path: string;
  type: 'file'| 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

export function useFileSystem(simulationId: string | null, currentTask: any) {
  // Get from context
  const {
    currentRepo,
    loadRepositoryFromUrl,
    getFileContent: getRepoFileContent,
    updateFileContent: updateRepoFileContent,
    getAllFiles: getAllRepoFiles,
    getFileStructure: getRepoFileStructure,
    isLoading: isRepoLoading,
    hasRepo,
  } = useGitHubRepo();

  // Local UI state only
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentFileContent, setCurrentFileContent] = useState('');
  const [currentFileLanguage, setCurrentFileLanguage] = useState('javascript');
  const [syncStatus, setSyncStatus] = useState<{ status: string; message: string }>({ status: 'idle', message: ''});
  const [isLoading, setIsLoading] = useState(false);

  // Use context data
  const fileStructure = hasRepo ? getRepoFileStructure() : [];

  useEffect(() => {
    if (!currentRepo) {
      setCurrentFilePath(null);
      setCurrentFileContent('');
      setCurrentFileLanguage('javascript');
      return;
    }

    const currentContent = currentFilePath ? currentRepo.files[currentFilePath] : undefined;
    if (currentFilePath && currentContent !== undefined) {
      setCurrentFileContent(currentContent);
      setCurrentFileLanguage(getLanguageFromFileName(currentFilePath));
      return;
    }

    const firstFile = findFirstFile(currentRepo.fileStructure);
    if (firstFile) {
      setCurrentFilePath(firstFile.path);
      setCurrentFileContent(firstFile.content || currentRepo.files[firstFile.path] || '');
      setCurrentFileLanguage(firstFile.language || getLanguageFromFileName(firstFile.name));
    } else {
      setCurrentFilePath(null);
      setCurrentFileContent('');
      setCurrentFileLanguage('javascript');
    }
  }, [currentRepo, currentFilePath]);
  
  const getAllFiles = useCallback(() => getAllRepoFiles(), [getAllRepoFiles]);
  
  const updateFileContent = useCallback((path: string, content: string) => {
    updateRepoFileContent(path, content);
    if (currentFilePath === path) {
      setCurrentFileContent(content);
    }
  }, [updateRepoFileContent, currentFilePath]);
  
  const createFile = useCallback((parentPath: string, name: string) => {
    const filePath = parentPath ? `${parentPath}/${name}` : name;
    const lang = getLanguageFromFileName(name);
    const defaultCode = getDefaultCodeForLanguage(lang);
    
    updateRepoFileContent(filePath, defaultCode);
    setCurrentFilePath(filePath);
    setCurrentFileContent(defaultCode);
    setCurrentFileLanguage(lang);
  }, [updateRepoFileContent]);
  
  const createFolder = useCallback((parentPath: string, name: string) => {
    const folderPath = parentPath ? `${parentPath}/${name}` : name;
    const placeholderPath = `${folderPath}/.gitkeep`;
    updateRepoFileContent(placeholderPath, '');
  }, [updateRepoFileContent]);
  
  const deleteFile = useCallback((path: string) => {
    // Remove from context (in a real app, you'd call an API)
    // For now, just update local state
    if (currentFilePath === path) {
      setCurrentFilePath(null);
      setCurrentFileContent('');
    }
  }, [currentFilePath]);
  
  const renameFile = useCallback((oldPath: string, newName: string) => {
    const content = getRepoFileContent(oldPath);
    if (content === undefined) return;
    
    const oldParts = oldPath.split('/');
    oldParts[oldParts.length - 1] = newName;
    const newPath = oldParts.join('/');
    
    updateRepoFileContent(newPath, content);
    
    if (currentFilePath === oldPath) {
      setCurrentFilePath(newPath);
      setCurrentFileLanguage(getLanguageFromFileName(newName));
    }
  }, [getRepoFileContent, updateRepoFileContent, currentFilePath]);
  
  const moveFile = useCallback((sourcePath: string, targetPath: string) => {
    const content = getRepoFileContent(sourcePath);
    if (content === undefined) return;
    
    const fileName = sourcePath.split('/').pop();
    const newPath = targetPath === ''? fileName || 'file': `${targetPath}/${fileName}`;
    
    updateRepoFileContent(newPath, content);
    
    if (currentFilePath === sourcePath) {
      setCurrentFilePath(newPath);
    }
  }, [getRepoFileContent, updateRepoFileContent, currentFilePath]);
  
  const copyFile = useCallback((sourcePath: string, targetPath: string) => {
    const content = getRepoFileContent(sourcePath);
    if (content === undefined) return;
    
    const fileName = sourcePath.split('/').pop();
    let newPath = targetPath === ''? fileName || 'file': `${targetPath}/${fileName}`;
    
    let counter = 1;
    while (getRepoFileContent(newPath)) {
      const nameParts = fileName?.split('.') || ['file'];
      if (nameParts.length > 1) {
        const ext = nameParts.pop();
        newPath = `${nameParts.join('.')}_copy${counter}.${ext}`;
      } else {
        newPath = `${fileName}_copy${counter}`;
      }
      counter++;
    }
    
    updateRepoFileContent(newPath, content);
  }, [getRepoFileContent, updateRepoFileContent]);
  
  const refreshFiles = useCallback(() => {
    // Force refresh from context
    const structure = getRepoFileStructure();
    // This will trigger a re-render
  }, [getRepoFileStructure]);
  
  const pushToLocal = useCallback(async () => {
    setSyncStatus({ status: 'syncing', message: 'Preparing files for export...'});
    
    const allFiles = getAllFiles();
    const fileCount = Object.keys(allFiles).length;
    
    if (fileCount === 0) {
      setSyncStatus({ status: 'error', message: 'No files to export'});
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
      return;
    }
    
    if ('showDirectoryPicker'in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite', startIn: 'documents'});
        let created = 0;
        
        for (const [filePath, content] of Object.entries(allFiles)) {
          const parts = filePath.split('/');
          let currentDir = dirHandle;
          
          for (let i = 0; i < parts.length - 1; i++) {
            currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
          }
          
          const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
          created++;
        }
        
        setSyncStatus({ status: 'success', message: `''Exported ${created} files!` });
        setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
      } catch (err) {
        setSyncStatus({ status: 'error', message: 'Export cancelled or failed'});
        setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
      }
    } else {
      const blob = new Blob([JSON.stringify({ files: allFiles }, null, 2)], { type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace_export_${new Date().toISOString().slice(0, 19)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setSyncStatus({ status: 'success', message: `''Exported ${fileCount} files as JSON` });
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
    }
  }, [getAllFiles]);
  
  const pullFromLocal = useCallback(async () => {
    if (!('showDirectoryPicker'in window)) {
      setSyncStatus({ status: 'error', message: 'Your browser does not support folder upload.'});
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
      return;
    }
    
    setSyncStatus({ status: 'syncing', message: 'Select a folder to import...'});
    
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const filesFromFolder = await readDirectoryStructure(dirHandle);
      const fileCount = Object.keys(filesFromFolder).length;
      
      if (fileCount === 0) {
        setSyncStatus({ status: 'error', message: 'No files found.'});
        setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
        return;
      }
      
      for (const [path, content] of Object.entries(filesFromFolder)) {
        updateRepoFileContent(path, content as string);
      }
      
      setSyncStatus({ status: 'success', message: `''Imported ${fileCount} files!` });
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setSyncStatus({ status: 'error', message: 'Import failed.'});
      }
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
    }
  }, [updateRepoFileContent]);
  
  const loadFromGitHubRepo = useCallback(async (owner: string, repo: string) => {
    setIsLoading(true);
    setSyncStatus({ status: 'syncing', message: `Loading ${owner}/${repo}...` });
    
    try {
      await loadRepositoryFromUrl(`https://github.com/${owner}/${repo}`);
      
      setSyncStatus({ status: 'success', message: `''Loaded repository!` });
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
    } catch (err) {
      setSyncStatus({ status: 'error', message: 'Failed to load repository'});
      setTimeout(() => setSyncStatus({ status: 'idle', message: ''}), 3000);
    } finally {
      setIsLoading(false);
    }
  }, [loadRepositoryFromUrl]);
  
  const setCurrentFile = useCallback((path: string, content: string, language?: string) => {
    setCurrentFilePath(path);
    // If the caller passed empty content, look up the actual content from the repo context
    const resolvedContent = content || getRepoFileContent(path) || '';
    setCurrentFileContent(resolvedContent);
    setCurrentFileLanguage(language || getLanguageFromFileName(path));
  }, [getRepoFileContent]);

  const resetCurrentFile = useCallback(() => {
    setCurrentFilePath(null);
    setCurrentFileContent('');
    setCurrentFileLanguage('javascript');
  }, []);
  
  return {
    fileStructure,
    currentFilePath,
    currentFileContent,
    setCurrentFileContent,
    currentFileLanguage,
    setCurrentFileLanguage,
    setCurrentFile,
    resetCurrentFile,
    updateFileContent,
    createFile,
    createFolder,
    deleteFile,
    renameFile,
    moveFile,
    copyFile,
    refreshFiles,
    pushToLocal,
    pullFromLocal,
    syncStatus: syncStatus.status,
    syncMessage: syncStatus.message,
    getAllFiles,
    loadFromGitHubRepo,
    isLoading: isLoading || isRepoLoading,
  };
}

// Helper functions
const getLanguageFromFileName = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
    'py': 'python', 'java': 'java', 'html': 'html', 'css': 'css', 'json': 'json',
    'md': 'markdown', 'txt': 'plaintext', 'yml': 'yaml', 'yaml': 'yaml',
  };
  return map[ext] || 'plaintext';
};

const getDefaultCodeForLanguage = (langId: string): string => {
  const defaults: Record<string, string> = {
    'javascript': '// JavaScript code\nconsole.log("Hello World!");',
    'typescript': '// TypeScript code\nconst message: string = "Hello World!";\nconsole.log(message);',
    'python': '# Python code\nprint("Hello World!")',
    'java': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World!");\n    }\n}',
    'html': '<!DOCTYPE html>\n<html>\n<head>\n    <title>My Page</title>\n</head>\n<body>\n    <h1>Hello World!</h1>\n</body>\n</html>',
    'css': 'body {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n}',
    'json': '{\n    "name": "My Project",\n    "version": "1.0.0"\n}',
    'markdown': '# My Document\n\n## Introduction\n\nThis is a markdown document.',
  };
  return defaults[langId] || '// Write your code here\n';
};

const findFirstFile = (nodes: FileNode[]): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file') return node;
    if (node.children) {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
};

const readDirectoryStructure = async (dirHandle: any, currentPath = ''): Promise<Record<string, string>> => {
  const result: Record<string, string> = {};
  for await (const entry of dirHandle.values()) {
    const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const content = await file.text();
      result[fullPath] = content;
    } else if (entry.kind === 'directory') {
      const subDir = await dirHandle.getDirectoryHandle(entry.name);
      const subFiles = await readDirectoryStructure(subDir, fullPath);
      Object.assign(result, subFiles);
    }
  }
  return result;
};
