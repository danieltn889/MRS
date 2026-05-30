import { Router } from 'express';
import { evaluationController } from '../controllers/evaluation.controller';
import { protect, authorize } from '../middleware/auth.middleware';

const router = Router();

// All evaluation routes require authentication
router.use(protect);

// Get evaluation for specific candidate and simulation
router.get('/:candidateId/:simulationId',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.getEvaluation.bind(evaluationController)
);

// Update evaluation status
router.put('/:candidateId/:simulationId/status',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.updateEvaluationStatus.bind(evaluationController)
);

// Get all evaluations (with filtering)
router.get('/',
  authorize('recruiter', 'company_admin', 'system_admin'),
  evaluationController.getEvaluations.bind(evaluationController)
);

// Generate AI feedback for evaluation
router.post('/:evaluationId/ai-feedback',
  authorize('system_admin'),
  evaluationController.generateAIFeedback.bind(evaluationController)
);

// Calculate benchmarks for evaluation
router.post('/:evaluationId/benchmarks',
  authorize('system_admin'),
  evaluationController.calculateBenchmarks.bind(evaluationController)
);

// Admin-only routes for configuration
router.put('/admin/ai-weights',
  authorize('system_admin'),
  evaluationController.updateAIScoringWeights.bind(evaluationController)
);

router.put('/admin/communication-standards',
  authorize('system_admin'),
  evaluationController.updateCommunicationStandards.bind(evaluationController)
);

router.put('/admin/minimum-scores',
  authorize('system_admin'),
  evaluationController.updateMinimumScores.bind(evaluationController)
);

export default router;