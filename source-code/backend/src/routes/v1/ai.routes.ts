import express, { Router, Request, Response } from 'express';
import { query, body } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import aiController from '../../controllers/ai.controller.js';

const router: Router = express.Router();

// @route   GET /api/v1/ai/analysis
// @desc    Get AI analysis for user
// @access  Private
router.get('/analysis', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('type').optional().isIn(['resume_analysis', 'job_matching', 'skill_assessment', 'career_advice']),
  validateRequest
], (req: any, res: any) => aiController.getAnalysis(req, res));

// @route   GET /api/v1/ai/skill-gaps
// @desc    Get skill gap analysis
// @access  Private (Candidates)
router.get('/skill-gaps', protect, (req: any, res: any) => {
  if (!['candidate'].includes(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return aiController.getSkillGaps(req, res);
});

// @route   POST /api/v1/ai/analyze-resume
// @desc    Analyze resume with AI
// @access  Private (Candidates)
router.post('/analyze-resume', protect, body('resumeId').isUUID(), validateRequest, (req: any, res: any) => {
  if (!['candidate'].includes(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return aiController.analyzeResume(req, res);
});

// @route   POST /api/v1/ai/match-job
// @desc    Match candidate with jobs using AI
// @access  Private (Candidates)
router.post('/match-job', protect, body('jobIds').isArray(), body('jobIds.*').isUUID(), validateRequest, (req: any, res: any) => {
  if (!['candidate'].includes(req.user.user_type)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return aiController.matchJobs(req, res);
});

// @route   GET /api/v1/ai/performance-trends
// @desc    Get performance trends
// @access  Private
router.get('/performance-trends', protect, (req: any, res: any) => aiController.getPerformanceTrends(req, res));

export default router;
