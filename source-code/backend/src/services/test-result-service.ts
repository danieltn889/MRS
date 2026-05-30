import { DatabaseService } from 'database.service';
import logger from './logger';

interface TestResultJSON {
  timestamp: string;
  commit_sha: string;
  repository: string;
  branch: string;
  pull_request: number | null;
  results: {
    unit_tests: any;
    coverage: any;
    linting: any;
    security: any;
  };
  summary: {
    tests_passed: number;
    tests_failed: number;
    coverage_percent: number;
    linting_errors: number;
    security_issues: number;
    overall_status: string;
  };
}

class TestResultService {
  
  // Store test results from GitHub Action
  async storeTestResults(
    simulationId: string,
    sessionId: string,
    candidateGitHubUsername: string,
    testResultsJSON: TestResultJSON
  ): Promise<any> {
    try {
      // Store in database
      const result = await DatabaseService.query(`
        INSERT INTO simulation_test_results (
          simulation_id,
          session_id,
          candidate_username,
          test_results_json,
          tests_passed,
          tests_failed,
          coverage_percent,
          linting_errors,
          security_issues,
          overall_status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (simulation_id, session_id)
        DO UPDATE SET
          test_results_json = EXCLUDED.test_results_json,
          tests_passed = EXCLUDED.tests_passed,
          tests_failed = EXCLUDED.tests_failed,
          coverage_percent = EXCLUDED.coverage_percent,
          linting_errors = EXCLUDED.linting_errors,
          security_issues = EXCLUDED.security_issues,
          overall_status = EXCLUDED.overall_status,
          updated_at = NOW()
        RETURNING id
      `, [
        simulationId,
        sessionId,
        candidateGitHubUsername,
        JSON.stringify(testResultsJSON),
        testResultsJSON.summary.tests_passed,
        testResultsJSON.summary.tests_failed,
        testResultsJSON.summary.coverage_percent,
        testResultsJSON.summary.linting_errors,
        testResultsJSON.summary.security_issues,
        testResultsJSON.summary.overall_status
      ]);
      
      logger.info(`Stored test results for simulation ${simulationId}`);
      return result.rows[0];
      
    } catch (error: any) {
      logger.error('storeTestResults error:', error);
      throw error;
    }
  }
  
  // Update your existing createSimulationRepoInternal to include test results
  async createSimulationRepoInternal(
    simulationId: string,
    sessionId: string,
    repoName: string,
    candidateGitHubUsername: string,
    tasks: any[],
    orgName: string = 'recruitment-platform'
  ): Promise<any> {
    try {
      // ... (your existing code)
      
      // After creating repo and issues, set up GitHub Action workflow
      // that will automatically run tests and store results
      
      // Create .github/workflows directory and test workflow
      await this.setupTestWorkflowInRepo(finalOwner, finalRepoName);
      
      // Create a webhook to receive test results
      await this.createTestResultsWebhook(finalOwner, finalRepoName, simulationId, sessionId);
      
      // Return repo info with test configuration
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
        testResultsWebhook: `https://your-api.com/webhooks/github-test-results/${simulationId}/${sessionId}`,
        workflowFile: '.github/workflows/test-and-store-results.yml'
      };
      
    } catch (error: any) {
      logger.error('createSimulationRepoInternal:', error);
      throw error;
    }
  }
  
  // Setup test workflow in candidate's repo
  private async setupTestWorkflowInRepo(owner: string, repo: string): Promise<void> {
    const workflowContent = `
name: Auto Test & Report

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Tests with JSON Output
        run: |
          pip install pytest pytest-cov pytest-json-report flake8 bandit
          pytest --json-report --json-report-file=test-results.json
          flake8 . --format=json --output-file=lint-results.json
          bandit -r . -f json -o security-results.json
      - name: Send Results to Platform
        run: |
          curl -X POST "${{ secrets.PLATFORM_API_URL }}/api/test-results" \\
            -H "Content-Type: application/json" \\
            -d @test-results.json
    `;
    
    // Create the workflow file in the repo
    await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: '.github/workflows/auto-test.yml',
      message: 'Add automated testing workflow',
      content: Buffer.from(workflowContent).toString('base64'),
      branch: 'main'
    });
  }
  
  // Webhook endpoint to receive test results
  async receiveTestResultsWebhook(
    simulationId: string,
    sessionId: string,
    testResults: TestResultJSON
  ): Promise<any> {
    try {
      // Store the received JSON results
      const stored = await this.storeTestResults(
        simulationId,
        sessionId,
        'candidate', // You'd get this from the webhook payload
        testResults
      );
      
      // Update simulation status based on test results
      if (testResults.summary.overall_status === 'passed') {
        await DatabaseService.query(`
          UPDATE simulations 
          SET status = 'tests_passed', 
              test_results = $1,
              passed_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(testResults), simulationId]);
      } else {
        await DatabaseService.query(`
          UPDATE simulations 
          SET status = 'tests_failed',
              test_results = $1,
              failed_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(testResults), simulationId]);
      }
      
      return { success: true, stored };
      
    } catch (error: any) {
      logger.error('receiveTestResultsWebhook error:', error);
      throw error;
    }
  }
  
  // Get test results for a simulation
  async getTestResults(simulationId: string, sessionId: string): Promise<TestResultJSON | null> {
    const result = await DatabaseService.query(`
      SELECT test_results_json 
      FROM simulation_test_results
      WHERE simulation_id = $1 AND session_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [simulationId, sessionId]);
    
    if (result.rows.length === 0) return null;
    return result.rows[0].test_results_json;
  }
  
  // Generate report from stored JSON
  async generateReport(simulationId: string, sessionId: string): Promise<string> {
    const results = await this.getTestResults(simulationId, sessionId);
    
    if (!results) {
      return "No test results available yet.";
    }
    
    return `
# 📊 Test Report for Simulation ${simulationId}

## Overall Status: ${results.summary.overall_status.toUpperCase()}

### Test Metrics
- ✅ Passed: ${results.summary.tests_passed}
- ❌ Failed: ${results.summary.tests_failed}
- 📈 Coverage: ${results.summary.coverage_percent}%
- 🐛 Linting Errors: ${results.summary.linting_errors}
- 🔒 Security Issues: ${results.summary.security_issues}

## Detailed Results
\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`

---
Generated at: ${results.timestamp}
    `;
  }
}

export default new TestResultService();