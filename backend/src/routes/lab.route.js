import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { resetLab, getLabStatus } from '../services/lab.service.js';

const router = Router();

/**
 * GET /api/v1/lab/status
 *
 * What the baseline manages and how the last reset went. Makes no AWS change, so the
 * dashboard can show it freely.
 */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getLabStatus());
  }),
);

/**
 * POST /api/v1/lab/reset
 *
 * Restores the lab to its recorded broken baseline. Takes no body: targets come from the
 * baseline and from AWS discovery, never from the caller.
 *
 * Available on demand and deliberately without a cooldown - anyone demonstrating the lab
 * should be able to reset it. Two simultaneous callers join the same run rather than
 * racing each other.
 */
router.post(
  '/reset',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await resetLab());
  }),
);

export default router;
