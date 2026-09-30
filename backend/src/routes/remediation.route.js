import { Router } from 'express';

import asyncHandler from '../lib/async-handler.js';
import { NotFoundError } from '../lib/errors.js';
import {
  createRemediationPlans,
  getRemediationPlans,
  getRemediationPlan,
  approveRemediationPlan,
  executeRemediationPlan,
} from '../services/remediation.service.js';

const router = Router();

/**
 * POST /api/v1/remediation/plan
 *
 * Builds plans from the currently detected issues. The body may name issue ids and
 * nothing else - a request carrying a resource id, ARN or action is rejected, because
 * the backend derives every target from its own discovery of AWS.
 *
 * Calls no mutating AWS API.
 */
router.post(
  '/plan',
  asyncHandler(async (req, res) => {
    res.status(200).json(await createRemediationPlans(req.body ?? {}));
  }),
);

/** GET /api/v1/remediation/plans - everything planned so far, with approval state. */
router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await getRemediationPlans());
  }),
);

router.get(
  '/plans/:id',
  asyncHandler(async (req, res) => {
    const plan = await getRemediationPlan(req.params.id);
    if (!plan) throw new NotFoundError(`No remediation plan with id ${req.params.id}`);
    res.status(200).json(plan);
  }),
);

/**
 * POST /api/v1/remediation/plans/:id/approve
 *
 * Moves a plan from proposed to approved. Deliberately nothing else: no AWS client is
 * constructed and no AWS API is called. Execution is a separate capability.
 */
router.post(
  '/plans/:id/approve',
  asyncHandler(async (req, res) => {
    const plan = await approveRemediationPlan(req.params.id, {
      approvedBy: typeof req.body?.approvedBy === 'string' ? req.body.approvedBy : undefined,
      note: typeof req.body?.note === 'string' ? req.body.note : null,
    });
    if (!plan) throw new NotFoundError(`No remediation plan with id ${req.params.id}`);
    res.status(200).json({ plan, executionPerformed: false });
  }),
);

/**
 * POST /api/v1/remediation/plans/:id/execute
 *
 * Applies an approved plan. The request carries an id and nothing else - the stored plan
 * is the only source of truth for what runs, so no operation name or parameter can be
 * supplied by the caller.
 *
 * Every safety check from planning is re-run against freshly discovered AWS state before
 * anything is changed.
 */
router.post(
  '/plans/:id/execute',
  asyncHandler(async (req, res) => {
    const result = await executeRemediationPlan(req.params.id);
    if (!result) throw new NotFoundError(`No remediation plan with id ${req.params.id}`);
    res.status(200).json(result);
  }),
);

export default router;
