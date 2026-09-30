import { Router } from 'express';
import { run } from '../services/bedrock.service.js';
import asyncHandler from '../lib/async-handler.js';

const router = Router();

router.get(
  '/analysis',
  asyncHandler(async (req, res) => {
    res.json(await run(req.query));
  }),
);

export default router;
