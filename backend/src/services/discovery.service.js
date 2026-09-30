import { NotImplementedError } from '../lib/errors.js';

/**
 * Enumerates the tagged lab resources and builds the inventory every other service reads.
 *
 * Planned AWS surface: resourcegroupstaggingapi:GetResources, lambda:ListFunctions, logs:DescribeLogGroups, apigatewayv2:GetApis, ssm:GetParametersByPath
 *
 * Not wired to AWS yet - see docs/lab-environment.md for the environment it will read.
 */
export async function run(_options = {}) {
  throw new NotImplementedError('AWS resource discovery');
}

export default { run };
