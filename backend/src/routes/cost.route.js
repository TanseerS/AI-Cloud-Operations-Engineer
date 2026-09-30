import { Router } from 'express';
import { run } from '../services/cost.service.js';
import asyncHandler from '../lib/async-handler.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await run(req.query));
  }),
);

export default router;
