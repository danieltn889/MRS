import express, { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import AuditChainService from '../../services/audit-chain.service.js';
import { logger } from '../../utils/logger.js';

const router: Router = express.Router();

// =====================================================
// AUDIT CHAIN (hash-linked, tamper-evident audit trail)
// =====================================================

// @route GET /api/v1/blockchain/chain/stats — chain status for the dashboard
router.get('/chain/stats', protect, async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await AuditChainService.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('audit chain stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load chain stats' });
  }
});

// @route GET /api/v1/blockchain/chain/verify — verify the ENTIRE chain.
// Read-only integrity check (no sensitive data) — available to any authenticated
// user so candidates can verify their own results have not been tampered with.
router.get('/chain/verify', protect, async (_req: Request, res: Response): Promise<void> => {
  try {
    const report = await AuditChainService.verifyChain();
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('audit chain verify error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify chain' });
  }
});

// @route GET /api/v1/blockchain/chain — browse / search the explorer
router.get('/chain', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('eventType').optional().isString().trim(),
  query('candidateId').optional().isUUID(),
  query('simulationId').optional().isUUID(),
  query('blockNumber').optional().isInt({ min: 0 }).toInt(),
  validateRequest,
], async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, eventType, candidateId, simulationId, blockNumber } = req.query as any;
    const result = await AuditChainService.search({ page, limit, eventType, candidateId, simulationId, blockNumber });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('audit chain search error:', error);
    res.status(500).json({ success: false, message: 'Failed to search chain' });
  }
});

// @route GET /api/v1/blockchain/chain/:id/verify — verify a single block
router.get('/chain/:id/verify', protect, [param('id').isUUID(), validateRequest], async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await AuditChainService.verifyBlock(String(req.params.id));
    if (!result.found) {
      res.status(404).json({ success: false, message: 'Block not found' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('audit chain verify block error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify block' });
  }
});

// @route GET /api/v1/blockchain/chain/:id — get a single block
router.get('/chain/:id', protect, [param('id').isUUID(), validateRequest], async (req: Request, res: Response): Promise<void> => {
  try {
    const block = await AuditChainService.getBlock(String(req.params.id));
    if (!block) {
      res.status(404).json({ success: false, message: 'Block not found' });
      return;
    }
    res.json({ success: true, data: block });
  } catch (error) {
    logger.error('audit chain get block error:', error);
    res.status(500).json({ success: false, message: 'Failed to load block' });
  }
});

// @route   GET /api/v1/blockchain/credentials
// @desc    Get user's blockchain credentials
// @access  Private
router.get('/credentials', protect, [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('status').optional().isIn(['pending', 'verified', 'rejected', 'expired']),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   GET /api/v1/blockchain/credentials/:id
// @desc    Get specific credential details
// @access  Private (Owner or Authorized)
router.get('/credentials/:id', protect, [
  param('id').isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   POST /api/v1/blockchain/credentials
// @desc    Create blockchain credential
// @access  Private
router.post('/credentials', protect, [
  body('credentialType').isIn(['certificate', 'badge', 'license', 'award', 'skill', 'experience']),
  body('title').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('issuer').trim().isLength({ min: 1, max: 255 }),
  body('issueDate').isISO8601(),
  body('expiryDate').optional().isISO8601(),
  body('metadata').optional().isObject(),
  body('companyId').optional().isUUID(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   POST /api/v1/blockchain/credentials/:id/verify
// @desc    Verify credential on blockchain
// @access  Private (Owner or Company Admin)
router.post('/credentials/:id/verify', protect, [
  param('id').isUUID(),
  body('verifierNotes').optional().trim().isLength({ max: 500 }),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   POST /api/v1/blockchain/credentials/:id/share
// @desc    Share credential access
// @access  Private (Owner)
router.post('/credentials/:id/share', protect, authorize('candidate'), [
  param('id').isUUID(),
  body('companyId').isUUID(),
  body('accessLevel').isIn(['basic', 'full']),
  body('expiresAt').optional().isISO8601(),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   GET /api/v1/blockchain/verify/:token
// @desc    Verify credential via shared token
// @access  Public
router.get('/verify/:token', [
  param('token').isLength({ min: 64, max: 64 }),
  validateRequest
], async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

// @route   GET /api/v1/blockchain/network-status
// @desc    Get blockchain network status
// @access  Public
router.get('/network-status', async (req: Request, res: Response): Promise<void> => { res.json({ success: true, data: { message: "Blockchain feature not yet implemented" } }); });

export default router;
