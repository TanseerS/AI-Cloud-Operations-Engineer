import { Router } from 'express';
import { run } from '../services/remediation.service.js';
import asyncHandler from '../lib/async-handler.js';

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await run(req.query));
  }),
);

export default router;
