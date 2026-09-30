import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { getOverview } from '../services/overview.service.js';

const router = Router();

/**
 * GET /api/v1/overview
 *
 * One consistent snapshot for the landing page, composed from the services that already
 * cache their AWS reads. A failing source degrades its own section only.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getOverview());
  }),
);

export default router;
