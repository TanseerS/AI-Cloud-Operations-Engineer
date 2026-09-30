import { Router } from 'express';

import healthRoute from './health.route.js';
import overviewRoute from './overview.route.js';
import infrastructureRoute from './infrastructure.route.js';
import architectureRoute from './architecture.route.js';
import costRoute from './cost.route.js';
import bedrockRoute from './bedrock.route.js';
import remediationRoute from './remediation.route.js';
import labRoute from './lab.route.js';

/**
 * The API surface, versioned from day one so later changes do not break a deployed
 * frontend. Only /health is implemented; the rest answer 501 until their service is
 * built, which keeps the contract honest while the shape stays visible.
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    service: 'aicoe-api',
    endpoints: {
      overview: { path: '/api/v1/overview', status: 'available' },
      health: { path: '/api/v1/health', status: 'available' },
      healthAnalysis: { path: '/api/v1/health/analysis', status: 'available' },
      infrastructure: { path: '/api/v1/infrastructure/resources', status: 'available' },
      architecture: { path: '/api/v1/architecture/graph', status: 'available' },
      costs: { path: '/api/v1/costs', status: 'available' },
      aiStatus: { path: '/api/v1/ai/status', status: 'available' },
      aiAnalyze: { path: 'POST /api/v1/ai/analyze', status: 'available' },
      remediationPlan: { path: 'POST /api/v1/remediation/plan', status: 'available' },
      remediationPlans: { path: '/api/v1/remediation/plans', status: 'available' },
      labStatus: { path: '/api/v1/lab/status', status: 'available' },
      labReset: { path: 'POST /api/v1/lab/reset', status: 'available' },
    },
  });
});

router.use('/overview', overviewRoute);
router.use('/health', healthRoute);
router.use('/infrastructure', infrastructureRoute);
router.use('/architecture', architectureRoute);
router.use('/costs', costRoute);
router.use('/ai', bedrockRoute);
router.use('/remediation', remediationRoute);
router.use('/lab', labRoute);

export default router;
