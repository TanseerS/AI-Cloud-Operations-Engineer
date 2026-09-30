import { Router } from 'express';
import { run } from '../services/lab.service.js';
import asyncHandler from '../lib/async-handler.js';

const router = Router();

router.post(
  '/reset',
  asyncHandler(async (req, res) => {
    res.json(await run(req.query));
  }),
);

export default router;
