import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { getCostAnalysis } from '../services/cost.service.js';

const router = Router();

/**
 * GET /api/v1/costs
 *
 * `?refresh=true` bypasses the cache. Each uncached call makes three billed Cost
 * Explorer requests, so the default path deliberately serves cached data.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.status(200).json(await getCostAnalysis({ force: req.query.refresh === 'true' }));
  }),
);

export default router;
