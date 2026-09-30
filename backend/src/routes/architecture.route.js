import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { getArchitectureGraph } from '../services/architecture.service.js';

const router = Router();

/**
 * GET /api/v1/architecture/graph
 *
 * Nodes and edges derived from live discovery. Like discovery itself, a partial result
 * is returned with a 200 and flagged, rather than failing the whole request.
 */
router.get(
  '/graph',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getArchitectureGraph());
  }),
);

export default router;
