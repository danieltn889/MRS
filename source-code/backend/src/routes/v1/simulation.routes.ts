import express, { Router } from 'express';
import { body, query, param } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import DatabaseService from '../../services/database.service.js';
import ResponseService from '../../services/response.service.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import SimulationController from '../../controllers/simulation.controller.js';
const router = Router();

// Scoring configuration
const SCORING_WEIGHTS = {
  punctuality: 0.10,
  communication: 0.15,
  problem_solving: 0.25,
  adaptability: 0.15,
  collaboration: 0.15,
  attention_to_detail: 0.10,
  initiative: 0.10
};

function calculateScores(answers: any, tasks: any[], timeSpent: number, timeLimit: number): any {
  const totalTasks = tasks.length;
  const answeredTasks = Object.keys(answers || {}).length;
  
  const completionScore = (answeredTasks / totalTasks) * 100;
  const punctualityScore = Math.max(0, Math.min(100, (1 - (timeSpent / timeLimit)) * 100));
  const problemSolvingScore = Math.min(100, completionScore + Math.random() * 20);
  const communicationScore = Math.min(100, completionScore + Math.random() * 15);
  const adaptabilityScore = Math.min(100, completionScore + Math.random() * 10);
  const collaborationScore = Math.min(100, completionScore + Math.random() * 15);
  const attentionScore = Math.min(100, completionScore + Math.random() * 10);
  const initiativeScore = Math.min(100, completionScore + Math.random() * 15);
  
  const overallScore = Math.round(
    (punctualityScore * SCORING_WEIGHTS.punctuality) +
    (communicationScore * SCORING_WEIGHTS.communication) +
    (problemSolvingScore * SCORING_WEIGHTS.problem_solving) +
    (adaptabilityScore * SCORING_WEIGHTS.adaptability) +
    (collaborationScore * SCORING_WEIGHTS.collaboration) +
    (attentionScore * SCORING_WEIGHTS.attention_to_detail) +
    (initiativeScore * SCORING_WEIGHTS.initiative)
  );
  
  return {
    overallScore,
    punctualityScore: Math.round(punctualityScore),
    communicationScore: Math.round(communicationScore),
    problemSolvingScore: Math.round(problemSolvingScore),
    adaptabilityScore: Math.round(adaptabilityScore),
    collaborationScore: Math.round(collaborationScore),
    attentionScore: Math.round(attentionScore),
    initiativeScore: Math.round(initiativeScore)
  };
}

// ============================================
// CONSTANTS
// ============================================

const SIMULATION_TYPES = [
  'technical', 'behavioral', 'case_study', 'role_play', 
  'presentation', 'cognitive', 'situational'
];

const SIMULATION_DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];

const SIMULATION_STATUSES = ['draft', 'active', 'archived', 'inactive'];

const CHAT_MESSAGE_TYPES = ['text', 'system', 'notification'];

// Type-safe wrapper for routes
const authHandler = (handler: (req: AuthenticatedRequest, res: express.Response) => Promise<void>) => {
  return async (req: express.Request, res: express.Response) => {
    return handler(req as AuthenticatedRequest, res);
  };
};

// ============================================
// 0. SUGGESTIONS ROUTE (must be before dynamic :id routes)
// ============================================

router.get('/suggestions', protect, async (req: express.Request, res: express.Response) => {
  try {
    // Unique objectives from tasks_structure or tasks JSONB
    const objectivesResult = await DatabaseService.execute(`
      SELECT DISTINCT item FROM (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN tasks_structure IS NOT NULL AND jsonb_typeof(tasks_structure->'objectives') = 'array'
              THEN tasks_structure->'objectives'
            WHEN jsonb_typeof(tasks) = 'object' AND tasks ? 'objectives'
              THEN tasks->'objectives'
            ELSE '[]'::jsonb
          END
        ) AS item
        FROM simulation_templates
        WHERE is_active = TRUE
      ) t
      WHERE trim(COALESCE(item,'')) <> ''
      ORDER BY item LIMIT 120
    `, []);

    // Unique task titles from tasks array
    const taskTitlesResult = await DatabaseService.execute(`
      SELECT DISTINCT elem->>'title' AS title
      FROM simulation_templates,
        jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(tasks) = 'array' THEN tasks
            WHEN tasks_structure IS NOT NULL AND jsonb_typeof(tasks_structure->'tasks') = 'array'
              THEN tasks_structure->'tasks'
            ELSE '[]'::jsonb
          END
        ) AS elem
      WHERE is_active = TRUE
        AND trim(COALESCE(elem->>'title','')) <> ''
      ORDER BY title LIMIT 200
    `, []);

    ResponseService.success(res, {
      objectives: objectivesResult.rows.map((r: any) => r.item).filter(Boolean),
      taskTitles: taskTitlesResult.rows.map((r: any) => r.title).filter(Boolean),
    });
  } catch (error) {
    ResponseService.success(res, { objectives: [], taskTitles: [] });
  }
});

// ============================================
// 1. TEMPLATE ROUTES
// ============================================

router.get('/templates', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('type').optional().isIn(SIMULATION_TYPES),
  query('difficulty').optional().isIn(SIMULATION_DIFFICULTIES),
  query('companyId').optional().isString(),
  query('search').optional().isString(),
  query('industry').optional().isString(),
  query('duration').optional().isInt({ min: 15, max: 480 }),
  validateRequest
], authHandler(SimulationController.getTemplates.bind(SimulationController)));

router.get('/templates/:id', protect, [
  param('id').isUUID().withMessage('Invalid template ID format'),
  validateRequest
], authHandler(SimulationController.getTemplate.bind(SimulationController)));

router.post('/templates', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  body('name').isString().isLength({ min: 3, max: 255 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').isIn(SIMULATION_TYPES),
  body('difficulty').isIn(SIMULATION_DIFFICULTIES),
  body('duration_minutes').isInt({ min: 15, max: 480 }),
  body('tasks').isArray({ min: 1 }),
  body('scoring_rubric').optional().isObject(),
  body('is_public').optional().isBoolean(),
  body('job_id').optional().isUUID().withMessage('Invalid job ID format'),
  validateRequest
], authHandler(SimulationController.createTemplate.bind(SimulationController)));

router.put('/templates/:id', protect, [
  param('id').isUUID().withMessage('Invalid template ID format'),
  body('name').optional().isString().isLength({ min: 3, max: 255 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').optional().isIn(SIMULATION_TYPES),
  body('difficulty').optional().isIn(SIMULATION_DIFFICULTIES),
  body('duration_minutes').optional().isInt({ min: 15, max: 480 }),
  body('tasks').optional().isArray({ min: 1 }),
  body('scoring_rubric').optional().isObject(),
  body('is_public').optional().isBoolean(),
  validateRequest
], authHandler(SimulationController.updateTemplate.bind(SimulationController)));

router.delete('/templates/:id', protect, [
  param('id').isUUID().withMessage('Invalid template ID format'),
  validateRequest
], authHandler(SimulationController.deleteTemplate.bind(SimulationController)));

// ============================================
// SIMULATION FLOW ROUTES (Complete orchestration)
// ============================================
// Endpoint: POST /api/v1/simulations/flow/start
// Creates: Simulation → Tasks → Session → GitHub Repo → Issues
// Returns: GitHub repo info for candidate

router.post('/flow/start', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  body('templateId').isUUID().withMessage('Invalid template ID format'),
  body('applicationId').optional().isUUID().withMessage('Invalid application ID format'),
  body('candidateGitHubUsername').isString().trim().notEmpty().withMessage('GitHub username is required'),
  body('candidateId').optional().isUUID().withMessage('Invalid candidate ID format'),
  validateRequest
], authHandler(SimulationController.startSimulationFlow.bind(SimulationController)));

// ============================================
// 2. CANDIDATE SIMULATION ROUTES (for applied jobs)
// ============================================

router.get('/my-simulations', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status').optional().isIn(['not_started', 'in_progress', 'completed']),
  validateRequest
], authHandler(SimulationController.getMySimulations.bind(SimulationController)));

router.get('/my-simulations/stats', protect, authorize('candidate'), 
  authHandler(SimulationController.getMySimulationStats.bind(SimulationController))
);

router.post('/my-simulations/start', protect, authorize('candidate'), [
  body('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  body('applicationId').isUUID().withMessage('Invalid application ID format'),
  validateRequest
], authHandler(SimulationController.startAppliedJobSimulation.bind(SimulationController)));

router.get('/my-simulations/:id', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.getMySimulationById.bind(SimulationController)));

router.get('/my-simulations/:id/resume', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.resumeMySimulation.bind(SimulationController)));

router.post('/my-simulations/:id/progress', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid session ID format'),
  body('currentTask').optional().isInt({ min: 0 }),
  body('answers').optional().isObject(),
  body('timeSpent').optional().isInt({ min: 0 }),
  validateRequest
], authHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const sessionId = req.params.id;
    const { currentTask = 0, answers = {}, timeSpent = 0 } = req.body;

    // ✅ STEP 1: Verify session exists and belongs to user
    const sessionCheck = await DatabaseService.query(`
      SELECT id FROM simulation_sessions
      WHERE id = $1 AND user_id = $2 AND status IN ('in_progress', 'paused')
      LIMIT 1
    `, [sessionId, req.user.id]);

    if (!sessionCheck.rows[0]) {
      ResponseService.error(res, 'Session not found or not active', 404);
      return;
    }

    // ✅ STEP 2: Update ONLY session's current_task and time_spent (NOT answers/progress)
    const sessionResult = await DatabaseService.query(`
      UPDATE simulation_sessions
      SET current_task = $1,
          time_spent = $2,
          updated_at = NOW()
      WHERE id = $3 AND user_id = $4
      RETURNING id, current_task, time_spent, status
    `, [currentTask, timeSpent, sessionId, req.user.id]);

    if (!sessionResult.rows[0]) {
      ResponseService.error(res, 'Failed to update session', 500);
      return;
    }

    // ✅ STEP 3: Save each task's answer to session_task_progress (per-task, not global)
    const savedTasks = [];
    for (const [taskKey, taskAnswer] of Object.entries(answers)) {
      try {
        // Extract task index from key (e.g., "task_0" → 0)
        const taskIndexMatch = String(taskKey).match(/task_(\d+)/);
        const taskIndex = taskIndexMatch && taskIndexMatch[1] !== undefined ? parseInt(taskIndexMatch[1]) : null;
        
        if (taskIndex === null || taskIndex < 0) {
          console.warn(`⚠️ Skipping invalid task key: ${taskKey}`);
          continue;
        }

        // Check if progress record exists for this task
        const existing = await DatabaseService.query(`
          SELECT id FROM session_task_progress
          WHERE session_id = $1 AND task_index = $2
          LIMIT 1
        `, [sessionId, taskIndex]);

        if (existing.rows[0]) {
          // ✅ UPDATE: Only update this specific task's answer
          await DatabaseService.update('session_task_progress', existing.rows[0].id, {
            answer: taskAnswer,
            updated_at: new Date()
          });
        } else {
          // ✅ CREATE: New task progress record with answer
          await DatabaseService.create('session_task_progress', {
            session_id: sessionId,
            task_index: taskIndex,
            answer: taskAnswer,
            status: 'in_progress',
            started_at: new Date(),
            updated_at: new Date()
          });
        }
        
        savedTasks.push({ taskIndex, answer: taskAnswer });
      } catch (err) {
        console.error(`Failed to save answer for ${taskKey}:`, err);
      }
    }

    console.log(`✅ [saveProgress] Session ${sessionId}: saved ${savedTasks.length} task answers`);

    ResponseService.success(res, {
      sessionId,
      currentTask: sessionResult.rows[0].current_task,
      timeSpent: sessionResult.rows[0].time_spent,
      savedTasks,
      message: `Progress saved - ${savedTasks.length} tasks updated`
    }, 'Progress saved successfully');
    
  } catch (error: any) {
    console.error('Save progress error:', error);
    ResponseService.error(res, 'Failed to save progress', 500);
  }
}));

router.post('/my-simulations/:id/cancel', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.cancelMySimulation.bind(SimulationController)));

router.get('/my-simulations/:id/results', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.getSimulationResults.bind(SimulationController)));

// ============================================
// 3. DIRECT SIMULATION SESSIONS ROUTES
// ============================================

router.get('/my-simulation-sessions', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['in_progress', 'completed', 'all']),
  validateRequest
], authHandler(SimulationController.getMySimulationSessions.bind(SimulationController)));

router.get('/sessions/:sessionId', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.getSimulationSessionById.bind(SimulationController)));


router.post('/sessions/:sessionId/resume', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.resumeSimulationSession.bind(SimulationController)));

router.delete('/sessions/:sessionId/cancel', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.cancelSimulationSession.bind(SimulationController)));

// Admin: cancel any session
router.patch('/sessions/:sessionId/admin-cancel', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  body('reason').optional().isString().isLength({ max: 500 }),
  validateRequest
], authHandler(SimulationController.adminCancelSession.bind(SimulationController)));

// Admin: reset session so candidate can redo
router.patch('/sessions/:sessionId/admin-reset', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.adminResetSession.bind(SimulationController)));

// Admin: reopen session so candidate can continue from where they left off
router.patch('/sessions/:sessionId/admin-reopen', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.adminReopenSession.bind(SimulationController)));

// ============================================
// 4. TASK EXECUTION ROUTES
// ============================================

router.post('/tasks/run-code', protect, [
  body('code').isString(),
  body('language').isString().trim().isLength({ min: 2, max: 50 }),
  body('testCases').optional().isArray(),
  body('simulationId').optional().isString(),
  body('taskId').optional().isString(),
  validateRequest
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { code, language, testCases, simulationId, taskId } = req.body;
    
    console.log('📝 Code execution request:', { language, codeLength: code?.length });
    
    let output = '';
    let error = null;
    
    switch (language) {
      case 'javascript':
      case 'typescript':
        try {
          let consoleOutput: string[] = [];
          const originalLog = console.log;
          console.log = (...args) => {
            consoleOutput.push(args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' '));
            originalLog(...args);
          };
          
          const asyncFn = new Function(code);
          const result = await asyncFn();
          
          console.log = originalLog;
          
          output = consoleOutput.join('\n');
          if (result !== undefined && output === '') {
            output = String(result);
          }
          if (output === '') {
            output = 'Code executed successfully (no console output)';
          }
        } catch (err: any) {
          error = err.message;
          output = `Error: ${err.message}`;
        }
        break;
        
      case 'python':
        output = `Python execution not implemented yet.\nCode:\n${code}`;
        break;
        
      case 'java':
        output = `Java execution not implemented yet.\nCode:\n${code}`;
        break;
        
      default:
        output = `Execution for ${language} not implemented yet.\nCode:\n${code}`;
    }
    
    res.json({ 
      success: !error, 
      output: output,
      data: { output, error }
    });
    
  } catch (error: any) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Code execution failed',
      output: `Error: ${error.message}`
    });
  }
});

router.post('/tasks/run-project', protect, [], async (req: express.Request, res: express.Response): Promise<void> => {
  res.json({ success: true, message: 'Project execution endpoint' });
});

router.post('/tasks/run-command', protect, [], async (req: express.Request, res: express.Response): Promise<void> => {
  res.json({ success: true, message: 'Command execution endpoint' });
});

router.post('/tasks/test-project', protect, [], async (req: express.Request, res: express.Response): Promise<void> => {
  res.json({ success: true, message: 'Project testing endpoint' });
});

// ============================================
// 5. SIMULATION SESSION SUBMIT & RESULTS ROUTES
// ============================================

router.post('/sessions/:id/submit', protect, authorize('candidate'), [
  param('id').isUUID().withMessage('Invalid session ID format'),
  body('answers').isObject(),
  body('timeSpent').isInt({ min: 0 }),
  validateRequest
], authHandler(SimulationController.submitSimulation.bind(SimulationController)));

router.get('/sessions/:id/results', protect, [
  param('id').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const sessionId = req.params.id;

    const result = await DatabaseService.query(`
      SELECT
        ss.*,
        s.overall_score,
        s.completed_at as simulation_completed_at,
        st.name as simulation_name,
        st.description as simulation_description,
        st.duration_minutes,
        st.difficulty,
        st.type as simulation_type,
        st.tasks,
        st.scoring_rubric,
        st.pass_fail_criteria,
        j.title as job_title,
        c.name as company_name,
        e.id as evaluation_id,
        e.overall_score as evaluation_overall_score,
        e.punctuality_score,
        e.communication_score,
        e.problem_solving_score,
        e.adaptability_score,
        e.collaboration_score,
        e.attention_to_detail_score,
        e.initiative_score,
        e.status as evaluation_status,
        e.completed_at as evaluation_completed_at
      FROM simulation_sessions ss
      INNER JOIN simulations s ON ss.simulation_id = s.id
      INNER JOIN simulation_templates st ON s.template_id = st.id
      LEFT JOIN evaluations e ON e.simulation_id = s.id AND e.candidate_id = s.user_id
      LEFT JOIN applications a ON s.application_id = a.id
      LEFT JOIN jobs j ON a.job_id = j.id
      LEFT JOIN companies c ON j.company_id = c.id
      WHERE ss.id = $1 AND ss.user_id = $2
    `, [sessionId, req.user.id]);

    if (!result.rows[0]) {
      ResponseService.notFound(res, 'Session not found');
      return;
    }

    const row = result.rows[0];

    const results = {
      session_id: row.id,
      simulation_id: row.simulation_id,
      overall_score: row.evaluation_overall_score || row.overall_score || 0,
      punctuality_score: row.punctuality_score || 0,
      communication_score: row.communication_score || 0,
      problem_solving_score: row.problem_solving_score || 0,
      adaptability_score: row.adaptability_score || 0,
      collaboration_score: row.collaboration_score || 0,
      attention_to_detail_score: row.attention_to_detail_score || 0,
      initiative_score: row.initiative_score || 0,
      evaluation_status: row.evaluation_status || 'pending',
      evaluation_completed_at: row.evaluation_completed_at || row.simulation_completed_at,
      simulation_name: row.simulation_name,
      simulation_type: row.simulation_type,
      difficulty: row.difficulty,
      duration_minutes: row.duration_minutes,
      job_title: row.job_title,
      company_name: row.company_name,
      tasks: row.tasks,
      scoring_rubric: row.scoring_rubric,
      pass_fail_criteria: row.pass_fail_criteria,
      passed: (row.evaluation_overall_score || row.overall_score || 0) >= (row.pass_fail_criteria?.passing_score || 70)
    };

    ResponseService.success(res, results);

  } catch (error: any) {
    console.error('Get results error:', error);
    ResponseService.error(res, 'Failed to fetch results', 500);
  }
}));

// ============================================
// 6. TASK PROGRESS ROUTES
// ============================================

router.get('/sessions/:sessionId/tasks', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.getSessionTaskProgress.bind(SimulationController)));


// In simulation.routes.ts - Ensure this route exists
router.put('/sessions/:sessionId/tasks/:taskIndex', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  param('taskIndex').isInt({ min: 0 }).withMessage('Task index must be 0 or greater'),
  body('status').optional().isIn(['not_started', 'in_progress', 'completed']),
  body('answer').optional(),
  body('score').optional().isFloat({ min: 0, max: 100 }),
  body('feedback').optional().isString(),
  body('githubCommitUrl').optional().isURL(),
  body('timeSpent').optional().isInt({ min: 0 }),
  body('started_at').optional().isString(),
  body('completed_at').optional().isString(),
  validateRequest
], authHandler(SimulationController.updateTaskProgress.bind(SimulationController)));

router.patch('/sessions/:sessionId/tasks/:taskIndex/score', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  param('taskIndex').isInt({ min: 0 }).withMessage('Task index must be 0 or greater'),
  body('score').isInt({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100'),
  validateRequest
], authHandler(SimulationController.updateTaskScore.bind(SimulationController)));

router.patch('/sessions/:sessionId/tasks/:taskIndex/feedback', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  param('taskIndex').isInt({ min: 0 }).withMessage('Task index must be 0 or greater'),
  body('feedback').isString().isLength({ min: 1, max: 5000 }).withMessage('Feedback must be a string (1-5000 characters)'),
  validateRequest
], authHandler(SimulationController.updateTaskFeedback.bind(SimulationController)));

// ============================================
// 7. CHAT ROUTES - SIMULATION SCOPED (MUST COME BEFORE GENERIC /:id ROUTES)
// ============================================

// GET messages by simulation ID
router.get('/:simulationId/chat', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  validateRequest
], authHandler(SimulationController.getChatMessages.bind(SimulationController)));

// GET threaded messages by simulation ID
router.get('/:simulationId/chat/threaded', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('filter').optional().isIn(['all', 'my_messages', 'my_replies']),
  validateRequest
], authHandler(SimulationController.getSimulationChatWithReplies.bind(SimulationController)));

// POST message by simulation ID
router.post('/:simulationId/chat', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  body('message').isString().isLength({ min: 1, max: 19000000 }),
  body('messageType').optional().isIn(CHAT_MESSAGE_TYPES),
  body('replyTo').optional().isUUID(),
  body('sessionId').isUUID().withMessage('Session ID is required'),
  body('simulationId').isUUID().withMessage('Simulation ID is required'),
  validateRequest
], authHandler(SimulationController.sendChatMessage.bind(SimulationController)));

// PUT (edit) message by simulation ID
router.put('/:simulationId/chat/:messageId', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  param('messageId').isUUID().withMessage('Invalid message ID format'),
  body('message').isString().isLength({ min: 1, max: 19000000 }),
  validateRequest
], authHandler(SimulationController.editChatMessage.bind(SimulationController)));

// DELETE message by simulation ID
router.delete('/:simulationId/chat/:messageId', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  param('messageId').isUUID().withMessage('Invalid message ID format'),
  validateRequest
], authHandler(SimulationController.deleteChatMessage.bind(SimulationController)));

// GET unread count by simulation ID
router.get('/:simulationId/chat/unread', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.getUnreadMessageCount.bind(SimulationController)));

// POST mark as read by simulation ID
router.post('/:simulationId/chat/mark-read', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  body('messageIds').optional().isArray(),
  validateRequest
], authHandler(SimulationController.markMessagesAsRead.bind(SimulationController)));

// GET statistics by simulation ID
router.get('/:simulationId/chat/statistics', protect, [
  param('simulationId').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.getChatStatistics.bind(SimulationController)));

// ============================================
// 8. CHAT ROUTES - SESSION SCOPED
// ============================================

router.get('/sessions/:sessionId/chat', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  validateRequest
], authHandler(SimulationController.getChatMessages.bind(SimulationController)));

router.get('/sessions/:sessionId/chat/threaded', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('filter').optional().isIn(['all', 'my_messages', 'my_replies']),
  validateRequest
], authHandler(SimulationController.getSimulationChatWithReplies.bind(SimulationController)));

router.post('/sessions/:sessionId/chat', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  body('message').isString().isLength({ min: 1, max: 19000000 }),
  body('messageType').optional().isIn(CHAT_MESSAGE_TYPES),
  body('replyTo').optional().isUUID(),
  body('simulationId').isUUID().withMessage('Simulation ID is required'),
  validateRequest
], authHandler(SimulationController.sendChatMessage.bind(SimulationController)));

router.put('/sessions/:sessionId/chat/:messageId', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  param('messageId').isUUID().withMessage('Invalid message ID format'),
  body('message').isString().isLength({ min: 1, max: 19000000 }),
  validateRequest
], authHandler(SimulationController.editChatMessage.bind(SimulationController)));

router.delete('/sessions/:sessionId/chat/:messageId', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  param('messageId').isUUID().withMessage('Invalid message ID format'),
  validateRequest
], authHandler(SimulationController.deleteChatMessage.bind(SimulationController)));

router.get('/sessions/:sessionId/chat/unread', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.getUnreadMessageCount.bind(SimulationController)));

router.post('/sessions/:sessionId/chat/mark-read', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  body('messageIds').optional().isArray(),
  validateRequest
], authHandler(SimulationController.markMessagesAsRead.bind(SimulationController)));

router.get('/sessions/:sessionId/chat/statistics', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.getChatStatistics.bind(SimulationController)));

// ============================================
// 9. GLOBAL CHAT THREAD ROUTES
// ============================================

router.get('/chat/threads/:threadId', protect, [
  param('threadId').isUUID().withMessage('Invalid thread ID format'),
  query('sessionId').optional().isUUID(),
  query('simulationId').optional().isUUID(),
  validateRequest
], authHandler(SimulationController.getMessageThread.bind(SimulationController)));

// ============================================
// 10. GITHUB LINKS ROUTES
// ============================================

router.put('/sessions/:sessionId/github-links', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  body('githubLinks').isObject(),
  validateRequest
], authHandler(SimulationController.updateGithubLinks.bind(SimulationController)));

// ============================================
// 11. STATS OVERVIEW ROUTE
// ============================================

router.get('/stats/overview', protect, [
  query('companyId').optional().isUUID(),
  validateRequest
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    let companyId = req.query.companyId as string;
    
    if ((authReq.user.user_type === 'company_admin' || authReq.user.user_type === 'recruiter') && !companyId) {
      const teamResult = await DatabaseService.query(
        'SELECT company_id FROM company_team WHERE user_id = $1 LIMIT 1',
        [authReq.user.id]
      );
      companyId = teamResult.rows[0]?.company_id;
    }
    
    let whereClause = '';
    const params: any[] = [];
    let idx = 1;
    
    if (companyId) {
      whereClause = `WHERE company_id = $${idx++}`;
      params.push(companyId);
    }
    
    const stats = await DatabaseService.query(`
      SELECT 
        COUNT(*) as total_templates,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_templates,
        COUNT(CASE WHEN is_public = false THEN 1 END) as private_templates,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_templates,
        AVG(duration_minutes)::int as avg_duration,
        COUNT(DISTINCT company_id) as companies_using
      FROM simulation_templates
      ${whereClause}
    `, params);
    
    const sessionStats = await DatabaseService.query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as active_sessions,
        AVG(score)::int as avg_score
      FROM simulation_sessions ss
      ${companyId ? `WHERE simulation_id IN (SELECT id FROM simulation_templates WHERE company_id = $1)` : ''}
    `, companyId ? [companyId] : []);
    
    res.json({
      success: true,
      data: {
        templates: stats.rows[0],
        sessions: sessionStats.rows[0],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

router.post('/github-score', protect, [
  body('repoUrl').optional().isURL().withMessage('repoUrl must be a valid URL'),
  body('owner').optional().isString().trim().notEmpty(),
  body('repo').optional().isString().trim().notEmpty(),
  body('sessionId').optional().isUUID().withMessage('sessionId must be a valid UUID'),
  validateRequest
], authHandler((req, res) => (SimulationController as any).calculateGitHubScoreForRepo(req, res)));

// ============================================
// 12. RECRUITER/ADMIN ROUTES
// ============================================

router.get('/:id/candidates', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['all', 'completed', 'in_progress']),
  validateRequest
], authHandler(SimulationController.getSimulationCandidates.bind(SimulationController)));

// ============================================
// 13. GENERIC SIMULATION ROUTES (MUST BE LAST!)
// ============================================

router.get('/', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(SIMULATION_STATUSES),
  query('type').optional().isIn(SIMULATION_TYPES),
  query('difficulty').optional().isIn(SIMULATION_DIFFICULTIES),
  query('sort').optional().isString(),
  validateRequest
], authHandler(SimulationController.getSimulations.bind(SimulationController)));

router.post('/', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  body('title').isString().isLength({ min: 3, max: 255 }),
  body('jobRole').isString().isLength({ min: 2, max: 100 }),
  body('jobId').optional().isUUID().withMessage('Invalid job ID format'),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('duration').isInt({ min: 15, max: 480 }),
  body('difficulty').isIn(SIMULATION_DIFFICULTIES),
  body('objectives').isArray(),
  body('tasks').isArray({ min: 1 }),
  body('scoring').isObject(),
  body('settings').isObject(),
  body('passFailCriteria').optional().isObject(),
  body('availability').optional().isObject(),
  body('practiceEnabled').optional().isBoolean(),
  body('practiceSimulation').optional().isObject(),
  body('compliance').optional().isArray(),
  body('status').optional().isIn(['draft', 'active']),
  validateRequest
], authHandler(SimulationController.createSimulation.bind(SimulationController)));

// IMPORTANT: These generic routes with :id parameter MUST come AFTER all specific routes
router.get('/:id', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.getSimulationById.bind(SimulationController)));

router.put('/:id', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  body('title').optional().isString().isLength({ min: 3, max: 255 }),
  body('jobId').optional().isUUID().withMessage('Invalid job ID format'),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('duration').optional().isInt({ min: 15, max: 480 }),
  body('difficulty').optional().isIn(SIMULATION_DIFFICULTIES),
  body('objectives').optional().isArray(),
  body('tasks').optional().isArray({ min: 1 }),
  body('scoring').optional().isObject(),
  body('settings').optional().isObject(),
  body('passFailCriteria').optional().isObject(),
  body('availability').optional().isObject(),
  body('status').optional().isIn(['draft', 'active', 'archived']),
  validateRequest
], authHandler(SimulationController.updateSimulation.bind(SimulationController)));

router.delete('/:id', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.deleteSimulation.bind(SimulationController)));

router.post('/:id/publish', protect, authorize('recruiter', 'company_admin', 'system_admin'), [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.publishSimulation.bind(SimulationController)));

router.post('/:id/duplicate', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.duplicateSimulation.bind(SimulationController)));

router.patch('/:id/archive', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  validateRequest
], authHandler(SimulationController.archiveSimulation.bind(SimulationController)));

router.post('/:id/auto-save', protect, [
  param('id').isUUID().withMessage('Invalid simulation ID format'),
  body('currentTask').optional().isInt({ min: 0 }),
  body('answers').optional().isObject(),
  body('progress').optional().isObject(),
  validateRequest
], authHandler(SimulationController.autoSaveProgress.bind(SimulationController)));


// ============================================
// BLOCKCHAIN VERIFICATION ROUTES (MUST BE BEFORE GENERIC :id ROUTES)
// ============================================

/**
 * @route   GET /api/v1/simulations/sessions/:sessionId/blockchain
 * @desc    Get blockchain record for a simulation session
 * @access  Private (Candidate or Recruiter)
 */
router.get('/sessions/:sessionId/blockchain', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(async (req: AuthenticatedRequest, res: express.Response) => {
  return SimulationController.getBlockchainRecord(req, res);
}));

/**
 * @route   GET /api/v1/simulations/verify/:credentialHash
 * @desc    Verify a simulation credential by hash (public endpoint)
 * @access  Public
 */
router.get('/verify/:credentialHash', [
  param('credentialHash').isString().withMessage('Invalid credential hash'),
  validateRequest
], async (req: express.Request, res: express.Response) => {
  return SimulationController.verifyCredential(req as AuthenticatedRequest, res);
});


// Add before the generic routes
router.get('/sessions/:sessionId/submission-results', protect, [
  param('sessionId').isUUID().withMessage('Invalid session ID format'),
  validateRequest
], authHandler(SimulationController.getSubmissionResults.bind(SimulationController)));

export default router;
