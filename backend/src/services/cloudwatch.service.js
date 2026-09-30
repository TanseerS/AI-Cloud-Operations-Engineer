import { NotImplementedError } from '../lib/errors.js';

/**
 * Reads metrics and log evidence that prove an issue is real rather than theoretical.
 *
 * Planned AWS surface: cloudwatch:GetMetricData, logs:FilterLogEvents, logs:DescribeLogGroups
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('CloudWatch analysis');
}

export default { run };
