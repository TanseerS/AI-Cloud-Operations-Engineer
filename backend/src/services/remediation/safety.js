import config from '../../config/index.js';
import { LAB_TAG_KEY, LAB_TAG_VALUE, matchesNamingConvention } from '../aws/lab-filter.js';
import {
  isAllowedActionType,
  ACTION_TYPES,
  ALLOWED_RETENTION_DAYS,
  LAMBDA_MEMORY_MIN_MB,
  LAMBDA_MEMORY_MAX_MB,
  LAMBDA_TIMEOUT_MIN_S,
  LAMBDA_TIMEOUT_MAX_S,
} from './registry.js';

/**
 * Safety gate.
 *
 * Every check here runs against a resource the backend discovered from AWS itself. The
 * caller does not supply resource ids, ARNs or parameters - it supplies at most an issue
 * id, and everything else is re-derived. An ARN posted from a browser can therefore
 * never become a target, because there is no path for it to travel.
 *
 * A plan is only executable when every one of these passes. Any failure is reported with
 * the check that failed rather than a generic rejection.
 */

export const REQUIRED_TAGS = {
  Project: LAB_TAG_VALUE,
  Environment: 'lab',
  ManagedBy: 'aicoe',
};

function checkTags(resource) {
  const tags = resource.tags ?? {};
  const missing = Object.entries(REQUIRED_TAGS)
    .filter(([key, value]) => tags[key] !== value)
    .map(([key, value]) => `${key}=${value}`);

  return {
    id: 'required-tags',
    label: 'Resource carries the required lab tags',
    passed: missing.length === 0,
    detail: missing.length === 0
      ? `${Object.keys(REQUIRED_TAGS).join(', ')} all present`
      : `missing or mismatched: ${missing.join(', ')}`,
  };
}

function checkParameters(actionType, parameters) {
  const problems = [];

  switch (actionType) {
    case ACTION_TYPES.LAMBDA_UPDATE_MEMORY: {
      const value = parameters.MemorySize;
      if (!Number.isInteger(value)) problems.push('MemorySize must be an integer');
      else if (value < LAMBDA_MEMORY_MIN_MB || value > LAMBDA_MEMORY_MAX_MB) {
        problems.push(`MemorySize ${value} is outside the ${LAMBDA_MEMORY_MIN_MB}-${LAMBDA_MEMORY_MAX_MB} MB range`);
      }
      if (typeof parameters.FunctionName !== 'string') problems.push('FunctionName must be a string');
      break;
    }
    case ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT: {
      const value = parameters.Timeout;
      if (!Number.isInteger(value)) problems.push('Timeout must be an integer');
      else if (value < LAMBDA_TIMEOUT_MIN_S || value > LAMBDA_TIMEOUT_MAX_S) {
        problems.push(`Timeout ${value} is outside the ${LAMBDA_TIMEOUT_MIN_S}-${LAMBDA_TIMEOUT_MAX_S}s range`);
      }
      if (typeof parameters.FunctionName !== 'string') problems.push('FunctionName must be a string');
      break;
    }
    case ACTION_TYPES.LAMBDA_UPDATE_ENVIRONMENT: {
      if (typeof parameters.FunctionName !== 'string') problems.push('FunctionName must be a string');
      const variables = parameters.Environment?.Variables;
      if (variables === undefined || variables === null || typeof variables !== 'object' || Array.isArray(variables)) {
        problems.push('Environment.Variables must be an object');
      } else {
        for (const [key, value] of Object.entries(variables)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            problems.push(`Environment.Variables.${key} must be a string`);
          }
        }
      }
      break;
    }
    case ACTION_TYPES.LOGS_UPDATE_RETENTION: {
      const value = parameters.retentionInDays;
      if (!ALLOWED_RETENTION_DAYS.includes(value)) {
        problems.push(`retentionInDays ${value} is not one of the values CloudWatch Logs accepts`);
      }
      if (typeof parameters.logGroupName !== 'string') problems.push('logGroupName must be a string');
      break;
    }
    default:
      problems.push(`no parameter contract defined for ${actionType}`);
  }

  return {
    id: 'action-parameters',
    label: 'Action parameters are within their allowed range',
    passed: problems.length === 0,
    detail: problems.length === 0 ? 'all parameters valid' : problems.join('; '),
  };
}

/**
 * @param resource a resource object produced by discovery, never caller input
 */
export function evaluateSafety({ resource, actionType, parameters, reversible }) {
  const checks = [];

  checks.push({
    id: 'resource-verified',
    label: 'Target was discovered from AWS in this request',
    passed: Boolean(resource?.arn || resource?.id),
    detail: resource ? `verified via discovery as ${resource.arn ?? resource.id}` : 'resource not found in AWS',
  });

  checks.push({
    id: 'lab-membership',
    label: 'Target belongs to this lab',
    passed: Boolean(resource) && matchesNamingConvention(resource.name),
    detail: resource
      ? `name "${resource.name}" matches the ${config.aws.labPrefix} convention`
      : 'no resource to check',
  });

  checks.push(resource ? checkTags(resource) : {
    id: 'required-tags',
    label: 'Resource carries the required lab tags',
    passed: false,
    detail: 'no resource to check',
  });

  checks.push({
    id: 'region-scope',
    label: 'Target is in the configured region',
    passed: !resource?.region || resource.region === config.aws.region || resource.region === 'global',
    detail: `resource region ${resource?.region ?? 'unknown'} against configured ${config.aws.region}`,
  });

  checks.push({
    id: 'action-allowlisted',
    label: 'Action type is in the backend allowlist',
    passed: isAllowedActionType(actionType),
    detail: isAllowedActionType(actionType) ? `${actionType} is allowlisted` : `${actionType} is not allowlisted`,
  });

  checks.push(checkParameters(actionType, parameters ?? {}));

  checks.push({
    id: 'reversible',
    label: 'Change can be rolled back',
    passed: Boolean(reversible),
    detail: reversible ? 'a rollback action restoring the observed value is recorded' : 'no rollback available',
  });

  const failed = checks.filter((check) => !check.passed);
  return { checks, safe: failed.length === 0, failedChecks: failed.map((check) => check.id) };
}

export default evaluateSafety;
