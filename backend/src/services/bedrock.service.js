import { NotImplementedError } from '../lib/errors.js';

/**
 * Asks a Claude model on Bedrock to reason over collected findings and rank recommendations.
 *
 * Planned AWS surface: bedrock-runtime:Converse
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('Bedrock analysis');
}

export default { run };
