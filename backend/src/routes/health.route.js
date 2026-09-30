import { Router } from 'express';
import { getHealth } from '../services/health.service.js';

const router = Router();

router.get('/', (_req, res) => {
  res.status(200).json(getHealth());
});

export default router;
