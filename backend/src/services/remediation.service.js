import { NotImplementedError } from '../lib/errors.js';

/**
 * Applies an approved fix and verifies the resource actually reached the intended state.
 *
 * Planned AWS surface: lambda:UpdateFunctionConfiguration, logs:PutRetentionPolicy
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('remediation');
}

export default { run };
