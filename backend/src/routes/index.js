import { Router } from 'express';

import healthRoute from './health.route.js';
import infrastructureRoute from './infrastructure.route.js';
import architectureRoute from './architecture.route.js';
import costRoute from './cost.route.js';
import cloudwatchRoute from './cloudwatch.route.js';
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
      health: { path: '/api/v1/health', status: 'available' },
      infrastructure: { path: '/api/v1/infrastructure/resources', status: 'available' },
      architecture: { path: '/api/v1/architecture/graph', status: 'available' },
      costs: { path: '/api/v1/costs', status: 'available' },
      cloudwatch: { path: '/api/v1/cloudwatch', status: 'planned' },
      bedrock: { path: '/api/v1/bedrock/analysis', status: 'planned' },
      remediation: { path: '/api/v1/remediation', status: 'planned' },
      lab: { path: '/api/v1/lab/reset', status: 'planned' },
    },
  });
});

router.use('/health', healthRoute);
router.use('/infrastructure', infrastructureRoute);
router.use('/architecture', architectureRoute);
router.use('/costs', costRoute);
router.use('/cloudwatch', cloudwatchRoute);
router.use('/bedrock', bedrockRoute);
router.use('/remediation', remediationRoute);
router.use('/lab', labRoute);

export default router;
