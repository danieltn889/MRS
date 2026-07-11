// components/SimulationExecutor/GitHubPanel.tsx - WITH COLLAPSIBLE SECTIONS
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useGitHubRepo } from './context/GitHubRepoContext';
import {
  Github, GitCommit, GitPullRequest, Star, GitFork,
  Eye, Code, FileText, Folder, ChevronRight, ChevronDown,
  Activity, AlertCircle, CheckCircle, XCircle, Clock,
  Users, Globe, Lock, BarChart3, TrendingUp, Layers,
  RefreshCw, ExternalLink, Search, Filter, X,
  Zap, Shield, Package, Milestone, Rocket, Hash,
  ArrowUpRight, ArrowDownRight, Minus, ChevronUp,
  MessageCircle, Calendar, User, GitBranch
} from 'lucide-react';
import githubAPI from '../../services/githubAPI';

// ============================================
// TYPES
// ============================================

interface GitHubPanelProps {
  repoUrl?: string;
  simulationId?: string;
  taskIndex?: number;
  githubUsername?: string;
  onRepoAnalyzed?: (data: any) => void;
  className?: string;
}

type TabId = 'overview'| 'commits'| 'prs'| 'issues'| 'stats'| 'actions';

// ============================================
// HELPERS
// ============================================

const fmtNum = (n?: number) => {
  if (n === undefined || n === null) return ' ';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const fmtDate = (d?: string) => {
  if (!d) return ' ';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'});
};

const fmtRelative = (d?: string) => {
  if (!d) return ' ';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

// ============================================
// STAT CARD COMPONENT
// ============================================

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; sub?: string }> = ({ 
  icon, label, value, sub 
}) => (
  <div className="bg-gray-750 border border-gray-600 rounded-lg p-3 flex flex-col gap-1 hover:border-gray-500 transition-colors">
    <div className="flex items-center justify-between">
      <span className="text-gray-400 text-xs flex items-center gap-1.5">{icon}{label}</span>
    </div>
    <div className="text-white font-bold text-lg leading-tight">{value}</div>
    {sub && <div className="text-gray-500 text-xs">{sub}</div>}
  </div>
);

// ============================================
// COLLAPSIBLE SECTION COMPONENT
// ============================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  badge,
  badgeColor = 'text-green-400',
  defaultExpanded = false,
  children
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <div className="bg-gray-750 rounded-lg overflow-hidden border border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-2 flex items-center justify-between hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-gray-300 text-xs font-medium">{title}</span>
          {badge && (
            <span className={`text-[9px] ${badgeColor}`}>{badge}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
      </button>
      
      {expanded && (
        <div className="border-t border-gray-700 divide-y divide-gray-700">
          {children}
        </div>
      )}
    </div>
  );
};

// ============================================
// COMMIT LIST COMPONENT - WITH FULL DETAILS
// ============================================

const CommitList: React.FC<{ commits: any[] }> = ({ commits }) => {
  if (!commits || commits.length === 0) {
    return (
      <div className="text-center text-gray-500 text-xs py-4">
        No commits found
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
      {commits.map((c, i) => {
        const message = c.commit?.message || c.message || 'No message';
        
        let authorName = 'Unknown';
        if (c.author?.login) authorName = c.author.login;
        else if (c.commit?.author?.name) authorName = c.commit.author.name;
        else if (c.author?.name) authorName = c.author.name;
        else if (c.committer?.login) authorName = c.committer.login;
        else if (typeof c.author === 'string') authorName = c.author;
        
        let date = null;
        if (c.commit?.author?.date) date = c.commit.author.date;
        else if (c.author?.date) date = c.author.date;
        else if (c.date) date = c.date;
        else if (c.created_at) date = c.created_at;
        
        const sha = c.sha || c.commit_id || c.id || '';
        const shortSha = sha.substring(0, 7);
        
        return (
          <div key={i} className="py-2.5 px-3 hover:bg-gray-800/50">
            <div className="flex items-start gap-2">
              <GitCommit size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-gray-300 text-xs font-medium whitespace-pre-wrap break-words flex-1">{message}</p>
                  {shortSha && (
                    <code className="text-gray-500 text-[9px] font-mono">{shortSha}</code>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                  <span className="flex items-center gap-0.5">
                    <User size={7} /> {authorName}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Calendar size={7} /> {date ? fmtRelative(date) : 'Date unknown'}
                  </span>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300">
                      <ExternalLink size={7} /> Open
                    </a>
                  )}
                </div>
                {c.stats && (
                  <div className="flex gap-2 mt-1 text-[8px]">
                    <span className="text-green-400">+{c.stats.additions || 0}</span>
                    <span className="text-red-400">-{c.stats.deletions || 0}</span>
                    <span className="text-gray-500">{c.stats.total || 0} changes</span>
                  </div>
                )}
                {c.files && c.files.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {c.files.slice(0, 5).map((file: any, fidx: number) => (
                      <span key={fidx} className="flex items-center justify-between gap-2 text-[7px] text-gray-500 bg-gray-800 px-1 rounded">
                        <span className="truncate">{file.filename}</span>
                        <span className="flex-shrink-0">
                          {file.status} <span className="text-green-400">+{file.additions || 0}</span> <span className="text-red-400">-{file.deletions || 0}</span>
                        </span>
                      </span>
                    ))}
                    {c.files.length > 5 && (
                      <span className="text-[7px] text-gray-500">+{c.files.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// PULL REQUEST LIST COMPONENT - WITH FULL DETAILS
// ============================================

const PRList: React.FC<{ prs: any[] }> = ({ prs }) => {
  if (!prs || prs.length === 0) {
    return (
      <div className="text-center text-gray-500 text-xs py-4">
        No pull requests found
      </div>
    );
  }
  
  return (
    <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
      {prs.map((pr, i) => (
        <div key={i} className="py-2.5 px-3 hover:bg-gray-800/50">
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 flex-shrink-0 ${
              pr.state === 'open'? 'text-green-400': pr.merged_at ? 'text-purple-400': 'text-red-400'
            }`}>
              <GitPullRequest size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-gray-300 text-xs font-medium truncate flex-1">{pr.title}</p>
                <span className="text-gray-500 text-[9px]">#{pr.number}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                <span className="flex items-center gap-0.5">
                  <User size={7} /> {pr.user?.login || 'unknown'}
                </span>
                <span className="flex items-center gap-0.5">
                  <Calendar size={7} /> {fmtRelative(pr.created_at)}
                </span>
                {pr.comments > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageCircle size={7} /> {pr.comments}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1 text-[7px]">
                <span className="text-gray-600">from</span>
                <code className="text-yellow-400 bg-gray-800 px-1 rounded">{pr.head?.ref}</code>
                <span className="text-gray-600">→</span>
                <code className="text-blue-400 bg-gray-800 px-1 rounded">{pr.base?.ref}</code>
              </div>
              {pr.merged_at && (
                <p className="text-purple-400 text-[8px] mt-1">✓ Merged {fmtRelative(pr.merged_at)}</p>
              )}
              {pr.state === 'closed'&& !pr.merged_at && pr.closed_at && (
                <p className="text-red-400/70 text-[8px] mt-1">✗ Closed {fmtRelative(pr.closed_at)}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================
// ISSUE LIST COMPONENT - WITH FULL DETAILS
// ============================================

const IssueList: React.FC<{ issues: any[] }> = ({ issues }) => {
  if (!issues || issues.length === 0) {
    return (
      <div className="text-center text-gray-500 text-xs py-4">
        No issues found
      </div>
    );
  }
  
  return (
    <div className="divide-y divide-gray-700 max-h-96 overflow-y-auto">
      {issues.map((issue, i) => (
        <div key={i} className="py-2.5 px-3 hover:bg-gray-800/50">
          <div className="flex items-start gap-2">
            {issue.state === 'open'? (
              <AlertCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />
            ) : (
              <CheckCircle size={13} className="text-green-400 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <p className="text-gray-300 text-xs font-medium truncate flex-1">{issue.title}</p>
                <span className="text-gray-500 text-[9px]">#{issue.number}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                <span className="flex items-center gap-0.5">
                  <User size={7} /> {issue.user?.login || 'unknown'}
                </span>
                <span className="flex items-center gap-0.5">
                  <Calendar size={7} /> {fmtRelative(issue.created_at)}
                </span>
                {issue.comments > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageCircle size={7} /> {issue.comments}
                  </span>
                )}
              </div>
              {issue.body && (
                <p className="text-gray-500 text-[8px] mt-1 line-clamp-2">{issue.body.substring(0, 100)}</p>
              )}
              {issue.labels && issue.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {issue.labels.slice(0, 3).map((label: any, lidx: number) => (
                    <span key={lidx} className="text-[6px] px-1 py-0.5 rounded-full" 
                          style={{ backgroundColor: `#${label.color}`, color: '#000'}}>
                      {label.name}
                    </span>
                  ))}
                </div>
              )}
              {issue.state === 'closed'&& issue.closed_at && (
                <p className="text-green-600/70 text-[7px] mt-1">✓ Closed {fmtRelative(issue.closed_at)}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================
// CONTRIBUTOR LIST COMPONENT
// ============================================

const ContributorList: React.FC<{ contributors: any[] }> = ({ contributors }) => {
  if (!contributors || contributors.length === 0) {
    return (
      <div className="text-center text-gray-500 text-xs py-4">
        No contributors found
      </div>
    );
  }
  
  return (
    <div className="divide-y divide-gray-700 max-h-64 overflow-y-auto">
      {contributors.map((c: any, i: number) => (
        <div key={i} className="p-2 hover:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(c.login || c.username)?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <p className="text-gray-300 text-xs font-medium">{c.login || c.username}</p>
                {c.type && <p className="text-gray-500 text-[8px]">{c.type}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-white text-xs font-bold">{c.contributions}</p>
              <p className="text-gray-500 text-[7px]">commits</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================
// SCORE RING COMPONENT
// ============================================

const ScoreRing: React.FC<{ score: number; label: string; size?: number }> = ({ score, label, size = 48 }) => {
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const fill = circ * (score / 100);
  const color = score >= 70 ? '#22c55e': score >= 40 ? '#eab308': '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#374151" strokeWidth="3.5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{score}</text>
      </svg>
      <span className="text-gray-400 text-xs text-center leading-tight">{label}</span>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const GitHubPanel: React.FC<GitHubPanelProps> = ({
  repoUrl: propRepoUrl,
  simulationId,
  taskIndex,
  githubUsername,
  onRepoAnalyzed,
  className = '',
}) => {
  const { currentRepo, loadRepositoryFromUrl, loadSessionGitHubRepo, isLoading: isRepoLoading, error: repoError } = useGitHubRepo();
  
  const [repoInput, setRepoInput] = useState(propRepoUrl || '');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  
  // Stats data
  const [fullStats, setFullStats] = useState<any>(null);
  const [actionsData, setActionsData] = useState<any>(null);
  const [participation, setParticipation] = useState<any>(null);
  const [punchCard, setPunchCard] = useState<any>(null);
  const [contributorStats, setContributorStats] = useState<any>(null);
  
  // Use ref to prevent multiple fetches
  const fetchInProgressRef = useRef(false);
  const lastFetchRef = useRef<string>('');

  // Fetch all statistics for the repository
  const fetchAllStats = useCallback(async (owner: string, repo: string) => {
    const fetchKey = `${owner}/${repo}`;
    
    if (fetchInProgressRef.current || lastFetchRef.current === fetchKey) {
      console.log('Skipping duplicate fetch for:', fetchKey);
      return;
    }
    
    fetchInProgressRef.current = true;
    setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching stats for:', owner, repo);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000);
      });
      
      const everythingPromise = githubAPI.getEverything(owner, repo, false, 50);
      const result = await Promise.race([everythingPromise, timeoutPromise]);
      
      if (result) {
        const statsData = (result as any)?.data || result;
        setFullStats(statsData);
        onRepoAnalyzed?.(statsData);
        lastFetchRef.current = fetchKey;
      }
      
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
      if (!err.message?.includes('timeout')) {
        setError(err?.message || 'Failed to fetch repository statistics');
      }
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
    }
  }, [onRepoAnalyzed]);

  // Handle manual refresh of current repository
  const handleRefresh = useCallback(async () => {
    if (!currentRepo) return;
    
    console.log('Manually refreshing stats for:', currentRepo.owner, currentRepo.repo);
    
    setFetchAttempted(false);
    setFullStats(null);
    setActionsData(null);
    setParticipation(null);
    setPunchCard(null);
    setContributorStats(null);
    lastFetchRef.current = '';
    fetchInProgressRef.current = false;
    
    await fetchAllStats(currentRepo.owner, currentRepo.repo);
  }, [currentRepo, fetchAllStats]);

  // Auto-load repo from session data
  useEffect(() => {
    if (propRepoUrl && !repoInput) {
      console.log('🐙 [GitHubPanel] Auto-loading repo from session:', propRepoUrl);
      setRepoInput(propRepoUrl);
      loadSessionGitHubRepo(propRepoUrl).catch((err) => {
        console.error(' Failed to auto-load session repo:', err);
      });
    }
  }, [propRepoUrl, loadSessionGitHubRepo]);

  useEffect(() => {
    if (currentRepo && currentRepo.owner && currentRepo.repo) {
      console.log(`''[GitHubPanel] Repo loaded: ${currentRepo.owner}/${currentRepo.repo}`);
      
      if (!fetchAttempted) {
        const repoKey = `${currentRepo.owner}/${currentRepo.repo}`;
        if (lastFetchRef.current !== repoKey) {
          setFetchAttempted(true);
          fetchAllStats(currentRepo.owner, currentRepo.repo);
        }
      }
    }
  }, [currentRepo, fetchAllStats, fetchAttempted]);

  useEffect(() => {
    setFetchAttempted(false);
    setFullStats(null);
  }, [currentRepo?.owner, currentRepo?.repo]);

  const handleLoadRepo = async () => {
    if (!repoInput.trim()) {
      setError('Please enter a GitHub repository URL');
      return;
    }
    setError(null);
    setFetchAttempted(false);
    await loadRepositoryFromUrl(repoInput);
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Github size={12} /> },
    { id: 'commits', label: 'Commits', icon: <GitCommit size={12} /> },
    { id: 'prs', label: 'PRs', icon: <GitPullRequest size={12} /> },
    { id: 'issues', label: 'Issues', icon: <AlertCircle size={12} /> },
    { id: 'stats', label: 'Stats', icon: <BarChart3 size={12} /> },
    { id: 'actions', label: 'CI/CD', icon: <Zap size={12} /> },
  ];

  const repo = fullStats?.repository;
  const commits = fullStats?.commits;
  const prs = fullStats?.pullRequests;
  const issues = fullStats?.issues;
  const contributors = fullStats?.contributors;
  const scores = fullStats?.scores;

  const isLoading = (isRepoLoading || loading) && !fullStats;

  return (
    <div className={`flex flex-col bg-gray-800 border border-gray-700 rounded-lg overflow-hidden h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-850 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Github size={14} className="text-white" />
          <span className="text-white text-xs font-semibold">GitHub Analytics</span>
          {currentRepo && (
            <span className="text-green-400 text-xs font-mono truncate max-w-[180px]">
              {currentRepo.owner}/{currentRepo.repo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {currentRepo && (
            <a
              href={`https://github.com/${currentRepo.owner}/${currentRepo.repo}`}
              target="_blank"
              rel="noreferrer"
              className="text-gray-400 hover:text-white"
            >
              <ExternalLink size={12} />
            </a>
          )}
          
          <button
            onClick={handleRefresh}
            disabled={isLoading || !currentRepo}
            className="text-gray-400 hover:text-white disabled:opacity-40"
            title="Refresh repository data"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin': ''} />
          </button>
          
          <button onClick={() => setCollapsed(v => !v)} className="text-gray-400 hover:text-white">
            {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {!propRepoUrl && !currentRepo && (
            <div className="px-3 py-2 border-b border-gray-700 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  value={repoInput}
                  onChange={e => setRepoInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter'&& handleLoadRepo()}
                  placeholder="https://github.com/owner/repo"
                  className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded px-2.5 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  disabled={isLoading}
                />
                <button
                  onClick={handleLoadRepo}
                  disabled={isLoading || !repoInput}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1"
                >
                  <Search size={11} />
                  Load
                </button>
              </div>
              {(error || repoError) && (
                <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={11} /> {error || repoError}
                </p>
              )}
            </div>
          )}

          {isLoading && !fullStats && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                <p className="text-gray-400 text-xs">Fetching repository data…</p>
              </div>
            </div>
          )}

          {!isLoading && !fullStats && !currentRepo && (
            <div className="flex-1 flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <Github size={32} className="mx-auto text-gray-600" />
                <p className="text-gray-500 text-xs">Enter a GitHub repo URL to analyze</p>
                <p className="text-gray-600 text-xs">Or load one from the File Explorer first</p>
              </div>
            </div>
          )}

          {currentRepo && !fullStats && isLoading && (
            <div className="flex-1 p-4">
              <div className="bg-gray-750 rounded-lg p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">{currentRepo.owner}/{currentRepo.repo}</p>
                <p className="text-gray-500 text-xs mt-2">Loading analytics...</p>
              </div>
            </div>
          )}

          {fullStats && (
            <>
              <div className="flex border-b border-gray-700 overflow-x-auto flex-shrink-0 bg-gray-850">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-400'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* OVERVIEW TAB */}
                {activeTab === 'overview'&& (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-white font-semibold text-sm">{repo?.fullName || `${currentRepo?.owner}/${currentRepo?.repo}`}</h3>
                      {repo?.description && <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{repo.description}</p>}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <StatCard icon={<GitCommit size={11} />} label="Commits" value={fmtNum(commits?.total)} />
                      <StatCard icon={<Users size={11} />} label="Contributors" value={fmtNum(contributors?.total)} />
                      <StatCard icon={<AlertCircle size={11} />} label="Open Issues" value={fmtNum(fullStats.social?.openIssues)} />
                    </div>

                    {scores && (
                      <div>
                        <p className="text-gray-400 text-xs font-medium mb-3">Quality Scores</p>
                        <div className="flex gap-4 flex-wrap">
                          <ScoreRing score={scores.overall ?? 0} label="Overall" size={52} />
                          <ScoreRing score={scores.documentation ?? 0} label="Docs" size={52} />
                          <ScoreRing score={scores.activity ?? 0} label="Activity" size={52} />
                          <ScoreRing score={scores.community ?? 0} label="Community" size={52} />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-700/50 rounded p-2">
                        <p className="text-gray-500">Created</p>
                        <p className="text-white">{fmtDate(repo?.createdAt)}</p>
                      </div>
                      <div className="bg-gray-700/50 rounded p-2">
                        <p className="text-gray-500">Last push</p>
                        <p className="text-white">{fmtRelative(repo?.pushedAt)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* COMMITS TAB - WITH COLLAPSIBLE SECTIONS */}
                {activeTab === 'commits'&& (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard icon={<GitCommit size={11} />} label="Total Commits" value={fmtNum(commits?.total)} />
                      <StatCard icon={<TrendingUp size={11} />} label="Per Week" value={commits?.averageCommitsPerWeek || ' '} />
                    </div>

                    {commits?.recentCommits?.length > 0 && (
                      <CollapsibleSection
                        title="Recent Commits"
                        icon={<GitCommit size={11} className="text-blue-400" />}
                        badge={`${commits.recentCommits.length} commits`}
                        defaultExpanded={true}
                      >
                        <CommitList commits={commits.recentCommits} />
                      </CollapsibleSection>
                    )}
                  </div>
                )}

                {/* PULL REQUESTS TAB - WITH COLLAPSIBLE SECTIONS */}
                {activeTab === 'prs'&& (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard icon={<GitPullRequest size={11} />} label="Total PRs" value={fmtNum(prs?.total)} />
                      <StatCard icon={<CheckCircle size={11} />} label="Merge Rate" value={prs?.mergeRate !== undefined ? `${prs.mergeRate}%` : ' '} />
                    </div>

                    {prs?.recentPRs?.length > 0 && (
                      <CollapsibleSection
                        title="Recent Pull Requests"
                        icon={<GitPullRequest size={11} className="text-purple-400" />}
                        badge={`${prs.recentPRs.length} PRs`}
                        defaultExpanded={true}
                      >
                        <PRList prs={prs.recentPRs} />
                      </CollapsibleSection>
                    )}
                  </div>
                )}

                {/* ISSUES TAB - WITH COLLAPSIBLE SECTIONS */}
                {activeTab === 'issues'&& (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard icon={<AlertCircle size={11} />} label="Total Issues" value={fmtNum(issues?.total)} />
                      <StatCard icon={<CheckCircle size={11} />} label="Closed Issues" value={fmtNum(issues?.closed)} />
                    </div>

                    {issues?.recentIssues?.length > 0 && (
                      <CollapsibleSection
                        title="Recent Issues"
                        icon={<AlertCircle size={11} className="text-orange-400" />}
                        badge={`${issues.recentIssues.length} issues`}
                        defaultExpanded={true}
                      >
                        <IssueList issues={issues.recentIssues} />
                      </CollapsibleSection>
                    )}
                  </div>
                )}

                {/* STATS TAB - WITH COLLAPSIBLE SECTIONS */}
                {activeTab === 'stats'&& (
                  <div className="space-y-3">
                    {contributors?.topContributors?.length > 0 && (
                      <CollapsibleSection
                        title="Top Contributors"
                        icon={<Users size={11} className="text-green-400" />}
                        badge={`${contributors.topContributors.length} people`}
                        defaultExpanded={true}
                      >
                        <ContributorList contributors={contributors.topContributors} />
                      </CollapsibleSection>
                    )}

                    {currentRepo && (
                      <CollapsibleSection
                        title="Repository Files"
                        icon={<Folder size={11} className="text-blue-400" />}
                        badge={`${Object.keys(currentRepo.files).length} files`}
                        defaultExpanded={false}
                      >
                        <div className="p-3 space-y-1">
                          <p className="text-white text-sm">{Object.keys(currentRepo.files).length} files</p>
                          <p className="text-gray-500 text-xs">
                            {currentRepo.fileStructure.filter((f: any) => f.type === 'folder').length} folders
                          </p>
                          <div className="mt-2 max-h-32 overflow-y-auto">
                            {Object.keys(currentRepo.files).slice(0, 10).map((file, idx) => (
                              <div key={idx} className="text-gray-400 text-[10px] py-0.5 truncate">
                                📄 {file}
                              </div>
                            ))}
                            {Object.keys(currentRepo.files).length > 10 && (
                              <p className="text-gray-500 text-[9px] mt-1">+{Object.keys(currentRepo.files).length - 10} more files</p>
                            )}
                          </div>
                        </div>
                      </CollapsibleSection>
                    )}

                    {scores && (
                      <div>
                        <p className="text-gray-400 text-xs font-medium mb-2">Quality Scores</p>
                        <div className="grid grid-cols-2 gap-3">
                          <ScoreRing score={scores.overall ?? 0} label="Overall" size={60} />
                          <ScoreRing score={scores.documentation ?? 0} label="Documentation" size={60} />
                          <ScoreRing score={scores.activity ?? 0} label="Activity" size={60} />
                          <ScoreRing score={scores.community ?? 0} label="Community" size={60} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ACTIONS TAB */}
                {activeTab === 'actions'&& (
                  <div className="text-center py-8">
                    <Zap size={32} className="mx-auto text-gray-600 mb-2" />
                    <p className="text-gray-500 text-sm">GitHub Actions data not available</p>
                    <p className="text-gray-600 text-xs mt-1">This feature will be available soon</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default GitHubPanel;
