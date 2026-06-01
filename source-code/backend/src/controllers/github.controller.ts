// controllers/github.controller.ts
import { Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';  // Use .js, not .ts
import { AuthenticatedRequest } from '../types/auth.types.js';  // Use .js, not .ts
import ResponseService from '../services/response.service.js';  // Use .js, not .ts
import DatabaseService from '../services/database.service.js';  // Use .js, not .ts

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedRepo { owner: string; repo: string; }

interface CommitStreaks { longestStreak: number; currentStreak: number; }

interface IssueStats {
  avgResolutionTime: number;
  medianResolutionTime: number;
  issuesByLabel: Record<string, number>;
  topCreators: Array<{ name: string; count: number }>;
}

interface QualityInput {
  repoData: any;
  commits: any[];
  pullRequests: any[];
  issues: any[];
  contributors: any[];
  hasReadme: boolean;
  hasCodeOfConduct: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — paginate every GitHub list endpoint to get ALL records
// ─────────────────────────────────────────────────────────────────────────────

// Replace the existing paginateAll function (around line 35-55)

async function paginateAll<T>(
  octokit: Octokit,
  method: (params: any) => Promise<any>, // Changed to any to handle different response types
  params: Record<string, any>,
  label = 'resource'
): Promise<T[]> {
  const allItems: T[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    try {
      const response = await method({ ...params, per_page: perPage, page });
      // Handle both direct array responses and responses with data property
      let items: T[] = [];
      if (Array.isArray(response)) {
        items = response;
      } else if (response.data && Array.isArray(response.data)) {
        items = response.data;
      } else if (response.data && response.data.workflow_runs && Array.isArray(response.data.workflow_runs)) {
        // Special case for workflow runs which return { total_count, workflow_runs }
        items = response.data.workflow_runs as T[];
      } else if (response.data && response.data.workflows && Array.isArray(response.data.workflows)) {
        // Special case for workflows
        items = response.data.workflows as T[];
      } else {
        // Unknown response format, break out
        break;
      }
      
      allItems.push(...items);

      if (items.length < perPage) break;
      page++;
      await new Promise(r => setTimeout(r, 120));
    } catch (err: any) {
      logger.warn(`paginateAll [${label}] stopped at page ${page}: ${err.message}`);
      break;
    }
  }

  return allItems;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — retry for async-computed GitHub stats (202 → retry)
// ─────────────────────────────────────────────────────────────────────────────

async function retryStats(
  fn: () => Promise<any>,
  attempts = 5,
  delayMs = 3000
): Promise<any> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fn();
      if (res?.status === 200 || (res?.data && Array.isArray(res.data))) return res;
      if (res?.status === 202 && i < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err: any) {
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

class GitHubController {

  private octokit: Octokit;
  private organizationName: string;

  constructor() {
    this.organizationName = process.env.GITHUB_ORG_NAME || 'recruitment-platform';
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'Recruitment-Platform/1.0'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CANDIDATE GITHUB INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  connectGitHub = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { githubUsername, githubToken } = req.body;
      const userId = req.user.id;

      if (!githubUsername) {
        ResponseService.error(res, 'GitHub username is required', 400);
        return;
      }

      try {
        const userCheck = await this.octokit.users.getByUsername({ username: githubUsername });
        if (!userCheck.data) {
          ResponseService.error(res, 'GitHub user not found', 404);
          return;
        }
      } catch (error: any) {
        if (error.status === 404) {
          ResponseService.error(res, 'GitHub user not found', 404);
          return;
        }
        throw error;
      }

      await DatabaseService.query(`
        UPDATE candidate_profiles
        SET github_url = $1,
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{github}', $2::jsonb),
            updated_at = NOW()
        WHERE user_id = $3
      `, [
        `https://github.com/${githubUsername}`,
        JSON.stringify({ username: githubUsername, connected_at: new Date().toISOString(), token_stored: !!githubToken }),
        userId
      ]);

      if (githubToken) {
        await DatabaseService.query(`
          INSERT INTO github_connections (user_id, github_username, access_token, connected_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            github_username = EXCLUDED.github_username,
            access_token    = EXCLUDED.access_token,
            updated_at      = NOW()
        `, [userId, githubUsername, githubToken]);
      }

      ResponseService.success(res, {
        githubUsername,
        connected: true,
        profileUrl: `https://github.com/${githubUsername}`
      }, 'GitHub account connected successfully');
    } catch (error: any) {
      logger.error('Connect GitHub error:', error);
      ResponseService.error(res, error.message || 'Failed to connect GitHub', 500);
    }
  };

  getGitHubStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user.id;
      const result = await DatabaseService.query(`
        SELECT cp.github_url, gc.github_username, gc.connected_at, gc.last_synced_at
        FROM candidate_profiles cp
        LEFT JOIN github_connections gc ON cp.user_id = gc.user_id
        WHERE cp.user_id = $1
      `, [userId]);

      if (!result.rows[0] || !result.rows[0].github_url) {
        ResponseService.success(res, { connected: false });
        return;
      }

      ResponseService.success(res, {
        connected: true,
        githubUsername: result.rows[0].github_username,
        githubUrl:      result.rows[0].github_url,
        connectedAt:    result.rows[0].connected_at,
        lastSynced:     result.rows[0].last_synced_at
      });
    } catch (error: any) {
      logger.error('Get GitHub status error:', error);
      ResponseService.error(res, 'Failed to get GitHub status', 500);
    }
  };

  verifyUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username } = req.body;

      if (!username || typeof username !== 'string') {
        ResponseService.error(res, 'GitHub username is required', 400);
        return;
      }

      const trimmedUsername = username.trim();

      try {
        const userCheck = await this.octokit.users.getByUsername({ username: trimmedUsername });

        if (!userCheck.data) {
          ResponseService.error(res, 'GitHub user not found', 404);
          return;
        }

        ResponseService.success(res, {
          username:   userCheck.data.login,
          name:       userCheck.data.name,
          profileUrl: userCheck.data.html_url,
          verified:   true
        }, 'GitHub user verified successfully');
      } catch (error: any) {
        if (error.status === 404) {
          ResponseService.error(res, 'GitHub user not found', 404);
          return;
        }
        throw error;
      }
    } catch (error: any) {
      logger.error('Verify GitHub user error:', error);
      ResponseService.error(res, error.message || 'Failed to verify GitHub user', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SIMULATION REPOSITORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  
async createSimulationRepoInternal(
  simulationId: string,
  sessionId: string,
  repoName: string,
  candidateGitHubUsername: string,
  tasks: any[],
  orgName: string = ''
): Promise<any> {
  try {
    // ── resolve candidate_id ──────────────────────────────────────────────
    let candidateId: string | null = null;

    try {
      const r = await DatabaseService.query(`SELECT user_id FROM simulations WHERE id = $1`, [simulationId]);
      if (r.rows.length > 0) candidateId = r.rows[0].user_id;
    } catch { /* ignore */ }

    if (!candidateId) throw new Error(`Cannot find candidate_id for simulation: ${simulationId}`);

    // ── attempt number ────────────────────────────────────────────────────
    const existing = await DatabaseService.query(`
      SELECT COUNT(*) AS attempt_count FROM github_simulation_repos
      WHERE simulation_id = $1 AND candidate_id = $2 AND session_id = $3
    `, [simulationId, candidateId, sessionId]);

    const attemptNumber = parseInt(existing.rows[0]?.attempt_count || '0') + 1;
    const uniqueRepoName = `${repoName}-attempt-${attemptNumber}`;

    // ── sanitize username consistently ────────────────────────────────────
    const cleanUsername = candidateGitHubUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    const branchName = `candidate-${cleanUsername.substring(0, 15) || candidateId.substring(0, 8)}`;

    // ── check for existing repo ───────────────────────────────────────────
    try {
      let existingRepo;
      if (orgName && orgName !== '') {
        try {
          existingRepo = await this.octokit.repos.get({ owner: orgName, repo: uniqueRepoName });
        } catch { /* ignore */ }
      }
      if (!existingRepo) {
        try {
          existingRepo = await this.octokit.repos.get({ owner: candidateGitHubUsername, repo: uniqueRepoName });
        } catch { /* ignore */ }
      }
      
      if (existingRepo) {
        try { 
          await this.octokit.repos.addCollaborator({ 
            owner: existingRepo.data.owner.login, 
            repo: uniqueRepoName, 
            username: candidateGitHubUsername, 
            permission: 'push' 
          }); 
        } catch { /* ignore */ }

        const issues = await this.octokit.issues.listForRepo({ 
          owner: existingRepo.data.owner.login, 
          repo: uniqueRepoName, 
          state: 'all', 
          per_page: 100 
        });

        await DatabaseService.query(`
          UPDATE github_simulation_repos SET status='active', updated_at=NOW(), attempt_number=$1
          WHERE simulation_id=$2 AND candidate_id=$3 AND session_id=$4
        `, [attemptNumber, simulationId, candidateId, sessionId]);

        return {
          repoName: uniqueRepoName,
          repoUrl: existingRepo.data.html_url,
          cloneUrl: existingRepo.data.clone_url,
          issuesCreated: issues.data.map((i: any) => ({ 
            issueNumber: i.number, 
            issueUrl: i.html_url, 
            title: i.title 
          })),
          candidateUsername: candidateGitHubUsername,
          organizationName: existingRepo.data.owner.login,
          existing: true,
          attemptNumber,
          branchName
        };
      }
    } catch (err: any) {
      if (err.status !== 404) console.warn('Check existing repo:', err.message);
    }

    // ── resolve owner: org or personal ───────────────────────────────────
    const authUser = await this.octokit.users.getAuthenticated();
    const personalOwner = authUser.data.login;
    
    let useOrg = false;
    if (orgName && orgName !== '' && orgName !== personalOwner) {
      try {
        await this.octokit.orgs.get({ org: orgName });
        useOrg = true;
      } catch (orgError: any) {
        console.warn(`Organization ${orgName} not accessible, using personal account:`, orgError.message);
        useOrg = false;
      }
    }

    // ── create repo WITH auto_init ────────────────────────────────────────
    let repo: any;
    let finalOwner: string;

    try {
      if (useOrg) {
        repo = await this.octokit.repos.createInOrg({
          org: orgName,
          name: uniqueRepoName,
          description: `Recruitment simulation - ${simulationId} (Attempt ${attemptNumber})`,
          private: true,
          auto_init: true
        });
        finalOwner = orgName;
      } else {
        repo = await this.octokit.repos.createForAuthenticatedUser({
          name: uniqueRepoName,
          description: `Recruitment simulation - ${simulationId} (Attempt ${attemptNumber})`,
          private: true,
          auto_init: true
        });
        finalOwner = personalOwner;
      }
    } catch (createError: any) {
      console.error('Failed to create repo in org, falling back to personal account:', createError.message);
      repo = await this.octokit.repos.createForAuthenticatedUser({
        name: uniqueRepoName,
        description: `Recruitment simulation - ${simulationId} (Attempt ${attemptNumber})`,
        private: true,
        auto_init: true
      });
      finalOwner = personalOwner;
    }

    const finalRepoName = repo.data.name;
    const repoUrl = `https://github.com/${finalOwner}/${finalRepoName}`;
    const cloneUrl = `${repoUrl}.git`;

    // ── detect default branch ─────────────────────────────────────────────
    let defaultBranch = 'main';

    try {
      await this.octokit.git.getRef({ owner: finalOwner, repo: finalRepoName, ref: 'heads/main' });
      defaultBranch = 'main';
    } catch {
      try {
        await this.octokit.git.getRef({ owner: finalOwner, repo: finalRepoName, ref: 'heads/master' });
        defaultBranch = 'master';
      } catch {
        throw new Error('Repository creation failed - no default branch found');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER FUNCTION
    // ═══════════════════════════════════════════════════════════════════════
    const updateFile = async (path: string, content: string, message: string) => {
      try {
        let existingSha: string | undefined = undefined;
        try {
          const existingFile = await this.octokit.repos.getContent({
            owner: finalOwner,
            repo: finalRepoName,
            path: path,
            ref: defaultBranch
          });
          if (!Array.isArray(existingFile.data)) {
            existingSha = (existingFile.data as any).sha;
          }
        } catch { /* File doesn't exist yet */ }

        const params: any = {
          owner: finalOwner,
          repo: finalRepoName,
          path: path,
          message: message,
          content: Buffer.from(content).toString('base64'),
          branch: defaultBranch
        };
        
        if (existingSha) {
          params.sha = existingSha;
        }

        await this.octokit.repos.createOrUpdateFileContents(params);
        console.log(`✅ File updated: ${path}`);
      } catch (error: any) {
        console.error(`❌ Failed to update ${path}:`, error.message);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SIMPLE GITHUB ACTIONS WORKFLOW - NO COMPLEX JOBS, NO PERMISSION ERRORS
    // ═══════════════════════════════════════════════════════════════════════
    
    const githubActionsWorkflow = `name: CI/CD Pipeline

on:
  push:
    branches: [ main, master, develop, candidate-* ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Repository Info
        run: |
          echo "========================================="
          echo "Repository: \${{ github.repository }}"
          echo "Branch: \${{ github.ref_name }}"
          echo "Commit: \${{ github.sha }}"
          echo "========================================="
      
      - name: List Files
        run: |
          echo ""
          echo "Files in repository:"
          ls -la
          echo ""
          echo "========================================="
      
      - name: Build Complete
        run: echo "✅ Build completed successfully!"`;

    await updateFile('.github/workflows/test.yml', githubActionsWorkflow, 'Add CI/CD workflow');

    // ═══════════════════════════════════════════════════════════════════════
    // CREATE README
    // ═══════════════════════════════════════════════════════════════════════
    
    const readmeContent = `# 🎯 Recruitment Simulation Repository

## 🚀 Getting Started

\`\`\`bash
git clone ${repoUrl}
cd ${finalRepoName}
git checkout ${branchName}
\`\`\`

## 🎯 Your Tasks

${tasks.map((task, idx) => `
### Task ${idx + 1}: ${task.title || task.task_name || `Task ${idx + 1}`}
${task.description || 'Complete this task as described'}
`).join('\n')}

## ✅ How to Submit

1. Complete the tasks
2. Commit and push to the \`${branchName}\` branch
3. GitHub Actions will automatically run
4. Check the **Actions** tab for results

Good luck! 🚀
`;

    await updateFile('README.md', readmeContent, 'Update README');

    // ═══════════════════════════════════════════════════════════════════════
    // CREATE .GITIGNORE
    // ═══════════════════════════════════════════════════════════════════════
    
    const gitignore = `node_modules/
coverage/
dist/
build/
.env
.DS_Store
*.log
`;

    await updateFile('.gitignore', gitignore, 'Add .gitignore');

    console.log(`✅ All files created in ${finalRepoName}`);

    // ═══════════════════════════════════════════════════════════════════════
    // ADD COLLABORATOR - SENDS INVITATION
    // ═══════════════════════════════════════════════════════════════════════
    let invitationSent = false;
    
    try {
      console.log(`📧 Adding ${candidateGitHubUsername} as collaborator to ${finalOwner}/${finalRepoName}`);
      
      await this.octokit.repos.addCollaborator({ 
        owner: finalOwner, 
        repo: finalRepoName, 
        username: candidateGitHubUsername, 
        permission: 'push' 
      });
      
      console.log(`✅ GitHub invitation sent to ${candidateGitHubUsername}`);
      invitationSent = true;
      
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (e: any) {
      console.error(`❌ Failed to add collaborator:`, e.message);
    }

    // ── create candidate branch ───────────────────────────────────────────
    try {
      const mainRef = await this.octokit.git.getRef({ 
        owner: finalOwner, 
        repo: finalRepoName, 
        ref: `heads/${defaultBranch}` 
      });
      await this.octokit.git.createRef({ 
        owner: finalOwner, 
        repo: finalRepoName, 
        ref: `refs/heads/${branchName}`, 
        sha: mainRef.data.object.sha 
      });
      console.log(`✅ Branch created: ${branchName}`);
    } catch (e: any) { 
      console.warn('Create branch warning:', e.message); 
    }

    // ── create task issues ─────────────────────────────────────────────────────
    const issuesCreated: any[] = [];
    if (tasks?.length) {
      const sorted = [...tasks].sort((a, b) => (a.order || a.task_index || 0) - (b.order || b.task_index || 0));
      for (let idx = 0; idx < sorted.length; idx++) {
        const task = sorted[idx];
        try {
          const issue = await this.octokit.issues.create({
            owner: finalOwner, 
            repo: finalRepoName,
            title: task.title || task.task_name || `Task ${idx + 1}`,
            body: this.generateTaskIssueBodyFromConfig({ ...task, task_index: idx + 1 }),
            labels: this.getTaskLabels(task)
          });
          issuesCreated.push({ 
            taskIndex: idx, 
            taskName: task.title || task.task_name, 
            issueNumber: issue.data.number, 
            issueUrl: issue.data.html_url 
          });
          console.log(`✅ Issue created: Task ${idx + 1}`);
        } catch (e: any) { 
          console.warn(`Issue ${idx + 1} warning:`, e.message); 
        }
      }
    }

    // ── persist to database ───────────────────────────────────────────────
    await DatabaseService.query(`
      UPDATE github_simulation_repos SET status='archived', updated_at=NOW()
      WHERE simulation_id=$1 AND candidate_id=$2 AND session_id=$3 AND status='active'
    `, [simulationId, candidateId, sessionId]);

    await DatabaseService.query(`
      INSERT INTO github_simulation_repos (
        simulation_id, candidate_id, session_id, repo_name, repo_url, branch_name,
        status, attempt_number, commit_count, metadata, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'active',$7,0,$8,NOW(),NOW())
      ON CONFLICT (simulation_id, candidate_id, session_id) WHERE status='active'
      DO UPDATE SET repo_name=EXCLUDED.repo_name, repo_url=EXCLUDED.repo_url,
        branch_name=EXCLUDED.branch_name, attempt_number=EXCLUDED.attempt_number,
        metadata=EXCLUDED.metadata, status='active', updated_at=NOW()
      RETURNING id
    `, [
      simulationId, 
      candidateId, 
      sessionId, 
      finalRepoName, 
      repoUrl, 
      branchName, 
      attemptNumber,
      JSON.stringify({ 
        attempt: attemptNumber, 
        createdAt: new Date().toISOString(), 
        organization: finalOwner, 
        candidateUsername: candidateGitHubUsername, 
        issuesCreated: issuesCreated.length,
        repoCreated: true,
        invitationSent: invitationSent,
        githubActionsEnabled: true
      })
    ]);

    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`✅ REPOSITORY CREATED SUCCESSFULLY:`);
    console.log(`   Repo: ${finalRepoName}`);
    console.log(`   URL: ${repoUrl}`);
    console.log(`   Owner: ${finalOwner}`);
    console.log(`   Branch: ${branchName}`);
    console.log(`   Invitation sent: ${invitationSent ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   Issues created: ${issuesCreated.length}`);
    console.log(`   GitHub Actions: ENABLED ✅`);
    console.log(`═══════════════════════════════════════════════════════════════`);

    return { 
      repoName: finalRepoName, 
      repoUrl, 
      cloneUrl, 
      issuesCreated, 
      candidateUsername: candidateGitHubUsername, 
      organizationName: finalOwner, 
      existing: false, 
      candidateId, 
      sessionId, 
      attemptNumber, 
      branchName,
      invitationSent,
      githubActionsEnabled: true
    };

  } catch (error: any) {
    console.error('createSimulationRepoInternal error:', error);
    throw error;
  }
}
  

  createSimulationRepo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { candidateId, simulationId, taskId, candidateGitHubUsername, tasks } = req.body;
      const recruiterId = req.user.id;

      if (!candidateGitHubUsername) {
        ResponseService.error(res, 'Candidate GitHub username is required', 400);
        return;
      }

      const repoName = `sim-${simulationId || Date.now()}-${candidateId.substring(0, 8)}`;

      let repo: any;
      try {
        repo = await this.octokit.repos.createUsingTemplate({
          template_owner: this.organizationName,
          template_repo: `simulation-template-${taskId || 'default'}`,
          name: repoName,
          description: `Recruitment simulation for candidate ${candidateId}`,
          private: true
        });
      } catch {
        repo = await this.octokit.repos.createForAuthenticatedUser({
          name: repoName,
          description: `Recruitment simulation for candidate ${candidateId}`,
          private: true, auto_init: true
        });
      }

      await this.octokit.repos.addCollaborator({ owner: this.organizationName, repo: repoName, username: candidateGitHubUsername, permission: 'push' });

      const repoData = await this.octokit.repos.get({ owner: this.organizationName, repo: repoName });
      const defaultBranch = repoData.data.default_branch || 'main';
      const mainBranch = await this.octokit.git.getRef({ owner: this.organizationName, repo: repoName, ref: `heads/${defaultBranch}` });
      const branchName = `candidate-${candidateId.substring(0, 8)}`;
      await this.octokit.git.createRef({ owner: this.organizationName, repo: repoName, ref: `refs/heads/${branchName}`, sha: mainBranch.data.object.sha });

      let issues: any[] = [];
      if (tasks?.length) {
        issues = await this.createIssuesFromTasksInternal(simulationId, repoName, candidateGitHubUsername, tasks);
      }

      await DatabaseService.query(`
        INSERT INTO github_simulation_repos (simulation_id, candidate_id, repo_name, repo_url, branch_name, created_by, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'active',NOW())
      `, [simulationId || null, candidateId, repoName, repo.data.html_url, branchName, recruiterId]);

      ResponseService.success(res, { repoName, repoUrl: repo.data.html_url, cloneUrl: repo.data.clone_url, branchName, issuesCreated: issues.length, issues, status: 'created' }, 'Simulation repository created successfully');
    } catch (error: any) {
      logger.error('Create simulation repo error:', error);
      ResponseService.error(res, error.message || 'Failed to create repository', 500);
    }
  };

  private async createIssuesFromTasksInternal(simulationId: string, repoName: string, candidateGitHubUsername: string, tasks: any[]): Promise<any[]> {
    const issuesCreated: any[] = [];
    const repoOwner = this.organizationName;
    const sorted = [...tasks].sort((a, b) => (a.order || a.task_index) - (b.order || b.task_index));

    for (const task of sorted) {
      const issue = await this.octokit.issues.create({
        owner: repoOwner, repo: repoName,
        title: this.generateIssueTitle(task),
        body:   this.generateTaskIssueBodyFromConfig(task),
        labels: this.getTaskLabels(task)
      });

      await DatabaseService.query(`
        INSERT INTO simulation_task_issues (
          simulation_id, task_index, task_name, task_type, issue_number, issue_url,
          repo_name, repo_owner, depends_on, min_commits, requires_pr, min_score, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING id
      `, [
        simulationId,
        task.order || task.task_index,
        task.title || task.task_name,
        task.type  || task.task_type,
        issue.data.number,
        issue.data.html_url,
        repoName, repoOwner,
        task.depends_on || null,
        task.min_commits || null,
        task.requires_pr || false,
        task.min_score || task.evaluation?.qualityThreshold || null
      ]);

      issuesCreated.push({ taskIndex: task.order || task.task_index, taskName: task.title || task.task_name, issueNumber: issue.data.number, issueUrl: issue.data.html_url });
    }
    return issuesCreated;
  }

  createIssuesFromTasks = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { simulationId } = req.params;
      const { repoName, repoOwner, candidateGitHubUsername, tasks } = req.body;

      if (!tasks || !Array.isArray(tasks)) {
        ResponseService.error(res, 'Tasks array is required', 400);
        return;
      }

      const issuesCreated: any[] = [];
      const issueMap = new Map<number, { number: number; url: string }>();
      const sorted = [...tasks].sort((a, b) => (a.order || a.task_index) - (b.order || b.task_index));
      const owner = repoOwner || this.organizationName;

      for (const task of sorted) {
        const issue = await this.octokit.issues.create({
          owner, repo: repoName,
          title: this.generateIssueTitle(task),
          body:   this.generateTaskIssueBodyFromConfig(task),
          labels: this.getTaskLabels(task)
        });

        await DatabaseService.query(`
          INSERT INTO simulation_task_issues (
            simulation_id, task_id, task_index, task_name, task_type, issue_number, issue_url,
            repo_name, repo_owner, depends_on, min_commits, requires_pr, min_score, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING id
        `, [
          simulationId, task.id || null, task.order || task.task_index,
          task.title || task.task_name, task.type || task.task_type,
          issue.data.number, issue.data.html_url, repoName, owner,
          task.depends_on || null, task.min_commits || null, task.requires_pr || false,
          task.evaluation?.qualityThreshold || task.min_score || null
        ]);

        issueMap.set(task.order || task.task_index, { number: issue.data.number, url: issue.data.html_url });
        issuesCreated.push({ taskIndex: task.order || task.task_index, taskName: task.title || task.task_name, issueNumber: issue.data.number, issueUrl: issue.data.html_url, dependsOn: task.depends_on });
      }

      // Dependency comments
      for (const task of sorted) {
        if (task.depends_on && issueMap.has(task.depends_on)) {
          const parent  = issueMap.get(task.depends_on)!;
          const current = issueMap.get(task.order || task.task_index)!;
          if (current && parent) {
            const parentTask = sorted.find(t => (t.order || t.task_index) === task.depends_on);
            await this.octokit.issues.createComment({
              owner, repo: repoName, issue_number: current.number,
              body: `## ⚠️ This task depends on:\n\n- #${parent.number}: ${parentTask?.title || parentTask?.task_name}\n\nPlease complete that task first.`
            });
          }
        }
      }

      ResponseService.success(res, { simulationId, repoName, totalIssues: issuesCreated.length, issues: issuesCreated }, 'Tasks converted to GitHub issues successfully');
    } catch (error: any) {
      logger.error('Create issues from tasks error:', error);
      ResponseService.error(res, error.message || 'Failed to create issues', 500);
    }
  };

  addCollaborator = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { repoName, candidateGitHubUsername, permission = 'push' } = req.body;
      if (!repoName || !candidateGitHubUsername) { ResponseService.error(res, 'Repository name and candidate username are required', 400); return; }
      await this.octokit.repos.addCollaborator({ owner: this.organizationName, repo: repoName, username: candidateGitHubUsername, permission });
      ResponseService.success(res, { repoName, candidateGitHubUsername, permission }, 'Collaborator added successfully');
    } catch (error: any) {
      logger.error('Add collaborator error:', error);
      ResponseService.error(res, error.message || 'Failed to add collaborator', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. REPOSITORY ANALYSIS & STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  analyzeCandidateRepo = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { repoUrl, candidateId, simulationId } = req.body;
      if (!repoUrl) { ResponseService.error(res, 'Repository URL is required', 400); return; }

      const parsed = this.parseGitHubUrl(repoUrl);
      if (!parsed) { ResponseService.error(res, 'Invalid GitHub repository URL', 400); return; }
      const { owner, repo } = parsed;

      const [repoData, commits, pullRequests, languages, branches, contributors] = await Promise.all([
        this.octokit.repos.get({ owner, repo }).catch(() => null),
        paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), { owner, repo }, 'commits'),
        paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs'),
        this.octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
        paginateAll(this.octokit, (p) => this.octokit.repos.listBranches(p), { owner, repo }, 'branches'),
        paginateAll(this.octokit, (p) => this.octokit.repos.listContributors(p), { owner, repo }, 'contributors')
      ]);

      if (!repoData) { ResponseService.error(res, 'Repository not found or inaccessible', 404); return; }

      const stats = this.calculateRepoStats(commits, pullRequests, languages.data);

      const analysisResult = await DatabaseService.query(`
        INSERT INTO github_repo_analysis (
          candidate_id, simulation_id, repo_owner, repo_name, repo_url,
          is_private, total_commits, total_pull_requests, languages_used,
          commit_frequency, avg_commit_size, first_commit_date, last_commit_date,
          contributors_count, branch_count, analysis_data, analyzed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()) RETURNING id
      `, [
        candidateId || null, simulationId || null, owner, repo, repoUrl,
        repoData.data.private, commits.length, pullRequests.length,
        Object.keys(languages.data), stats.commitFrequency, stats.avgCommitSize,
        stats.firstCommitDate, stats.lastCommitDate, contributors.length,
        branches.length, JSON.stringify(stats)
      ]);

      ResponseService.success(res, {
        repository: {
          name: repoData.data.name, owner: repoData.data.owner.login,
          url: repoData.data.html_url, isPrivate: repoData.data.private,
          description: repoData.data.description,
          stars: repoData.data.stargazers_count, forks: repoData.data.forks_count,
          createdAt: repoData.data.created_at, updatedAt: repoData.data.updated_at
        },
        statistics: stats,
        analysisId: analysisResult.rows[0]?.id
      }, 'Repository analyzed successfully');
    } catch (error: any) {
      logger.error('Analyze repo error:', error);
      ResponseService.error(res, error.message || 'Failed to analyze repository', 500);
    }
  };

  getCommitStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      const { author } = req.query;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const params: any = { owner, repo };
      if (author) params.author = author as string;

      const commits = await paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), params, 'commits');
      ResponseService.success(res, this.calculateDetailedCommitStats(commits));
    } catch (error: any) {
      logger.error('Get commit stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get commit statistics', 500);
    }
  };

  getPRStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      const { author } = req.query;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const allPRs = await paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs');
      const filteredPRs = author ? allPRs.filter((pr: any) => pr.user?.login === author) : allPRs;
      const prStats = this.calculateDetailedPRStats(filteredPRs);

      const prsWithDetails = await Promise.all(
        filteredPRs.slice(0, 50).map(async (pr: any) => {
          try {
            const [fullPr, reviews] = await Promise.all([
              this.octokit.pulls.get({ owner, repo, pull_number: pr.number }),
              this.octokit.pulls.listReviews({ owner, repo, pull_number: pr.number })
            ]);
            return {
              number: fullPr.data.number, title: fullPr.data.title,
              state: fullPr.data.state, createdAt: fullPr.data.created_at,
              mergedAt: fullPr.data.merged_at, closedAt: fullPr.data.closed_at,
              additions: fullPr.data.additions || 0, deletions: fullPr.data.deletions || 0,
              changedFiles: fullPr.data.changed_files || 0, reviewCount: reviews.data.length
            };
          } catch { return null; }
        })
      );

      ResponseService.success(res, { ...prStats, detailedPRs: prsWithDetails.filter(Boolean) });
    } catch (error: any) {
      logger.error('Get PR stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get PR statistics', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. WEBHOOK HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  handleWebhook = async (req: Request, res: Response): Promise<void> => {
    try {
      const event = req.headers['x-github-event'] as string;
      const payload = req.body;
      switch (event) {
        case 'push':               await this.handlePushEvent(payload);        break;
        case 'pull_request':       await this.handlePullRequestEvent(payload); break;
        case 'create':             await this.handleCreateEvent(payload);      break;
        case 'pull_request_review': await this.handleReviewEvent(payload);     break;
        default: logger.info(`Unhandled webhook event: ${event}`);
      }
      ResponseService.success(res, { received: true }, 'Webhook processed');
    } catch (error: any) {
      logger.error('Webhook error:', error);
      ResponseService.error(res, 'Webhook processing failed', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. CANDIDATE SUBMISSION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  submitRepoForTask = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { repoUrl, taskId, simulationId } = req.body;
      const candidateId = req.user.id;
      if (!repoUrl || !taskId) { ResponseService.error(res, 'Repository URL and task ID are required', 400); return; }

      const parsed = this.parseGitHubUrl(repoUrl);
      if (!parsed) { ResponseService.error(res, 'Invalid GitHub repository URL', 400); return; }
      const { owner, repo } = parsed;

      try { await this.octokit.repos.get({ owner, repo }); } catch {
        ResponseService.error(res, 'Repository not found or inaccessible', 404); return;
      }

      const submission = await DatabaseService.query(`
        INSERT INTO github_submissions (candidate_id, task_id, simulation_id, repo_owner, repo_name, repo_url, submitted_at, status)
        VALUES ($1,$2,$3,$4,$5,$6,NOW(),'pending') RETURNING id
      `, [candidateId, taskId, simulationId || null, owner, repo, repoUrl]);

      this.analyzeSubmission(submission.rows[0].id, owner, repo, candidateId).catch(err => logger.error('Async analysis error:', err));

      ResponseService.success(res, { submissionId: submission.rows[0].id, repoUrl, status: 'pending', message: 'Repository submitted for review. Analysis will begin shortly.' });
    } catch (error: any) {
      logger.error('Submit repo error:', error);
      ResponseService.error(res, error.message || 'Failed to submit repository', 500);
    }
  };

  getSubmissionStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const result = await DatabaseService.query(`
        SELECT gs.*, gra.analysis_data, gra.total_commits, gra.total_pull_requests, gra.languages_used
        FROM github_submissions gs
        LEFT JOIN github_repo_analysis gra ON gs.id = gra.submission_id
        WHERE gs.id = $1 AND (gs.candidate_id = $2 OR $3 = true)
      `, [id, userId, req.user.user_type !== 'candidate']);
      if (!result.rows[0]) { ResponseService.notFound(res, 'Submission not found'); return; }
      ResponseService.success(res, result.rows[0]);
    } catch (error: any) {
      logger.error('Get submission error:', error);
      ResponseService.error(res, 'Failed to get submission status', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  getUserRepos = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { githubUsername } = req.query;
      if (!githubUsername) { ResponseService.error(res, 'GitHub username is required', 400); return; }

      const repos = await paginateAll(this.octokit, (p) => this.octokit.repos.listForUser(p), { username: githubUsername as string, sort: 'updated' }, 'repos');

      ResponseService.success(res, repos.map((r: any) => ({
        name: r.name, fullName: r.full_name, url: r.html_url,
        description: r.description, isPrivate: r.private,
        stars: r.stargazers_count, forks: r.forks_count,
        lastUpdated: r.updated_at, language: r.language
      })));
    } catch (error: any) {
      logger.error('Get user repos error:', error);
      ResponseService.error(res, error.message || 'Failed to get user repositories', 500);
    }
  };

  verifyOwnership = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { repoUrl, candidateGitHubUsername } = req.body;
      const parsed = this.parseGitHubUrl(repoUrl);
      if (!parsed) { ResponseService.error(res, 'Invalid GitHub URL', 400); return; }
      const isOwner = parsed.owner.toLowerCase() === candidateGitHubUsername?.toLowerCase();
      ResponseService.success(res, { isOwner, repoOwner: parsed.owner, providedUsername: candidateGitHubUsername, verified: isOwner });
    } catch (error: any) {
      logger.error('Verify ownership error:', error);
      ResponseService.error(res, 'Failed to verify ownership', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. FULL REPOSITORY STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

getFullRepoStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

    const [
      repoData,
      commits,
      pullRequests,
      issues,
      contributors,
      releases,
      branches,
      languages,
      subscribers,
      topics,
      communityProfile,
      readme
    ] = await Promise.all([
      this.octokit.repos.get({ owner, repo }).catch(() => null),
      paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), { owner, repo }, 'commits'),
      paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs'),
      paginateAll(this.octokit, (p) => this.octokit.issues.listForRepo(p), { owner, repo, state: 'all' }, 'issues'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listContributors(p), { owner, repo }, 'contributors'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listReleases(p), { owner, repo }, 'releases'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listBranches(p), { owner, repo }, 'branches'),
      this.octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
      paginateAll(this.octokit, (p) => this.octokit.activity.listWatchersForRepo(p), { owner, repo }, 'subscribers'),
      this.octokit.repos.getAllTopics({ owner, repo }).catch(() => ({ data: { names: [] } })),
      this.octokit.repos.getCommunityProfileMetrics({ owner, repo }).catch(() => ({ data: {} })),
      this.octokit.repos.getReadme({ owner, repo }).catch(() => null)
    ]);

    if (!repoData) { ResponseService.error(res, 'Repository not found', 404); return; }

    // Type the arrays properly
    const typedReleases = releases as any[];
    const typedCommits = commits as any[];
    const typedPullRequests = pullRequests as any[];
    const typedIssues = issues as any[];
    const typedContributors = contributors as any[];
    const typedBranches = branches as any[];
    const typedSubscribers = subscribers as any[]; // subscribers is already an array, not an object with .data
    const typedTopics = topics as any;
    const typedCommunityProfile = communityProfile as any;

    const commitStreaks = this.calculateCommitStreaks(typedCommits);
    const issueStats = this.calculateIssueStats(typedIssues);
    const contributorStats = this.calculateContributorStats(typedContributors);
    const hasCodeOfConduct = !!(typedCommunityProfile.data as any)?.files?.code_of_conduct;

    const fullStats = {
      repository: {
        name: repoData.data.name, 
        fullName: repoData.data.full_name,
        owner: repoData.data.owner.login, 
        description: repoData.data.description,
        homepage: repoData.data.homepage, 
        size: repoData.data.size,
        defaultBranch: repoData.data.default_branch, 
        isPrivate: repoData.data.private,
        isFork: repoData.data.fork, 
        isArchived: repoData.data.archived,
        isDisabled: repoData.data.disabled, 
        hasIssues: repoData.data.has_issues,
        hasProjects: repoData.data.has_projects, 
        hasWiki: repoData.data.has_wiki,
        hasPages: repoData.data.has_pages, 
        hasDownloads: repoData.data.has_downloads,
        hasDiscussions: repoData.data.has_discussions,
        createdAt: repoData.data.created_at, 
        updatedAt: repoData.data.updated_at,
        pushedAt: repoData.data.pushed_at,
        cloneUrl: repoData.data.clone_url, 
        sshUrl: repoData.data.ssh_url
      },
      social: {
        stars: repoData.data.stargazers_count,
        watchers: repoData.data.watchers_count,
        forks: repoData.data.forks_count,
        subscribers: typedSubscribers.length, // typedSubscribers is an array, so .length works directly
        openIssues: repoData.data.open_issues_count
      },
      topics: { all: typedTopics.data.names, count: typedTopics.data.names.length },
      languages: this.calculateLanguagePercentages(languages.data),
      commits: {
        total: typedCommits.length,
        firstCommitDate: typedCommits[typedCommits.length - 1]?.commit?.author?.date,
        lastCommitDate: typedCommits[0]?.commit?.author?.date,
        commitFrequency: this.calculateCommitFrequency(typedCommits),
        averageCommitsPerWeek: this.calculateAvgCommitsPerWeek(typedCommits),
        longestStreak: commitStreaks.longestStreak,
        currentStreak: commitStreaks.currentStreak,
        commitsByHour: this.calculateCommitsByHour(typedCommits),
        commitsByDayOfWeek: this.calculateCommitsByDayOfWeek(typedCommits),
        commitsByMonth: this.calculateCommitsByMonth(typedCommits),
        topAuthors: this.getTopAuthors(typedCommits, 10)
      },
      pullRequests: {
        total: typedPullRequests.length,
        open: typedPullRequests.filter((p: any) => p.state === 'open').length,
        closed: typedPullRequests.filter((p: any) => p.state === 'closed' && !p.merged_at).length,
        merged: typedPullRequests.filter((p: any) => p.merged_at).length,
        mergeRate: this.calculateMergeRate(typedPullRequests),
        averageTimeToMergeHours: this.calculateAvgTimeToMerge(typedPullRequests),
        topContributors: this.getTopPRContributors(typedPullRequests, 10)
      },
      issues: {
        total: typedIssues.length,
        open: typedIssues.filter((i: any) => i.state === 'open').length,
        closed: typedIssues.filter((i: any) => i.state === 'closed').length,
        averageResolutionTimeHours: issueStats.avgResolutionTime,
        medianResolutionTimeHours: issueStats.medianResolutionTime,
        issuesByLabel: issueStats.issuesByLabel,
        topIssueCreators: issueStats.topCreators
      },
      contributors: {
        total: typedContributors.length,
        contributors: contributorStats,
        totalContributions: typedContributors.reduce((s: number, c: any) => s + (c.contributions || 0), 0)
      },
      branches: {
        total: typedBranches.length,
        branches: typedBranches.map((b: any) => ({ 
          name: b.name, 
          protected: b.protected, 
          lastCommitSha: b.commit.sha 
        }))
      },
      releases: {
        total: typedReleases.length,
        latestRelease: typedReleases.length > 0 ? typedReleases[0]?.tag_name || null : null,
        latestReleaseDate: typedReleases.length > 0 ? typedReleases[0]?.published_at || null : null,
        releasesLast6Months: typedReleases.filter((r: any) => {
          return r.published_at && new Date(r.published_at) > new Date(Date.now() - 182 * 86400000);
        }).length
      },
      community: {
        hasReadme: !!readme,
        hasCodeOfConduct,
        healthPercentage: (typedCommunityProfile.data as any).health_percentage || 0
      },
      scores: this.calculateQualityScores({ 
        repoData: repoData.data, 
        commits: typedCommits, 
        pullRequests: typedPullRequests, 
        issues: typedIssues, 
        contributors: typedContributors, 
        hasReadme: !!readme, 
        hasCodeOfConduct 
      })
    };

    ResponseService.success(res, fullStats);
  } catch (error: any) {
    logger.error('Get full repo stats error:', error);
    ResponseService.error(res, error.message || 'Failed to get repository statistics', 500);
  }
};

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. GITHUB STATS API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  getContributorWeeklyStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const statsResponse = await retryStats(() => this.octokit.repos.getContributorsStats({ owner, repo }));

      if (!statsResponse?.data) {
        ResponseService.success(res, { status: 'computing', message: 'GitHub is computing stats. Please retry in a few seconds.', contributors: [] });
        return;
      }

      const contributors = (statsResponse.data as any[]).map((contributor: any) => {
        const weeks = contributor.weeks || [];
        const totals = weeks.reduce((acc: any, w: any) => ({ additions: acc.additions + (w.a || 0), deletions: acc.deletions + (w.d || 0), commits: acc.commits + (w.c || 0) }), { additions: 0, deletions: 0, commits: 0 });
        const activeWeeks = weeks.filter((w: any) => w.c > 0);
        const peakWeek    = weeks.reduce((peak: any, w: any) => w.c > (peak?.c || 0) ? w : peak, null);
        const recentWeeks = weeks.slice(-4);
        const recentCommits = recentWeeks.reduce((s: number, w: any) => s + (w.c || 0), 0);
        return {
          author: { login: contributor.author?.login, id: contributor.author?.id, avatarUrl: contributor.author?.avatar_url, htmlUrl: contributor.author?.html_url, type: contributor.author?.type },
          totals, activeWeeks: activeWeeks.length, totalWeeks: weeks.length,
          recentVelocity: { last4WeeksCommits: recentCommits, avgCommitsPerWeek: recentCommits / 4 },
          peakWeek: peakWeek ? { weekStartTimestamp: peakWeek.w, weekStartDate: new Date((peakWeek.w || 0) * 1000).toISOString(), commits: peakWeek.c, additions: peakWeek.a, deletions: peakWeek.d } : null,
          weeklyBreakdown: weeks.map((w: any) => ({ weekStartTimestamp: w.w, weekStartDate: new Date((w.w || 0) * 1000).toISOString(), additions: w.a || 0, deletions: w.d || 0, commits: w.c || 0 }))
        };
      }).sort((a: any, b: any) => b.totals.commits - a.totals.commits);

      ResponseService.success(res, {
        totalContributors: contributors.length,
        totalCommits:   contributors.reduce((s: number, c: any) => s + c.totals.commits, 0),
        totalAdditions: contributors.reduce((s: number, c: any) => s + c.totals.additions, 0),
        totalDeletions: contributors.reduce((s: number, c: any) => s + c.totals.deletions, 0),
        contributors
      });
    } catch (error: any) {
      logger.error('Get contributor weekly stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get contributor stats', 500);
    }
  };

  getParticipationStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const participation = await this.octokit.repos.getParticipationStats({ owner, repo });
      const allWeeks   = participation.data.all   || [];
      const ownerWeeks = participation.data.owner || [];
      const now = Date.now();

      const weeklyTimeline = allWeeks.map((allCount: number, index: number) => {
        const weeksAgo = allWeeks.length - 1 - index;
        const weekStart = new Date(now - weeksAgo * 7 * 86400000);
        return { weekNumber: index + 1, weekStart: weekStart.toISOString().split('T')[0], allContributors: allCount, owner: ownerWeeks[index] || 0, nonOwner: allCount - (ownerWeeks[index] || 0) };
      });

      const totalAll   = allWeeks.reduce((s: number, v: number) => s + v, 0);
      const totalOwner = ownerWeeks.reduce((s: number, v: number) => s + v, 0);
      const last4All   = allWeeks.slice(-4).reduce((s: number, v: number) => s + v, 0);
      const last4Owner = ownerWeeks.slice(-4).reduce((s: number, v: number) => s + v, 0);
      const peakAllIdx   = allWeeks.indexOf(Math.max(...allWeeks));
      const peakOwnerIdx = ownerWeeks.indexOf(Math.max(...ownerWeeks));

      ResponseService.success(res, {
        summary: { totalCommitsAllContributors: totalAll, totalCommitsOwner: totalOwner, totalCommitsNonOwner: totalAll - totalOwner, ownerContributionPercent: totalAll > 0 ? parseFloat(((totalOwner / totalAll) * 100).toFixed(2)) : 0, weeksCovered: allWeeks.length, activeWeeks: allWeeks.filter((v: number) => v > 0).length },
        velocity: { last4WeeksAll: last4All, last4WeeksOwner: last4Owner, avgPerWeekAll: parseFloat((totalAll / allWeeks.length).toFixed(2)), avgPerWeekOwner: parseFloat((totalOwner / ownerWeeks.length).toFixed(2)) },
        peaks: { allContributorsPeakWeek: weeklyTimeline[peakAllIdx] || null, ownerPeakWeek: weeklyTimeline[peakOwnerIdx] || null },
        raw: { all: allWeeks, owner: ownerWeeks },
        weeklyTimeline
      });
    } catch (error: any) {
      logger.error('Get participation stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get participation stats', 500);
    }
  };

  getCodeFrequencyStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const statsResponse = await retryStats(() => this.octokit.repos.getCodeFrequencyStats({ owner, repo }));
      const rawData: number[][] = statsResponse?.data || [];

      if (!rawData.length) {
        ResponseService.success(res, { status: 'computing', message: 'Stats are being computed. Retry shortly.', weeks: [] });
        return;
      }

      const validWeeks = rawData.filter((e): e is [number, number, number] => e.length >= 3 && typeof e[0] === 'number');

      const weeks = validWeeks.map(([ts, add, del]) => ({
        weekStartTimestamp: ts, weekStartDate: ts ? new Date(ts * 1000).toISOString().split('T')[0] : null,
        additions: add || 0, deletions: Math.abs(del || 0), netChange: (add || 0) + (del || 0)
      }));

      const totalAdditions = weeks.reduce((s, w) => s + w.additions, 0);
      const totalDeletions = weeks.reduce((s, w) => s + w.deletions, 0);
      const activeWeeks    = weeks.filter(w => w.additions > 0 || w.deletions > 0);
      const topChurnWeeks  = [...weeks].sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)).slice(0, 10);

      ResponseService.success(res, {
        summary: { totalAdditions, totalDeletions, netLines: totalAdditions - totalDeletions, totalChurn: totalAdditions + totalDeletions, weeksWithActivity: activeWeeks.length, totalWeeks: weeks.length, avgAdditionsPerActiveWeek: activeWeeks.length > 0 ? Math.round(totalAdditions / activeWeeks.length) : 0, avgDeletionsPerActiveWeek: activeWeeks.length > 0 ? Math.round(totalDeletions / activeWeeks.length) : 0 },
        topChurnWeeks, weeks
      });
    } catch (error: any) {
      logger.error('Get code frequency stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get code frequency stats', 500);
    }
  };

getPunchCardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    if (!owner || !repo) { 
      ResponseService.error(res, 'Owner and repository name are required', 400); 
      return; 
    }

    const punchCard = await this.octokit.repos.getPunchCardStats({ owner, repo });
    const rawData: number[][] = (punchCard.data as any) || [];

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
    const periodName = (hour: number): string => {
      if (hour < 6)  return 'late_night';
      if (hour < 12) return 'morning';
      if (hour < 17) return 'afternoon';
      if (hour < 21) return 'evening';
      return 'night';
    };

    const matrix: Record<string, Record<number, number>> = {};
    let totalCommits = 0;

    for (const entry of rawData) {
      const [day, hour, count] = entry as [number, number, number];
      if (day === undefined || hour === undefined || count === undefined) continue;
      if (day < 0 || day >= dayNames.length) continue;
      const dayName = dayNames[day];
      if (!dayName) continue;
      
      if (!matrix[dayName]) matrix[dayName] = {};
      matrix[dayName][hour] = (matrix[dayName][hour] || 0) + count;
      totalCommits += count;
    }

    const byDay = dayNames.map(dayName => {
      const hours = matrix[dayName] || {};
      const vals = Object.values(hours) as number[];
      const total = vals.reduce((s, v) => s + v, 0);
      const entries = Object.entries(hours) as [string, number][];
      const sortedEntries = entries.sort(([, a], [, b]) => b - a);
      const peak = sortedEntries[0];
      return {
        day: dayName as string,
        totalCommits: total,
        peakHour: peak ? parseInt(peak[0]) : null,
        peakHourCommits: peak ? peak[1] : 0,
        hourlyBreakdown: hours
      };
    });

    const byHour: Record<number, number> = {};
    const byPeriod: Record<string, number> = { late_night: 0, morning: 0, afternoon: 0, evening: 0, night: 0 };
    for (const entry of rawData) {
      const [day, hour, count] = entry as [number, number, number];
      if (hour !== undefined && count !== undefined) {
        byHour[hour] = (byHour[hour] || 0) + count;
        byPeriod[periodName(hour)] = (byPeriod[periodName(hour)] || 0) + count;
      }
    }

    let peakSlotData: { day: string; hour: number; count: number } | null = null;
    let maxCount = -1, maxDay = -1, maxHour = -1;
    for (const entry of rawData) {
      const [day, hour, count] = entry as [number, number, number];
      if (count !== undefined && count > maxCount && day !== undefined && day >= 0 && day < dayNames.length && hour !== undefined) {
        maxCount = count;
        maxDay = day;
        maxHour = hour;
      }
    }
    if (maxDay >= 0 && maxDay < dayNames.length) {
      const dayName = dayNames[maxDay];
      if (dayName && maxHour >= 0) {
        peakSlotData = { day: dayName, hour: maxHour, count: maxCount };
      }
    }

    const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const weekendNames = ['Saturday', 'Sunday'];
    const weekdayCommits = byDay.filter(d => weekdayNames.includes(d.day)).reduce((s, d) => s + d.totalCommits, 0);
    const weekendCommits = byDay.filter(d => weekendNames.includes(d.day)).reduce((s, d) => s + d.totalCommits, 0);

    // Find most active day
    const sortedByDay = [...byDay].sort((a, b) => b.totalCommits - a.totalCommits);
    const mostActiveDay = sortedByDay[0]?.day || null;

    // Find most active hour
    const sortedByHour = Object.entries(byHour).sort(([, a], [, b]) => b - a);
    const mostActiveHour = sortedByHour[0]?.[0] ? parseInt(sortedByHour[0][0]) : null;

    ResponseService.success(res, {
      summary: {
        totalCommits,
        mostActiveDay,
        mostActiveHour,
        peakSlot: peakSlotData,
        workingPattern: weekdayCommits > weekendCommits * 2 ? 'weekday_focused' : weekendCommits > weekdayCommits ? 'weekend_active' : 'balanced'
      },
      weekdayVsWeekend: {
        weekdayCommits, weekendCommits,
        weekdayPercent: totalCommits > 0 ? parseFloat(((weekdayCommits / totalCommits) * 100).toFixed(2)) : 0,
        weekendPercent: totalCommits > 0 ? parseFloat(((weekendCommits / totalCommits) * 100).toFixed(2)) : 0
      },
      byPeriod,
      byDay,
      byHour,
      heatmap: rawData.map(entry => {
        const [day, hour, count] = entry as [number, number, number];
        const safeDayName = (day !== undefined && day >= 0 && day < dayNames.length) ? dayNames[day] : 'Unknown';
        return {
          day: safeDayName as string,
          dayIndex: day ?? -1,
          hour: hour || 0,
          count: count || 0
        };
      })
    });
  } catch (error: any) {
    logger.error('Get punch card stats error:', error);
    ResponseService.error(res, error.message || 'Failed to get punch card stats', 500);
  }
};

getCommitActivityStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    if (!owner || !repo) { 
      ResponseService.error(res, 'Owner and repository name are required', 400); 
      return; 
    }

    const statsResponse = await retryStats(() => this.octokit.repos.getCommitActivityStats({ owner, repo }));
    const rawData: any[] = statsResponse?.data || [];

    if (!rawData.length) {
      ResponseService.success(res, { status: 'computing', message: 'Stats are being computed. Retry shortly.', weeks: [] });
      return;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeks = rawData.map((week: any) => ({
      weekStartTimestamp: week.week,
      weekStartDate: week.week ? new Date(week.week * 1000).toISOString().split('T')[0] : null,
      total: week.total || 0,
      days: (week.days || []).map((count: number, i: number) => ({ day: dayNames[i], count }))
    }));

    const totalCommits = weeks.reduce((s, w) => s + w.total, 0);
    const activeWeeks = weeks.filter(w => w.total > 0);
    
    // Find peak week safely - FIXED
    let peakWeekData = { date: '', commits: 0 };
    if (weeks.length > 0 && weeks[0]) {
      const initialPeak = weeks[0];
      const peakWeek = weeks.reduce((peak, w) => {
        if (!peak) return w;
        return w.total > peak.total ? w : peak;
      }, initialPeak);
      
      if (peakWeek) {
        peakWeekData = { 
          date: peakWeek.weekStartDate || '', 
          commits: peakWeek.total 
        };
      }
    }

    const dayTotals: Record<string, number> = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    };
    
    for (const week of weeks) {
      if (week.days) {
        for (const { day, count } of week.days) {
          if (day && count !== undefined) {
            dayTotals[day] = (dayTotals[day] || 0) + count;
          }
        }
      }
    }

    ResponseService.success(res, {
      summary: {
        totalCommits,
        activeWeeks: activeWeeks.length,
        inactiveWeeks: weeks.length - activeWeeks.length,
        avgCommitsPerWeek: parseFloat((totalCommits / Math.max(weeks.length, 1)).toFixed(2)),
        avgCommitsPerActiveWeek: parseFloat((totalCommits / Math.max(activeWeeks.length, 1)).toFixed(2)),
        peakWeek: peakWeekData
      },
      dayOfWeekTotals: dayTotals,
      weeks
    });
  } catch (error: any) {
    logger.error('Get commit activity stats error:', error);
    ResponseService.error(res, error.message || 'Failed to get commit activity stats', 500);
  }
};

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. TRAFFIC STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getTrafficStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const [views, clones, popularPaths, popularReferrers] = await Promise.all([
        this.octokit.repos.getViews({ owner, repo, per: 'day' }).catch(() => null),
        this.octokit.repos.getClones({ owner, repo, per: 'day' }).catch(() => null),
        this.octokit.repos.getTopPaths({ owner, repo }).catch(() => ({ data: [] })),
        this.octokit.repos.getTopReferrers({ owner, repo }).catch(() => ({ data: [] }))
      ]);

      if (!views && !clones) { ResponseService.error(res, 'Traffic data unavailable. Requires push access to the repository.', 403); return; }

      ResponseService.success(res, {
        views: {
          total: views?.data?.count || 0, unique: views?.data?.uniques || 0,
          daily: (views?.data?.views || []).map((v: any) => ({ date: v.timestamp?.split('T')[0], count: v.count, uniques: v.uniques }))
        },
        clones: {
          total: clones?.data?.count || 0, unique: clones?.data?.uniques || 0,
          daily: (clones?.data?.clones || []).map((c: any) => ({ date: c.timestamp?.split('T')[0], count: c.count, uniques: c.uniques }))
        },
        popularPaths: (popularPaths.data as any[]).map((p: any) => ({ path: p.path, title: p.title, count: p.count, uniques: p.uniques })),
        popularReferrers: (popularReferrers.data as any[]).map((r: any) => ({ referrer: r.referrer, count: r.count, uniques: r.uniques }))
      });
    } catch (error: any) {
      logger.error('Get traffic stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get traffic stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ACTIONS / CI-CD STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

 getActionsStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    if (!owner || !repo) { 
      ResponseService.error(res, 'Owner and repository name are required', 400); 
      return; 
    }

    const [workflowsResp, allRuns] = await Promise.all([
      this.octokit.actions.listRepoWorkflows({ owner, repo }).catch(() => ({ data: { workflows: [], total_count: 0 } })),
      paginateAll(this.octokit, (p) => this.octokit.actions.listWorkflowRunsForRepo(p), { owner, repo }, 'runs')
    ]);

    // Type the runs properly
    const typedRuns = allRuns as any[];
    const workflows = workflowsResp.data.workflows as any[];

    const workflowStats = workflows.map((wf: any) => {
      const wfRuns = typedRuns.filter((r: any) => r.workflow_id === wf.id);
      const successRuns   = wfRuns.filter((r: any) => r.conclusion === 'success');
      const failureRuns   = wfRuns.filter((r: any) => r.conclusion === 'failure');
      const cancelledRuns = wfRuns.filter((r: any) => r.conclusion === 'cancelled');
      const durations = wfRuns
        .filter((r: any) => r.created_at && r.updated_at && r.conclusion)
        .map((r: any) => (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000);
      const avgDuration = durations.length > 0 ? durations.reduce((s: number, v: number) => s + v, 0) / durations.length : 0;
      
      return {
        id: wf.id, 
        name: wf.name, 
        path: wf.path, 
        state: wf.state,
        createdAt: wf.created_at, 
        updatedAt: wf.updated_at,
        runs: { 
          total: wfRuns.length, 
          success: successRuns.length, 
          failure: failureRuns.length, 
          cancelled: cancelledRuns.length, 
          inProgress: wfRuns.filter((r: any) => r.status === 'in_progress').length, 
          successRate: wfRuns.length > 0 ? parseFloat(((successRuns.length / wfRuns.length) * 100).toFixed(2)) : 0 
        },
        avgDurationSeconds: parseFloat(avgDuration.toFixed(0)),
        lastRun: wfRuns.length > 0 && wfRuns[0] ? { 
          id: wfRuns[0].id, 
          status: wfRuns[0].status, 
          conclusion: wfRuns[0].conclusion, 
          branch: wfRuns[0].head_branch, 
          createdAt: wfRuns[0].created_at 
        } : null
      };
    });

    const successRuns   = typedRuns.filter((r: any) => r.conclusion === 'success').length;
    const failureRuns   = typedRuns.filter((r: any) => r.conclusion === 'failure').length;
    const cancelledRuns = typedRuns.filter((r: any) => r.conclusion === 'cancelled').length;

    ResponseService.success(res, {
      summary: {
        totalWorkflows: workflowsResp.data.total_count,
        activeWorkflows: workflows.filter((w: any) => w.state === 'active').length,
        totalRuns: typedRuns.length,
        overallSuccessRate: typedRuns.length > 0 ? parseFloat(((successRuns / typedRuns.length) * 100).toFixed(2)) : 0,
        byConclusion: { 
          success: successRuns, 
          failure: failureRuns, 
          cancelled: cancelledRuns, 
          other: typedRuns.length - successRuns - failureRuns - cancelledRuns 
        }
      },
      workflows: workflowStats,
      recentRuns: typedRuns.slice(0, 50).map((r: any) => ({
        id: r.id, 
        workflowId: r.workflow_id, 
        name: r.name, 
        status: r.status,
        conclusion: r.conclusion, 
        branch: r.head_branch, 
        commit: r.head_sha?.substring(0, 7),
        actor: r.actor?.login, 
        createdAt: r.created_at, 
        updatedAt: r.updated_at,
        durationSeconds: r.created_at && r.updated_at && r.conclusion 
          ? Math.round((new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000) 
          : null
      }))
    });
  } catch (error: any) {
    logger.error('Get actions stats error:', error);
    ResponseService.error(res, error.message || 'Failed to get Actions stats', 500);
  }
};

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. RELEASE STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getReleaseStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const releases = await paginateAll(this.octokit, (p) => this.octokit.repos.listReleases(p), { owner, repo }, 'releases');

      const releasesWithDownloads = releases.map((release: any) => {
        const totalDownloads = (release.assets || []).reduce((s: number, a: any) => s + (a.download_count || 0), 0);
        return {
          id: release.id, tagName: release.tag_name, name: release.name,
          isDraft: release.draft, isPrerelease: release.prerelease,
          publishedAt: release.published_at, createdAt: release.created_at,
          author: release.author?.login, totalDownloads,
          assets: (release.assets || []).map((a: any) => ({ name: a.name, size: a.size, downloadCount: a.download_count, contentType: a.content_type, downloadUrl: a.browser_download_url })),
          bodyLength: release.body?.length || 0, hasChangelog: (release.body?.length || 0) > 50
        };
      });

      const totalDownloads  = releasesWithDownloads.reduce((s: number, r: any) => s + r.totalDownloads, 0);
      const stableReleases  = releasesWithDownloads.filter((r: any) => !r.isDraft && !r.isPrerelease);
      const sortedDates     = stableReleases.filter((r: any) => r.publishedAt).map((r: any) => new Date(r.publishedAt).getTime()).sort((a, b) => b - a);

      let avgDaysBetweenReleases = 0;
      if (sortedDates.length > 1) {
        const gaps = sortedDates.slice(0, -1).map((d, i) => sortedDates[i + 1] !== undefined ? (d - sortedDates[i + 1]!) / 86400000 : 0).filter(g => g > 0);
        if (gaps.length > 0) avgDaysBetweenReleases = parseFloat((gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(1));
      }

      ResponseService.success(res, {
        summary: {
          total: releases.length, stable: stableReleases.length,
          prereleases: releasesWithDownloads.filter((r: any) => r.isPrerelease).length,
          drafts: releasesWithDownloads.filter((r: any) => r.isDraft).length,
          totalDownloads, avgDaysBetweenReleases,
          latestRelease: stableReleases[0] || null
        },
        releases: releasesWithDownloads
      });
    } catch (error: any) {
      logger.error('Get release stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get release stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. MILESTONE STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getMilestoneStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const [openMilestones, closedMilestones] = await Promise.all([
        paginateAll(this.octokit, (p) => this.octokit.issues.listMilestones(p), { owner, repo, state: 'open' }, 'milestones-open'),
        paginateAll(this.octokit, (p) => this.octokit.issues.listMilestones(p), { owner, repo, state: 'closed' }, 'milestones-closed')
      ]);

      const allMilestones = [...openMilestones, ...closedMilestones];
      const milestoneStats = allMilestones.map((ms: any) => {
        const total = (ms.open_issues || 0) + (ms.closed_issues || 0);
        const completionRate = total > 0 ? parseFloat(((ms.closed_issues / total) * 100).toFixed(2)) : 0;
        const isOverdue = ms.due_on && ms.state === 'open' && new Date(ms.due_on) < new Date();
        return { id: ms.number, title: ms.title, description: ms.description, state: ms.state, openIssues: ms.open_issues, closedIssues: ms.closed_issues, totalIssues: total, completionRate, dueDate: ms.due_on, isOverdue, createdAt: ms.created_at, updatedAt: ms.updated_at, closedAt: ms.closed_at, creator: ms.creator?.login };
      });

      ResponseService.success(res, {
        summary: {
          total: allMilestones.length, open: openMilestones.length, closed: closedMilestones.length,
          overdue: milestoneStats.filter(m => m.isOverdue).length,
          avgCompletionRate: milestoneStats.length > 0 ? parseFloat((milestoneStats.reduce((s, m) => s + m.completionRate, 0) / milestoneStats.length).toFixed(2)) : 0
        },
        milestones: milestoneStats
      });
    } catch (error: any) {
      logger.error('Get milestone stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get milestone stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. DEPLOYMENT STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getDeploymentStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const [deployments, environments] = await Promise.all([
        paginateAll(this.octokit, (p) => this.octokit.repos.listDeployments(p), { owner, repo }, 'deployments'),
        this.octokit.repos.getAllEnvironments({ owner, repo }).catch(() => ({ data: { environments: [], total_count: 0 } }))
      ]);

      const deploymentsWithStatus = await Promise.all(
        deployments.slice(0, 20).map(async (deployment: any) => {
          const statuses = await this.octokit.repos.listDeploymentStatuses({ owner, repo, deployment_id: deployment.id, per_page: 5 }).catch(() => ({ data: [] }));
          const latest = statuses.data[0];
          return {
            id: deployment.id, sha: deployment.sha?.substring(0, 7), ref: deployment.ref,
            task: deployment.task, environment: deployment.environment, description: deployment.description,
            creator: deployment.creator?.login, createdAt: deployment.created_at, updatedAt: deployment.updated_at,
            latestStatus: latest ? { state: latest.state, description: latest.description, environmentUrl: latest.environment_url, logUrl: latest.log_url, createdAt: latest.created_at } : null
          };
        })
      );

      const byEnvironment: Record<string, number> = {};
      for (const d of deployments as any[]) byEnvironment[d.environment] = (byEnvironment[d.environment] || 0) + 1;

      ResponseService.success(res, {
        summary: { totalDeployments: deployments.length, totalEnvironments: (environments.data as any).total_count || 0, byEnvironment },
        environments: ((environments.data as any).environments || []).map((e: any) => ({ id: e.id, name: e.name, url: e.html_url, createdAt: e.created_at, updatedAt: e.updated_at })),
        recentDeployments: deploymentsWithStatus
      });
    } catch (error: any) {
      logger.error('Get deployment stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get deployment stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. USER / CANDIDATE PROFILE STATS
  // ═══════════════════════════════════════════════════════════════════════════

  getUserProfileStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { username } = req.params;
      if (!username) { ResponseService.error(res, 'GitHub username is required', 400); return; }

      const [user, repos, events] = await Promise.all([
        this.octokit.users.getByUsername({ username }),
        paginateAll(this.octokit, (p) => this.octokit.repos.listForUser(p), { username, sort: 'updated' }, 'repos'),
        paginateAll(this.octokit, (p) => this.octokit.activity.listPublicEventsForUser(p), { username }, 'events')
      ]);

      const ownRepos   = repos.filter((r: any) => !r.fork);
      const forkedRepos = repos.filter((r: any) => r.fork);

      const languageBytes: Record<string, number> = {};
      for (const repo of repos as any[]) {
        if (repo.language) languageBytes[repo.language] = (languageBytes[repo.language] || 0) + (repo.size || 0);
      }
      const totalSize = Object.values(languageBytes).reduce((s, v) => s + v, 0);
      const languageDistribution = Object.entries(languageBytes).map(([lang, size]) => ({ language: lang, size, percentage: totalSize > 0 ? parseFloat(((size / totalSize) * 100).toFixed(2)) : 0 })).sort((a, b) => b.size - a.size);

      const totalStars    = (repos as any[]).reduce((s, r) => s + (r.stargazers_count || 0), 0);
      const totalForks    = (repos as any[]).reduce((s, r) => s + (r.forks_count || 0), 0);
      const totalWatchers = (repos as any[]).reduce((s, r) => s + (r.watchers_count || 0), 0);

      const topStarredRepos = [...ownRepos].sort((a: any, b: any) => (b.stargazers_count || 0) - (a.stargazers_count || 0)).slice(0, 10).map((r: any) => ({
        name: r.name, fullName: r.full_name, description: r.description,
        stars: r.stargazers_count, forks: r.forks_count, language: r.language,
        url: r.html_url, updatedAt: r.updated_at, topics: r.topics
      }));

      const eventTypes: Record<string, number> = {};
      for (const event of events as any[]) eventTypes[event.type || 'unknown'] = (eventTypes[event.type || 'unknown'] || 0) + 1;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
      const recentEvents  = (events as any[]).filter(e => new Date(e.created_at || '') > thirtyDaysAgo);
      const activeRepos   = (repos as any[]).filter(r => r.updated_at && new Date(r.updated_at) > thirtyDaysAgo);

      ResponseService.success(res, {
        profile: {
          login: user.data.login, name: user.data.name, bio: user.data.bio,
          company: user.data.company, location: user.data.location, email: user.data.email,
          blog: user.data.blog, twitterUsername: user.data.twitter_username,
          avatarUrl: user.data.avatar_url, htmlUrl: user.data.html_url,
          type: user.data.type, siteAdmin: user.data.site_admin,
          createdAt: user.data.created_at, updatedAt: user.data.updated_at
        },
        social: { followers: user.data.followers, following: user.data.following, publicRepos: user.data.public_repos, publicGists: user.data.public_gists },
        repositories: { total: repos.length, owned: ownRepos.length, forked: forkedRepos.length, totalStars, totalForks, totalWatchers, activeInLast30Days: activeRepos.length, topStarred: topStarredRepos },
        languages: { primary: languageDistribution[0]?.language || null, distribution: languageDistribution.slice(0, 10) },
        activity: {
          recentEventCount: recentEvents.length, eventTypes,
          mostRecentEvent: events[0] ? { type: (events as any[])[0].type, repo: (events as any[])[0].repo?.name, createdAt: (events as any[])[0].created_at } : null
        }
      });
    } catch (error: any) {
      logger.error('Get user profile stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get user profile stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. DEPENDENCY GRAPH / SBOM
  // ═══════════════════════════════════════════════════════════════════════════

  getDependencyStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const sbom = await this.octokit.dependencyGraph.exportSbom({ owner, repo }).catch(() => null);
      if (!sbom) { ResponseService.error(res, 'Dependency graph unavailable for this repository.', 404); return; }

      const packages: any[] = (sbom.data as any).sbom?.packages || [];
      const byEcosystem: Record<string, number> = {};
      for (const pkg of packages) {
        const ecosystem = pkg.name?.split(':')[0] || 'unknown';
        byEcosystem[ecosystem] = (byEcosystem[ecosystem] || 0) + 1;
      }

      ResponseService.success(res, {
        summary: { totalPackages: packages.length, byEcosystem, spdxVersion: (sbom.data as any).sbom?.spdxVersion, dataLicense: (sbom.data as any).sbom?.dataLicense, createdAt: (sbom.data as any).sbom?.creationInfo?.created },
        packages: packages.map((pkg: any) => ({ spdxId: pkg.SPDXID, name: pkg.name, version: pkg.versionInfo, downloadLocation: pkg.downloadLocation, filesAnalyzed: pkg.filesAnalyzed, licenseConcluded: pkg.licenseConcluded, licenseDeclared: pkg.licenseDeclared, copyrightText: pkg.copyrightText }))
      });
    } catch (error: any) {
      logger.error('Get dependency stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get dependency stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. COLLABORATOR PERMISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  getCollaboratorStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const collaborators = await paginateAll(this.octokit, (p) => this.octokit.repos.listCollaborators(p), { owner, repo }, 'collaborators');

      const byPermission: Record<string, number> = {};
      const collaboratorList = collaborators.map((c: any) => {
        const perm = c.role_name || (Object.entries(c.permissions || {}).filter(([, v]) => v).map(([k]) => k).pop() || 'read');
        byPermission[perm] = (byPermission[perm] || 0) + 1;
        return { login: c.login, id: c.id, type: c.type, avatarUrl: c.avatar_url, htmlUrl: c.html_url, roleName: c.role_name, permissions: c.permissions };
      });

      ResponseService.success(res, { summary: { total: collaboratorList.length, byPermission }, collaborators: collaboratorList });
    } catch (error: any) {
      logger.error('Get collaborator stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get collaborator stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. ISSUE STATISTICS (detailed)
  // ═══════════════════════════════════════════════════════════════════════════

  getIssueStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }
      const issues = await paginateAll(this.octokit, (p) => this.octokit.issues.listForRepo(p), { owner, repo, state: 'all' }, 'issues');
      ResponseService.success(res, this.calculateDetailedIssueStats(issues));
    } catch (error: any) {
      logger.error('Get issue stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get issue statistics', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 18. CONTRIBUTOR STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  getContributorStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { owner, repo } = req.params;
    if (!owner || !repo) { 
      ResponseService.error(res, 'Owner and repository name are required', 400); 
      return; 
    }

    const contributors = await paginateAll(this.octokit, (p) => this.octokit.repos.listContributors(p), { owner, repo }, 'contributors');

    const contributorsWithActivity = await Promise.all(
      contributors.map(async (contributor: any) => {
        const commitsOptions: any = { owner, repo };
        if (contributor.login) commitsOptions.author = contributor.login;
        
        // Type the commits array properly
        const commits: any[] = await paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), commitsOptions, `commits-${contributor.login}`).catch(() => []);
        
        return {
          username: contributor.login, 
          id: contributor.id,
          contributions: contributor.contributions, 
          avatarUrl: contributor.avatar_url,
          profileUrl: contributor.html_url, 
          type: contributor.type,
          // Add null checks with optional chaining
          firstCommitDate: commits.length > 0 ? commits[commits.length - 1]?.commit?.author?.date : null,
          lastCommitDate: commits.length > 0 ? commits[0]?.commit?.author?.date : null,
          commitCount: commits.length
        };
      })
    );

    const sorted = contributorsWithActivity.sort((a, b) => b.contributions - a.contributions);

    ResponseService.success(res, {
      totalContributors: sorted.length,
      totalContributions: sorted.reduce((s, c) => s + c.contributions, 0),
      topContributors: sorted.slice(0, 10),
      allContributors: sorted,
      contributionDistribution: this.calculateContributionDistribution(sorted)
    });
  } catch (error: any) {
    logger.error('Get contributor stats error:', error);
    ResponseService.error(res, error.message || 'Failed to get contributor statistics', 500);
  }
};

  // ═══════════════════════════════════════════════════════════════════════════
  // 19. ALL STATS IN ONE CALL
  // ═══════════════════════════════════════════════════════════════════════════

  getAllStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }

      const safe = async (fn: () => Promise<any>, label: string) => {
        try { return await fn(); } catch (err) { logger.warn(`getAllStats: ${label} failed:`, err); return null; }
      };

      const [fullStats, contributorWeekly, participation, codeFrequency, punchCard, commitActivity, releaseStats, milestoneStats, deploymentStats, actionsStats] = await Promise.all([
        safe(() => this.buildFullStats(owner, repo),              'fullStats'),
        safe(() => this.buildContributorWeeklyData(owner, repo),  'contributorWeekly'),
        safe(() => this.buildParticipationData(owner, repo),      'participation'),
        safe(() => this.buildCodeFrequencyData(owner, repo),      'codeFrequency'),
        safe(() => this.buildPunchCardData(owner, repo),          'punchCard'),
        safe(() => this.buildCommitActivityData(owner, repo),     'commitActivity'),
        safe(() => this.buildReleaseData(owner, repo),            'releaseStats'),
        safe(() => this.buildMilestoneData(owner, repo),          'milestoneStats'),
        safe(() => this.buildDeploymentData(owner, repo),         'deploymentStats'),
        safe(() => this.buildActionsData(owner, repo),            'actionsStats')
      ]);

      ResponseService.success(res, {
        generatedAt: new Date().toISOString(),
        repository: `${owner}/${repo}`,
        fullStats,
        githubStatsApi: { contributorWeekly, participation, codeFrequency, punchCard, commitActivity },
        releases: releaseStats, milestones: milestoneStats,
        deployments: deploymentStats, actions: actionsStats
      });
    } catch (error: any) {
      logger.error('Get all stats error:', error);
      ResponseService.error(res, error.message || 'Failed to get all stats', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 20. CODE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  getFileContent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      const filePath = req.params[0] || '';
      const { ref } = req.query;

      if (!owner || !repo || !filePath) { ResponseService.error(res, 'Owner, repository, and file path are required', 400); return; }

      const options: any = { owner, repo, path: filePath };
      if (ref) options.ref = ref as string;

      const file = await this.octokit.repos.getContent(options);

      if (Array.isArray(file.data)) {
        ResponseService.success(res, {
          type: 'directory', path: filePath,
          entries: file.data.map((item: any) => ({ name: item.name, path: item.path, type: item.type, size: item.size, downloadUrl: item.download_url, gitUrl: item.git_url, htmlUrl: item.html_url }))
        });
        return;
      }

      const fileData = file.data as any;
      const decodedContent = fileData.content ? Buffer.from(fileData.content, 'base64').toString('utf-8') : null;

      ResponseService.success(res, { type: 'file', name: fileData.name, path: fileData.path, sha: fileData.sha, size: fileData.size, content: decodedContent, encoding: fileData.encoding || 'base64', downloadUrl: fileData.download_url, gitUrl: fileData.git_url, htmlUrl: fileData.html_url });
    } catch (error: any) {
      logger.error('Get file content error:', error);
      if (error.status === 404) { ResponseService.error(res, 'File or repository not found', 404); return; }
      ResponseService.error(res, error.message || 'Failed to get file content', 500);
    }
  };

  getTree = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo, tree_sha } = req.params;
      const { recursive } = req.query;
      if (!owner || !repo || !tree_sha) { ResponseService.error(res, 'Owner, repository, and tree SHA are required', 400); return; }
      const options: any = { owner, repo, tree_sha };
      if (recursive === 'true') options.recursive = 'true';
      const tree = await this.octokit.git.getTree(options);
      ResponseService.success(res, { sha: tree.data.sha, url: tree.data.url, truncated: tree.data.truncated, tree: tree.data.tree.map((item: any) => ({ path: item.path, mode: item.mode, type: item.type, sha: item.sha, size: item.size, url: item.url })) });
    } catch (error: any) {
      logger.error('Get tree error:', error);
      ResponseService.error(res, error.message || 'Failed to get repository tree', 500);
    }
  };

  getCommitDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo, commit_sha } = req.params;
      if (!owner || !repo || !commit_sha) { ResponseService.error(res, 'Owner, repository, and commit SHA are required', 400); return; }
      const commit = await this.octokit.repos.getCommit({ owner, repo, ref: commit_sha });
      ResponseService.success(res, {
        sha: commit.data.sha, url: commit.data.html_url,
        author: commit.data.commit.author, committer: commit.data.commit.committer,
        message: commit.data.commit.message, commentCount: commit.data.commit.comment_count,
        tree: commit.data.commit.tree, verification: commit.data.commit.verification,
        files: commit.data.files?.map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes, rawUrl: f.raw_url, blobUrl: f.blob_url, patch: f.patch })),
        stats: commit.data.stats, parents: commit.data.parents
      });
    } catch (error: any) {
      logger.error('Get commit details error:', error);
      ResponseService.error(res, error.message || 'Failed to get commit details', 500);
    }
  };

  getReadme = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo } = req.params;
      const { ref } = req.query;
      if (!owner || !repo) { ResponseService.error(res, 'Owner and repository name are required', 400); return; }
      const options: any = { owner, repo };
      if (ref) options.ref = ref as string;
      const readme = await this.octokit.repos.getReadme(options);
      const content = Buffer.from(readme.data.content, 'base64').toString('utf-8');
      ResponseService.success(res, { name: readme.data.name, path: readme.data.path, sha: readme.data.sha, size: readme.data.size, content, encoding: 'base64', htmlUrl: readme.data.html_url, downloadUrl: readme.data.download_url });
    } catch (error: any) {
      logger.error('Get readme error:', error);
      if (error.status === 404) { ResponseService.error(res, 'README not found for this repository', 404); return; }
      ResponseService.error(res, error.message || 'Failed to get README', 500);
    }
  };

  searchCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { q, per_page = '100', page = '1' } = req.query;
      if (!q) { ResponseService.error(res, 'Search query is required', 400); return; }
      const results = await this.octokit.search.code({ q: q as string, per_page: parseInt(per_page as string), page: parseInt(page as string) });
      ResponseService.success(res, {
        total: results.data.total_count, incomplete: results.data.incomplete_results,
        items: results.data.items.map((item: any) => ({ name: item.name, path: item.path, sha: item.sha, url: item.html_url, gitUrl: item.git_url, repository: { name: item.repository.name, fullName: item.repository.full_name, owner: item.repository.owner.login } }))
      });
    } catch (error: any) {
      logger.error('Search code error:', error);
      ResponseService.error(res, error.message || 'Failed to search code', 500);
    }
  };

  compareCommits = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { owner, repo, base, head } = req.params;
      if (!owner || !repo || !base || !head) { ResponseService.error(res, 'Owner, repository, base, and head are required', 400); return; }
      const comparison = await this.octokit.repos.compareCommits({ owner, repo, base, head });
      ResponseService.success(res, {
        url: comparison.data.html_url, diffUrl: comparison.data.diff_url, patchUrl: comparison.data.patch_url,
        baseCommit: comparison.data.base_commit, mergeBaseCommit: comparison.data.merge_base_commit,
        status: comparison.data.status, aheadBy: comparison.data.ahead_by, behindBy: comparison.data.behind_by,
        totalCommits: comparison.data.total_commits, commits: comparison.data.commits,
        files: comparison.data.files?.map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes, patch: f.patch }))
      });
    } catch (error: any) {
      logger.error('Compare commits error:', error);
      ResponseService.error(res, error.message || 'Failed to compare commits', 500);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 21. GET EVERYTHING — full repo + ALL commits paginated + full stats
  // ═══════════════════════════════════════════════════════════════════════════

getEverything = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { owner, repo } = req.params;
    const { includeContent = 'true', maxFiles = '200' } = req.query;

    if (!owner || !repo) { 
      ResponseService.error(res, 'Owner and repository name are required', 400); 
      return; 
    }

    const maxFilesToFetch = parseInt(maxFiles as string);
    const shouldIncludeContent = includeContent === 'true';

    // ── fetch ALL commits (full pagination) + all other data ──────────────
    const [
      repoData,
      allCommits,
      pullRequests,
      issues,
      contributors,
      releases,
      branches,
      languages,
      topics,
      communityProfile,
      readme
    ] = await Promise.all([
      this.octokit.repos.get({ owner, repo }).catch(() => null),
      paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), { owner, repo }, 'all-commits'),
      paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs'),
      paginateAll(this.octokit, (p) => this.octokit.issues.listForRepo(p), { owner, repo, state: 'all' }, 'issues'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listContributors(p), { owner, repo }, 'contributors'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listReleases(p), { owner, repo }, 'releases'),
      paginateAll(this.octokit, (p) => this.octokit.repos.listBranches(p), { owner, repo }, 'branches'),
      this.octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
      this.octokit.repos.getAllTopics({ owner, repo }).catch(() => ({ data: { names: [] } })),
      this.octokit.repos.getCommunityProfileMetrics({ owner, repo }).catch(() => ({ data: {} })),
      this.octokit.repos.getReadme({ owner, repo }).catch(() => null)
    ]);

    if (!repoData) { 
      ResponseService.error(res, 'Repository not found', 404); 
      return; 
    }

    // Type the arrays properly
    const typedReleases = releases as any[];
    const typedCommits = allCommits as any[];
    const typedPullRequests = pullRequests as any[];
    const typedIssues = issues as any[];
    const typedContributors = contributors as any[];
    const typedBranches = branches as any[];
    const typedTopics = topics as any;
    const typedCommunityProfile = communityProfile as any;

    // ── get full repository tree + optional file content ──────────────────
    const defaultBranch = repoData.data.default_branch;
    let tree: any[] = [];
    let filesWithContent: any[] = [];

    const branchRef = await this.octokit.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` }).catch(() => null);

    if (branchRef) {
      const fullTree = await this.octokit.git.getTree({ owner, repo, tree_sha: branchRef.data.object.sha, recursive: 'true' }).catch(() => null);
      if (fullTree) {
        tree = fullTree.data.tree;
        if (shouldIncludeContent) {
          const blobs = tree.filter((item: any) => item.type === 'blob').slice(0, maxFilesToFetch);
          filesWithContent = (await Promise.all(
            blobs.map(async (item: any) => {
              try {
                const cr = await this.octokit.repos.getContent({ owner, repo, path: item.path, ref: defaultBranch }).catch(() => null);
                if (!cr || Array.isArray(cr.data) || cr.data.type !== 'file') return null;
                const fd = cr.data as any;
                const decoded = fd.content ? Buffer.from(fd.content, 'base64').toString('utf-8') : null;
                return { path: item.path, name: item.path.split('/').pop(), size: item.size, sha: item.sha, content: decoded, contentPreview: decoded?.substring(0, 500) || null };
              } catch { 
                return { path: item.path, name: item.path.split('/').pop(), size: item.size, sha: item.sha, content: null, error: 'Could not fetch content' }; 
              }
            })
          )).filter(Boolean) as any[];
        }
      }
    }

    // ── compute all metrics from full commit history ───────────────────────
    const commitStreaks = this.calculateCommitStreaks(typedCommits);
    const commitFrequency = this.calculateCommitFrequency(typedCommits);
    const avgCommitsPerWeek = this.calculateAvgCommitsPerWeek(typedCommits);
    const dailyCommits = this.calculateDailyCommits(typedCommits);
    const weeklyCommits = this.calculateWeeklyCommits(typedCommits);
    const monthlyCommits = this.calculateMonthlyCommits(typedCommits);
    const yearlyCommits = this.calculateYearlyCommits(typedCommits);
    const commitsByHour = this.calculateCommitsByHour(typedCommits);
    const commitsByDayOfWeek = this.calculateCommitsByDayOfWeek(typedCommits);
    const commitsByMonth = this.calculateCommitsByMonth(typedCommits);
    const commitsByYear = this.calculateCommitsByYear(typedCommits);
    const commitsByWeek = this.calculateCommitsByWeek(typedCommits);
    const commitsByDate = this.calculateCommitsByDate(typedCommits);
    const commitsByAuthor = this.calculateCommitsByAuthor(typedCommits);
    const topAuthors = this.getTopAuthors(typedCommits, 10);
    const commitTimeline = this.calculateCommitTimeline(typedCommits);
    const fileChangeStats = this.calculateFileChangeStats(typedCommits);
    const commitMessageAnalysis = this.analyzeCommitMessages(typedCommits);

    const firstCommitDate = typedCommits.length > 0 ? typedCommits[typedCommits.length - 1]?.commit?.author?.date : null;
    const lastCommitDate = typedCommits.length > 0 ? typedCommits[0]?.commit?.author?.date : null;
    const recentCommitDetails = await Promise.all(
      typedCommits.slice(0, 20).map(async (c: any) => {
        const detail = await this.octokit.repos.getCommit({ owner, repo, ref: c.sha }).catch(() => null);
        const data = detail?.data || c;
        return {
          sha: data.sha || c.sha,
          shortSha: (data.sha || c.sha || '').substring(0, 7),
          message: data.commit?.message || c.commit?.message || '',
          author: data.commit?.author?.name || c.commit?.author?.name || data.author?.login || c.author?.login || 'unknown',
          authorEmail: data.commit?.author?.email || c.commit?.author?.email || null,
          authorLogin: data.author?.login || c.author?.login || null,
          committer: data.commit?.committer?.name || c.commit?.committer?.name || data.committer?.login || c.committer?.login || null,
          date: data.commit?.author?.date || c.commit?.author?.date || null,
          committedDate: data.commit?.committer?.date || c.commit?.committer?.date || null,
          url: data.html_url || c.html_url,
          avatarUrl: data.author?.avatar_url || c.author?.avatar_url || null,
          stats: data.stats ? {
            additions: data.stats.additions || 0,
            deletions: data.stats.deletions || 0,
            total: data.stats.total || 0
          } : null,
          files: (data.files || []).map((f: any) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions || 0,
            deletions: f.deletions || 0,
            changes: f.changes || 0,
            patch: f.patch || null,
            rawUrl: f.raw_url || null,
            blobUrl: f.blob_url || null
          }))
        };
      })
    );

    let totalDays = 0, totalWeeks = 0, totalMonths = 0, totalYears = 0;
    if (firstCommitDate && lastCommitDate) {
      const first = new Date(firstCommitDate), last = new Date(lastCommitDate);
      const ms = last.getTime() - first.getTime();
      totalDays = Math.ceil(ms / 86400000);
      totalWeeks = Math.ceil(ms / (86400000 * 7));
      totalMonths = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth());
      totalYears = last.getFullYear() - first.getFullYear();
    }

    const issueStats = this.calculateIssueStats(typedIssues);
    const contributorStats = this.calculateContributorStats(typedContributors);
    const languagePercentages = this.calculateLanguagePercentages(languages.data);
    const hasCodeOfConduct = !!(typedCommunityProfile.data as any)?.files?.code_of_conduct;
    const qualityScores = this.calculateQualityScores({ 
      repoData: repoData.data, 
      commits: typedCommits, 
      pullRequests: typedPullRequests, 
      issues: typedIssues, 
      contributors: typedContributors, 
      hasReadme: !!readme, 
      hasCodeOfConduct 
    });

    // ── TRANSFORMED RESPONSE FOR FRONTEND ──────────────────────────────────
    // This ensures the frontend receives properly formatted data
    const transformedResponse = {
      // Repository basic info
      repository: {
        name: repoData.data.name,
        fullName: repoData.data.full_name,
        owner: repoData.data.owner.login,
        description: repoData.data.description,
        homepage: repoData.data.homepage,
        defaultBranch: repoData.data.default_branch,
        isPrivate: repoData.data.private,
        isFork: repoData.data.fork,
        isArchived: repoData.data.archived,
        createdAt: repoData.data.created_at,
        updatedAt: repoData.data.updated_at,
        pushedAt: repoData.data.pushed_at,
        size: repoData.data.size,
        stars: repoData.data.stargazers_count,
        forks: repoData.data.forks_count,
        watchers: repoData.data.watchers_count,
        openIssues: repoData.data.open_issues_count,
        license: repoData.data.license?.spdx_id,
        topics: typedTopics.data.names,
        cloneUrl: repoData.data.clone_url,
        sshUrl: repoData.data.ssh_url
      },
      
      // Social metrics (simplified for frontend)
      social: {
        stars: repoData.data.stargazers_count,
        forks: repoData.data.forks_count,
        watchers: repoData.data.watchers_count,
        openIssues: repoData.data.open_issues_count,
        subscribers: 0
      },
      
      // Languages
      languages: {
        total: Object.values(languages.data).reduce((a: number, b: number) => a + b, 0),
        primary: languagePercentages.primary,
        breakdown: languagePercentages.breakdown,
        percentages: languagePercentages.percentages
      },
      
      // Commits data (simplified for frontend)
      commits: {
        total: typedCommits.length,
        firstCommitDate: firstCommitDate,
        lastCommitDate: lastCommitDate,
        averageCommitsPerWeek: avgCommitsPerWeek,
        commitFrequency: commitFrequency,
        longestStreak: commitStreaks.longestStreak,
        currentStreak: commitStreaks.currentStreak,
        commitsByHour: commitsByHour,
        commitsByDayOfWeek: commitsByDayOfWeek,
        commitsByMonth: commitsByMonth,
        commitsByYear: commitsByYear,
        topAuthors: topAuthors,
        recentCommits: recentCommitDetails
      },
      
      // Pull Requests data (simplified for frontend)
      pullRequests: {
        total: typedPullRequests.length,
        open: typedPullRequests.filter((p: any) => p.state === 'open').length,
        closed: typedPullRequests.filter((p: any) => p.state === 'closed' && !p.merged_at).length,
        merged: typedPullRequests.filter((p: any) => p.merged_at).length,
        mergeRate: this.calculateMergeRate(typedPullRequests),
        averageTimeToMergeHours: this.calculateAvgTimeToMerge(typedPullRequests),
        topContributors: this.getTopPRContributors(typedPullRequests, 10),
        recentPRs: typedPullRequests.slice(0, 10).map((pr: any) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          user: { login: pr.user?.login },
          created_at: pr.created_at,
          merged_at: pr.merged_at,
          closed_at: pr.closed_at,
          comments: pr.comments || 0,
          head: { ref: pr.head?.ref || 'unknown' },
          base: { ref: pr.base?.ref || 'main' },
          url: pr.html_url
        }))
      },
      
      // Issues data (simplified for frontend)
      issues: {
        total: typedIssues.length,
        open: typedIssues.filter((i: any) => i.state === 'open').length,
        closed: typedIssues.filter((i: any) => i.state === 'closed').length,
        averageResolutionTimeHours: issueStats.avgResolutionTime,
        medianResolutionTimeHours: issueStats.medianResolutionTime,
        issuesByLabel: issueStats.issuesByLabel,
        topIssueCreators: issueStats.topCreators,
        recentIssues: typedIssues.slice(0, 10).map((i: any) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          user: { login: i.user?.login },
          created_at: i.created_at,
          closed_at: i.closed_at,
          comments: i.comments,
          body: i.body || '',
          labels: i.labels?.map((l: any) => ({ name: l.name, color: l.color })) || [],
          url: i.html_url
        }))
      },
      
      // Contributors data (simplified for frontend)
      contributors: {
        total: typedContributors.length,
        totalContributions: typedContributors.reduce((s: number, c: any) => s + (c.contributions || 0), 0),
        busFactor: this.calculateBusFactor(typedContributors, 0.5),
        topContributors: contributorStats.slice(0, 10).map((c: any) => ({
          login: c.username,
          contributions: c.contributions,
          avatar_url: c.avatarUrl,
          type: c.type
        }))
      },
      
      // Branches
      branches: {
        total: typedBranches.length,
        list: typedBranches.map((b: any) => ({ name: b.name, protected: b.protected }))
      },
      
      // Releases
      releases: {
        total: typedReleases.length,
        latestRelease: typedReleases.length > 0 ? typedReleases[0]?.tag_name : null,
        latestReleaseDate: typedReleases.length > 0 ? typedReleases[0]?.published_at : null,
        totalDownloads: typedReleases.reduce((s: number, r: any) => 
          s + (r.assets || []).reduce((a: number, asset: any) => a + (asset.download_count || 0), 0), 0)
      },
      
      // Community metrics
      community: {
        hasReadme: !!readme,
        hasCodeOfConduct: hasCodeOfConduct,
        healthPercentage: (typedCommunityProfile.data as any).health_percentage || 0,
        readmeContent: readme ? Buffer.from(readme.data.content, 'base64').toString('utf-8').substring(0, 10000) : null
      },
      
      // Quality scores
      scores: {
        overall: qualityScores.overall,
        documentation: qualityScores.documentation,
        activity: qualityScores.activity,
        community: qualityScores.community,
        issueManagement: qualityScores.issueManagement || 50
      },
      
      // Code/files data
      code: {
        totalFiles: tree.filter((i: any) => i.type === 'blob').length,
        totalDirectories: tree.filter((i: any) => i.type === 'tree').length,
        totalSize: tree.reduce((s: number, i: any) => s + (i.size || 0), 0),
        structure: tree.map((i: any) => ({ path: i.path, type: i.type, size: i.size, sha: i.sha?.substring(0, 7) })),
        files: filesWithContent,
        treeSha: branchRef?.data.object.sha || null
      },
      
      // Participation stats for charts
      participation: {
        all: weeklyCommits.map((w: any) => w.count),
        owner: weeklyCommits.map((w: any) => 0)
      },
      
      // Summary stats
      summary: {
        totalCommits: typedCommits.length,
        totalFiles: tree.filter((i: any) => i.type === 'blob').length,
        totalContributors: typedContributors.length,
        totalStars: repoData.data.stargazers_count,
        totalForks: repoData.data.forks_count,
        primaryLanguage: languagePercentages.primary,
        lastActivityDays: Math.floor((Date.now() - new Date(repoData.data.pushed_at).getTime()) / 86400000),
        isActive: new Date(repoData.data.pushed_at) > new Date(Date.now() - 30 * 86400000),
        conventionalCommitPercentage: typedCommits.length > 0 
          ? parseFloat(((commitMessageAnalysis.conventionalCommits / typedCommits.length) * 100).toFixed(1)) 
          : 0
      },
      
      // Meta info
      meta: {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        includedContent: shouldIncludeContent,
        filesFetched: filesWithContent.length,
        totalFilesAvailable: tree.filter((i: any) => i.type === 'blob').length
      }
    };

    // Log for debugging
    console.log(`📊 getEverything completed for ${owner}/${repo} in ${Date.now() - startTime}ms`);
    console.log(`📊 Stats: ${typedCommits.length} commits, ${typedPullRequests.length} PRs, ${typedIssues.length} issues, ${typedContributors.length} contributors`);
    
    ResponseService.success(res, transformedResponse);

  } catch (error: any) {
    logger.error('getEverything error:', error);
    ResponseService.error(res, error.message || 'Failed to get repository data', 500);
  }
};

  // ═══════════════════════════════════════════════════════════════════════════
  // 22. PRIVATE BUILDER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

private async buildFullStats(owner: string, repo: string): Promise<any> {
  const [repoData, commits, prs, issues, contributors, releases, branches, languages, topics, community, readme] = await Promise.all([
    this.octokit.repos.get({ owner, repo }),
    paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), { owner, repo }, 'commits'),
    paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs'),
    paginateAll(this.octokit, (p) => this.octokit.issues.listForRepo(p), { owner, repo, state: 'all' }, 'issues'),
    paginateAll(this.octokit, (p) => this.octokit.repos.listContributors(p), { owner, repo }, 'contributors'),
    paginateAll(this.octokit, (p) => this.octokit.repos.listReleases(p), { owner, repo }, 'releases'),
    paginateAll(this.octokit, (p) => this.octokit.repos.listBranches(p), { owner, repo }, 'branches'),
    this.octokit.repos.listLanguages({ owner, repo }).catch(() => ({ data: {} })),
    this.octokit.repos.getAllTopics({ owner, repo }).catch(() => ({ data: { names: [] } })),
    this.octokit.repos.getCommunityProfileMetrics({ owner, repo }).catch(() => ({ data: {} })),
    this.octokit.repos.getReadme({ owner, repo }).catch(() => null)
  ]);

  // Type the arrays properly
  const typedCommits = commits as any[];
  const typedPrs = prs as any[];
  const typedIssues = issues as any[];
  const typedContributors = contributors as any[];
  const typedReleases = releases as any[];
  const typedBranches = branches as any[];
  const typedTopics = topics as any;
  const typedCommunity = community as any;

  return {
    meta: {
      name: repoData.data.name, 
      fullName: repoData.data.full_name,
      owner: repoData.data.owner.login, 
      description: repoData.data.description,
      isPrivate: repoData.data.private, 
      isFork: repoData.data.fork,
      createdAt: repoData.data.created_at, 
      pushedAt: repoData.data.pushed_at,
      size: repoData.data.size, 
      defaultBranch: repoData.data.default_branch,
      topics: typedTopics.data.names, 
      license: repoData.data.license?.spdx_id
    },
    social: { 
      stars: repoData.data.stargazers_count, 
      watchers: repoData.data.watchers_count, 
      forks: repoData.data.forks_count, 
      openIssues: repoData.data.open_issues_count 
    },
    languages: this.calculateLanguagePercentages(languages.data),
    commits: { 
      total: typedCommits.length, 
      frequency: this.calculateCommitFrequency(typedCommits), 
      avgPerWeek: this.calculateAvgCommitsPerWeek(typedCommits), 
      streaks: this.calculateCommitStreaks(typedCommits), 
      byHour: this.calculateCommitsByHour(typedCommits), 
      byDayOfWeek: this.calculateCommitsByDayOfWeek(typedCommits), 
      byMonth: this.calculateCommitsByMonth(typedCommits), 
      topAuthors: this.getTopAuthors(typedCommits, 10), 
      firstDate: typedCommits.length > 0 ? typedCommits[typedCommits.length - 1]?.commit?.author?.date : null, 
      lastDate: typedCommits.length > 0 ? typedCommits[0]?.commit?.author?.date : null 
    },
    pullRequests: { 
      total: typedPrs.length, 
      open: typedPrs.filter((p: any) => p.state === 'open').length, 
      merged: typedPrs.filter((p: any) => p.merged_at).length, 
      mergeRate: this.calculateMergeRate(typedPrs), 
      avgTimeToMerge: this.calculateAvgTimeToMerge(typedPrs), 
      topContributors: this.getTopPRContributors(typedPrs, 10) 
    },
    issues: { 
      ...this.calculateIssueStats(typedIssues), 
      total: typedIssues.length, 
      open: typedIssues.filter((i: any) => i.state === 'open').length, 
      closed: typedIssues.filter((i: any) => i.state === 'closed').length 
    },
    contributors: { 
      total: typedContributors.length, 
      totalContributions: typedContributors.reduce((s: number, c: any) => s + (c.contributions || 0), 0), 
      busFactor: this.calculateBusFactor(typedContributors, 0.5), 
      list: this.calculateContributorStats(typedContributors) 
    },
    branches: { 
      total: typedBranches.length, 
      list: typedBranches.map((b: any) => ({ name: b.name, protected: b.protected })) 
    },
    releases: { 
      total: typedReleases.length, 
      latest: typedReleases.length > 0 ? typedReleases[0]?.tag_name || null : null, 
      totalDownloads: typedReleases.reduce((s: number, r: any) => 
        s + (r.assets || []).reduce((a: number, asset: any) => a + (asset.download_count || 0), 0), 0) 
    },
    community: { 
      hasReadme: !!readme, 
      healthPercentage: (typedCommunity.data as any).health_percentage || 0 
    },
    scores: this.calculateQualityScores({ 
      repoData: repoData.data, 
      commits: typedCommits, 
      pullRequests: typedPrs, 
      issues: typedIssues, 
      contributors: typedContributors, 
      hasReadme: !!readme, 
      hasCodeOfConduct: false 
    })
  };
}

  private async buildContributorWeeklyData(owner: string, repo: string): Promise<any> {
    const r = await retryStats(() => this.octokit.repos.getContributorsStats({ owner, repo }));
    return r?.data || null;
  }

  private async buildParticipationData(owner: string, repo: string): Promise<any> {
    const r = await this.octokit.repos.getParticipationStats({ owner, repo });
    return r.data;
  }

  private async buildCodeFrequencyData(owner: string, repo: string): Promise<any> {
    const r = await retryStats(() => this.octokit.repos.getCodeFrequencyStats({ owner, repo }));
    return r?.data || null;
  }

  private async buildPunchCardData(owner: string, repo: string): Promise<any> {
    const r = await this.octokit.repos.getPunchCardStats({ owner, repo });
    return r.data;
  }

  private async buildCommitActivityData(owner: string, repo: string): Promise<any> {
    const r = await retryStats(() => this.octokit.repos.getCommitActivityStats({ owner, repo }));
    return r?.data || null;
  }

  private async buildReleaseData(owner: string, repo: string): Promise<any> {
    return paginateAll(this.octokit, (p) => this.octokit.repos.listReleases(p), { owner, repo }, 'releases');
  }

  private async buildMilestoneData(owner: string, repo: string): Promise<any> {
    const [open, closed] = await Promise.all([
      paginateAll(this.octokit, (p) => this.octokit.issues.listMilestones(p), { owner, repo, state: 'open' }, 'ms-open'),
      paginateAll(this.octokit, (p) => this.octokit.issues.listMilestones(p), { owner, repo, state: 'closed' }, 'ms-closed')
    ]);
    return { open, closed };
  }

  private async buildDeploymentData(owner: string, repo: string): Promise<any> {
    return paginateAll(this.octokit, (p) => this.octokit.repos.listDeployments(p), { owner, repo }, 'deployments');
  }

  private async buildActionsData(owner: string, repo: string): Promise<any> {
    const [workflows, runs] = await Promise.all([
      this.octokit.actions.listRepoWorkflows({ owner, repo }),
      paginateAll(this.octokit, (p) => this.octokit.actions.listWorkflowRunsForRepo(p), { owner, repo }, 'runs')
    ]);
    return { workflows: workflows.data.workflows, runs };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 23. WEBHOOK PRIVATE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private async handlePushEvent(payload: any): Promise<void> {
    const { repository, pusher, commits, ref } = payload;
    logger.info(`Push event: ${repository?.full_name} by ${pusher?.name}, ref: ${ref}`);
    const result = await DatabaseService.query(`
      UPDATE github_simulation_repos SET last_activity_at=NOW(), commit_count=commit_count+$1
      WHERE repo_name=$2 AND status='active' RETURNING simulation_id, candidate_id
    `, [commits?.length || 1, repository?.name]);
    for (const row of result.rows) logger.info(`Updated simulation ${row.simulation_id}`);
  }

  private async handlePullRequestEvent(payload: any): Promise<void> {
    const { repository, pull_request, action } = payload;
    logger.info(`PR event: ${action} on ${repository?.full_name} - #${pull_request?.number}`);
    if (action === 'opened' || action === 'ready_for_review') {
      await DatabaseService.query(`UPDATE github_simulation_repos SET pr_opened_at=NOW(), pr_url=$1 WHERE repo_name=$2`, [pull_request?.html_url, repository?.name]);
    }
  }

  private async handleCreateEvent(payload: any): Promise<void> {
    const { repository, ref, ref_type } = payload;
    if (ref_type === 'branch') logger.info(`Branch created: ${ref} in ${repository?.full_name}`);
  }

  private async handleReviewEvent(payload: any): Promise<void> {
    const { repository, pull_request, action } = payload;
    logger.info(`Review event: ${action} on PR #${pull_request?.number} in ${repository?.full_name}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 24. ASYNC SUBMISSION ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  private async analyzeSubmission(submissionId: string, owner: string, repo: string, candidateId: string): Promise<void> {
    try {
      await DatabaseService.query(`UPDATE github_submissions SET status='analyzing' WHERE id=$1`, [submissionId]);

      const [commits, prs, languages] = await Promise.all([
        paginateAll(this.octokit, (p) => this.octokit.repos.listCommits(p), { owner, repo }, 'commits'),
        paginateAll(this.octokit, (p) => this.octokit.pulls.list(p), { owner, repo, state: 'all' }, 'prs'),
        this.octokit.repos.listLanguages({ owner, repo })
      ]);

      const stats         = this.calculateRepoStats(commits, prs, languages.data);
      const commitDetails = this.calculateDetailedCommitStats(commits);
      const prDetails     = this.calculateDetailedPRStats(prs);

      await DatabaseService.query(`
        UPDATE github_submissions SET status='completed', analysis_data=$1, completed_at=NOW() WHERE id=$2
      `, [JSON.stringify({ stats, commitDetails, prDetails }), submissionId]);

      await DatabaseService.query(`
        UPDATE github_repo_analysis SET
          total_commits=$1, total_pull_requests=$2, languages_used=$3,
          commit_frequency=$4, avg_commit_size=$5, first_commit_date=$6,
          last_commit_date=$7, analysis_data=$8, analyzed_at=NOW()
        WHERE submission_id=$9
      `, [stats.totalCommits, stats.totalPullRequests, stats.languages, stats.commitFrequency, stats.avgCommitSize, stats.firstCommitDate, stats.lastCommitDate, JSON.stringify({ commitDetails, prDetails }), submissionId]);

      logger.info(`Analysis completed for submission ${submissionId}`);
    } catch (error) {
      logger.error(`Analysis failed for submission ${submissionId}:`, error);
      await DatabaseService.query(`UPDATE github_submissions SET status='failed', failure_reason=$1 WHERE id=$2`, [(error as Error).message, submissionId]);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 25. ISSUE / TASK GENERATION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private generateIssueTitle(task: any): string {
    return `${this.getTaskTypePrefix(task)} [Task ${task.order || task.task_index}] ${task.title || task.task_name}`;
  }

  private getTaskTypePrefix(task: any): string {
    switch (task.type || task.task_type) {
      case 'github_setup': return '🔧 Setup';
      case 'code_fix':     return '🐛 Bug Fix';
      case 'testing':      return '🧪 Test';
      case 'github_pr':    return '🔄 PR';
      case 'technical':    return '💻 Technical';
      default:             return '📋 Task';
    }
  }

  private getTaskLabels(task: any): string[] {
    const labels = ['simulation-task'];
    switch (task.type || task.task_type) {
      case 'github_setup': labels.push('setup', 'github'); break;
      case 'code_fix':     labels.push('bug', 'code-fix'); break;
      case 'testing':      labels.push('testing', 'quality'); break;
      case 'github_pr':    labels.push('pull-request', 'review'); break;
      case 'technical':    labels.push('technical', 'development'); break;
    }
    if (task.depends_on)                                  labels.push('has-dependency');
    if (task.min_commits)                                 labels.push(`requires-${task.min_commits}-commits`);
    if (task.requires_pr)                                 labels.push('requires-pr');
    if (task.evaluation?.qualityThreshold || task.min_score) labels.push('scored');
    return labels;
  }

  private generateTaskIssueBodyFromConfig(task: any): string {
    const taskType   = task.type || task.task_type;
    const taskNumber = task.order || task.task_index;
    const taskName   = task.title || task.task_name;
    const description  = task.description || '';
    const instructions = task.instructions || '';

    let body = `## 📌 Task ${taskNumber}: ${taskName}\n\n`;
    body += `### Type: ${taskType}\n`;
    body += `### Duration: ${task.duration || 'Flexible'} minutes\n\n`;
    body += `## 📖 Description\n\n${description}\n\n`;
    if (instructions) body += `## 📝 Instructions\n\n${instructions}\n\n`;
    if (task.depends_on) body += `## ⚠️ Dependencies\n\nThis task depends on **Task ${task.depends_on}**.\nPlease complete Task ${task.depends_on} before starting this one.\n\n`;

    body += `## ✅ Requirements\n\n`;
    if (task.min_commits)                                    body += `- [ ] Make at least **${task.min_commits} commit(s)**\n`;
    if (task.requires_pr)                                    body += `- [ ] Create a **Pull Request**\n`;
    if (task.requires_github_repo)                           body += `- [ ] Use your forked GitHub repository\n`;
    if (task.min_score || task.evaluation?.qualityThreshold) body += `- [ ] Achieve a score of at least **${task.min_score || task.evaluation?.qualityThreshold}%**\n`;

    if (task.evaluation?.criteria?.length) {
      body += `\n## 📊 Evaluation Criteria\n\n| Criteria | Weight | Rating |\n|----------|--------|--------|\n`;
      for (const c of task.evaluation.criteria) {
        body += `| ${c.name} | ${c.weight}% | ${c.options?.join(' | ') || 'Poor | Fair | Good | Excellent'} |\n`;
      }
    }

    if (task.resources?.length) {
      body += `\n## 📚 Resources\n\n`;
      for (const r of task.resources) body += `- ${r}\n`;
    }

    body += `\n## 🚀 Submission\n\n1. Complete the task requirements\n2. Push your code to your GitHub repository\n3. Comment \`/ready\` on this issue when done\n4. The system will automatically evaluate your submission\n\n`;
    body += `---\n*This issue was automatically created by the V-WES Recruitment Platform*\n*Task ID: ${task.id || taskNumber}*\n`;
    return body;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 26. PRIVATE CALCULATION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  parseGitHubUrl(url: string): ParsedRepo | null {
    const patterns = [/github\.com\/([^\/]+)\/([^\/]+)/, /api\.github\.com\/repos\/([^\/]+)\/([^\/]+)/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1] && match?.[2]) return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
    return null;
  }

  private calculateRepoStats(commits: any[], pullRequests: any[], languages: any): any {
    if (commits.length === 0) return { totalCommits: 0, totalPullRequests: pullRequests.length, languages: Object.keys(languages), commitFrequency: 0, avgCommitSize: 0, firstCommitDate: null, lastCommitDate: null };
    const first = new Date(commits[commits.length - 1]?.commit?.author?.date);
    const last  = new Date(commits[0]?.commit?.author?.date);
    const days  = Math.max(1, (last.getTime() - first.getTime()) / 86400000);
    let totalFiles = 0;
    for (const c of commits.slice(0, 50)) totalFiles += c.files?.length || 0;
    return {
      totalCommits: commits.length, totalPullRequests: pullRequests.length, languages: Object.keys(languages),
      commitFrequency: parseFloat((commits.length / days).toFixed(2)),
      avgCommitSize: parseFloat((totalFiles / Math.min(commits.length, 50)).toFixed(2)),
      firstCommitDate: commits[commits.length - 1]?.commit?.author?.date,
      lastCommitDate: commits[0]?.commit?.author?.date
    };
  }

  private calculateDetailedCommitStats(commits: any[]): any {
    if (commits.length === 0) return { total: 0, commits: [] };
    const byHour: Record<number, number> = {}, byDay: Record<string, number> = {};
    const authors: Record<string, { count: number; first: string; last: string }> = {};
    for (const c of commits) {
      const date = new Date(c.commit?.author?.date);
      const hour = date.getHours();
      const day  = date.toLocaleDateString('en-US', { weekday: 'long' });
      const auth = c.author?.login || c.commit?.author?.name;
      byHour[hour] = (byHour[hour] || 0) + 1;
      byDay[day]   = (byDay[day] || 0) + 1;
      if (auth) {
        if (!authors[auth]) authors[auth] = { count: 0, first: date.toISOString(), last: date.toISOString() };
        authors[auth].count++;
        if (date < new Date(authors[auth].first)) authors[auth].first = date.toISOString();
        if (date > new Date(authors[auth].last))  authors[auth].last  = date.toISOString();
      }
    }
    return { total: commits.length, firstCommit: commits[commits.length - 1]?.commit?.author?.date, lastCommit: commits[0]?.commit?.author?.date, commitsByHour: byHour, commitsByDay: byDay, authors: Object.entries(authors).map(([name, data]) => ({ name, ...data })) };
  }

  private calculateDetailedPRStats(prs: any[]): any {
    let merged = 0, closed = 0, additions = 0, deletions = 0, reviewTime = 0, reviewed = 0;
    for (const pr of prs) {
      if (pr.merged_at) merged++;
      if (pr.state === 'closed') closed++;
      additions += pr.additions || 0;
      deletions += pr.deletions || 0;
      if (pr.review_comments > 0 && pr.merged_at) {
        reviewTime += (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;
        reviewed++;
      }
    }
    return { totalPRs: prs.length, mergedPRs: merged, closedPRs: closed, openPRs: prs.length - closed, mergeRate: prs.length > 0 ? (merged / prs.length) * 100 : 0, totalAdditions: additions, totalDeletions: deletions, avgAdditions: prs.length > 0 ? additions / prs.length : 0, avgDeletions: prs.length > 0 ? deletions / prs.length : 0, avgTimeToMergeHours: reviewed > 0 ? reviewTime / reviewed : 0 };
  }

  private calculateDetailedIssueStats(issues: any[]): any {
    const open = issues.filter((i: any) => i.state === 'open');
    const closed = issues.filter((i: any) => i.state === 'closed');
    const priorityLabels = ['critical', 'high', 'medium', 'low', 'bug', 'enhancement', 'feature'];
    const byPriority: Record<string, number> = {};
    let totalComments = 0;
    for (const issue of issues) {
      totalComments += issue.comments || 0;
      for (const label of issue.labels || []) {
        const n = typeof label === 'string' ? label : label.name;
        if (n && priorityLabels.includes(n.toLowerCase())) byPriority[n.toLowerCase()] = (byPriority[n.toLowerCase()] || 0) + 1;
      }
    }
    return {
      total: issues.length, open: open.length, closed: closed.length,
      openWithComments: open.filter((i: any) => i.comments > 0).length,
      averageComments: issues.length > 0 ? parseFloat((totalComments / issues.length).toFixed(2)) : 0,
      issuesByPriority: byPriority, issuesByLabel: this.calculateIssueLabels(issues)
    };
  }

  private calculateIssueLabels(issues: any[]): Record<string, number> {
    const labels: Record<string, number> = {};
    for (const issue of issues) {
      for (const label of issue.labels || []) {
        const n = typeof label === 'string' ? label : label.name;
        if (n) labels[n] = (labels[n] || 0) + 1;
      }
    }
    return labels;
  }

  private calculateContributionDistribution(contributors: any[]): any {
    const total = contributors.reduce((s, c) => s + c.contributions, 0);
    return {
      top1Percent:  contributors.slice(0, Math.max(1, Math.ceil(contributors.length * 0.01))),
      top5Percent:  contributors.slice(0, Math.max(1, Math.ceil(contributors.length * 0.05))),
      top10Percent: contributors.slice(0, Math.max(1, Math.ceil(contributors.length * 0.1))),
      busFactor: this.calculateBusFactor(contributors, 0.5)
    };
  }

  private calculateBusFactor(contributors: any[], threshold: number): number {
    const sorted = [...contributors].sort((a, b) => b.contributions - a.contributions);
    const target = sorted.reduce((s, c) => s + c.contributions, 0) * threshold;
    let sum = 0, count = 0;
    for (const c of sorted) { sum += c.contributions; count++; if (sum >= target) break; }
    return count;
  }

  // ── date/time helpers ─────────────────────────────────────────────────────

private calculateDailyCommits(commits: any[]): Array<{ date: string; count: number; cumulative: number }> {
  const byDate: Record<string, number> = {};
  for (const c of commits) {
    const date = c.commit?.author?.date?.split('T')[0];
    if (date) {
      byDate[date] = (byDate[date] || 0) + 1;
    }
  }
  let cum = 0;
  return Object.keys(byDate).sort().map(date => {
    const count = byDate[date] || 0;
    cum += count;
    return { date, count, cumulative: cum };
  });
}

private calculateWeeklyCommits(commits: any[]): Array<{ week: string; startDate: string; endDate: string; count: number; cumulative: number }> {
  const byWeek: Record<string, { count: number; startDate: string; endDate: string }> = {};
  
  for (const c of commits) {
    const date = c.commit?.author?.date;
    if (!date) continue;
    const d = new Date(date);
    const key = `${d.getFullYear()}-W${String(this.getWeekNumber(d)).padStart(2, '0')}`;
    
    if (!byWeek[key]) {
      const ws = this.getStartOfWeek(d);
      const we = new Date(ws);
      we.setDate(we.getDate() + 6);
      byWeek[key] = { 
        count: 0, 
        startDate: ws.toISOString().split('T')[0] || '', 
        endDate: we.toISOString().split('T')[0] || '' 
      };
    }
    byWeek[key].count++;
  }
  
  let cum = 0;
  return Object.keys(byWeek).sort().map(week => {
    const weekData = byWeek[week];
    // Add null/undefined check
    if (!weekData) {
      return { 
        week, 
        startDate: '', 
        endDate: '', 
        count: 0, 
        cumulative: cum 
      };
    }
    cum += weekData.count;
    return { 
      week, 
      startDate: weekData.startDate, 
      endDate: weekData.endDate, 
      count: weekData.count, 
      cumulative: cum 
    };
  });
}

private calculateMonthlyCommits(commits: any[]): Array<{ month: string; year: number; monthNumber: number; monthName: string; count: number; cumulative: number }> {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const byMonth: Record<string, { count: number; year: number; monthNumber: number }> = {};
  
  for (const c of commits) {
    const date = c.commit?.author?.date;
    if (!date) continue;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    if (!byMonth[key]) {
      byMonth[key] = { 
        count: 0, 
        year: d.getFullYear(), 
        monthNumber: d.getMonth() + 1 
      };
    }
    byMonth[key].count++;
  }
  
  let cum = 0;
  return Object.keys(byMonth).sort().map(month => {
    const monthData = byMonth[month];
    // Add null/undefined check
    if (!monthData) {
      return {
        month,
        year: 0,
        monthNumber: 0,
        monthName: 'Unknown',
        count: 0,
        cumulative: cum
      };
    }
    cum += monthData.count;
    return {
      month,
      year: monthData.year,
      monthNumber: monthData.monthNumber,
      monthName: names[monthData.monthNumber - 1] || 'Unknown',
      count: monthData.count,
      cumulative: cum
    };
  });
}

  private calculateYearlyCommits(commits: any[]): Array<{ year: number; count: number; cumulative: number }> {
  const byYear: Record<number, number> = {};
  for (const c of commits) {
    const date = c.commit?.author?.date;
    if (date) {
      const year = new Date(date).getFullYear();
      byYear[year] = (byYear[year] || 0) + 1;
    }
  }
  let cum = 0;
  return Object.keys(byYear).map(Number).sort().map(year => {
    const count = byYear[year] || 0;
    cum += count;
    return { year, count, cumulative: cum };
  });
}

  private calculateCommitsByWeek(commits: any[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const c of commits) {
      const date = c.commit?.author?.date;
      if (date) { const d = new Date(date); const key = `${d.getFullYear()}-W${String(this.getWeekNumber(d)).padStart(2, '0')}`; r[key] = (r[key] || 0) + 1; }
    }
    return r;
  }

  private calculateCommitsByYear(commits: any[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const c of commits) { const date = c.commit?.author?.date; if (date) { const y = new Date(date).getFullYear(); r[y] = (r[y] || 0) + 1; } }
    return r;
  }

  private calculateCommitsByAuthor(commits: any[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const c of commits) { const a = c.author?.login || c.commit?.author?.name || 'unknown'; r[a] = (r[a] || 0) + 1; }
    return r;
  }

  private calculateCommitsByDate(commits: any[]): Array<{ date: string; count: number }> {
    const r: Record<string, number> = {};
    for (const c of commits) { const date = c.commit?.author?.date?.split('T')[0]; if (date) r[date] = (r[date] || 0) + 1; }
    return Object.entries(r).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
  }

  private calculateCommitTimeline(commits: any[]): Array<{ date: string; cumulative: number; daily: number }> {
    const byDate = this.calculateCommitsByDate(commits);
    let cum = 0;
    return byDate.map(item => { cum += item.count; return { date: item.date, cumulative: cum, daily: item.count }; });
  }

  private calculateFileChangeStats(commits: any[]): any {
    const uniqueFiles = new Set<string>();
    const fileChangeCount: Record<string, number> = {};
    let totalAdditions = 0, totalDeletions = 0, totalFilesChanged = 0;
    for (const c of commits) {
      if (c.files) {
        totalFilesChanged += c.files.length;
        for (const f of c.files) {
          uniqueFiles.add(f.filename);
          fileChangeCount[f.filename] = (fileChangeCount[f.filename] || 0) + 1;
          totalAdditions += f.additions || 0;
          totalDeletions += f.deletions || 0;
        }
      }
    }
    return {
      totalFilesChanged, uniqueFilesCount: uniqueFiles.size,
      uniqueFilesChanged: Array.from(uniqueFiles).slice(0, 200),
      averageFilesPerCommit: commits.length > 0 ? parseFloat((totalFilesChanged / commits.length).toFixed(2)) : 0,
      totalAdditions, totalDeletions,
      topChangedFiles: Object.entries(fileChangeCount).map(([path, changes]) => ({ path, changes })).sort((a, b) => b.changes - a.changes).slice(0, 30)
    };
  }

  private analyzeCommitMessages(commits: any[]): any {
    const conventionalTypes: Record<string, number> = {}, words: Record<string, number> = {}, commitTypes: Record<string, number> = {};
    let totalLen = 0, conventionalCount = 0;
    for (const c of commits) {
      const msg = c.commit?.message || '';
      const firstLine = msg.split('\n')[0];
      totalLen += firstLine.length;
      const m = firstLine.match(/^(\w+)(\([^)]+\))?!?:/);
      if (m) { conventionalCount++; conventionalTypes[m[1]] = (conventionalTypes[m[1]] || 0) + 1; }
      for (const word of (firstLine.toLowerCase().match(/\b\w+\b/g) || [])) {
        if (word.length > 3 && !['this','that','with','from','have','were','been'].includes(word)) words[word] = (words[word] || 0) + 1;
      }
      if (/fix|bug|issue|error|crash/i.test(firstLine))           commitTypes.fix      = (commitTypes.fix      || 0) + 1;
      else if (/feat|feature|add|new|implement/i.test(firstLine)) commitTypes.feat     = (commitTypes.feat     || 0) + 1;
      else if (/docs|documentation|readme/i.test(firstLine))      commitTypes.docs     = (commitTypes.docs     || 0) + 1;
      else if (/refactor|clean|improve/i.test(firstLine))         commitTypes.refactor = (commitTypes.refactor || 0) + 1;
      else if (/test|spec|unit/i.test(firstLine))                 commitTypes.test     = (commitTypes.test     || 0) + 1;
      else if (/chore|ci|build|config/i.test(firstLine))          commitTypes.chore    = (commitTypes.chore    || 0) + 1;
    }
    return {
      total: commits.length, conventionalCommits: conventionalCount,
      conventionalCommitTypes: conventionalTypes,
      averageMessageLength: commits.length > 0 ? parseFloat((totalLen / commits.length).toFixed(1)) : 0,
      topWords: Object.entries(words).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 30),
      commitTypes
    };
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dn = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dn);
    const ys = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - ys.getTime()) / 86400000) + 1) / 7);
  }

  private calculateCommitFrequency(commits: any[]): number {
    if (commits.length < 2) return 0;
    const first = new Date(commits[commits.length - 1]?.commit?.author?.date);
    const last  = new Date(commits[0]?.commit?.author?.date);
    const days  = Math.max(1, (last.getTime() - first.getTime()) / 86400000);
    return parseFloat((commits.length / days).toFixed(2));
  }

  private calculateAvgCommitsPerWeek(commits: any[]): number {
    if (commits.length < 2) return 0;
    const first = new Date(commits[commits.length - 1]?.commit?.author?.date);
    const last  = new Date(commits[0]?.commit?.author?.date);
    const weeks = Math.max(1, (last.getTime() - first.getTime()) / (86400000 * 7));
    return parseFloat((commits.length / weeks).toFixed(2));
  }

  private calculateCommitStreaks(commits: any[]): CommitStreaks {
    if (commits.length === 0) return { longestStreak: 0, currentStreak: 0 };
    const validDates = commits.map(c => c.commit?.author?.date).filter(Boolean) as string[];
    if (!validDates.length) return { longestStreak: 0, currentStreak: 0 };
    const uniqueDates = [...new Set(validDates.map(d => new Date(d).toDateString()))].sort();
    let longestStreak = 1, streak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const diff = (new Date(uniqueDates[i]!).getTime() - new Date(uniqueDates[i - 1]!).getTime()) / 86400000;
      if (diff === 1) { streak++; longestStreak = Math.max(longestStreak, streak); } else { streak = 1; }
    }
    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let currentStreak = 0;
    if (uniqueDates.includes(today) || uniqueDates.includes(yesterday)) {
      currentStreak = 1;
      const start = uniqueDates.includes(today) ? 1 : 2;
      for (let i = start; i < 365; i++) {
        const check = new Date(Date.now() - i * 86400000).toDateString();
        if (uniqueDates.includes(check)) currentStreak++; else break;
      }
    }
    return { longestStreak, currentStreak };
  }

  private calculateCommitsByHour(commits: any[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const c of commits) { const h = new Date(c.commit?.author?.date).getHours(); r[h] = (r[h] || 0) + 1; }
    return r;
  }

  private calculateCommitsByDayOfWeek(commits: any[]): Record<string, number> {
    const r: Record<string, number> = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
    for (const c of commits) { const d = new Date(c.commit?.author?.date).toLocaleDateString('en-US', { weekday: 'long' }); r[d] = (r[d] || 0) + 1; }
    return r;
  }

  private calculateCommitsByMonth(commits: any[]): Record<string, number> {
    const r: Record<string, number> = {};
    for (const c of commits) { const d = new Date(c.commit?.author?.date); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; r[k] = (r[k] || 0) + 1; }
    return r;
  }

  private getTopAuthors(commits: any[], limit: number): any[] {
    const a: Record<string, { count: number; first: string; last: string }> = {};
    for (const c of commits) {
      const author = c.author?.login || c.commit?.author?.name;
      if (!author) continue;
      if (!a[author]) a[author] = { count: 0, first: c.commit?.author?.date, last: c.commit?.author?.date };
      a[author].count++;
      if (c.commit?.author?.date < a[author].first) a[author].first = c.commit?.author?.date;
      if (c.commit?.author?.date > a[author].last)  a[author].last  = c.commit?.author?.date;
    }
    return Object.entries(a).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  private calculateMergeRate(prs: any[]): number {
    if (!prs.length) return 0;
    return parseFloat(((prs.filter(p => p.merged_at).length / prs.length) * 100).toFixed(2));
  }

  private calculateAvgTimeToMerge(prs: any[]): number {
    const merged = prs.filter(p => p.merged_at);
    if (!merged.length) return 0;
    const total = merged.reduce((s, p) => s + (new Date(p.merged_at).getTime() - new Date(p.created_at).getTime()), 0);
    return parseFloat((total / merged.length / 3600000).toFixed(2));
  }

  private getTopPRContributors(prs: any[], limit: number): any[] {
    const c: Record<string, number> = {};
    for (const pr of prs) { const a = pr.user?.login; if (a) c[a] = (c[a] || 0) + 1; }
    return Object.entries(c).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  private calculateLanguagePercentages(languages: any): any {
    const total = Object.values(languages as Record<string, number>).reduce((s, v) => s + v, 0);
    const breakdown = Object.entries(languages as Record<string, number>).map(([lang, bytes]) => ({ name: lang, bytes, percentage: parseFloat(((bytes / (total || 1)) * 100).toFixed(2)) })).sort((a, b) => b.bytes - a.bytes);
    return { total, breakdown, primary: breakdown[0]?.name || null, percentages: Object.fromEntries(breakdown.map(b => [b.name, b.percentage])) };
  }

  private calculateQualityScores(data: QualityInput): any {
    const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentActivity = data.commits.filter(c => new Date(c.commit?.author?.date) > threeMonthsAgo).length;
    const closedIssues   = data.issues.filter(i => i.state === 'closed').length;
    const issueResRate   = data.issues.length > 0 ? (closedIssues / data.issues.length) * 100 : 100;
    const contribCount   = data.contributors.length;
    return {
      overall:         Math.min(100, (data.hasReadme ? 15 : 0) + (data.hasCodeOfConduct ? 10 : 0) + Math.min(25, Math.floor(recentActivity / 4)) + Math.min(25, contribCount) + Math.min(25, Math.floor(issueResRate / 4))),
      documentation:   (data.hasReadme ? 60 : 0) + (data.hasCodeOfConduct ? 40 : 0),
      activity:        Math.min(100, Math.floor(recentActivity / 4) * 4),
      community:       Math.min(100, contribCount * 4),
      issueManagement: Math.min(100, Math.floor(issueResRate))
    };
  }

  private calculateIssueStats(issues: any[]): IssueStats {
    const closed = issues.filter((i: any) => i.state === 'closed' && i.closed_at);
    const times  = closed.map((i: any) => (new Date(i.closed_at).getTime() - new Date(i.created_at).getTime()) / 3600000).sort((a, b) => a - b);
    const issuesByLabel: Record<string, number> = {};
    const creatorCount:  Record<string, number> = {};
    for (const i of issues) {
      const c = i.user?.login; if (c) creatorCount[c] = (creatorCount[c] || 0) + 1;
      for (const label of i.labels || []) { const n = typeof label === 'string' ? label : label.name; if (n) issuesByLabel[n] = (issuesByLabel[n] || 0) + 1; }
    }
    return {
      avgResolutionTime:    times.length > 0 ? parseFloat((times.reduce((s, v) => s + v, 0) / times.length).toFixed(2)) : 0,
      medianResolutionTime: times.length > 0 ? times[Math.floor(times.length / 2)] || 0 : 0,
      issuesByLabel,
      topCreators: Object.entries(creatorCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10)
    };
  }

  private calculateContributorStats(contributors: any[]): any[] {
    return contributors.map(c => ({ username: c.login, id: c.id, contributions: c.contributions, avatarUrl: c.avatar_url, profileUrl: c.html_url, type: c.type }));
  }

  private calculateCommitStreakHelper(uniqueDates: string[]): number {
    if (uniqueDates.length === 0) return 0;
    let streak = 1, best = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      const diff = (new Date(uniqueDates[i]!).getTime() - new Date(uniqueDates[i - 1]!).getTime()) / 86400000;
      if (diff === 1) { streak++; best = Math.max(best, streak); } else { streak = 1; }
    }
    return best;
  }
}

export default new GitHubController();
