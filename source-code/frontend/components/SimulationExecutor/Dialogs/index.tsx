// Dialogs/index.tsx - COMPLETE WITH DETAILED GITHUB STATS COMPACT
import React, { useState, useEffect } from 'react';
import {
  Play, Pause, Send, CheckCircle, AlertCircle, X, Github, Star, GitFork,
  Eye, GitCommit, Users, Activity, TrendingUp, Search, Loader2, Edit,
  RefreshCw, Download, Save, Brain, FolderGit2, ExternalLink, Copy, Timer,
  GitPullRequest, Code, ChevronDown, ChevronUp, MessageCircle, Calendar,
  User, GitBranch, Clock, XCircle, FileCode
} from 'lucide-react';
import aiEvaluationService from '../../../services/aiEvaluation.service';
import { calculateGitHubScoreForRepo, verifyGitHubUser } from '../../../services/simulationAPI';
import { GitHubStatsCompact } from '../GitHubStatsCompact';
import { githubAuthService } from '../../../services/githubAuth.service';

// ============================================
// TYPES
// ============================================

// Update this interface (around line 20-30)
interface SimulationSession {
  id?: string;
  status?: string;
  simulation_id?: string;  // ✅ Add this line
  simulationId?: string;    // ✅ Add this line (camelCase version)
  started_at?: string;
  time_limit?: number;
  current_task?: number;
  answers?: Record<string, any>;
  progress?: Record<string, any>;
}

interface GitHubRepoInfo {
  owner: string;
  repo: string;
  files?: Record<string, string>;
  fileStructure?: any[];
  fullStats?: {
    social?: { stars?: number; forks?: number; watchers?: number; openIssues?: number };
    commits?: { total?: number; averageCommitsPerWeek?: number; recentCommits?: any[] };
    pullRequests?: { total?: number; open?: number; merged?: number; closed?: number; mergeRate?: number; recentPRs?: any[] };
    issues?: { total?: number; open?: number; closed?: number; recentIssues?: any[] };
    contributors?: { total?: number; topContributors?: any[] };
    scores?: { overall?: number; documentation?: number; activity?: number; community?: number };
    languages?: { breakdown?: any[]; primary?: string; percentages?: Record<string, number> };
  };
}

interface TaskData {
  id?: string;
  title?: string;
  type?: string;
  description?: string;
  instructions?: string;
  order?: number;
  task_index?: number;
  task_name?: string;
  task_type?: string;
  min_commits?: number;
  requires_pr?: boolean;
  requires_github_repo?: boolean;
  min_score?: number;
  depends_on?: number;
  evaluation?: {
    criteria?: Array<{ name: string; weight: number; options: string[] }>;
    qualityThreshold?: number;
  };
  resources?: string[];
  duration?: number;
}

interface StartDialogProps {
  session: SimulationSession | null;
  onStart: () => void;
  onExit: () => void;
}

// ============================================
// RESUME SIMULATION DIALOG
// ============================================
// ============================================
// RESUME SIMULATION DIALOG - UPDATED
// ============================================

interface ResumeSimulationDialogProps {
  open: boolean;
  sessionData: {
    sessionId: string;
    simulationName: string;
    jobTitle?: string;
    companyName?: string;
    startedAt?: string;
    lastActivityAt?: string;
    currentTask?: number;
    totalTasks?: number;
    timeSpent?: number;
    timeRemaining?: number;
    progress?: number;
    isRecruiter?: boolean;
    githubRepo?: {
      repoName: string;
      repoUrl: string;
      branchName: string;
      cloneUrl?: string;
      organizationName?: string;
      candidateUsername?: string;
    };
  } | null;
  onResume: () => void;
  onCancel: () => void;
  onViewDetails?: () => void;
  onViewReport?: (sessionId: string) => void;  // ✅ Changed from onViewResults
  isLoading?: boolean;
}

export const ResumeSimulationDialog: React.FC<ResumeSimulationDialogProps> = ({
  open,
  sessionData,
  onResume,
  onCancel,
  onViewDetails,
  onViewReport,
  isLoading = false,
}) => {
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  if (!open || !sessionData) return null;

  const formatTime = (seconds?: number): string => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const progressPercentage = sessionData.progress ||
    (sessionData.currentTask && sessionData.totalTasks
      ? Math.round((sessionData.currentTask / sessionData.totalTasks) * 100)
      : 0);

  const gitCommand = sessionData.githubRepo?.repoUrl
    ? `git clone ${sessionData.githubRepo.repoUrl}`
    : '';

  const handleViewReport = () => {
    if (onViewReport && sessionData.sessionId) {
      onViewReport(sessionData.sessionId);
    } else if (onViewDetails) {
      onViewDetails();
    } else if (sessionData?.sessionId) {
      window.open(`/dashboard?view=session-report&sessionId=${sessionData.sessionId}`, '_blank');
    }
  };

  const showViewReport = onViewReport !== undefined || onViewDetails !== undefined;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-lg w-full border border-gray-700 flex flex-col max-h-[90vh]">

        <div className="p-6 pb-4 border-b border-gray-700 flex-shrink-0">
          <div className="text-center">
            <div className="bg-orange-500/20 rounded-full p-3 inline-flex mx-auto mb-3">
              <Timer size={32} className="text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Resume Simulation</h2>
            <p className="text-gray-400 mt-1">
              You have an in-progress simulation session
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
              <span className="text-gray-400 text-sm font-medium">📋 Session Details</span>
              <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                {showFullDetails ? 'Show Less ▲' : 'Show More ▼'}
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500 text-sm">Simulation:</span>
                <span className="text-white text-sm font-medium">{sessionData.simulationName}</span>
              </div>
              {sessionData.jobTitle && (
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Position:</span>
                  <span className="text-gray-300 text-sm">{sessionData.jobTitle}</span>
                </div>
              )}
              {sessionData.companyName && (
                <div className="flex justify-between">
                  <span className="text-gray-500 text-sm">Company:</span>
                  <span className="text-gray-300 text-sm">{sessionData.companyName}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Progress</span>
                <span className="text-orange-400">{progressPercentage}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-gray-500">Task {sessionData.currentTask || 0} / {sessionData.totalTasks || 0}</span>
                <span className="text-gray-500">{formatTime(sessionData.timeSpent)} spent</span>
              </div>
            </div>

            {sessionData.githubRepo && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <Github size={14} className="text-green-400" />
                  <span className="text-green-400 text-xs font-medium">GitHub Repository Ready</span>
                  <span className="text-green-400/70 text-xs">✓ Already Created</span>
                </div>

                <div className="bg-gray-800 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <code className="text-xs text-green-400 font-mono truncate flex-1">
                      {sessionData.githubRepo.organizationName || 'recruitment-platform'}/{sessionData.githubRepo.repoName}
                    </code>
                    <button
                      onClick={() => copyToClipboard(sessionData.githubRepo?.repoUrl || '', 'repoUrl')}
                      className="text-gray-500 hover:text-gray-300 ml-2 flex-shrink-0"
                      title="Copy URL"
                    >
                      {copied === 'repoUrl' ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-900 px-2 py-1 rounded text-yellow-400 font-mono truncate">
                      {gitCommand}
                    </code>
                    <button
                      onClick={() => copyToClipboard(gitCommand, 'cloneCommand')}
                      className="text-gray-500 hover:text-gray-300 flex-shrink-0"
                      title="Copy clone command"
                    >
                      {copied === 'cloneCommand' ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Branch:</span>
                    <code className="text-purple-400">{sessionData.githubRepo.branchName || 'main'}</code>
                  </div>

                  {sessionData.githubRepo.candidateUsername && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Candidate:</span>
                      <code className="text-blue-400">{sessionData.githubRepo.candidateUsername}</code>
                    </div>
                  )}

                  <a
                    href={sessionData.githubRepo.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 pt-2 border-t border-gray-700"
                  >
                    <ExternalLink size={10} />
                    Open on GitHub
                  </a>
                </div>
              </div>
            )}

            {showFullDetails && (
              <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                {sessionData.startedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-xs">Started:</span>
                    <span className="text-gray-400 text-xs">{formatDate(sessionData.startedAt)}</span>
                  </div>
                )}
                {sessionData.lastActivityAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-xs">Last Activity:</span>
                    <span className="text-gray-400 text-xs">{formatDate(sessionData.lastActivityAt)}</span>
                  </div>
                )}
                {sessionData.timeRemaining !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-xs">Time Remaining:</span>
                    <span className="text-yellow-400 text-xs font-mono">{formatTime(sessionData.timeRemaining)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 bg-green-900/30 border border-green-700 rounded-lg">
            <p className="text-green-300 text-xs flex items-center gap-2">
              <Github size={12} />
              Your GitHub repository is ready. Click Resume to continue where you left off.
            </p>
          </div>

        </div>

        <div className="p-6 pt-4 border-t border-gray-700 flex-shrink-0">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onResume}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Resume Simulation
                </>
              )}
            </button>
          </div>

          {showViewReport && (
            <button
              onClick={handleViewReport}
              className="w-full mt-3 text-center text-blue-400 hover:text-blue-300 text-xs transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink size={12} />
              View Session Report 📊
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

// ============================================
// SESSION START DIALOG
// ============================================
interface SessionStartDialogProps {
  open: boolean;
  templateId: string;
  applicationId: string;
  onStart: (githubUsername: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export const SessionStartDialog: React.FC<SessionStartDialogProps> = ({
  open,
  templateId,
  applicationId,
  onStart,
  onCancel,
  isLoading = false,
  error = null,
}) => {
  const [githubUser, setGithubUser] = useState<{ username: string; avatarUrl: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // On open, check if already connected
  useEffect(() => {
    if (!open) return;
    const check = async () => {
      const lsUsername = localStorage.getItem('github_username');
      if (lsUsername) {
        setGithubUser({ username: lsUsername, avatarUrl: '' });
        return;
      }
      const user = await githubAuthService.getCurrentUser();
      if (user) setGithubUser(user);
    };
    check();
  }, [open]);

  if (!open) return null;

  const handleConnectGitHub = async () => {
    setIsConnecting(true);
    try {
      const result = await githubAuthService.loginWithGitHubPopup();
      if (result.success && result.username) {
        setGithubUser({ username: result.username, avatarUrl: result.avatarUrl || '' });
      }
    } catch (err) {
      console.error('GitHub popup error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStart = async () => {
    if (!githubUser?.username) return;
    await onStart(githubUser.username);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700">
        <div className="text-center mb-6">
          <Github size={48} className="mx-auto text-blue-400 mb-4" />
          <h2 className="text-2xl font-bold text-white">Connect GitHub to Start</h2>
          <p className="text-gray-400 mt-2">
            We'll create a repository for your work. Please connect your GitHub account.
          </p>
        </div>

        {!githubUser ? (
          <div className="mb-6">
            <button
              onClick={handleConnectGitHub}
              disabled={isConnecting}
              className="w-full py-3 bg-gray-900 border border-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Connecting to GitHub...
                </>
              ) : (
                <>
                  <Github size={20} />
                  Sign in with GitHub
                </>
              )}
            </button>
            <p className="text-gray-500 text-xs text-center mt-3">
              A popup will open — make sure popups are allowed for this site
            </p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
            <div className="flex items-center gap-3">
              {githubUser.avatarUrl && (
                <img src={githubUser.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
              )}
              <div className="flex-1">
                <p className="text-green-400 font-medium flex items-center gap-2">
                  <CheckCircle size={14} />
                  Connected as @{githubUser.username}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Repository will be created under: recruitment-platform
                </p>
              </div>
              <button
                onClick={() => {
                  githubAuthService.logout();
                  setGithubUser(null);
                }}
                className="text-xs text-gray-400 hover:text-red-400"
              >
                Change
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
          <p className="text-blue-300 text-xs flex items-center gap-2">
            <Github size={14} />
            A private repository will be created for your assessment
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-400 text-sm flex items-center gap-2">
              <AlertCircle size={14} /> {error}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={isLoading || !githubUser}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating Repository...
              </>
            ) : (
              <>
                <Play size={16} />
                Start Simulation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// REPOSITORY CREATED DIALOG
// ============================================
interface RepoCreatedDialogProps {
  open: boolean;
  repoData: {
    repoName: string;
    repoUrl: string;
    cloneUrl: string;
    branchName: string;
    organizationName?: string;
    candidateUsername?: string;
    sessionId?: string;
    simulationId?: string;
    issues?: Array<{
      taskIndex: number;
      taskName: string;
      issueNumber: number;
      issueUrl: string
    }>;
    existing?: boolean;
  };
  onContinue: () => void;
  onCopyToClipboard?: (text: string) => void;
  onBeforeContinue?: () => void;
}

export const RepoCreatedDialog: React.FC<RepoCreatedDialogProps> = ({
  open,
  repoData,
  onContinue,
  onCopyToClipboard,
  onBeforeContinue,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!open) return null;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    if (onCopyToClipboard) onCopyToClipboard(text);
  };

  const gitCommands = {
    https: `git clone ${repoData.cloneUrl}`,
    ssh: `git clone git@github.com:${repoData.organizationName || 'danieltn889'}/${repoData.repoName}.git`,
    gh: `gh repo clone ${repoData.organizationName || 'danieltn889'}/${repoData.repoName}`
  };

  const [selectedProtocol, setSelectedProtocol] = useState<'https' | 'ssh' | 'gh'>('https');

  const handleContinue = () => {
    if (onBeforeContinue) {
      onBeforeContinue();
    }
    onContinue();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 border border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-white">Repository Created! 🎉</h2>
          <p className="text-gray-400 mt-2">
            Your GitHub repository has been created successfully.
          </p>
        </div>

        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
          <p className="text-blue-300 text-sm font-medium mb-2">📋 Next Steps:</p>
          <ol className="text-gray-300 text-xs space-y-1.5 list-decimal list-inside">
            <li>You have been invited to the repository you are going to use. Check your email where your github give us is created on to accept the invitation.</li>
            <li>Clone the repository using the command above</li>
            <li>Switch to the <code className="bg-gray-800 px-1 rounded text-purple-400">{repoData.branchName}</code> branch</li>
            <li>Complete the tasks listed in the issues above</li>
            <li>Commit and push your changes to the repository</li>
            <li>Comment <code className="bg-gray-800 px-1 rounded text-green-400">/ready</code> on each issue when done</li>
            <li>See the issues created on the GitHub repository you were invited to</li>
            <li>Once you read all instructions, click "Continue to Tasks" below on this popup</li>
          </ol>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 mb-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
            <span className="text-gray-400 text-sm font-medium">📦 Repository</span>
            <div className="flex items-center gap-2">
              {repoData.organizationName && (
                <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded">
                  {repoData.organizationName}
                </span>
              )}
              {repoData.existing && (
                <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded">
                  Existing Repo
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500 text-xs">Repository Name:</span>
                <button
                  onClick={() => copyToClipboard(repoData.repoName, 'repoName')}
                  className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1"
                >
                  {copiedField === 'repoName' ? (
                    <CheckCircle size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                  {copiedField === 'repoName' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-sm bg-gray-800 px-3 py-1.5 rounded block text-green-400 break-all">
                {repoData.repoName}
              </code>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500 text-xs">Clone URL:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSelectedProtocol('https')}
                    className={`text-xs px-2 py-0.5 rounded ${selectedProtocol === 'https'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                  >
                    HTTPS
                  </button>
                  <button
                    onClick={() => setSelectedProtocol('ssh')}
                    className={`text-xs px-2 py-0.5 rounded ${selectedProtocol === 'ssh'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                  >
                    SSH
                  </button>
                  <button
                    onClick={() => setSelectedProtocol('gh')}
                    className={`text-xs px-2 py-0.5 rounded ${selectedProtocol === 'gh'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                  >
                    GitHub CLI
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-gray-800 px-3 py-1.5 rounded text-yellow-400 font-mono overflow-x-auto">
                  {gitCommands[selectedProtocol]}
                </code>
                <button
                  onClick={() => copyToClipboard(gitCommands[selectedProtocol], 'cloneCommand')}
                  className="p-2 text-gray-400 hover:text-white bg-gray-700 rounded-lg"
                  title="Copy clone command"
                >
                  {copiedField === 'cloneCommand' ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-500 text-xs">Branch:</span>
                <button
                  onClick={() => copyToClipboard(repoData.branchName, 'branch')}
                  className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1"
                >
                  {copiedField === 'branch' ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copiedField === 'branch' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-sm bg-gray-800 px-3 py-1.5 rounded block text-purple-400">
                {repoData.branchName}
              </code>
            </div>

            <div className="pt-2">
              <a
                href={repoData.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm bg-blue-900/30 px-3 py-1.5 rounded-lg w-full justify-center"
              >
                <Github size={16} />
                Open on GitHub
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>

        {repoData.issues && repoData.issues.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-2">
              <CheckCircle size={14} className="text-green-400" />
              📋 Created Issues ({repoData.issues.length})
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto bg-gray-900 rounded-lg p-2">
              {repoData.issues.map((issue) => (
                <a
                  key={issue.issueNumber}
                  href={issue.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-sm text-blue-400 hover:text-blue-300 hover:bg-gray-800 p-2 rounded transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs">#{issue.issueNumber}</span>
                    <span className="truncate max-w-[300px]">{issue.taskName}</span>
                  </div>
                  <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleContinue}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Play size={16} />
            Continue to Tasks
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// EXISTING DIALOGS
// ============================================

export const StartDialog: React.FC<StartDialogProps> = ({ session, onStart, onExit }) => {
  if (session?.status === 'completed' || session?.status === 'submitted') {
    return null;
  }

  const isPaused = session?.status === 'paused';

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700">
        <div className="text-center mb-6">
          <Play className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-white">
            {isPaused ? 'Resume Simulation?' : 'Ready to Start?'}
          </h2>
          <p className="text-gray-400 mt-2">
            {isPaused
              ? 'Continue from where you left off.'
              : "Ensure you're in a quiet environment."}
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={onExit}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
          >
            {isPaused ? 'Exit' : 'Not Ready'}
          </button>
          <button
            onClick={onStart}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            {isPaused ? 'Resume' : 'Start When Ready'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface PauseDialogProps {
  open: boolean;
  onResume: () => void;
  session?: SimulationSession | null;
}

export const PauseDialog: React.FC<PauseDialogProps> = ({ open, onResume, session }) => {
  if (!open) return null;
  if (session?.status === 'completed' || session?.status === 'submitted') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700 text-center">
        <Pause className="mx-auto h-14 w-14 text-yellow-500 mb-4" />
        <h2 className="text-2xl font-bold text-white">Paused</h2>
        <p className="text-gray-400 mt-2 mb-6">Take a break. Resume when ready.</p>
        <button
          onClick={onResume}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Resume Simulation
        </button>
      </div>
    </div>
  );
};

interface SubmitDialogProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: () => void | Promise<void>;
  session?: SimulationSession | null;
  timeSpent?: number;
  minSubmitSeconds?: number;
  isSubmitting?: boolean;
  submitError?: string | null;
  formatTime?: (seconds: number) => string;
}

export const SubmitDialog: React.FC<SubmitDialogProps> = ({
  open,
  onCancel,
  onSubmit,
  session,
  timeSpent = 0,
  minSubmitSeconds = 180,
  isSubmitting = false,
  submitError,
  formatTime,
}) => {
  if (!open) return null;
  if (session?.status === 'completed' || session?.status === 'submitted') {
    return null;
  }

  const remainingSeconds = Math.max(0, minSubmitSeconds - timeSpent);
  const canSubmit = remainingSeconds === 0 && !isSubmitting;
  const displayTime = (seconds: number) => formatTime ? formatTime(seconds) : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-700 text-center">
        <Send className="mx-auto h-14 w-14 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-white">Submit Simulation?</h2>
        <p className="text-gray-400 mt-2">This cannot be undone.</p>

        <div className={`mt-4 mb-4 rounded-lg border p-3 text-left ${remainingSeconds > 0
            ? 'bg-yellow-900/30 border-yellow-700'
            : 'bg-green-900/30 border-green-700'
          }`}>
          <div className="flex items-center gap-2">
            <Clock size={16} className={remainingSeconds > 0 ? 'text-yellow-400' : 'text-green-400'} />
            <p className={`text-sm font-semibold ${remainingSeconds > 0 ? 'text-yellow-300' : 'text-green-300'}`}>
              Minimum time: {displayTime(minSubmitSeconds)}
            </p>
          </div>
          <p className="text-gray-300 text-xs mt-1">
            Time spent: {displayTime(timeSpent)}
            {remainingSeconds > 0 ? ` · wait ${displayTime(remainingSeconds)} more before submitting.` : ' · ready to submit.'}
          </p>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
          >
            Continue
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : remainingSeconds > 0 ? 'Wait to Submit' : 'Submit Now'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface EvaluationResult {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  detailedScores: {
    codeQuality: number;
    completeness: number;
    bestPractices: number;
    documentation: number;
    efficiency: number;
  };
  suggestions: string[];
  metrics: {
    linesOfCode: number;
    functionCount: number;
    commentRatio: number;
    complexity: number;
  };
}

interface TaskCompletionDialogProps {
  open: boolean;
  task: TaskData | null;
  draft: {
    completed: boolean;
    comment: string;
    challenges: string;
    suggestions: string;
    githubCommitUrl: string;
  };
  onDraftChange: (draft: any) => void;
  onCancel: () => void;
  onSave: () => void;
  session?: SimulationSession | null;
  currentRepo?: GitHubRepoInfo | null;
  onLoadFromGitHub?: (owner: string, repo: string) => Promise<void>;
  isLoadingGitHub?: boolean;
  taskIndex?: number;
  taskRepositories?: Record<number, any>;
  onRefreshRepo?: () => Promise<void>;
  isRefreshingRepo?: boolean;
  code?: string;
  essay?: string;
  mcqAnswers?: Record<string, number[]>;
}

export const TaskCompletionDialog: React.FC<TaskCompletionDialogProps> = ({
  open,
  task,
  draft,
  onDraftChange,
  onCancel,
  onSave,
  session,
  currentRepo,
  onLoadFromGitHub,
  isLoadingGitHub = false,
  taskIndex = 0,
  taskRepositories = {},
  onRefreshRepo,
  isRefreshingRepo = false,
  code = '',
  essay = '',
  mcqAnswers = {},
}) => {
  const [activeTab, setActiveTab] = useState<'submission' | 'evaluation'>('submission');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [githubScoreAnalysis, setGithubScoreAnalysis] = useState<any>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoError, setRepoError] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const supportsGithub = task?.type === 'code_editor' ||
    task?.type === 'code_execution' ||
    task?.type === 'technical' ||
    task?.type === 'github_challenge';

  const isEditMode = draft.completed === true;

  const taskSpecificRepo = taskRepositories[taskIndex];
  const displayRepo = taskSpecificRepo || currentRepo;
  const autoGithubUrl = displayRepo ? `https://github.com/${displayRepo.owner}/${displayRepo.repo}` : '';
  const displayGithubUrl = draft.githubCommitUrl || autoGithubUrl;

  const stats = displayRepo?.fullStats;
  const fileCount = displayRepo?.files ? Object.keys(displayRepo.files).length : 0;
  const folderCount = displayRepo?.fileStructure?.filter((f: any) => f.type === 'folder').length || 0;
  const qualityScore = stats?.scores?.overall || (fileCount > 0 ? 65 : 0);

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const buildBackendGitHubEvaluation = (analysis: any): EvaluationResult => {
    const marks = analysis?.detailedMarks || {};
    const markToPercent = (mark: any) => {
      if (!mark?.max) return 0;
      return Math.round((Number(mark.earned || 0) / Number(mark.max)) * 100);
    };
    const allMarkRows: Array<[string, any]> = [
      ['Commits', marks.commits],
      ['README', marks.readme],
      ['Config file', marks.configFile],
      ['.gitignore', marks.gitignore],
      ['Code files', marks.codeFiles],
    ];
    const markRows = allMarkRows.filter(([, mark]) => Boolean(mark));
    const improvements = markRows
      .filter(([, mark]) => Number(mark?.earned || 0) < Number(mark?.max || 0))
      .map(([label, mark]) => `${label}: ${mark.details || `${mark.earned}/${mark.max}`}`);
    const strengths = markRows
      .filter(([, mark]) => Number(mark?.earned || 0) >= Number(mark?.max || 0))
      .map(([label, mark]) => `${label}: ${mark.details || `${mark.earned}/${mark.max}`}`);

    return {
      score: Math.round(Number(analysis?.score || 0)),
      feedback: analysis?.analyzed
        ? `Backend GitHub evaluation completed for ${analysis.repoUrl || `${displayRepo?.owner}/${displayRepo?.repo}`}.`
        : analysis?.message || 'Backend GitHub evaluation could not be completed.',
      strengths: strengths.length ? strengths : ['Repository was analyzed by the backend'],
      improvements,
      detailedScores: {
        codeQuality: markToPercent(marks.codeFiles),
        completeness: markToPercent(marks.commits),
        bestPractices: Math.round((markToPercent(marks.configFile) + markToPercent(marks.gitignore)) / 2),
        documentation: markToPercent(marks.readme),
        efficiency: Math.round(Number(analysis?.score || 0)),
      },
      suggestions: analysis?.breakdown?.scoreBreakdown || improvements,
      metrics: {
        linesOfCode: analysis?.stats?.linesOfCode || 0,
        functionCount: 0,
        commentRatio: 0,
        complexity: analysis?.stats?.codeFiles || 0,
      },
    };
  };

  const runEvaluation = async () => {
    console.log('🚀 Running evaluation...');
    setIsEvaluating(true);
    try {
      if (displayRepo?.owner && displayRepo?.repo) {
        const githubScoreResult = await calculateGitHubScoreForRepo({
          owner: displayRepo.owner,
          repo: displayRepo.repo,
          repoUrl: `https://github.com/${displayRepo.owner}/${displayRepo.repo}`,
          sessionId: session?.id,
        });
        const backendAnalysis = githubScoreResult?.data?.analysis || githubScoreResult?.analysis || null;
        setGithubScoreAnalysis(backendAnalysis);
        setEvaluation(buildBackendGitHubEvaluation(backendAnalysis));
        return;
      }

      const evaluationInput = {
        taskTitle: task?.title || task?.task_name || '',
        taskDescription: task?.description || '',
        taskType: task?.type || task?.task_type || 'generic',
        userAnswer: {
          comment: draft.comment,
          challenges: draft.challenges,
          suggestions: draft.suggestions,
          githubCommitUrl: draft.githubCommitUrl,
        },
        code: code,
        essay: essay,
        mcqAnswers: mcqAnswers,
        githubRepo: displayRepo ? {
          owner: displayRepo.owner,
          repo: displayRepo.repo,
          files: displayRepo.files || {},
          fileStructure: displayRepo.fileStructure || [],
          stats: displayRepo.fullStats,
        } : undefined,
      };

      const result = aiEvaluationService.evaluateTask(evaluationInput) as EvaluationResult;
      setEvaluation(result);
    } catch (error) {
      console.error('❌ Evaluation failed:', error);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleRerunEvaluation = () => {
    console.log('🔄 Rerun evaluation button clicked');
    runEvaluation();
  };

  useEffect(() => {
    if (open && task && (draft.completed || draft.comment || code || essay)) {
      runEvaluation();
    }
  }, [open, task, draft.completed, draft.comment, code, essay]);

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
    if (!match) return null;
    const owner = match[1];
    let repo = match[2].replace(/\.git$/, '').replace(/[?#].*$/, '');
    if (repo.startsWith('sim-')) return null;
    return { owner, repo };
  };

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
    setRepoError('');
    if (onLoadFromGitHub) {
      await onLoadFromGitHub(parsed.owner, parsed.repo);
    }
  };

  const handleRefreshRepo = async () => {
    if (onRefreshRepo) {
      await onRefreshRepo();
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (!open || !task) return null;
  if (session?.status === 'completed' || session?.status === 'submitted') return null;

  const renderDetailedScores = () => {
    if (!evaluation) return null;
    const scoreEntries = Object.entries(evaluation.detailedScores) as [keyof typeof evaluation.detailedScores, number][];
    return scoreEntries.map(([key, value]) => (
      <div key={key}>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
          <span className={getScoreColor(value)}>{value}%</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${value}%` }} />
        </div>
      </div>
    ));
  };

  const renderStrengths = () => {
    if (!evaluation?.strengths?.length) return null;
    return (
      <div>
        <p className="text-green-400 text-sm font-medium flex items-center gap-1">
          <CheckCircle size={14} /> Strengths
        </p>
        <ul className="space-y-1 mt-1">
          {evaluation.strengths.map((s: string, i: number) => (
            <li key={i} className="text-gray-300 text-sm">• {s}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderImprovements = () => {
    if (!evaluation?.improvements?.length) return null;
    return (
      <div>
        <p className="text-yellow-400 text-sm font-medium flex items-center gap-1">
          <AlertCircle size={14} /> Areas for Improvement
        </p>
        <ul className="space-y-1 mt-1">
          {evaluation.improvements.map((imp: string, i: number) => (
            <li key={i} className="text-gray-300 text-sm">• {imp}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderMetrics = () => {
    if (!evaluation?.metrics) return null;
    const { linesOfCode, functionCount, commentRatio, complexity } = evaluation.metrics;
    return (
      <div className="grid grid-cols-2 gap-2">
        {linesOfCode > 0 && (
          <div className="bg-gray-700 rounded p-2 text-center">
            <p className="text-gray-400 text-xs">Lines of Code</p>
            <p className="text-white text-sm font-bold">{linesOfCode}</p>
          </div>
        )}
        {functionCount > 0 && (
          <div className="bg-gray-700 rounded p-2 text-center">
            <p className="text-gray-400 text-xs">Functions</p>
            <p className="text-white text-sm font-bold">{functionCount}</p>
          </div>
        )}
        {commentRatio > 0 && (
          <div className="bg-gray-700 rounded p-2 text-center">
            <p className="text-gray-400 text-xs">Comment Ratio</p>
            <p className="text-white text-sm font-bold">{commentRatio}%</p>
          </div>
        )}
        {complexity > 0 && (
          <div className="bg-gray-700 rounded p-2 text-center">
            <p className="text-gray-400 text-xs">Complexity</p>
            <p className="text-white text-sm font-bold">{complexity}</p>
          </div>
        )}
      </div>
    );
  };

  const renderSuggestions = () => {
    if (!evaluation?.suggestions?.length) return null;
    return (
      <div>
        <p className="text-blue-400 text-sm font-medium">Suggestions</p>
        <ul className="space-y-1 mt-1">
          {evaluation.suggestions.map((sug: string, i: number) => (
            <li key={i} className="text-gray-300 text-sm">• {sug}</li>
          ))}
        </ul>
      </div>
    );
  };

  const renderGithubEvaluation = () => {
    const analysis = githubScoreAnalysis;
    if (!analysis) return null;

    const marks = analysis.detailedMarks || {};
    const allMarkRows: Array<[string, any]> = [
      ['Commits', marks.commits],
      ['README', marks.readme],
      ['Config File', marks.configFile],
      ['.gitignore', marks.gitignore],
      ['Code Files', marks.codeFiles],
    ];
    const markRows = allMarkRows.filter(([, mark]) => Boolean(mark));
    const commits = analysis.commits?.list || [];

    return (
      <div className="space-y-3">
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                <Github size={14} className="text-green-400" />
                GitHub Score
              </p>
              <p className="text-gray-400 text-xs mt-0.5">{analysis.repoUrl || `${displayRepo?.owner}/${displayRepo?.repo}`}</p>
            </div>
            <span className={`text-2xl font-bold ${getScoreColor(analysis.score || 0)}`}>
              {analysis.score || 0}%
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {markRows.map(([label, mark]) => (
              <div key={label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-300">{label}</span>
                  <span className="text-gray-200">{mark.earned}/{mark.max}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${Math.max(0, Math.min(100, (Number(mark.earned || 0) / Number(mark.max || 1)) * 100))}%` }}
                  />
                </div>
                {mark.details && <p className="text-gray-500 text-[11px] mt-1">{mark.details}</p>}
              </div>
            ))}
          </div>
        </div>

        {commits.length > 0 && (
          <div className="bg-gray-700/50 rounded-lg border border-gray-600 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-600 flex items-center justify-between">
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                <GitCommit size={14} className="text-blue-400" />
                Commit Details
              </p>
              <span className="text-gray-400 text-xs">{analysis.commits?.total || commits.length} total</span>
            </div>
            <div className="divide-y divide-gray-700 max-h-80 overflow-y-auto">
              {commits.map((commit: any, idx: number) => {
                const files = commit.files || [];
                const stats = commit.stats;
                return (
                  <div key={commit.sha || idx} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-1 flex-wrap">
                          <code className="text-blue-300">{commit.shortSha || commit.sha?.substring(0, 7)}</code>
                          <span className="flex items-center gap-1">
                            <User size={9} /> {commit.authorLogin || commit.author || 'unknown'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={9} /> {commit.date ? new Date(commit.date).toLocaleString() : 'Date unknown'}
                          </span>
                        </div>
                        <p className="text-gray-200 text-xs whitespace-pre-wrap break-words">{commit.message || 'No message'}</p>
                      </div>
                      {commit.url && (
                        <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-300 flex-shrink-0">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {stats && (
                      <div className="flex gap-3 mt-2 text-[10px]">
                        <span className="text-green-400">+{stats.additions || 0}</span>
                        <span className="text-red-400">-{stats.deletions || 0}</span>
                        <span className="text-gray-400">{stats.total || 0} changes</span>
                      </div>
                    )}
                    {files.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {files.slice(0, 6).map((file: any, fileIdx: number) => (
                          <div key={`${file.filename}-${fileIdx}`} className="flex items-center justify-between gap-2 text-[10px] bg-gray-800 rounded px-2 py-1">
                            <span className="text-gray-300 truncate">{file.filename}</span>
                            <span className="text-gray-500 flex-shrink-0">
                              {file.status} <span className="text-green-400">+{file.additions || 0}</span> <span className="text-red-400">-{file.deletions || 0}</span>
                            </span>
                          </div>
                        ))}
                        {files.length > 6 && <p className="text-gray-500 text-[10px]">+{files.length - 6} more files changed</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full border border-gray-700 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-850 sticky top-0">
          <h3 className="text-white font-semibold">
            {isEditMode ? '✏️ Edit Task' : '✅ Complete Task'}: {task?.title || task?.task_name || `Task ${taskIndex + 1}`}
          </h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('submission')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'submission'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            Submission
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'evaluation'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
              }`}
          >
            <Brain size={14} />
            AI Evaluation
            {evaluation && (
              <span className={`text-xs ${getScoreColor(evaluation.score)}`}>
                ({evaluation.score}%)
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'submission' ? (
            <>
              <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-600">
                <div className="flex items-center gap-2 mb-3">
                  <Github size={16} className="text-white" />
                  <span className="text-white text-sm font-semibold">GitHub Repository</span>
                  {displayRepo && (
                    <span className="text-green-400 text-xs ml-2">✓ Connected</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLoadRepo()}
                    placeholder="https://github.com/owner/repo"
                    className="flex-1 text-sm bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    disabled={Boolean(isLoadingGitHub || isRefreshingRepo)}
                  />
                  <button
                    onClick={handleLoadRepo}
                    disabled={Boolean(isLoadingGitHub || isRefreshingRepo || !repoUrl.trim())}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoadingGitHub ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isLoadingGitHub ? 'Loading...' : 'Load Repo'}
                  </button>
                </div>

                {repoError && (
                  <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                    <AlertCircle size={12} /> {repoError}
                  </p>
                )}

                <p className="text-gray-500 text-xs mt-2">
                  Enter a GitHub repository URL to load its files and get comprehensive statistics
                </p>
              </div>

              {displayRepo && (
                <GitHubStatsCompact
                  currentRepo={displayRepo}
                  stats={stats}
                  fileCount={fileCount}
                  folderCount={folderCount}
                  qualityScore={qualityScore}
                  onRefresh={handleRefreshRepo}
                  isRefreshing={isRefreshingRepo}
                />
              )}

              {!displayRepo && (
                <div className="p-4 bg-gray-700/30 rounded-lg border border-dashed border-gray-600 text-center">
                  <Github size={24} className="mx-auto text-gray-500 mb-2" />
                  <p className="text-gray-400 text-sm">No repository loaded</p>
                  <p className="text-gray-500 text-xs mt-1">Enter a GitHub URL above to load comprehensive repository statistics</p>
                </div>
              )}

              <label className="flex items-center gap-3 rounded border border-gray-700 p-3 bg-gray-900 cursor-pointer">
                <input type="checkbox" checked={draft.completed} onChange={(e) => onDraftChange({ ...draft, completed: e.target.checked })} className="h-5 w-5 text-green-600 rounded" />
                <span className="text-white font-medium">I have completed this task</span>
              </label>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">📝 Comment / Summary</label>
                <textarea value={draft.comment} onChange={(e) => onDraftChange({ ...draft, comment: e.target.value })} rows={3} className="w-full rounded border border-gray-700 bg-gray-900 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="Describe what you accomplished..." />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">⚠️ Challenges Faced</label>
                <textarea value={draft.challenges} onChange={(e) => onDraftChange({ ...draft, challenges: e.target.value })} rows={2} className="w-full rounded border border-gray-700 bg-gray-900 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="What challenges did you encounter?" />
              </div>

              <div>
                <label className="block text-gray-400 text-xs font-medium mb-1.5">💡 Suggestions for Improvement</label>
                <textarea value={draft.suggestions} onChange={(e) => onDraftChange({ ...draft, suggestions: e.target.value })} rows={2} className="w-full rounded border border-gray-700 bg-gray-900 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="How could this task be improved?" />
              </div>

              {supportsGithub && (
                <div>
                  <label className="block text-gray-400 text-xs font-medium mb-1.5">🔗 GitHub Repository URL (Commit Link)</label>
                  <input type="url" value={displayGithubUrl} onChange={(e) => onDraftChange({ ...draft, githubCommitUrl: e.target.value })} placeholder="https://github.com/user/repo/commit/…" className="w-full rounded border border-gray-700 bg-gray-900 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  {displayRepo && !draft.githubCommitUrl && (
                    <p className="text-green-400 text-xs mt-1.5 flex items-center gap-1">
                      <CheckCircle size={10} /> Auto-filled with repository: {displayRepo.owner}/{displayRepo.repo}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {isEvaluating ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Analyzing your submission...</p>
                </div>
              ) : evaluation ? (
                <>
                  <div className="relative">
                    <div className="text-center p-4 bg-gray-700 rounded-lg">
                      <div className={`text-4xl font-bold ${getScoreColor(evaluation.score)}`}>
                        {evaluation.score}%
                      </div>
                      <p className="text-gray-400 text-sm mt-1">Overall Score</p>
                    </div>
                    <button
                      onClick={handleRerunEvaluation}
                      disabled={Boolean(isEvaluating)}
                      className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-blue-400 transition-colors rounded-md hover:bg-gray-600"
                      title="Rerun AI Evaluation"
                    >
                      <RefreshCw size={14} className={isEvaluating ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  <div className="p-3 bg-gray-700/50 rounded-lg">
                    <p className="text-white text-sm">{evaluation.feedback}</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-gray-300 text-sm font-medium">Detailed Scores</p>
                      <button
                        onClick={handleRerunEvaluation}
                        disabled={Boolean(isEvaluating)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <RefreshCw size={10} className={isEvaluating ? 'animate-spin' : ''} />
                        Rerun Evaluation
                      </button>
                    </div>
                    {renderDetailedScores()}
                  </div>

                  {renderStrengths()}
                  {renderImprovements()}
                  {renderMetrics()}
                  {renderGithubEvaluation()}
                  {renderSuggestions()}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No evaluation available</p>
                  <button onClick={handleRerunEvaluation} className="mt-2 text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1 mx-auto">
                    <RefreshCw size={10} />
                    Run Evaluation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-700 sticky bottom-0 bg-gray-800">
          <button onClick={onCancel} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Cancel</button>
          {activeTab === 'submission' && (
            <button onClick={onSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              {isEditMode ? <Edit size={14} /> : <Save size={14} />}
              {isEditMode ? 'Update Submission' : (draft.completed ? 'Complete Task' : 'Save Progress')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// POST SUBMIT DIALOG WITH GITHUB STATS
// ============================================

// ============================================
// POST SUBMIT DIALOG WITH GITHUB STATS - FIXED (using simulationId)
// ============================================

interface PostSubmitDialogProps {
  open: boolean;
  onReviewResults: () => void;
  onExit: () => void;
  session?: SimulationSession | null;
  result?: any;
  formatTime?: (seconds: number) => string;
  githubAnalysis?: {
    has_repo?: boolean;
    score?: number;
    repo_info?: {
      repoName?: string;
      repoUrl?: string;
      branchName?: string;
      organizationName?: string;
      candidateUsername?: string;
    };
    detailed_marks?: {
      commits?: { earned: number; max: number; details: string; count?: number };
      readme?: { earned: number; max: number; details: string; present?: boolean };
      configFile?: { earned: number; max: number; details: string; found?: string[] };
      gitignore?: { earned: number; max: number; details: string; present?: boolean };
      codeFiles?: { earned: number; max: number; details: string; count?: number };
    };
    breakdown?: {
      commits?: { earned: number; max: number; details: string };
      readme?: { earned: number; max: number; details: string };
      configFiles?: { earned: number; max: number; details: string };
      gitignore?: { earned: number; max: number; details: string };
      codeFiles?: { earned: number; max: number; details: string };
      commitMatching?: { earned: number; max: number; details: string };
      total?: number;
      maxPossible?: number;
      percentage?: number;
    };
    message?: string;
  } | null;
}

export const PostSubmitDialog: React.FC<PostSubmitDialogProps> = ({
  open,
  onReviewResults,
  onExit,
  session,
  result,
  formatTime,
  githubAnalysis,
}) => {
  if (!open) return null;

  const scoreBreakdown = result?.scoreBreakdown || {};
  const summary = result?.summary || {};
  const score = result?.score ?? scoreBreakdown.overall ?? 0;
  const passed = Boolean(result?.passed);

  const displayTime = (seconds?: number) => {
    const safeSeconds = Number(seconds || 0);
    return formatTime ? formatTime(safeSeconds) : `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
  };

  const scoreRows = [
    ['Quality', scoreBreakdown.quality],
    ['Technical', scoreBreakdown.technical],
    ['Communication', scoreBreakdown.communication],
    ['GitHub', scoreBreakdown.github],
    ['Speed', scoreBreakdown.speed],
    ['Adaptability', scoreBreakdown.adaptability],
    ['Collaboration', scoreBreakdown.collaboration],
    ['Punctuality', scoreBreakdown.punctuality],
  ].filter(([, value]) => value !== undefined && value !== null);

  const gitHubScore = githubAnalysis?.score ?? scoreBreakdown.github ?? 0;
  const hasGitHub = githubAnalysis?.has_repo === true;
  const repoInfo = githubAnalysis?.repo_info;
  const detailedMarks = githubAnalysis?.detailed_marks;
  const breakdown = githubAnalysis?.breakdown;

  const getMarkDisplay = (mark: any) => {
    if (!mark) return null;
    const earned = Number(mark.earned || 0);
    const max = Number(mark.max || 0);
    const percentage = max > 0 ? Math.round((earned / max) * 100) : 0;
    return { earned, max, percentage, details: mark.details };
  };

  const commitsMark = getMarkDisplay(detailedMarks?.commits);
  const readmeMark = getMarkDisplay(detailedMarks?.readme);
  const configMark = getMarkDisplay(detailedMarks?.configFile);
  const gitignoreMark = getMarkDisplay(detailedMarks?.gitignore);
  const codeFilesMark = getMarkDisplay(detailedMarks?.codeFiles);

  const getScoreColor = (value: number): string => {
    if (value >= 80) return 'text-green-400';
    if (value >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  // FIXED: Use session ID for navigation instead of simulation ID
  const handleReviewResults = () => {
    console.log('📊 Review Full Results clicked in PostSubmitDialog');

    // Get session ID from various possible locations (NOT simulation ID)
    const sessionId = session?.id || result?.sessionId || result?.session_id || result?.session?.id;

    if (sessionId) {
      console.log('🔍 Navigating to session report with sessionId:', sessionId);
      // Use window.location.href for direct navigation to session report
      window.location.href = `/session-report/${sessionId}`;
    } else {
      console.warn('No sessionId available, using onReviewResults callback');
      onReviewResults();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 border border-gray-700 text-center max-h-[90vh] overflow-y-auto">
        <CheckCircle className="mx-auto h-14 w-14 text-green-500 mb-4" />
        <h2 className="text-2xl font-bold text-white">Simulation Submitted</h2>
        <p className="text-gray-400 mt-2">{result?.message || 'Your simulation was submitted successfully.'}</p>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 text-center">
            <p className="text-gray-400 text-xs uppercase">Overall Score</p>
            <p className={`text-3xl font-bold mt-1 ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {Math.round(score)}%
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 text-center">
            <p className="text-gray-400 text-xs uppercase">Result</p>
            <p className={`text-xl font-bold mt-2 ${passed ? 'text-green-400' : 'text-yellow-400'}`}>
              {passed ? 'Passed' : 'Completed'}
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 text-center">
            <p className="text-gray-400 text-xs uppercase">Time Spent</p>
            <p className="text-xl font-bold text-blue-300 mt-2">
              {summary.total_time_formatted || displayTime(summary.total_time_seconds)}
            </p>
          </div>
        </div>

        {/* GitHub Stats Compact Section */}
        {hasGitHub && repoInfo && (
          <div className="mt-4 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github size={16} className="text-green-400" />
                <span className="text-white text-sm font-semibold">GitHub Repository Analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${getScoreColor(gitHubScore)}`}>
                  {gitHubScore}%
                </span>
                <a
                  href={repoInfo.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-blue-400"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1 text-gray-400">
                  <FolderGit2 size={12} />
                  <span>{repoInfo.organizationName || 'org'}/{repoInfo.repoName}</span>
                </div>
                {repoInfo.branchName && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <GitBranch size={12} />
                    <span>{repoInfo.branchName}</span>
                  </div>
                )}
                {repoInfo.candidateUsername && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <User size={12} />
                    <span>@{repoInfo.candidateUsername}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {commitsMark && (
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <GitCommit size={10} /> Commits
                      </span>
                      <span className={getScoreColor(commitsMark.percentage)}>
                        {commitsMark.earned}/{commitsMark.max}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${commitsMark.percentage}%` }} />
                    </div>
                    {detailedMarks?.commits?.count !== undefined && (
                      <p className="text-gray-500 text-[10px] mt-1">{detailedMarks.commits.count} commits</p>
                    )}
                  </div>
                )}

                {readmeMark && (
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Code size={10} /> README
                      </span>
                      <span className={getScoreColor(readmeMark.percentage)}>
                        {readmeMark.earned}/{readmeMark.max}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${readmeMark.percentage}%` }} />
                    </div>
                    {detailedMarks?.readme?.present && (
                      <p className="text-green-400 text-[10px] mt-1">✓ Present</p>
                    )}
                  </div>
                )}

                {codeFilesMark && (
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 flex items-center gap-1">
                        <FileCode size={10} /> Code Files
                      </span>
                      <span className={getScoreColor(codeFilesMark.percentage)}>
                        {codeFilesMark.earned}/{codeFilesMark.max}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${codeFilesMark.percentage}%` }} />
                    </div>
                    {detailedMarks?.codeFiles?.count !== undefined && (
                      <p className="text-gray-500 text-[10px] mt-1">{detailedMarks.codeFiles.count} files</p>
                    )}
                  </div>
                )}

                {configMark && (
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">Config</span>
                      <span className={getScoreColor(configMark.percentage)}>
                        {configMark.earned}/{configMark.max}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${configMark.percentage}%` }} />
                    </div>
                    {detailedMarks?.configFile?.found && detailedMarks.configFile.found.length > 0 && (
                      <p className="text-gray-500 text-[10px] mt-1 truncate">
                        {detailedMarks.configFile.found.slice(0, 2).join(', ')}
                        {detailedMarks.configFile.found.length > 2 && '...'}
                      </p>
                    )}
                  </div>
                )}

                {gitignoreMark && (
                  <div className="bg-gray-800 rounded p-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400">.gitignore</span>
                      <span className={getScoreColor(gitignoreMark.percentage)}>
                        {gitignoreMark.earned}/{gitignoreMark.max}
                      </span>
                    </div>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${gitignoreMark.percentage}%` }} />
                    </div>
                    {detailedMarks?.gitignore?.present && (
                      <p className="text-green-400 text-[10px] mt-1">✓ Present</p>
                    )}
                  </div>
                )}
              </div>

              {breakdown?.total !== undefined && breakdown?.maxPossible !== undefined && (
                <div className="pt-2 border-t border-gray-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Total GitHub Score</span>
                    <span className={`font-bold ${getScoreColor(breakdown.percentage || 0)}`}>
                      {breakdown.total}/{breakdown.maxPossible} ({breakdown.percentage || 0}%)
                    </span>
                  </div>
                </div>
              )}

              {githubAnalysis?.message && !hasGitHub && (
                <p className="text-gray-500 text-xs text-center">{githubAnalysis.message}</p>
              )}
            </div>
          </div>
        )}

        {scoreRows.length > 0 && (
          <div className="mt-4 bg-gray-900 rounded-lg border border-gray-700 p-4 text-left">
            <p className="text-white font-semibold text-sm mb-3">Score Breakdown</p>
            <div className="space-y-2">
              {scoreRows.map(([label, value]) => (
                <div key={label as string}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{label as string}</span>
                    <span className="text-gray-200">{Math.round(Number(value))}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 bg-gray-900 rounded-lg border border-gray-700 p-4 text-left">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white font-semibold text-sm">Submission Details</p>
            <span className="text-xs text-gray-400">
              {summary.completed_tasks ?? 0}/{summary.total_tasks ?? 0} tasks completed
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Completion Rate</p>
              <p className="text-gray-200">{Math.round(summary.completion_rate ?? 0)}%</p>
            </div>
            <div>
              <p className="text-gray-500">Passing Score</p>
              <p className="text-gray-200">{result?.passingScore ?? summary.passing_score ?? 70}%</p>
            </div>
            {result?.participation?.message && (
              <div className="col-span-2 mt-2 pt-2 border-t border-gray-700">
                <p className="text-gray-500 text-xs">Participation</p>
                <p className="text-gray-300 text-sm">{result.participation.message}</p>
                {result.participation.bonus > 0 && (
                  <p className="text-green-400 text-xs mt-1">
                    +{result.participation.bonus} bonus points
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* FIXED: Buttons with window.location.href using simulationId */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleReviewResults}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Review Full Results
          </button>
          <button
            onClick={onExit}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  StartDialog,
  ResumeSimulationDialog,
  SessionStartDialog,
  RepoCreatedDialog,
  PauseDialog,
  SubmitDialog,
  TaskCompletionDialog,
  PostSubmitDialog,
};