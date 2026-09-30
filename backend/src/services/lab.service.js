import { NotImplementedError } from '../lib/errors.js';

/**
 * Replays the reset block recorded for each issue so the lab returns to its seeded broken state.
 *
 * Planned AWS surface: ssm:GetParametersByPath, lambda:UpdateFunctionConfiguration, logs:PutRetentionPolicy
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('lab reset');
}

export default { run };
