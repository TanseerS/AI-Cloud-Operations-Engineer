import { NotImplementedError } from '../lib/errors.js';

/**
 * Turns the discovered inventory into a node/edge graph the frontend renders as a diagram.
 *
 * Planned AWS surface: lambda:GetFunctionConfiguration, apigatewayv2:GetIntegrations, iam:GetRole
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('architecture analysis');
}

export default { run };
