// components/SimulationExecutor/GitHubRepoLoader.tsx
import React, { useState } from 'react';
import { Github, Download, Loader2, AlertCircle } from 'lucide-react';

interface GitHubRepoLoaderProps {
  onLoadRepo: (owner: string, repo: string) => Promise<void>;
  isLoading: boolean;
}

const GitHubRepoLoader: React.FC<GitHubRepoLoaderProps> = ({ onLoadRepo, isLoading }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  };

  const handleLoad = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      setError('Invalid GitHub URL. Use: https://github.com/owner/repo');
      return;
    }

    setError('');
    await onLoadRepo(parsed.owner, parsed.repo);
  };

  return (
    <div className="p-3 border-b border-gray-700 bg-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <Github size={14} className="text-white" />
        <span className="text-white text-xs font-semibold">Load from GitHub Repository</span>
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          placeholder="https://github.com/owner/repo"
          className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          disabled={isLoading}
        />
        <button
          onClick={handleLoad}
          disabled={isLoading || !repoUrl.trim()}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          {isLoading ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Download size={11} />
              Load Repo
            </>
          )}
        </button>
      </div>
      
      {error && (
        <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}
      
      <p className="text-gray-500 text-xs mt-2">
        Enter a GitHub repository URL to load its files into the workspace.
      </p>
    </div>
  );
};

export default GitHubRepoLoader;