// GitHubTaskPanel.tsx
import React, { useState, useEffect } from 'react';
import GitHubPanel from './GitHubPanel';
import { ChevronDown, ChevronRight, Github } from 'lucide-react';

interface GitHubTaskPanelProps {
  repoUrl?: string;
  cloneUrl?: string;
  branchName?: string;
  simulationId?: string;
  taskIndex?: number;
  taskTitle?: string;
  candidateGitHubUsername?: string;
  onRepoAnalyzed?: (data: any) => void;
  className?: string;
}

const GitHubTaskPanel: React.FC<GitHubTaskPanelProps> = ({
  repoUrl,
  cloneUrl,
  branchName,
  simulationId,
  taskIndex,
  taskTitle,
  candidateGitHubUsername,
  onRepoAnalyzed,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(true);
  const [localRepoUrl, setLocalRepoUrl] = useState(repoUrl || '');
  const [isAutoLoading, setIsAutoLoading] = useState(!!repoUrl);

  // Auto-load repo when repoUrl is provided (from session)
  useEffect(() => {
    if (repoUrl && isAutoLoading) {
      console.log('🐙 [GitHubTaskPanel] Auto-loading repo from session:', repoUrl);
      setLocalRepoUrl(repoUrl);
      setIsAutoLoading(false);
    }
  }, [repoUrl]);

  if (!repoUrl && !localRepoUrl) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-gray-850 cursor-pointer hover:bg-gray-750 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <Github size={14} className="text-white" />
            <span className="text-white text-xs font-semibold">GitHub Repository</span>
            {taskTitle && (
              <span className="text-gray-400 text-xs">— {taskTitle}</span>
            )}
          </div>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
        
        {expanded && (
          <div className="p-3">
            <label className="text-gray-400 text-xs block mb-1">Repository URL</label>
            <input
              type="url"
              value={localRepoUrl}
              onChange={(e) => setLocalRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-gray-500 text-xs mt-2">
              Enter a GitHub repository URL to analyze code quality, commits, PRs, and more.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div 
        className="flex items-center justify-between px-3 py-2 bg-gray-850 cursor-pointer hover:bg-gray-750 transition-colors rounded-t-lg"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Github size={14} className="text-white" />
          <span className="text-white text-xs font-semibold">GitHub Repository</span>
          {taskTitle && (
            <span className="text-gray-400 text-xs">— {taskTitle}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {localRepoUrl && (
            <span className="text-green-400 text-xs flex items-center gap-1">
              <div className="h-1.5 w-1.5 bg-green-400 rounded-full" />
              Connected
            </span>
          )}
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </div>
      
      {expanded && (
        <GitHubPanel
          repoUrl={localRepoUrl || repoUrl}
          simulationId={simulationId}
          taskIndex={taskIndex}
          githubUsername={candidateGitHubUsername}
          onRepoAnalyzed={onRepoAnalyzed}
          className="rounded-t-none rounded-b-lg"
        />
      )}
    </div>
  );
};

export default GitHubTaskPanel;