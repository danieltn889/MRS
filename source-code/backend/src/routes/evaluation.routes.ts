import { Router } from 'express';
import { evaluationController } from '../controllers/evaluation.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = Router();

// All evaluation routes require authentication
router.use(protect);

// Get evaluation for specific candidate and simulation
router.get('/:candidateId/:simulationId',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.getEvaluation as any
);

// Update evaluation status
router.put('/:candidateId/:simulationId/status',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.updateEvaluationStatus as any
);

// Get all evaluations (with filtering)
router.get('/',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.getEvaluations as any
);

// Generate AI feedback for evaluation
router.post('/:evaluationId/ai-feedback',
  authorize('system_admin'),
  evaluationController.generateAIFeedback as any
);

// Calculate benchmarks for evaluation
router.post('/:evaluationId/benchmarks',
  authorize('system_admin'),
  evaluationController.calculateBenchmarks as any
);

// Admin-only routes for configuration
router.put('/admin/ai-weights',
  authorize('system_admin'),
  evaluationController.updateAIScoringWeights as any
);

router.put('/admin/communication-standards',
  authorize('system_admin'),
  evaluationController.updateCommunicationStandards as any
);

router.put('/admin/minimum-scores',
  authorize('system_admin'),
  evaluationController.updateMinimumScores as any
);

export default router;