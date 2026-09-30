import * as lambdaCollector from './lambda.collector.js';
import * as logGroupCollector from './log-group.collector.js';
import * as apiGatewayCollector from './api-gateway.collector.js';
import * as ssmCollector from './ssm.collector.js';
import * as iamRoleCollector from './iam-role.collector.js';

/**
 * The collector registry. Supporting another AWS service means writing one module
 * with the same `collect(index)` contract and adding it here - nothing else changes.
 */
export const collectors = [
  lambdaCollector,
  logGroupCollector,
  apiGatewayCollector,
  ssmCollector,
  iamRoleCollector,
];

export default collectors;
