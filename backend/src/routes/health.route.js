import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { NotFoundError } from '../lib/errors.js';
import { getHealth } from '../services/liveness.service.js';
import { getHealthAnalysis, getIssueById } from '../services/health.service.js';

const router = Router();

/** Liveness. Makes no AWS calls, so it stays a safe probe. */
router.get('/', (_req, res) => {
  res.status(200).json(getHealth());
});

/**
 * GET /api/v1/health/analysis
 *
 * CloudWatch-backed health of the discovered lab: observed facts, the issues the
 * deterministic rules inferred from them, and what could not be collected.
 */
router.get(
  '/analysis',
  asyncHandler(async (req, res) => {
    const hours = Number.parseInt(req.query.hours, 10);
    res.status(200).json(
      await getHealthAnalysis({
        hours: Number.isInteger(hours) && hours > 0 && hours <= 168 ? hours : undefined,
        force: req.query.refresh === 'true',
      }),
    );
  }),
);

/** GET /api/v1/health/issues/:id - one finding with its evidence and siblings. */
router.get(
  '/issues/:id',
  asyncHandler(async (req, res) => {
    const detail = await getIssueById(req.params.id);
    if (!detail) throw new NotFoundError(`No issue with id ${req.params.id}`);
    res.status(200).json(detail);
  }),
);

export default router;
