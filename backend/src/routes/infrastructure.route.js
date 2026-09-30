import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { discoverResources } from '../services/discovery.service.js';

const router = Router();

/**
 * GET /api/v1/infrastructure/resources
 *
 * Returns the discovered lab inventory. Partial failures are reported inside a 200
 * response rather than thrown, because a caller that got three services out of four
 * should be able to use them.
 */
router.get(
  '/resources',
  asyncHandler(async (_req, res) => {
    const inventory = await discoverResources();
    res.status(200).json(inventory);
  }),
);

export default router;
