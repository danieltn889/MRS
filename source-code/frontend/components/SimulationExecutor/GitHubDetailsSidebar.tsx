// SimulationExecutor/GitHubDetailsSidebar.tsx - WITH EXPANDABLE SECTIONS SHOWING FULL DETAILS
import React, { useState } from 'react';
import { 
  Github, 
  X, 
  RefreshCw, 
  GitBranch,
  Star,
  GitFork,
  Users,
  AlertCircle,
  GitPullRequest,
  GitCommit,
  Activity,
  Code,
  Eye,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  ExternalLink
} from 'lucide-react';

// Define the sync status type - MUST match parent
export type SyncStatus = 'idle'| 'syncing'| 'success'| 'error';

interface GitHubDetailsSidebarProps {
  currentRepo: any;
  stats: any;
  fileCount: number;
  folderCount: number;
  qualityScore: number;
  displayMessage: string;
  isSyncing: boolean;
  syncStatusTyped: SyncStatus;
  githubPushStatus: SyncStatus;
  onClose: () => void;
  onRefresh: () => void;
}

export const GitHubDetailsSidebar: React.FC<GitHubDetailsSidebarProps> = ({
  currentRepo,
  stats,
  fileCount,
  folderCount,
  qualityScore,
  displayMessage,
  isSyncing,
  syncStatusTyped,
  githubPushStatus,
  onClose,
  onRefresh,
}) => {
  // Start with every section collapsed   expand on demand (click) only.
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  // Extract all stats
  const starCount = stats?.social?.stars || 0;
  const forkCount = stats?.social?.forks || 0;
  const watcherCount = stats?.social?.watchers || 0;
  
  const commitCount = stats?.commits?.total || 0;
  const avgCommitsPerWeek = stats?.commits?.averageCommitsPerWeek || 0;
  
  const totalIssues = stats?.issues?.total || 0;
  const openIssues = stats?.issues?.open || 0;
  const closedIssues = stats?.issues?.closed || 0;
  const issueResolutionRate = totalIssues > 0 ? Math.round((closedIssues / totalIssues) * 100) : 0;
  const avgResolutionTime = stats?.issues?.averageResolutionTimeHours || 0;
  
  const totalPRs = stats?.pullRequests?.total || 0;
  const mergedPRs = stats?.pullRequests?.merged || 0;
  const openPRs = stats?.pullRequests?.open || 0;
  const closedPRs = stats?.pullRequests?.closed || 0;
  const mergeRate = stats?.pullRequests?.mergeRate || (totalPRs > 0 ? Math.round((mergedPRs / totalPRs) * 100) : 0);
  const avgTimeToMerge = stats?.pullRequests?.averageTimeToMergeHours || 0;
  
  const contributorCount = stats?.contributors?.total || 1;
  const languages = stats?.languages?.breakdown || [];
  const primaryLanguage = stats?.languages?.primary || '';
  
  const recentIssues = stats?.issues?.recentIssues || [];
  const recentPRs = stats?.pullRequests?.recentPRs || [];
  const recentCommits = stats?.commits?.recentCommits || [];
  const topContributors = stats?.contributors?.topContributors || [];

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="w-96 h-full bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
      {/* Status Message Bar */}
      {displayMessage && (
        <div className={`p-3 border-b flex items-start gap-2 text-xs flex-shrink-0 ${
          syncStatusTyped === 'syncing'? 'bg-yellow-900/20 border-yellow-700/30 text-yellow-300':
          syncStatusTyped === 'success'? 'bg-green-900/20 border-green-700/30 text-green-300':
          syncStatusTyped === 'error'? 'bg-red-900/20 border-red-700/30 text-red-300':
          'bg-gray-700/50 border-gray-600/30 text-gray-300'
        }`}>
          {isSyncing && <div className="animate-spin rounded-full h-3 w-3 border-b border-current flex-shrink-0 mt-0.5" />}
          <span className="flex-1">{displayMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-gray-700 bg-gray-850 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github size={14} className="text-white" />
            <span className="text-white text-xs font-semibold">GitHub Analytics</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-400">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {!currentRepo ? (
          <div className="text-center py-8">
            <Github size={32} className="mx-auto text-gray-600 mb-2" />
            <p className="text-gray-500 text-xs">No repository loaded</p>
            <p className="text-gray-600 text-xs mt-1">Load a GitHub repo from the File Explorer</p>
          </div>
        ) : (
          <>
            {/* REPOSITORY HEADER WITH REFRESH BUTTON */}
            <div className="bg-gradient-to-r from-gray-750 to-gray-800 rounded-lg p-3 border border-gray-700">
              <p className="text-green-400 text-xs font-mono truncate flex items-center gap-1">
                <Github size={12} />
                {currentRepo.owner}/{currentRepo.repo}
              </p>
              {currentRepo.branchName && (
                <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                  <GitBranch size={10} />
                  {currentRepo.branchName}
                </p>
              )}
              <p className="text-gray-500 text-xs mt-1">
                 {fileCount} files · 📂 {folderCount} folders
              </p>
              
              {/* REFRESH BUTTON */}
              <button
                onClick={onRefresh}
                disabled={githubPushStatus === 'syncing'}
                className="w-full mt-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2 bg-gray-800/50 hover:bg-gray-700"
              >
                <RefreshCw size={11} className={githubPushStatus === 'syncing'? 'animate-spin': ''} />
                {githubPushStatus === 'syncing'? 'Refreshing...': 'Refresh All Stats'}
              </button>
            </div>

            {/* Social engagement (Stars/Forks/Watchers) removed   not relevant to candidate code review. */}

            {/* ===== ISSUES SECTION - EXPANDABLE WITH FULL DETAILS ===== */}
            <div className="bg-gray-750 rounded-lg overflow-hidden border border-gray-700">
              <button
                onClick={() => toggleSection('issues')}
                className="w-full p-2 flex items-center justify-between hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={12} className="text-orange-400" />
                  <span className="text-gray-300 text-xs font-medium">Issues</span>
                  <span className="text-gray-500 text-[10px]">({openIssues} open / {closedIssues} closed)</span>
                  <span className="text-green-400 text-[9px]">{issueResolutionRate}% resolved</span>
                </div>
                {expandedSection === 'issues'? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              {expandedSection === 'issues'&& (
                <div className="border-t border-gray-700 divide-y divide-gray-700 max-h-96 overflow-y-auto">
                  {recentIssues.length > 0 ? (
                    recentIssues.slice(0, 15).map((issue: any, idx: number) => (
                      <div key={idx} className="p-2 hover:bg-gray-800/50">
                        <div className="flex items-start gap-2">
                          {issue.state === 'open'? (
                            <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <CheckCircle size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-gray-300 text-xs font-medium truncate flex-1">{issue.title}</span>
                              <span className="text-gray-500 text-[9px]">#{issue.number}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                              <span className="flex items-center gap-0.5">
                                <User size={8} /> {issue.user?.login || 'unknown'}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Calendar size={8} /> {new Date(issue.created_at).toLocaleDateString()}
                              </span>
                              {issue.comments > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <MessageCircle size={8} /> {issue.comments}
                                </span>
                              )}
                            </div>
                            {issue.body && (
                              <p className="text-gray-500 text-[9px] mt-1 line-clamp-2">{issue.body.substring(0, 150)}</p>
                            )}
                            {issue.labels && issue.labels.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {issue.labels.slice(0, 3).map((label: any, lidx: number) => (
                                  <span key={lidx} className="text-[7px] px-1 py-0.5 rounded-full" 
                                        style={{ backgroundColor: `#${label.color}`, color: '#000'}}>
                                    {label.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {issue.state === 'closed'&& issue.closed_at && (
                              <p className="text-green-600/70 text-[8px] mt-1">✓ Closed {new Date(issue.closed_at).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-500 text-[10px]">No issues found</div>
                  )}
                </div>
              )}
            </div>

            {/* ===== PULL REQUESTS SECTION - EXPANDABLE WITH FULL DETAILS ===== */}
            <div className="bg-gray-750 rounded-lg overflow-hidden border border-gray-700">
              <button
                onClick={() => toggleSection('prs')}
                className="w-full p-2 flex items-center justify-between hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GitPullRequest size={12} className="text-purple-400" />
                  <span className="text-gray-300 text-xs font-medium">Pull Requests</span>
                  <span className="text-gray-500 text-[10px]">({openPRs} open / {mergedPRs} merged / {closedPRs} closed)</span>
                  <span className="text-purple-400 text-[9px]">{mergeRate}% merged</span>
                </div>
                {expandedSection === 'prs'? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              {expandedSection === 'prs'&& (
                <div className="border-t border-gray-700 divide-y divide-gray-700 max-h-96 overflow-y-auto">
                  {recentPRs.length > 0 ? (
                    recentPRs.slice(0, 15).map((pr: any, idx: number) => (
                      <div key={idx} className="p-2 hover:bg-gray-800/50">
                        <div className="flex items-start gap-2">
                          {pr.merged_at ? (
                            <GitPullRequest size={12} className="text-purple-400 mt-0.5 flex-shrink-0" />
                          ) : pr.state === 'closed'? (
                            <XCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <GitPullRequest size={12} className="text-green-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-gray-300 text-xs font-medium truncate flex-1">{pr.title}</span>
                              <span className="text-gray-500 text-[9px]">#{pr.number}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[9px] text-gray-500">
                              <span className="flex items-center gap-0.5">
                                <User size={8} /> {pr.user?.login || 'unknown'}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <Calendar size={8} /> {new Date(pr.created_at).toLocaleDateString()}
                              </span>
                              {pr.comments > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <MessageCircle size={8} /> {pr.comments}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[8px]">
                              <span className="text-gray-600">from</span>
                              <code className="text-yellow-400 bg-gray-900 px-1 rounded">{pr.head?.ref}</code>
                              <span className="text-gray-600">→</span>
                              <code className="text-blue-400 bg-gray-900 px-1 rounded">{pr.base?.ref}</code>
                            </div>
                            {pr.merged_at && (
                              <p className="text-purple-400 text-[8px] mt-1">✓ Merged {new Date(pr.merged_at).toLocaleDateString()}</p>
                            )}
                            {pr.state === 'closed'&& !pr.merged_at && pr.closed_at && (
                              <p className="text-red-400/70 text-[8px] mt-1">✗ Closed {new Date(pr.closed_at).toLocaleDateString()}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-500 text-[10px]">No pull requests found</div>
                  )}
                </div>
              )}
            </div>

            {/* ===== COMMITS SECTION - EXPANDABLE WITH FULL DETAILS ===== */}
            <div className="bg-gray-750 rounded-lg overflow-hidden border border-gray-700">
              <button
                onClick={() => toggleSection('commits')}
                className="w-full p-2 flex items-center justify-between hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GitCommit size={12} className="text-blue-400" />
                  <span className="text-gray-300 text-xs font-medium">Commits</span>
                  <span className="text-gray-500 text-[10px]">({commitCount.toLocaleString()} total)</span>
                  {avgCommitsPerWeek > 0 && (
                    <span className="text-blue-400 text-[9px]">{avgCommitsPerWeek.toFixed(1)}/week avg</span>
                  )}
                </div>
                {expandedSection === 'commits'? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              {expandedSection === 'commits'&& (
                <div className="border-t border-gray-700 divide-y divide-gray-700 max-h-96 overflow-y-auto">
                  {recentCommits.length > 0 ? (
                    recentCommits.slice(0, 20).map((commit: any, idx: number) => (
                      <div key={idx} className="p-2 hover:bg-gray-800/50">
                        <div className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <code className="text-gray-400 text-[9px] font-mono">{commit.sha?.substring(0, 7)}</code>
                              <span className="text-gray-500 text-[8px] flex items-center gap-0.5">
                                <Calendar size={7} /> {new Date(commit.date || commit.commit?.author?.date).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-gray-300 text-[10px] mt-0.5 whitespace-pre-wrap break-words">{commit.message}</p>
                            <div className="flex items-center gap-2 mt-1 text-[8px] text-gray-500">
                              <span className="flex items-center gap-0.5">
                                <User size={7} /> {commit.author || commit.commit?.author?.name || commit.committer?.login || 'unknown'}
                              </span>
                              {commit.url && (
                                <a href={commit.url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300">
                                  <ExternalLink size={7} /> Open
                                </a>
                              )}
                              {commit.files && (
                                <span>📄 {commit.files.length} files changed</span>
                              )}
                            </div>
                            {commit.stats && (
                              <div className="flex gap-2 mt-1 text-[8px]">
                                <span className="text-green-400">+{commit.stats.additions || 0}</span>
                                <span className="text-red-400">-{commit.stats.deletions || 0}</span>
                                <span className="text-gray-500">{commit.stats.total || 0} changes</span>
                              </div>
                            )}
                            {commit.files && commit.files.length > 0 && (
                              <div className="space-y-1 mt-1">
                                {commit.files.slice(0, 5).map((file: any, fidx: number) => (
                                  <span key={fidx} className="flex items-center justify-between gap-2 text-[7px] text-gray-500 bg-gray-800 px-1 rounded">
                                    <span className="truncate">{file.filename}</span>
                                    <span className="flex-shrink-0">
                                      {file.status} <span className="text-green-400">+{file.additions || 0}</span> <span className="text-red-400">-{file.deletions || 0}</span>
                                    </span>
                                  </span>
                                ))}
                                {commit.files.length > 5 && (
                                  <span className="text-[7px] text-gray-500">+{commit.files.length - 5} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-500 text-[10px]">No commits found</div>
                  )}
                </div>
              )}
            </div>

            {/* ===== CONTRIBUTORS SECTION - EXPANDABLE WITH DETAILS ===== */}
            <div className="bg-gray-750 rounded-lg overflow-hidden border border-gray-700">
              <button
                onClick={() => toggleSection('contributors')}
                className="w-full p-2 flex items-center justify-between hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users size={12} className="text-green-400" />
                  <span className="text-gray-300 text-xs font-medium">Contributors</span>
                  <span className="text-gray-500 text-[10px]">({contributorCount} people)</span>
                </div>
                {expandedSection === 'contributors'? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              {expandedSection === 'contributors'&& (
                <div className="border-t border-gray-700 divide-y divide-gray-700 max-h-64 overflow-y-auto">
                  {topContributors.length > 0 ? (
                    topContributors.slice(0, 15).map((contributor: any, idx: number) => (
                      <div key={idx} className="p-2 hover:bg-gray-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {contributor.avatar_url && (
                              <img src={contributor.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                            )}
                            <div>
                              <p className="text-gray-300 text-xs font-medium">{contributor.login}</p>
                              {contributor.type && (
                                <p className="text-gray-500 text-[8px]">{contributor.type}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-white text-xs font-bold">{contributor.contributions}</p>
                            <p className="text-gray-500 text-[7px]">commits</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center text-gray-500 text-[10px]">No contributors found</div>
                  )}
                </div>
              )}
            </div>

            {/* ===== LANGUAGES SECTION ===== */}
            {languages.length > 0 && (
              <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
                <h4 className="text-gray-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1 border-b border-gray-700 pb-1">
                  <Code size={10} /> Languages
                </h4>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {languages.slice(0, 6).map((lang: any, idx: number) => (
                    <span key={idx} className="px-1.5 py-0.5 bg-gray-800 rounded-full text-[9px] text-gray-300">
                      {lang.language || lang.name}
                    </span>
                  ))}
                </div>
                {primaryLanguage && (
                  <p className="text-gray-500 text-[9px]">''Primary: <span className="text-gray-300">{primaryLanguage}</span></p>
                )}
              </div>
            )}

            {/* HEALTH SCORE */}
            <div className="bg-gray-750 rounded-lg p-3 border border-gray-700">
              <h4 className="text-gray-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1 border-b border-gray-700 pb-1">
                <Activity size={10} /> Health Score
              </h4>
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-400 text-[10px]">Overall</span>
                  <span className={`text-base font-bold ${qualityScore >= 70 ? 'text-green-400': qualityScore >= 40 ? 'text-yellow-400': 'text-red-400'}`}>
                    {qualityScore}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full" 
                       style={{ width: `${qualityScore}%` }} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GitHubDetailsSidebar;
