import { Router } from 'express';

import healthRoute from './health.route.js';
import discoveryRoute from './discovery.route.js';
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
      discovery: { path: '/api/v1/discovery', status: 'planned' },
      architecture: { path: '/api/v1/architecture', status: 'planned' },
      cost: { path: '/api/v1/cost', status: 'planned' },
      cloudwatch: { path: '/api/v1/cloudwatch', status: 'planned' },
      bedrock: { path: '/api/v1/bedrock/analysis', status: 'planned' },
      remediation: { path: '/api/v1/remediation', status: 'planned' },
      lab: { path: '/api/v1/lab/reset', status: 'planned' },
    },
  });
});

router.use('/health', healthRoute);
router.use('/discovery', discoveryRoute);
router.use('/architecture', architectureRoute);
router.use('/cost', costRoute);
router.use('/cloudwatch', cloudwatchRoute);
router.use('/bedrock', bedrockRoute);
router.use('/remediation', remediationRoute);
router.use('/lab', labRoute);

export default router;
