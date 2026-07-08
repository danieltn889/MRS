import express, { Router, Request, Response } from 'express';
const router: Router = express.Router();

// Import route modules
import authRoutes from './v1/auth.routes.js';  // .ts -> .js
import verifyEmailRoutes from './v1/verify-email.routes.js';  // .ts -> .js
import candidateRoutes from './v1/candidate.routes.js';  // .ts -> .js
import companyRoutes from './v1/company.routes.js';  // .ts -> .js
import jobRoutes from './v1/job.routes.js';  // .ts -> .js
import applicationRoutes from './v1/application.routes.js';  // .ts -> .js
import simulationRoutes from './v1/simulation.routes.js';  // .ts -> .js
import evaluationRoutes from './evaluation.routes.js';  // .ts -> .js
import aiRoutes from './v1/ai.routes.js';  // .ts -> .js
import blockchainRoutes from './v1/blockchain.routes.js';  // .ts -> .js
import analyticsRoutes from './v1/analytics.routes.js';  // .ts -> .js
import notificationRoutes from './v1/notification.routes.js';  // .ts -> .js
import integrationRoutes from './v1/integration.routes.js';  // .ts -> .js
import billingRoutes from './v1/billing.routes.js';  // .ts -> .js
import githubRoutes from './v1/github.routes.js';  // Already correct  // ✅ ADD THIS LINE
import feedRoutes from './v1/feed.routes.js';

// Mount routes
router.use('/auth', authRoutes);
router.use('/verify-email', verifyEmailRoutes);
router.use('/candidates', candidateRoutes);
router.use('/companies', companyRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/simulations', simulationRoutes);
router.use('/evaluations', evaluationRoutes);
router.use('/ai', aiRoutes);
router.use('/blockchain', blockchainRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/integrations', integrationRoutes);
router.use('/billing', billingRoutes);
router.use('/github', githubRoutes);  // ✅ ADD THIS LINE
router.use('/feed', feedRoutes);

// API info
router.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Recruitment Platform API v1',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/v1/auth',
      candidates: '/api/v1/candidates',
      companies: '/api/v1/companies',
      jobs: '/api/v1/jobs',
      applications: '/api/v1/applications',
      simulations: '/api/v1/simulations',
      evaluations: '/api/v1/evaluations',
      ai: '/api/v1/ai',
      blockchain: '/api/v1/blockchain',
      analytics: '/api/v1/analytics',
      notifications: '/api/v1/notifications',
      integrations: '/api/v1/integrations',
      billing: '/api/v1/billing',
      github: '/api/v1/github'  // ✅ ADD THIS LINE
    }
  });
});

export default router;