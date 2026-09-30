import { GetParametersByPathCommand } from '@aws-sdk/client-ssm';

import config from '../../config/index.js';
import { getSsmClient, describeAwsError } from '../aws/clients.js';
import { ACTION_TYPES } from '../remediation/registry.js';

/**
 * Reads the lab baseline recorded during lab setup.
 *
 * The baseline already exists as SSM parameters under /aicoe-lab/baseline/issues/ - one
 * per intentional issue, each carrying the intended value, the seeded broken value and a
 * reset block. This module reads that; it does not define a second baseline.
 *
 * Important: the baseline is *data*, and data in SSM can be edited by anyone with write
 * access to the account. So the reset engine never executes `reset.api` as a string.
 * The action is derived from the target's type and attribute and mapped onto the
 * backend's own allowlist, and the baseline's declared api is then cross-checked against
 * what that mapping produces. A tampered baseline cannot introduce an AWS call that the
 * allowlist does not already permit.
 */

/** (resource type, attribute) -> the allowlisted action that restores it. */
const RESTORE_ACTIONS = {
  'aws_lambda_function::MemorySize': {
    actionType: ACTION_TYPES.LAMBDA_UPDATE_MEMORY,
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    service: 'lambda',
    stateField: 'MemorySize',
    buildParameters: (target, brokenValue) => ({ FunctionName: target.name, MemorySize: brokenValue }),
  },
  'aws_lambda_function::Timeout': {
    actionType: ACTION_TYPES.LAMBDA_UPDATE_TIMEOUT,
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    service: 'lambda',
    stateField: 'Timeout',
    buildParameters: (target, brokenValue) => ({ FunctionName: target.name, Timeout: brokenValue }),
  },
  'aws_lambda_function::Environment.Variables': {
    actionType: ACTION_TYPES.LAMBDA_UPDATE_ENVIRONMENT,
    awsOperation: 'lambda:UpdateFunctionConfiguration',
    service: 'lambda',
    stateField: 'environmentVariableNames',
    buildParameters: (target, brokenValue) => ({
      FunctionName: target.name,
      Environment: { Variables: brokenValue ?? {} },
    }),
    // Compared by key names, because values are never read back.
    normaliseExpected: (brokenValue) => Object.keys(brokenValue ?? {}).sort(),
  },
  'aws_cloudwatch_log_group::retentionInDays': {
    actionType: ACTION_TYPES.LOGS_UPDATE_RETENTION,
    awsOperation: 'logs:PutRetentionPolicy',
    service: 'logs',
    stateField: 'retentionInDays',
    buildParameters: (target, brokenValue) => ({
      logGroupName: target.name,
      retentionInDays: brokenValue,
    }),
  },
};

function restoreKey(target) {
  return `${target?.type}::${target?.attribute}`;
}

export async function loadBaseline() {
  const client = getSsmClient();
  const issues = [];
  const warnings = [];
  let nextToken;

  try {
    do {
      const response = await client.send(
        new GetParametersByPathCommand({
          Path: `${config.aws.baselineParameterPath}/issues`,
          Recursive: true,
          MaxResults: 10,
          NextToken: nextToken,
        }),
      );

      for (const parameter of response.Parameters ?? []) {
        let document;
        try {
          document = JSON.parse(parameter.Value);
        } catch {
          warnings.push({ parameter: parameter.Name, message: 'Baseline entry is not valid JSON and was skipped.' });
          continue;
        }
        issues.push({ parameterName: parameter.Name, ...document });
      }
      nextToken = response.NextToken;
    } while (nextToken);
  } catch (error) {
    return { available: false, issues: [], warnings, error: describeAwsError(error) };
  }

  issues.sort((a, b) => String(a.issue_id).localeCompare(String(b.issue_id)));
  return { available: true, issues, warnings, error: null, path: `${config.aws.baselineParameterPath}/issues` };
}

/**
 * Turns baseline entries into restore targets the engine can act on. An entry with no
 * mapping - a derived issue such as the API returning 500 because its integration target
 * fails - is returned as `derived` so it can be reported rather than silently dropped.
 */
export function toRestoreTargets(issues) {
  const restorable = [];
  const derived = [];

  for (const issue of issues) {
    const target = issue.target ?? {};
    const mapping = RESTORE_ACTIONS[restoreKey(target)];

    if (!mapping) {
      derived.push({
        issueId: issue.issue_id,
        title: issue.title ?? null,
        targetType: target.type ?? null,
        reason:
          issue.reset?.depends_on
            ? `Restored indirectly by ${issue.reset.depends_on}; it has no configuration of its own to set.`
            : 'No allowlisted restore action maps to this baseline entry.',
        dependsOn: issue.reset?.depends_on ?? null,
        verification: issue.reset?.verification ?? null,
      });
      continue;
    }

    // Cross-check: the baseline's own declaration must agree with the allowlist mapping.
    const declaredApi = issue.reset?.api;
    if (declaredApi && declaredApi !== mapping.awsOperation) {
      derived.push({
        issueId: issue.issue_id,
        targetType: target.type ?? null,
        reason:
          `The baseline declares "${declaredApi}" but this target maps to "${mapping.awsOperation}". ` +
          'The entry was skipped rather than trusted.',
        mismatch: true,
      });
      continue;
    }

    const brokenValue = issue.broken_value;
    restorable.push({
      issueId: issue.issue_id,
      title: issue.title ?? null,
      category: issue.category ?? null,
      service: mapping.service,
      resourceName: target.name,
      attribute: target.attribute,
      actionType: mapping.actionType,
      awsOperation: mapping.awsOperation,
      stateField: mapping.stateField,
      // What the resource should hold once reset.
      expectedValue: mapping.normaliseExpected ? mapping.normaliseExpected(brokenValue) : brokenValue,
      rawBrokenValue: brokenValue,
      intendedValue: issue.intended_value,
      parameters: mapping.buildParameters(target, brokenValue),
      verification: issue.reset?.verification ?? null,
    });
  }

  return { restorable, derived };
}

export { RESTORE_ACTIONS };
