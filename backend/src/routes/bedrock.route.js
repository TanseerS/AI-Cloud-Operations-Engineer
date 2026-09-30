import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { runAiAnalysis, getAiStatus } from '../services/bedrock.service.js';

const router = Router();

/**
 * GET /api/v1/ai/status
 *
 * Configuration and last-known state. Makes no Bedrock call, so the dashboard can show
 * a model indicator without costing anything.
 */
router.get('/status', (_req, res) => {
  res.status(200).json(getAiStatus());
});

/**
 * POST /api/v1/ai/analyze
 *
 * Deliberately POST: analysis costs money, so it cannot be triggered by a page render,
 * a prefetch or a crawler. The backend gathers its own AWS data - the request body is
 * not a channel for supplying it.
 */
router.post(
  '/analyze',
  asyncHandler(async (req, res) => {
    res.status(200).json(await runAiAnalysis({ force: req.query.force === 'true' }));
  }),
);

export default router;
