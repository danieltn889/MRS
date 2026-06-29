// components/SimulationExecutor/FileExplorer.tsx - COMPLETE WITH INFINITE LOOP FIX, VERTICAL SCROLL, AND BRANCH NAME
import React, { useState, useEffect, useRef } from 'react';
import {
  Folder, FolderPlus, FilePlus, RefreshCw, Search,
  ChevronRight, ChevronDown, Code, Trash2, Edit3,
  Copy, Scissors, Clipboard, X, Github, Download, Loader2, AlertCircle
} from 'lucide-react';
import { useGitHubRepo } from './context/GitHubRepoContext';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
}

interface FileExplorerProps {
  files: FileNode[];
  currentFile: string | null;
  currentTaskIndex?: number;
  onFileSelect: (path: string, content: string, language: string) => void;
  onCreateFile: (parentPath: string, name: string) => void;
  onCreateFolder: (parentPath: string, name: string) => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onMoveFile: (sourcePath: string, targetPath: string) => void;
  onCopyFile: (sourcePath: string, targetPath: string) => void;
  onRefresh: () => void;
  onLoadFromGitHub?: (owner: string, repo: string) => Promise<void>;
  isLoadingGitHub?: boolean;
  // ✅ Add githubRepo prop to receive session GitHub data
  githubRepo?: {
    repoName: string;
    repoUrl: string;
    branchName: string;
    organizationName?: string;
    candidateUsername?: string;
  } | null;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  currentFile,
  currentTaskIndex = 0,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
  onMoveFile,
  onCopyFile,
  onRefresh,
  onLoadFromGitHub,
  isLoadingGitHub = false,
  githubRepo,  // ← Add this prop
}) => {
  // Start fully collapsed — folders expand on demand so you view files/code when you want.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    type: 'file' | 'folder';
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ node: FileNode; action: 'copy' | 'cut' } | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newItemParentPath, setNewItemParentPath] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<'file' | 'folder'>('file');
  
  // GitHub repo loader state
  const [repoUrl, setRepoUrl] = useState('');
  const [repoError, setRepoError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Use ref to track last loaded task to prevent infinite loop
  const lastLoadedTaskRef = useRef<number>(-1);
  const isLoadingRef = useRef<boolean>(false);
  
  // Ref for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Get from context
  const { currentRepo, clearRepository, loadRepositoryFromUrl, loadSessionGitHubRepo, refreshStats, loadRepoForTask } = useGitHubRepo();

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    
    const owner = match[1];
    let repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
    
    return { owner, repo };
  };

  // ✅ FIX: Only load repository when task index changes, not on every render
  useEffect(() => {
    if (currentTaskIndex !== lastLoadedTaskRef.current && !isLoadingRef.current) {
      console.log(`📁 FileExplorer: Loading repository for Task ${currentTaskIndex}`);
      lastLoadedTaskRef.current = currentTaskIndex;
      isLoadingRef.current = true;
      loadRepoForTask(currentTaskIndex);
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 500);
    }
  }, [currentTaskIndex, loadRepoForTask]);

  // ✅ AUTO-LOAD GITHUB REPOSITORY FROM SESSION (when githubRepo prop changes)
  useEffect(() => {
    if (githubRepo?.repoUrl && !currentRepo && !isLoadingRef.current) {
      console.log('🐙 [FileExplorer] Auto-loading GitHub repo from session:', {
        repoUrl: githubRepo.repoUrl,
        branchName: githubRepo.branchName
      });
      isLoadingRef.current = true;
      loadSessionGitHubRepo(githubRepo.repoUrl, githubRepo.branchName)
        .catch((err) => {
          console.error('❌ Failed to auto-load GitHub repo from session:', err);
        })
        .finally(() => {
          setTimeout(() => {
            isLoadingRef.current = false;
          }, 500);
        });
    }
  }, [githubRepo?.repoUrl, githubRepo?.branchName, currentRepo, loadSessionGitHubRepo]);

  // ✅ Verify currentRepo is being loaded correctly
  useEffect(() => {
    if (currentRepo) {
      const fileCount = Object.keys(currentRepo.files || {}).length;
      console.log(`✅ [FileExplorer] Repo loaded: ${currentRepo.owner}/${currentRepo.repo}, Branch: ${currentRepo.branchName}, Files: ${fileCount}`);
    }
  }, [currentRepo]);

  // Auto-scroll to current file when selected
  useEffect(() => {
    if (currentFile && scrollContainerRef.current) {
      setTimeout(() => {
        const selectedElement = scrollContainerRef.current?.querySelector(`[data-file-path="${currentFile}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [currentFile]);

  const handleLoadRepo = async () => {
    if (!repoUrl.trim()) {
      setRepoError('Please enter a GitHub repository URL');
      return;
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      setRepoError('Invalid GitHub URL. Use: https://github.com/owner/repo');
      return;
    }

    // Check if it's a valid repository name (not a simulation)
    if (parsed.repo.startsWith('sim-')) {
      setRepoError('Cannot load simulation repository. Please enter a real GitHub repository URL.');
      return;
    }

    setRepoError('');
    if (onLoadFromGitHub) {
      try {
        await onLoadFromGitHub(parsed.owner, parsed.repo);
      } catch (err: any) {
        setRepoError(err?.message || 'Failed to load repository');
      }
    } else {
      try {
        // Use loadSessionGitHubRepo to bypass cache
        await loadSessionGitHubRepo(repoUrl);
      } catch (err: any) {
        setRepoError(err?.message || 'Failed to load repository');
      }
    }
  };

  const handleRefreshRepo = async () => {
    if (!currentRepo) return;
    
    setIsRefreshing(true);
    setRepoError('');
    
    try {
      const repoFullUrl = `https://github.com/${currentRepo.owner}/${currentRepo.repo}`;
      await loadRepositoryFromUrl(repoFullUrl);
      
      if (refreshStats) {
        await refreshStats();
      }
      
      onRefresh();
      
    } catch (err) {
      setRepoError('Failed to refresh repository');
      setTimeout(() => setRepoError(''), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearRepo = () => {
    clearRepository();
  };

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpanded(newExpanded);
  };

  const findNodeByPath = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const handleRename = (oldPath: string) => {
    if (newName.trim() && newName !== oldPath.split('/').pop()) {
      onRenameFile(oldPath, newName);
    }
    setRenaming(null);
    setNewName('');
  };

  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ path: node.path, type: node.type }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, path: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(path);
  };

  const handleDragLeave = () => {
    setDragOverPath(null);
  };

  const handleDrop = (e: React.DragEvent, targetPath: string) => {
    e.preventDefault();
    setDragOverPath(null);

    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (draggedData.path === targetPath) return;

      const targetNode = findNodeByPath(files, targetPath);
      let destinationPath = targetPath;

      if (targetNode && targetNode.type === 'folder') {
        destinationPath = targetPath;
      } else if (targetPath.includes('/')) {
        destinationPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
      } else {
        destinationPath = '';
      }

      onMoveFile(draggedData.path, destinationPath);
    } catch (err) {
      console.error('Drop failed:', err);
    }
  };

  const handleCopy = () => {
    if (contextMenu) {
      const node = findNodeByPath(files, contextMenu.path);
      if (node) {
        setClipboard({ node, action: 'copy' });
      }
      setContextMenu(null);
    }
  };

  const handleCut = () => {
    if (contextMenu) {
      const node = findNodeByPath(files, contextMenu.path);
      if (node) {
        setClipboard({ node, action: 'cut' });
      }
      setContextMenu(null);
    }
  };

  const handlePaste = () => {
    if (contextMenu && clipboard) {
      const targetPath = contextMenu.type === 'folder'
        ? contextMenu.path
        : contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/'));

      if (clipboard.action === 'copy') {
        onCopyFile(clipboard.node.path, targetPath);
      } else if (clipboard.action === 'cut') {
        onMoveFile(clipboard.node.path, targetPath);
        setClipboard(null);
      }
      setContextMenu(null);
    }
  };

  const filterNodes = (nodes: FileNode[]): FileNode[] => {
    if (!search) return nodes;
    return nodes
      .filter(n =>
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        (n.type === 'folder' && n.children && filterNodes(n.children).length > 0)
      )
      .map(n =>
        n.type === 'folder' && n.children
          ? { ...n, children: filterNodes(n.children) }
          : n
      );
  };

  const renderTree = (nodes: FileNode[], level = 0): React.ReactNode => {
    const filtered = filterNodes(nodes);

    return filtered.map(node => {
      const isExpanded = expanded.has(node.path);
      const isCurrent = currentFile === node.path;
      const isDragOver = dragOverPath === node.path;

      if (node.type === 'folder') {
        return (
          <div
            key={node.path}
            className={`transition-colors ${isDragOver ? 'bg-blue-900/50 border border-blue-500 rounded' : ''}`}
            onDragOver={(e) => handleDragOver(e, node.path)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node.path)}
          >
            <div
              className="flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer group"
              onClick={() => toggleExpand(node.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, type: 'folder' });
              }}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              draggable
              onDragStart={(e) => handleDragStart(e, node)}
            >
              <span className="text-yellow-500 mr-1">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <Folder size={14} className="text-yellow-500 mr-1" />
              {renaming === node.path ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(node.path)}
                  onBlur={() => handleRename(node.path)}
                  className="bg-gray-700 text-white px-1 rounded text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="text-white text-sm">{node.name}</span>
              )}
              <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewItemParentPath(node.path);
                    setNewItemType('file');
                    setNewItemName('');
                    setShowNewDialog(true);
                  }}
                  className="text-gray-400 hover:text-white"
                  title="New File"
                >
                  <FilePlus size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewItemParentPath(node.path);
                    setNewItemType('folder');
                    setNewItemName('');
                    setShowNewDialog(true);
                  }}
                  className="text-gray-400 hover:text-white"
                  title="New Folder"
                >
                  <FolderPlus size={12} />
                </button>
              </div>
            </div>
            {isExpanded && node.children && renderTree(node.children, level + 1)}
          </div>
        );
      }

      return (
        <div
          key={node.path}
          data-file-path={node.path}
          className={`flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer transition-colors ${
            isCurrent ? 'bg-gray-700' : ''
          } ${isDragOver ? 'bg-blue-900/50 border border-blue-500 rounded' : ''}`}
          onClick={() => onFileSelect(node.path, node.content || '', node.language || 'plaintext')}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, type: 'file' });
          }}
          style={{ paddingLeft: `${level * 16 + 24}px` }}
          draggable
          onDragStart={(e) => handleDragStart(e, node)}
          onDragOver={(e) => handleDragOver(e, node.path)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.path)}
        >
          <Code size={14} className="text-blue-400 mr-1" />
          {renaming === node.path ? (
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename(node.path)}
              onBlur={() => handleRename(node.path)}
              className="bg-gray-700 text-white px-1 rounded text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-white text-sm">{node.name}</span>
          )}
        </div>
      );
    });
  };

  const createNewItem = () => {
    if (!newItemName.trim()) return;
    if (newItemType === 'file') {
      onCreateFile(newItemParentPath, newItemName);
    } else {
      onCreateFolder(newItemParentPath, newItemName);
    }
    setShowNewDialog(false);
    setNewItemName('');
  };

  return (
    <>
      {/* Main container with fixed width and full height */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col h-full overflow-hidden">
        
        {/* SINGLE SCROLLABLE CONTAINER for ALL content */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#4B5563 #1F2937'
          }}
        >
          {/* ALL CONTENT inside scrollable area */}
          <div className="flex flex-col">
            
            {/* 1. Repository Header */}
            <div className="p-3 border-b border-gray-700 bg-gray-850">
              <div className="flex items-center justify-between mb-2">
                <span className="text-blue-400 text-xs font-medium">Task {currentTaskIndex + 1}</span>
                {currentRepo && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleRefreshRepo}
                      disabled={isRefreshing}
                      className="text-gray-500 hover:text-green-400 transition-colors p-1"
                      title="Refresh repository"
                    >
                      <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={handleClearRepo}
                      className="text-gray-500 hover:text-gray-400 p-1"
                      title="Clear loaded repository"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
              
              {currentRepo ? (
                <div className="flex items-center gap-2 bg-green-900/20 p-2 rounded border border-green-700/50">
                  <Github size={12} className="text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-green-400 text-xs font-medium truncate block">
                      {currentRepo.owner}/{currentRepo.repo}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {Object.keys(currentRepo.files).length} files
                    </span>
                  </div>
                  {isRefreshing && <span className="text-yellow-400 text-xs whitespace-nowrap">Syncing...</span>}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-700/50 p-2 rounded">
                  <Github size={12} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500 text-xs">No repository loaded</span>
                </div>
              )}
            </div>

            {/* 2. GitHub Instructions - NOW SHOWS ACTUAL BRANCH NAME */}
            {currentRepo && (
              <div className="p-3 border-b border-blue-700/30 bg-blue-900/20">
                <div className="bg-blue-950/50 rounded p-3 border border-blue-700/40">
                  <h3 className="text-blue-300 text-xs font-semibold mb-2 flex items-center gap-2">
                    <Github size={12} />
                    GitHub Repository Ready
                  </h3>
                  <div className="space-y-2 text-xs text-blue-200">
                    <p>
                      <span className="text-gray-400">Repository:</span>
                      <br />
                      <code className="bg-gray-700 px-2 py-1 rounded text-blue-300 block mt-1 truncate">
                        {currentRepo.repoUrl}
                      </code>
                    </p>
                    <p>
                      <span className="text-gray-400">Branch to use:</span>
                      <br />
                      <code className="bg-gray-700 px-2 py-1 rounded text-green-300 block mt-1">
                        {currentRepo.branchName || githubRepo?.branchName || 'main'}
                      </code>
                    </p>
                    <div className="pt-2 border-t border-blue-700/30 mt-2">
                      <p className="text-blue-300 font-semibold mb-1">📧 Next Steps:</p>
                      <ul className="space-y-1 text-blue-200 text-xs">
                        <li>✓ Check your email for the GitHub invitation</li>
                        <li>✓ Accept the invitation to access this repository</li>
                        <li>✓ Clone and work on the <code className="bg-gray-700 px-1 rounded text-green-300">{currentRepo.branchName || githubRepo?.branchName || 'main'}</code> branch</li>
                        <li>✓ Commit and push your work to this branch</li>
                        <li>✓ Create a Pull Request to merge into main when ready</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            
              {/* 3. GitHub Repository Loader Section */}
            {/* {onLoadFromGitHub && (
              <div className="p-3 border-b border-gray-700 bg-gray-850">
                <div className="flex items-center gap-2 mb-2">
                  <Github size={14} className="text-white" />
                  <span className="text-white text-xs font-semibold">Load for Task {currentTaskIndex + 1}</span>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()}
                    placeholder="https://github.com/owner/repo"
                    className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    disabled={isLoadingGitHub || isRefreshing}
                  />
                  <button
                    onClick={handleLoadRepo}
                    disabled={isLoadingGitHub || isRefreshing || !repoUrl.trim()}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isLoadingGitHub ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Download size={11} />
                        Load
                      </>
                    )}
                  </button>
                </div>
                
                {repoError && (
                  <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertCircle size={11} /> {repoError}
                  </p>
                )}
                
                <p className="text-gray-500 text-xs mt-2">
                  This repository will be saved for Task {currentTaskIndex + 1}
                </p>
              </div>
            )}  */}

            {/* 4. Explorer Header & File Tree */}
            <div className="flex flex-col">
              {/* Explorer Header */}
              <div className="p-3 border-b border-gray-700 flex justify-between items-center">
                <span className="text-white text-sm font-semibold flex items-center gap-2">
                  <Folder size={14} />
                  EXPLORER
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setNewItemParentPath('');
                      setNewItemType('file');
                      setNewItemName('');
                      setShowNewDialog(true);
                    }}
                    className="text-gray-400 hover:text-white p-1"
                    title="New File"
                  >
                    <FilePlus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setNewItemParentPath('');
                      setNewItemType('folder');
                      setNewItemName('');
                      setShowNewDialog(true);
                    }}
                    className="text-gray-400 hover:text-white p-1"
                    title="New Folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                  <button onClick={onRefresh} className="text-gray-400 hover:text-white p-1" title="Refresh">
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="p-2 border-b border-gray-700">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files…"
                    className="w-full bg-gray-700 text-white text-xs pl-7 pr-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* File Tree */}
              <div className="py-1">
                {renderTree(files)}
                {files.length === 0 && currentRepo && (
                  <div className="p-3 text-xs">
                    <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 text-left">
                      <p className="text-green-400 font-semibold flex items-center gap-1.5 mb-1.5">
                        <Github size={13} /> Repository created successfully
                      </p>
                      <p className="text-gray-300 leading-relaxed">
                        Your simulation repository has been created successfully. The repository is{' '}
                        <span className="text-green-300 font-medium">empty</span> and ready for you to begin
                        your work. You will create the first files and commits during the simulation.
                      </p>
                      <p className="text-gray-500 mt-2 flex items-center gap-1">
                        Use the <FilePlus size={12} className="inline text-gray-400" /> /{' '}
                        <FolderPlus size={12} className="inline text-gray-400" /> buttons above to create your first file.
                      </p>
                    </div>
                  </div>
                )}
                {files.length === 0 && !currentRepo && (
                  <div className="text-center text-gray-500 text-xs p-4">
                    <Github size={24} className="mx-auto mb-2 opacity-40" />
                    <p>Load a repository to see files</p>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-700 rounded shadow-lg z-50 py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              setNewItemParentPath(
                contextMenu.type === 'folder'
                  ? contextMenu.path
                  : contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/'))
              );
              setNewItemType('file');
              setNewItemName('');
              setShowNewDialog(true);
              setContextMenu(null);
            }}
          >
            <FilePlus size={14} /> New File
          </button>
          <button
            className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              setNewItemParentPath(
                contextMenu.type === 'folder'
                  ? contextMenu.path
                  : contextMenu.path.substring(0, contextMenu.path.lastIndexOf('/'))
              );
              setNewItemType('folder');
              setNewItemName('');
              setShowNewDialog(true);
              setContextMenu(null);
            }}
          >
            <FolderPlus size={14} /> New Folder
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2" onClick={handleCopy}>
            <Copy size={14} /> Copy
          </button>
          <button className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2" onClick={handleCut}>
            <Scissors size={14} /> Cut
          </button>
          <button className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2" onClick={handlePaste}>
            <Clipboard size={14} /> Paste
          </button>
          <div className="border-t border-gray-700 my-1" />
          <button
            className="w-full px-4 py-1.5 text-left text-white text-sm hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              setRenaming(contextMenu.path);
              setNewName(contextMenu.path.split('/').pop() || '');
              setContextMenu(null);
            }}
          >
            <Edit3 size={14} /> Rename
          </button>
          <button
            className="w-full px-4 py-1.5 text-left text-red-400 text-sm hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              onDeleteFile(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* New Item Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">
              New {newItemType === 'file' ? 'File' : 'Folder'}
            </h2>
            <input
              autoFocus
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={newItemType === 'file' ? 'filename.js' : 'folder-name'}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && createNewItem()}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowNewDialog(false)}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createNewItem}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FileExplorer;