import express, { Request, Response } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { withAuth } from '../../utils/auth.utils.js';
import FeedController from '../../controllers/feed.controller.js';

const router = express.Router();

router.use(protect);

// Personalized feed for candidates
router.get('/',       authorize('candidate'), withAuth((req, res) => FeedController.getPersonalizedFeed(req, res)));
router.get('/saved',  authorize('candidate'), withAuth((req, res) => FeedController.getSavedJobs(req, res)));
router.get('/activity', authorize('candidate'), withAuth((req, res) => FeedController.getActivity(req, res)));
router.get('/ml-status', authorize('candidate'), withAuth((req, res) => FeedController.getMlStatus(req, res)));

// Activity logging
router.post('/view/:jobId',     authorize('candidate'), withAuth((req, res) => FeedController.logJobView(req, res)));
router.post('/ignore/:jobId',   authorize('candidate'), withAuth((req, res) => FeedController.ignoreJob(req, res)));
router.delete('/ignore/:jobId', authorize('candidate'), withAuth((req, res) => FeedController.unignoreJob(req, res)));
router.post('/save/:jobId',     authorize('candidate'), withAuth((req, res) => FeedController.saveJob(req, res)));
router.delete('/save/:jobId',   authorize('candidate'), withAuth((req, res) => FeedController.unsaveJob(req, res)));
router.post('/search-log',      authorize('candidate'), withAuth((req, res) => FeedController.logSearch(req, res)));
router.post('/application-start/:jobId', authorize('candidate'), withAuth((req, res) => FeedController.logApplicationStart(req, res)));

export default router;
