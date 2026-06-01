// routes/github.routes.ts
import express, { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import GitHubController from '../../controllers/github.controller.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';

const router: Router = express.Router();

// Wrapper to convert Express Request to AuthenticatedRequest
const wrap = (fn: (req: AuthenticatedRequest, res: Response) => Promise<void>) => {
  return (req: Request, res: Response) => {
    return fn(req as AuthenticatedRequest, res);
  };
};

// @route   POST /api/v1/github/verify-user
// @desc    Verify GitHub user exists
// @access  Public
router.post('/verify-user', 
  [
    body('username').isString().trim().isLength({ min: 1, max: 100 })
  ],
  validateRequest,
  (req: Request, res: Response) => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📝 [GitHub Route] /verify-user POST REQUEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📥 Request body:', req.body);
    console.log('═══════════════════════════════════════════════════════════════');
    return GitHubController.verifyUser(req, res);
  }
);

// @route   POST /api/v1/github/simulation/:simulationId/tasks-to-issues
// @desc    Create GitHub Issues from task configuration
// @access  Private
router.post('/simulation/:simulationId/tasks-to-issues',
  protect,
  authorize('recruiter', 'company_admin', 'system_admin'),
  [
    param('simulationId').isUUID(),
    body('repoName').isString().trim(),
    body('candidateGitHubUsername').isString().trim(),
    body('tasks').isArray()
  ],
  validateRequest,
  wrap(GitHubController.createIssuesFromTasks)
);

// ============================================
// CANDIDATE GITHUB CONNECTION
// ============================================

// @route   POST /api/v1/github/connect
// @desc    Connect candidate's GitHub account
// @access  Private (Candidate)
router.post('/connect', 
  protect, 
  authorize('candidate'), 
  [
    body('githubUsername').isString().trim().isLength({ min: 1, max: 100 }),
    body('githubToken').optional().isString()
  ], 
  validateRequest, 
  wrap(GitHubController.connectGitHub)
);

// @route   GET /api/v1/github/status
// @desc    Get GitHub connection status
// @access  Private
router.get('/status', 
  protect, 
  wrap(GitHubController.getGitHubStatus)
);

// ============================================
// SIMULATION REPOSITORY MANAGEMENT
// ============================================

// @route   POST /api/v1/github/simulation/repo
// @desc    Create assessment repository for candidate
// @access  Private (Recruiter/Admin)
router.post('/simulation/repo', 
  protect, 
  authorize('recruiter', 'company_admin', 'system_admin'), 
  [
    body('candidateId').isUUID(),
    body('simulationId').optional().isUUID(),
    body('taskId').optional().isString(),
    body('candidateGitHubUsername').isString().trim()
  ], 
  validateRequest, 
  wrap(GitHubController.createSimulationRepo)
);

// @route   POST /api/v1/github/repo/add-collaborator
// @desc    Add candidate as collaborator
// @access  Private (Recruiter/Admin)
router.post('/repo/add-collaborator', 
  protect, 
  authorize('recruiter', 'company_admin', 'system_admin'), 
  [
    body('repoName').isString().trim(),
    body('candidateGitHubUsername').isString().trim(),
    body('permission').optional().isIn(['pull', 'push', 'admin', 'maintain', 'triage'])
  ], 
  validateRequest, 
  wrap(GitHubController.addCollaborator)
);

// ============================================
// REPOSITORY ANALYSIS
// ============================================

// @route   POST /api/v1/github/analyze-repo
// @desc    Analyze candidate's repository
// @access  Private (Recruiter/Admin)
router.post('/analyze-repo', 
  protect, 
  [
    body('repoUrl').isURL(),
    body('candidateId').optional().isUUID(),
    body('simulationId').optional().isUUID()
  ], 
  validateRequest, 
  wrap(GitHubController.analyzeCandidateRepo)
);

// @route   GET /api/v1/github/repo/:owner/:repo/commits/stats
// @desc    Get commit statistics
// @access  Private
router.get('/repo/:owner/:repo/commits/stats', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    query('author').optional().isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getCommitStats)
);

// @route   GET /api/v1/github/repo/:owner/:repo/prs/stats
// @desc    Get pull request statistics
// @access  Private
router.get('/repo/:owner/:repo/prs/stats', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    query('author').optional().isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getPRStats)
);

// ============================================
// CANDIDATE SUBMISSIONS
// ============================================

// @route   POST /api/v1/github/submit
// @desc    Candidate submits GitHub repo for task
// @access  Private (Candidate)
router.post('/submit', 
  protect, 
  authorize('candidate'), 
  [
    body('repoUrl').isURL(),
    body('taskId').isString(),
    body('simulationId').optional().isUUID()
  ], 
  validateRequest, 
  wrap(GitHubController.submitRepoForTask)
);

// @route   GET /api/v1/github/submissions/:id
// @desc    Get submission status
// @access  Private
router.get('/submissions/:id', 
  protect, 
  [
    param('id').isUUID()
  ], 
  validateRequest, 
  wrap(GitHubController.getSubmissionStatus)
);

// ============================================
// UTILITY ENDPOINTS
// ============================================

// @route   GET /api/v1/github/user/repos
// @desc    Get user's GitHub repositories
// @access  Private
router.get('/user/repos', 
  protect, 
  [
    query('githubUsername').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getUserRepos)
);

// @route   POST /api/v1/github/verify-ownership
// @desc    Verify repository ownership
// @access  Private
router.post('/verify-ownership', 
  protect, 
  [
    body('repoUrl').isURL(),
    body('candidateGitHubUsername').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.verifyOwnership)
);

// ============================================
// WEBHOOK (Public - No Auth)
// ============================================

// @route   POST /api/v1/github/webhook
// @desc    GitHub webhook receiver
// @access  Public (verified by signature)
router.post('/webhook', 
  express.raw({ type: 'application/json' }), 
  GitHubController.handleWebhook
);

// Add to routes/github.routes.ts

// Full repository statistics (all in one)
router.get('/repo/:owner/:repo/full-stats', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getFullRepoStats)
);

// Contributor statistics
router.get('/repo/:owner/:repo/contributors/stats', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getContributorStats)
);

// Issue statistics
router.get('/repo/:owner/:repo/issues/stats', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getIssueStats)
);

// ============================================
// CODE RETRIEVAL ENDPOINTS
// ============================================

// @route   GET /api/v1/github/repo/:owner/:repo/contents/*path
// @desc    Get file content from repository
// @access  Private
router.get('/repo/:owner/:repo/contents/*', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getFileContent)
);

// @route   GET /api/v1/github/repo/:owner/:repo/git/trees/:tree_sha
// @desc    Get repository tree structure
// @access  Private
router.get('/repo/:owner/:repo/git/trees/:tree_sha', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    param('tree_sha').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getTree)
);

// @route   GET /api/v1/github/repo/:owner/:repo/commits/:commit_sha
// @desc    Get commit details with code changes
// @access  Private
router.get('/repo/:owner/:repo/commits/:commit_sha', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    param('commit_sha').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getCommitDetails)
);

// @route   GET /api/v1/github/repo/:owner/:repo/readme
// @desc    Get repository README
// @access  Private
router.get('/repo/:owner/:repo/readme', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.getReadme)
);

// @route   GET /api/v1/github/search/code
// @desc    Search code across GitHub
// @access  Private
router.get('/search/code', 
  protect, 
  [
    query('q').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.searchCode)
);

// @route   GET /api/v1/github/repo/:owner/:repo/compare/:base...:head
// @desc    Compare two commits/branches
// @access  Private
router.get('/repo/:owner/:repo/compare/:base...:head', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    param('base').isString(),
    param('head').isString()
  ], 
  validateRequest, 
  wrap(GitHubController.compareCommits)
);
// ============================================
// COMPLETE REPOSITORY DATA (CODE + STATISTICS)
// ============================================

// @route   GET /api/v1/github/repo/:owner/:repo/everything
// @desc    Get EVERYTHING: code, stats, commits, PRs, issues, etc.
// @access  Private
router.get('/repo/:owner/:repo/everything', 
  protect, 
  [
    param('owner').isString(),
    param('repo').isString(),
    query('includeContent').optional().isBoolean(),
    query('maxFiles').optional().isInt({ min: 1, max: 500 })
  ], 
  validateRequest, 
  wrap(GitHubController.getEverything)
);

// Add this to your github.routes.ts (temporary, before export default router)
router.get('/debug/routes', (req: Request, res: Response) => {
  const routes: string[] = [];
  const extractRoutes = (stack: any[], basePath = '') => {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        routes.push(`${methods} ${basePath}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle.stack) {
        extractRoutes(layer.handle.stack, `${basePath}${layer.regexp.source.replace('\\/?(?=\\/|$)', '')}`);
      }
    }
  };
  extractRoutes((router as any).stack);
  res.json({ 
    totalRoutes: routes.length,
    routes: routes.filter(r => r.includes('/github') || r.includes('/repo'))
  });
});

export default router;