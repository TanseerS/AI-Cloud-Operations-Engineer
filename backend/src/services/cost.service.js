import { NotImplementedError } from '../lib/errors.js';

/**
 * Estimates spend and waste per resource, and quantifies the saving each fix would deliver.
 *
 * Planned AWS surface: ce:GetCostAndUsage, pricing:GetProducts, cloudwatch:GetMetricStatistics
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('cost analysis');
}

export default { run };
